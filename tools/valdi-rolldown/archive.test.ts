import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';
import test from 'node:test';
import { pack, packet, setArchiveHash, unpack } from './archive';

test('archive hash preserves sorted names and exact final content bytes without reordering entries', () => {
  const bytecode = Buffer.from([0x34, 0xc6, 0, 1, 0xff, 0x80]);
  const javascript = Buffer.from('exports.answer = 42;\n//# sourceMappingURL=data:application/json;base64,e30=\n');
  const entries = new Map([['z.js', bytecode], ['empty', Buffer.alloc(0)], ['a.js', javascript]]);
  const before = [...entries];
  const expected = createHash('sha256').update('a.js').update(javascript)
    .update('empty').update('z.js').update(bytecode).digest('hex');

  setArchiveHash(entries);

  assert.equal(entries.get('hash')!.toString(), expected);
  assert.deepEqual([...entries], [...before, ['hash', Buffer.from(expected)]]);
  assert.deepEqual([...unpack(pack(entries))], [...entries]);
});

test('archive hash excludes a previous hash and changes when content changes', () => {
  const entries = new Map([['hash', Buffer.from('stale')], ['src/index.js', Buffer.from('before')]]);
  setArchiveHash(entries);
  const expected = createHash('sha256').update('src/index.js').update('before').digest('hex');
  assert.equal(entries.get('hash')!.toString(), expected);
  setArchiveHash(entries);
  assert.equal(entries.get('hash')!.toString(), expected);
  assert.deepEqual([...entries.keys()], ['hash', 'src/index.js']);

  entries.set('src/index.js', Buffer.from('after'));
  setArchiveHash(entries);
  assert.equal(entries.get('hash')!.toString(),
    createHash('sha256').update('src/index.js').update('after').digest('hex'));
  assert.notEqual(entries.get('hash')!.toString(), expected);
  const empty = new Map<string, Buffer>();
  setArchiveHash(empty);
  assert.equal(empty.get('hash')!.toString(), createHash('sha256').digest('hex'));
});

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
