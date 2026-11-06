import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { root } from './pipeline';

type Call = {
  deviceId: string;
  operation: string;
  params: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

// Execute compiler-emitted production TS with fixture native, permissions and NativeReferences boundaries:
// validation, write copying, nativeCall, event fanout and runtime state all run.
// This capability fake models the required native per-device FIFO. It is not
// evidence that any platform's native implementation meets that requirement.
function fixture(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-ble-execution-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(root, 'valdi/modules/bluetooth/src');
  mkdirSync(path.join(directory, 'node_modules'));
  const sharedPermissions = path.join(directory, 'node_modules/permissions/src');
  const common = path.join(directory, 'node_modules/native_common/src');
  const framework = path.join(directory, 'node_modules/valdi_core/src');
  mkdirSync(sharedPermissions, { recursive: true });
  mkdirSync(common, { recursive: true });
  mkdirSync(framework, { recursive: true });
  for (const file of ['bindMethods', 'nativeCall']) {
    writeFileSync(path.join(common, `${file}.js`), ts.transpileModule(
      readFileSync(path.join(root, 'valdi/modules/native_common/src', `${file}.ts`), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText);
  }
  writeFileSync(path.join(sharedPermissions, 'index.js'), `
    exports.isAndroid = () => false;
    exports.androidSdk = () => 0;
    exports.requestAndroidPermissions = async () => ({ status: 'granted' });
    let tail = Promise.resolve();
    exports.serializePermissionRequest = (request, checkActive) => {
      const result = tail.then(() => { checkActive?.(); return request(); });
      tail = result.then(() => undefined, () => undefined);
      return result;
    };
  `);
  writeFileSync(path.join(framework, 'NativeReferences.js'), `
    exports.withGlobalNativeRefs = (attribution, body) => {
      if (attribution !== 'bluetooth') throw new Error('Expected Bluetooth callback attribution');
      return body();
    };
  `);
  symlinkSync(path.join(root, 'valdi/node_modules/valibot'), path.join(directory, 'node_modules/valibot'), 'junction');
  for (const file of readdirSync(source)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    writeFileSync(path.join(directory, file.replace(/\.ts$/, '.js')), ts.transpileModule(
      readFileSync(path.join(source, file), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText);
  }
  writeFileSync(path.join(directory, 'Bluetooth.js'), 'exports.getHost = () => exports.host;');
  const require = createRequire(path.join(directory, 'test.cjs'));
  const admitted: Call[] = [];
  const started: Call[] = [];
  const active = new Map<string, Call>();
  const pending = new Map<string, Call[]>();
  let events: any;
  const key = (deviceId: string) => deviceId.trim().toLowerCase();
  const submit = (operation: string, deviceId: string, params?: any) => new Promise((resolve, reject) => {
    const call = { operation, deviceId, params, resolve, reject };
    admitted.push(call);
    const id = key(deviceId);
    if (!active.has(id)) {
      active.set(id, call);
      started.push(call);
    }
    else pending.set(id, [...pending.get(id) ?? [], call]);
  });
  const cancel = (deviceId: string, error: Error) => {
    const id = key(deviceId);
    active.get(id)?.reject(error);
    active.delete(id);
    for (const call of pending.get(id) ?? []) call.reject(error);
    pending.delete(id);
  };
  const host = {
    setEvents(value: any) { events = value; },
    openBluetoothAdapter: async () => {},
    closeBluetoothAdapter: async () => {
      for (const id of [...active.keys()]) cancel(id, new Error('E_BLE_NOT_INITIALIZED:Session closed'));
    },
    createBLEConnection: async (_deviceId: string) => {},
    closeBLEConnection: async (deviceId: string) => cancel(deviceId, new Error('E_BLE_NOT_CONNECTED:Disconnected')),
    getBLEDeviceServices: (deviceId: string) => submit('services', deviceId),
    getBLEDeviceCharacteristics: (deviceId: string, serviceId: string) => submit('characteristics', deviceId, { serviceId }),
    getBLEDeviceRSSI: (deviceId: string) => submit('rssi', deviceId),
    notifyBLECharacteristicValueChange: (params: any) => submit('notify', params.deviceId, params),
    writeBLECharacteristicValue: (params: any) => submit('write', params.deviceId, params),
    readBLECharacteristicValue: (params: any) => submit('read', params.deviceId, params),
    setBLEMTU: (deviceId: string, mtu: number) => submit('mtu', deviceId, { mtu }),
  };
  require('./Bluetooth.js').host = host;
  const api = require('./index.js');
  return {
    api: api.bluetoothApi(), admitted, started, active, host, require,
    get events() { return events; },
    finish(deviceId: string, value?: any) {
      const id = key(deviceId);
      const call = active.get(id);
      assert.ok(call, `Expected active native call for ${deviceId}`);
      active.delete(id);
      const next = pending.get(id)?.shift();
      if (next) {
        active.set(id, next);
        started.push(next);
      }
      call.resolve(value);
    },
    disconnect(deviceId: string) {
      cancel(deviceId, new Error('E_BLE_NOT_CONNECTED:Disconnected'));
      events.connectStateChange({ deviceId, connected: false });
    },
    powerOff() {
      for (const id of [...active.keys()]) cancel(id, new Error('E_BLE_ADAPTER_NOT_AVAILABLE:Powered off'));
      events.adapterStateChange({ available: false, discovering: false });
    },
  };
}

const characteristic = { deviceId: 'A', serviceId: '180D', characteristicId: '2A37' };
const flush = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
const failure = (errCode: number, errMsg: string) => (error: any) => {
  assert.equal(error.errCode, errCode);
  assert.equal(error.errno, errCode);
  assert.equal(error.errMsg, errMsg);
  return true;
};

test('write snapshots caller bytes at admission, including writes waiting behind active work', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const services = f.api.getBLEDeviceServices({ deviceId: 'A' });
  await flush();
  const value = Uint8Array.of(1, 2, 3);
  const first = f.api.writeBLECharacteristicValue({ ...characteristic, value: value.buffer });
  value.fill(9);
  const second = f.api.writeBLECharacteristicValue({ ...characteristic, value: value.buffer });
  value.fill(7);
  await flush();
  assert.deepEqual(f.admitted.map(call => call.operation), ['services', 'write', 'write']);
  assert.deepEqual([...f.admitted[1].params.value], [1, 2, 3]);
  assert.deepEqual([...f.admitted[2].params.value], [9, 9, 9]);
  f.finish('A', []);
  await services;
  await flush();
  assert.deepEqual([...f.active.get('a')!.params.value], [1, 2, 3]);
  f.finish('A');
  await first;
  await flush();
  assert.deepEqual([...f.active.get('a')!.params.value], [9, 9, 9]);
  f.finish('A');
  await second;
});

test('all device operations enter native in public call order before any previous result completes', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const calls = [
    f.api.getBLEDeviceServices({ deviceId: ' A ' }),
    f.api.getBLEDeviceCharacteristics({ deviceId: 'a', serviceId: '180D' }),
    f.api.getBLEDeviceRSSI({ deviceId: 'A' }),
    f.api.notifyBLECharacteristicValueChange({ ...characteristic, state: true }),
    f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint8Array.of(1).buffer }),
    f.api.readBLECharacteristicValue(characteristic),
    f.api.setBLEMTU({ deviceId: 'A', mtu: 128 }),
  ];
  assert.equal(f.admitted.length, 0, 'one checkpoint preserves same-turn cancellation');
  await Promise.resolve();
  const order = ['services', 'characteristics', 'rssi', 'notify', 'write', 'read', 'mtu'];
  assert.deepEqual(f.admitted.map(call => call.operation), order);
  assert.deepEqual(f.started.map(call => call.operation), ['services']);
  assert.equal(f.admitted[0].deviceId, 'A');
  assert.equal(f.admitted[1].params.serviceId, '0000180d-0000-1000-8000-00805f9b34fb');
  const values = [[{ uuid: '180D', isPrimary: true }], [{ uuid: '2A37', properties: {} }], -42,
    undefined, undefined, undefined, 128];
  for (let index = 0; index < calls.length; index++) {
    f.finish('A', values[index]);
    const result = await calls[index];
    assert.match(result.errMsg, /:ok$/);
    if (index === 0) assert.equal(result.services[0].uuid, '0000180d-0000-1000-8000-00805f9b34fb');
    if (index === 1) assert.equal(result.characteristics[0].uuid, '00002a37-0000-1000-8000-00805f9b34fb');
    assert.deepEqual(f.started.map(call => call.operation), order.slice(0, Math.min(index + 2, order.length)));
  }
});

test('write snapshots are independent for overlapping caller views; incoming subviews retain their own byte range', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const backing = Uint8Array.of(99, 1, 2, 3, 88);
  const left = backing.subarray(1, 3);
  const right = backing.subarray(2, 4);
  // Public writes accept ArrayBuffer, not ArrayBufferView; use the callers'
  // exact range buffers rather than expanding them to their backing storage.
  const leftBuffer = left.buffer.slice(left.byteOffset, left.byteOffset + left.byteLength);
  const rightBuffer = right.buffer.slice(right.byteOffset, right.byteOffset + right.byteLength);
  const first = f.api.writeBLECharacteristicValue({ ...characteristic, value: leftBuffer });
  const second = f.api.writeBLECharacteristicValue({ ...characteristic, value: rightBuffer });
  new Uint8Array(leftBuffer).fill(6);
  new Uint8Array(rightBuffer).fill(7);
  backing.fill(0);
  await flush();
  assert.deepEqual([...f.active.get('a')!.params.value], [1, 2]);
  f.finish('A');
  await first;
  await flush();
  assert.deepEqual([...f.active.get('a')!.params.value], [2, 3]);
  f.finish('A');
  await second;
  const received: number[][] = [];
  const callback = (event: any) => received.push([...new Uint8Array(event.value)]);
  f.api.onBLECharacteristicValueChange(callback);
  const incoming = Uint8Array.of(99, 4, 5, 88);
  f.events.characteristicUpdate({ ...characteristic, value: incoming.subarray(1, 3) });
  assert.deepEqual(received, [[4, 5]]);
  f.api.offBLECharacteristicValueChange(callback);
});

