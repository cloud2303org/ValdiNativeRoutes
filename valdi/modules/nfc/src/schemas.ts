import type { NFCBinaryInput, WriteNdefMessageOptions } from './adapter';
import { nfcError, WECHAT_NFC_ERROR_CODES } from './errors';

const toBytes = (value: unknown, field: string): Uint8Array<ArrayBuffer> => {
  if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) {
    throw nfcError(WECHAT_NFC_ERROR_CODES.INVALID_PARAMETER, `${field} must be an ArrayBuffer or Uint8Array`);
  }
  const view = value instanceof Uint8Array ? value : new Uint8Array(value);
  return new Uint8Array(view);
};

export const transceiveOptions = (options: { data: NFCBinaryInput }): { data: Uint8Array<ArrayBuffer> } => {
  const data = toBytes(options.data, 'data');
  if (data.byteLength === 0) {
    throw nfcError(WECHAT_NFC_ERROR_CODES.INVALID_PARAMETER, 'data cannot be empty');
  }
  return { data };
};

export const setTimeoutOptions = (options: { timeout: number }): { timeout: number } => ({
  timeout: options.timeout,
});

export const writeNdefMessageOptions = (options: WriteNdefMessageOptions) => {
  const records = (options.records ?? []).map(record => ({
    tnf: record.tnf ?? 1,
    id: toBytes(record.id, 'record.id'),
    type: toBytes(record.type, 'record.type'),
    payload: toBytes(record.payload, 'record.payload'),
  }));
  const uris = [...(options.uris ?? [])];
  const texts = [...(options.texts ?? [])];
  if (records.length === 0 && uris.length === 0 && texts.length === 0) {
    throw nfcError(WECHAT_NFC_ERROR_CODES.INVALID_PARAMETER, 'NDEF message cannot be empty');
  }
  return { records, uris, texts };
};
