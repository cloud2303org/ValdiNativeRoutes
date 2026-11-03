// Parent-owned QA entry glue: bundle this CommonJS file as
// harmony_business/src/promise-consumer in the real Hermes business fixture.
// No Promise/native-host replacements: imports the production native factory
// and the production permission Value installed in the bootstrap global.
'use strict';

const radio = [
  'openBluetoothAdapter', 'closeBluetoothAdapter', 'getBluetoothAdapterState',
  'startBluetoothDevicesDiscovery', 'startBluetoothDevicesDiscoveryWithNames',
  'startBluetoothDevicesDiscoveryWithAddresses', 'stopBluetoothDevicesDiscovery', 'getBluetoothDevices',
  'createBLEConnection', 'closeBLEConnection', 'makeBluetoothPair', 'isBluetoothDevicePaired',
  'getBLEDeviceServices', 'getBLEDeviceRSSI', 'getBLEDeviceCharacteristics',
  'notifyBLECharacteristicValueChange', 'writeBLECharacteristicValue', 'readBLECharacteristicValue',
  'setBLEMTU', 'getBLEMTU', 'getConnectedBluetoothDevices', 'createBLEPeripheralServer',
  'addPeripheralService', 'removePeripheralService', 'startPeripheralAdvertising',
  'stopPeripheralAdvertising', 'writePeripheralCharacteristicValue', 'closeBLEPeripheralServer',
];
const permission = ['check', 'requestMultiple', 'openSettings'];
const events = [
  'deviceFound', 'adapterStateChange', 'connectStateChange', 'characteristicUpdate', 'mtuChange',
  'peripheralReadRequest', 'peripheralWriteRequest', 'peripheralSubscribed', 'peripheralUnsubscribed',
  'peripheralConnectionStateChange',
];
let retained;
let previous;
let running = false;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function expectSyncThrow(call, code) {
  let error;
  try { call(); } catch (caught) { error = caught; }
  check(error !== undefined && String(error).includes(code), 'expected synchronous ' + code);
}

// Valid generated-interface inputs: required arguments are now unmarshalled
// before the unsupported implementation is entered.
function argumentsFor(method) {
  const ids = { deviceId: 'qa-device', serviceId: 'qa-service', characteristicId: 'qa-characteristic' };
  switch (method) {
    case 'openBluetoothAdapter': return ['central'];
    case 'startBluetoothDevicesDiscovery': return [{}];
    case 'startBluetoothDevicesDiscoveryWithNames':
    case 'startBluetoothDevicesDiscoveryWithAddresses':
    case 'getConnectedBluetoothDevices':
    case 'requestMultiple': return [[]];
    case 'createBLEConnection': return ['qa-device', undefined];
    case 'closeBLEConnection':
    case 'isBluetoothDevicePaired':
    case 'getBLEDeviceServices':
    case 'getBLEDeviceRSSI':
    case 'stopPeripheralAdvertising':
    case 'closeBLEPeripheralServer':
    case 'check': return ['qa-id'];
    case 'makeBluetoothPair': return [{ deviceId: 'qa-device', pin: '0000', timeout: 1000 }];
    case 'getBLEDeviceCharacteristics':
    case 'removePeripheralService': return ['qa-id', 'qa-service'];
    case 'notifyBLECharacteristicValueChange': return [{ ...ids, state: true }];
    case 'writeBLECharacteristicValue': return [{ ...ids, value: new Uint8Array(0) }];
    case 'readBLECharacteristicValue': return [ids];
    case 'setBLEMTU': return ['qa-device', 23];
    case 'getBLEMTU': return ['qa-device', undefined];
    case 'addPeripheralService': return ['qa-server', { uuid: 'qa-service', characteristics: [] }];
    case 'startPeripheralAdvertising': return [{ serverId: 'qa-server', connectable: true,
      deviceName: 'qa', serviceUuids: [], manufacturerData: [], powerLevel: 'medium' }];
    case 'writePeripheralCharacteristicValue': return [{ ...ids, serverId: 'qa-server',
      value: new Uint8Array(0), needNotify: false }];
    default: return [];
  }
}

