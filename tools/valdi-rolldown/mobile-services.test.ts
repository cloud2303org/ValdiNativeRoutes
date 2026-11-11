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

// Execute the real service modules, including nativeCall, generated native entry lookup, the shared
// permission queue and NFC event/byte adapters. Only Device and native entries are supplied.
// Everything stays in memory: no build pipeline, generated files or source links.
function runtime(platform: 'android' | 'ios', sdk = 36, device?: object) {
  const context = vm.createContext({ console, Error, ArrayBuffer, Uint8Array });
  const scopes: string[] = [];
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
        if (name === 'valdi_core/src/NativeReferences') return { withGlobalNativeRefs: (name: string, body: () => unknown) => {
          scopes.push(name);
          try { return body(); } finally { scopes.pop(); }
        } };
        if (name === 'valdi_core/src/Device')
          return { Device: device ?? { getSystemType: () => platform, isAndroid: () => platform === 'android' } };
        if (name === 'valibot') return requireApp('valibot');
        if (Object.hasOwn(nativeModules, name)) return nativeModules[name];
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
  const nativeModules: Record<string, { getHost: () => any; getAndroidSdk?: () => number }> = {
    './Permissions': { getHost: () => host, getAndroidSdk: () => sdk },
    './Wifi': { getHost() { throw Error('Native Wi-Fi entry is unavailable'); } },
    './Nfc': { getHost() { throw Error('Native NFC entry is unavailable'); } },
  };
  const permissions = load(service('permissions/index'));
  const blePermissions = load(bluetooth('permissions'));
  return {
    load, permissions, blePermissions, host, grants, checks, prompts, nativeModules, scopes,
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
      'valdi_tsx/*': [path.join(upstream, 'src/valdi_modules/src/valdi/valdi_tsx/*')],
      'coreutils/*': [path.join(upstream, 'src/valdi_modules/src/valdi/coreutils/*')],
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

test('Wi-Fi and NFC bind cached native events under application reference scopes', () => {
  const f = runtime('android');
  for (const [entry, module, getter, attribution] of [
    ['./Wifi', 'wifi/WifiHost', 'wifiHost', 'wifi'],
    ['./Nfc', 'nfc/NfcHost', 'nfcHost', 'nfc'],
  ]) {
    let retrievals = 0;
    let bindings = 0;
    f.nativeModules[entry].getHost = () => {
      retrievals++;
      assert.equal(f.scopes.at(-1), attribution);
      return { setEvents: () => { bindings++; assert.equal(f.scopes.at(-1), attribution); } };
    };
    const facade = f.load(service(module));
    assert.equal(retrievals, 0);
    const host = facade[getter]();
    assert.equal(facade[getter](), host);
    assert.equal(retrievals, 1);
    assert.equal(bindings, 1);
    assert.deepEqual(f.scopes, []);
  }
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

test('BLE permission sets use the shared service without initialization', async () => {
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
  // Both platforms use the module-owned shared permission service.
  for (const isAndroid of [false, true]) {
    const f = runtime(isAndroid ? 'android' : 'ios', 36);
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
  f.nativeModules['./Wifi'].getHost = () => ({
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
    f.nativeModules['./Nfc'].getHost = () => ({
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

for (const inputType of ['ArrayBuffer', 'Uint8Array subview', 'shared-backed Uint8Array subview']) {
  test(`Android NFC snapshots ${inputType} before awaiting transceive`, async () => {
    const f = runtime('android');
    let events: any;
    let resolve!: (value: Uint8Array) => void;
    let sent: Uint8Array | undefined;
    f.nativeModules['./Nfc'].getHost = () => ({
      setEvents(value: any) { events = value; },
      async startDiscovery() {},
      transceive(_handle: any, data: Uint8Array) {
        sent = data;
        return new Promise<Uint8Array>(done => { resolve = done; });
      },
    });
    const adapter = f.load(service('nfc/adapter')).createNFCAdapter();
    await adapter.startDiscovery();
    events.discovered({ tagHandle: 'tag', id: Uint8Array.of(1), techs: ['NfcA'], messages: [] });
    const source = inputType === 'ArrayBuffer' ? Uint8Array.of(0x30, 0)
      : inputType === 'Uint8Array subview' ? Uint8Array.of(99, 0x30, 0, 88)
        : new Uint8Array(new SharedArrayBuffer(4));
    if (inputType === 'shared-backed Uint8Array subview') source.set([99, 0x30, 0, 88]);
    const data = inputType === 'ArrayBuffer' ? source.buffer : source.subarray(1, 3);
    const response = adapter.getNfcA().transceive({ data });
    void response.catch(() => {});
    source.fill(7);
    assert.ok(sent, 'transceive must capture the input before returning');
    assert.deepEqual([...sent], [0x30, 0]);
    assert.notEqual(sent.buffer, source.buffer);
    const reply = Uint8Array.of(0x90, 0);
    resolve(reply);
    assert.equal((await response).data, reply.buffer, 'full-buffer replies need no JS copy');
  });
}

test('NFC native adapter forwards owned command and record bytes without another snapshot', async () => {
  const f = runtime('android');
  const sent: Uint8Array[] = [];
  f.nativeModules['./Nfc'].getHost = () => ({
    setEvents() {},
    async transceive(_handle: any, data: Uint8Array) { sent.push(data); return data; },
    async writeNdefMessage(_handle: any, records: any[]) {
      sent.push(records[0].id, records[0].type, records[0].payload);
    },
  });
  const native = f.load(service('nfc/native')).nativeNFC;
  const handle = { tagHandle: 'tag', tech: 'NfcA' };
  const owned = Uint8Array.of(1, 2, 3);
  assert.equal(await native.transceive(handle, owned), owned.buffer);
  await native.writeNdefMessage(handle, [{ id: owned, type: owned, payload: owned, tnf: 1 }], [], []);
  assert.equal(sent.length, 4);
  for (const value of sent) assert.equal(value, owned);
});

test('NFC native replies and record fields reuse whole buffers and preserve exact subview bounds', async () => {
  const f = runtime('android');
  let events: any;
  const whole = Uint8Array.of(1, 2);
  const backing = Uint8Array.of(99, 3, 4, 88);
  f.nativeModules['./Nfc'].getHost = () => ({
    setEvents(value: any) { events = value; },
    async getAtqa() { return whole; },
    async getHistoricalBytes() { return whole; },
    async transceive() { return backing.subarray(1, 3); },
  });
  const native = f.load(service('nfc/native')).nativeNFC;
  let discovered: any;
  native.onDiscovered((event: any) => { discovered = event; });
  events.discovered({
    tagHandle: 'tag', id: whole, techs: ['NfcA'],
    messages: [{ id: whole, type: whole, payload: whole, tnf: 1 }],
  });
  assert.equal(discovered.id, whole.buffer);
  for (const field of ['id', 'type', 'payload']) assert.equal(discovered.messages[0][field], whole.buffer);
  const handle = { tagHandle: 'tag', tech: 'NfcA' };
  assert.equal(await native.getAtqa(handle), whole.buffer);
  assert.equal(await native.getHistoricalBytes(handle), whole.buffer);
  const reply = await native.transceive(handle, whole);
  assert.deepEqual([...new Uint8Array(reply)], [3, 4]);
  assert.equal(reply.byteLength, 2);
  assert.notEqual(reply, backing.buffer);
});

test('Android NDEF snapshots nested byte views and strings before asynchronous work', async () => {
  const f = runtime('android');
  let events: any;
  let records: any[];
  let texts: string[];
  let uris: string[];
  f.nativeModules['./Nfc'].getHost = () => ({
    setEvents(value: any) { events = value; },
    async startDiscovery() {},
    async writeNdefMessage(_handle: any, value: any[], urls: string[], strings: string[]) {
      records = value;
      uris = urls;
      texts = strings;
    },
  });
  const adapter = f.load(service('nfc/adapter')).createNFCAdapter();
  await adapter.startDiscovery();
  events.discovered({ tagHandle: 'tag', id: Uint8Array.of(1), techs: ['Ndef'], messages: [] });
  const bytes = Uint8Array.of(99, 1, 2, 3, 88);
  const input = {
    records: [{ id: bytes.subarray(1, 2), type: bytes.subarray(2, 3), payload: bytes.subarray(1, 4) }],
    texts: ['original'], uris: ['https://example.com'],
  };
  const write = adapter.getNdef().writeNdefMessage(input);
  bytes.fill(0);
  input.texts[0] = 'changed';
  input.uris[0] = 'https://example.org';
  input.records[0].payload = Uint8Array.of(7);
  await write;
  assert.deepEqual([...records![0].id], [1]);
  assert.deepEqual([...records![0].type], [2]);
  assert.deepEqual([...records![0].payload], [1, 2, 3]);
  assert.deepEqual([...texts!], ['original']);
  assert.deepEqual([...uris!], ['https://example.com']);
});

test('Android public NFC availability and permission paths preserve host state without prompts', async () => {
  for (const platform of ['android'] as const) {
    const f = runtime(platform);
    let calls = 0;
    let state = { supported: true, enabled: true, foreground: true, permissionGranted: false };
    f.nativeModules['./Nfc'].getHost = () => ({
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
  f.nativeModules['./Nfc'].getHost = () => ({
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
    f.nativeModules['./Nfc'].getHost = () => ({
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
