/**
 * Retained application capability, loaded through the registered native factory.
 * @ExportModule({ios: 'VRNfcNativeModule', android: 'io.valdiroutes.nfc.NfcNativeModule'})
 */
export declare function getHost(): NfcHost;

import type { NfcHost } from './NfcHost';
