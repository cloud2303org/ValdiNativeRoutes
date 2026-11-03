// Unit tests execute the production adapter with controlled SDK boundaries.
// These are lifecycle/protocol tests, never hardware or HAP validation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const inspector = require('node:inspector');
const root = path.resolve(__dirname, '../../../../../..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'tools/valdi-rolldown')] }));
const callbackReceivers = new WeakMap();
// Inspector omits the hidden lexical-this slot from [[Scopes]]. Annotate that
// slot at arrow creation, preserving the production body and receiver exactly.
const receiverMetadata = context => {
  const usesThis = node => {
    if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return false;
    return ts.forEachChild(node, usesThis) || false;
  };
  const visit = node => {
    const visited = ts.visitEachChild(node, visit, context);
    if (!ts.isArrowFunction(node) || !usesThis(node)) return visited;
    return ts.factory.createCallExpression(ts.factory.createIdentifier('__bleCaptureArrow'), undefined,
      [visited, ts.factory.createThis()]);
  };
  return source => ts.visitNode(source, visit);
};
const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS },
  transformers: { before: [receiverMetadata] }
}).outputText;
const helperCode = compile('HarmonyBleHelpers.ets');
const executionCode = compile('HarmonyBleExecutionCore.ets');
const serviceCode = compile('HarmonyBleService.ets');
let nextApplication = 0;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Read real V8 closure environments and own data references; never wait for GC
// or add inspection methods to production. Script/Global environments are module
// infrastructure, not a callback's lexical capture, and are excluded.
function retainedCallbackPaths(callbacks, forbidden, forbiddenText) {
  const session = new inspector.Session();
  session.connect();
  const key = '__harmonyBleLifetimeProbe';
  globalThis[key] = { callbacks, forbidden, callbackReceivers };
  const post = (method, params) => {
    let result, failure;
    session.post(method, params, (error, value) => { failure = error; result = value; });
    if (failure) throw failure;
    assert(result, 'Node inspector command must complete synchronously');
    return result;
  };
  try {
    const evaluate = expression => post('Runtime.evaluate', { expression, objectGroup: key }).result;
    const targets = evaluate(`globalThis.${key}.forbidden`);
    const receivers = evaluate(`globalThis.${key}.callbackReceivers`);
    const seen = evaluate('new WeakSet()');
    const roots = post('Runtime.getProperties', {
      objectId: evaluate(`globalThis.${key}.callbacks`).objectId, ownProperties: true
    }).result.filter(item => /^\d+$/.test(item.name)).map(item => [item.value, `callback[${item.name}]`]);
    const found = [];
    let visited = 0;
    while (roots.length) {
      const [value, path] = roots.shift();
      if (value?.type === 'string' && value.value === forbiddenText) { found.push(`${path}: PIN`); continue; }
      if (!value?.objectId) continue;
      const probe = post('Runtime.callFunctionOn', {
        objectId: value.objectId,
        functionDeclaration: 'function(targets, seen) { const index = targets.indexOf(this); if (index >= 0) return index; if (seen.has(this)) return -2; seen.add(this); return -1; }',
        arguments: [{ objectId: targets.objectId }, { objectId: seen.objectId }], returnByValue: true
      }).result.value;
      if (probe >= 0) { found.push(`${path}: forbidden[${probe}]`); continue; }
      if (probe === -2) continue;
      assert(++visited < 3000, 'closure inspection must remain bounded');
      const properties = post('Runtime.getProperties', { objectId: value.objectId, ownProperties: true });
      if (value.type === 'function') {
        const receiver = post('Runtime.callFunctionOn', {
          objectId: value.objectId, functionDeclaration: 'function(receivers) { return receivers.get(this); }',
          arguments: [{ objectId: receivers.objectId }], objectGroup: key
        }).result;
        if (receiver.objectId) roots.push([receiver, `${path}.lexicalThis`]);
      }
      for (const item of properties.result) {
        if (item.value && item.name !== '__proto__') roots.push([item.value, `${path}.${item.name}`]);
      }
      for (const internal of properties.internalProperties || []) {
        if (internal.name === '[[Entries]]') roots.push([internal.value, `${path}.entries`]);
        if (internal.name !== '[[Scopes]]') continue;
        const scopes = post('Runtime.getProperties', { objectId: internal.value.objectId, ownProperties: true });
        for (const scope of scopes.result) {
          if (!scope.value?.objectId || /^(Global|Script|Module)/.test(scope.value.description)) continue;
          const bindings = post('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
          for (const binding of bindings.result) if (binding.value) {
            roots.push([binding.value, `${path}.scope.${binding.name}`]);
          }
        }
      }
    }
    return found;
  } finally {
    post('Runtime.releaseObjectGroup', { objectGroup: key });
    delete globalThis[key];
    session.disconnect();
  }
}

function inspectedDeferred() {
  const result = deferred(), callbacks = [];
  result.promise.then = function (yes, no) {
    callbacks.push(...[yes, no].filter(value => typeof value === 'function'));
    return Promise.prototype.then.call(this, yes, no);
  };
  return { ...result, callbacks };
}
class Emitter {
  handlers = new Map();
  on(name, cb) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(cb);
  }
  off(name, cb) { this.handlers.get(name)?.delete(cb); }
  emit(name, value) { for (const cb of this.handlers.get(name) || []) cb(value); }
  count() { return [...this.handlers.values()].reduce((n, set) => n + set.size, 0); }
}
function fixture() {
  const applicationName = `ble.test.${++nextApplication}`;
  let now = 0, nextTimer = 0, radio = 2;
  const timers = new Map(), log = [], clients = [], scanners = [], servers = [], events = [];
  const uuid = id => `${id.padStart(8, '0')}-0000-1000-8000-00805f9b34fb`;
  const characteristic = {
    serviceUuid: uuid('180d'), characteristicUuid: uuid('2a37'),
    characteristicValue: new Uint8Array([1, 2]).buffer, descriptors: [],
    properties: { read: true, write: true, writeNoResponse: true, notify: true, indicate: true }
  };
  const nativeServices = [{ serviceUuid: uuid('180d'), isPrimary: true, characteristics: [characteristic] }];
  const access = Object.assign(new Emitter(), {
    BluetoothState: { STATE_OFF: 0, STATE_TURNING_ON: 1, STATE_ON: 2, STATE_TURNING_OFF: 3,
      STATE_BLE_TURNING_ON: 4, STATE_BLE_ON: 5, STATE_BLE_TURNING_OFF: 6 },
    getState: () => { log.push('radio-state'); return radio; },
    isBluetoothSupported: () => true
  });
  const connection = Object.assign(new Emitter(), {
    BondState: { BOND_STATE_INVALID: 0, BOND_STATE_BONDING: 1, BOND_STATE_BONDED: 2 },
    getPairState: () => 0, getLocalName: () => 'System Name',
    pairDevice: () => Promise.resolve(),
    setDevicePinCode: (device, pin) => { log.push(['pin', device, pin]); return Promise.resolve(); }
  });
  const ble = {
    ScanDuty: { SCAN_MODE_LOW_LATENCY: 2, SCAN_MODE_LOW_POWER: 0, SCAN_MODE_BALANCED: 1 },
    ScanReportMode: { NORMAL: 1 }, ScanReportType: { ON_LOST: 2 }, GattWriteType: { WRITE: 1, WRITE_NO_RESPONSE: 2 },
    createBleScanner: () => {
      const scanner = Object.assign(new Emitter(), {
        start: deferred(),
        startScan(filters, options) { log.push(['scan-start', filters, options]); return this.start.promise; },
        stopScan() { log.push('scan-stop'); return Promise.resolve(); }
      });
      scanners.push(scanner);
      return scanner;
    },
    createGattClientDevice: id => {
      const client = Object.assign(new Emitter(), {
        connect() { log.push(['connect', id, [...this.handlers.keys()]]); },
        disconnect() { log.push(['disconnect', id]); },
        close() { log.push(['client-close', id]); },
        getServices: () => Promise.resolve(nativeServices),
        getDeviceName: () => Promise.resolve('Pulse'),
        getRssiValue: () => Promise.resolve(-64),
        setBLEMtu: mtu => { log.push(['mtu-request', mtu]); return Promise.resolve(185); },
        readCharacteristicValue: () => Promise.resolve(characteristic),
        writeCharacteristicValue: (value, type) => { log.push(['write', value, type]); return Promise.resolve(); },
        setCharacteristicChangeIndication: (_value, state) => { log.push(['indicate', state]); return Promise.resolve(); },
        setCharacteristicChangeNotification: (_value, state) => { log.push(['notify', state]); return Promise.resolve(); }
      });
      clients.push(client);
      return client;
    },
    createGattServer: () => {
      const server = Object.assign(new Emitter(), {
        addService: service => log.push(['server-add', service]),
        removeService: id => log.push(['server-remove', id]),
        close: () => log.push('server-close'),
        disconnect: device => log.push(['server-disconnect', device]),
        sendResponse: response => log.push(['response', response]),
        notifyCharacteristicChanged: (device, value) => { log.push(['server-notify', device, value]); return Promise.resolve(); }
      });
      servers.push(server);
      return server;
    },
    startAdvertising: () => Promise.resolve(101),
    stopAdvertising: id => { log.push(['advertisement-stop', id]); return Promise.resolve(); }
  };
  const sdk = { access, connection, ble, constant: { ProfileConnectionState: { STATE_CONNECTED: 2, STATE_DISCONNECTED: 0 } } };
  const globals = {
    console, Uint8Array, ArrayBuffer, Map, Set, Promise, Error, Number, String, Date,
    __bleCaptureArrow: (callback, receiver) => { callbackReceivers.set(callback, receiver); return callback; },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  function evaluate(code, importer) {
    const exports = {};
    vm.runInNewContext(code, { ...globals, exports, require: importer });
    return exports;
  }
  const helpers = evaluate(helperCode, () => { throw Error('unexpected helper import'); });
  const execution = evaluate(executionCode, name => {
    if (name === './HarmonyBleHelpers') return helpers;
    throw Error(`Unexpected execution import ${name}`);
  });
  const Service = evaluate(serviceCode, name => {
    if (name === '@kit.ConnectivityKit') return sdk;
    if (name === './HarmonyBleHelpers') return helpers;
    if (name === './HarmonyBleExecutionCore') return execution;
    throw Error(`Unexpected runtime import ${name}`);
  }).HarmonyBleService;
  let permission = () => Promise.resolve(true);
  const context = () => ({ applicationInfo: { uid: 10001, name: applicationName } });
  const permissions = { requestPermission: kind => { log.push(['permission', kind]); return permission(); } };
  const owner = new Service(context(), permissions);
  const callbacks = Object.fromEntries(['deviceFound', 'adapterStateChange', 'connectStateChange', 'characteristicUpdate', 'mtuChange',
    'peripheralReadRequest', 'peripheralWriteRequest', 'peripheralSubscribed', 'peripheralUnsubscribed',
    'peripheralConnectionStateChange'].map(name => [name, value => events.push([name, value])]));
  owner.setEvents(callbacks);
  return {
    owner, access, connection, ble, clients, scanners, servers, log, events, callbacks, timers, uuid, nativeServices,
    createOwner: (ownerContext = context()) => {
      const other = new Service(ownerContext, permissions);
      const otherEvents = [];
      const otherCallbacks = Object.fromEntries(Object.keys(callbacks)
        .map(name => [name, value => otherEvents.push([name, value])]));
      other.setEvents(otherCallbacks);
      return { owner: other, events: otherEvents, callbacks: otherCallbacks };
    },
    setPermission: fn => { permission = fn; },
    setRadio: state => { radio = state; access.emit('stateChange', state); },
    tick: async ms => {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await flush();
    },
    connect: async (id = 'opaque#device') => {
      const promise = owner.createBLEConnection(id, 5000);
      await flush();
      clients.at(-1).emit('BLEConnectionStateChange', { deviceId: id, state: 2 });
      await promise;
      return clients.at(-1);
    }
  };
}

test('construction is inert and close invalidates a pending permission result', async () => {
  const f = fixture();
  assert.deepEqual(f.log, []);
  const permission = deferred();
  f.setPermission(() => permission.promise);
  const opened = f.owner.openBluetoothAdapter('central');
  const rejected = assert.rejects(opened, /E_BLE_NOT_INITIALIZED:/);
  f.owner.close();
  permission.resolve(true);
  await rejected;
  assert.equal(f.access.count(), 0);
  assert.equal(f.connection.count(), 0);
  assert.equal(f.timers.size, 0);
});

async function connectGraph(f, owner, id = 'opaque#device') {
  const before = f.clients.length;
  const connecting = owner.createBLEConnection(id, 5000);
  await flush();
  assert.equal(f.clients.length, before + 1);
  const client = f.clients.at(-1);
  client.emit('BLEConnectionStateChange', { deviceId: id, state: 2 });
  await connecting;
  return client;
}

test('app authority serializes same-device SDK operations across graphs while another device progresses', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aClient = await f.connect();
  const bClient = await connectGraph(f, b.owner);
  const otherClient = await connectGraph(f, b.owner, 'other-device');
  const active = deferred(), calls = [];
  aClient.getRssiValue = () => { calls.push('a'); return active.promise; };
  bClient.getRssiValue = () => { calls.push('b'); return Promise.resolve(-65); };
  otherClient.getRssiValue = () => { calls.push('other'); return Promise.resolve(-70); };
  const a = f.owner.getBLEDeviceRSSI('opaque#device');
  const same = b.owner.getBLEDeviceRSSI('opaque#device');
  assert.equal(await b.owner.getBLEDeviceRSSI('other-device'), -70);
  assert.deepEqual(calls, ['a', 'other']);
  active.resolve(-61);
  assert.equal(await a, -61);
  assert.equal(await same, -65);
  assert.deepEqual(calls, ['a', 'other', 'b']);
});

