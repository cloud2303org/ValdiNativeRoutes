import type { ResolvedNavigation, RouteDeclaration, StackPage } from './navigation/models';

/**
 * The host's Navigator as `router` (routes.ts) drives it. The host owns the one stack of Valdi and native pages; calls
 * arrive on the JS thread and are applied on the main thread, in order. Params, results and options are structured data,
 * checked and resolved in TS.
 *
 * @ExportModel({ios: 'VRNavigationHost', android: 'io.valdiroutes.pages.NavigationHost'})
 */
export interface NavigationHost {
  /** presentation is 'push', 'sheet' or 'compactSheet'; navigation contains resolved transition options. */
  push: (route: string, params: any, presentation: string, navigation: ResolvedNavigation) => void;
  /** onResult is called once, when the page leaves the stack; canceled unless it finished with a result. */
  pushForResult: (
    route: string,
    params: any,
    presentation: string,
    navigation: ResolvedNavigation,
    onResult: (result: any, canceled: boolean) => void,
  ) => void;
  replace: (route: string, params: any, navigation: ResolvedNavigation) => void;
  back: (delta: number) => void;
  popToRoot: () => void;
  reset: (route: string, params: any) => void;
  switchTab: (tab: string) => void;
  /** The app's status bar: 'auto', 'light' or 'dark' (StatusBarStyle in PageComponent.ts). */
  setStatusBarStyle: (style: string) => void;
  /** Typed stack entries, root first. */
  currentPages: (done: (pages: StackPage[]) => void) => void;
  /** Replaces the declaration after a development reload; never changes the installed native implementations. */
  updateRoutes: (declaration: RouteDeclaration) => void;
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

export function publishRoutes(declaration: RouteDeclaration): void {
  const state = globalThis as any;
  const host = state[HOST_KEY] as NavigationHost | undefined;
  if (host) host.updateRoutes(declaration);
  state.__valdiRoutesDeclaration = declaration;
}
