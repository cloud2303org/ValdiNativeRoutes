// The .valdimodule format, as valdi_core's ValdiArchive.cpp and ValdiPacket.cpp read it: zstd over a packet
// (magic 0x0100C633, then the data length) whose data is a run of entries, each a file name then its content. Both
// fields are a little-endian uint32 length followed by the bytes; the length's top bit says the bytes are padded with
// zeros to a multiple of 4.
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const MAGIC = 0x0100c633;
const PADDED = 0x80000000;

export type ArchiveEntries = Map<string, Buffer>;

export function unpack(file: Buffer): ArchiveEntries {
  const data = zstdDecompressSync(file);
  if (data.readUInt32LE(0) !== MAGIC) throw new Error('Not a Valdi archive');
  const end = 8 + data.readUInt32LE(4);
  const entries: ArchiveEntries = new Map();
  let offset = 8;
  const field = () => {
    const raw = data.readUInt32LE(offset);
    const size = raw & (PADDED - 1);
    const bytes = data.subarray(offset + 4, offset + 4 + size);
    offset += 4 + size + (raw & PADDED ? padding(size) : 0);
    return bytes;
  };
  while (offset < end) {
    const name = field().toString('utf8');
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
