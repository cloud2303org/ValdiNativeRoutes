/**
 * The app's design tokens, owned natively so pure native UI and Valdi pages read one source.
 * Valdi's installTheme (app_pages) pulls the palettes at startup and hands them to
 * runtime.configureColorPalette; native views read the platform store directly.
 *
 * @ExportModule({swift: 'VRThemeBridgeNativeModule'})
 */
export declare function getHost(): ThemeHost;

import type { ThemeHost } from './host';
