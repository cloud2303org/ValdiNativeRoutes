import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { valdiSourceRoot } from './pipeline';

const modules = path.resolve(import.meta.dirname, '../../valdi/modules');
const app = (name: string) => path.join(modules, 'app_pages/src', name.endsWith('.ts') ? name : `${name}.ts`);
const bluetooth = (name: string) => path.join(modules, 'bluetooth/src', name.endsWith('.ts') ? name : `${name}.ts`);
const requireApp = createRequire(path.join(modules, 'app_pages/package.json'));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Execute the real service modules, including nativeCall, host installation, the shared
// permission queue and NFC event/byte adapters. Only Device and native hosts are supplied.
// Everything stays in memory: no build pipeline, generated files or source links.
function runtime(platform: 'android' | 'ios' | 'harmony', sdk = 36, device?: object, legacyProvider = false) {
  const context = vm.createContext({ console, Error, ArrayBuffer, Uint8Array });
  const cache = new Map<string, { exports: any }>();
  const load = (file: string): any => {
    const prior = cache.get(file);
    if (prior) return prior.exports;
    const module = { exports: {} };
    cache.set(file, module);
    const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file,
      reportDiagnostics: true,
    });
    assert.deepEqual(emitted.diagnostics, [], `transpile diagnostics for ${file}`);
    vm.runInContext(`(function(require,module,exports){${emitted.outputText}\n})`, context, { filename: file })(
      (name: string) => {
        if (name === 'valdi_core/src/Device')
          return { Device: device ?? { getSystemType: () => platform, isAndroid: () => platform === 'android' } };
        if (name === 'valibot') return requireApp('valibot');
        assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
        return load(`${path.resolve(path.dirname(file), name)}.ts`);
      },
      module,
      module.exports,
    );
    return module.exports;
  };
  const grants = new Set<string>();
  const checks: string[] = [];
  const prompts: string[][] = [];
  const host = {
    async check(permission: string) {
      checks.push(permission);
      return grants.has(permission);
    },
    async requestMultiple(names: string[]) {
      prompts.push([...names]);
      return names.map(permission => {
        grants.add(permission);
        return { permission, result: 'granted' };
      });
    },
    async openSettings() {},
  };
  const permissions = load(app('permissions/index'));
  load(app('permissions/PermissionHost')).installPermissionHost(host, sdk);
  const blePermissions = load(bluetooth('permissions'));
  blePermissions.configureBluetoothPermissions(legacyProvider ? {
    isAndroid: permissions.isAndroid,
    androidSdk: permissions.androidSdk,
    requestAndroidPermissions: permissions.requestAndroidPermissions,
    serializePermissionRequest: permissions.serializePermissionRequest,
  } : permissions);
  return {
    load, permissions, blePermissions, host, grants, checks, prompts,
    ble: load(bluetooth('permission')),
    wifi: () => load(app('wifi/permission')),
  };
}

const granted = { status: 'granted', canAskAgain: true };
const normalGranted = { status: 'granted', canAskAgain: false };
const unavailable = { status: 'unavailable', canAskAgain: false };
const accessBluetooth = 'ohos.permission.ACCESS_BLUETOOTH';
const getWifi = 'ohos.permission.GET_WIFI_INFO';
const setWifi = 'ohos.permission.SET_WIFI_INFO';
const nfcTag = 'ohos.permission.NFC_TAG';

