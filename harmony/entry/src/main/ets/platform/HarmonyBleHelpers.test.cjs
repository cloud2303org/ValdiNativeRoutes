const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-ble-helpers-'));
const source = fs.readFileSync(path.join(__dirname, 'HarmonyBleHelpers.ets'), 'utf8');
const input = path.join(scratch, 'HarmonyBleHelpers.ts');
fs.writeFileSync(input, source);
const tsc = require.resolve('typescript/bin/tsc', { paths: [path.join(root, 'tools/valdi-rolldown')] });
try {
  cp.execFileSync(process.execPath, [tsc, input, '--target', 'es2021', '--module', 'commonjs',
    '--strict', '--skipLibCheck', '--lib', 'es2021,dom', '--typeRoots', path.join(scratch, 'types'),
    '--outDir', scratch], { stdio: 'pipe' });
} catch (error) {
  console.error(error.stdout?.toString(), error.stderr?.toString());
  throw error;
}
const h = require(path.join(scratch, 'HarmonyBleHelpers.js'));
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));

test('production UUID parser normalizes short/long forms and rejects malformed input', () => {
  assert.equal(h.bleUuid('180D'), '0000180d-0000-1000-8000-00805f9b34fb');
  assert.equal(h.bleUuid('12345678'), '12345678-0000-1000-8000-00805f9b34fb');
  assert.equal(h.bleUuid(' ABCDABCD-1234-5678-9000-ABCDEFABCDEF '), 'abcdabcd-1234-5678-9000-abcdefabcdef');
  for (const invalid of ['', '180', '180G', 'not-a-device-address', '12345678123456781234567812345678']) {
    assert.throws(() => h.bleUuid(invalid), /E_BLE_INVALID_DATA:/);
  }
});

test('production byte conversion preserves subview boundaries and owns both directions', () => {
  const backing = new Uint8Array([9, 1, 2, 3, 9]);
  const buffer = h.bleBuffer(backing.subarray(1, 4));
  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3]);
  backing[1] = 77;
  assert.equal(new Uint8Array(buffer)[0], 1);
  const bytes = h.bleBytes(buffer);
  new Uint8Array(buffer)[0] = 88;
  assert.equal(bytes[0], 1);
});

test('production advertisement decoder parses 16/32/128 bit UUIDs and service data', () => {
  const uuid128 = [0xfb, 0x34, 0x9b, 0x5f, 0x80, 0, 0, 0x80, 0, 0x10, 0, 0, 0x0d, 0x18, 0, 0];
  const packet = new Uint8Array([
    3, 3, 0x0d, 0x18,
    5, 5, 0x78, 0x56, 0x34, 0x12,
    17, 7, ...uuid128,
    5, 0x16, 0x0f, 0x18, 10, 11,
    7, 0x20, 0x78, 0x56, 0x34, 0x12, 12, 13,
    19, 0x21, ...uuid128, 14, 15,
    0
  ]);
  const result = h.bleAdvertisement(packet);
  assert.deepEqual(result.serviceUuids, [h.bleUuid('180d'), h.bleUuid('12345678')]);
  assert.deepEqual(result.serviceData.map(d => [d.uuid, [...d.data]]), [
    [h.bleUuid('180f'), [10, 11]], [h.bleUuid('12345678'), [12, 13]], [h.bleUuid('180d'), [14, 15]]
  ]);
});

test('production advertising name decoder prefers complete UTF-8 names', () => {
  const full = [...Buffer.from('蓝鲸🐳')];
  const packet = new Uint8Array([2, 8, 65, full.length + 1, 9, ...full, 2, 8, 66]);
  assert.equal(h.bleAdvertisement(packet).localName, '蓝鲸🐳');
});

test('production advertising decoder stops at truncation and ignores incomplete UUID tail', () => {
  assert.deepEqual(h.bleAdvertisement(new Uint8Array([5, 3, 0x0d])).serviceUuids, []);
  assert.deepEqual(h.bleAdvertisement(new Uint8Array([4, 3, 0x0d, 0x18, 0xff])).serviceUuids, [h.bleUuid('180d')]);
  assert.equal(h.bleAdvertisement(new Uint8Array([0, 2, 9, 65])).localName, '');
});

test('production MTU validation accepts actual ATT range and rejects invalid values', () => {
  for (const mtu of [23, 185, 247, 511, 517]) assert.equal(h.bleMtu(mtu), mtu);
  for (const mtu of [0, 22, 518, 23.1, NaN, Infinity]) assert.throws(() => h.bleMtu(mtu), /E_BLE_INVALID_DATA:/);
});

test('production SDK error mapping keeps supported ABI error prefixes', () => {
  for (const [code, expected] of [[201, 'PERMISSION'], [202, 'PERMISSION'], [401, 'INVALID_DATA'],
    [801, 'SYSTEM_NOT_SUPPORTED'], [2900003, 'ADAPTER_NOT_AVAILABLE'], [2901003, 'NOT_CONNECTED'],
    [2901000, 'READ_FAILED'], [2901001, 'READ_FAILED'], [2901008, 'SERVICE_NOT_FOUND'], [9999, 'READ_FAILED']]) {
    assert.equal(h.bleFailureCode(code, 'READ_FAILED'), expected);
  }
});

test('production pairing decoder decodes the shared Base64 PIN', () => {
  assert.equal(h.blePin('MTIzNDU2'), '123456');
  assert.equal(h.blePin('MDAwMA=='), '0000');
  for (const encoded of ['0000=', '!', '', 'AA==', '/w==', Buffer.from('12345678901234567').toString('base64')]) {
    assert.throws(() => h.blePin(encoded), /E_BLE_INVALID_DATA:/);
  }
});

test('production beacon builder writes Apple iBeacon manufacturer payload in network order', () => {
  const result = h.bleBeacon('00112233-4455-6677-8899-aabbccddeeff', 0x1234, 0xabcd, -59);
  assert.equal(Buffer.from(result).toString('hex'), '021500112233445566778899aabbccddeeff1234abcdc5');
  assert.throws(() => h.bleBeacon('180d', 65536, 0, 0), /E_BLE_INVALID_DATA:/);
});

test('the service exposes every exact shared Promise method and all ten event names', () => {
  const shared = fs.readFileSync(path.join(root, 'valdi/modules/bluetooth/src/BleHost.ts'), 'utf8');
  const host = shared.split('export interface BleHost {')[1].split('\n}')[0];
  const service = fs.readFileSync(path.join(__dirname, 'HarmonyBleService.ets'), 'utf8');
  const methods = [...host.matchAll(/^\s+(\w+)\([^;]+Promise</gm)].map(m => m[1]);
  assert.equal(methods.length, 28);
  for (const name of methods) assert.match(service, new RegExp(`async ${name}\\(`));
  const events = shared.split('export interface BleHostEvents {')[1].split('\n}')[0];
  const names = [...events.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
  assert.equal(names.length, 10);
  for (const name of names) assert.match(service, new RegExp(`events\\?\\.${name}\\(`));
  assert.doesNotMatch(service, /JSON\.|enableBluetooth|setDevicePairingConfirmation|startBLEScan/);
});
