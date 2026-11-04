/**
 * Retained application capability, loaded through the registered native factory.
 * @ExportModule({ios: 'VRAppUINativeModule', android: 'io.valdiroutes.app_ui.AppUINativeModule'})
 */
export declare function getHost(): AppUIHost;

import type { AppUIHost } from './AppUIHost';
