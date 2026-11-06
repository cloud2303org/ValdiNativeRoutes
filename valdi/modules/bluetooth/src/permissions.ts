// Use the same service and prompt queue as Wi-Fi/NFC, including native iOS adapter opens.
export {
  ANDROID_PERMISSIONS,
  type AndroidPermission,
  androidSdk,
  isAndroid,
  requestAndroidPermissions,
  serializePermissionRequest,
} from 'permissions/src/index';
