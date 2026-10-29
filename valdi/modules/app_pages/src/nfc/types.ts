export type NFCTechnologyName =
  | 'NfcA'
  | 'NfcB'
  | 'NfcF'
  | 'NfcV'
  | 'IsoDep'
  | 'MifareClassic'
  | 'MifareUltralight'
  | 'Ndef';

export interface NFCAvailability {
  supported: boolean;
  enabled: boolean;
  foreground: boolean;
  permissionGranted: boolean;
}

export interface NFCRecord {
  id: ArrayBuffer;
  type: ArrayBuffer;
  payload: ArrayBuffer;
  tnf: number;
}

/** The handle is session/generation scoped; a tag UID is not an operation handle. */
export interface NativeNFCTag {
  tagHandle: string;
  id: ArrayBuffer;
  techs: string[];
  messages: NFCRecord[];
}

export interface NFCTechHandle {
  tagHandle: string;
  tech: NFCTechnologyName;
}

export interface NFCDiscoveryState {
  discovering: boolean;
}
