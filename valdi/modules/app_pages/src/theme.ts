import { Device } from 'valdi_core/src/Device';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';

/**
 * Design tokens, the values of ExpoNativeRoutes (packages/ui/design/tokens.json) so both apps look the same. Colors
 * come in a light and a dark set; sizes, spacing, radii and fonts are shared.
 *
 * The two color sets are Valdi color palettes: a component sets a color by its name (`color.surface` is 'surface'),
 * and the native side resolves it in the active palette. installTheme switches the palette with the system
 * appearance, which recolors every page natively, without a render.
 */

declare const runtime: ValdiRuntime;

const light = {
  /** Page background. */
  canvas: '#f5f7fb',
  /** Bars, cards, inputs. */
  surface: '#ffffff',
  /** Navigation bar title and icons. */
  ink: '#101828',
  text: '#172033',
  muted: '#667085',
  title: '#233d63',
  section: '#617e9f',
  description: '#7c8fa9',
  chevron: '#8499b6',
  icon: '#377dff',
  hairline: '#ececec',
  border: '#E8ECF1',
  separator: 'rgba(77,112,163,0.14)',
  pressed: 'rgba(55,125,255,0.10)',
  backPressed: 'rgba(16,24,40,0.06)',
  iconWell: 'rgba(55,125,255,0.10)',
  primary: '#1e62d0',
  success: '#0ECD9D',
  danger: '#d54941',
  scrim: 'rgba(16,24,40,0.32)',
  handle: '#D6DCE5',
  segmentTrack: '#e9edf3',
  segmentIndicator: '#ffffff',
  segmentText: '#606b7a',
  segmentTextActive: '#18263b',
  buttonPrimary: '#1e62d0',
  buttonOnPrimary: '#ffffff',
  buttonSecondary: '#eef2f7',
  buttonOnSecondary: '#1d2939',
  buttonDanger: '#fdecec',
  buttonOnDanger: '#d92d20',
};

export type ColorTokens = typeof light;

const dark: ColorTokens = {
  canvas: '#121316',
  surface: '#1E1F23',
  ink: '#ffffff',
  text: '#ffffff',
  muted: '#969696',
  title: '#ffffff',
  section: '#969696',
  description: '#D5D5D6',
  chevron: '#969696',
  icon: '#377dff',
  hairline: '#2A2B32',
  border: '#2A2B32',
  separator: '#2A2B32',
  pressed: '#2E2F36',
  backPressed: '#2E2F36',
  iconWell: 'rgba(55,125,255,0.16)',
  primary: '#377dff',
  success: '#56DCBA',
  danger: '#f56c6c',
  scrim: 'rgba(0,0,0,0.75)',
  handle: '#969696',
  segmentTrack: '#1E1F23',
  segmentIndicator: '#454750',
  segmentText: '#D5D5D6',
  segmentTextActive: '#ffffff',
  buttonPrimary: '#377dff',
  buttonOnPrimary: '#ffffff',
  buttonSecondary: '#2c2e35',
  buttonOnSecondary: '#f2f4f7',
  buttonDanger: 'rgba(245,108,108,0.18)',
  buttonOnDanger: '#ff8a8a',
};

export const COLORS = { light, dark } as const;

export type ColorScheme = keyof typeof COLORS;

export type ColorName = keyof ColorTokens;

/** The palette names, to set as colors: `<view backgroundColor={color.surface} />`. */
export const color = Object.fromEntries(Object.keys(light).map(name => [name, name])) as { readonly [K in ColorName]: K };

/** Once, at startup (app.ts), before the first page renders. */
export function installTheme(): void {
  runtime.configureColorPalette('light', light);
  runtime.configureColorPalette('dark', dark);
  runtime.setActiveColorPalette(Device.isDarkMode() ? 'dark' : 'light');
  // Never cancelled: the theme lives as long as the app.
  Device.observeDarkMode(isDark => runtime.setActiveColorPalette(isDark ? 'dark' : 'light'));
}

export const tokens = {
  radius: { tiny: 2, small: 6, medium: 8, compact: 10, control: 12, icon: 12, button: 14, surface: 20, card: 22, sheet: 22, pill: 999 },
  size: { nav: 44, back: 40, icon: 36, row: 72, button: 48 },
  space: { xxs: 2, xs: 4, tight: 6, sm: 8, section: 10, md: 12, lg: 16, xl: 20, content: 24, roomy: 28, xxl: 32, wide: 40, bottom: 48 },
  font: { nav: 17, button: 16, title: 15, segment: 14, section: 13, body: 12, tiny: 11, sheetTitle: 20, heading: 30 },
  icon: { row: 21, chevron: 19, back: 28 },
  motion: { pressedOpacity: 0.82, pressedScale: 0.97, disabledOpacity: 0.4 },
} as const;
