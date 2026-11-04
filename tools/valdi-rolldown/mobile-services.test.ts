import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { valdiSourceRoot } from './pipeline';

const modules = path.resolve(import.meta.dirname, '../../valdi/modules');
const service = (name: string) => {
  const [module, ...file] = name.split('/');
  return path.join(modules, module, 'src', `${file.join('/')}.ts`);
};
const bluetooth = (name: string) => path.join(modules, 'bluetooth/src', name.endsWith('.ts') ? name : `${name}.ts`);
const requireApp = createRequire(path.join(modules, 'app_pages/package.json'));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Execute the real service modules, including nativeCall, host installation, the shared
// permission queue and NFC event/byte adapters. Only Device and native hosts are supplied.
// Everything stays in memory: no build pipeline, generated files or source links.
function runtime(platform: 'android' | 'ios', sdk = 36, device?: object, legacyProvider = false) {
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
        const nativeModules = ['Permissions', 'Wifi', 'Nfc'];
        if (nativeModules.some(module => name === `./${module}`)) return {
          getHost() { throw Error('Native module collaborator was not installed'); }, getAndroidSdk: () => sdk,
        };
        if (/^(native_common|permissions|wifi|nfc)\//.test(name)) return load(path.join(modules, name + '.ts'));
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
  const permissions = load(service('permissions/index'));
  load(service('permissions/PermissionHost')).installPermissionHost(host, sdk);
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
    wifi: () => load(service('wifi/permission')),
  };
}

const granted = { status: 'granted', canAskAgain: true };
const normalGranted = { status: 'granted', canAskAgain: false };
const unavailable = { status: 'unavailable', canAskAgain: false };

test('Owned service sources pass strict noEmit against the real upstream Device types', () => {
  const root = path.resolve(modules, '../..');
  const upstream = valdiSourceRoot();
  assert.ok(upstream, 'Prepare Valdi sources or set VALDI_SOURCE_ROOT');
  const program = ts.createProgram([
    service('permissions/index'), service('permissions/PermissionHost'), service('wifi/permission'),
    service('nfc/adapter'), service('nfc/native'), service('nfc/NfcHost'), service('nfc/permission'),
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
    paths: {
      'valdi_core/*': [path.join(upstream, 'src/valdi_modules/src/valdi/valdi_core/*')],
      '*': [path.join(modules, '*')],
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
});

test('PermissionHost grants require canonical values and a result per requested permission', async () => {
  for (const result of ['GRANTED', 'restricted', 0, undefined]) {
    const f = runtime('android');
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
  const f = runtime('android');
  for (const value of ['denied', 'granted', 0, undefined]) {
    f.host.check = async () => value as any;
    await assert.rejects(f.ble.requestBlePermissions(), /invalid check result/);
    assert.equal(f.prompts.length, 0);
  }
});

test('Android BLE permission sets and legacy provider keep working', async () => {
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
  // Execute the BLE entry point using the original provider shape, with mobile permission fields.
  for (const isAndroid of [false, true]) {
    const f = runtime(isAndroid ? 'android' : 'ios', 36, undefined, true);
    assert.equal(await f.ble.requestBlePermissions(), true);
    assert.deepEqual(f.prompts, isAndroid ? [[
      'android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT',
    ]] : []);
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
  f.load(service('wifi/WifiHost')).installWifiHost({
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

test('Android NFC retain discovery, host tech strings, byte copying and stale handle rejection', async () => {
  for (const platform of ['android'] as const) {
    const f = runtime(platform);
    let events: any;
    const calls: string[] = [];
    const reply = new Uint8Array([0, 0x90, 0]);
    let sent: Uint8Array | undefined;
    f.load(service('nfc/NfcHost')).installNfcHost({
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
    const { createNFCAdapter, NFC_TECH } = f.load(service('nfc/adapter'));
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

test('Android public NFC availability and permission paths preserve host state without prompts', async () => {
  for (const platform of ['android'] as const) {
    const f = runtime(platform);
    let calls = 0;
    let state = { supported: true, enabled: true, foreground: true, permissionGranted: false };
    f.load(service('nfc/NfcHost')).installNfcHost({
      setEvents() {},
      async getAvailability() {
        calls++;
        return state;
      },
      async startDiscovery() { assert.fail('Availability must not start discovery'); },
    });
    const permission = f.load(service('nfc/permission'));
    for (const next of [
      { supported: true, enabled: true, foreground: true, permissionGranted: false },
      { supported: true, enabled: true, foreground: true, permissionGranted: true },
      { supported: true, enabled: false, foreground: false, permissionGranted: true },
      { supported: false, enabled: false, foreground: true, permissionGranted: true },
    ]) {
      state = next;
      assert.deepEqual(plain(await permission.getNFCAvailability()), state);
      const expected = state.supported && state.permissionGranted ? normalGranted : unavailable;
      assert.deepEqual(plain(await permission.getNFCPermissionState()), expected);
      assert.deepEqual(plain(await permission.requestNFCPermission()), expected);
    }
    assert.equal(calls, 12);
    assert.equal(f.prompts.length, 0);
    assert.deepEqual(f.checks, []);
  }
});

test('iOS public NFC availability and permission paths stay unavailable without native access', async () => {
  const f = runtime('ios', 0);
  f.load(service('nfc/NfcHost')).installNfcHost({
    setEvents() {},
    async getAvailability() { assert.fail('iOS must not query the native NFC host'); },
  });
  const permission = f.load(service('nfc/permission'));
  assert.deepEqual(plain(await permission.getNFCAvailability()), {
    supported: false, enabled: false, foreground: false, permissionGranted: false,
  });
  assert.deepEqual(plain(await permission.getNFCPermissionState()), unavailable);
  assert.deepEqual(plain(await permission.requestNFCPermission()), unavailable);
  assert.equal(f.checks.length, 0);
  assert.equal(f.prompts.length, 0);
});

test('Android public NFC permission paths retain native error mapping', async () => {
  for (const platform of ['android'] as const) {
    const f = runtime(platform);
    f.load(service('nfc/NfcHost')).installNfcHost({
      setEvents() {},
      async getAvailability() { throw new Error('E_NFC_13019:normal permission missing'); },
    });
    const permission = f.load(service('nfc/permission'));
    for (const method of ['getNFCAvailability', 'getNFCPermissionState', 'requestNFCPermission']) {
      await assert.rejects(permission[method](), (error: any) =>
        error.errCode === 13019 && error.errMsg === 'getNFCAvailability:fail user is not authorized');
    }
    assert.equal(f.prompts.length, 0);
  }
});

test('iOS NFC stays unsupported before native access', async () => {
  const ios = runtime('ios', 0);
  const native = ios.load(service('nfc/native')).nativeNFC;
  await assert.rejects(native.getAvailability(), /E_NFC_13000/);
  assert.throws(() => native.onDiscovered(() => {}), /E_NFC_13000/);
  const adapter = ios.load(service('nfc/adapter')).createNFCAdapter();
  await assert.rejects(adapter.startDiscovery(), (error: any) => error.errCode === 13000);
});