test('closing queued graph A releases only its work while graph B owns the device lane', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aClient = await f.connect(), bClient = await connectGraph(f, b.owner);
  const active = deferred();
  let aCalls = 0;
  aClient.getRssiValue = () => { aCalls++; return Promise.resolve(-90); };
  bClient.getRssiValue = () => active.promise;
  const running = b.owner.getBLEDeviceRSSI('opaque#device');
  const queued = f.owner.getBLEDeviceRSSI('opaque#device');
  const cancelled = assert.rejects(queued, /E_BLE_NOT_INITIALIZED:/);
  f.owner.close();
  await cancelled;
  assert.equal(aCalls, 0);
  active.resolve(-60);
  assert.equal(await running, -60);
  assert.equal(await b.owner.getBLEDeviceRSSI('opaque#device'), -60);
});

test('power invalidation beats the completion drain and never dispatches queued SDK work', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  const client = await f.connect(), active = deferred();
  let calls = 0;
  client.getRssiValue = () => { calls++; return active.promise; };
  const running = f.owner.getBLEDeviceRSSI('opaque#device');
  const queued = f.owner.getBLEDeviceRSSI('opaque#device');
  const cancelled = [assert.rejects(running, /E_BLE_ADAPTER_NOT_AVAILABLE:/),
    assert.rejects(queued, /E_BLE_ADAPTER_NOT_AVAILABLE:/)];
  active.resolve(-65);
  f.setRadio(0);
  await Promise.all(cancelled);
  assert.equal(calls, 1);
});

