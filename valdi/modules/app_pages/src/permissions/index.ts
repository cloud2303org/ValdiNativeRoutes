import { Device } from 'valdi_core/src/Device';
import { nativeCall } from '../nativeCall';
import { installedPermissionHost } from './PermissionHost';

// Runtime permissions for `api` (Bluetooth, Wi-Fi, NFC), on the host's PermissionHost. The prompt queue and the
// granted/denied/blocked bookkeeping are after ExpoNativeRoutes' device-permissions.

export type AndroidPermission = string;

const android = (name: string): AndroidPermission => `android.permission.${name}`;

export const ANDROID_PERMISSIONS = {
  ACCESS_FINE_LOCATION: android('ACCESS_FINE_LOCATION'),
  ACCESS_COARSE_LOCATION: android('ACCESS_COARSE_LOCATION'),
  NEARBY_WIFI_DEVICES: android('NEARBY_WIFI_DEVICES'),
  BLUETOOTH_SCAN: android('BLUETOOTH_SCAN'),
  BLUETOOTH_CONNECT: android('BLUETOOTH_CONNECT'),
  BLUETOOTH_ADVERTISE: android('BLUETOOTH_ADVERTISE'),
  CAMERA: android('CAMERA'),
};

export const isAndroid = (): boolean => Device.isAndroid();

/** Build.VERSION.SDK_INT; 0 on iOS. */
export const androidSdk = (): number => (isAndroid() ? installedPermissionHost().androidSdk : 0);

export type DevicePermissionStatus = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unavailable';
export interface DevicePermissionResult {
  status: DevicePermissionStatus;
  /** null means the OS cannot tell whether another prompt can be shown. */
  canAskAgain: boolean | null;
}

const check = (permission: AndroidPermission): Promise<boolean> =>
  nativeCall(() => installedPermissionHost().host.check(permission));

/** permission -> 'granted' | 'denied' | 'never_ask_again'. */
async function requestMultiple(permissions: AndroidPermission[]): Promise<Record<AndroidPermission, string>> {
  const results = await nativeCall(() => installedPermissionHost().host.requestMultiple(permissions));
  const map: Record<AndroidPermission, string> = {};
  results.forEach(grant => (map[grant.permission] = grant.result));
  return map;
}

let promptTail: Promise<void> = Promise.resolve();
const lastResults = new Map<AndroidPermission, DevicePermissionStatus>();

/** One prompt queue for Bluetooth, Wi-Fi and NFC, so concurrent callers cannot overlap system dialogs. */
export function serializePermissionRequest<T>(request: () => Promise<T>, checkActive?: () => void): Promise<T> {
  const result = promptTail.then(() => {
    checkActive?.();
    return request();
  });
  promptTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const unavailable = (): DevicePermissionResult => ({ status: 'unavailable', canAskAgain: false });

export async function getAndroidPermissionState(
  permissions: readonly AndroidPermission[],
): Promise<DevicePermissionResult> {
  if (!isAndroid()) return unavailable();
  const required = [...new Set(permissions)];
  const grants = await Promise.all(
    required.map(async permission => ({ permission, granted: await check(permission) })),
  );
  const missing = grants.filter(grant => !grant.granted).map(grant => grant.permission);
  for (const grant of grants) if (grant.granted) lastResults.set(grant.permission, 'granted');
  if (missing.length === 0) return { status: 'granted', canAskAgain: true };
  if (missing.some(permission => lastResults.get(permission) === 'blocked'))
    return { status: 'blocked', canAskAgain: false };
  if (missing.some(permission => lastResults.get(permission) === 'denied'))
    return { status: 'denied', canAskAgain: true };
  // Android's check cannot tell first use from a denial made before this process.
  return { status: 'undetermined', canAskAgain: null };
}

export function requestAndroidPermissions(
  permissions: readonly AndroidPermission[],
  checkActive?: () => void,
): Promise<DevicePermissionResult> {
  return serializePermissionRequest(async () => {
    const before = await getAndroidPermissionState(permissions);
    if (before.status === 'granted' || before.status === 'unavailable' || before.status === 'blocked') return before;
    const required = [...new Set(permissions)];
    const checked = await Promise.all(required.map(check));
    checkActive?.();
    const missing = required.filter((_, index) => !checked[index]);
    if (missing.length === 0) return { status: 'granted', canAskAgain: true };
    // Android 12+ can ignore FINE requested without COARSE, including a precision upgrade.
    const fine = ANDROID_PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = ANDROID_PERMISSIONS.ACCESS_COARSE_LOCATION;
    if (androidSdk() >= 31 && missing.includes(fine) && !missing.includes(coarse)) missing.push(coarse);
    const results = await requestMultiple(missing);
    for (const permission of missing) {
      const result = results[permission];
      lastResults.set(
        permission,
        result === 'granted' ? 'granted' : result === 'never_ask_again' ? 'blocked' : 'denied',
      );
    }
    return getAndroidPermissionState(required);
  }, checkActive);
}

/** Call only from an explicit user action after explaining why a permission is needed. */
export function openDevicePermissionSettings(): Promise<void> {
  return nativeCall(() => installedPermissionHost().host.openSettings());
}
