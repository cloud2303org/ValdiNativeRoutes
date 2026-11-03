import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../../../../../../../tools/valdi-rolldown/package.json', import.meta.url));
const ts = require('typescript');
const source = new URL('../', import.meta.url);
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function emitter() {
  const callbacks = new Map();
  return {
    on(type, callback) {
      if (!callbacks.has(type)) callbacks.set(type, new Set());
      callbacks.get(type).add(callback);
    },
    off(type, callback) {
      assert.equal(typeof callback, 'function', 'must remove only the owned callback');
      callbacks.get(type)?.delete(callback);
    },
    emit(type, value) { for (const callback of [...(callbacks.get(type) ?? [])]) callback(value); },
    list(type) { return [...(callbacks.get(type) ?? [])]; }
  };
}
function environment() {
  const lifecycle = new Map();
  const applicationStates = new Set();
  let nextLifecycle = 1;
  const application = {
    on(type, callback) {
      if (type === 'abilityLifecycle') {
        const id = nextLifecycle++;
        lifecycle.set(id, callback);
        return id;
      }
      assert.equal(type, 'applicationStateChange');
      applicationStates.add(callback);
    },
    off(type, callback) {
      if (type === 'abilityLifecycle') {
        assert.equal(typeof callback, 'number');
        lifecycle.delete(callback);
        return Promise.resolve();
      }
      assert.equal(type, 'applicationStateChange');
      assert.ok(applicationStates.has(callback), 'remove only the owned application listener');
      applicationStates.delete(callback);
    },
    foreground() {
      for (const callback of [...lifecycle.values()]) callback.onAbilityForeground({ context });
    },
    background() {
      for (const callback of [...applicationStates]) callback.onApplicationBackground();
    },
    listenerCount() { return lifecycle.size + applicationStates.size; }
  };
  const context = {
    applicationInfo: { name: 'test.bundle', uid: 20001234 },
    abilityInfo: { name: 'ReaderAbility', moduleName: 'feature' },
    getApplicationContext: () => application
  };
  const permissionStatus = new Map();
  const permissionCalls = [];
  let permissionRequest = async (permissions) => ({
    permissions, authResults: permissions.map(() => 0), dialogShownResults: permissions.map(() => true)
  });
  const manager = {
    getSelfPermissionStatus(name) { return permissionStatus.get(name) ?? 0; },
    requestPermissionsFromUser(owner, permissions) {
      assert.equal(owner, context);
      permissionCalls.push(permissions);
      return permissionRequest(permissions);
    }
  };
  const settingsCalls = [];
  const wifi = {
    ...emitter(),
    WifiSecurityType: { WIFI_SEC_TYPE_OPEN: 1, WIFI_SEC_TYPE_PSK: 3 },
    DeviceAddressType: { RANDOM_DEVICE_ADDRESS: 0 },
    ConnState: { CONNECTED: 4, DISCONNECTED: 6 },
    enabled: true,
    isWifiActive() { return this.enabled; },
    startScan() { this.scanStarts++; },
    scanStarts: 0,
    getScanInfoList() { return this.scans; },
    scans: [{ ssid: 'ap', bssid: 'virtual:1', rssi: -58, frequency: 5200, securityType: 3 }],
    linked: { ssid: '', bssid: '', rssi: -55, frequency: 5200, connState: 6 },
    async getLinkedInfo() { return this.linked; },
    nextCandidate: 1,
    configs: [],
    removed: [],
    connectCalls: [],
    async addCandidateConfig(config) { this.configs.push(config); return this.nextCandidate++; },
    async connectToCandidateConfig(config) { this.connectCalls.push(config); },
    async removeCandidateConfig(id) { this.removed.push(id); }
  };
  const controller = {
    ...emitter(),
    NfcState: { STATE_ON: 3, STATE_OFF: 1 },
    isNfcSupported: () => true,
    getNfcState: () => 3
  };
  const readerCalls = [];
  let reader;
  const sessions = new Map();
  function session(info, tech) {
    const key = `${info.uid.join(',')}:${tech}`;
    if (!sessions.has(key)) {
      sessions.set(key, {
        connected: false, resets: 0, sent: [], writes: [], timeout: 0,
        connect() { this.connected = true; },
        resetConnection() { this.resets++; this.connected = false; },
        isConnected() { return this.connected; },
        getMaxTransmitSize() { return 16; },
        setTimeout(timeout) { this.timeout = timeout; },
        async transmit(bytes) { this.sent.push(bytes); return [0x90, 0]; },
        getAtqa() { return [0x44, 0]; },
        getSak() { return 8; },
        getHistoricalBytes() { return [1, 2]; },
        async readNdef() {
          return { getNdefRecords: () => [{ id: [1], rtdType: [0x54], payload: [2, 101, 110, 65], tnf: 1 }] };
        },
        isNdefWritable: () => true,
        async writeNdef(message) { this.writes.push(message); }
      });
    }
    return sessions.get(key);
  }
  const tag = {
    NFC_A: 1, NFC_B: 2, ISO_DEP: 3, NFC_F: 4, NFC_V: 5,
    NDEF: 6, NDEF_FORMATABLE: 7, MIFARE_CLASSIC: 8, MIFARE_ULTRALIGHT: 9,
    on(type, element, technologies, callback) { readerCalls.push({ type, element, technologies }); reader = callback; },
    off(type, element, callback) {
      assert.equal(type, 'readerMode');
      assert.equal(callback, reader, 'detach exactly the registered reader callback');
      reader = undefined;
    },
    getNfcA: info => session(info, 'NfcA'), getNfcB: info => session(info, 'NfcB'),
    getNfcF: info => session(info, 'NfcF'), getNfcV: info => session(info, 'NfcV'),
    getIsoDep: info => session(info, 'IsoDep'), getNdef: info => session(info, 'Ndef'),
    getMifareClassic: info => session(info, 'MifareClassic'),
    getMifareUltralight: info => session(info, 'MifareUltralight'),
    getNdefFormatable: info => session(info, 'NdefFormatable'),
    ndef: {
      createNdefMessage(records) { return { getNdefRecords: () => records }; },
      makeUriRecord: uri => ({ id: [], rtdType: [0x55], payload: [...Buffer.from(uri)], tnf: 1 }),
      makeTextRecord: text => ({ id: [], rtdType: [0x54], payload: [...Buffer.from(text)], tnf: 1 })
    }
  };
  const kits = {
    '@kit.AbilityKit': {
      abilityAccessCtrl: {
        createAtManager: () => manager,
        PermissionStatus: { DENIED: -1, GRANTED: 0, NOT_DETERMINED: 1, INVALID: 2, RESTRICTED: 3 }
      }
    },
    '@kit.BasicServicesKit': { settings: { openAppDetailSettingsPage: (...args) => settingsCalls.push(args) } },
    '@kit.ArkTS': { util: { generateRandomUUID: randomUUID } },
    '@kit.ConnectivityKit': { wifiManager: wifi, tag, nfcController: controller }
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const code = ts.transpileModule(fs.readFileSync(new URL(`${name}.ets`, source), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const module = { exports: {} };
    cache.set(name, module.exports);
    const scopedRequire = id => id.startsWith('./') ? load(id.slice(2)) : kits[id] ?? assert.fail(`unexpected SDK import ${id}`);
    new Function('require', 'module', 'exports', code)(scopedRequire, module, module.exports);
    return module.exports;
  }
  const permission = () => {
    const result = new (load('HarmonyPermissionService').HarmonyPermissionService)(context);
    result.setActive(true);
    return result;
  };
  const wifiService = () => {
    const result = new (load('HarmonyWifiService').HarmonyWifiService)(context, permission());
    result.setActive(true);
    return result;
  };
  const nfcService = () => {
    const result = new (load('HarmonyNfcService').HarmonyNfcService)(context, permission());
    result.setActive(true);
    return result;
  };
  return {
    context, application, permissionStatus, permissionCalls, settingsCalls, wifi, controller, tag, readerCalls, session,
    permission, wifiService, nfcService, load,
    setPermissionRequest: callback => { permissionRequest = callback; },
    reader: () => reader,
    discover: info => reader(undefined, info)
  };
}

function deferredLifecycleOff(env) {
  const gate = deferred();
  const off = env.application.off.bind(env.application);
  const on = env.application.on.bind(env.application);
  const attempts = [], registrations = [];
  env.application.on = (kind, callback) => {
    const id = on(kind, callback);
    if (kind === 'abilityLifecycle') registrations.push({ id, callback });
    return id;
  };
  env.application.off = (kind, id) => {
    if (kind === 'abilityLifecycle') {
      attempts.push(id);
      if (attempts.length === 1) return gate.promise.then(() => off(kind, id));
    }
    return off(kind, id);
  };
  return { ...gate, attempts, registrations };
}

test('permission aliases preserve shared grant shape; normal grants do not prompt; settings uses owner', async () => {
  const env = environment();
  env.permissionStatus.set('ohos.permission.ACCESS_BLUETOOTH', 1);
  const permission = env.permission();
  assert.deepEqual(await permission.requestMultiple(['bluetooth', 'ohos.permission.GET_WIFI_INFO']), [
    { permission: 'bluetooth', result: 'granted' }, { permission: 'ohos.permission.GET_WIFI_INFO', result: 'granted' }
  ]);
  assert.deepEqual(env.permissionCalls, [['ohos.permission.ACCESS_BLUETOOTH']]);
  await permission.openSettings();
  assert.deepEqual(env.settingsCalls, [[env.context, 'test.bundle']]);
  permission.close();
});

test('permission denied versus never ask again uses actual dialog result; invalid requests reject', async () => {
  const env = environment();
  env.permissionStatus.set('ohos.permission.ACCESS_BLUETOOTH', 1);
  const permission = env.permission();
  for (const [shown, expected] of [[true, 'denied'], [false, 'never_ask_again']]) {
    env.setPermissionRequest(async permissions => ({ permissions, authResults: [-1], dialogShownResults: [shown] }));
    assert.equal((await permission.requestMultiple(['bluetooth']))[0].result, expected);
  }
  env.setPermissionRequest(async permissions => ({ permissions, authResults: [2], errorReasons: [2] }));
  await assert.rejects(permission.requestMultiple(['bluetooth']), /E_PERMISSION_INVALID/);
  env.permissionStatus.set('ohos.permission.NFC_TAG', 2);
  await assert.rejects(permission.check('ohos.permission.NFC_TAG'), /E_PERMISSION_INVALID/);
  await assert.rejects(permission.check('android.permission.BLUETOOTH_SCAN'), /E_PERMISSION_INVALID/);
  permission.close();
});

test('permission close rejects a pending dialog immediately and ignores late completion', async () => {
  const env = environment();
  const dialog = deferred();
  env.permissionStatus.set('ohos.permission.ACCESS_BLUETOOTH', 1);
  env.setPermissionRequest(() => dialog.promise);
  const permission = env.permission();
  const request = permission.requestPermission('bluetooth');
  await flush();
  await assert.rejects(permission.requestPermission('bluetooth'), /E_PERMISSION_DUPLICATE_REQUEST/);
  permission.close();
  await assert.rejects(request, /E_PERMISSION_SESSION_RELEASED/);
  dialog.resolve({ permissions: ['ohos.permission.ACCESS_BLUETOOTH'], authResults: [0] });
  await flush();
  await assert.rejects(permission.check('bluetooth'), /E_PERMISSION_SESSION_RELEASED/);
});

test('Wi-Fi scan waits for completion, returns actual SDK results, owns callbacks across two services', async () => {
  const env = environment();
  const first = env.wifiService(), second = env.wifiService();
  const lists = [];
  first.setEvents({ wifiList: list => lists.push(list), wifiConnected: () => {} });
  await first.startWifi();
  await second.startWifi();
  const scanning = first.getWifiList();
  await flush();
  assert.equal(env.wifi.scanStarts, 1);
  assert.equal(lists.length, 0);
  env.wifi.emit('wifiScanStateChange', 1);
  await scanning;
  assert.deepEqual(lists[0], [{ SSID: 'ap', BSSID: 'virtual:1', secure: true, signalStrength: -58, frequency: 5200 }]);
  await first.stopWifi();
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  assert.equal(env.wifi.list('wifiScanStateChange').length, 0);
  assert.deepEqual(await first.getLocationPermissionState(), { status: 'granted', canAskAgain: false });
  first.close(); second.close();
});

test('a late callback from an old scan cannot settle or detach the next scan', async () => {
  const env = environment();
  const service = env.wifiService();
  let lists = 0;
  service.setEvents({ wifiList: () => { lists++; }, wifiConnected: () => {} });
  await service.startWifi();
  const first = service.getWifiList(); await flush();
  const previous = env.wifi.list('wifiScanStateChange')[0];
  env.wifi.emit('wifiScanStateChange', 1); await first;
  const second = service.getWifiList(); await flush();
  previous(1);
  assert.equal(lists, 1);
  assert.equal(env.wifi.list('wifiScanStateChange').length, 1);
  env.wifi.emit('wifiScanStateChange', 1); await second;
  assert.equal(lists, 2);
  service.close();
});

test('failed coordinator Wi-Fi unregistration keeps its exact handle across closed-graph reentry', async () => {
  const env = environment();
  const off = env.wifi.off.bind(env.wifi);
  const stateAttempts = [];
  let fail = true;
  env.wifi.off = (kind, callback) => {
    if (kind === 'wifiStateChange') {
      stateAttempts.push(callback);
      if (fail) {
        fail = false;
        throw Object.assign(new Error('transient off failure'), { code: 2501000 });
      }
    }
    off(kind, callback);
  };
  const first = env.wifiService();
  await first.startWifi();
  const oldState = env.wifi.list('wifiStateChange')[0];
  const oldConnection = env.wifi.list('wifiConnectionChange')[0];
  first.close();
  await flush();
  assert.deepEqual(stateAttempts, [oldState]);
  assert.deepEqual(env.wifi.list('wifiStateChange'), [oldState], 'failed off keeps the registered handle owned');
  assert.equal(env.application.listenerCount(), 2, 'recovery remains registered until SDK off succeeds');
  await flush();
  assert.equal(stateAttempts.length, 1, 'off failure alone does not retry');

  const second = env.wifiService();
  let events = 0;
  second.setEvents({ wifiConnected: () => { events++; }, wifiList: () => { events++; } });
  await second.startWifi();
  await flush();
  assert.deepEqual(stateAttempts, [oldState, oldState], 'retry uses the exact failed SDK handle');
  assert.equal(env.wifi.list('wifiStateChange').length, 1, 'reentry does not accumulate coordinator subscriptions');
  oldState(1);
  oldConnection(1);
  await flush();
  assert.equal(events, 0);
  assert.equal(stateAttempts.length, 2, 'confirmed retired callbacks cannot trigger more unregistration');
  second.close();
  await flush();
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(env.application.listenerCount(), 0);
});

test('failed connection off is inert, retained across reentry, and prevents replacement accumulation', async () => {
  const env = environment();
  const off = env.wifi.off.bind(env.wifi);
  const attempts = [];
  let fail = true;
  env.wifi.off = (kind, callback) => {
    if (kind === 'wifiConnectionChange') {
      attempts.push(callback);
      if (fail) throw Object.assign(new Error('transient off failure'), { code: 2501000 });
    }
    off(kind, callback);
  };
  const service = env.wifiService();
  let events = 0;
  service.setEvents({ wifiConnected: () => { events++; }, wifiList: () => {} });
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.startWifi();
  const old = env.wifi.list('wifiConnectionChange')[0];
  await service.stopWifi();
  await flush();
  assert.deepEqual(attempts, [old]);
  old(1); await flush();
  assert.equal(events, 0);
  assert.equal(attempts.length, 1, 'late client callbacks do not drive retry loops');
  await assert.rejects(service.startWifi(), /E_WIFI_SYSTEM_INTERNAL:previous SDK callback unregistration pending/);
  await flush();
  assert.deepEqual(attempts, [old, old]);
  assert.deepEqual(env.wifi.list('wifiConnectionChange'), [old], 'failed reentry cannot register another callback');
  fail = false;
  await service.startWifi();
  assert.deepEqual(attempts, [old, old, old]);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  assert.notEqual(env.wifi.list('wifiConnectionChange')[0], old);
  old(1); await flush();
  assert.equal(events, 0);
  env.wifi.emit('wifiConnectionChange', 1); await flush();
  assert.equal(events, 1);
  service.close();
  old(1);
  await flush();
  assert.equal(events, 1);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(env.application.listenerCount(), 0);
});

test('failed scan off retains an inert handle and retries that handle before the next scan subscribes', async () => {
  const env = environment();
  const off = env.wifi.off.bind(env.wifi);
  const attempts = [];
  let fail = true;
  env.wifi.off = (kind, callback) => {
    if (kind === 'wifiScanStateChange') {
      attempts.push(callback);
      if (fail) {
        fail = false;
        throw Object.assign(new Error('transient off failure'), { code: 2501000 });
      }
    }
    off(kind, callback);
  };
  const service = env.wifiService();
  let lists = 0;
  service.setEvents({ wifiConnected: () => {}, wifiList: () => { lists++; } });
  await service.startWifi();
  const first = service.getWifiList(); await flush();
  const old = env.wifi.list('wifiScanStateChange')[0];
  env.wifi.emit('wifiScanStateChange', 1);
  await first; await flush();
  assert.deepEqual(attempts, [old]);
  assert.deepEqual(env.wifi.list('wifiScanStateChange'), [old]);
  old(1); old(0); await flush();
  assert.equal(lists, 1);
  assert.equal(attempts.length, 1);
  const second = service.getWifiList(); await flush();
  assert.deepEqual(attempts, [old, old]);
  assert.equal(env.wifi.list('wifiScanStateChange').length, 1);
  assert.notEqual(env.wifi.list('wifiScanStateChange')[0], old);
  old(1); await flush();
  assert.equal(lists, 1);
  env.wifi.emit('wifiScanStateChange', 1);
  await second; await flush();
  assert.equal(lists, 2);
  assert.equal(env.wifi.list('wifiScanStateChange').length, 0);
  service.close();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
});

test('asynchronously rejected lifecycle off retains its callback ID until a later recovery succeeds', async () => {
  const env = environment();
  const off = env.application.off.bind(env.application);
  const attempts = [];
  let fail = true;
  env.application.off = (kind, callback) => {
    if (kind === 'abilityLifecycle') {
      attempts.push(callback);
      if (fail) {
        fail = false;
        return Promise.reject(Object.assign(new Error('transient lifecycle off failure'), { code: 401 }));
      }
    }
    return off(kind, callback);
  };
  const service = env.wifiService();
  await service.startWifi();
  service.close();
  await flush();
  assert.equal(attempts.length, 1);
  assert.equal(env.application.listenerCount(), 1, 'failed lifecycle removal remains owned');
  await flush();
  assert.equal(attempts.length, 1);
  env.application.foreground();
  await flush();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1], 'retry retains the same SDK callback ID');
  assert.equal(env.application.listenerCount(), 0);
});