test('disconnect cancels connecting work out of band and repeated close joins cleanup', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  const connecting = f.owner.createBLEConnection('connecting-device', 5000);
  const joined = f.owner.createBLEConnection('connecting-device', 5000);
  const rejected = [assert.rejects(connecting, /E_BLE_NOT_CONNECTED:/),
    assert.rejects(joined, /E_BLE_NOT_CONNECTED:/)];
  await flush();
  const one = f.owner.closeBLEConnection('connecting-device');
  const two = f.owner.closeBLEConnection('connecting-device');
  await Promise.all([one, two, ...rejected]);
  assert.equal(f.clients.length, 1);
  assert.equal(f.clients[0].count(), 0);
  assert.equal(f.timers.size, 0);
});

test('write bytes are copied before admission and before asynchronous characteristic discovery', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  const client = await f.connect(), discovery = deferred();
  client.getServices = () => discovery.promise;
  const bytes = new Uint8Array([1, 2]);
  const writing = f.owner.writeBLECharacteristicValue({
    deviceId: 'opaque#device', serviceId: '180d', characteristicId: '2a37', value: bytes, writeType: 'write'
  });
  bytes[0] = 99;
  discovery.resolve(f.nativeServices);
  await writing;
  const write = f.log.find(row => Array.isArray(row) && row[0] === 'write');
  assert.deepEqual([...new Uint8Array(write[1].characteristicValue)], [1, 2]);
});

test('caller timeout retains the hardware fence until the actual SDK promise settles', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aClient = await f.connect(), bClient = await connectGraph(f, b.owner);
  const native = deferred();
  let bCalls = 0;
  aClient.getRssiValue = () => native.promise;
  bClient.getRssiValue = () => { bCalls++; return Promise.resolve(-62); };
  const timed = f.owner.getBLEDeviceRSSI('opaque#device');
  const rejected = assert.rejects(timed, /E_BLE_RSSI_FAILED:/);
  await f.tick(20000);
  await rejected;
  const queued = b.owner.getBLEDeviceRSSI('opaque#device');
  await flush();
  assert.equal(bCalls, 0);
  assert.equal(f.timers.size, 0); // Waiting for admission does not start an SDK timeout.
  native.resolve(-80);
  assert.equal(await queued, -62);
  assert.equal(bCalls, 1);
});

test('failed SDK close quarantines an active lease until native terminal completion', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aClient = await f.connect(), bClient = await connectGraph(f, b.owner);
  const native = deferred();
  let bCalls = 0;
  aClient.getRssiValue = () => native.promise;
  aClient.close = () => { throw new Error('SDK close failed'); };
  bClient.getRssiValue = () => { bCalls++; return Promise.resolve(-62); };
  const active = f.owner.getBLEDeviceRSSI('opaque#device');
  const rejected = assert.rejects(active, /E_BLE_NOT_INITIALIZED:/);
  const queued = b.owner.getBLEDeviceRSSI('opaque#device');
  f.owner.close();
  await rejected;
  await flush();
  assert.equal(bCalls, 0);
  native.resolve(-80);
  assert.equal(await queued, -62);
  assert.equal(bCalls, 1);
});

test('disconnect invalidation precedes draining queued MTU and a replacement ignores late native data', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  const old = await f.connect(), native = deferred();
  old.getRssiValue = () => native.promise;
  const active = f.owner.getBLEDeviceRSSI('opaque#device');
  const queued = f.owner.setBLEMTU('opaque#device', 247);
  const rejected = [assert.rejects(active, /E_BLE_NOT_CONNECTED:/), assert.rejects(queued, /E_BLE_NOT_CONNECTED:/)];
  native.resolve(-77);
  old.emit('BLEConnectionStateChange', { deviceId: 'opaque#device', state: 0 });
  await Promise.all(rejected);
  assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'mtu-request'), false);
  const replacement = await f.connect();
  assert.equal(await f.owner.getBLEMTU('opaque#device', undefined), 23);
  assert.equal(replacement.count(), 4);
  assert.equal(old.count(), 0);
});

test('queued connect can be cancelled without allocating a native client or disturbing another graph', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const client = await f.connect(), native = deferred();
  client.getRssiValue = () => native.promise;
  const active = f.owner.getBLEDeviceRSSI('opaque#device');
  const queued = b.owner.createBLEConnection('opaque#device', 5000);
  const joined = b.owner.createBLEConnection('opaque#device', 5000);
  const cancelled = [assert.rejects(queued, /E_BLE_NOT_CONNECTED:/), assert.rejects(joined, /E_BLE_NOT_CONNECTED:/)];
  await Promise.all([b.owner.closeBLEConnection('opaque#device'), b.owner.closeBLEConnection('opaque#device'), ...cancelled]);
  assert.equal(f.clients.length, 1);
  native.resolve(-50);
  assert.equal(await active, -50);
  const next = await connectGraph(f, b.owner);
  assert.equal(next.count(), 4);
});

test('FIFO order survives three admissions spanning two service graphs', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aClient = await f.connect(), bClient = await connectGraph(f, b.owner), native = deferred();
  const order = [];
  let aCalls = 0;
  aClient.getRssiValue = () => { order.push(++aCalls === 1 ? 'a1' : 'a2'); return aCalls === 1 ? native.promise : Promise.resolve(-52); };
  bClient.getRssiValue = () => { order.push('b1'); return Promise.resolve(-51); };
  const a1 = f.owner.getBLEDeviceRSSI('opaque#device');
  const b1 = b.owner.getBLEDeviceRSSI('opaque#device');
  const a2 = f.owner.getBLEDeviceRSSI('opaque#device');
  await flush();
  assert.deepEqual(order, ['a1']);
  native.resolve(-50);
  assert.deepEqual(await Promise.all([a1, b1, a2]), [-50, -51, -52]);
  assert.deepEqual(order, ['a1', 'b1', 'a2']);
});

test('authority scope requires the actual application UID and name', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  for (const applicationInfo of [{ uid: -1, name: 'app' }, { uid: 1.5, name: 'app' }, { uid: 1, name: '' }]) {
    assert.throws(() => f.createOwner({ applicationInfo }), /E_BLE_INVALID_DATA:/);
  }
  assert.deepEqual(f.log, []);
});