test('writes accept Uint8Array subviews and snapshot before native dispatch', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const source = Uint8Array.of(99, 1, 2, 3, 88);
  const first = f.api.writeBLECharacteristicValue({ ...characteristic, value: source.subarray(1, 3) });
  void first.catch(() => {});
  source[2] = 7;
  const second = f.api.writeBLECharacteristicValue({ ...characteristic, value: source.subarray(2, 4) });
  void second.catch(() => {});
  source.fill(0);
  await flush();
  assert.equal(f.admitted.length, 2, 'both byte views must be admitted');
  assert.deepEqual([...f.admitted[0].params.value], [1, 2]);
  assert.deepEqual([...f.admitted[1].params.value], [7, 3]);
  assert.notEqual(f.admitted[0].params.value.buffer, source.buffer);
  assert.notEqual(f.admitted[0].params.value.buffer, f.admitted[1].params.value.buffer);
  f.finish('A');
  await first;
  f.finish('A');
  await second;
});

test('native adapter forwards the admitted byte snapshot without copying it again', async t => {
  const f = fixture(t);
  const owned = Uint8Array.of(1, 2, 3);
  const sent = f.require('./native.js').nativeBLE.writeBLECharacteristicValue({ ...characteristic, value: owned });
  assert.equal(f.admitted[0].params.value, owned);
  f.finish('A');
  await sent;
});

