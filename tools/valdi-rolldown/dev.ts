// The dev server: builds the app modules as build.ts does (JavaScript, as Valdi's debug builds ship), rebuilds a module
// when one of its sources changes, and pushes the files that changed to the debug apps on the attached Android devices, which reload
// them. It replaces `valdi hotreload` (don't run both: they would both talk to the same apps).
//
//   pnpm dev            the Android emulators `adb devices` lists and the booted iOS simulator; a phone, or any
//                       other device, only when $ANDROID_SERIAL names it (then only that one): the push replaces the
//                       app's modules, which a device running another build of the app doesn't survive
//
// The protocol is the Valdi daemon's (compiler Reloader/, runtime Debugger/DaemonClient.cpp): the app listens on
// device port 13592; on Android we `adb forward` to it and connect, the iOS simulator's is the Mac's own port. Packets are the archive's ValdiPacket framing (magic, length)
// around JSON. The app sends a `configure` request; we answer it, then send every file once (`updated_resources`),
// and afterwards the ones each build changes. The app replaces the files and unloads their modules, which re-renders.
//
// res/ images go too: an image as res/<name>.<ext> (the app keeps the name, without scale and extension, and loads it
// from there instead of the APK), with the regenerated res.assetcatalog (sizes) and res.js (names). An image added or
// renamed shows in Valdi pages. Route declarations inline their Tab icons in dev output, so the native bar reloads too.
// Font files and their catalog entries go too; already-loaded platform fonts may require an app restart. A module
// created while it runs is picked up on the next start.
// strings/ JSON changes regenerate the typed src/Strings accessor before checking consumers. Text-only edits
// also change Strings.js, so normal module unloading clears the Inline resolver's cached translation.
import { execFileSync } from 'node:child_process';
import { watch } from 'node:fs';
import net from 'node:net';
import { appModules, modulesDir } from './pipeline';
import { startDevControls } from '../../scripts/dev-controls.mjs';
import { DevBuild, ModuleBuild, recordChange, type Pending } from './dev-build';

import { DEVICE_PORT, DevPacketReader, encodeDevPacket, updatedResources, type DevResource } from './dev-protocol';
/** The name the booted iOS simulator goes by here; it is reached at 127.0.0.1:DEVICE_PORT, without a forward. */
const IOS_SIMULATOR = 'ios-simulator';

type Resource = DevResource;

// ---- Building

const modules = new Map(await Promise.all(appModules().map(async module => [module.name, await ModuleBuild.create(module)] as const)));
const builds = new DevBuild(modules);

// ---- Devices

class DeviceConnection {
  private socket?: net.Socket;
  private configured = false;
  private localPort?: number;

  constructor(readonly serial: string) {}

  /** Connects, and keeps reconnecting while the device is attached: the app may not be running yet, or restart. */
  connect() {
    if (this.socket) return;
    if (this.serial === IOS_SIMULATOR) {
      this.localPort = DEVICE_PORT;
    } else {
      try {
        this.localPort ??= Number(execFileSync('adb', ['-s', this.serial, 'forward', 'tcp:0', `tcp:${DEVICE_PORT}`], { encoding: 'utf8' }).trim());
      } catch {
        return;
      }
    }
    const socket = net.connect(this.localPort, '127.0.0.1');
    this.socket = socket;
    const reader = new DevPacketReader();
    socket.on('data', (data: Buffer) => {
      try {
        reader.receive(data, payload => this.handle(payload));
      } catch (error) {
        console.error(`[${this.serial}] Dev packet error: ${error instanceof Error ? error.message : error}; disconnecting`);
        socket.destroy();
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.configured) console.log(`[${this.serial}] Disconnected`);
      this.socket = undefined;
      this.configured = false;
    });
  }

  close() {
    this.socket?.destroy();
    if (this.localPort && this.serial !== IOS_SIMULATOR) {
      try {
        execFileSync('adb', ['-s', this.serial, 'forward', '--remove', `tcp:${this.localPort}`], { stdio: 'ignore' });
      } catch {}
    }
  }

  send(resources: Resource[]) {
    if (!this.configured || !resources.length) return;
    this.write(updatedResources(resources));
    console.log(`[${this.serial}] Sent ${resources.map(({ bundle, file }) => `${bundle}:${file}`).join(', ')}`);
  }

  private write(payload: object) {
    this.socket?.write(encodeDevPacket(payload));
  }

  private handle(payload: { request?: any; event?: any }) {
    const { request, event } = payload;
    if (request?.configure) {
      const { application_id, platform } = request.configure;
      this.write({ response: { request_id: request.request_id, configure: {} } });
      this.configured = true;
      console.log(`[${this.serial}] Connected: ${application_id} (${platform})`);
      this.send(builds.allResources());
    } else if (request) {
      this.write({ response: { request_id: request.request_id, error: { error_message: 'Not supported by this dev server' } } });
    }
    for (const log of event?.new_logs ?? []) console.log(`[${this.serial}] ${log.severity}: ${log.log}`);
  }
}

const devices = new Map<string, DeviceConnection>();

function iosSimulatorBooted(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    return execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf8' }).includes('(Booted)');
  } catch {
    return false;
  }
}

function pollDevices() {
  let serials: string[];
  try {
    serials = execFileSync('adb', ['devices'], { encoding: 'utf8' })
      .split('\n')
      .slice(1)
      .map(line => line.split('\t'))
      .filter(([, state]) => state?.trim() === 'device')
      .map(([serial]) => serial);
  } catch {
    serials = [];
  }
  serials = process.env.ANDROID_SERIAL
    ? serials.filter(serial => serial === process.env.ANDROID_SERIAL)
    : serials.filter(serial => serial.startsWith('emulator-'));
  if (iosSimulatorBooted()) serials.push(IOS_SIMULATOR);
  for (const [serial, device] of devices) {
    if (!serials.includes(serial)) {
      device.close();
      devices.delete(serial);
    }
  }
  for (const serial of serials) {
    if (!devices.has(serial)) devices.set(serial, new DeviceConnection(serial));
    devices.get(serial)!.connect();
  }
}

// ---- Watching

let pending = new Map<string, Pending>();
let timer: NodeJS.Timeout | undefined;
let building: Promise<void> = Promise.resolve();

watch(modulesDir, { recursive: true }, (_event, file) => {
  if (!file) return;
  if (!recordChange(pending, modules, modulesDir, file)) return;
  clearTimeout(timer);
  // Editors save in bursts; and one build at a time.
  timer = setTimeout(() => {
    const batch = pending;
    pending = new Map();
    building = building.then(async () => {
      try {
        const changed = await builds.rebuild(batch);
        for (const device of devices.values()) device.send(changed);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    });
  }, 50);
});

// Register the watcher before the first build, including its error report. A quick fix after an initial diagnostic
// must not land in the gap before watch() and be silently missed.
building = builds.build().then(() => {}).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  console.log('Fix the errors above; watching for changes.');
});
await building;
setInterval(pollDevices, 1000);
pollDevices();

const stopControls = startDevControls();
process.once('exit', stopControls);

// The adb forwards outlive us otherwise.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    stopControls();
    for (const device of devices.values()) device.close();
    process.exit(0);
  });
}
console.log(`Watching src, res and strings of ${[...modules.keys()].join(', ')}`);
