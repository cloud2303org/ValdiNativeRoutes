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
// renamed shows in Valdi pages; native views that load the APK's drawables (the tab bar) need a rebuilt app. A .sq
// change regenerates sqlgen/ and pushes the files that change (a new table needs the database's migrations, as ever).
// Font files and their catalog entries go too; already-loaded platform fonts may require an app restart. A module
// created while it runs is picked up on the next start.
import { isUtf8 } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync, watch } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { ArchiveEntries } from './archive';
import { appModules, buildModule, genDir, inlineSourceMaps, modulesDir, root } from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeResTs, type Font, type Image } from './resources';
import { generateSqlgen, sqliteValidator } from './sqlgen';
import { valdiTs, type ValdiModule } from './valdiTs';

const DEVICE_PORT = 13592;
/** The name the booted iOS simulator goes by here; it is reached at 127.0.0.1:DEVICE_PORT, without a forward. */
const IOS_SIMULATOR = 'ios-simulator';
const MAGIC = 0x0100c633;

interface Resource {
  bundle: string;
  file: string;
  data: Buffer;
}

// ---- Building

const validator = sqliteValidator(path.join(root, 'valdi'));

/** One module: its resources, its generated sources and its TypeScript program, kept between builds. */
class ModuleBuild {
  private images: Image[] | undefined;
  private fonts: Font[] = [];
  readonly plugin: ReturnType<typeof valdiTs>;
  lastDiagnostics: string | undefined;

  private constructor(readonly module: ValdiModule, images: Image[] | undefined) {
    this.updateResources(images);
    this.generateSql();
    this.plugin = valdiTs(module);
  }

  /** Reads res/ again; res.ts changes with the image and font names. */
  static async create(module: ValdiModule): Promise<ModuleBuild> {
    return new ModuleBuild(module, await findImages(module));
  }

  async loadResources() {
    this.updateResources(await findImages(this.module));
  }

  private updateResources(images: Image[] | undefined) {
    const { module } = this;
    this.images = images;
    this.fonts = findFonts(module) ?? [];
    if (writeResTs(module, this.images, genDir(module.name), this.fonts)) this.plugin?.invalidate(path.join(genDir(module.name), 'res.ts'));
  }

  /** Generates sqlgen/ again from sql/; the TypeScript files that changed are read again. */
  generateSql() {
    for (const file of generateSqlgen(this.module, genDir(this.module.name), validator)) this.plugin?.invalidate(file);
  }

  async build(): Promise<ArchiveEntries> {
    const { images, fonts } = this;
    const built = await buildModule(this.module, this.plugin, false);
    inlineSourceMaps(built);
    if (images || fonts.length) {
      built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
      for (const image of images ?? []) built.entries.set(`res/${image.name}.${image.extension}`, readFileSync(image.file));
    }
    addFontEntries(built.entries, fonts);
    const diagnostics = this.plugin.diagnostics();
    if (diagnostics !== this.lastDiagnostics) {
      console.log(diagnostics || `✓ ${this.module.name}: no type errors`);
      this.lastDiagnostics = diagnostics;
    }
    return built.entries;
  }
}

const modules = new Map(await Promise.all(appModules().map(async module => [module.name, await ModuleBuild.create(module)] as const)));

/** What the apps have, per bundle and file: the last build's output. */
const current = new Map<string, ArchiveEntries>();

/** Builds the given modules (all of them by default) and returns the files that changed. */
async function build(names: Iterable<string> = modules.keys()): Promise<Resource[]> {
  const started = performance.now();
  const changed: Resource[] = [];
  for (const name of names) {
    const entries = await modules.get(name)!.build();
    const before = current.get(name);
    for (const [file, data] of entries) {
      if (!before?.get(file)?.equals(data)) changed.push({ bundle: name, file, data });
    }
    current.set(name, entries);
  }
  console.log(`Built in ${Math.round(performance.now() - started)} ms, ${changed.length} file(s) changed`);
  return changed;
}

