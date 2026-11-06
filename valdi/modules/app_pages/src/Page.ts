/**
 * The contract between every Valdi page and the native navigation host.
 * The host creates one PageViewModel/PageContext per page and owns the page's lifetime.
 */

/**
 * @ExportModel({ios: 'VRPageInsets', android: 'io.valdiroutes.pages.PageInsets'})
 */
export interface PageInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * @ViewModel
 * @ExportModel({ios: 'VRPageViewModel', android: 'io.valdiroutes.pages.PageViewModel'})
 */
export interface PageViewModel {
  pageId: string;
  route: string;
  params: any;
  /** 'push'; 'tab' for a page shown in the tab shell (routes.tabs), which has nothing to close. */
  presentation: string;
  /**
   * Areas the page must keep its content out of. The host already subtracts whatever it handles itself:
   * the bottom inset drops to 0 while the keyboard covers the navigation bar.
   * Default tabs retain the official platform container's insets. A custom tab root absolutely overlays pages:
   * only system safe area goes to pages; the host never measures or adds the custom bar's height.
   * Business code shares its chosen bar height and content padding.
   */
  insets: PageInsets;
  /**
   * Whether the page is on screen: on top of its stack (or of the full-screen cover), the selected page of the tab
   * shell on top; and the app in the foreground. A page that leaves the stack
   * isn't hidden first, it is destroyed. PageComponent turns changes into onShow/onHide.
   */
  visible: boolean;
  /**
   * Why `visible` last changed. Shown: 'navigation' (opened, or uncovered), 'tab' (its tab selected), 'foreground'.
   * Hidden: 'covered', 'tab' (another tab selected), 'background'. '' before the first change.
   */
  visibilityReason: string;
}

/**
 * What only this page can do; navigation itself goes through the global `router` (NavigationHost).
 *
 * @Context
 * @ExportModel({ios: 'VRPageContext', android: 'io.valdiroutes.pages.PageContext'})
 */
export interface PageContext {
  /** Closes this page and delivers the result to whoever opened it with pushForResult. */
  finish: (result: any) => void;
  /** Closes this page without a result. */
  back: () => void;
}