async function expectRejected(object, method, code) {
  // Any synchronous throw fails the phase, including a marshalling exception.
  const promise = object[method](...argumentsFor(method));
  check(promise instanceof Promise, method + ' must return a real JS Promise');
  check(typeof promise.then === 'function', method + ' must be thenable');
  let rejected = false;
  try {
    await promise;
  } catch (error) {
    rejected = true;
    check(String(error).includes(code), method + ' rejection must contain ' + code);
  }
  check(rejected, method + ' unexpectedly fulfilled');
}

async function expectWechatRejected(api, method, errCode, nativeCode) {
  let rejected = false;
  try {
    await api[method]();
  } catch (error) {
    rejected = true;
    check(error.errCode === errCode && error.nativeCode === nativeCode, method + ' wrong WeChat classification');
  }
  check(rejected, method + ' unexpectedly reported success');
}

async function run(phase) {
  check(!running, 'a QA phase is already running');
  running = true;
  try {
    const report = globalThis.__harmonyBusinessPromiseQAReport;
    check(typeof report === 'function', 'missing native QA report callback');
    check(previous === ({ live: undefined, closed: 'live', released: 'closed' })[phase],
      'QA phases must run live -> closed -> released');
    if (phase === 'live') {
      const module = require('bluetooth/src/Bluetooth');
      const host = module.getHost();
      check(host && typeof host.then !== 'function', 'getHost must remain synchronous');
      const sink = {};
      events.forEach(name => { sink[name] = () => { throw new Error('unexpected BLE event: ' + name); }; });
      check(host.setEvents(sink) === undefined, 'setEvents must remain synchronous void');
      retained = { module, host, sink, permissions: globalThis.__harmonyBusinessBootstrap.permissions };
    } else {
      expectSyncThrow(() => retained.module.getHost(), 'E_BUSINESS_HOST_CLOSED');
      expectSyncThrow(() => retained.host.setEvents(retained.sink), 'E_BUSINESS_HOST_CLOSED');
    }
    for (const method of radio) {
      await expectRejected(retained.host, method,
        phase === 'live' ? 'E_BLE_SYSTEM_NOT_SUPPORTED' : 'E_BLE_NOT_INITIALIZED');
    }
    for (const method of permission) {
      await expectRejected(retained.permissions, method,
        phase === 'live' ? 'E_PERMISSION_SYSTEM_NOT_SUPPORTED' : 'E_BUSINESS_HOST_CLOSED');
    }
    if (phase === 'live') {
      // Requires the parent's normal startApp() first, so its existing
      // BluetoothPermissions service is installed. Exercise the exact TS
      // consumer implicated in P1: neither open may mark this adapter opened.
      const api = require('bluetooth/src/extension').bluetoothApi();
      await expectWechatRejected(api, 'openBluetoothAdapter', 10009, 'E_BLE_SYSTEM_NOT_SUPPORTED');
      await expectWechatRejected(api, 'openBluetoothAdapter', 10009, 'E_BLE_SYSTEM_NOT_SUPPORTED');
      await expectWechatRejected(api, 'getBluetoothAdapterState', 10000, 'E_BLE_NOT_INITIALIZED');
    }
    previous = phase;
    report(JSON.stringify({
      phase, ok: true, realPromisesRejected: radio.length + permission.length,
      wechatChecks: phase === 'live' ? 3 : 0,
    }));
  } finally {
    running = false;
  }
}

function start(phase) {
  // The entry returns synchronously. Parent waits for the callback, keeping the
  // real JS scheduler/microtasks alive, rather than assuming the call finished QA.
  run(phase).catch(error => {
    globalThis.__harmonyBusinessPromiseQAReport(JSON.stringify({ phase, ok: false, error: String(error) }));
  });
}

exports.live = () => start('live');
exports.closed = () => start('closed');
exports.released = () => start('released');
