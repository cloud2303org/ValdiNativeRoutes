import { Device } from 'valdi_core/src/Device';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import { getHost } from 'theme_bridge/src/ThemeBridge';
import type { ThemeColorTokens } from 'theme_bridge/src/host';

/** Native owns the token values; this module only adapts its typed snapshot to Valdi palettes. */
declare const runtime: ValdiRuntime;
const native = getHost().getTokens();

export type ColorTokens = ThemeColorTokens;
export const COLORS = { light: native.light, dark: native.dark } as const;

/** Palette identifiers are exhaustive and checked against the native contract. */
export const color = {
  canvas: 'canvas',
  surface: 'surface',
  ink: 'ink',
  text: 'text',
  muted: 'muted',
  title: 'title',
  section: 'section',
  description: 'description',
  chevron: 'chevron',
  icon: 'icon',
  hairline: 'hairline',
  border: 'border',
  separator: 'separator',
  pressed: 'pressed',
  backPressed: 'backPressed',
  iconWell: 'iconWell',
  primary: 'primary',
  success: 'success',
  danger: 'danger',
  scrim: 'scrim',
  handle: 'handle',
  segmentTrack: 'segmentTrack',
  segmentIndicator: 'segmentIndicator',
  segmentText: 'segmentText',
  segmentTextActive: 'segmentTextActive',
  buttonPrimary: 'buttonPrimary',
  buttonOnPrimary: 'buttonOnPrimary',
  buttonSecondary: 'buttonSecondary',
  buttonOnSecondary: 'buttonOnSecondary',
  buttonDanger: 'buttonDanger',
  buttonOnDanger: 'buttonOnDanger',
  playerBackground: 'playerBackground',
} as const satisfies { readonly [K in keyof ThemeColorTokens]: K };

export const tokens = native.shared;

/** Valdi's dictionary is a rendering boundary, not the public token contract. */
function palette(colors: ThemeColorTokens): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of Object.values(color)) result[name] = colors[name];
  return result;
}

/** Once, at startup, before the first page renders. */
export function installTheme(): void {
  runtime.configureColorPalette('light', palette(native.light));
  runtime.configureColorPalette('dark', palette(native.dark));
  runtime.setActiveColorPalette(Device.isDarkMode() ? 'dark' : 'light');
  Device.observeDarkMode(isDark => runtime.setActiveColorPalette(isDark ? 'dark' : 'light'));
}
