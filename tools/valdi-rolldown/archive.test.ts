import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';
import test from 'node:test';
import { pack, packet, unpack } from './archive';

test('archive decoding enforces its output bound before returning entries', () => {
  const file = pack(new Map([['src/page.js', Buffer.alloc(4096, 1)]]));
  assert.throws(() => unpack(file, 128), /limit|large|length|size|buffer/i);
  assert.equal(unpack(file).get('src/page.js')!.length, 4096);
});

test('archive decoding rejects truncated fields, duplicate names and trailing packet bytes', () => {
  const valid = packet(new Map([['one.js', Buffer.from('one')]]));
  const body = valid.subarray(8);
  const duplicate = Buffer.concat([valid, body]);
  duplicate.writeUInt32LE(duplicate.length - 8, 4);
  const oversizedField = Buffer.from(valid);
  oversizedField.writeUInt32LE(0x7fffffff, 8);
  const shortBody = valid.subarray(0, valid.length - 1);
  const trailing = Buffer.concat([valid, Buffer.from([1])]);
  for (const raw of [duplicate, oversizedField, shortBody, trailing]) {
    assert.throws(() => unpack(zstdCompressSync(raw)), /archive|packet|duplicate|field|length|trailing/i);
  }
});

test('valid archive round trips preserve entry order, Unicode names, empty entries and resource bytes', () => {
  const entries = new Map([['src/页面.js', Buffer.from('code')], ['empty', Buffer.alloc(0)], ['res.assetcatalog', Buffer.from([0, 1, 2])]]);
  assert.deepEqual([...unpack(pack(entries))], [...entries]);
});