function allResources(): Resource[] {
  return [...current].flatMap(([bundle, entries]) => [...entries].map(([file, data]) => ({ bundle, file, data })));
}

// ---- Devices

class DeviceConnection {
  private socket?: net.Socket;
  private buffer = Buffer.alloc(0);
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
    socket.on('data', (data: Buffer) => this.receive(data));
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.configured) console.log(`[${this.serial}] Disconnected`);
      this.socket = undefined;
      this.configured = false;
      this.buffer = Buffer.alloc(0);
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
    this.write({
      event: {
        updated_resources: {
          // As the Valdi daemon: text as is, anything else (images, the asset catalog) in base64.
          resources: resources.map(({ bundle, file, data }) => ({
            bundle_name: bundle,
            file_path_within_bundle: file,
            ...(isUtf8(data) ? { data_string: data.toString('utf8') } : { data_base64: data.toString('base64') }),
          })),
        },
      },
    });
    console.log(`[${this.serial}] Sent ${resources.map(({ bundle, file }) => `${bundle}:${file}`).join(', ')}`);
  }

  private write(payload: object) {
    const body = Buffer.from(JSON.stringify(payload));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(MAGIC, 0);
    header.writeUInt32LE(body.length, 4);
    this.socket?.write(Buffer.concat([header, body]));
  }

  private receive(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 8) {
      if (this.buffer.readUInt32LE(0) !== MAGIC) {
        console.error(`[${this.serial}] Bad packet, disconnecting`);
        this.socket?.destroy();
        return;
      }
      const end = 8 + this.buffer.readUInt32LE(4);
      if (this.buffer.length < end) return;
      const payload = JSON.parse(this.buffer.subarray(8, end).toString('utf8'));
      this.buffer = this.buffer.subarray(end);
      this.handle(payload);
    }
  }

  private handle(payload: { request?: any; event?: any }) {
    const { request, event } = payload;
    if (request?.configure) {
      const { application_id, platform } = request.configure;
      this.write({ response: { request_id: request.request_id, configure: {} } });
      this.configured = true;
      console.log(`[${this.serial}] Connected: ${application_id} (${platform})`);
      this.send(allResources());
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

await build();
setInterval(pollDevices, 1000);
pollDevices();

/** What changed since the last build, per module. */
interface Pending {
  files: Set<string>;
  res: boolean;
  sql: boolean;
}
let pending = new Map<string, Pending>();
let timer: NodeJS.Timeout | undefined;
let building: Promise<void> = Promise.resolve();

watch(modulesDir, { recursive: true }, (_event, file) => {
  if (!file) return;
  const [name, dir] = file.split(path.sep);
  if (!modules.has(name)) return;
  const changes = pending.get(name) ?? { files: new Set<string>(), res: false, sql: false };
  if (dir === 'src' && /\.tsx?$/.test(file)) changes.files.add(path.join(modulesDir, file));
  else if (dir === 'res') changes.res = true;
  else if (dir === 'sql') changes.sql = true;
  else return;
  pending.set(name, changes);
  clearTimeout(timer);
  // Editors save in bursts; and one build at a time.
  timer = setTimeout(() => {
    const batch = pending;
    pending = new Map();
    building = building.then(async () => {
      try {
        // Every program reads the changed file again: a module type-checks the others' sources it imports.
        const files = [...batch.values()].flatMap(changes => [...changes.files]);
        for (const module of modules.values()) for (const file of files) module.plugin.invalidate(file);
        for (const [name, changes] of batch) {
          if (changes.res) await modules.get(name)!.loadResources();
          if (changes.sql) modules.get(name)!.generateSql();
        }
        const changed = await build(batch.keys());
        for (const device of devices.values()) device.send(changed);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    });
  }, 50);
});

// The adb forwards outlive us otherwise.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    for (const device of devices.values()) device.close();
    process.exit(0);
  });
}
console.log(`Watching src, res and sql of ${[...modules.keys()].join(', ')}`);
