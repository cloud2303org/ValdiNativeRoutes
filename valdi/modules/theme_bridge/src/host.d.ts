/**
 * The design-token payload the native host hands Valdi at startup. The token values
 * themselves live in the module's tokens.json, parsed once by the native store.
 *
 * @ExportModel({swift: 'VRThemeTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeTokens'})
 */
export interface ThemeHost_Tokens {
  /** Token name → color string, the light palette ('surface' → '#ffffff'). */
  light: any;
  /** Token name → color string, the dark palette. */
  dark: any;
  /** Flat JSON of the shared tokens (radius/size/space/font/icon/motion). */
  shared: any;
}

/**
 * @ExportModel({swift: 'VRThemeHost', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeHost'})
 */
export interface ThemeHost {
  getTokens(): ThemeHost_Tokens;
}
