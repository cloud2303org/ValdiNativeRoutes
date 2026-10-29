/**
 * The host's Navigator as `router` (routes.ts) drives it. The host owns the one stack of Valdi and native pages; calls
 * arrive on the JS thread and are applied on the main thread, in order. Params, results and options are JSON, already
 * checked and resolved in TS.
 *
 * @ExportModel({ios: 'VRNavigationHost', android: 'io.valdiroutes.pages.NavigationHost'})
 */
export interface NavigationHost {
  /** presentation is 'push', 'sheet' or 'compactSheet'; navigationJson the resolved `{animation, durationMs, presentation}`. */
  push: (route: string, paramsJson: string, presentation: string, navigationJson: string) => void;
  /** onResult is called once, when the page leaves the stack; canceled unless it finished with a result. */
  pushForResult: (
    route: string,
    paramsJson: string,
    presentation: string,
    navigationJson: string,
    onResult: (resultJson: string, canceled: boolean) => void,
  ) => void;
  replace: (route: string, paramsJson: string, navigationJson: string) => void;
  back: (delta: number) => void;
  popToRoot: () => void;
  reset: (route: string, paramsJson: string) => void;
  switchTab: (tab: string) => void;
  /** The app's status bar: 'auto', 'light' or 'dark' (StatusBarStyle in PageComponent.ts). */
  setStatusBarStyle: (style: string) => void;
  /** A JSON array of `{pageId, route, params}`, root first. */
  currentPages: (done: (pagesJson: string) => void) => void;
}

// On globalThis rather than in this module, as AppUIHost: a module Valdi unloads and reloads would lose it.
const HOST_KEY = '__valdiRoutesNavigationHost';

export function installNavigation(host: NavigationHost): void {
  (globalThis as any)[HOST_KEY] = host;
}

export function navigationHost(): NavigationHost {
  const host: NavigationHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) {
    throw new Error('native navigation is not installed');
  }
  return host;
}
