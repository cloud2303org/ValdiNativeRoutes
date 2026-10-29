import { nativeCall } from '../nativeCall';
import { isAndroid } from '../permissions/index';
import { nfcError, WECHAT_NFC_ERROR_CODES } from './errors';
import { NfcHost, type NfcHostEvents, NfcRecordModel, NfcTagModel, nfcHost } from './NfcHost';
import type { NativeNFCTag, NFCDiscoveryState, NFCRecord, NFCTechHandle } from './types';

// The NFC object adapter.ts expects, on top of the host's NfcHost; its Promises go through nativeCall. Native holds one
// NfcHostEvents for the app's lifetime; listeners subscribe here, so they never cross the bridge. NFC is Android-only:
// on iOS every call fails with NOT_SUPPORTED before a host is looked up (none is installed there).

const bytes = (value: ArrayBuffer): Uint8Array => new Uint8Array(value.slice(0));
// As in ble/native.ts: outgoing bytes are copied, incoming ones used as is when the view covers their buffer.
const buffer = (value: Uint8Array): ArrayBuffer =>
  value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
    ? (value.buffer as ArrayBuffer)
    : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
const record = (value: NfcRecordModel): NFCRecord => ({
  tnf: value.tnf,
  id: buffer(value.id),
  type: buffer(value.type),
  payload: buffer(value.payload),
});

function host(): NfcHost {
  if (!isAndroid()) throw nfcError(WECHAT_NFC_ERROR_CODES.NOT_SUPPORTED, 'NFC is Android-only');
  return nfcHost();
}

let nextListenerId = 1;
const discoveredListeners = new Map<number, (tag: NativeNFCTag) => void>();
const stateListeners = new Map<number, (state: NFCDiscoveryState) => void>();

function fanOut<T>(listeners: Map<number, (event: T) => void>) {
  return (event: T) => {
    // A copy: a listener may remove itself or another one while this runs.
    for (const listener of [...listeners.values()]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[nfc] listener failed', error);
      }
    }
  };
}

const emitDiscovered = fanOut(discoveredListeners);
const emitState = fanOut(stateListeners);

export const nfcEvents: NfcHostEvents = {
  discovered: (tag: NfcTagModel) =>
    emitDiscovered({
      tagHandle: tag.tagHandle,
      techs: tag.techs,
      id: buffer(tag.id),
      messages: tag.messages.map(record),
    }),
  discoveryStateChange: discovering => emitState({ discovering }),
};

function add<T>(listeners: Map<number, T>, callback: T): number {
  host(); // Fails on iOS like the calls do.
  const id = nextListenerId++;
  listeners.set(id, callback);
  return id;
}

/** Calling it has no native side effects until a method runs; there is one native NFC session for the app. */
export const nativeNFC = {
  getAvailability: () => nativeCall(() => host().getAvailability()),
  startDiscovery: () => nativeCall(() => host().startDiscovery()),
  stopDiscovery: () => nativeCall(() => host().stopDiscovery()),
  connect: (handle: NFCTechHandle) => nativeCall(() => host().connect(handle)),
  close: (handle: NFCTechHandle) => nativeCall(() => host().close(handle)),
  isConnected: (handle: NFCTechHandle) => nativeCall(() => host().isConnected(handle)),
  transceive: async (handle: NFCTechHandle, data: ArrayBuffer) =>
    buffer(await nativeCall(() => host().transceive(handle, bytes(data)))),
  getMaxTransceiveLength: (handle: NFCTechHandle) => nativeCall(() => host().getMaxTransceiveLength(handle)),
  setTimeout: (handle: NFCTechHandle, timeout: number) => nativeCall(() => host().setTimeout(handle, timeout)),
  getAtqa: async (handle: NFCTechHandle) => buffer(await nativeCall(() => host().getAtqa(handle))),
  getSak: (handle: NFCTechHandle) => nativeCall(() => host().getSak(handle)),
  getHistoricalBytes: async (handle: NFCTechHandle) =>
    buffer(await nativeCall(() => host().getHistoricalBytes(handle))),
  writeNdefMessage: (handle: NFCTechHandle, records: NFCRecord[], uris: string[], texts: string[]) =>
    nativeCall(() =>
      host().writeNdefMessage(
        handle,
        records.map(value => ({
          tnf: value.tnf,
          id: bytes(value.id),
          type: bytes(value.type),
          payload: bytes(value.payload),
        })),
        uris,
        texts,
      ),
    ),
  onDiscovered: (callback: (tag: NativeNFCTag) => void) => add(discoveredListeners, callback),
  removeDiscoveredListener: (id: number) => void discoveredListeners.delete(id),
  onDiscoveryStateChange: (callback: (state: NFCDiscoveryState) => void) => add(stateListeners, callback),
  removeDiscoveryStateListener: (id: number) => void stateListeners.delete(id),
};
