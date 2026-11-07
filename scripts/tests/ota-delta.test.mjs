import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import * as publisher from '../ota.mjs';
import { findHdiffz } from '../ota-delta.mjs';
import { discoveryHdiffz, hdiffSkip, optionalHdiffz } from './ota-test-tools.mjs';

const hdiffz = optionalHdiffz();
const hash = b => createHash('sha256').update(b).digest('hex');
const identity = { platform: 'android', appVersion: '1.2.0', version: 'pages-002', modules: ['app_pages'] };
const modulePath = 'modules/app_pages.valdimodule';

function temporary(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ota-split-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('HDiff integration prerequisite follows supported repository/PATH discovery without an override', () => {
  if (process.env.VALDI_HDIFFZ) return;
  let expected;
  try { expected = findHdiffz({ root: path.resolve(import.meta.dirname, '../..') }); }
  catch (error) { assert.match(error.message, /^Delta base requires hdiffz:/); }
  assert.equal(hdiffz, expected);
});

// Independent writer to catch packet framing/order changes in the publisher.
function packet(entries) {
  const fields = [];
  for (const [name, content] of entries) for (const bytes of [Buffer.from(name), content]) {
    const pad = (4 - bytes.length % 4) % 4;
    const size = Buffer.alloc(4);
    size.writeUInt32LE((bytes.length | (pad ? 0x80000000 : 0)) >>> 0);
    fields.push(size, bytes, Buffer.alloc(pad));
  }
  const body = Buffer.concat(fields), header = Buffer.alloc(8);
  header.writeUInt32LE(0x0100c633);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function noise(size) {
  const out = Buffer.alloc(size);
  let state = 123456789;
  for (let i = 0; i < size; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; out[i] = state & 255; }
  return out;
}

function archives() {
  const hbc = noise(64 * 1024);
  hbc.writeUInt32LE(0x0100c634);
  hbc.writeBigUInt64LE(0x1f1903c103bc1fc6n, 4);
  hbc.writeUInt32LE(99, 12);
  const changed = Buffer.from(hbc); changed[24000] ^= 17;
  const oldEntries = [['src/main.js', hbc], ['unchanged.bin', noise(96 * 1024)],
    ['res.assetcatalog', Buffer.from('old assets')], ['deleted.txt', Buffer.from('gone')], ['hash', Buffer.from('old hash')]];
  const newEntries = [['hash', Buffer.from('new hash')], ['res.assetcatalog', Buffer.from('new assets')],
    ['src/main.js', changed], ['new.txt', Buffer.from('compressible '.repeat(1000))], ['raw.bin', Buffer.from([1, 2, 3])],
    ['unchanged.bin', oldEntries[1][1]]];
  return { oldEntries, newEntries, baseArchive: zstdCompressSync(packet(oldEntries)), targetArchive: zstdCompressSync(packet(newEntries)) };
}

function publish(t, extra = {}) {
  const data = archives(), directory = temporary(t);
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const args = { ...identity, directory, entries: [[modulePath, data.targetArchive]],
    privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    base: { version: 'pages-001', archive: data.baseArchive }, hdiffz, ...extra };
  const out = publisher.publishPackage(args);
  return { ...data, out, keys, args, manifest: JSON.parse(readFileSync(path.join(out, 'manifest.json'))) };
}

// A real patch for archives()' deterministic one-byte HBC edit. Schema validation
// inspects this fixture without running an HDiff executable or claiming reconstruction.
function schemaDelta(data, createDelta) {
  const original = createDelta({ ...identity, ...data, baseVersion: 'pages-001', hdiffz: process.execPath,
    baseArchive: zstdCompressSync(packet(data.oldEntries.filter(([name]) => name !== 'src/main.js'))) });
  const patch = Buffer.from('484449464653463230267a6c696200848000848000020d10000a03000081bb40010182c43f83ff7f38', 'hex');
  const entry = original.manifest.entries.find(e => e.name === 'src/main.js');
  original.entries = original.entries.filter(([name]) => name !== entry.download.path);
  entry.operation = 'patch';
  entry.baseSha256 = hash(new Map(data.oldEntries).get(entry.name));
  entry.download = { path: `deltas/pages-001/payload/${hash(patch)}.hdiff`, sha256: hash(patch), size: patch.length, encoding: 'hdiffpatch-zlib' };
  original.manifest.baseSha256 = hash(data.baseArchive);
  original.manifest.basePacketSha256 = hash(packet(data.oldEntries));
  const metadata = Buffer.from(JSON.stringify(original.manifest));
  original.descriptor = { ...original.descriptor, baseSha256: hash(data.baseArchive), sha256: hash(metadata), size: metadata.length };
  original.entries[0] = [original.descriptor.path, metadata];
  original.entries.push([entry.download.path, patch]);
  return original;
}

test('publishing binds a real per-entry HDIFFSF20/zlib delta and always retains the exact full fallback', { skip: hdiffz ? false : hdiffSkip }, t => {
  const data = publish(t);
  assert.equal(data.manifest.deltas?.length, 1, 'applicable smaller split delta must be in the signed full manifest');
  const descriptor = data.manifest.deltas[0];
  assert.deepEqual(Object.keys(descriptor).sort(), ['baseVersion', 'baseSha256', 'path', 'sha256', 'size'].sort());
  assert.equal(descriptor.baseSha256, hash(data.baseArchive));
  assert.equal(descriptor.path, 'deltas/pages-001/manifest.json');
  const metadata = readFileSync(path.join(data.out, descriptor.path));
  assert.equal(hash(metadata), descriptor.sha256);
  assert.equal(metadata.length, descriptor.size);
  const delta = JSON.parse(metadata);
  assert.deepEqual(Object.keys(delta).sort(), ['schemaVersion', 'algorithm', 'format', 'compression', 'platform', 'appVersion',
    'baseVersion', 'version', 'baseSha256', 'targetSha256', 'basePacketSha256', 'targetPacketSha256', 'targetPacketSize', 'entries'].sort());
  assert.equal(delta.algorithm, 'hdiffpatch'); assert.equal(delta.format, 'HDIFFSF20'); assert.equal(delta.compression, 'zlib');
  assert.equal(delta.basePacketSha256, hash(packet(data.oldEntries)));
  assert.equal(delta.targetPacketSha256, hash(packet(data.newEntries)));
  assert.equal(delta.targetPacketSize, packet(data.newEntries).length);
  assert.equal(delta.targetSha256, data.manifest.files[modulePath].sha256);
  assert.deepEqual(delta.entries.map(e => e.name), data.newEntries.map(([name]) => name));
  const restored = [];
  let downloaded = metadata.length;
  const seen = new Set();
  for (const e of delta.entries) {
    const old = new Map(data.oldEntries).get(e.name);
    let bytes;
    if (e.operation === 'copy') { bytes = old; assert.equal(e.download, undefined); }
    else {
      assert.match(e.download.path, /^deltas\/pages-001\/payload\/[a-f0-9]{64}\.(bin|zst|hdiff)$/);
      const payload = readFileSync(path.join(data.out, e.download.path));
      assert.equal(hash(payload), e.download.sha256); assert.equal(payload.length, e.download.size);
      assert.ok(e.download.path.endsWith(`${hash(payload)}.${e.download.path.split('.').pop()}`));
      if (!seen.has(e.download.path)) { seen.add(e.download.path); downloaded += payload.length; }
      if (e.operation === 'patch') {
        assert.equal(e.name, 'src/main.js'); assert.equal(e.baseSha256, hash(old));
        assert.equal(e.download.encoding, 'hdiffpatch-zlib');
        assert.equal(payload.subarray(0, 15).toString(), 'HDIFFSF20&zlib\0');
        const dir = temporary(t);
        writeFileSync(path.join(dir, 'old'), old); writeFileSync(path.join(dir, 'patch'), payload);
        execFileSync(hdiffz, ['--patch', path.join(dir, 'old'), path.join(dir, 'patch'), path.join(dir, 'new')], { stdio: 'pipe' });
        bytes = readFileSync(path.join(dir, 'new'));
      } else bytes = e.download.encoding === 'zstd' ? zstdDecompressSync(payload) : payload;
    }
    assert.equal(hash(bytes), e.sha256); assert.equal(bytes.length, e.size);
    restored.push([e.name, bytes]);
  }
  assert.ok(downloaded < data.targetArchive.length);
  assert.deepEqual(restored, data.newEntries);
  assert.deepEqual(zstdCompressSync(packet(restored)), data.targetArchive);
  assert.deepEqual(readFileSync(path.join(data.out, modulePath)), data.targetArchive);
  assert.equal(verify('sha256', readFileSync(path.join(data.out, 'manifest.json')), data.keys.publicKey,
    Buffer.from(readFileSync(path.join(data.out, 'manifest.sig'), 'utf8'), 'base64')), true);
  assert.equal(delta.entries.find(e => e.name === 'new.txt').download.encoding, 'zstd');
  assert.equal(delta.entries.find(e => e.name === 'raw.bin').download.encoding, 'raw');
});

test('malformed base packets fail before signing or staging a full package', t => {
  const { baseArchive } = archives();
  const invalid = [Buffer.from('not zstd')];
  const valid = zstdDecompressSync(baseArchive);
  for (const bytes of [valid.subarray(0, -1), Buffer.concat([valid, Buffer.from([0])]),
    packet([['../escape', Buffer.from('x')]]), packet([['same', Buffer.from('a')], ['same', Buffer.from('b')]])]) invalid.push(zstdCompressSync(bytes));
  for (const archive of invalid) assert.throws(() => publish(t, { base: { version: 'pages-001', archive } }), /archive|packet|entry|zstd|name/i);
});

test('delta validation rejects tampered bindings, downloads, operations, order and unreferenced files', async t => {
  const { createDelta, validateDelta } = await import('../ota-delta.mjs');
  const data = archives();
  const original = hdiffz ? createDelta({ ...identity, ...data, baseVersion: 'pages-001', hdiffz }) : schemaDelta(data, createDelta);
  assert.doesNotThrow(() => validateDelta(original, identity, data.targetArchive));
  for (const mutate of [
    m => { m.targetSha256 = '0'.repeat(64); }, m => { m.baseSha256 = '0'.repeat(64); },
    m => { m.basePacketSha256 = 'no'; }, m => { m.targetPacketSha256 = '0'.repeat(64); },
    m => { m.targetPacketSize++; }, m => { m.version = 'wrong'; }, m => { m.platform = 'ios'; },
    m => { m.appVersion = 'wrong'; }, m => { m.format = 'HDIFF13'; }, m => { m.compression = 'zstd'; },
    m => { m.entries.reverse(); }, m => { m.entries.push(m.entries[0]); }, m => { m.entries[0].name = '../escape'; },
    m => { m.entries.find(e => e.operation === 'copy').download = {}; },
    m => { m.entries.find(e => e.operation === 'patch').baseSha256 = 'bad'; },
    m => { m.entries.find(e => e.operation === 'patch').download.encoding = 'raw'; },
    m => { m.entries.find(e => e.operation === 'full').download.path = '../escape'; },
    m => { m.entries.find(e => e.operation === 'full').download.size++; },
    m => { m.entries.find(e => e.operation === 'full').download.sha256 = '0'.repeat(64); },
  ]) {
    const manifest = structuredClone(original.manifest); mutate(manifest);
    const metadata = Buffer.from(JSON.stringify(manifest));
    const bad = { descriptor: { ...original.descriptor, size: metadata.length, sha256: hash(metadata) },
      entries: original.entries.map(([name, bytes]) => [name, name === original.descriptor.path ? metadata : bytes]) };
    assert.throws(() => validateDelta(bad, identity, data.targetArchive), /delta|packet|entry|HBC/i);
  }
  for (const entries of [original.entries.slice(1), [...original.entries, original.entries[0]],
    [...original.entries, ['extra', Buffer.from('bad')]],
    original.entries.map(([name, bytes], i) => [name, i === 1 ? Buffer.alloc(bytes.length) : bytes])]) {
    assert.throws(() => validateDelta({ ...original, entries }, identity, data.targetArchive), /delta|payload/i);
  }
  const directory = path.join(temporary(t), 'dist');
  assert.throws(() => publisher.publishPackage({ ...identity, directory, entries: [[modulePath, data.targetArchive]],
    privateKey: 'must not reach signing', deltas: [{ ...original, entries: original.entries.slice(1) }] }), /delta/i);
  assert.equal(existsSync(directory), false);
});

test('strict parser rejects unsafe/duplicate names, wrong lengths, malformed UTF-8, padding and truncated fields', async () => {
  const { parseArchive, encodePacket } = await import('../ota-delta.mjs');
  const bad = [];
  for (const name of ['', '/absolute', 'a//b', 'a/./b', 'a/../b', 'a/', 'a\\b', 'nul\0x', 'C:/file']) bad.push(packet([[name, Buffer.from('x')]]));
  const wrongMagic = packet([]); wrongMagic[0] ^= 1; bad.push(wrongMagic);
  const wrongLength = packet([]); wrongLength.writeUInt32LE(100, 4); bad.push(wrongLength);
  const wrongPad = packet([['a', Buffer.from('x')]]); wrongPad[13] = 1; bad.push(wrongPad);
  const invalidUtf8 = packet([['a', Buffer.from('x')]]); invalidUtf8[12] = 0xff; bad.push(invalidUtf8);
  const partialField = Buffer.alloc(10); partialField.writeUInt32LE(0x0100c633); partialField.writeUInt32LE(2, 4); bad.push(partialField);
  const hugeField = packet([['a', Buffer.from('x')]]); hugeField.writeUInt32LE(0x7fffffff, 8); bad.push(hugeField);
  const orphanName = packet([['a', Buffer.from('x')]]).subarray(0, 16); orphanName.writeUInt32LE(8, 4); bad.push(orphanName);
  bad.push(packet([['same', Buffer.from('x')], ['same', Buffer.from('y')]]));
  bad.push(packet(Array.from({ length: 4097 }, (_, i) => [`entry${i}`, Buffer.alloc(0)])));
  for (const bytes of bad) assert.throws(() => parseArchive(zstdCompressSync(bytes)), /archive|packet|entry|name|entries/i);
  assert.throws(() => parseArchive(Buffer.alloc(64 * 1024 * 1024 + 1)), /length/);
  assert.throws(() => parseArchive(zstdCompressSync(Buffer.alloc(64 * 1024 * 1024 + 1))), /64 MiB/);
  const valid = new Map([['hash', Buffer.from('new')], ['res.assetcatalog', Buffer.from('assets')], ['src/file.js', Buffer.alloc(4)]]);
  assert.deepEqual(encodePacket(valid), packet(valid));
  assert.deepEqual([...parseArchive(zstdCompressSync(packet(valid))).entries], [...valid]);
  assert.throws(() => encodePacket([['a', Buffer.alloc(0)], ['a', Buffer.alloc(0)]]), /duplicate/);
});

test('non-HBC and non-js entries use copy/full only, even with a bytecode-looking header', async () => {
  const { createDelta } = await import('../ota-delta.mjs');
  const data = archives();
  const old = new Map(data.oldEntries), target = new Map(data.newEntries);
  old.set('plain.js', noise(4096)); target.set('plain.js', Buffer.from(old.get('plain.js'))); target.get('plain.js')[2000] ^= 1;
  old.set('looks-like-hbc.bin', old.get('src/main.js')); target.set('looks-like-hbc.bin', target.get('src/main.js'));
  // This test covers copy/full classification; HBC patching is covered above.
  old.delete('src/main.js'); target.delete('src/main.js');
  const delta = createDelta({ ...identity, baseVersion: 'pages-001', baseArchive: zstdCompressSync(packet(old)),
    targetArchive: zstdCompressSync(packet(target)), hdiffz: process.execPath });
  assert.equal(delta.manifest.entries.find(e => e.name === 'plain.js').operation, 'full');
  assert.equal(delta.manifest.entries.find(e => e.name === 'looks-like-hbc.bin').operation, 'full');
});

test('deltas that cost at least the full compressed module are omitted, and full-only publishing needs no tool', t => {
  const tiny = zstdCompressSync(packet([['hash', Buffer.from('x')]]));
  const data = publish(t, { entries: [[modulePath, tiny]], base: { version: 'pages-001', archive: tiny }, hdiffz: process.execPath });
  assert.equal(data.manifest.deltas, undefined);
  assert.equal(existsSync(path.join(data.out, 'deltas')), false);
  assert.deepEqual(readFileSync(path.join(data.out, modulePath)), tiny);
  const full = publish(t, { base: undefined, hdiffz: '/does/not/exist' });
  assert.equal(full.manifest.deltas, undefined);
});

test('tool discovery uses explicit override, local executable, then PATH, with actionable offline failure', async t => {
  const dir = temporary(t), bin = path.join(dir, 'bin');
  const onPath = discoveryHdiffz(bin);
  assert.equal(findHdiffz({ root: dir, env: { PATH: bin } }), onPath);
  assert.equal(optionalHdiffz({ root: dir, env: { PATH: bin } }), onPath);
  const local = discoveryHdiffz(path.join(dir, 'ota/tools'));
  assert.equal(findHdiffz({ root: dir, env: { PATH: bin } }), local);
  assert.equal(optionalHdiffz({ root: dir, env: { PATH: bin } }), local);
  assert.equal(findHdiffz({ root: dir, env: { VALDI_HDIFFZ: onPath, PATH: bin } }), onPath);
  assert.equal(optionalHdiffz({ root: dir, env: { VALDI_HDIFFZ: onPath, PATH: bin } }), onPath);
  assert.throws(() => findHdiffz({ root: dir, env: { VALDI_HDIFFZ: '/missing', PATH: bin } }), /VALDI_HDIFFZ/);
  assert.throws(() => optionalHdiffz({ root: dir, env: { VALDI_HDIFFZ: '/missing', PATH: bin } }), /VALDI_HDIFFZ.*executable hdiffz/);
  assert.throws(() => findHdiffz({ root: temporary(t), env: { PATH: '' } }), /VALDI_HDIFFZ.*ota\/tools.*PATH/);
  assert.equal(optionalHdiffz({ root: temporary(t), env: { PATH: '' } }), undefined);
});

test('old package directories derive and authenticate the exact base identity; archive files need explicit version', t => {
  const { baseArchive } = archives(), dir = temporary(t), archivePath = path.join(dir, 'old.valdimodule');
  writeFileSync(archivePath, baseArchive);
  const args = { platform: 'android', appVersion: '1.2.0' };
  assert.throws(() => publisher.readBase({ ...args, base: archivePath }), /base-version/);
  assert.deepEqual(publisher.readBase({ ...args, base: archivePath, baseVersion: 'pages-001' }), { archive: baseArchive, version: 'pages-001', archivePath });
  mkdirSync(path.join(dir, 'modules')); writeFileSync(path.join(dir, modulePath), baseArchive);
  const manifest = publisher.createManifest({ ...identity, version: 'pages-001', entries: [[modulePath, baseArchive]] });
  const write = () => writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest)); write();
  assert.equal(publisher.readBase({ ...args, base: dir }).version, 'pages-001');
  assert.throws(() => publisher.readBase({ ...args, base: dir, baseVersion: 'wrong' }), /disagrees/);
  assert.throws(() => publisher.readBase({ ...args, platform: 'ios', base: dir }), /platform/);
  assert.throws(() => publisher.readBase({ ...args, appVersion: '2', base: dir }), /appVersion/);
  manifest.files[modulePath].size++; write();
  assert.throws(() => publisher.readBase({ ...args, base: dir }), /length/);
  manifest.files[modulePath].size--; manifest.files[modulePath].sha256 = '0'.repeat(64); write();
  assert.throws(() => publisher.readBase({ ...args, base: dir }), /hash/);
});