test('repeated close is an explicit retry for failed SDK off without reviving the closed client', async () => {
  const env = environment();
  const off = env.wifi.off.bind(env.wifi);
  let failures = 1;
  const attempts = [];
  env.wifi.off = (kind, callback) => {
    if (kind === 'wifiConnectionChange') {
      attempts.push(callback);
      if (failures-- > 0) throw Object.assign(new Error('transient off failure'), { code: 2501000 });
    }
    off(kind, callback);
  };
  const service = env.wifiService();
  let events = 0;
  service.setEvents({ wifiConnected: () => { events++; }, wifiList: () => {} });
  await service.startWifi();
  const old = env.wifi.list('wifiConnectionChange')[0];
  service.close();
  await flush();
  assert.deepEqual(attempts, [old]);
  old(1); await flush();
  assert.equal(events, 0);
  assert.deepEqual(attempts, [old]);
  service.close();
  await flush();
  assert.deepEqual(attempts, [old, old]);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
  assert.equal(env.application.listenerCount(), 0);
  service.close();
  old(1);
  await flush();
  assert.equal(events, 0);
  assert.deepEqual(attempts, [old, old]);
});

test('awaited stop/start waits for successful lifecycle off and registers exactly one replacement', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const service = env.wifiService();
  let events = 0;
  service.setEvents({ wifiConnected: () => { events++; }, wifiList: () => {} });
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.startWifi();
  const oldConnection = env.wifi.list('wifiConnectionChange')[0];
  await service.stopWifi();
  assert.equal(gate.attempts.length, 1);
  let state = 'pending';
  const restart = service.startWifi();
  restart.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
  await flush();
  assert.equal(state, 'pending');
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(gate.registrations.length, 1, 'no replacement lifecycle listener while old off is pending');
  env.application.foreground();
  await flush();
  assert.equal(state, 'pending');
  assert.equal(gate.attempts.length, 1, 'queued recovery cannot start a second lifecycle off');
  gate.resolve();
  await restart;
  await flush();
  assert.equal(state, 'fulfilled');
  assert.equal(gate.attempts.length, 1, 'readiness protects the registration gap after successful settlement');
  assert.equal(gate.registrations.length, 2);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  oldConnection(1);
  gate.registrations[0].callback.onAbilityForeground({ context: env.context });
  await flush();
  assert.equal(events, 0);
  service.close();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
});

