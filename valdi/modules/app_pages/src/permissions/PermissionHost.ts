/** @ExportModel({ios: 'VRPermissionGrant', android: 'io.valdiroutes.pages.PermissionGrant'}) */
export interface PermissionGrant {
  permission: string;
  /** Exactly 'granted', 'denied' or 'never_ask_again'; hosts normalize OS results to these strings. */
  result: string;
}

/**
 * Runtime permissions, implemented by each host. Capability only: permissions/index.ts decides what to ask and when.
 *
 * @ExportProxy({ios: 'VRPermissionHost', android: 'io.valdiroutes.pages.PermissionHost'})
 */
export interface PermissionHost {
  /** Exact boolean grant state. Android: ContextCompat; Harmony: access-token permission status. */
  check(permission: string): Promise<boolean>;
  /**
   * One grant per input permission, using its original name and canonical result above.
   * Android: one foreground activity prompt. Harmony: prompt user_grant only; check system_grant without a dialog.
   */
  requestMultiple(permissions: string[]): Promise<PermissionGrant[]>;
  /** The app's page in system settings. */
  openSettings(): Promise<void>;
}

interface Installed {
  host: PermissionHost;
  androidSdk: number;
}

const HOST_KEY = '__valdiRoutesPermissionHost';

/**
 * Called by the host at startup from its retained JS scope. androidSdk is Build.VERSION.SDK_INT, 0 on iOS/Harmony.
 *
 * @ExportFunction({ios: 'VRInstallPermissionHost', android: 'io.valdiroutes.pages.InstallPermissionHost'})
 */
export function installPermissionHost(host: PermissionHost, androidSdk: number): void {
  (globalThis as any)[HOST_KEY] = { host, androidSdk };
}

export function installedPermissionHost(): Installed {
  const value: Installed | undefined = (globalThis as any)[HOST_KEY];
  if (!value) throw new Error('native permissions are not installed');
  return value;
}
