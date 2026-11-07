import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import * as tools from '../hdiff-tool.mjs';

function temporary(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'valdi-hdiff-tool-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function binaryFixturePlan() {
  return process.platform === 'win32' ? tools.toolPlan('win32', 'x64') : tools.toolPlan('darwin', 'arm64');
}

// A real, single-entry ZIP exercises the system extractor without a network call.
function zip(name, bytes) {
  const filename = Buffer.from(name), compressed = deflateRawSync(bytes), crc = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

test('fixed release plans cover the supported development and CI platforms', () => {
  assert.equal(typeof tools.toolPlan, 'function', 'fixed-version tool preparation is missing');
  for (const [platform, arch, directory] of [
    ['darwin', 'arm64', 'macos'], ['darwin', 'x64', 'macos'],
    ['linux', 'x64', 'linux64'], ['linux', 'arm64', 'linux_arm64'],
    ['win32', 'x64', 'windows64'], ['win32', 'arm64', 'windows_arm64'],
  ]) {
    const plan = tools.toolPlan(platform, arch);
    assert.equal(plan.version, '5.1.3');
    assert.equal(plan.kind, 'binary');
    assert.match(plan.url, new RegExp(`/v5\\.1\\.3/hdiffpatch_v5\\.1\\.3_bin_${directory}\\.zip$`));
    assert.match(plan.sha256, /^[0-9a-f]{64}$/);
    assert.equal(plan.member, `${directory}/hdiffz${platform === 'win32' ? '.exe' : ''}`);
  }
  assert.equal(tools.toolPlan('linux', 'ppc64').kind, 'source');
  assert.equal(tools.toolPlan('darwin', 'arm64', true).kind, 'source');
});

test('verified installation is cached and repairs changed executable bytes', async t => {
  assert.equal(typeof tools.prepareHdiffz, 'function', 'tool installer is missing');
  const root = temporary(t), plan = binaryFixturePlan();
  const bytes = Buffer.from('fixed executable fixture\n'), archive = zip(plan.member, bytes);
  const digest = createHash('sha256').update(archive).digest('hex');
  let requests = 0;
  const fetchImpl = async url => {
    requests++;
    assert.equal(url, plan.url);
    return new Response(archive);
  };
  const options = { root, plan: { ...plan, sha256: digest }, fetchImpl };
  const file = await tools.prepareHdiffz(options);
  assert.deepEqual(readFileSync(file), bytes);
  assert.equal(requests, 1);
  const mtime = statSync(file).mtimeMs;
  assert.equal(await tools.prepareHdiffz(options), file);
  assert.equal(requests, 1, 'cache hit must not fetch');
  assert.equal(statSync(file).mtimeMs, mtime, 'cache hit must not rewrite');
  writeFileSync(file, 'broken cache');
  assert.equal(await tools.prepareHdiffz(options), file);
  assert.equal(requests, 2);
  assert.deepEqual(readFileSync(file), bytes);
});

test('offline discovery accepts a fixed-version receipt and rejects corrupt cached bytes', async t => {
  const root = temporary(t), plan = binaryFixturePlan();
  const archive = zip(plan.member, Buffer.from('cached tool'));
  const file = await tools.prepareHdiffz({ root, plan: { ...plan, sha256: createHash('sha256').update(archive).digest('hex') },
    fetchImpl: async () => new Response(archive) });
  const receiptFile = path.join(path.dirname(file), 'receipt.json');
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  writeFileSync(receiptFile, JSON.stringify({ ...receipt, inputSha256: tools.toolPlan().sha256 }));
  const { findHdiffz } = await import('../ota-delta.mjs');
  assert.equal(findHdiffz({ root, env: { PATH: '' } }), file);
  writeFileSync(file, 'corrupt');
  assert.throws(() => findHdiffz({ root, env: { PATH: '' } }), /Delta base requires hdiffz/);
});

test('failed downloads do not create an install and the next attempt can retry', async t => {
  assert.equal(typeof tools.prepareHdiffz, 'function', 'tool installer is missing');
  const root = temporary(t), plan = binaryFixturePlan();
  await assert.rejects(tools.prepareHdiffz({ root, fetchImpl: async () => new Response('unavailable', { status: 503 }) }), /503/);
  await assert.rejects(tools.prepareHdiffz({ root, fetchImpl: async () => new Response('wrong bytes') }), /SHA256/);
  assert.equal(existsSync(tools.cachedHdiffzPath(root)), false);
  const archive = zip(plan.member, Buffer.from('retry executable'));
  const file = await tools.prepareHdiffz({ root, plan: { ...plan, sha256: createHash('sha256').update(archive).digest('hex') },
    fetchImpl: async () => new Response(archive) });
  assert.equal(readFileSync(file, 'utf8'), 'retry executable');
});

test('automatic preparation preserves explicit overrides and never downloads on invalid overrides', async t => {
  const { ensureHdiffz } = await import('../ota-delta.mjs');
  assert.equal(typeof ensureHdiffz, 'function', 'delta packing has no automatic preparation');
  const root = temporary(t);
  await assert.rejects(ensureHdiffz({ root, env: { VALDI_HDIFFZ: path.join(root, 'absent') } }), /VALDI_HDIFFZ/);
  assert.equal(existsSync(path.join(root, '.tools')), false);
});