test('fresh connect after connected rejects instead of joining a completed connection', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  await f.connect();
  await assert.rejects(f.owner.createBLEConnection('opaque#device', 5000), /E_BLE_ALREADY_CONNECTED:/);
  assert.equal(f.clients.length, 1);
});

test('review: queued graph cannot submit its PIN before its pairing ticket is current', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => {
    f.owner.close(); b.owner.close();
    f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 0 });
  });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aPair = f.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('1111').toString('base64'), timeout: 5000 });
  const bPair = b.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('2222').toString('base64'), timeout: 5000 });
  aPair.catch(() => {});
  bPair.catch(() => {});
  await flush();
  f.connection.emit('pinRequired', { deviceId: 'bond-device', pinCode: '' });
  await flush();
  assert.deepEqual(f.log.filter(row => Array.isArray(row) && row[0] === 'pin').map(row => row[2]), ['1111']);
  f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 2, cause: 0 });
  await aPair;
  await flush();
  f.connection.emit('pinRequired', { deviceId: 'bond-device', pinCode: '' });
  await flush();
  assert.deepEqual(f.log.filter(row => Array.isArray(row) && row[0] === 'pin').map(row => row[2]), ['1111', '2222']);
  const rejected = assert.rejects(bPair, /E_BLE_PAIR_FAILED:/);
  f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 2 });
  await rejected;
});

for (const cancellation of ['timeout', 'background', 'close']) {
  test(`review: ${cancellation} cancels the caller but preserves the bonding lease until a terminal bond event`, async t => {
    const f = fixture(), b = f.createOwner();
    t.after(() => {
      f.owner.close(); b.owner.close();
      f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 0 });
    });
    await f.owner.openBluetoothAdapter(undefined);
    await b.owner.openBluetoothAdapter(undefined);
    const bClient = await connectGraph(f, b.owner, 'bond-device');
    let state = 0, bCalls = 0, starts = 0;
    f.connection.getPairState = () => state;
    f.connection.pairDevice = () => { starts++; state = 1; return Promise.resolve(); };
    bClient.getRssiValue = () => { bCalls++; return Promise.resolve(-55); };
    const pairing = f.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('1111').toString('base64'), timeout: 5 });
    const expected = cancellation === 'timeout' ? /E_BLE_PAIR_TIMEOUT:/ :
      cancellation === 'background' ? /E_BLE_OPERATE_FAILED:/ : /E_BLE_NOT_INITIALIZED:/;
    const rejected = assert.rejects(pairing, expected);
    await flush(); // StartPair initiation resolves while getPairState still reports BONDING.
    assert.equal(starts, 1);
    const queued = b.owner.getBLEDeviceRSSI('bond-device');
    queued.catch(() => {});
    if (cancellation === 'timeout') await f.tick(5);
    else if (cancellation === 'background') f.owner.setActive(false);
    else f.owner.close();
    await rejected;
    await flush();
    assert.equal(state, 1);
    assert.equal(bCalls, 0);
    const delivered = f.events.length;
    f.connection.emit('pinRequired', { deviceId: 'bond-device', pinCode: '' });
    await f.tick(60000);
    assert.equal(bCalls, 0);
    assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'pin'), false);
    state = cancellation === 'background' ? 0 : 2;
    f.connection.emit('bondStateChange', { deviceId: 'bond-device', state, cause: state === 0 ? 2 : 0 });
    assert.equal(await queued, -55);
    assert.equal(bCalls, 1);
    assert.equal(f.events.length, delivered);
    if (cancellation === 'close') {
      assert.equal(f.connection.count(), 2); // Only graph B's normal bond/PIN listeners remain.
      assert.equal(f.access.count(), 1);
    }
  });
}

for (const transition of [1, 3, 4, 6]) {
  test(`review: state ${transition} cancels business work without clearing failed-close quarantine; confirmed OFF releases it`, async t => {
    const f = fixture(), b = f.createOwner();
    t.after(() => { f.setRadio(0); f.owner.close(); b.owner.close(); });
    await f.owner.openBluetoothAdapter(undefined);
    await b.owner.openBluetoothAdapter(undefined);
    const aClient = await f.connect(), bClient = await connectGraph(f, b.owner), native = deferred();
    aClient.getRssiValue = () => native.promise;
    aClient.close = () => { throw new Error('SDK close failed'); };
    const active = f.owner.getBLEDeviceRSSI('opaque#device');
    const rejected = assert.rejects(active, /E_BLE_NOT_INITIALIZED:/);
    f.owner.close();
    await rejected;
    assert.equal(bClient.count(), 4);
    f.setRadio(transition);
    f.setRadio(2);
    await b.owner.openBluetoothAdapter(undefined);
    const queued = b.owner.createBLEConnection('opaque#device', 5000);
    queued.catch(() => {});
    await flush();
    assert.equal(f.clients.length, 2);
    const cancelled = assert.rejects(queued, /E_BLE_ADAPTER_NOT_AVAILABLE:/);
    f.setRadio(0);
    await cancelled;
    f.setRadio(2);
    await b.owner.openBluetoothAdapter(undefined);
    const replacement = await connectGraph(f, b.owner);
    assert.equal(replacement.count(), 4);
    native.resolve(-91);
    await flush();
    assert.equal(await b.owner.getBLEDeviceRSSI('opaque#device'), -64);
  });
}

test('review: terminal bond state releases the lane before late StartPair settlement without releasing the next lease', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => {
    f.owner.close(); b.owner.close();
    f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 0 });
  });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const client = await connectGraph(f, b.owner, 'bond-device');
  const initiation = deferred(), read = deferred();
  let state = 0, calls = 0;
  f.connection.getPairState = () => state;
  f.connection.pairDevice = () => { state = 1; return initiation.promise; };
  client.getRssiValue = () => { calls++; return calls === 1 ? read.promise : Promise.resolve(-52); };
  const pairing = f.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('1111').toString('base64'), timeout: 5000 });
  pairing.catch(() => {});
  const first = b.owner.getBLEDeviceRSSI('bond-device'), second = b.owner.getBLEDeviceRSSI('bond-device');
  first.catch(() => {}); second.catch(() => {});
  state = 2;
  f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 2, cause: 0 });
  await pairing;
  await flush();
  assert.equal(calls, 1);
  initiation.resolve();
  await flush();
  assert.equal(calls, 1);
  read.resolve(-51);
  assert.deepEqual(await Promise.all([first, second]), [-51, -52]);
});

test('review: asynchronous StartPair rejection fails the caller but cannot unlock an ongoing bond', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => {
    f.owner.close(); b.owner.close();
    f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 0 });
  });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const client = await connectGraph(f, b.owner, 'bond-device');
  const initiation = deferred();
  let state = 0, calls = 0;
  f.connection.getPairState = () => state;
  f.connection.pairDevice = () => { state = 1; return initiation.promise; };
  client.getRssiValue = () => { calls++; return Promise.resolve(-53); };
  const pairing = f.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('1111').toString('base64'), timeout: 5000 });
  const rejected = assert.rejects(pairing, /E_BLE_PAIR_FAILED:/);
  const queued = b.owner.getBLEDeviceRSSI('bond-device');
  queued.catch(() => {});
  initiation.reject(Object.assign(new Error('StartPair request failed'), { code: 2900099 }));
  await rejected;
  await flush();
  assert.equal(calls, 0);
  state = 0;
  f.connection.emit('bondStateChange', { deviceId: 'bond-device', state: 0, cause: 2 });
  assert.equal(await queued, -53);
});

