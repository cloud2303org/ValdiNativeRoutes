/**
 * Retained application capability, loaded through the registered native factory.
 * @ExportModule({ios: 'VRPermissionsNativeModule', android: 'io.valdiroutes.permissions.PermissionsNativeModule'})
 */
export declare function getHost(): PermissionHost;
export declare function getAndroidSdk(): number;

import type { PermissionHost } from './PermissionHost';