test('whole-buffer receive reuses native storage and preserves bytes retained by JS', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const received: ArrayBuffer[] = [];
  f.api.onBLECharacteristicValueChange((event: any) => received.push(event.value));
  const first = Uint8Array.of(1, 2);
  const next = Uint8Array.of(3, 4);
  f.events.characteristicUpdate({ ...characteristic, value: first });
  f.events.characteristicUpdate({ ...characteristic, value: next });
  assert.equal(received[0], first.buffer);
  assert.equal(received[1], next.buffer);
  assert.deepEqual([...new Uint8Array(received[0])], [1, 2]);
});

test('native work on independent devices progresses independently', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const a = f.api.getBLEDeviceServices({ deviceId: 'A' });
  const b = f.api.getBLEDeviceRSSI({ deviceId: 'B' });
  await flush();
  assert.equal(f.active.get('a')?.operation, 'services');
  assert.equal(f.active.get('b')?.operation, 'rssi');
  f.finish('B', -42);
  assert.deepEqual(await b, { errMsg: 'getBLEDeviceRSSI:ok', RSSI: -42 });
  assert.equal(f.active.get('a')?.operation, 'services');
  f.finish('A', []);
  await a;
});

test('public validation and native errors preserve their WeChat error codes', async t => {
  const f = fixture(t);
  await assert.rejects(f.api.readBLECharacteristicValue(characteristic),
    failure(10000, 'readBLECharacteristicValue:fail not init'));
  await f.api.openBluetoothAdapter();
  await assert.rejects(f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint16Array.of(1) }),
    failure(10013, 'writeBLECharacteristicValue:fail invalid_data'));
  assert.equal(f.admitted.length, 0);
  const read = f.api.readBLECharacteristicValue(characteristic);
  const rejected = assert.rejects(read, failure(10005, 'readBLECharacteristicValue:fail no characteristic'));
  await flush();
  f.active.get('a')!.reject(new Error("java.lang.IllegalStateException: 'E_BLE_CHARACTERISTIC_NOT_FOUND:Missing'"));
  await rejected;
});

