/** @ExportEnum({ios: 'VRPermissionGrantResult', android: 'io.valdiroutes.permissions.PermissionGrantResult'}) */
export enum PermissionGrantResult {
  Granted = 'granted',
  Denied = 'denied',
  NeverAskAgain = 'never_ask_again',
}

/** @ExportModel({ios: 'VRPermissionGrant', android: 'io.valdiroutes.permissions.PermissionGrant'}) */
export interface PermissionGrant {
  permission: string;
  /** Hosts normalize OS results at the native boundary. */
  result: PermissionGrantResult;
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