test('immediate cross-graph replacement awaits old lifecycle off without artificial pending errors', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const Graph = env.load('HarmonySystemServices').HarmonySystemServices;
  const first = new Graph(env.context);
  first.setActive(true);
  await first.wifi.startWifi();
  first.close();
  await flush();
  assert.equal(gate.attempts.length, 1);
  const secondContext = { ...env.context, applicationInfo: { ...env.context.applicationInfo },
    getApplicationContext: () => ({ ...env.application }) };
  const second = new Graph(secondContext);
  second.setActive(true);
  let state = 'pending';
  const started = second.wifi.startWifi();
  started.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
  await flush();
  assert.equal(state, 'pending');
  assert.equal(gate.registrations.length, 1);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  gate.resolve();
  await started;
  assert.equal(state, 'fulfilled');
  assert.equal(gate.registrations.length, 2);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  assert.equal(env.application.listenerCount(), 2);
  second.close();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
});

test('deferred lifecycle off rejection rejects the waiting start and retains its failed SDK handle', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const service = env.wifiService();
  await service.startWifi();
  await service.stopWifi();
  let state = 'pending';
  const restart = service.startWifi();
  restart.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
  await flush();
  assert.equal(state, 'pending');
  gate.reject(Object.assign(new Error('actual delayed SDK off failure'), { code: 401 }));
  await assert.rejects(restart, /E_WIFI_SYSTEM_INTERNAL:SDK lifecycle callback unregistration failed/);
  await flush();
  assert.equal(state, 'rejected');
  assert.equal(gate.attempts.length, 1, 'failure alone does not trigger another off');
  assert.equal(gate.registrations.length, 1);
  assert.equal(env.application.listenerCount(), 1, 'failed SDK ID is still registered and owned');
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  // A later explicit start can safely reuse the lifecycle listener whose off
  // failed, instead of registering a second listener or hiding the rejection.
  await service.startWifi();
  assert.equal(gate.registrations.length, 1);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  service.close();
  await flush();
  assert.deepEqual(gate.attempts, [gate.registrations[0].id, gate.registrations[0].id]);
  assert.equal(env.application.listenerCount(), 0);
});

