/**
 * Supplied once by the App at startup. The same service must serve Wi-Fi/NFC so
 * permission dialogs stay in one queue. No dependency on application modules.
 */
export interface BluetoothPermissions {
  isAndroid(): boolean;
  androidSdk(): number;
  requestAndroidPermissions(
    permissions: readonly string[],
    checkActive?: () => void,
  ): Promise<{ status: string }>;
  serializePermissionRequest<T>(request: () => Promise<T>, checkActive?: () => void): Promise<T>;
}

let service: BluetoothPermissions | undefined;

export function configureBluetoothPermissions(value: BluetoothPermissions): void {
  if (service && service !== value) throw new Error('Bluetooth permissions are already configured');
  service = value;
}

function permissions(): BluetoothPermissions {
  if (!service) throw new Error('Bluetooth permissions are not configured; initialize Bluetooth at App startup');
  return service;
}

export type AndroidPermission = string;
export const ANDROID_PERMISSIONS = {
  ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
  BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
  BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
};

export const isAndroid = (): boolean => permissions().isAndroid();
export const androidSdk = (): number => permissions().androidSdk();
export const requestAndroidPermissions = (values: readonly string[], checkActive?: () => void) =>
  permissions().requestAndroidPermissions(values, checkActive);
export function serializePermissionRequest<T>(request: () => Promise<T>, checkActive?: () => void): Promise<T> {
  return permissions().serializePermissionRequest(request, checkActive);
}