test('same-turn disconnect cancels before native dispatch and reconnect starts a fresh device generation', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const rejected = assert.rejects(read, failure(10006, 'readBLECharacteristicValue:fail no connection'));
  await f.api.closeBLEConnection({ deviceId: 'A' });
  await rejected;
  assert.equal(f.admitted.length, 0);
  await f.api.createBLEConnection({ deviceId: 'A' });
  const next = f.api.getBLEDeviceRSSI({ deviceId: 'A' });
  await flush();
  f.finish('A', -30);
  assert.equal((await next).RSSI, -30);
});

test('same-turn adapter close cancels before dispatch and reopening accepts new work', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const rejected = assert.rejects(read, failure(10000, 'readBLECharacteristicValue:fail not init'));
  await f.api.closeBluetoothAdapter();
  await rejected;
  assert.equal(f.admitted.length, 0);
  await f.api.openBluetoothAdapter();
  const next = f.api.getBLEDeviceServices({ deviceId: 'A' });
  await flush();
  f.finish('A', []);
  assert.deepEqual((await next).services, []);
});

test('same-turn adapter close prevents every former FIFO operation from reaching native', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const calls = [
    f.api.getBLEDeviceServices({ deviceId: 'A' }),
    f.api.getBLEDeviceCharacteristics({ deviceId: 'A', serviceId: '180D' }),
    f.api.getBLEDeviceRSSI({ deviceId: 'A' }),
    f.api.notifyBLECharacteristicValueChange({ ...characteristic, state: true }),
    f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint8Array.of(1).buffer }),
    f.api.readBLECharacteristicValue(characteristic),
    f.api.setBLEMTU({ deviceId: 'A', mtu: 128 }),
  ];
  const rejected = calls.map(call => assert.rejects(call, (error: any) => {
    assert.equal(error.errCode, 10000);
    assert.match(error.errMsg, /:fail not init$/);
    return true;
  }));
  await f.api.closeBluetoothAdapter();
  await Promise.all(rejected);
  assert.equal(f.admitted.length, 0);
});