for (const action of ['stop', 'background', 'close']) {
  test(`lifecycle readiness revalidates ${action} while start is waiting and does not register stale callbacks`, async () => {
    const env = environment();
    const gate = deferredLifecycleOff(env);
    const service = env.wifiService();
    await service.startWifi();
    await service.stopWifi();
    const restart = service.startWifi();
    await flush();
    assert.equal(gate.registrations.length, 1);
    if (action === 'stop') await service.stopWifi();
    if (action === 'background') service.setActive(false);
    if (action === 'close') service.close();
    gate.resolve();
    await assert.rejects(restart, action === 'background' ? /E_WIFI_BACKGROUND/ : /E_WIFI_NOT_INITIALIZED/);
    await flush();
    assert.equal(gate.registrations.length, 1);
    assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
    assert.equal(env.application.listenerCount(), 0);
    if (action !== 'close') {
      service.setActive(true);
      await service.startWifi();
      assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
      service.close();
      await flush();
      assert.equal(env.application.listenerCount(), 0);
    }
  });
}

test('readiness rechecks radio state after successful lifecycle removal', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const service = env.wifiService();
  await service.startWifi();
  await service.stopWifi();
  const restart = service.startWifi();
  await flush();
  env.wifi.enabled = false;
  gate.resolve();
  await assert.rejects(restart, /E_WIFI_DISABLED/);
  await flush();
  assert.equal(gate.registrations.length, 1);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(env.application.listenerCount(), 0);
  env.wifi.enabled = true;
  await service.startWifi();
  service.close();
  await flush();
});