test('review: a closed graph keeps only terminal observers until confirmed OFF and never answers a PIN', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  let state = 0;
  f.connection.getPairState = () => state;
  f.connection.pairDevice = () => { state = 1; return Promise.resolve(); };
  const pairing = f.owner.makeBluetoothPair({ deviceId: 'bond-device', pin: Buffer.from('1111').toString('base64'), timeout: 5000 });
  const rejected = assert.rejects(pairing, /E_BLE_NOT_INITIALIZED:/);
  await flush();
  f.owner.close();
  await rejected;
  assert.equal(f.connection.count(), 1); // Bond terminal observer, no graph PIN/bond delivery callbacks.
  assert.equal(f.access.count(), 1); // Only the lease's confirmed-OFF observer.
  f.connection.emit('pinRequired', { deviceId: 'bond-device', pinCode: '' });
  assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'pin'), false);
  for (const transition of [1, 3, 4, 6]) {
    f.setRadio(transition);
    assert.equal(f.connection.count(), 1);
    assert.equal(f.access.count(), 1);
  }
  f.setRadio(0);
  await flush();
  assert.equal(f.connection.count(), 0);
  assert.equal(f.access.count(), 0);
  f.setRadio(2);
  const replacement = f.createOwner();
  await replacement.owner.openBluetoothAdapter(undefined);
  await connectGraph(f, replacement.owner, 'bond-device');
  replacement.owner.close();
});

test('radio-off open rejects after injected permission without changing radio state', async () => {
  const f = fixture();
  f.setRadio(0);
  await assert.rejects(f.owner.openBluetoothAdapter(undefined), /E_BLE_ADAPTER_NOT_AVAILABLE:/);
  assert.deepEqual(f.log[0], ['permission', 'bluetooth']);
  assert.equal(f.access.count(), 0);
  f.owner.close();
});

test('connection completion is event-driven; reads, write types, indication and actual MTU use production paths', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter('central');
  const connecting = f.owner.createBLEConnection('opaque#device', 5000);
  let complete = false;
  connecting.then(() => { complete = true; });
  await flush();
  assert.equal(complete, false);
  const client = f.clients[0];
  assert.equal(client.count(), 4);
  const call = f.log.find(row => Array.isArray(row) && row[0] === 'connect');
  assert.deepEqual(call[2], ['BLEConnectionStateChange', 'BLECharacteristicChange', 'BLEMtuChange', 'serviceChange']);
  client.emit('BLEConnectionStateChange', { deviceId: 'opaque#device', state: 2 });
  await connecting;
  const params = { deviceId: 'opaque#device', serviceId: '180d', characteristicId: '2a37' };
  const mapped = await f.owner.getBLEDeviceCharacteristics('opaque#device', '180d');
  assert.equal(mapped[0].uuid, f.uuid('2a37'));
  assert.equal(mapped[0].properties.read, true);
  assert.equal(mapped[0].properties.writeDefault, true);
  assert.equal(mapped[0].properties.writeNoResponse, true);
  assert.equal(mapped[0].properties.notify, true);
  assert.equal(mapped[0].properties.indicate, true);
  assert.equal(await f.owner.readBLECharacteristicValue(params), undefined);
  assert.deepEqual([...f.events.find(row => row[0] === 'characteristicUpdate')[1].value], [1, 2]);
  await f.owner.notifyBLECharacteristicValueChange({ ...params, state: true, type: 'indication' });
  await f.owner.notifyBLECharacteristicValueChange({ ...params, state: false, type: 'notification' });
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'indicate'));
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'notify'));
  await f.owner.writeBLECharacteristicValue({ ...params, value: new Uint8Array([9, 7, 8, 9]).subarray(1, 3), writeType: 'writeNoResponse' });
  const write = f.log.find(row => Array.isArray(row) && row[0] === 'write');
  assert.equal(write[2], 2);
  assert.deepEqual([...new Uint8Array(write[1].characteristicValue)], [7, 8]);
  assert.equal(await f.owner.setBLEMTU('opaque#device', 247), 185);
  client.emit('BLEMtuChange', 185);
  assert.equal(f.events.filter(row => row[0] === 'mtuChange').length, 1);
  assert.equal(await f.owner.getBLEMTU('opaque#device', undefined), 185);
  assert.equal(await f.owner.getBLEDeviceRSSI('opaque#device'), -64);
  f.owner.close();
  assert.equal(client.count(), 0);
  assert.equal(f.timers.size, 0);
});

test('late service discovery cannot populate a reconnected device generation', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const old = await f.connect();
  const discovery = deferred();
  old.getServices = () => discovery.promise;
  const services = f.owner.getBLEDeviceServices('opaque#device');
  const rejected = assert.rejects(services, /E_BLE_NOT_CONNECTED:/);
  old.emit('BLEConnectionStateChange', { deviceId: 'opaque#device', state: 0 });
  await rejected;
  const current = await f.connect();
  discovery.resolve([{ serviceUuid: f.uuid('180f'), isPrimary: true, characteristics: [] }]);
  await flush();
  assert.equal((await f.owner.getBLEDeviceServices('opaque#device'))[0].uuid, f.uuid('180d'));
  assert.equal(old.count(), 0);
  assert.equal(current.count(), 4);
  f.owner.close();
});

test('old disconnect completion cannot cancel a replacement started by its disconnected callback', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  await f.owner.openBluetoothAdapter(undefined);
  const old = await f.connect();
  let replacement;
  f.callbacks.connectStateChange = event => {
    f.events.push(['connectStateChange', event]);
    if (!event.connected) {
      replacement = f.owner.createBLEConnection(event.deviceId, 5000);
      replacement.catch(() => {}); // Observe a regression rejection before the assertions below.
    }
  };
  const closing = f.owner.closeBLEConnection('opaque#device');
  old.emit('BLEConnectionStateChange', { deviceId: 'opaque#device', state: 0 });
  await closing;
  assert(replacement);
  const current = f.clients[1];
  assert.equal(old.count(), 0);
  assert.equal(current.count(), 4);
  assert.equal(f.timers.size, 1);
  current.emit('BLEConnectionStateChange', { deviceId: 'opaque#device', state: 2 });
  await replacement;
  assert.equal(await f.owner.getBLEDeviceRSSI('opaque#device'), -64);
  assert.equal(f.timers.size, 0);
});

test('background stops scanner, drops stale scan callbacks, and preserves connected GATT', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const client = await f.connect();
  const scanning = f.owner.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false });
  const scanner = f.scanners[0];
  const stale = [...scanner.handlers.get('BLEDeviceFind')][0];
  scanner.start.resolve();
  await scanning;
  const report = { reportType: 1, scanResult: [{ deviceId: 'virtual-id', rssi: -53,
    data: new Uint8Array([2, 9, 65]).buffer, deviceName: 'A', connectable: true }] };
  scanner.emit('BLEDeviceFind', report);
  scanner.emit('BLEDeviceFind', report);
  assert.equal(f.events.filter(row => row[0] === 'deviceFound').length, 1);
  f.owner.setActive(false);
  stale(report);
  assert.equal(f.events.filter(row => row[0] === 'deviceFound').length, 1);
  assert.equal(scanner.count(), 0);
  assert.equal(client.count(), 4);
  assert.equal(f.events.filter(row => row[0] === 'connectStateChange' && !row[1].connected).length, 0);
  await assert.rejects(f.owner.startBluetoothDevicesDiscovery({}), /E_BLE_OPERATE_FAILED:/);
  assert.equal(await f.owner.getBLEDeviceRSSI('opaque#device'), -64);
  f.owner.close();
});