test('disconnect then reconnect in one turn cannot admit the old device generation', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const rejected = assert.rejects(read, failure(10006, 'readBLECharacteristicValue:fail no connection'));
  f.disconnect(' a ');
  f.events.connectStateChange({ deviceId: 'A', connected: true });
  const next = f.api.getBLEDeviceRSSI({ deviceId: 'A' });
  await rejected;
  await flush();
  assert.deepEqual(f.admitted.map(call => call.operation), ['rssi']);
  f.finish('A', -31);
  assert.equal((await next).RSSI, -31);
});

test('power off then on in one turn cannot admit work from before the power transition', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const rejected = assert.rejects(read, failure(10001, 'readBLECharacteristicValue:fail not available'));
  f.powerOff();
  f.events.adapterStateChange({ available: true, discovering: false });
  await f.api.createBLEConnection({ deviceId: 'A' });
  await rejected;
  const next = f.api.getBLEDeviceRSSI({ deviceId: 'A' });
  await flush();
  assert.deepEqual(f.admitted.map(call => call.operation), ['rssi']);
  f.finish('A', -32);
  assert.equal((await next).RSSI, -32);
});

test('late connect success after disconnect cannot clear the disconnected device generation', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  let resolve!: () => void;
  f.host.createBLEConnection = () => new Promise<void>(done => { resolve = done; });
  const connection = f.api.createBLEConnection({ deviceId: 'A' });
  const rejected = assert.rejects(connection, failure(10006, 'createBLEConnection:fail no connection'));
  await f.api.closeBLEConnection({ deviceId: ' a ' });
  resolve();
  await rejected;
  await assert.rejects(f.api.readBLECharacteristicValue(characteristic),
    failure(10006, 'readBLECharacteristicValue:fail no connection'));
  assert.equal(f.admitted.length, 0);
});

test('late connect success after power recovery cannot revive the old adapter generation', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  let resolve!: () => void;
  f.host.createBLEConnection = () => new Promise<void>(done => { resolve = done; });
  const connection = f.api.createBLEConnection({ deviceId: 'A' });
  const rejected = assert.rejects(connection, failure(10001, 'createBLEConnection:fail not available'));
  f.powerOff();
  f.events.adapterStateChange({ available: true, discovering: false });
  resolve();
  await rejected;
});

test('native cancels admitted active and pending work; late results cannot settle a fresh connection', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const write = f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint8Array.of(1).buffer });
  const rejectedRead = assert.rejects(read, failure(10006, 'readBLECharacteristicValue:fail no connection'));
  const rejectedWrite = assert.rejects(write, failure(10006, 'writeBLECharacteristicValue:fail no connection'));
  await flush();
  assert.equal(f.admitted.length, 2);
  const old = [...f.admitted];
  f.disconnect('A');
  await Promise.all([rejectedRead, rejectedWrite]);
  await f.api.createBLEConnection({ deviceId: 'A' });
  let settled = false;
  const next = f.api.readBLECharacteristicValue(characteristic).then((value: any) => { settled = true; return value; });
  await flush();
  for (const call of old) call.resolve(undefined);
  await flush();
  assert.equal(settled, false);
  assert.equal(f.active.get('a'), f.admitted[2]);
  f.finish('A');
  assert.equal((await next).errMsg, 'readBLECharacteristicValue:ok');
});