test('concurrent starts sharing a pending lifecycle removal register one client callback', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const service = env.wifiService();
  await service.startWifi();
  await service.stopWifi();
  const first = service.startWifi(), second = service.startWifi();
  await flush();
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  assert.equal(gate.registrations.length, 2);
  service.close();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
});

test('a newer start cannot revive a start cancelled by stop while both await lifecycle settlement', async () => {
  const env = environment();
  const gate = deferredLifecycleOff(env);
  const service = env.wifiService();
  await service.startWifi();
  await service.stopWifi();
  const cancelled = service.startWifi();
  await flush();
  await service.stopWifi();
  const replacement = service.startWifi();
  await flush();
  const results = Promise.allSettled([cancelled, replacement]);
  gate.resolve();
  const [oldResult, newResult] = await results;
  assert.equal(oldResult.status, 'rejected');
  assert.match(oldResult.reason.message, /E_WIFI_NOT_INITIALIZED/);
  assert.equal(newResult.status, 'fulfilled');
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  assert.equal(gate.registrations.length, 2);
  service.close();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
});

test('stopping a session cancels an asynchronous start before listener registration', async () => {
  const env = environment();
  const service = env.wifiService();
  const pending = service.startWifi();
  await service.stopWifi();
  await assert.rejects(pending, /E_WIFI_NOT_INITIALIZED/);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  service.close();
  const nfc = env.nfcService();
  const discovery = nfc.startDiscovery();
  await nfc.stopDiscovery();
  await assert.rejects(discovery, /E_NFC_13018/);
  assert.equal(env.reader(), undefined);
  nfc.dispose();
});

test('Wi-Fi connection success requires user approval AND matching actual association', async () => {
  const env = environment();
  const approval = deferred();
  env.wifi.connectToCandidateConfig = config => { env.wifi.connectCalls.push(config); return approval.promise; };
  const service = env.wifiService();
  await service.startWifi();
  let resolved = false;
  const operation = service.connectWifi({
    SSID: 'ap', BSSID: 'virtual:1', password: '12345678', maunal: false, partialInfo: false
  }).then(value => { resolved = true; return value; });
  await flush();
  assert.equal(env.wifi.configs[0].bssidType, env.wifi.DeviceAddressType.RANDOM_DEVICE_ADDRESS);
  assert.equal(env.wifi.connectCalls[0].withUserAction, true);
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  env.wifi.emit('wifiConnectionChange', 1);
  await flush();
  assert.equal(resolved, false);
  approval.resolve();
  await operation;
  assert.equal(resolved, true);
  assert.equal((await service.getConnectedWifi(true)).BSSID, undefined);
  service.close();
  await flush();
  assert.deepEqual(env.wifi.removed, [1]);
});

