import type { RouteTab } from './navigation/models';

/**
 * The host updates selection and system safe area for the business-authored tab bar.
 * Its root absolutely overlays the pages. The host never measures its intrinsic height
 * or adds that height to page insets; business code shares its chosen height and padding.
 * The full-viewport root and layout ancestors must have no gesture/touch target.
 * Only visible bar children own gestures and hit regions so empty areas can pass through.
 *
 * @ViewModel
 * @ExportModel({ios: 'VRTabBarViewModel', android: 'io.valdiroutes.pages.TabBarViewModel'})
 */
export interface TabBarViewModel {
  items: RouteTab[];
  selectedRoute: string;
  safeAreaBottom: number;
}

/**
 * @Context
 * @ExportModel({ios: 'VRTabBarContext', android: 'io.valdiroutes.pages.TabBarContext'})
 */
export interface TabBarContext {
  selectTab: (route: string) => void;
}
