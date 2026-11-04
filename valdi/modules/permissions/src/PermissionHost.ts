import { getHost, getAndroidSdk } from './Permissions';

/** @ExportModel({ios: 'VRPermissionGrant', android: 'io.valdiroutes.permissions.PermissionGrant'}) */
export interface PermissionGrant {
  permission: string;
  /** Exactly 'granted', 'denied' or 'never_ask_again'; hosts normalize OS results to these strings. */
  result: string;
}

/**
 * Runtime permissions, implemented by each host. Capability only: permissions/index.ts decides what to ask and when.
 *
 * @ExportProxy({ios: 'VRPermissionHost', android: 'io.valdiroutes.permissions.PermissionHost'})
 */
export interface PermissionHost {
  /** Exact boolean grant state. Android: ContextCompat. */
  check(permission: string): Promise<boolean>;
  /**
   * One grant per input permission, using its original name and canonical result above.
   * Android: one foreground activity prompt.
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
 * Optional explicit override. Factory-backed apps read getHost/getAndroidSdk directly.
 */
export function installPermissionHost(host: PermissionHost, androidSdk: number): void {
  (globalThis as any)[HOST_KEY] = { host, androidSdk };
}

export function installedPermissionHost(): Installed {
  return (globalThis as any)[HOST_KEY] ?? { host: getHost(), androidSdk: getAndroidSdk() };
}