test('Wi-Fi retains candidate ownership after synchronous removal failure and retries on foreground', async () => {
  const env = environment();
  const calls = [];
  let fail = true;
  env.wifi.removeCandidateConfig = id => {
    calls.push(id);
    if (fail) throw Object.assign(new Error('radio off'), { code: 2501001 });
    return Promise.resolve();
  };
  const service = env.wifiService();
  let clientEvents = 0;
  service.setEvents({ wifiConnected: () => { clientEvents++; }, wifiList: () => {} });
  await service.startWifi();
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.connectWifi({ SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false });
  await service.stopWifi();
  await flush();
  assert.deepEqual(calls, [1], 'one attempt even when stop and connect cleanup overlap');
  assert.ok(env.application.listenerCount() > 0);
  service.setActive(false);
  await service.stopWifi();
  await flush();
  assert.deepEqual(calls, [1], 'no removal while background');
  fail = false;
  service.setActive(true);
  env.application.foreground();
  await flush();
  assert.deepEqual(calls, [1, 1]);
  assert.equal(env.application.listenerCount(), 0);
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
  assert.equal(clientEvents, 0, 'cleanup cannot emit connection events or restart the session');
  service.close();
  await flush();
  assert.deepEqual(calls, [1, 1], 'confirmed removal is never repeated by close');
});

test('Wi-Fi retains asynchronously rejected removals and retries on start/stop without duplicates', async () => {
  const env = environment();
  const calls = [];
  let result = deferred();
  env.wifi.removeCandidateConfig = id => { calls.push(id); return result.promise; };
  const service = env.wifiService();
  await service.startWifi();
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.connectWifi({ SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false });
  await service.stopWifi();
  await service.stopWifi();
  await flush();
  assert.deepEqual(calls, [1]);
  const first = result;
  const second = deferred();
  result = second;
  first.reject(Object.assign(new Error('temporary failure'), { code: 2501000 }));
  await flush();
  await service.startWifi();
  await flush();
  assert.deepEqual(calls, [1, 1]);
  await service.stopWifi();
  await flush();
  assert.deepEqual(calls, [1, 1], 'in-flight retry stays unique across start/stop');
  const third = deferred();
  result = third;
  second.reject(Object.assign(new Error('radio off'), { code: 2501001 }));
  await flush();
  assert.deepEqual(calls, [1, 1, 1]);
  third.resolve();
  await flush();
  assert.equal(env.application.listenerCount(), 0);
  service.close();
});

test('two runtime graphs cannot reuse an app SDK candidate ID while a closed graph still owns its removal', async () => {
  const env = environment();
  const Graph = env.load('HarmonySystemServices').HarmonySystemServices;
  const first = new Graph(env.context);
  const firstRemoval = deferred();
  const retryRemoval = deferred();
  let nextRemoval = firstRemoval;
  let osGeneration = 0;
  let osPresent = false;
  const additions = [], removals = [];
  env.wifi.addCandidateConfig = async config => {
    additions.push(config.ssid);
    osGeneration++;
    osPresent = true;
    return 7; // SDK updates the same app/SSID configuration with the same ID.
  };
  env.wifi.removeCandidateConfig = id => {
    const generation = osGeneration;
    removals.push({ id, generation });
    return nextRemoval.promise.then(() => {
      assert.equal(osGeneration, generation, 'a different graph must not replace an in-flight removal target');
      osPresent = false;
    });
  };
  const params = { SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false };
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  first.setActive(true);
  await first.wifi.startWifi();
  await first.wifi.connectWifi(params);
  first.close();
  await flush();
  assert.deepEqual(removals, [{ id: 7, generation: 1 }]);
  const staleRecovery = env.wifi.list('wifiStateChange')[0];

  // Separate Context and ApplicationContext wrappers: scope must use actual
  // UID/bundle identity, never JS wrapper identity or RuntimeHost identity.
  const otherWrapper = { ...env.application };
  const otherContext = { ...env.context, applicationInfo: { ...env.context.applicationInfo },
    getApplicationContext: () => otherWrapper };
  const second = new Graph(otherContext);
  second.setActive(true);
  await second.wifi.startWifi();
  await assert.rejects(second.wifi.connectWifi(params), /E_WIFI_CONNECTION_OWNED/);
  assert.deepEqual(additions, ['ap']);
  assert.equal(osPresent, true);
  assert.equal(env.application.listenerCount(), 2, 'one SDK cleanup owner for the shared app resource');

  nextRemoval = retryRemoval;
  firstRemoval.reject(Object.assign(new Error('old radio state'), { code: 2501001 }));
  await flush();
  assert.deepEqual(removals, [{ id: 7, generation: 1 }, { id: 7, generation: 1 }]);
  await assert.rejects(second.wifi.connectWifi(params), /E_WIFI_CONNECTION_OWNED/);
  retryRemoval.resolve();
  await flush();
  assert.equal(osPresent, false);
  assert.equal(env.application.listenerCount(), 2, 'the new graph still owns an active connection subscription');

  await second.wifi.connectWifi(params);
  assert.deepEqual(additions, ['ap', 'ap']);
  assert.equal(osPresent, true);
  staleRecovery(1);
  await flush();
  assert.equal(removals.length, 2, 'a closed graph cannot remove the new graph candidate after ID reuse');
  assert.equal(osPresent, true);
  nextRemoval = { promise: Promise.resolve() };
  second.close();
  await flush();
  assert.deepEqual(removals[2], { id: 7, generation: 2 });
  assert.equal(osPresent, false);
  assert.equal(env.application.listenerCount(), 0);
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
});

test('eligible recovery during a pending removal is latched into exactly one retry after rejection', async () => {
  const env = environment();
  const service = env.wifiService();
  const first = deferred(), retry = deferred();
  let result = first;
  const removals = [];
  env.wifi.removeCandidateConfig = id => { removals.push(id); return result.promise; };
  await service.startWifi();
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.connectWifi({ SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false });
  service.close();
  await flush();
  assert.deepEqual(removals, [1]);
  env.application.background();
  env.wifi.enabled = false;
  env.application.foreground();
  env.wifi.enabled = true;
  env.wifi.emit('wifiStateChange', 1);
  env.application.foreground();
  await flush();
  assert.deepEqual(removals, [1], 'signals do not overlap an in-flight SDK removal');
  result = retry;
  first.reject(Object.assign(new Error('old disabled attempt'), { code: 2501001 }));
  await flush();
  assert.deepEqual(removals, [1, 1], 'one retry consumes all newer eligible recovery signals');
  retry.reject(Object.assign(new Error('still unavailable'), { code: 2501000 }));
  await flush();
  await flush();
  assert.deepEqual(removals, [1, 1], 'failure without a new recovery signal cannot busy-loop');
  result = { promise: Promise.resolve() };
  env.wifi.emit('wifiStateChange', 1);
  await flush();
  assert.deepEqual(removals, [1, 1, 1]);
  assert.equal(env.application.listenerCount(), 0);
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
});

