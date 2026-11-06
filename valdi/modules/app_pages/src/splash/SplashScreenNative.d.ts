/** @ExportModule({ios: 'VRAndroidSplashScreenNativeModule', android: 'io.valdiroutes.pages.AndroidSplashScreenNativeModule'}) */
export declare function getHost(): AndroidSplashScreenHost;

/** @ExportProxy({ios: 'VRAndroidSplashScreenHost', android: 'io.valdiroutes.pages.AndroidSplashScreenHost'}) */
export interface AndroidSplashScreenHost {
  preventAutoHide(): boolean;
  hide(): void;
}
