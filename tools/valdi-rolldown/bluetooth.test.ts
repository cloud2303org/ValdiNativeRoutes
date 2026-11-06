import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { root, valdiSourceRoot } from './pipeline';

// Run the real TS API and framework NativeReferences wrapper in Node.
// Native capabilities, runtime context and the shared permissions module are fixture boundaries.
// Every fixture gets its own module cache and application-scoped permission queue.
function fixture(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valdi-bluetooth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(root, 'valdi/modules/bluetooth/src');
  const modules = path.join(directory, 'node_modules');
  mkdirSync(modules);
  const framework = path.join(modules, 'valdi_core/src');
  const sharedPermissions = path.join(modules, 'permissions/src');
  const common = path.join(modules, 'native_common/src');
  mkdirSync(framework, { recursive: true });
  mkdirSync(sharedPermissions, { recursive: true });
  mkdirSync(common, { recursive: true });
  for (const file of ['bindMethods', 'nativeCall']) {
    writeFileSync(path.join(common, `${file}.js`), ts.transpileModule(
      readFileSync(path.join(root, 'valdi/modules/native_common/src', `${file}.ts`), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText);
  }
  const frameworkSource = valdiSourceRoot();
  assert.ok(frameworkSource, 'Expected local framework sources for NativeReferences');
  writeFileSync(path.join(framework, 'NativeReferences.js'), ts.transpileModule(
    readFileSync(path.join(frameworkSource, 'src/valdi_modules/src/valdi/valdi_core/src/NativeReferences.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText);
  writeFileSync(path.join(framework, 'ValdiRuntimeProvider.js'), 'exports.getValdiRuntime = () => exports.runtime;');
  writeFileSync(path.join(sharedPermissions, 'index.js'), 'module.exports = {};');
  symlinkSync(path.join(root, 'valdi/node_modules/valibot'), path.join(modules, 'valibot'), 'junction');
  for (const file of readdirSync(source)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const code = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    writeFileSync(path.join(directory, file.replace(/\.ts$/, '.js')), code);
  }
  writeFileSync(path.join(directory, 'Bluetooth.js'),
    'exports.getHost = () => { exports.onGetHost(); exports.calls++; return exports.host; }; exports.calls = 0;');
  const require = createRequire(path.join(directory, 'test.cjs'));
  const entry = require('./Bluetooth.js');
  let context: string | undefined = 'first-page';
  const contexts: (string | undefined)[] = [];
  const attributions: string[] = [];
  require('valdi_core/src/ValdiRuntimeProvider').runtime = {
    pushCurrentContext(value: string | undefined) { contexts.push(context); context = value; },
    popCurrentContext() { context = contexts.pop(); },
    withCallbackAttribution(attribution: string, body: () => unknown) {
      attributions.push(attribution);
      return body();
    },
  };
  entry.onGetHost = () => {
    assert.equal(context, undefined, 'native host acquisition belongs to the global scope');
    assert.equal(attributions.at(-1), 'bluetooth');
  };
  let events: any;
  let installs = 0;
  let eventContext: string | undefined;
  entry.host = { setEvents(value: any) { eventContext = context; events = value; installs++; } };
  let tail = Promise.resolve();
  const permissionCalls: string[][] = [];
  const service = Object.assign(require('permissions/src/index'), {
    ANDROID_PERMISSIONS: Object.fromEntries([
      'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'BLUETOOTH_ADVERTISE',
    ].map(name => [name, `android.permission.${name}`])),
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
  });
  const api = require('./index.js');
  return {
    require, entry, api, service, permissionCalls, attributions,
    get context() { return context; },
    get eventContext() { return eventContext; },
    get events() { return events; },
    get installs() { return installs; },
  };
}

test('Bluetooth owns one native host and event sink across consumers and listener removal', t => {
  const f = fixture(t);
  f.api.bluetoothApi();
  f.api.bluetoothApi();
  assert.equal(f.entry.calls, 0, 'importing the module and constructing facades must stay lazy');
  assert.equal(f.installs, 0);
  assert.equal('initializeBluetooth' in f.api, false);
  assert.equal('configureBluetoothPermissions' in f.require('./permissions.js'), false);
  const host = f.require('./BleHost.js');
  const channels = f.require('./events.js');
  assert.equal(host.bleHost(), host.bleHost());
  assert.equal(f.entry.calls, 1);
  assert.equal(f.installs, 1);
  assert.equal(f.eventContext, undefined, 'native event callbacks belong to the global scope');
  assert.equal(f.context, 'first-page', 'framework wrapper restores the calling page context');
  assert.deepEqual(f.attributions, ['bluetooth']);
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
});

test('Bluetooth consumes the shared permission queue without configuration and keeps platform-specific permission sets', async t => {
  const f = fixture(t);
  const permissions = f.require('./permissions.js');
  const ble = f.require('./permission.js');
  assert.equal(permissions.androidSdk(), 36);
  assert.equal(permissions.serializePermissionRequest, f.service.serializePermissionRequest);
  assert.equal(permissions.requestAndroidPermissions, f.service.requestAndroidPermissions);
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
  const nfc = f.service.serializePermissionRequest(async () => { order.push('nfc'); });
  await Promise.resolve();
  assert.deepEqual(order, ['wifi']);
  release();
  await Promise.all([wifi, bluetooth, nfc]);
  assert.deepEqual(order, ['wifi', 'bluetooth', 'nfc']);
});

test('first public iOS open waits for the shared prompt queue without acquiring the host early', async t => {
  const f = fixture(t);
  f.service.isAndroid = () => false;
  f.entry.host.openBluetoothAdapter = async () => {};
  let release!: () => void;
  let started = false;
  const wifi = f.service.serializePermissionRequest(() => {
    started = true;
    return new Promise<void>(resolve => { release = resolve; });
  });
  const opening = f.api.bluetoothApi().openBluetoothAdapter();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(started, true);
  assert.equal(f.entry.calls, 0, 'native iOS open must wait behind other feature prompts');
  assert.equal(f.installs, 0);
  release();
  await wifi;
  assert.equal((await opening).errMsg, 'openBluetoothAdapter:ok');
  assert.equal(f.entry.calls, 1);
  assert.equal(f.installs, 1);
  assert.equal(f.permissionCalls.length, 0);
});

test('Bluetooth public API keeps native errors and central/peripheral mode behavior after extraction', async t => {
  const f = fixture(t);
  f.entry.host.openBluetoothAdapter = async () => {};
  f.entry.host.closeBluetoothAdapter = async () => {};
  f.entry.host.getBluetoothDevices = async () => [];
  const api = f.api.bluetoothApi();
  assert.equal(f.entry.calls, 0);
  assert.equal((await api.openBluetoothAdapter()).errMsg, 'openBluetoothAdapter:ok');
  assert.equal(f.entry.calls, 1);
  assert.equal(f.installs, 1);
  assert.equal(f.eventContext, undefined);
  assert.deepEqual(f.attributions, ['bluetooth']);
  assert.deepEqual((await api.getBluetoothDevices()).devices, []);
  f.entry.host.getBluetoothDevices = async () => { throw new Error("java.lang.IllegalStateException: 'E_BLE_NOT_AVAILABLE:radio unavailable'"); };
  await assert.rejects(api.getBluetoothDevices(), /radio unavailable/);
  assert.equal((await api.closeBluetoothAdapter()).errMsg, 'closeBluetoothAdapter:ok');
  await assert.rejects(api.getBluetoothDevices(), (error: any) =>
    error.errCode === 10000 && error.errMsg === 'getBluetoothDevices:fail not init');
  assert.equal(f.entry.calls, 1);
  assert.equal(f.installs, 1);
});