test('Owned service sources pass strict noEmit against the real upstream Device types', () => {
  const root = path.resolve(modules, '../..');
  const upstream = valdiSourceRoot();
  assert.ok(upstream, 'Prepare Valdi sources or set VALDI_SOURCE_ROOT');
  const program = ts.createProgram([
    app('permissions/index'), app('permissions/PermissionHost'), app('wifi/permission'),
    app('nfc/adapter'), app('nfc/native'), app('nfc/NfcHost'), app('nfc/permission'),
    bluetooth('permission'), bluetooth('permissions'),
  ], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    types: [],
    baseUrl: root,
    paths: { 'valdi_core/*': [path.join(upstream, 'src/valdi_modules/src/valdi/valdi_core/*')] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
});

test('Harmony detection supports system type or optional hook without adding Android identity', async () => {
  for (const device of [
    { getSystemType: () => 'harmony', isAndroid: () => false },
    { isHarmony: () => true, isAndroid: () => false },
    { getSystemType: () => 'other', isHarmony: () => true, isAndroid: () => false },
  ]) {
    const f = runtime('harmony', 0, device);
    assert.equal(f.permissions.isHarmony(), true);
    assert.equal(f.permissions.isAndroid(), false);
    assert.equal(f.permissions.androidSdk(), 0);
    assert.deepEqual(plain(await f.permissions.requestAndroidPermissions([accessBluetooth])), unavailable);
    assert.equal(f.prompts.length, 0);
  }
  for (const platform of ['android', 'ios'] as const) {
    const f = runtime(platform, 29, { isAndroid: () => platform === 'android' });
    assert.equal(f.permissions.isHarmony(), false);
    assert.deepEqual(plain(await f.permissions.requestHarmonyPermissions([accessBluetooth])), unavailable);
  }
});

test('Harmony Bluetooth requests ACCESS_BLUETOOTH through app permissions for both modes', async () => {
  const f = runtime('harmony', 0);
  assert.deepEqual(plain(await f.permissions.getHarmonyPermissionState([accessBluetooth])), {
    status: 'undetermined', canAskAgain: null,
  });
  assert.equal(await f.ble.requestBlePermissions('central'), true);
  assert.equal(await f.ble.requestBlePermissions('peripheral'), true);
  assert.deepEqual(f.prompts, [[accessBluetooth]]);
  assert.ok(f.checks.every(permission => permission === accessBluetooth));
});

test('Harmony denial and never_ask_again retain exact semantics and recheck external grants', async () => {
  const f = runtime('harmony', 0);
  let outcome = 'denied';
  f.host.requestMultiple = async names => {
    f.prompts.push([...names]);
    return names.map(permission => ({ permission, result: outcome }));
  };
  assert.equal(await f.ble.requestBlePermissions(), false);
  assert.deepEqual(plain(await f.permissions.getHarmonyPermissionState([accessBluetooth])), {
    status: 'denied', canAskAgain: true,
  });
  outcome = 'never_ask_again';
  assert.equal(await f.ble.requestBlePermissions(), false);
  assert.deepEqual(plain(await f.permissions.getHarmonyPermissionState([accessBluetooth])), {
    status: 'blocked', canAskAgain: false,
  });
  assert.equal(await f.ble.requestBlePermissions(), false);
  assert.equal(f.prompts.length, 2);
  f.grants.add(accessBluetooth);
  assert.deepEqual(plain(await f.permissions.getHarmonyPermissionState([accessBluetooth])), granted);
});

test('Harmony normal permissions are checked, deduplicated and never sent to requestMultiple', async () => {
  const f = runtime('harmony', 0);
  const normal = [getWifi, setWifi, nfcTag];
  assert.deepEqual(plain(await f.permissions.requestHarmonyPermissions(normal)), unavailable);
  assert.deepEqual(f.checks, normal);
  normal.forEach(permission => f.grants.add(permission));
  f.checks.length = 0;
  assert.deepEqual(plain(await f.permissions.requestHarmonyPermissions([...normal, getWifi])), normalGranted);
  assert.deepEqual(f.checks, normal);
  // A missing normal grant makes a mixed request unavailable before any Bluetooth prompt.
  f.grants.delete(setWifi);
  assert.deepEqual(plain(await f.permissions.requestHarmonyPermissions([accessBluetooth, setWifi])), unavailable);
  assert.equal(f.prompts.length, 0);
});

test('Harmony Wi-Fi read and ask use actual operation requirements with no location or system prompt', async () => {
  const f = runtime('harmony', 0);
  const wifi = f.wifi();
  f.grants.add(getWifi);
  for (const operation of ['info', 'scan', 'connect']) {
    for (const partialInfo of [false, true]) {
      f.checks.length = 0;
      const options = { operation, partialInfo };
      const expected = operation === 'info' ? normalGranted : unavailable;
      assert.deepEqual(plain(await wifi.readWifiPermission(options)), expected);
      assert.deepEqual(f.checks, operation === 'info' ? [getWifi] : [getWifi, setWifi]);
      assert.deepEqual(plain(await wifi.askWifiPermission(options)), expected);
    }
  }
  f.grants.add(setWifi);
  assert.deepEqual(plain(await wifi.askWifiPermission({ operation: 'scan' })), normalGranted);
  assert.deepEqual(plain(await wifi.askWifiPermission({ operation: 'connect' })), normalGranted);
  assert.equal(f.prompts.length, 0);
  assert.ok(f.checks.every(permission => permission === getWifi || permission === setWifi));
});

test('Harmony BLE and Wi-Fi use the same queue; cancellation prevents host access and queue recovers', async () => {
  const f = runtime('harmony', 0);
  f.grants.add(getWifi);
  f.grants.add(setWifi);
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  f.host.requestMultiple = async names => {
    f.prompts.push([...names]);
    entered();
    await pending;
    names.forEach(permission => f.grants.add(permission));
    return names.map(permission => ({ permission, result: 'granted' }));
  };
  const ble = f.ble.requestBlePermissions();
  await started;
  const wifi = f.wifi().askWifiPermission({ operation: 'scan' });
  const cancelled = f.permissions.requestHarmonyPermissions([nfcTag], () => { throw new Error('page gone'); });
  const rejected = assert.rejects(cancelled, /page gone/);
  await Promise.resolve();
  assert.ok(f.checks.every(permission => permission === accessBluetooth));
  release();
  assert.equal(await ble, true);
  assert.deepEqual(plain(await wifi), normalGranted);
  await rejected;
  assert.ok(!f.checks.includes(nfcTag));
  assert.deepEqual(plain(await f.permissions.requestHarmonyPermissions([getWifi])), normalGranted);
});

test('Cancellation after checks prevents Harmony prompt', async () => {
  const f = runtime('harmony', 0);
  let checks = 0;
  f.host.check = async () => { checks++; return false; };
  await assert.rejects(f.ble.requestBlePermissions('central', () => {
    if (checks > 0) throw new Error('inactive');
  }), /inactive/);
  assert.equal(f.prompts.length, 0);
});

test('PermissionHost grants require canonical values and a result per requested permission', async () => {
  for (const result of ['GRANTED', 'restricted', 0, undefined]) {
    const f = runtime('harmony', 0);
    f.host.requestMultiple = async names => names.map(permission => ({ permission, result: result as any }));
    await assert.rejects(f.ble.requestBlePermissions(), /invalid grant result/);
    f.host.requestMultiple = async () => [];
    await assert.rejects(f.ble.requestBlePermissions(), /omitted a grant result/);
    f.host.requestMultiple = async names => names.map(permission => {
      f.grants.add(permission);
      return { permission, result: 'granted' };
    });
    assert.equal(await f.ble.requestBlePermissions(), true);
  }
});

test('PermissionHost checks reject non-boolean values instead of accepting truthy denials', async () => {
  const f = runtime('harmony', 0);
  for (const value of ['denied', 'granted', 0, undefined]) {
    f.host.check = async () => value as any;
    await assert.rejects(f.ble.requestBlePermissions(), /invalid check result/);
    assert.equal(f.prompts.length, 0);
  }
});

test('Android BLE permission sets and legacy provider without Harmony hooks keep working', async () => {
  for (const [sdk, mode, expected] of [
    [36, 'central', ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT']],
    [31, 'peripheral', ['BLUETOOTH_ADVERTISE', 'BLUETOOTH_CONNECT']],
    [29, 'central', ['ACCESS_FINE_LOCATION']],
    [28, 'central', ['ACCESS_COARSE_LOCATION']],
    [30, 'peripheral', []],
  ] as const) {
    const f = runtime('android', sdk);
    assert.equal(await f.ble.requestBlePermissions(mode), true);
    assert.deepEqual(f.prompts, expected.length ? [expected.map(name => `android.permission.${name}`)] : []);
  }
  // Execute the BLE entry point using the original provider shape, without Harmony fields.
  for (const isAndroid of [false, true]) {
    const f = runtime(isAndroid ? 'android' : 'ios', 36, undefined, true);
    assert.equal(f.blePermissions.isHarmony(), false);
    assert.equal(await f.ble.requestBlePermissions(), true);
    assert.deepEqual(f.prompts, isAndroid ? [[
      'android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT',
    ]] : []);
    assert.throws(() => f.blePermissions.requestHarmonyPermissions([accessBluetooth]), /not configured/);
  }
});

test('Android Wi-Fi SDK sets and Android 12 precise location pairing are preserved', async () => {
  for (const [sdk, operation, partialInfo, expected] of [
    [22, 'scan', false, []],
    [29, 'info', false, ['ACCESS_FINE_LOCATION']],
    [31, 'scan', false, ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']],
    [33, 'connect', true, ['NEARBY_WIFI_DEVICES']],
    [33, 'connect', false, ['NEARBY_WIFI_DEVICES', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']],
  ] as const) {
    const f = runtime('android', sdk);
    assert.deepEqual(plain(await f.wifi().askWifiPermission({ operation, partialInfo })), granted);
    assert.deepEqual(f.prompts, expected.length ? [expected.map(name => `android.permission.${name}`)] : []);
  }
  const f = runtime('android', 31);
  const p = f.permissions.ANDROID_PERMISSIONS;
  f.grants.add(p.ACCESS_COARSE_LOCATION);
  assert.deepEqual(plain(await f.permissions.requestAndroidPermissions([p.ACCESS_FINE_LOCATION])), granted);
  assert.deepEqual(f.prompts, [[p.ACCESS_FINE_LOCATION, p.ACCESS_COARSE_LOCATION]]);
});

test('iOS Wi-Fi scan remains unavailable, connect approved and info uses serialized native location flow', async () => {
  const f = runtime('ios', 0);
  const calls: string[] = [];
  f.load(app('wifi/WifiHost')).installWifiHost({
    setEvents() {},
    async getLocationPermissionState() { calls.push('check'); return { status: 'denied', canAskAgain: true }; },
    async requestLocationPermission() { calls.push('request'); return granted; },
  });
  const wifi = f.wifi();
  for (const method of ['readWifiPermission', 'askWifiPermission']) {
    assert.deepEqual(plain(await wifi[method]({ operation: 'scan' })), unavailable);
    assert.deepEqual(plain(await wifi[method]({ operation: 'connect' })), granted);
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(plain(await wifi.readWifiPermission({ operation: 'info' })), {
    status: 'denied', canAskAgain: true,
  });
  assert.deepEqual(plain(await wifi.askWifiPermission({ operation: 'info' })), granted);
  assert.deepEqual(calls, ['check', 'check', 'request']);
  assert.equal(await f.ble.requestBlePermissions(), true);
  assert.equal(f.checks.length, 0);
  assert.equal(f.prompts.length, 0);
});

test('Android and Harmony NFC retain discovery, host tech strings, byte copying and stale handle rejection', async () => {
  for (const platform of ['android', 'harmony'] as const) {
    const f = runtime(platform);
    let events: any;
    const calls: string[] = [];
    const reply = new Uint8Array([0, 0x90, 0]);
    let sent: Uint8Array | undefined;
    f.load(app('nfc/NfcHost')).installNfcHost({
      setEvents(value: any) { events = value; },
      async startDiscovery() { calls.push('start'); },
      async stopDiscovery() { calls.push('stop'); },
      async connect(handle: any) { calls.push(handle.tech); },
      async transceive(handle: any, data: Uint8Array) {
        assert.equal(handle.tech, 'NfcA');
        sent = data;
        return reply.subarray(1);
      },
    });
    const { createNFCAdapter, NFC_TECH } = f.load(app('nfc/adapter'));
    const adapter = createNFCAdapter();
    const discovered: any[] = [];
    adapter.onDiscovered((tag: any) => discovered.push(tag));
    assert.equal((await adapter.startDiscovery()).errMsg, 'NFCAdapter.startDiscovery:ok');
    const id = new Uint8Array([1, 2]);
    events.discovered({ tagHandle: 'tag', id, techs: [NFC_TECH.nfcA], messages: [] });
    id[0] = 9;
    assert.deepEqual([...new Uint8Array(discovered[0].id)], [1, 2]);
    assert.deepEqual([...discovered[0].techs], ['android.nfc.tech.NfcA']);
    const tech = adapter.getNfcA();
    assert.equal((await tech.connect()).errMsg, 'NfcA.connect:ok');
    const input = new Uint8Array([0x30, 0]);
    const response = await tech.transceive({ data: input.buffer });
    assert.deepEqual([...new Uint8Array(response.data)], [0x90, 0]);
    assert.equal(response.data.byteLength, 2);
    input[0] = 0;
    assert.deepEqual([...sent!], [0x30, 0]);
    await adapter.stopDiscovery();
    await assert.rejects(tech.connect(), (error: any) => error.errCode === 13013);
    assert.deepEqual(calls, ['start', 'NfcA', 'stop']);
  }
});

test('Android and Harmony public NFC availability and permission paths preserve host state without prompts', async () => {
  for (const platform of ['android', 'harmony'] as const) {
    const f = runtime(platform);
    let calls = 0;
    let state = { supported: true, enabled: true, foreground: true, permissionGranted: false };
    f.load(app('nfc/NfcHost')).installNfcHost({
      setEvents() {},
      async getAvailability() {
        calls++;
        // Native boundary: Harmony availability checks its normal NFC_TAG grant.
        return platform === 'harmony' ? { ...state, permissionGranted: await f.host.check(nfcTag) } : state;
      },
      async startDiscovery() { assert.fail('Availability must not start discovery'); },
    });
    const permission = f.load(app('nfc/permission'));
    for (const next of [
      { supported: true, enabled: true, foreground: true, permissionGranted: false },
      { supported: true, enabled: true, foreground: true, permissionGranted: true },
      { supported: true, enabled: false, foreground: false, permissionGranted: true },
      { supported: false, enabled: false, foreground: true, permissionGranted: true },
    ]) {
      state = next;
      if (state.permissionGranted) f.grants.add(nfcTag);
      else f.grants.delete(nfcTag);
      assert.deepEqual(plain(await permission.getNFCAvailability()), state);
      const expected = state.supported && state.permissionGranted ? normalGranted : unavailable;
      assert.deepEqual(plain(await permission.getNFCPermissionState()), expected);
      assert.deepEqual(plain(await permission.requestNFCPermission()), expected);
    }
    assert.equal(calls, 12);
    assert.equal(f.prompts.length, 0);
    assert.deepEqual(f.checks, platform === 'harmony' ? Array(12).fill(nfcTag) : []);
  }
});

test('iOS public NFC availability and permission paths stay unavailable without native access', async () => {
  const f = runtime('ios', 0);
  f.load(app('nfc/NfcHost')).installNfcHost({
    setEvents() {},
    async getAvailability() { assert.fail('iOS must not query the native NFC host'); },
  });
  const permission = f.load(app('nfc/permission'));
  assert.deepEqual(plain(await permission.getNFCAvailability()), {
    supported: false, enabled: false, foreground: false, permissionGranted: false,
  });
  assert.deepEqual(plain(await permission.getNFCPermissionState()), unavailable);
  assert.deepEqual(plain(await permission.requestNFCPermission()), unavailable);
  assert.equal(f.checks.length, 0);
  assert.equal(f.prompts.length, 0);
});

test('Android and Harmony public NFC permission paths retain native error mapping', async () => {
  for (const platform of ['android', 'harmony'] as const) {
    const f = runtime(platform);
    f.load(app('nfc/NfcHost')).installNfcHost({
      setEvents() {},
      async getAvailability() { throw new Error('E_NFC_13019:normal permission missing'); },
    });
    const permission = f.load(app('nfc/permission'));
    for (const method of ['getNFCAvailability', 'getNFCPermissionState', 'requestNFCPermission']) {
      await assert.rejects(permission[method](), (error: any) =>
        error.errCode === 13019 && error.errMsg === 'getNFCAvailability:fail user is not authorized');
    }
    assert.equal(f.prompts.length, 0);
  }
});

test('iOS NFC stays unsupported before native access; Harmony without a host does not claim support', async () => {
  const ios = runtime('ios', 0);
  const native = ios.load(app('nfc/native')).nativeNFC;
  await assert.rejects(native.getAvailability(), /E_NFC_13000/);
  assert.throws(() => native.onDiscovered(() => {}), /E_NFC_13000/);
  const adapter = ios.load(app('nfc/adapter')).createNFCAdapter();
  await assert.rejects(adapter.startDiscovery(), (error: any) => error.errCode === 13000);
  const harmony = runtime('harmony', 0);
  await assert.rejects(harmony.load(app('nfc/native')).nativeNFC.getAvailability(), /native NFC is not installed/);
});
