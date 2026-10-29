/** The Valdi bridge to ExpoNativeRoutes' Wi-Fi core (Android WifiCore, iOS WifiCore), installed by each host. */

/** @ExportModel({ios: 'VRWifiInfo', android: 'io.valdiroutes.pages.WifiInfo'}) */
export interface WifiInfoModel {
  SSID: string;
  BSSID?: string;
  secure?: boolean;
  signalStrength?: number;
  frequency?: number;
}

/** @ExportModel({ios: 'VRWifiConnectParams', android: 'io.valdiroutes.pages.WifiConnectParams'}) */
export interface WifiConnectParamsModel {
  SSID: string;
  BSSID: string;
  password: string;
  maunal: boolean;
  partialInfo: boolean;
}

/** @ExportModel({ios: 'VRWifiCredential', android: 'io.valdiroutes.pages.WifiCredential'}) */
export interface WifiCredentialModel {
  SSID: string;
  BSSID?: string;
  password: string;
}

/** @ExportModel({ios: 'VRWifiPermissionState', android: 'io.valdiroutes.pages.WifiPermissionState'}) */
export interface WifiPermissionStateModel {
  status: string;
  canAskAgain: boolean;
}

/**
 * Everything the Wi-Fi core reports, for the app's lifetime; native.ts fans it out to listeners.
 *
 * @ExportModel({ios: 'VRWifiHostEvents', android: 'io.valdiroutes.pages.WifiHostEvents'})
 */
export interface WifiHostEvents {
  wifiConnected: (wifi: WifiInfoModel) => void;
  wifiList: (wifiList: WifiInfoModel[]) => void;
}

/**
 * One app-wide Wi-Fi session, never released. Capability only: wifi/wechat.ts owns the mini-program rules. Errors keep
 * the core's `E_WIFI_…:message` form for errors.ts.
 *
 * @ExportProxy({ios: 'VRWifiHost', android: 'io.valdiroutes.pages.WifiHost'})
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

const HOST_KEY = '__valdiRoutesWifiHost';

/** @ExportFunction({ios: 'VRInstallWifiHost', android: 'io.valdiroutes.pages.InstallWifiHost'}) */
export function installWifiHost(host: WifiHost): void {
  (globalThis as any)[HOST_KEY] = host;
  host.setEvents(wifiEvents);
}

export function wifiHost(): WifiHost {
  const host: WifiHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) throw new Error('E_WIFI_SYSTEM_INTERNAL:native Wi-Fi is not installed');
  return host;
}
