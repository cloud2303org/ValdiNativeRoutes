// Publisher-only split Valdi archives. No native compatibility decisions or network/tool installation.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

export const MAX_BYTES = 64 * 1024 * 1024;
export const MAX_METADATA = 1024 * 1024;
export const MAX_ENTRIES = 4096;
const MAGIC = 0x0100c633;
const HEX = /^[0-9a-f]{64}$/;
const PATCH_HEADER = Buffer.from('HDIFFSF20&zlib\0');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const describe = bytes => ({ sha256: sha256(bytes), size: bytes.length });
const padding = size => (4 - size % 4) % 4;
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export function checkVersion(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) throw new Error('Invalid OTA version');
  if (value.toLowerCase() === 'latest.json') throw new Error('Update version latest.json is reserved for the index');
}

export function checkArchiveName(name) {
  if (typeof name !== 'string' || !name || /[\0\\]/.test(name) || /^[A-Za-z]:/.test(name) ||
      name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid archive entry name '${name}'`);
}

/** Strict bounded parser retaining exact packet bytes and insertion order, including hash/asset catalog. */
export function parseArchive(archive) {
  if (!Buffer.isBuffer(archive) || !archive.length || archive.length > MAX_BYTES) throw new Error('Invalid archive length (max 64 MiB)');
  let packet;
  try { packet = zstdDecompressSync(archive, { maxOutputLength: MAX_BYTES }); }
  catch (cause) { throw new Error('Invalid or oversized ZSTD archive packet (max 64 MiB)', { cause }); }
  if (packet.length < 8 || packet.readUInt32LE(0) !== MAGIC || packet.readUInt32LE(4) !== packet.length - 8) {
    throw new Error('Invalid archive packet magic or length');
  }
  const entries = new Map();
  let offset = 8;
  const field = () => {
    if (offset + 4 > packet.length) throw new Error('Truncated archive packet field length');
    const raw = packet.readUInt32LE(offset), size = raw & 0x7fffffff;
    const pad = raw & 0x80000000 ? padding(size) : 0;
    offset += 4;
    if (size > packet.length - offset || pad > packet.length - offset - size) throw new Error('Truncated archive packet field');
    const bytes = packet.subarray(offset, offset + size);
    for (let i = 0; i < pad; i++) if (packet[offset + size + i] !== 0) throw new Error('Invalid archive packet padding');
    offset += size + pad;
    return bytes;
  };
  while (offset < packet.length) {
    if (entries.size === MAX_ENTRIES) throw new Error('Archive exceeds 4096 entries');
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(field()); }
    catch (cause) { throw new Error('Invalid archive entry name encoding or field', { cause }); }
    checkArchiveName(name);
    if (entries.has(name)) throw new Error(`Duplicate archive entry '${name}'`);
    entries.set(name, field());
  }
  return { packet, entries };
}

/** Canonical ValdiPacket fields with zero padding and caller's target order. */
export function encodePacket(entries) {
  const fields = [], names = new Set();
  let total = 8;
  for (const [name, content] of entries) {
    checkArchiveName(name);
    if (names.has(name) || !Buffer.isBuffer(content)) throw new Error('Invalid or duplicate archive entry');
    names.add(name);
    if (names.size > MAX_ENTRIES) throw new Error('Archive exceeds 4096 entries');
    for (const bytes of [Buffer.from(name), content]) {
      const pad = padding(bytes.length);
      total += 4 + bytes.length + pad;
      if (total > MAX_BYTES) throw new Error('Archive packet exceeds 64 MiB');
      const length = Buffer.alloc(4);
      length.writeUInt32LE((bytes.length | (pad ? 0x80000000 : 0)) >>> 0);
      fields.push(length, bytes, Buffer.alloc(pad));
    }
  }
  const header = Buffer.alloc(8);
  header.writeUInt32LE(MAGIC); header.writeUInt32LE(total - 8, 4);
  return Buffer.concat([header, ...fields], total);
}

function isHbc(name, bytes) {
  return name.endsWith('.js') && bytes?.length >= 16 && bytes.readUInt32LE(0) === 0x0100c634 &&
    bytes.readBigUInt64LE(4) === 0x1f1903c103bc1fc6n && bytes.readUInt32LE(12) > 0;
}

/** Explicit environment override, repository tool, then PATH. Never downloads or uses another checkout. */
export function findHdiffz({ root, env = process.env } = {}) {
  const executable = file => {
    try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; }
  };
  if (env.VALDI_HDIFFZ) {
    if (!executable(env.VALDI_HDIFFZ)) throw new Error('VALDI_HDIFFZ must name an executable hdiffz file');
    return path.resolve(env.VALDI_HDIFFZ);
  }
  const suffixes = process.platform === 'win32' ? ['.exe', ''] : ['', '.exe'];
  for (const directory of [root && path.join(root, 'ota/tools'), ...(env.PATH ?? '').split(path.delimiter)].filter(Boolean)) {
    for (const suffix of suffixes) {
      const file = path.resolve(directory, `hdiffz${suffix}`);
      if (executable(file)) return file;
    }
  }
  throw new Error('Delta base requires hdiffz: set VALDI_HDIFFZ, install ota/tools/hdiffz(.exe), or add hdiffz to PATH. No tool is downloaded.');
}

/** Returns {descriptor, manifest, entries} or null when complete metadata + unique payloads are not smaller. */
export function createDelta({ platform, appVersion, version, baseVersion, baseArchive, targetArchive, hdiffz, root }) {
  if (!['android', 'ios'].includes(platform)) throw new Error('Invalid delta platform');
  for (const id of [appVersion, version, baseVersion]) checkVersion(id);
  if (baseVersion === version) throw new Error('Delta base and target versions must differ');
  const old = parseArchive(baseArchive), target = parseArchive(targetArchive);
  const executable = hdiffz ? findHdiffz({ env: { VALDI_HDIFFZ: hdiffz } }) : findHdiffz({ root });
  // Canonical streaming reconstruction must reproduce the exact packet, or use the full artifact.
  if (!encodePacket(target.entries).equals(target.packet)) return null;
  const prefix = `deltas/${baseVersion}`, payloads = new Map(), entries = [];
  const work = mkdtempSync(path.join(tmpdir(), 'valdi-ota-diff-'));
  const download = (bytes, encoding) => {
    const { sha256: digest, size } = describe(bytes);
    const suffix = { raw: 'bin', zstd: 'zst', 'hdiffpatch-zlib': 'hdiff' }[encoding];
    const name = `${prefix}/payload/${digest}.${suffix}`;
    payloads.set(name, bytes);
    return { path: name, sha256: digest, size, encoding };
  };
  try {
    for (const [name, bytes] of target.entries) {
      const previous = old.entries.get(name), info = { name, ...describe(bytes) };
      if (previous?.equals(bytes)) { entries.push({ ...info, operation: 'copy' }); continue; }
      const compressed = zstdCompressSync(bytes);
      let payload = compressed.length < bytes.length ? compressed : bytes;
      let encoding = payload === bytes ? 'raw' : 'zstd';
      let operation = 'full';
      if (isHbc(name, bytes) && isHbc(name, previous)) {
        const oldFile = path.join(work, 'old'), newFile = path.join(work, 'new'), patch = path.join(work, 'patch');
        writeFileSync(oldFile, previous); writeFileSync(newFile, bytes);
        rmSync(patch, { force: true });
        try { execFileSync(executable, ['-SD', '-s-64', '-c-zlib-6', '-p-1', oldFile, newFile, patch], { stdio: 'pipe', maxBuffer: MAX_METADATA }); }
        catch (cause) { throw new Error(`hdiffz failed for archive entry '${name}'`, { cause }); }
        if (!existsSync(patch) || statSync(patch).size > MAX_BYTES) throw new Error('Invalid HDiff patch output length');
        const diff = readFileSync(patch);
        if (!diff.subarray(0, PATCH_HEADER.length).equals(PATCH_HEADER)) throw new Error('Expected HDIFFSF20/zlib patch output');
        if (diff.length < payload.length) { payload = diff; encoding = 'hdiffpatch-zlib'; operation = 'patch'; }
      }
      entries.push({ ...info, operation, ...(operation === 'patch' ? { baseSha256: sha256(previous) } : {}), download: download(payload, encoding) });
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  const manifest = { schemaVersion: 1, algorithm: 'hdiffpatch', format: 'HDIFFSF20', compression: 'zlib', platform, appVersion,
    baseVersion, version, baseSha256: sha256(baseArchive), targetSha256: sha256(targetArchive),
    basePacketSha256: sha256(old.packet), targetPacketSha256: sha256(target.packet), targetPacketSize: target.packet.length, entries };
  const metadata = jsonBytes(manifest);
  if (metadata.length > MAX_METADATA) throw new Error('Delta manifest exceeds 1 MiB');
  if (metadata.length + [...payloads.values()].reduce((sum, bytes) => sum + bytes.length, 0) >= targetArchive.length) return null;
  const name = `${prefix}/manifest.json`;
  return { descriptor: { baseVersion, baseSha256: manifest.baseSha256, path: name, ...describe(metadata) }, manifest,
    entries: [[name, metadata], ...payloads] };
}

export function checkDeltaDescriptor(descriptor) {
  if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'baseSha256,baseVersion,path,sha256,size') throw new Error('Invalid delta descriptor');
  checkVersion(descriptor.baseVersion);
  if (descriptor.path !== `deltas/${descriptor.baseVersion}/manifest.json` || !HEX.test(descriptor.baseSha256) ||
      !HEX.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > MAX_METADATA) {
    throw new Error('Invalid delta descriptor path, hash or size');
  }
}

/** Authenticate every metadata/payload path before anything is signed or staged. */
export function validateDelta(delta, identity, targetArchive) {
  checkDeltaDescriptor(delta?.descriptor);
  const d = delta.descriptor;
  if (!Array.isArray(delta.entries)) throw new Error('Missing delta metadata/payload entries');
  const files = new Map();
  let total = 0;
  for (const entry of delta.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid delta file');
    const [name, bytes] = entry;
    if (typeof name !== 'string' || files.has(name) || !Buffer.isBuffer(bytes)) throw new Error('Invalid or duplicate delta file');
    total += bytes.length;
    if (total > MAX_BYTES || files.size >= MAX_ENTRIES) throw new Error('Delta package exceeds limits');
    files.set(name, bytes);
  }
  const metadata = files.get(d.path);
  if (!metadata || metadata.length !== d.size || sha256(metadata) !== d.sha256) throw new Error('Delta metadata hash or length mismatch');
  let m;
  try { m = JSON.parse(metadata.toString('utf8')); } catch { throw new Error('Invalid delta JSON'); }
  const keys = 'algorithm,appVersion,basePacketSha256,baseSha256,baseVersion,compression,entries,format,platform,schemaVersion,targetPacketSha256,targetPacketSize,targetSha256,version';
  if (!m || Object.keys(m).sort().join(',') !== keys || m.schemaVersion !== 1 || m.algorithm !== 'hdiffpatch' ||
      m.format !== 'HDIFFSF20' || m.compression !== 'zlib' || m.platform !== identity.platform || m.appVersion !== identity.appVersion ||
      m.version !== identity.version || m.baseVersion !== d.baseVersion || m.baseVersion === m.version || m.baseSha256 !== d.baseSha256 ||
      m.targetSha256 !== sha256(targetArchive) || !HEX.test(m.basePacketSha256)) throw new Error('Invalid or unbound delta metadata');
  const target = parseArchive(targetArchive);
  if (m.targetPacketSha256 !== sha256(target.packet) || m.targetPacketSize !== target.packet.length ||
      !Array.isArray(m.entries) || m.entries.length !== target.entries.size || m.entries.length > MAX_ENTRIES) throw new Error('Delta target packet mismatch');
  const used = new Set([d.path]), expected = [...target.entries];
  for (const [index, e] of m.entries.entries()) {
    const [name, bytes] = expected[index];
    if (!e || e.name !== name || e.sha256 !== sha256(bytes) || e.size !== bytes.length) throw new Error('Delta entry target/order mismatch');
    checkArchiveName(e.name);
    const fields = Object.keys(e).sort().join(',');
    if (e.operation === 'copy') {
      if (fields !== 'name,operation,sha256,size') throw new Error('Invalid copy delta entry');
      continue;
    }
    if (!['full', 'patch'].includes(e.operation) || fields !== (e.operation === 'patch'
      ? 'baseSha256,download,name,operation,sha256,size' : 'download,name,operation,sha256,size')) throw new Error('Invalid delta operation');
    const download = e.download;
    if (!download || Object.keys(download).sort().join(',') !== 'encoding,path,sha256,size' || !HEX.test(download.sha256) ||
        !Number.isSafeInteger(download.size) || download.size < 0 || download.size > MAX_BYTES) throw new Error('Invalid delta download');
    const suffix = { raw: 'bin', zstd: 'zst', 'hdiffpatch-zlib': 'hdiff' }[download.encoding];
    if (!suffix || download.path !== `deltas/${d.baseVersion}/payload/${download.sha256}.${suffix}`) throw new Error('Invalid delta content path');
    const payload = files.get(download.path);
    if (!payload || payload.length !== download.size || sha256(payload) !== download.sha256) throw new Error('Delta payload hash or length mismatch');
    used.add(download.path);
    if (e.operation === 'patch') {
      if (!isHbc(name, bytes) || !HEX.test(e.baseSha256) || download.encoding !== 'hdiffpatch-zlib' ||
          !payload.subarray(0, PATCH_HEADER.length).equals(PATCH_HEADER)) throw new Error('Invalid HBC delta patch');
    } else {
      if (!['raw', 'zstd'].includes(download.encoding)) throw new Error('Invalid full delta encoding');
      const decoded = download.encoding === 'raw' ? payload : zstdDecompressSync(payload, { maxOutputLength: MAX_BYTES });
      if (!decoded.equals(bytes)) throw new Error('Delta full payload target mismatch');
    }
  }
  if (used.size !== files.size) throw new Error('Unreferenced delta file');
  if (total >= targetArchive.length) throw new Error('Delta metadata and payload must be smaller than full archive');
  return [...files];
}
