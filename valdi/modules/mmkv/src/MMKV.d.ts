/**
 * Retained application capability, loaded through the registered native factory.
 * @ExportModule({ios: 'VRMMKVNativeModule', android: 'io.valdiroutes.mmkv.MMKVNativeModule'})
 */
export declare function getHost(): StorageHost;

import type { StorageHost } from './storage';
