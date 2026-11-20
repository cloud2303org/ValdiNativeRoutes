/**
 * Detent sizing mode passed to native BottomSheet views.
 * @ExportEnum({ios: 'VRBottomSheetDetentKind', android: 'io.valdiroutes.app_ui.BottomSheetDetentKind'})
 */
export enum BottomSheetDetentKind {
  Points = 'points',
  Percentage = 'percentage',
  Content = 'content',
}

/**
 * Corner curve style passed to native BottomSheet views.
 * @ExportEnum({ios: 'VRBottomSheetCornerCurve', android: 'io.valdiroutes.app_ui.BottomSheetCornerCurve'})
 */
export enum BottomSheetCornerCurve {
  Circular = 'circular',
  Continuous = 'continuous',
}

/**
 * Normalized detent entry passed to native BottomSheet views.
 * @ExportModel({ios: 'VRBottomSheetDetent', android: 'io.valdiroutes.app_ui.BottomSheetDetent'})
 */
export interface BottomSheetDetent {
  value: number;
  kind: BottomSheetDetentKind;
  programmatic: boolean;
  usesStatusBarTopInset: boolean;
  insetTop: number;
  insetLeft: number;
  insetRight: number;
  insetBottom: number;
  widestCard: boolean;
  maxWidth: number;
  placementBias: number;
  scrimOpacity: number;
}

/**
 * Normalized outset card shadow passed to native BottomSheet views.
 * @ExportModel({ios: 'VRBottomSheetCardShadow', android: 'io.valdiroutes.app_ui.BottomSheetCardShadow'})
 */
export interface BottomSheetCardShadow {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  colorArgb: number;
  opacity: number;
  excludesInterior: boolean;
}

/**
 * Atomic native configuration for `<custom-view>` BottomSheetView / VRBottomSheetView.
 * @ExportModel({ios: 'VRBottomSheetConfig', android: 'io.valdiroutes.app_ui.BottomSheetConfig'})
 */
export interface BottomSheetConfig {
  detents: BottomSheetDetent[];
  detentIndex: number;
  animateIn: boolean;
  animateContentHeight: boolean;
  modal: boolean;
  windowOverlay: boolean;
  openOrder: number;
  scrollExpandCoordination: number;
  scrollCollapseCoordination: number;
  settleDuration: number;
  hasCloseRequestHandler: boolean;
  scrimColorArgb: number;
  scrimAccessibilityLabel: string;
  surfaceCornerRadii: number[];
  surfaceCornerCurve: BottomSheetCornerCurve;
  surfaceShadows: BottomSheetCardShadow[];
  surfaceElevation: number;
  surfaceShadowColorArgb: number;
  committedContentRegionInset?: number;
}
