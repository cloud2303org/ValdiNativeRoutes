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
  paramsJson: string;
  /** 'push', 'sheet' or 'compactSheet'. */
  presentation: string;
  /**
   * Areas the page must keep its content out of. The host already subtracts whatever it handles itself:
   * a sheet gets no top inset, and the bottom inset drops to 0 while the keyboard covers the navigation bar.
   */
  insets: PageInsets;
}

/**
 * @Context
 * @ExportModel({ios: 'VRPageContext', android: 'io.valdiroutes.pages.PageContext'})
 */
export interface PageContext {
  push: (route: string, paramsJson: string, presentation: string) => void;
  pushForResult: (
    route: string,
    paramsJson: string,
    presentation: string,
    onResult: (resultJson: string, canceled: boolean) => void,
  ) => void;
  /** Closes this page and delivers the result to whoever opened it with pushForResult. */
  finish: (resultJson: string) => void;
  back: () => void;
}