test('publisher build arguments select only app_pages and pass the exact old archive into parent Hermes compilation', () => {
  for (const platform of ['android', 'ios']) {
    const args = publisher.moduleBuildArguments({ platform, built: '/tmp/output', baseArchive: '/tmp/old.valdimodule' });
    assert.deepEqual(args.slice(0, 8), ['exec', 'tsx', 'build.ts', '--release', '--module', 'app_pages', '--out', '/tmp/output']);
    assert.deepEqual(args.slice(-2), ['--hermes-base', '/tmp/old.valdimodule']);
    assert.equal(publisher.moduleBuildArguments({ platform, built: '/tmp/output' }).includes('--hermes-base'), false);
  }
});

test('full manifest bounds count descriptors and reject more than eight bases or duplicate bases', () => {
  const { targetArchive } = archives();
  const descriptor = baseVersion => ({ baseVersion, baseSha256: 'a'.repeat(64), path: `deltas/${baseVersion}/manifest.json`, sha256: 'b'.repeat(64), size: 20 });
  const args = { ...identity, entries: [[modulePath, targetArchive]] };
  assert.equal(publisher.createManifest({ ...args, deltas: Array.from({ length: 8 }, (_, i) => descriptor(`base${i}`)) }).deltas.length, 8);
  assert.throws(() => publisher.createManifest({ ...args, deltas: Array.from({ length: 9 }, (_, i) => descriptor(`base${i}`)) }), /8/);
  assert.throws(() => publisher.createManifest({ ...args, deltas: [descriptor('old'), descriptor('old')] }), /duplicate/);
  assert.throws(() => publisher.createManifest({ ...args, deltas: [{ ...descriptor('old'), size: 1024 * 1024 + 1 }] }), /delta/);
  assert.throws(() => publisher.createManifest({ ...args, entries: [...args.entries, ...Array.from({ length: 4096 }, (_, i) => [`res/drawable/app_pages_${i}.webp`, Buffer.alloc(0)])] }), /4096/);
});

