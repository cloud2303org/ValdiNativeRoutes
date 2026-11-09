import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { valdiSourceRoot } from './pipeline';

const root = path.resolve(import.meta.dirname, '../..');
const modules = path.join(root, 'valdi/modules');
const source = (name: string) => path.join(modules, `${name}.ts`);
const requireApp = createRequire(path.join(modules, 'app_pages/package.json'));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Execute actual facades, schemas, permission serialization and event dispatch. Only generated native
// entries and framework device/reference context are supplied; no generated files or native builds.
function fixture(platform: 'android' | 'ios' = 'android') {
  const calls: { name: string; value?: unknown }[] = [];
  const errors: unknown[][] = [];
  const context = vm.createContext({ Error, Uint8Array, console: { error: (...args: unknown[]) => errors.push(args) } });
  const cache = new Map<string, { exports: any }>();
  let location: unknown = { status: 'undetermined', canAskAgain: true };
  let requestedLocation: unknown = { status: 'granted', canAskAgain: true };
  const wifi = {
    setEvents() { calls.push({ name: 'setEvents' }); },
    async startWifi() { calls.push({ name: 'start' }); },
    async stopWifi() { calls.push({ name: 'stop' }); },
    async connectWifi(params: { SSID: string }) {
      calls.push({ name: 'connect', value: params });
      return { SSID: params.SSID, BSSID: 'ab:cd:ef:12:34:56' };
    },
    async getConnectedWifi(partialInfo: boolean) {
      calls.push({ name: 'info', value: partialInfo });
      return { SSID: 'device-ap', BSSID: 'ab:cd:ef:12:34:56' };
    },
    async setWifiList(value: unknown) {
      calls.push({ name: 'list', value });
      throw new Error('E_WIFI_SET_WIFI_LIST_UNSUPPORTED:Candidate lists are unavailable');
    },
    async getLocationPermissionState() { calls.push({ name: 'location' }); return location; },
    async requestLocationPermission() { calls.push({ name: 'requestLocation' }); return requestedLocation; },
  };
  const grants = new Set<string>();
  const permissionHost = {
    async check(permission: string) { calls.push({ name: 'check', value: permission }); return grants.has(permission); },
    async requestMultiple(permissions: string[]) {
      calls.push({ name: 'prompt', value: permissions });
      return permissions.map(permission => {
        grants.add(permission);
        return { permission, result: 'granted' };
      });
    },
  };
  const load = (file: string): any => {
    const prior = cache.get(file);
    if (prior) return prior.exports;
    const module = { exports: {} };
    cache.set(file, module);
    const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: file,
      reportDiagnostics: true,
    });
    assert.deepEqual(emitted.diagnostics, []);
    vm.runInContext(`(function(require,module,exports){${emitted.outputText}\n})`, context, { filename: file })(
      (name: string) => {
        if (name === './Wifi') return { getHost: () => wifi };
        if (name === './Permissions') return { getHost: () => permissionHost, getAndroidSdk: () => 36 };
        if (name === 'valdi_core/src/Device') return { Device: { isAndroid: () => platform === 'android' } };
        if (name === 'valdi_core/src/NativeReferences')
          return { withGlobalNativeRefs: (_name: string, body: () => unknown) => body() };
        if (name === 'valibot') return requireApp(name);
        if (/^(wifi|permissions|native_common)\//.test(name)) return load(source(name));
        assert.ok(name.startsWith('.'), `Unexpected dependency ${name}`);
        return load(`${path.resolve(path.dirname(file), name)}.ts`);
      },
      module, module.exports,
    );
    return module.exports;
  };
  return {
    load, calls, errors,
    api: () => load(source('wifi/src/wechat')).createWifiRuntime(),
    location: (value: unknown) => { location = value; },
    requestedLocation: (value: unknown) => { requestedLocation = value; },
  };
}

function wifiError(operation: string, code: number, nativeCode: string) {
  return (error: any) => {
    assert.equal(error.errCode, code);
    assert.equal(error.errno, code);
    assert.equal(error.nativeCode, nativeCode);
    assert.match(error.errMsg, new RegExp(`^${operation}:fail `));
    assert.equal(error.message.includes('test-password-value'), false);
    return true;
  };
}