test('connect timeout and synchronous disconnect failure release owned callbacks/timers', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const connecting = f.owner.createBLEConnection('timeout-device', 5);
  const rejected = assert.rejects(connecting, /E_BLE_CONNECTION_TIMEOUT:/);
  await f.tick(5);
  await rejected;
  assert.equal(f.clients[0].count(), 0);
  const client = await f.connect();
  client.disconnect = () => { throw Object.assign(new Error('failure'), { code: 2900099 }); };
  await assert.rejects(f.owner.closeBLEConnection('opaque#device'), /E_BLE_OPERATE_FAILED:/);
  assert.equal(client.count(), 0);
  assert.equal(f.timers.size, 0);
  f.owner.close();
});

test('pairing decodes Base64 PIN, waits for actual bond, and owns its callbacks', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  let complete = false;
  const pairing = f.owner.makeBluetoothPair({ deviceId: 'virtual-pair', pin: 'MTIzNA==', timeout: 5000 });
  pairing.then(() => { complete = true; });
  await flush();
  assert.equal(complete, false);
  f.connection.emit('pinRequired', { deviceId: 'someone-else', pinCode: '' });
  assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'pin'), false);
  f.connection.emit('pinRequired', { deviceId: 'virtual-pair', pinCode: '' });
  await flush();
  assert.deepEqual(f.log.find(row => Array.isArray(row) && row[0] === 'pin'), ['pin', 'virtual-pair', '1234']);
  f.connection.emit('bondStateChange', { deviceId: 'virtual-pair', state: 2, cause: 0 });
  await pairing;
  f.owner.close();
  assert.equal(f.connection.count(), 0);
  assert.equal(f.timers.size, 0);
});

async function peripheral(f) {
  await f.owner.openBluetoothAdapter('peripheral');
  const id = await f.owner.createBLEPeripheralServer();
  await f.owner.addPeripheralService(id, {
    uuid: '180d',
    characteristics: [{ uuid: '2a37', value: new Uint8Array([1]), descriptors: [],
      properties: { read: true, write: true, writeNoResponse: true, notify: true, indicate: true },
      permission: { readable: true, writeable: true, readEncryptionRequired: false, writeEncryptionRequired: false } }]
  });
  return { id, server: f.servers[0], params: { serverId: id, serviceId: '180d', characteristicId: '2a37' } };
}

test('adapter allocations serialize across graphs and copy advertising bytes before waiting', async t => {
  const f = fixture(), b = f.createOwner();
  t.after(() => { f.owner.close(); b.owner.close(); });
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const aServer = await f.owner.createBLEPeripheralServer();
  const bServer = await b.owner.createBLEPeripheralServer();
  const native = deferred(), advertisements = [];
  f.ble.startAdvertising = params => {
    advertisements.push(params);
    return advertisements.length === 1 ? native.promise : Promise.resolve(102);
  };
  const params = { deviceName: '', connectable: true, serviceUuids: [], manufacturerData: [], powerLevel: 'low' };
  const first = f.owner.startPeripheralAdvertising({ ...params, serverId: aServer });
  const bytes = new Uint8Array([1, 2]);
  const second = b.owner.startPeripheralAdvertising({ ...params, serverId: bServer,
    manufacturerData: [{ manufacturerId: 17, manufacturerSpecificData: bytes }] });
  bytes[0] = 99;
  const scanning = b.owner.startBluetoothDevicesDiscovery({});
  await flush();
  assert.equal(advertisements.length, 1);
  assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'scan-start'), false);
  native.resolve(101);
  await Promise.all([first, second]);
  assert.deepEqual([...new Uint8Array(advertisements[1].advertisingData.manufactureData[0].manufactureValue)], [1, 2]);
  await flush();
  assert.equal(f.log.filter(row => Array.isArray(row) && row[0] === 'scan-start').length, 1);
  f.scanners[0].start.resolve();
  await scanning;
});

test('peripheral requests, CCCD subscriptions, responses, notification completion and expiry are real SDK paths', async () => {
  const f = fixture();
  const { id, server, params } = await peripheral(f);
  server.emit('connectionStateChange', { deviceId: 'central', state: 2 });
  const request = { deviceId: 'central', transId: 8, offset: 0, serviceUuid: f.uuid('180d'), characteristicUuid: f.uuid('2a37') };
  server.emit('characteristicRead', request);
  const read = f.events.find(row => row[0] === 'peripheralReadRequest')[1];
  await f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array([3, 4]), needNotify: false, callbackId: read.callbackId });
  const response = f.log.find(row => Array.isArray(row) && row[0] === 'response')[1];
  assert.equal(response.transId, 8);
  assert.deepEqual([...new Uint8Array(response.value)], [3, 4]);
  await assert.rejects(f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array([3]), needNotify: false, callbackId: read.callbackId }), /E_BLE_INVALID_DATA:/);
  server.emit('descriptorWrite', { ...request, transId: 9, descriptorUuid: f.uuid('2902'),
    isPrepared: false, needRsp: true, value: new Uint8Array([2, 0]).buffer });
  assert.equal(f.events.filter(row => row[0] === 'peripheralSubscribed').length, 1);
  await f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array([7]), needNotify: true });
  assert.equal(f.log.find(row => Array.isArray(row) && row[0] === 'server-notify')[2].confirm, true);
  await assert.rejects(f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array(21), needNotify: true }), /E_BLE_INVALID_DATA:/);
  server.emit('characteristicRead', { ...request, transId: 10 });
  const expired = f.events.filter(row => row[0] === 'peripheralReadRequest').at(-1)[1];
  await f.tick(10000);
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'response' && row[1].transId === 10 && row[1].status === 14));
  await assert.rejects(f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array(), needNotify: false, callbackId: expired.callbackId }), /E_BLE_INVALID_DATA:/);
  server.emit('characteristicWrite', { ...request, transId: 11, isPrepared: true, needRsp: true, value: new Uint8Array([1]).buffer });
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'response' && row[1].transId === 11 && row[1].status === 6));
  await f.owner.removePeripheralService(id, '180d');
  assert.equal(f.events.filter(row => row[0] === 'peripheralUnsubscribed').length, 1);
  await f.owner.closeBLEPeripheralServer(id);
  assert.equal(server.count(), 0);
  assert.equal(f.timers.size, 0);
  f.owner.close();
});