test('real pinned Hermes bytecode uses a real HDiff patch and default-ZSTD reconstruction', { skip: hdiffz ? false : hdiffSkip }, async t => {
  const { createRequire } = await import('node:module');
  const { createDelta } = await import('../ota-delta.mjs');
  const require = createRequire(new URL('../../tools/valdi-rolldown/package.json', import.meta.url));
  const packageFile = require.resolve('hermes-compiler/package.json');
  const platform = process.platform === 'darwin' ? 'osx-bin' : process.platform === 'win32' ? 'win64-bin' : 'linux64-bin';
  const hermesc = path.join(path.dirname(packageFile), 'hermesc', platform, process.platform === 'win32' ? 'hermesc.exe' : 'hermesc');
  const work = temporary(t);
  const compile = (label, value, base) => {
    const input = path.join(work, `${label}.js`), output = path.join(work, `${label}.hbc`);
    const functions = Array.from({ length: 500 }, (_, i) => `exports.f${i} = function(x) { return x + ${i}; };`).join('\n');
    writeFileSync(input, `(function(require, module, exports) { ${functions}\nexports.message = ${JSON.stringify(value)};\n})`);
    execFileSync(hermesc, ['-emit-binary', '-O', '-strict', '-Xes6-block-scoping', '-fno-static-builtins',
      '-fstrip-function-names', '-g0', '-emit-async-break-check', ...(base ? ['-base-bytecode', base] : []), '-out', output, input], { stdio: 'pipe' });
    const header = Buffer.alloc(4); header.writeUInt32LE(0x0100c634);
    return { bytes: Buffer.concat([header, readFileSync(output)]), output };
  };
  const old = compile('old', 'before'), target = compile('new', 'after', old.output);
  const anchor = noise(96 * 1024);
  const baseEntries = [['main.js', old.bytes], ['res.assetcatalog', anchor], ['hash', Buffer.from('old')]];
  const targetEntries = [['res.assetcatalog', anchor], ['main.js', target.bytes], ['hash', Buffer.from('new')]];
  const baseArchive = zstdCompressSync(packet(baseEntries)), targetArchive = zstdCompressSync(packet(targetEntries));
  const delta = createDelta({ ...identity, baseVersion: 'pages-001', baseArchive, targetArchive, hdiffz });
  const entry = delta.manifest.entries.find(e => e.name === 'main.js');
  assert.equal(entry.operation, 'patch');
  const patchBytes = new Map(delta.entries).get(entry.download.path);
  writeFileSync(path.join(work, 'old-envelope'), old.bytes); writeFileSync(path.join(work, 'diff'), patchBytes);
  execFileSync(hdiffz, ['--patch', path.join(work, 'old-envelope'), path.join(work, 'diff'), path.join(work, 'patched-envelope')], { stdio: 'pipe' });
  const restored = readFileSync(path.join(work, 'patched-envelope'));
  assert.deepEqual(restored, target.bytes);
  assert.deepEqual(zstdCompressSync(packet([['res.assetcatalog', anchor], ['main.js', restored], ['hash', Buffer.from('new')]])), targetArchive);
  if (process.env.OTA_TEST_EVIDENCE_DIR) {
    const dir = path.join(process.env.OTA_TEST_EVIDENCE_DIR, 'real-hermes'); mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of [['base.valdimodule', baseArchive], ['target.valdimodule', targetArchive], ['old-envelope', old.bytes],
      ['target-envelope', target.bytes], ['patch.hdiff', patchBytes], ...delta.entries]) {
      const file = path.join(dir, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    }
    writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify({ node: process.version, zstd: process.versions.zstd,
      hermesPackage: JSON.parse(readFileSync(packageFile)).version, hdiffVersion: execFileSync(hdiffz, ['-v'], { encoding: 'utf8' }).trim(),
      descriptor: delta.descriptor, fullSize: targetArchive.length, deltaSize: delta.entries.reduce((n, [, b]) => n + b.length, 0),
      operations: delta.manifest.entries.map(e => ({ name: e.name, operation: e.operation })), reconstructedExact: true }, null, 2));
  }
});

