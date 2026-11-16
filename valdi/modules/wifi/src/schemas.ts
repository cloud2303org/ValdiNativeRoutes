import type { WifiPermissionOptions } from './permission';
import type { ConnectWifiOptions, GetConnectedWifiOptions, SetWifiListOptions } from './wechat';
import type { WifiConnectParamsModel, WifiCredentialModel } from './WifiHost';

export const connectWifiOptions = (options: ConnectWifiOptions): WifiConnectParamsModel => ({
  SSID: options.SSID,
  password: options.password ?? '',
  BSSID: options.BSSID ?? '',
  maunal: options.maunal ?? false,
  partialInfo: options.partialInfo ?? false,
});

export const getConnectedWifiOptions = (options?: GetConnectedWifiOptions | null): { partialInfo: boolean } => ({
  partialInfo: options?.partialInfo ?? false,
});

export const setWifiListOptions = (options: SetWifiListOptions): { wifiList: WifiCredentialModel[] } => ({
  wifiList: [...options.wifiList],
});

export const wifiPermissionOptions = (options: WifiPermissionOptions): Required<WifiPermissionOptions> => ({
  operation: options.operation,
  partialInfo: options.partialInfo ?? false,
});