test('Wi-Fi rejects nonboolean maunal and partialInfo before native or permission work', async () => {
  const f = fixture();
  const api = f.api();
  await api.startWifi();
  const before = f.calls.length;
  for (const invalid of ['false', 'true', 0, 1, {}, []]) {
    for (const field of ['maunal', 'partialInfo']) {
      await assert.rejects(api.connectWifi({ SSID: 'device-ap', password: 'test-password-value', [field]: invalid }),
        wifiError('connectWifi', 12009, 'E_WIFI_SYSTEM_CONFIG'));
    }
    await assert.rejects(api.getConnectedWifi({ partialInfo: invalid }),
      wifiError('getConnectedWifi', 12009, 'E_WIFI_SYSTEM_CONFIG'));
    for (const method of ['getWifiPermissionState', 'requestWifiPermission'])
      await assert.rejects(api[method]({ operation: 'connect', partialInfo: invalid }), /partialInfo must be a boolean/);
  }
  assert.equal(f.calls.length, before);
});

test('Wi-Fi keeps boolean values, nullish defaults and the legacy maunal spelling', () => {
  const f = fixture();
  const schemas = f.load(source('wifi/src/schemas'));
  for (const value of [undefined, null, false, true]) {
    const expected = value ?? false;
    assert.deepEqual(plain(schemas.parseOptions(schemas.connectWifiOptions, {
      SSID: 'device-ap', maunal: value, partialInfo: value,
    })), { SSID: 'device-ap', password: '', BSSID: '', maunal: expected, partialInfo: expected });
    assert.deepEqual(plain(schemas.parseOptions(schemas.getConnectedWifiOptions, { partialInfo: value })),
      { partialInfo: expected });
    assert.deepEqual(plain(schemas.parseOptions(schemas.wifiPermissionOptions, {
      operation: 'connect', partialInfo: value,
    })), { operation: 'connect', partialInfo: expected });
  }
  for (const options of [undefined, null, {}])
    assert.deepEqual(plain(schemas.parseOptions(schemas.getConnectedWifiOptions, options)), { partialInfo: false });
  assert.equal(schemas.parseOptions(schemas.connectWifiOptions, { SSID: 'device-ap' }).maunal, false);
});

test('Wi-Fi valid manual and partial calls retain their native arguments and permission branches', async () => {
  const f = fixture();
  const api = f.api();
  await api.startWifi();
  assert.deepEqual(plain(await api.connectWifi({ SSID: 'device-ap', maunal: true })), { errMsg: 'connectWifi:ok' });
  assert.deepEqual(plain(f.calls.find(call => call.name === 'connect')?.value), {
    SSID: 'device-ap', password: '', BSSID: '', maunal: true, partialInfo: false,
  });
  assert.deepEqual(plain(await api.getConnectedWifi({ partialInfo: true })), {
    wifi: { SSID: 'device-ap' }, errMsg: 'getConnectedWifi:ok',
  });
  assert.equal(f.calls.some(call => ['check', 'prompt'].includes(call.name)), false);
});

