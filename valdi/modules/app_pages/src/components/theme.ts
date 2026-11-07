import { Device } from 'valdi_core/src/Device';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import { getHost } from 'theme_bridge/src/ThemeBridge';

/**
 * Design tokens, owned natively in theme_bridge (valdi/modules/theme_bridge/assets/tokens.json) so pure native UI
 * and these components read one source. Colors come in a light and a dark set; sizes, spacing, radii and fonts are
 * shared. To add a token: edit tokens.json — both platforms and Valdi pick it up.
 *
 * The two color sets are Valdi color palettes: a component sets a color by its name (`color.surface` is 'surface'),
 * and the native side resolves it in the active palette. installTheme switches the palette with the system
 * appearance, which recolors every page natively, without a render.
 */

declare const runtime: ValdiRuntime;

/** The token payload the native host returns at startup. */
const native = getHost().getTokens();

export type ColorTokens = { readonly [name: string]: string };

const light = native.light as ColorTokens;
const dark = native.dark as ColorTokens;

export const COLORS = { light, dark } as const;

/** The palette names, to set as colors: `<view backgroundColor={color.surface} />`. */
export const color = Object.fromEntries(Object.keys(light).map(name => [name, name])) as { readonly [K in keyof typeof light]: K & string };

type DeepReadonly<T> = T extends (infer R)[] ? readonly DeepReadonly<R>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** The shared, appearance-independent tokens (radius/size/space/font/icon/motion). */
export const tokens = native.shared as DeepReadonly<typeof native.shared>;

/** Once, at startup (app.ts), before the first page renders. */
export function installTheme(): void {
  runtime.configureColorPalette('light', light);
  runtime.configureColorPalette('dark', dark);
  runtime.setActiveColorPalette(Device.isDarkMode() ? 'dark' : 'light');
  // Never cancelled: the theme lives as long as the app.
  Device.observeDarkMode(isDark => runtime.setActiveColorPalette(isDark ? 'dark' : 'light'));
}
