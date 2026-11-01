import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { root } from './pipeline';

// Run the real module's TS API in Node, replacing only its native entry point.
// Every fixture gets its own module cache and application-scoped permission queue.
function fixture(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-bluetooth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(root, 'valdi/modules/bluetooth/src');
  const modules = path.join(directory, 'node_modules');
  mkdirSync(modules);
  symlinkSync(path.join(root, 'valdi/node_modules/valibot'), path.join(modules, 'valibot'), 'junction');
  for (const file of readdirSync(source)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const code = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    writeFileSync(path.join(directory, file.replace(/\.ts$/, '.js')), code);
  }
  writeFileSync(path.join(directory, 'Bluetooth.js'),
    'exports.getHost = () => { exports.calls++; return exports.host; }; exports.calls = 0;');
  const require = createRequire(path.join(directory, 'test.cjs'));
  const entry = require('./Bluetooth.js');
  let events: any;
  let installs = 0;
  entry.host = { setEvents(value: any) { events = value; installs++; } };
  const api = require('./index.js');
  let tail = Promise.resolve();
  const permissionCalls: string[][] = [];
  const service = {
    isAndroid: () => true,
    androidSdk: () => 36,
    requestAndroidPermissions: async (permissions: readonly string[]) => {
      permissionCalls.push([...permissions]);
      return { status: 'granted' };
    },
    serializePermissionRequest<T>(request: () => Promise<T>, checkActive?: () => void): Promise<T> {
      const value = tail.then(() => { checkActive?.(); return request(); });
      tail = value.then(() => undefined, () => undefined);
      return value;
    },
  };
  return { require, entry, api, service, permissionCalls, get events() { return events; }, get installs() { return installs; } };
}

test('Bluetooth owns one native host and event sink across consumers and listener removal', t => {
  const f = fixture(t);
  f.api.initializeBluetooth(f.service);
  f.api.initializeBluetooth(f.service);
  const host = f.require('./BleHost.js');
  const channels = f.require('./events.js');
  assert.equal(host.bleHost(), host.bleHost());
  assert.equal(f.entry.calls, 1);
  assert.equal(f.installs, 1);
  const values: number[] = [];
  const first = channels.listen('mtuChange', (event: any) => values.push(event.mtu));
  const second = channels.listen('mtuChange', (event: any) => values.push(event.mtu * 2));
  channels.unlisten('mtuChange', first);
  f.events.mtuChange({ deviceId: 'device', mtu: 128 });
  assert.deepEqual(values, [256]);
  channels.unlisten('mtuChange', second);
  f.events.mtuChange({ deviceId: 'device', mtu: 64 });
  assert.deepEqual(values, [256]);
  assert.equal(f.entry.calls, 1);
  assert.throws(() => f.api.initializeBluetooth({ ...f.service }), /already configured/);
});

test('Bluetooth uses the supplied shared permission queue and platform-specific permission sets', async t => {
  const f = fixture(t);
  const permissions = f.require('./permissions.js');
  const ble = f.require('./permission.js');
  assert.throws(() => permissions.androidSdk(), /not configured/);
  f.api.initializeBluetooth(f.service);
  assert.equal(await ble.requestBlePermissions('central'), true);
  assert.equal(await ble.requestBlePermissions('peripheral'), true);
  f.service.androidSdk = () => 29;
  assert.equal(await ble.requestBlePermissions('central'), true);
  assert.deepEqual(f.permissionCalls, [
    ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'],
    ['android.permission.BLUETOOTH_ADVERTISE', 'android.permission.BLUETOOTH_CONNECT'],
    ['android.permission.ACCESS_FINE_LOCATION'],
  ]);
  f.service.isAndroid = () => false;
  assert.equal(await ble.requestBlePermissions(), true);
  assert.equal(f.permissionCalls.length, 3);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  const wifi = f.service.serializePermissionRequest(async () => { order.push('wifi'); await blocked; });
  const bluetooth = permissions.serializePermissionRequest(async () => { order.push('bluetooth'); });
  await Promise.resolve();
  assert.deepEqual(order, ['wifi']);
  release();
  await Promise.all([wifi, bluetooth]);
  assert.deepEqual(order, ['wifi', 'bluetooth']);
});

test('Bluetooth public API keeps native errors and central/peripheral mode behavior after extraction', async t => {
  const f = fixture(t);
  f.api.initializeBluetooth(f.service);
  f.entry.host.openBluetoothAdapter = async () => {};
  f.entry.host.closeBluetoothAdapter = async () => {};
  f.entry.host.getBluetoothDevices = async () => [];
  const api = f.api.bluetoothApi();
  assert.equal((await api.openBluetoothAdapter()).errMsg, 'openBluetoothAdapter:ok');
  assert.deepEqual((await api.getBluetoothDevices()).devices, []);
  f.entry.host.getBluetoothDevices = async () => { throw new Error("java.lang.IllegalStateException: 'E_BLE_NOT_AVAILABLE:radio unavailable'"); };
  await assert.rejects(api.getBluetoothDevices(), /radio unavailable/);
  assert.equal((await api.closeBluetoothAdapter()).errMsg, 'closeBluetoothAdapter:ok');
  await assert.rejects(api.getBluetoothDevices(), (error: any) =>
    error.errCode === 10000 && error.errMsg === 'getBluetoothDevices:fail not init');
});