test('advertising rejects privileged name changes and releases late SDK IDs after owner close', async () => {
  const f = fixture();
  const { id, server } = await peripheral(f);
  const params = { serverId: id, deviceName: 'Custom Name', connectable: true,
    serviceUuids: ['180d'], manufacturerData: [], powerLevel: 'medium' };
  await assert.rejects(f.owner.startPeripheralAdvertising(params), /E_BLE_SYSTEM_NOT_SUPPORTED:/);
  const native = deferred();
  f.ble.startAdvertising = () => native.promise;
  const starting = f.owner.startPeripheralAdvertising({ ...params, deviceName: '' });
  const rejected = assert.rejects(starting, /E_BLE_NOT_INITIALIZED:/);
  f.owner.close();
  await rejected;
  native.resolve(987);
  await flush();
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'advertisement-stop' && row[1] === 987));
  assert.equal(server.count(), 0);
  assert.equal(f.timers.size, 0);
});

test('source owner close cancels a native read immediately and drops late byte events', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const client = await f.connect();
  const native = deferred();
  client.readCharacteristicValue = () => native.promise;
  const reading = f.owner.readBLECharacteristicValue({ deviceId: 'opaque#device', serviceId: '180d', characteristicId: '2a37' });
  await flush();
  const rejected = assert.rejects(reading, /E_BLE_NOT_INITIALIZED:/);
  f.owner.close();
  await rejected;
  native.resolve(f.nativeServices[0].characteristics[0]);
  await flush();
  assert.equal(f.events.filter(row => row[0] === 'characteristicUpdate').length, 0);
  assert.equal(f.timers.size, 0);
});

test('background cancels a still-starting scan immediately and late SDK completion stops only its scanner', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const starting = f.owner.startBluetoothDevicesDiscovery({});
  const rejected = assert.rejects(starting, /E_BLE_OPERATE_FAILED:/);
  const old = f.scanners[0];
  f.owner.setActive(false);
  await rejected;
  assert.equal(f.timers.size, 0);
  assert.equal(old.count(), 0);
  const before = f.log.filter(row => row === 'scan-stop').length;
  old.start.resolve();
  await flush();
  assert.equal(f.log.filter(row => row === 'scan-stop').length, before + 1);
  f.owner.close();
});

test('closing one server cancels pending server notifications and advertising without closing another owner', async () => {
  const f = fixture();
  const { id, server, params } = await peripheral(f);
  server.emit('connectionStateChange', { deviceId: 'central', state: 2 });
  server.emit('descriptorWrite', { deviceId: 'central', transId: 11, offset: 0,
    serviceUuid: f.uuid('180d'), characteristicUuid: f.uuid('2a37'), descriptorUuid: f.uuid('2902'),
    isPrepared: false, needRsp: true, value: new Uint8Array([1, 0]).buffer });
  const nativeNotify = deferred(), nativeAdvertising = deferred();
  server.notifyCharacteristicChanged = () => nativeNotify.promise;
  f.ble.startAdvertising = () => nativeAdvertising.promise;
  const notification = f.owner.writePeripheralCharacteristicValue({ ...params, value: new Uint8Array([1]), needNotify: true });
  const advertising = f.owner.startPeripheralAdvertising({
    serverId: id, deviceName: '', connectable: true, serviceUuids: [], manufacturerData: [], powerLevel: 'low'
  });
  const notifyRejected = assert.rejects(notification, /E_BLE_NOT_INITIALIZED:/);
  const advertisingRejected = assert.rejects(advertising, /E_BLE_NOT_INITIALIZED:/);
  await f.owner.closeBLEPeripheralServer(id);
  await Promise.all([notifyRejected, advertisingRejected]);
  assert.equal(f.timers.size, 0);
  nativeNotify.resolve();
  nativeAdvertising.resolve(543);
  await flush();
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'advertisement-stop' && row[1] === 543));
  // The adapter remains valid after a child server is closed.
  assert.equal((await f.owner.getBluetoothAdapterState()).available, true);
  f.owner.close();
});

test('server long read responses reject explicit MTU scope rather than returning silently truncated success', async () => {
  const f = fixture();
  const { server, params } = await peripheral(f);
  server.emit('characteristicRead', { deviceId: 'central', transId: 18, offset: 0,
    serviceUuid: f.uuid('180d'), characteristicUuid: f.uuid('2a37') });
  const read = f.events.find(row => row[0] === 'peripheralReadRequest')[1];
  await assert.rejects(f.owner.writePeripheralCharacteristicValue({
    ...params, value: new Uint8Array(23), callbackId: read.callbackId, needNotify: false
  }), /E_BLE_SYSTEM_NOT_SUPPORTED:/);
  assert(f.log.some(row => Array.isArray(row) && row[0] === 'response' && row[1].transId === 18 && row[1].status === 13));
  assert.equal(f.timers.size, 0);
  f.owner.close();
});

test('long descriptor reads reject the MTU scope without a partial successful response', async t => {
  const f = fixture();
  t.after(() => f.owner.close());
  const { id, server } = await peripheral(f);
  const value = Uint8Array.from({ length: 40 }, (_, index) => index);
  await f.owner.addPeripheralService(id, {
    uuid: '180f',
    characteristics: [{ uuid: '2a19', value: new Uint8Array(), properties: {
      read: true, write: false, writeNoResponse: false, notify: false, indicate: false
    }, permission: { readable: true, writeable: false, readEncryptionRequired: false, writeEncryptionRequired: false },
    descriptors: [{ uuid: '2901', read: true, write: false, value }] }]
  });
  server.emit('BLEMtuChange', 185); // The SDK server event supplies no central ID.
  const request = { deviceId: 'central', transId: 21, offset: 0,
    serviceUuid: f.uuid('180f'), characteristicUuid: f.uuid('2a19'), descriptorUuid: f.uuid('2901') };
  server.emit('descriptorRead', request);
  const responses = f.log.filter(row => Array.isArray(row) && row[0] === 'response' && row[1].transId === 21);
  assert.equal(responses.length, 1);
  assert.equal(responses[0][1].status, 13);
  assert.equal(responses[0][1].value.byteLength, 0);
  server.emit('descriptorRead', { ...request, transId: 22, offset: 18 });
  const boundary = f.log.find(row => Array.isArray(row) && row[0] === 'response' && row[1].transId === 22)[1];
  assert.equal(boundary.status, 0);
  assert.deepEqual([...new Uint8Array(boundary.value)], [...value.slice(18)]);
});

test('service-change invalidates discovery and synchronous SDK errors retain E_BLE mapping', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const client = await f.connect();
  const discovery = deferred();
  client.getServices = () => discovery.promise;
  const services = f.owner.getBLEDeviceServices('opaque#device');
  client.emit('serviceChange');
  discovery.resolve(f.nativeServices);
  await assert.rejects(services, /E_BLE_OPERATE_FAILED:/);
  client.getRssiValue = () => { throw Object.assign(new Error('permission denied'), { code: 201 }); };
  await assert.rejects(f.owner.getBLEDeviceRSSI('opaque#device'), /E_BLE_PERMISSION:/);
  f.owner.close();
});

test('separate service instances cannot close each other’s SDK registrations or sessions', async () => {
  const a = fixture(), b = fixture();
  await a.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  await a.connect();
  const other = await b.connect();
  a.owner.close();
  assert.equal(a.access.count(), 0);
  assert.equal(b.access.count(), 1);
  assert.equal(other.count(), 4);
  assert.equal(await b.owner.getBLEDeviceRSSI('opaque#device'), -64);
  b.owner.close();
});

