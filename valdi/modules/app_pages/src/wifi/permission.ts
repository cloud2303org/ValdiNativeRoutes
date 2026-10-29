import {
  ANDROID_PERMISSIONS,
  type AndroidPermission,
  androidSdk,
  type DevicePermissionResult,
  getAndroidPermissionState,
  isAndroid,
  requestAndroidPermissions,
  serializePermissionRequest,
} from '../permissions/index';
import { nativeWifi } from './native';

export type WifiPermissionOperation = 'connect' | 'scan' | 'info';
export interface WifiPermissionOptions {
  operation: WifiPermissionOperation;
  /** API 33+ exact device-AP requests can return the confirmed request SSID without location. */
  partialInfo?: boolean;
}
export type WifiPermissionResult = DevicePermissionResult;

export function androidWifiPermissions(operation: WifiPermissionOperation, partialInfo = false): AndroidPermission[] {
  const sdk = androidSdk();
  if (sdk < 23) return [];
  const fine = ANDROID_PERMISSIONS.ACCESS_FINE_LOCATION;
  const location = sdk >= 31 ? [fine, ANDROID_PERMISSIONS.ACCESS_COARSE_LOCATION] : [fine];
  if (operation === 'connect' && sdk >= 33) {
    return partialInfo
      ? [ANDROID_PERMISSIONS.NEARBY_WIFI_DEVICES]
      : [ANDROID_PERMISSIONS.NEARBY_WIFI_DEVICES, ...location];
  }
  return location;
}

/** `options` were checked by wechat.ts (schemas.ts); the core answers one of DevicePermissionResult's statuses. */
export async function readWifiPermission({
  operation,
  partialInfo,
}: WifiPermissionOptions): Promise<WifiPermissionResult> {
  if (isAndroid()) {
    return getAndroidPermissionState(androidWifiPermissions(operation, partialInfo));
  }
  if (operation === 'scan') return { status: 'unavailable', canAskAgain: false };
  // Joining an explicitly supplied device AP uses NEHotspotConfiguration's own OS approval.
  if (operation === 'connect') return { status: 'granted', canAskAgain: true };
  return (await nativeWifi.getLocationPermissionState()) as WifiPermissionResult;
}

export async function askWifiPermission(
  options: WifiPermissionOptions,
  checkActive?: () => void,
): Promise<WifiPermissionResult> {
  checkActive?.();
  const { operation, partialInfo } = options;
  if (isAndroid()) {
    return requestAndroidPermissions(androidWifiPermissions(operation, partialInfo), checkActive);
  }
  if (operation === 'scan') return { status: 'unavailable', canAskAgain: false };
  if (operation === 'connect') return { status: 'granted', canAskAgain: true };
  return serializePermissionRequest(async () => {
    const current = await readWifiPermission(options);
    checkActive?.();
    if (current.status === 'granted' || current.status === 'blocked' || current.status === 'unavailable')
      return current;
    return (await nativeWifi.requestLocationPermission()) as WifiPermissionResult;
  }, checkActive);
}
