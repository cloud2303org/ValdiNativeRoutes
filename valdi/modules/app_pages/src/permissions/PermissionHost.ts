/** @ExportModel({ios: 'VRPermissionGrant', android: 'io.valdiroutes.pages.PermissionGrant'}) */
export interface PermissionGrant {
  permission: string;
  /** 'granted', 'denied' or 'never_ask_again'. */
  result: string;
}

/**
 * Runtime permissions, implemented by each host. Capability only: permissions/index.ts decides what to ask and when.
 *
 * @ExportProxy({ios: 'VRPermissionHost', android: 'io.valdiroutes.pages.PermissionHost'})
 */
export interface PermissionHost {
  /** Android: ContextCompat.checkSelfPermission. */
  check(permission: string): Promise<boolean>;
  /** Android: one system prompt for all, from the foreground activity. */
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
 * Called by the host at startup from its retained JS scope. androidSdk is Build.VERSION.SDK_INT, 0 on iOS.
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