test('native adapter close cancels all admitted device work and late connect completion cannot reopen it', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  let resolve!: () => void;
  f.host.createBLEConnection = () => new Promise<void>(done => { resolve = done; });
  const connection = f.api.createBLEConnection({ deviceId: 'B' });
  const rejectedConnection = assert.rejects(connection, failure(10000, 'createBLEConnection:fail not init'));
  const read = f.api.readBLECharacteristicValue(characteristic);
  const write = f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint8Array.of(1).buffer });
  const rejectedRead = assert.rejects(read, failure(10000, 'readBLECharacteristicValue:fail not init'));
  const rejectedWrite = assert.rejects(write, failure(10000, 'writeBLECharacteristicValue:fail not init'));
  await flush();
  assert.equal(f.admitted.length, 2);
  await f.api.closeBluetoothAdapter();
  await f.api.openBluetoothAdapter();
  resolve();
  await Promise.all([rejectedConnection, rejectedRead, rejectedWrite]);
  const next = f.api.getBLEDeviceServices({ deviceId: 'A' });
  await flush();
  f.finish('A', []);
  assert.deepEqual((await next).services, []);
});

test('native power invalidation rejects all admitted operations with the unchanged public error', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  const write = f.api.writeBLECharacteristicValue({ ...characteristic, value: Uint8Array.of(1).buffer });
  const rejectedRead = assert.rejects(read, failure(10001, 'readBLECharacteristicValue:fail not available'));
  const rejectedWrite = assert.rejects(write, failure(10001, 'writeBLECharacteristicValue:fail not available'));
  await flush();
  assert.equal(f.admitted.length, 2);
  f.powerOff();
  await Promise.all([rejectedRead, rejectedWrite]);
});

test('notifications bypass blocked native work and public listener teardown leaves no page callbacks', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const read = f.api.readBLECharacteristicValue(characteristic);
  await flush();
  const seen: any[] = [];
  const first = (value: any) => seen.push(['first', value]);
  const second = (value: any) => seen.push(['second', value]);
  f.api.onBLECharacteristicValueChange(first);
  f.api.onBLECharacteristicValueChange(second);
  f.api.offBLECharacteristicValueChange(first);
  f.events.characteristicUpdate({ ...characteristic, value: Uint8Array.of(99, 4, 5, 88).subarray(1, 3) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], 'second');
  assert.equal(seen[0][1].serviceId, '0000180d-0000-1000-8000-00805f9b34fb');
  assert.equal(seen[0][1].characteristicId, '00002a37-0000-1000-8000-00805f9b34fb');
  assert.deepEqual([...new Uint8Array(seen[0][1].value)], [4, 5]);
  f.api.offBLECharacteristicValueChange();
  f.events.characteristicUpdate({ ...characteristic, value: Uint8Array.of(6) });
  assert.equal(seen.length, 1);
  f.finish('A');
  assert.equal((await read).errMsg, 'readBLECharacteristicValue:ok');
});

test('page listener teardown preserves runtime disconnect/power observers and native completion', async t => {
  const f = fixture(t);
  await f.api.openBluetoothAdapter();
  const pageEvents: any[] = [];
  const listener = (event: any) => pageEvents.push(event);
  f.api.onBLEConnectionStateChange(listener);
  f.api.onBluetoothAdapterStateChange(listener);
  f.api.onBLECharacteristicValueChange(listener);
  const read = f.api.readBLECharacteristicValue(characteristic);
  await flush();
  f.api.offBLEConnectionStateChange(listener);
  f.api.offBluetoothAdapterStateChange(listener);
  f.api.offBLECharacteristicValueChange(listener);
  f.events.characteristicUpdate({ ...characteristic, value: Uint8Array.of(1) });
  f.finish('A');
  assert.equal((await read).errMsg, 'readBLECharacteristicValue:ok');
  f.disconnect('A');
  await assert.rejects(f.api.readBLECharacteristicValue(characteristic),
    failure(10006, 'readBLECharacteristicValue:fail no connection'));
  f.powerOff();
  await assert.rejects(f.api.getBLEDeviceRSSI({ deviceId: 'B' }),
    failure(10001, 'getBLEDeviceRSSI:fail not available'));
  assert.deepEqual(pageEvents, []);
});
