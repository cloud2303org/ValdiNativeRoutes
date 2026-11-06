import type { NavigationHost } from '../navigation/NavigationHost';

/**
 * Returns the core host contract. An extended native Host uses an application-owned
 * exported module so its additional members have their own generated schema.
 *
 * @ExportModule({ios: 'VRAppContextNativeModule', android: 'io.valdiroutes.pages.AppContextNativeModule'})
 */
export declare function getHost(): AppContextHost;

/**
 * The reusable host has no application state or authentication requirements.
 * Applications declare additional native capabilities in their own explicit Host contracts.
 *
 * @ExportProxy({ios: 'VRAppContextHost', android: 'io.valdiroutes.pages.AppContextHost'})
 */
export interface AppContextHost {
  getNavigationHost(): NavigationHost;
}
