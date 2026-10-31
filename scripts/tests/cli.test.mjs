import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseAdbDevices, parseIosSimulators, selectAndroidDevice, selectIosSimulator } from '../device.mjs';
import { planPrebuild } from '../cli.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(repository, 'scripts/cli.mjs');
const cliRun = args => spawnSync(process.execPath, [cli, ...args], { cwd: repository, encoding: 'utf8' });

test('--help documents the unified commands and exits 0', () => {
  const result = cliRun(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /prebuild --platform <android\|ios>/);
  assert.match(result.stdout, /android \[options\]/);
  assert.match(result.stdout, /ios \[options\]/);
  assert.match(result.stdout, /dev\s+Hot reload/);
  assert.match(result.stdout, /Debug builds only/);
});

test('unknown options fail with the usage text', () => {
  const result = cliRun(['android', '--nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option: --nope/);
});

test('prebuild requires an explicit platform', () => {
  const result = cliRun(['prebuild']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --platform android or --platform ios/);
});

test('release is refused instead of silently building Debug', () => {
  for (const command of ['android', 'ios']) {
    const result = cliRun([command, '--release']);
    assert.equal(result.status, 1, command);
    assert.match(result.stderr, /Release OTA builds are manual/);
  }
});

test('adb output is parsed into device entries', () => {
  const devices = parseAdbDevices('List of devices attached\nemulator-5554\tdevice\nR58M12345\tunauthorized\n');
  assert.deepEqual(devices, [
    { serial: 'emulator-5554', state: 'device', emulator: true },
    { serial: 'R58M12345', state: 'unauthorized', emulator: false },
  ]);
});

test('Android selection takes one emulator, refuses ambiguity and physical-only sets', () => {
  const emulator = { serial: 'emulator-5554', state: 'device', emulator: true };
  const other = { serial: 'emulator-5556', state: 'device', emulator: true };
  const phone = { serial: 'R58M12345', state: 'device', emulator: false };
  assert.equal(selectAndroidDevice([emulator], undefined), emulator);
  assert.throws(() => selectAndroidDevice([emulator, other], undefined), /Several Android emulators.*--device/);
  assert.throws(() => selectAndroidDevice([phone], undefined), /physical Android device.*never selected automatically/);
  assert.throws(() => selectAndroidDevice([], undefined), /No running Android emulator/);
  assert.equal(selectAndroidDevice([phone], 'R58M12345'), phone);
  assert.throws(() => selectAndroidDevice([phone], 'emulator-5554'), /No connected Android device has the serial/);
});

const simctl = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
      { name: 'iPhone 17', udid: 'AAA', state: 'Shutdown', isAvailable: true },
      { name: 'iPhone 17 Pro', udid: 'BBB', state: 'Booted', isAvailable: true },
      { name: 'iPad Pro', udid: 'CCC', state: 'Booted', isAvailable: true },
      { name: 'iPhone Old', udid: 'DDD', state: 'Shutdown', isAvailable: false },
    ],
  },
};

test('iOS simulators keep only available iPhones and honour --device', () => {
  const devices = parseIosSimulators(simctl);
  assert.deepEqual(devices.map(device => device.udid), ['AAA', 'BBB']);
  assert.equal(selectIosSimulator(devices, undefined).udid, 'BBB');
  assert.equal(selectIosSimulator(devices, 'AAA').udid, 'AAA');
  assert.throws(() => selectIosSimulator(devices, 'iPhone'), /must match exactly one/);
  const twoBooted = devices.map(device => ({ ...device, state: 'Booted' }));
  assert.throws(() => selectIosSimulator(twoBooted, undefined), /Several iOS simulators are booted/);
  const noneBooted = devices.map(device => ({ ...device, state: 'Shutdown' }));
  assert.throws(() => selectIosSimulator(noneBooted, undefined), /Several iPhone simulators are available/);
  assert.equal(selectIosSimulator([noneBooted[0]], undefined).udid, 'AAA');
});

test('the prebuild plan separates runtime export from module-only work', () => {
  const current = planPrebuild({ platform: 'android', runtimeCurrent: true, visionCurrent: true, bindingsStale: false });
  assert.match(current.steps.find(step => step.step === 'runtime').action, /skip export/);
  assert.match(current.steps.find(step => step.step === 'modules').action, /module libraries/);
  const stale = planPrebuild({ platform: 'android', runtimeCurrent: false, visionCurrent: false, bindingsStale: true });
  assert.match(stale.steps.find(step => step.step === 'bindings').action, /regenerate/);
  assert.match(stale.steps.find(step => step.step === 'runtime').action, /export the Valdi runtime/);
  assert.match(stale.steps.find(step => step.step === 'vision').action, /build OpenCV\/ncnn/);
});

test('prebuild --dry-run reports a platform plan from the real repository state', () => {
  const result = cliRun(['prebuild', '--platform', 'android', '--dry-run', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.platform, 'android');
  assert.deepEqual(plan.steps.map(step => step.step), ['sources', 'bindings', 'runtime', 'vision', 'modules']);
});
