/** Pure data crossing the native navigation boundary. Keep application generics in config/index. */

/** @ExportModel({ios: 'VRResolvedNavigation', android: 'io.valdiroutes.pages.ResolvedNavigation'}) */
export interface ResolvedNavigation {
  animation: string;
  durationMs: number;
  presentation: string;
}

/** @ExportModel({ios: 'VRRouteEntry', android: 'io.valdiroutes.pages.RouteEntry'}) */
export interface RouteEntry {
  route: string;
  kind: string;
  title: string;
  component?: string;
  nativeName?: string;
}

/** @ExportModel({ios: 'VRRouteTab', android: 'io.valdiroutes.pages.RouteTab'}) */
export interface RouteTab {
  route: string;
  text: string;
  icon: string;
  selectedIcon: string;
  iconData?: string;
  selectedIconData?: string;
}

/** @ExportModel({ios: 'VRRouteTabBar', android: 'io.valdiroutes.pages.RouteTabBar'}) */
export interface RouteTabBar {
  route: string;
  initial: string;
  tabs: RouteTab[];
  /** Missing mode normalizes to 'default' for declarations produced before this field existed. */
  mode?: string;
  /** Canonical exported Valdi class path; required only for 'custom'. */
  component?: string;
  /** Docked height in dp/pt for custom bars; omitted for default bars or explicit full-viewport overlays. */
  height?: number;
}

/**
 * View model passed by the host to a custom Valdi tab bar component.
 * By default, custom bars are docked at the bottom with `height + safeAreaBottom` added to page insets;
 * only `overlay: true` mounts full-viewport and requires a root `hitTest`.
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

/** @ExportModel({ios: 'VRRouteDeclaration', android: 'io.valdiroutes.pages.RouteDeclaration'}) */
export interface RouteDeclaration {
  routes: RouteEntry[];
  tabBar?: RouteTabBar;
  root: string;
}

/** @ExportModel({ios: 'VRStackPage', android: 'io.valdiroutes.pages.StackPage'}) */
export interface StackPage {
  pageId: string;
  route: string;
  params: any;
}
