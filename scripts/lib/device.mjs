// Device discovery and selection for the unified commands. Selection is deliberately strict:
// an ambiguous set or a physical device is never chosen silently.
import { spawnSync } from 'node:child_process';

/** `adb devices` output → [{ serial, state, emulator }]. */
export function parseAdbDevices(text) {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state, emulator: /^emulator-\d+$/.test(serial) };
    });
}

/**
 * Pick one Android target. `requested` (from --device) must name a serial explicitly; without it,
 * exactly one running emulator is required. Physical devices are only used when named.
 */
export function selectAndroidDevice(devices, requested) {
  const usable = devices.filter(device => device.state === 'device' || device.state === 'emulator');
  if (requested) {
    const match = usable.find(device => device.serial === requested);
    if (!match) {
      const known = devices.length ? devices.map(device => `${device.serial} (${device.state})`).join(', ') : 'none';
      throw new Error(`No connected Android device has the serial "${requested}". Connected: ${known}.`);
    }
    return match;
  }
  const emulators = usable.filter(device => device.emulator);
  const physical = usable.filter(device => !device.emulator);
  if (emulators.length === 1) return emulators[0];
  if (emulators.length > 1) {
    throw new Error(
      `Several Android emulators are running: ${emulators.map(device => device.serial).join(', ')}. ` +
        'Pass --device <serial> to choose one.',
    );
  }
  if (physical.length > 0) {
    throw new Error(
      `Only physical Android device(s) are connected: ${physical.map(device => device.serial).join(', ')}. ` +
        'Pass --device <serial> to target one explicitly; physical devices are never selected automatically.',
    );
  }
  throw new Error('No running Android emulator or connected device was found. Start an emulator, or pass --device <serial>.');
}

/** `xcrun simctl list devices --json` → available iPhone simulators. */
export function parseIosSimulators(json) {
  const runtimes = json?.devices ?? {};
  return Object.values(runtimes)
    .flat()
    .filter(device => device && device.isAvailable !== false && /iPhone/i.test(device.name ?? ''))
    .map(device => ({ udid: device.udid, name: device.name, state: device.state, runtime: device.runtime }));
}

/**
 * Pick one iOS simulator. A booted simulator is unambiguous; otherwise exactly one available
 * iPhone simulator is booted. Several choices require --device <udid|name>.
 */
export function selectIosSimulator(devices, requested) {
  if (requested) {
    const matches = devices.filter(device => device.udid === requested || device.name === requested);
    if (matches.length !== 1) {
      const known = devices.length ? devices.map(device => `${device.name} (${device.udid}, ${device.state})`).join(', ') : 'none';
      throw new Error(`--device "${requested}" must match exactly one available iPhone simulator. Available: ${known}.`);
    }
    return matches[0];
  }
  const booted = devices.filter(device => device.state === 'Booted');
  if (booted.length === 1) return booted[0];
  if (booted.length > 1) {
    throw new Error(
      `Several iOS simulators are booted: ${booted.map(device => `${device.name} (${device.udid})`).join(', ')}. ` +
        'Pass --device <udid|name>.',
    );
  }
  if (devices.length === 1) return devices[0];
  if (devices.length === 0) throw new Error('No available iPhone simulator was found. Install a simulator runtime in Xcode.');
  throw new Error(
    `Several iPhone simulators are available and none is booted: ${devices.map(device => `${device.name} (${device.udid})`).join(', ')}. ` +
      'Pass --device <udid|name>.',
  );
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr ?? '').trim()}`);
  return result.stdout;
}

export function listAndroidDevices(adb = process.env.ADB || 'adb') {
  return parseAdbDevices(runCapture(adb, ['devices']));
}

export function chooseAndroidDevice(requested) {
  const adb = process.env.ADB || 'adb';
  return { adb, device: selectAndroidDevice(listAndroidDevices(adb), requested) };
}

export function listIosSimulators() {
  const json = JSON.parse(runCapture('xcrun', ['simctl', 'list', 'devices', '--json']));
  return parseIosSimulators(json);
}

export function chooseIosSimulator(requested) {
  return selectIosSimulator(listIosSimulators(), requested);
}
