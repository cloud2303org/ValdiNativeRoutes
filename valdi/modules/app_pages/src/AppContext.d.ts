import type { TokenStore } from './auth';
import type { NavigationHost } from './NavigationHost';

/** @ExportModule({ios: 'VRAppContextNativeModule', android: 'io.valdiroutes.pages.AppContextNativeModule'}) */
export declare function getHost(): AppContextHost;

/** @ExportProxy({ios: 'VRAppContextHost', android: 'io.valdiroutes.pages.AppContextHost'}) */
export interface AppContextHost {
  getNavigationHost(): NavigationHost;
  getTokenStore(): TokenStore;
}

