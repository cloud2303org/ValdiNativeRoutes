import assert from 'node:assert/strict';
import test from 'node:test';
import { DevPacketReader, encodeDevPacket, updatedResources } from './dev-protocol';

test('ValdiPacket preserves string request IDs across fragmented and coalesced frames', () => {
  const payloads = [
    { request: { request_id: '001', configure: { application_id: 'expected', platform: 'android' } } },
    { event: { js_debugger_info: { port: 54321, websocket_targets: ['1', '2'] } } },
  ];
  const frame = encodeDevPacket(payloads[0]);
  assert.deepEqual([...frame.subarray(0, 4)], [0x33, 0xc6, 0, 1]);
  assert.equal(frame.readUInt32LE(4), frame.length - 8);
  const reader = new DevPacketReader();
  const received: object[] = [];
  reader.receive(frame.subarray(0, 3), value => received.push(value));
  reader.receive(frame.subarray(3, 10), value => received.push(value));
  assert.equal(received.length, 0);
  reader.receive(Buffer.concat([frame.subarray(10), encodeDevPacket(payloads[1])]), value => received.push(value));
  assert.deepEqual(received, payloads);
});

test('ValdiPacket rejects bad magic, huge lengths, invalid JSON and nonobject payloads', () => {
  const badMagic = Buffer.alloc(8);
  const huge = encodeDevPacket({});
  huge.writeUInt32LE(128 * 1024 * 1024 + 1, 4);
  const invalid = encodeDevPacket({});
  invalid.fill(0x78, 8);
  const array = encodeDevPacket([]);
  for (const frame of [badMagic, huge, invalid, array]) {
    assert.throws(() => new DevPacketReader().receive(frame, () => assert.fail('must not dispatch')));
  }
});

test('ValdiPacket rejects a fragmented oversized header before buffering a body or dispatching later frames', () => {
  const header = encodeDevPacket({}).subarray(0, 8);
  header.writeUInt32LE(128 * 1024 * 1024 + 1, 4);
  const reader = new DevPacketReader();
  const received: object[] = [];
  const handle = (value: object) => received.push(value);
  reader.receive(header.subarray(0, 7), handle);
  assert.throws(() => reader.receive(Buffer.concat([header.subarray(7), encodeDevPacket({ event: {} })]), handle),
    /ValdiPacket exceeds size limit/);
  assert.deepEqual(received, []);
  // Reconnection uses a fresh reader, with no bytes retained from the bad stream.
  new DevPacketReader().receive(encodeDevPacket({ request: { request_id: 'new' } }), handle);
  assert.deepEqual(received, [{ request: { request_id: 'new' } }]);
});

test('updated_resources preserves inline sources, source maps and binary resources exactly', () => {
  const resources = [
    { bundle: 'app_pages', file: 'src/Home.js', data: Buffer.from('/* 汉字 */\nmodule.exports = 1;\n//# sourceMappingURL=data:application/json;base64,e30=\n') },
    { bundle: 'app_pages', file: 'res/test.png', data: Buffer.from([0x89, 0x50, 0xff, 0]) },
    { bundle: 'app_pages', file: 'res.assetcatalog', data: Buffer.from([0xc3, 0x28, 0, 0xff]) },
  ];
  const before = resources.map(resource => Buffer.from(resource.data));
  const payload = updatedResources(resources);
  const decoded: any[] = [];
  new DevPacketReader().receive(encodeDevPacket(payload), value => decoded.push(value));
  const wire = decoded[0].event.updated_resources.resources;
  for (let i = 0; i < resources.length; i++) {
    assert.equal(wire[i].bundle_name, resources[i].bundle);
    assert.equal(wire[i].file_path_within_bundle, resources[i].file);
    const data = wire[i].data_string !== undefined
      ? Buffer.from(wire[i].data_string, 'utf8') : Buffer.from(wire[i].data_base64, 'base64');
    assert.deepEqual(data, before[i]);
    assert.deepEqual(resources[i].data, before[i]);
    assert.equal('data_string' in wire[i], !('data_base64' in wire[i]));
  }
});
