import { getHost } from './Wifi';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';

/** The Valdi bridge to ExpoNativeRoutes' Wi-Fi core (Android WifiCore, iOS WifiCore), provided by the native factory. */

/** @ExportModel({ios: 'VRWifiInfo', android: 'io.valdiroutes.wifi.WifiInfo'}) */
export interface WifiInfoModel {
  SSID: string;
  BSSID?: string;
  secure?: boolean;
  signalStrength?: number;
  frequency?: number;
}

/** @ExportModel({ios: 'VRWifiConnectParams', android: 'io.valdiroutes.wifi.WifiConnectParams'}) */
export interface WifiConnectParamsModel {
  SSID: string;
  BSSID: string;
  password: string;
  maunal: boolean;
  partialInfo: boolean;
}

/** @ExportModel({ios: 'VRWifiCredential', android: 'io.valdiroutes.wifi.WifiCredential'}) */
export interface WifiCredentialModel {
  SSID: string;
  BSSID?: string;
  password: string;
}

/** @ExportModel({ios: 'VRWifiPermissionState', android: 'io.valdiroutes.wifi.WifiPermissionState'}) */
export interface WifiPermissionStateModel {
  status: string;
  canAskAgain: boolean;
}

/**
 * Everything the Wi-Fi core reports, for the app's lifetime; native.ts fans it out to listeners.
 *
 * @ExportModel({ios: 'VRWifiHostEvents', android: 'io.valdiroutes.wifi.WifiHostEvents'})
 */
export interface WifiHostEvents {
  wifiConnected: (wifi: WifiInfoModel) => void;
  wifiList: (wifiList: WifiInfoModel[]) => void;
}

/**
 * One app-wide Wi-Fi session, never released. Capability only: wifi/wechat.ts owns the mini-program rules. Errors keep
 * the core's `E_WIFI_…:message` form for errors.ts.
 *
 * @ExportProxy({ios: 'VRWifiHost', android: 'io.valdiroutes.wifi.WifiHost'})
 */
export interface WifiHost {
  setEvents(events: WifiHostEvents): void;
  startWifi(): Promise<void>;
  stopWifi(): Promise<void>;
  connectWifi(params: WifiConnectParamsModel): Promise<WifiInfoModel>;
  getWifiList(): Promise<void>;
  getConnectedWifi(partialInfo: boolean): Promise<WifiInfoModel>;
  setWifiList(wifiList: WifiCredentialModel[]): Promise<void>;
  getLocationPermissionState(): Promise<WifiPermissionStateModel>;
  requestLocationPermission(): Promise<WifiPermissionStateModel>;
}

import { wifiEvents } from './native';

let factoryHost: WifiHost | undefined;

// Retain one factory proxy: marshaling the same native host again may create a different JS wrapper.
// Factory construction already observes native lifecycle; event binding starts on first use.
export function wifiHost(): WifiHost {
  if (factoryHost) return factoryHost;
  return withGlobalNativeRefs('wifi', () => {
    const host = getHost();
    host.setEvents(wifiEvents);
    factoryHost = host;
    return host;
  });
}