test('Wi-Fi default and explicit false connect flags reach native after the required Android permissions', async () => {
  for (const flags of [{}, { maunal: false, partialInfo: false }, { maunal: null, partialInfo: null },
    { maunal: false, partialInfo: true }]) {
    const f = fixture();
    const api = f.api();
    await api.startWifi();
    const result = await api.connectWifi({ SSID: 'device-ap', ...flags });
    const partial = flags.partialInfo === true;
    assert.deepEqual(plain(f.calls.find(call => call.name === 'connect')?.value), {
      SSID: 'device-ap', password: '', BSSID: '', maunal: false, partialInfo: partial,
    });
    assert.deepEqual(plain(f.calls.find(call => call.name === 'prompt')?.value), [
      'android.permission.NEARBY_WIFI_DEVICES',
      ...(partial ? [] : ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION']),
    ]);
    assert.deepEqual(plain(result), {
      errMsg: 'connectWifi:ok',
      wifi: partial ? { SSID: 'device-ap' } : { SSID: 'device-ap', BSSID: 'ab:cd:ef:12:34:56' },
    });
    assert.ok(f.calls.findIndex(call => call.name === 'prompt') < f.calls.findIndex(call => call.name === 'connect'));
  }
});

test('Wi-Fi credential list entries validate fields before native and keep errors credential-free', async () => {
  const f = fixture();
  const api = f.api();
  await api.startWifi();
  const credential = { SSID: 'device-ap', password: 'test-password-value' };
  const before = f.calls.length;
  for (const [entry, code, nativeCode] of [
    [null, 12009, 'E_WIFI_SYSTEM_CONFIG'],
    ['test-password-value', 12009, 'E_WIFI_SYSTEM_CONFIG'],
    [{ ...credential, SSID: '' }, 12008, 'E_WIFI_INVALID_SSID'],
    [{ ...credential, SSID: 1 }, 12008, 'E_WIFI_INVALID_SSID'],
    [{ ...credential, SSID: 'bad\0ssid' }, 12008, 'E_WIFI_INVALID_SSID'],
    [{ ...credential, BSSID: 'test-password-value' }, 12009, 'E_WIFI_SYSTEM_CONFIG'],
    [{ ...credential, BSSID: 1 }, 12009, 'E_WIFI_SYSTEM_CONFIG'],
    [{ SSID: 'device-ap' }, 12009, 'E_WIFI_SYSTEM_CONFIG'],
    [{ ...credential, password: 123 }, 12014, 'E_WIFI_INVALID_PASSWORD'],
  ] as const)
    await assert.rejects(api.setWifiList({ wifiList: [entry] }), wifiError('setWifiList', code, nativeCode));
  assert.equal(f.calls.length, before);
});

test('Wi-Fi valid candidate lists still report native unsupported on both platforms', async () => {
  for (const platform of ['android', 'ios'] as const) {
    const f = fixture(platform);
    const api = f.api();
    await api.startWifi();
    for (const wifiList of [[], [{ SSID: 'open-ap', password: '' }], [{
      SSID: 'device-ap', BSSID: 'AB:CD:EF:12:34:56', password: 'test-password-value',
    }]]) {
      await assert.rejects(api.setWifiList({ wifiList }),
        wifiError('setWifiList', 12001, 'E_WIFI_SET_WIFI_LIST_UNSUPPORTED'));
      assert.deepEqual(plain(f.calls.at(-1)?.value), wifiList);
    }
    assert.equal(f.calls.some(call => ['check', 'prompt'].includes(call.name)), false);
  }
});

test('Wi-Fi rejects invalid native permission statuses on reads and requests without disclosing values', async () => {
  const f = fixture('ios');
  const api = f.api();
  for (const status of ['test-password-value', '', 'GRANTED', null, 1]) {
    f.location({ status, canAskAgain: true });
    await assert.rejects(api.getWifiPermissionState({ operation: 'info' }),
      { message: 'native Wi-Fi returned an invalid permission status' });
    const requests = f.calls.filter(call => call.name === 'requestLocation').length;
    await assert.rejects(api.requestWifiPermission({ operation: 'info' }),
      { message: 'native Wi-Fi returned an invalid permission status' });
    assert.equal(f.calls.filter(call => call.name === 'requestLocation').length, requests);
    f.location({ status: 'undetermined', canAskAgain: true });
    f.requestedLocation({ status, canAskAgain: false });
    await assert.rejects(api.requestWifiPermission({ operation: 'info' }),
      { message: 'native Wi-Fi returned an invalid permission status' });
  }
});

test('Wi-Fi maps valid native statuses and preserves terminal statuses and permission prompt serialization', async () => {
  const f = fixture('ios');
  const api = f.api();
  for (const status of ['granted', 'undetermined', 'denied', 'blocked', 'unavailable']) {
    const state = { status, canAskAgain: status !== 'blocked' && status !== 'unavailable' };
    f.location(state);
    assert.deepEqual(plain(await api.getWifiPermissionState({ operation: 'info' })), state);
    const before = f.calls.filter(call => call.name === 'requestLocation').length;
    const result = await api.requestWifiPermission({ operation: 'info' });
    const terminal = ['granted', 'blocked', 'unavailable'].includes(status);
    assert.equal(f.calls.filter(call => call.name === 'requestLocation').length, before + (terminal ? 0 : 1));
    assert.deepEqual(plain(result), terminal ? state : { status: 'granted', canAskAgain: true });
  }
  f.location({ status: 'denied', canAskAgain: true });
  f.requestedLocation({ status: 'blocked', canAskAgain: false });
  const results = await Promise.all([
    api.requestWifiPermission({ operation: 'info' }),
    api.requestWifiPermission({ operation: 'info' }),
  ]);
  assert.deepEqual(plain(results), [
    { status: 'blocked', canAskAgain: false }, { status: 'blocked', canAskAgain: false },
  ]);
  assert.deepEqual(f.calls.slice(-4).map(call => call.name), [
    'location', 'requestLocation', 'location', 'requestLocation',
  ]);
});

test('BLE keeps event channels, payload identity and globally unique listener ids', () => {
  const f = fixture();
  const { listen, unlisten, bleEvents } = f.load(source('bluetooth/src/events'));
  const payloads = {
    deviceFound: { deviceId: 'device', RSSI: -50, advertisData: new Uint8Array([1]),
      advertisServiceUUIDs: [], localName: '', name: '', serviceData: [] },
    adapterStateChange: { available: true, discovering: false },
    connectStateChange: { deviceId: 'device', connected: true },
    characteristicUpdate: { deviceId: 'device', serviceId: 'service', characteristicId: 'characteristic',
      value: new Uint8Array([2]) },
    mtuChange: { deviceId: 'device', mtu: 128 },
    peripheralReadRequest: { serverId: 'server', serviceId: 'service', characteristicId: 'characteristic',
      callbackId: 1, deviceId: 'device', offset: 0 },
    peripheralWriteRequest: { serverId: 'server', serviceId: 'service', characteristicId: 'characteristic',
      callbackId: 2, deviceId: 'device', offset: 0, value: new Uint8Array([3]), needResponse: true },
    peripheralSubscribed: { serverId: 'server', serviceId: 'service', characteristicId: 'characteristic', deviceId: 'device' },
    peripheralUnsubscribed: { serverId: 'server', serviceId: 'service', characteristicId: 'characteristic', deviceId: 'device' },
    peripheralConnectionStateChange: { serverId: 'server', deviceId: 'device', connected: false },
  };
  const received: [string, unknown][] = [];
  const ids = Object.keys(payloads).map(kind => listen(kind, (event: unknown) => received.push([kind, event])));
  assert.equal(new Set(ids).size, ids.length);
  for (const [kind, payload] of Object.entries(payloads)) {
    bleEvents[kind](payload);
    assert.equal(received.at(-1)?.[0], kind);
    assert.equal(received.at(-1)?.[1], payload);
  }
  assert.equal(received.length, ids.length);
  Object.keys(payloads).forEach((kind, index) => unlisten(kind, ids[index]));
  for (const [kind, payload] of Object.entries(payloads)) bleEvents[kind](payload);
  assert.equal(received.length, ids.length);
});

test('BLE dispatch snapshots listeners during removal/addition and isolates listener failures', () => {
  const f = fixture();
  const { listen, unlisten, bleEvents } = f.load(source('bluetooth/src/events'));
  const received: string[] = [];
  const first = listen('mtuChange', () => {
    received.push('first');
    unlisten('mtuChange', first);
    unlisten('mtuChange', second);
    listen('mtuChange', () => received.push('late'));
  });
  const second = listen('mtuChange', () => received.push('second'));
  listen('mtuChange', () => { throw new Error('listener failed'); });
  listen('mtuChange', () => received.push('last'));
  bleEvents.mtuChange({ deviceId: 'device', mtu: 128 });
  assert.deepEqual(received, ['first', 'second', 'last']);
  bleEvents.mtuChange({ deviceId: 'device', mtu: 256 });
  assert.deepEqual(received, ['first', 'second', 'last', 'last', 'late']);
  assert.equal(f.errors.length, 2);
  assert.equal(f.errors[0][0], '[ble] mtuChange listener failed');
});

test('Wi-Fi and BLE pass strict noEmit with negative event-name/payload checks including internal emitters', () => {
  const upstream = valdiSourceRoot();
  assert.ok(upstream, 'Prepare Valdi sources or set VALDI_SOURCE_ROOT');
  const options: ts.CompilerOptions = {
    noEmit: true, strict: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, types: [], baseUrl: root,
    paths: {
      'valdi_core/*': [path.join(upstream, 'src/valdi_modules/src/valdi/valdi_core/*')],
      'valdi_tsx/*': [path.join(upstream, 'src/valdi_modules/src/valdi/valdi_tsx/*')],
      'coreutils/*': [path.join(upstream, 'src/valdi_modules/src/valdi/coreutils/*')],
      '*': [path.join(modules, '*')],
    },
  };
  const eventsFile = source('bluetooth/src/events');
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (file === eventsFile)
      return ts.createSourceFile(file, readFileSync(file, 'utf8') + `
listen('mtuChange', event => { const mtu: number = event.mtu; });
listen('adapterStateChange', event => { const available: boolean = event.available; });
emit('mtuChange')({ deviceId: 'device', mtu: 128 });
// @ts-expect-error adapter payload must not be accepted for an MTU event
emit('mtuChange')({ available: true, discovering: false });
// @ts-expect-error MTU payload must not be accepted for an adapter event
emit('adapterStateChange')({ deviceId: 'device', mtu: 128 });
// @ts-expect-error listener payload must follow the chosen event name
listen('mtuChange', (event: { available: boolean }) => {});
listen('adapterStateChange', event => {
  // @ts-expect-error adapter events have no MTU
  event.mtu;
});
// @ts-expect-error unknown event names are rejected
listen('notAnEvent', () => {});
`, languageVersion, true);
    return originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([
    source('wifi/src/wechat'), source('wifi/src/permission'), source('wifi/src/schemas'), eventsFile,
  ], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
});
