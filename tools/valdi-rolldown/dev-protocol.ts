// Direct DebuggerService protocol, independent of the builder/watcher and platform transport.
import { isUtf8 } from 'node:buffer';

const MAGIC = 0x0100c633;
export const DEVICE_PORT = 13592;
const MAX_PACKET = 128 * 1024 * 1024;

export interface DevResource {
  bundle: string;
  file: string;
  data: Buffer;
}

export function encodeDevPacket(payload: object): Buffer {
  const body = Buffer.from(JSON.stringify(payload));
  if (body.length > MAX_PACKET) throw new Error('ValdiPacket exceeds size limit');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class DevPacketReader {
  private buffer = Buffer.alloc(0);

  receive(data: Buffer, handle: (payload: Record<string, any>) => void) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 8) {
      if (this.buffer.readUInt32LE(0) !== MAGIC) throw new Error('Bad ValdiPacket magic');
      const size = this.buffer.readUInt32LE(4);
      if (size > MAX_PACKET) throw new Error('ValdiPacket exceeds size limit');
      const end = 8 + size;
      if (this.buffer.length < end) return;
      const payload: unknown = JSON.parse(this.buffer.subarray(8, end).toString('utf8'));
      this.buffer = this.buffer.subarray(end);
      if (!record(payload)) throw new Error('ValdiPacket must contain a JSON object');
      handle(payload);
    }
  }
}

export function updatedResources(resources: DevResource[]) {
  return {
    event: {
      updated_resources: {
        resources: resources.map(({ bundle, file, data }) => ({
          bundle_name: bundle,
          file_path_within_bundle: file,
          ...(isUtf8(data) ? { data_string: data.toString('utf8') } : { data_base64: data.toString('base64') }),
        })),
      },
    },
  };
}
