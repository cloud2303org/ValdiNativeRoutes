import {
  ANDROID_PERMISSIONS,
  type AndroidPermission,
  androidSdk,
  isAndroid,
  isHarmony,
  HARMONY_PERMISSIONS,
  requestAndroidPermissions,
  requestHarmonyPermissions,
} from './permissions';

/** Android/Harmony requests share the app's device permission queue. iOS prompts on native adapter open. */
export async function requestBlePermissions(
  mode: 'central' | 'peripheral' = 'central',
  checkActive?: () => void,
): Promise<boolean> {
  if (isHarmony())
    return (await requestHarmonyPermissions([HARMONY_PERMISSIONS.ACCESS_BLUETOOTH], checkActive)).status === 'granted';
  if (!isAndroid()) return true;
  const apiLevel = androidSdk();
  const p = ANDROID_PERMISSIONS;
  let permissions: AndroidPermission[];
  if (apiLevel >= 31) {
    permissions = [mode === 'peripheral' ? p.BLUETOOTH_ADVERTISE : p.BLUETOOTH_SCAN, p.BLUETOOTH_CONNECT];
  } else if (mode === 'peripheral') {
    permissions = [];
  } else {
    permissions = [apiLevel >= 29 ? p.ACCESS_FINE_LOCATION : p.ACCESS_COARSE_LOCATION];
  }
  return (await requestAndroidPermissions(permissions, checkActive)).status === 'granted';
}