test('oversized split metadata is rejected before signing or emitting any package', async t => {
  const { createDelta } = await import('../ota-delta.mjs');
  const entries = Array.from({ length: 3500 }, (_, i) => [`${i}_${'x'.repeat(250)}`, Buffer.alloc(0)]);
  const archive = zstdCompressSync(packet(entries));
  assert.throws(() => createDelta({ ...identity, baseVersion: 'old', baseArchive: archive, targetArchive: archive, hdiffz: process.execPath }), /manifest.*1 MiB/);
  const directory = path.join(temporary(t), 'dist');
  assert.throws(() => publisher.publishPackage({ ...identity, directory, entries: [[modulePath, archive]],
    base: { version: 'old', archive }, hdiffz: process.execPath, privateKey: 'must not reach signing' }), /manifest.*1 MiB/);
  assert.equal(existsSync(directory), false);
});

test('an explicit base with missing hdiffz fails even when its target packet is noncanonical', async () => {
  const { createDelta } = await import('../ota-delta.mjs');
  const bytes = packet([['hash', Buffer.from('x')]]);
  // Redundant padding flag on an aligned field is legal to parse but cannot be emitted canonically.
  bytes.writeUInt32LE((bytes.readUInt32LE(8) | 0x80000000) >>> 0, 8);
  const archive = zstdCompressSync(bytes);
  assert.throws(() => createDelta({ ...identity, baseVersion: 'old', baseArchive: archive, targetArchive: archive,
    hdiffz: '/missing/hdiffz' }), /VALDI_HDIFFZ/);
});
