/**
 * Retained application capability, loaded through the registered native factory.
 * @ExportModule({ios: 'VRWifiNativeModule', android: 'io.valdiroutes.wifi.WifiNativeModule'})
 */
export declare function getHost(): WifiHost;

import type { WifiHost } from './WifiHost';
