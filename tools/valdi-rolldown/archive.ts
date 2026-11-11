// The .valdimodule format, as valdi_core's ValdiArchive.cpp and ValdiPacket.cpp read it: zstd over a packet
// (magic 0x0100C633, then the data length) whose data is a run of entries, each a file name then its content. Both
// fields are a little-endian uint32 length followed by the bytes; the length's top bit says the bytes are padded with
// zeros to a multiple of 4.
import { createHash } from 'node:crypto';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const MAGIC = 0x0100c633;
const PADDED = 0x80000000;

export type ArchiveEntries = Map<string, Buffer>;

/** Set Bundle::getHash after source maps or bytecode, excluding any previous hash. */
export function setArchiveHash(entries: ArchiveEntries): void {
  const hash = createHash('sha256');
  for (const [name, content] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    if (name !== 'hash') hash.update(name).update(content);
  }
  entries.set('hash', Buffer.from(hash.digest('hex')));
}

export function unpack(file: Buffer, maxBytes = 64 * 1024 * 1024): ArchiveEntries {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 8) throw new Error('Invalid archive output limit');
  const data = zstdDecompressSync(file, { maxOutputLength: maxBytes });
  if (data.length < 8 || data.readUInt32LE(0) !== MAGIC) throw new Error('Not a Valdi archive');
  const end = 8 + data.readUInt32LE(4);
  if (end !== data.length) throw new Error('Invalid archive packet length or trailing bytes');
  const entries: ArchiveEntries = new Map();
  let offset = 8;
  const field = () => {
    if (offset + 4 > end) throw new Error('Truncated archive field length');
    const raw = data.readUInt32LE(offset);
    const size = raw & (PADDED - 1);
    const next = offset + 4 + size + (raw & PADDED ? padding(size) : 0);
    if (next > end) throw new Error('Truncated archive field');
    const bytes = data.subarray(offset + 4, offset + 4 + size);
    offset = next;
    return bytes;
  };
  while (offset < end) {
    if (entries.size >= 4096) throw new Error('Too many archive entries');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(field());
    if (!name || entries.has(name)) throw new Error('Empty or duplicate archive entry');
    entries.set(name, Buffer.from(field()));
  }
  return entries;
}

export function pack(entries: ArchiveEntries): Buffer {
  return zstdCompressSync(packet(entries));
}

/** The archive uncompressed, as an asset catalog is (AssetCatalog.cpp). */
export function packet(entries: ArchiveEntries): Buffer {
  const parts: Buffer[] = [];
  const field = (bytes: Buffer) => {
    const pad = padding(bytes.length);
    const length = Buffer.alloc(4);
    length.writeUInt32LE((bytes.length | (pad ? PADDED : 0)) >>> 0);
    parts.push(length, bytes, Buffer.alloc(pad));
  };
  for (const [name, content] of entries) {
    field(Buffer.from(name, 'utf8'));
    field(content);
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function padding(size: number): number {
  return (4 - (size % 4)) % 4;
}
