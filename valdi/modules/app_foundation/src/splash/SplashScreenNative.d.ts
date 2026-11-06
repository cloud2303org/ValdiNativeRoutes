/** @ExportModule({ios: 'VRSplashScreenNativeModule', android: 'io.valdiroutes.pages.AndroidSplashScreenNativeModule'}) */
export declare function getHost(): SplashScreenHost;

/** @ExportProxy({ios: 'VRSplashScreenHost', android: 'io.valdiroutes.pages.AndroidSplashScreenHost'}) */
export interface SplashScreenHost {
  preventAutoHide(): boolean;
  hide(): void;
}