test('closed Wi-Fi graph retains late candidate cleanup until real foreground and radio recovery', async () => {
  const env = environment();
  const add = deferred();
  env.wifi.addCandidateConfig = () => add.promise;
  const attempts = [];
  let fail = true;
  env.wifi.removeCandidateConfig = id => {
    attempts.push(id);
    return fail ? Promise.reject(Object.assign(new Error('disabled'), { code: 2501001 })) : Promise.resolve();
  };
  const service = env.wifiService();
  let events = 0;
  service.setEvents({ wifiConnected: () => { events++; }, wifiList: () => { events++; } });
  await service.startWifi();
  const connect = service.connectWifi({ SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false });
  await flush();
  env.application.background();
  service.setActive(false);
  service.close();
  await assert.rejects(connect, /E_WIFI_NOT_INITIALIZED/);
  add.resolve(42);
  await flush();
  assert.deepEqual(attempts, [], 'late add is retained but removal needs foreground');
  assert.ok(env.application.listenerCount() > 0);
  env.wifi.enabled = false;
  env.application.foreground();
  await flush();
  assert.deepEqual(attempts, [], 'foreground alone is insufficient while Wi-Fi is disabled');
  env.wifi.enabled = true;
  env.wifi.emit('wifiStateChange', 1);
  await flush();
  assert.deepEqual(attempts, [42]);
  fail = false;
  env.wifi.emit('wifiStateChange', 1);
  env.application.foreground();
  await flush();
  assert.deepEqual(attempts, [42, 42], 'radio/foreground signals share one in-flight removal');
  assert.equal(env.application.listenerCount(), 0);
  assert.equal(env.wifi.list('wifiStateChange').length, 0);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
  assert.equal(env.wifi.connectCalls.length, 0);
  assert.equal(events, 0);
  await assert.rejects(service.startWifi(), /E_WIFI_NOT_INITIALIZED/);
  service.close();
  await flush();
  assert.deepEqual(attempts, [42, 42]);
});

test('Wi-Fi does not let retired allocation or removal race a new candidate connection', async () => {
  const env = environment();
  const add = deferred();
  const remove = deferred();
  env.wifi.addCandidateConfig = () => add.promise;
  env.wifi.removeCandidateConfig = id => { env.wifi.removed.push(id); return remove.promise; };
  const service = env.wifiService();
  const params = { SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false };
  await service.startWifi();
  const first = service.connectWifi(params);
  await flush();
  await service.stopWifi();
  await assert.rejects(first, /E_WIFI_NOT_INITIALIZED/);
  await service.startWifi();
  await assert.rejects(service.connectWifi(params), /E_WIFI_CONNECTION_OWNED/);
  add.resolve(42);
  await flush();
  await assert.rejects(service.connectWifi(params), /E_WIFI_CONNECTION_OWNED/);
  assert.deepEqual(env.wifi.removed, [42]);
  remove.resolve();
  await flush();
  env.wifi.addCandidateConfig = async config => { env.wifi.configs.push(config); return 43; };
  env.wifi.linked = { ssid: 'ap', bssid: 'virtual:1', connState: 4, rssi: -55, frequency: 5200 };
  await service.connectWifi(params);
  assert.equal(env.wifi.connectCalls.length, 1);
  service.close();
  await flush();
  assert.deepEqual(env.wifi.removed, [42, 43]);
  assert.equal(env.application.listenerCount(), 0);
});

test('Wi-Fi cancellation rejects scan/connect and removes late candidate without new connection', async () => {
  const env = environment();
  const add = deferred();
  env.wifi.addCandidateConfig = () => add.promise;
  const service = env.wifiService();
  await service.startWifi();
  const scan = service.getWifiList();
  const connect = service.connectWifi({ SSID: 'ap', BSSID: '', password: 'test-pass-123', maunal: false, partialInfo: false });
  await flush();
  const oldCallback = env.wifi.list('wifiConnectionChange')[0];
  service.close();
  await assert.rejects(scan, /E_WIFI_NOT_INITIALIZED/);
  await assert.rejects(connect, /E_WIFI_NOT_INITIALIZED/);
  add.resolve(42);
  oldCallback(1);
  await flush();
  assert.deepEqual(env.wifi.removed, [42]);
  assert.equal(env.wifi.connectCalls.length, 0);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
});

test('Wi-Fi maps user rejection exactly, redacts SDK text, and rejects unsupported picker list', async () => {
  const env = environment();
  env.wifi.connectToCandidateConfig = async () => { throw Object.assign(new Error('secret-password'), { code: 2501006 }); };
  const service = env.wifiService();
  await service.startWifi();
  await assert.rejects(service.connectWifi({
    SSID: 'ap', BSSID: '', password: '12345678', maunal: false, partialInfo: false
  }), error => error.message.startsWith('E_WIFI_USER_DENIED:') && !error.message.includes('secret-password'));
  await assert.rejects(service.setWifiList([]), /E_WIFI_SET_WIFI_LIST_UNSUPPORTED/);
  service.close();
});