test('background pairing cancellation cannot answer a subsequently delivered PIN callback', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const pairing = f.owner.makeBluetoothPair({ deviceId: 'virtual-pair', pin: Buffer.from('1234').toString('base64'), timeout: 5000 });
  const rejected = assert.rejects(pairing, /E_BLE_OPERATE_FAILED:/);
  f.owner.setActive(false);
  f.connection.emit('pinRequired', { deviceId: 'virtual-pair', pinCode: '' });
  await rejected;
  assert.equal(f.log.some(row => Array.isArray(row) && row[0] === 'pin'), false);
  assert.equal(f.timers.size, 0);
  f.owner.close();
});

test('failed advertising stop retains its SDK ID for teardown retry', async () => {
  const f = fixture();
  const { id } = await peripheral(f);
  const params = { serverId: id, deviceName: '', connectable: true, serviceUuids: [],
    manufacturerData: [], powerLevel: 'low' };
  await f.owner.startPeripheralAdvertising(params);
  let stops = 0;
  f.ble.stopAdvertising = sdkId => {
    assert.equal(sdkId, 101);
    stops++;
    return stops === 1 ? Promise.reject(Object.assign(new Error('busy'), { code: 2900011 })) : Promise.resolve();
  };
  await assert.rejects(f.owner.stopPeripheralAdvertising(id), /E_BLE_OPERATE_FAILED:/);
  await assert.rejects(f.owner.startPeripheralAdvertising(params), /E_BLE_OPERATE_FAILED:/);
  await f.owner.closeBLEPeripheralServer(id);
  await flush();
  assert.equal(stops, 2);
  f.owner.close();
});

for (const cancellation of ['timeout', 'close']) {
  for (const terminal of ['bond', 'OFF']) {
    test(`review2: unresolved PIN completion retains no runtime or PIN after ${cancellation} and ${terminal}`, async () => {
      const f = fixture();
      await f.owner.openBluetoothAdapter(undefined);
      const pin = inspectedDeferred(); // Deliberately never resolve OR reject.
      f.connection.setDevicePinCode = () => pin.promise;
      const pairing = f.owner.makeBluetoothPair({
        deviceId: 'lifetime-pair', pin: Buffer.from('7319').toString('base64'), timeout: 1000
      });
      const rejected = assert.rejects(pairing, cancellation === 'timeout' ? /E_BLE_PAIR_TIMEOUT:/ : /E_BLE_NOT_INITIALIZED:/);
      await flush();
      f.connection.emit('pinRequired', { deviceId: 'lifetime-pair', pinCode: '' });
      assert(pin.callbacks.length >= 2, 'real SDK Promise callbacks must be attached');
      if (cancellation === 'timeout') await f.tick(1000);
      else f.owner.close();
      await rejected;
      const forbidden = [f.owner, f.owner.permission];
      assert.deepEqual(retainedCallbackPaths(pin.callbacks, forbidden, '7319'), [],
        'unsettled PIN callbacks must lose caller delivery at business retirement');
      if (terminal === 'bond') f.connection.emit('bondStateChange', { deviceId: 'lifetime-pair', state: 2 });
      else f.setRadio(0);
      f.owner.close();
      await flush();
      assert.deepEqual(retainedCallbackPaths(pin.callbacks, forbidden, '7319'), [],
        'terminal cleanup must not leave a graph/PIN capture on the unresolved SDK Promise');
      assert.equal(f.timers.size, 0);
    });
  }
}

test('review2: all failed SDK offs retain inert callbacks and repeated close retries exact handles', async () => {
  const f = fixture(), b = f.createOwner();
  await f.owner.openBluetoothAdapter(undefined);
  await b.owner.openBluetoothAdapter(undefined);
  const handles = [
    [f.access, 'stateChange', f.owner.radioChanged],
    [f.connection, 'bondStateChange', f.owner.bondChanged],
    [f.connection, 'pinRequired', f.owner.pinRequired]
  ].map(([sdk, event]) => [sdk, event, [...sdk.handlers.get(event)][0]]);
  const calls = [], failures = [];
  let fail = true, reentry = true;
  const snapshots = f.events.length;
  for (const sdk of [f.access, f.connection]) {
    const off = sdk.off.bind(sdk);
    sdk.off = (event, callback) => {
      const owned = handles.some(([target, name, fn]) => target === sdk && name === event && fn === callback);
      assert(owned, 'cleanup must never remove another graph callback');
      calls.push([sdk, event, callback]);
      // Inspect ALL SDK closures at the first off, not just the one being
      // removed: no off() reentry may find any graph delivery still attached.
      failures.push(...retainedCallbackPaths(handles.map(row => row[2]), [f.owner, f.owner.permission]));
      for (const [, name, fn] of handles) fn(name === 'stateChange' ? 3 : { deviceId: 'late', state: 2, pinCode: '' });
      if (reentry) { reentry = false; f.owner.close(); }
      if (fail) throw Error('SDK off unavailable');
      off(event, callback);
    };
  }
  f.owner.close();
  assert.deepEqual(failures, [], 'all SDK forwarders must be cleared before the first off can reenter');
  assert.equal(calls.length, 3, 'failed off must not trigger a retry loop or recursive cleanup');
  assert.equal(f.events.length, snapshots);
  assert.equal(f.access.count(), 2);
  assert.equal(f.connection.count(), 4);
  fail = false;
  f.owner.close();
  assert.equal(calls.length, 6, 'explicit repeated close retries each failed handle exactly once');
  handles.forEach(([sdk, event, callback]) => assert(!sdk.handlers.get(event).has(callback)));
  f.owner.close();
  assert.equal(calls.length, 6, 'successful cleanup is idempotent');
  f.access.off = Emitter.prototype.off;
  f.connection.off = Emitter.prototype.off;
  assert.equal((await b.owner.getBluetoothAdapterState()).available, true);
  b.owner.close();
});

test('review2: adapter reopen retries failed off handles without reactivating retired callbacks', async () => {
  const f = fixture();
  await f.owner.openBluetoothAdapter(undefined);
  const handles = [
    [f.access, 'stateChange', [...f.access.handlers.get('stateChange')][0]],
    [f.connection, 'bondStateChange', [...f.connection.handlers.get('bondStateChange')][0]],
    [f.connection, 'pinRequired', [...f.connection.handlers.get('pinRequired')][0]]
  ];
  let fail = true;
  for (const sdk of [f.access, f.connection]) {
    const off = sdk.off.bind(sdk);
    sdk.off = (event, callback) => { if (fail) throw Error('off failed'); off(event, callback); };
  }
  await f.owner.closeBluetoothAdapter();
  assert.deepEqual(retainedCallbackPaths(handles.map(row => row[2]), [f.owner, f.owner.permission]), []);
  // A reopen while off still fails may register fresh delivery, never reuse an
  // inert callback that the SDK still owns.
  await f.owner.openBluetoothAdapter(undefined);
  const before = f.events.length;
  handles.forEach(([, event, callback]) => callback(event === 'stateChange' ? 3 : { deviceId: 'late', state: 2 }));
  assert.equal(f.events.length, before);
  assert.equal((await f.owner.getBluetoothAdapterState()).available, true);
  fail = false;
  f.owner.close();
  assert.equal(f.access.count(), 0);
  assert.equal(f.connection.count(), 0);
});
