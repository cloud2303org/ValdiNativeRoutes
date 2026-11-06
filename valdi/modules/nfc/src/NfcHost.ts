import { getHost } from './Nfc';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';

/** The Valdi bridge to ExpoNativeRoutes' Android NFC core (NfcCore, reader mode). iOS answers "not supported". */

/** @ExportModel({ios: 'VRNfcHandle', android: 'io.valdiroutes.nfc.NfcHandle'}) */
export interface NfcHandleModel {
  tagHandle: string;
  tech: string;
}

/** @ExportModel({ios: 'VRNfcAvailability', android: 'io.valdiroutes.nfc.NfcAvailability'}) */
export interface NfcAvailabilityModel {
  supported: boolean;
  enabled: boolean;
  foreground: boolean;
  permissionGranted: boolean;
}

/** @ExportModel({ios: 'VRNfcRecord', android: 'io.valdiroutes.nfc.NfcRecord'}) */
export interface NfcRecordModel {
  id: Uint8Array;
  type: Uint8Array;
  payload: Uint8Array;
  tnf: number;
}

/** @ExportModel({ios: 'VRNfcTag', android: 'io.valdiroutes.nfc.NfcTag'}) */
export interface NfcTagModel {
  tagHandle: string;
  id: Uint8Array;
  techs: string[];
  messages: NfcRecordModel[];
}

/**
 * Everything the NFC core reports, for the app's lifetime; native.ts fans it out to listeners.
 *
 * @ExportModel({ios: 'VRNfcHostEvents', android: 'io.valdiroutes.nfc.NfcHostEvents'})
 */
export interface NfcHostEvents {
  discovered: (tag: NfcTagModel) => void;
  discoveryStateChange: (discovering: boolean) => void;
}

/**
 * One app-wide NFC session, never released (Android only). Capability only: nfc/adapter.ts owns the mini-program
 * rules. Errors keep the core's `E_NFC_…:message` form for errors.ts.
 *
 * @ExportProxy({ios: 'VRNfcHost', android: 'io.valdiroutes.nfc.NfcHost'})
 */
export interface NfcHost {
  setEvents(events: NfcHostEvents): void;
  getAvailability(): Promise<NfcAvailabilityModel>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(handle: NfcHandleModel): Promise<void>;
  close(handle: NfcHandleModel): Promise<void>;
  isConnected(handle: NfcHandleModel): Promise<boolean>;
  transceive(handle: NfcHandleModel, data: Uint8Array): Promise<Uint8Array>;
  getMaxTransceiveLength(handle: NfcHandleModel): Promise<number>;
  setTimeout(handle: NfcHandleModel, timeout: number): Promise<void>;
  getAtqa(handle: NfcHandleModel): Promise<Uint8Array>;
  getSak(handle: NfcHandleModel): Promise<number>;
  getHistoricalBytes(handle: NfcHandleModel): Promise<Uint8Array>;
  writeNdefMessage(handle: NfcHandleModel, records: NfcRecordModel[], uris: string[], texts: string[]): Promise<void>;
}

import { nfcEvents } from './native';

// Bind the session once, on first use. Factory construction already observes native lifecycle.
let boundHost: NfcHost | undefined;
export function nfcHost(): NfcHost {
  if (boundHost) return boundHost;
  return withGlobalNativeRefs('nfc', () => {
    const host = getHost();
    host.setEvents(nfcEvents);
    boundHost = host;
    return host;
  });
}