test('NFC derives reader identity from ability/module and returns actual typed bytes and metadata', async () => {
  const env = environment();
  const service = env.nfcService();
  let discovered;
  service.setEvents({ discovered: event => { discovered = event; }, discoveryStateChange: () => {} });
  assert.deepEqual(await service.getAvailability(), { supported: true, enabled: true, foreground: true, permissionGranted: true });
  await service.startDiscovery();
  assert.deepEqual(env.readerCalls[0].element, { bundleName: 'test.bundle', abilityName: 'ReaderAbility', moduleName: 'feature' });
  const info = { uid: [0, 0xff], technology: [1, 3], supportedProfiles: [] };
  env.discover(info);
  await flush();
  assert.deepEqual(discovered.id, new Uint8Array([0, 0xff]));
  assert.ok(discovered.techs.includes('android.nfc.tech.NfcA'));
  const handle = { tagHandle: discovered.tagHandle, tech: 'NfcA' };
  await service.connect(handle);
  assert.equal(await service.isConnected(handle), true);
  assert.deepEqual(await service.getAtqa(handle), new Uint8Array([0x44, 0]));
  assert.equal(await service.getSak(handle), 8);
  assert.equal(await service.getMaxTransceiveLength(handle), 16);
  await service.setTimeout(handle, 250);
  assert.equal(env.session(info, 'NfcA').timeout, 250);
  assert.deepEqual(await service.transceive(handle, new Uint8Array([0, 255])), new Uint8Array([0x90, 0]));
  assert.deepEqual(env.session(info, 'NfcA').sent[0], [0, 255]);
  await assert.rejects(service.transceive(handle, new Uint8Array(17)), /E_NFC_13011/);
  await service.close(handle);
  await assert.rejects(service.transceive(handle, new Uint8Array([1])), /E_NFC_13023/);
  service.dispose();
});

test('NFC handle close cancels blocked I/O; new tags invalidate old handles and late readers are ignored', async () => {
  const env = environment();
  const service = env.nfcService();
  const events = [];
  service.setEvents({ discovered: value => events.push(value), discoveryStateChange: () => {} });
  await service.startDiscovery();
  const info = { uid: [1], technology: [1], supportedProfiles: [] };
  env.discover(info); await flush();
  const handle = { tagHandle: events[0].tagHandle, tech: 'NfcA' };
  await service.connect(handle);
  const io = deferred();
  env.session(info, 'NfcA').transmit = () => io.promise;
  const operation = service.transceive(handle, new Uint8Array([1]));
  await flush();
  await service.close(handle);
  await assert.rejects(operation, /E_NFC_13023/);
  io.resolve([2]);
  env.discover({ uid: [2], technology: [1], supportedProfiles: [] }); await flush();
  await assert.rejects(service.connect(handle), /E_NFC_13013/);
  const oldReader = env.reader();
  await service.stopDiscovery();
  oldReader(undefined, info);
  await flush();
  assert.equal(events.length, 2);
  assert.equal(env.controller.list('nfcStateChange').length, 0);
  service.dispose();
});

test('NFC reads NDEF from the discovered tag and writes typed records using the retained tag session', async () => {
  const env = environment();
  const service = env.nfcService();
  let event;
  service.setEvents({ discovered: value => { event = value; }, discoveryStateChange: () => {} });
  await service.startDiscovery();
  const info = { uid: [7], technology: [1, 6], supportedProfiles: [] };
  env.discover(info); await flush();
  assert.deepEqual(event.messages[0].type, new Uint8Array([0x54]));
  const handle = { tagHandle: event.tagHandle, tech: 'Ndef' };
  await service.connect(handle);
  await service.writeNdefMessage(handle, [
    { id: new Uint8Array([1]), type: new Uint8Array([0x54]), payload: new Uint8Array([0, 255]), tnf: 1 }
  ], ['https://example.test'], ['hello']);
  const records = env.session(info, 'Ndef').writes[0].getNdefRecords();
  assert.deepEqual(records[0].payload, [0, 255]);
  assert.equal(records.length, 3);
  await assert.rejects(service.transceive(handle, new Uint8Array([1])), /E_NFC_13024/);
  service.dispose();
});

test('NFC reports hardware/switch/authorization separately and never requests enable/disable privileges', async () => {
  const env = environment();
  const service = env.nfcService();
  env.controller.isNfcSupported = () => false;
  await assert.rejects(service.startDiscovery(), /E_NFC_13000/);
  env.controller.isNfcSupported = () => true;
  env.controller.getNfcState = () => 1;
  await assert.rejects(service.startDiscovery(), /E_NFC_13001/);
  env.controller.getNfcState = () => 3;
  env.permissionStatus.set('ohos.permission.NFC_TAG', 2);
  await assert.rejects(service.startDiscovery(), /E_NFC_13019/);
  service.dispose();
});

test('composed graphs retain their ability and share exactly one injected permission authority per graph', async () => {
  const env = environment();
  const Graph = env.load('HarmonySystemServices').HarmonySystemServices;
  const first = new Graph(env.context), second = new Graph(env.context);
  assert.equal(first.version, 1);
  assert.equal(first.ble.permission, first.permissions);
  assert.equal(first.wifi.permissions, first.permissions);
  assert.equal(first.nfc.permissions, first.permissions);
  assert.notEqual(first.permissions, second.permissions);
  first.setActive(true);
  second.setActive(true);
  await second.wifi.startWifi();
  first.close();
  first.close();
  await assert.rejects(first.permissions.check('bluetooth'), /E_PERMISSION_SESSION_RELEASED/);
  assert.equal(await second.permissions.check('bluetooth'), true);
  assert.equal(env.wifi.list('wifiConnectionChange').length, 1);
  second.close();
  await flush();
  assert.equal(env.wifi.list('wifiConnectionChange').length, 0);
});
