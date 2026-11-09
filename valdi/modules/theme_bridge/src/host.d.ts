/** Strongly typed design-token contracts. Values are constructed once by the native store. */
/** @ExportModel({swift: 'VRThemeColorTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeColorTokens'}) */
export interface ThemeColorTokens {
  readonly canvas: string;
  readonly surface: string;
  readonly ink: string;
  readonly text: string;
  readonly muted: string;
  readonly title: string;
  readonly section: string;
  readonly description: string;
  readonly chevron: string;
  readonly icon: string;
  readonly hairline: string;
  readonly border: string;
  readonly separator: string;
  readonly pressed: string;
  readonly backPressed: string;
  readonly iconWell: string;
  readonly primary: string;
  readonly success: string;
  readonly danger: string;
  readonly scrim: string;
  readonly handle: string;
  readonly segmentTrack: string;
  readonly segmentIndicator: string;
  readonly segmentText: string;
  readonly segmentTextActive: string;
  readonly buttonPrimary: string;
  readonly buttonOnPrimary: string;
  readonly buttonSecondary: string;
  readonly buttonOnSecondary: string;
  readonly buttonDanger: string;
  readonly buttonOnDanger: string;
  readonly playerBackground: string;
}

/** @ExportModel({swift: 'VRThemeRadiusTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeRadiusTokens'}) */
export interface ThemeRadiusTokens {
  readonly tiny: number;
  readonly small: number;
  readonly medium: number;
  readonly compact: number;
  readonly control: number;
  readonly icon: number;
  readonly button: number;
  readonly surface: number;
  readonly card: number;
  readonly sheet: number;
  readonly pill: number;
}

/** @ExportModel({swift: 'VRThemeSizeTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeSizeTokens'}) */
export interface ThemeSizeTokens {
  readonly nav: number;
  readonly back: number;
  readonly icon: number;
  readonly row: number;
  readonly button: number;
}

/** @ExportModel({swift: 'VRThemeSpaceTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeSpaceTokens'}) */
export interface ThemeSpaceTokens {
  readonly xxs: number;
  readonly xs: number;
  readonly tight: number;
  readonly sm: number;
  readonly section: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly content: number;
  readonly roomy: number;
  readonly xxl: number;
  readonly wide: number;
  readonly bottom: number;
}

/** @ExportModel({swift: 'VRThemeFontTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeFontTokens'}) */
export interface ThemeFontTokens {
  readonly nav: number;
  readonly button: number;
  readonly title: number;
  readonly segment: number;
  readonly section: number;
  readonly body: number;
  readonly tiny: number;
  readonly sheetTitle: number;
  readonly heading: number;
}

/** @ExportModel({swift: 'VRThemeIconTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeIconTokens'}) */
export interface ThemeIconTokens {
  readonly row: number;
  readonly chevron: number;
  readonly back: number;
}

/** @ExportModel({swift: 'VRThemeMotionTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeMotionTokens'}) */
export interface ThemeMotionTokens {
  readonly pressedOpacity: number;
  readonly pressedScale: number;
  readonly disabledOpacity: number;
}

/** @ExportModel({swift: 'VRThemeSharedTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeSharedTokens'}) */
export interface ThemeSharedTokens {
  readonly radius: ThemeRadiusTokens;
  readonly size: ThemeSizeTokens;
  readonly space: ThemeSpaceTokens;
  readonly font: ThemeFontTokens;
  readonly icon: ThemeIconTokens;
  readonly motion: ThemeMotionTokens;
}

/** @ExportModel({swift: 'VRThemeTokens', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeTokens'}) */
export interface ThemeTokens {
  readonly light: ThemeColorTokens;
  readonly dark: ThemeColorTokens;
  readonly shared: ThemeSharedTokens;
}

/** @ExportModel({swift: 'VRThemeHost', android: 'io.valdiroutes.app.modules.theme_bridge.ThemeHost'}) */
export interface ThemeHost {
  getTokens(): ThemeTokens;
}
