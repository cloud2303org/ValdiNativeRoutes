/** The Valdi bridge to ExpoNativeRoutes' Android NFC core (NfcCore, reader mode). iOS answers "not supported". */

/** @ExportModel({ios: 'VRNfcHandle', android: 'io.valdiroutes.pages.NfcHandle'}) */
export interface NfcHandleModel {
  tagHandle: string;
  tech: string;
}

/** @ExportModel({ios: 'VRNfcAvailability', android: 'io.valdiroutes.pages.NfcAvailability'}) */
export interface NfcAvailabilityModel {
  supported: boolean;
  enabled: boolean;
  foreground: boolean;
  permissionGranted: boolean;
}

/** @ExportModel({ios: 'VRNfcRecord', android: 'io.valdiroutes.pages.NfcRecord'}) */
export interface NfcRecordModel {
  id: Uint8Array;
  type: Uint8Array;
  payload: Uint8Array;
  tnf: number;
}

/** @ExportModel({ios: 'VRNfcTag', android: 'io.valdiroutes.pages.NfcTag'}) */
export interface NfcTagModel {
  tagHandle: string;
  id: Uint8Array;
  techs: string[];
  messages: NfcRecordModel[];
}

/**
 * Everything the NFC core reports, for the app's lifetime; native.ts fans it out to listeners.
 *
 * @ExportModel({ios: 'VRNfcHostEvents', android: 'io.valdiroutes.pages.NfcHostEvents'})
 */
export interface NfcHostEvents {
  discovered: (tag: NfcTagModel) => void;
  discoveryStateChange: (discovering: boolean) => void;
}

/**
 * One app-wide NFC session, never released (Android only). Capability only: nfc/adapter.ts owns the mini-program
 * rules. Errors keep the core's `E_NFC_…:message` form for errors.ts.
 *
 * @ExportProxy({ios: 'VRNfcHost', android: 'io.valdiroutes.pages.NfcHost'})
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

const HOST_KEY = '__valdiRoutesNfcHost';

/** @ExportFunction({ios: 'VRInstallNfcHost', android: 'io.valdiroutes.pages.InstallNfcHost'}) */
export function installNfcHost(host: NfcHost): void {
  (globalThis as any)[HOST_KEY] = host;
  host.setEvents(nfcEvents);
}

export function nfcHost(): NfcHost {
  const host: NfcHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) throw new Error('E_NFC_NOT_SUPPORTED:native NFC is not installed');
  return host;
}
