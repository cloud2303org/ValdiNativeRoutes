import { bindMethods } from '../bindMethods';
import { createWifiRuntime, type WechatWifiApi } from './wechat';

export type WifiExtension = WechatWifiApi;

// Typed against the runtime: a name it lacks fails to compile, and so does a WechatWifiApi method missing here (the
// result would not be a WifiExtension).
const NAMES = [
  'startWifi',
  'stopWifi',
  'connectWifi',
  'getWifiList',
  'getConnectedWifi',
  'setWifiList',
  'onWifiConnected',
  'offWifiConnected',
  'onWifiConnectedWithPartialInfo',
  'offWifiConnectedWithPartialInfo',
  'onGetWifiList',
  'offGetWifiList',
  'getWifiPermissionState',
  'requestWifiPermission',
  'openWifiPermissionSettings',
] as const;

/** Lives as long as the app; creating it has no device side effects. */
export function createWifiExtension(): WifiExtension {
  return bindMethods(createWifiRuntime(), NAMES);
}
