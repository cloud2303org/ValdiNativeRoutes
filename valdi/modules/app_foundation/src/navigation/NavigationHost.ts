import type { ResolvedNavigation, RouteDeclaration, StackPage } from './models';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';
import { getHost } from '../host/AppContext';

/**
 * The host's Navigator as `router` (routes.ts) drives it. The host owns the one stack of Valdi and native pages; calls
 * arrive on the JS thread and are applied on the main thread, in order. Params, results and options are structured data,
 * checked and resolved in TS.
 *
 * @ExportModel({ios: 'VRNavigationHost', android: 'io.valdiroutes.pages.NavigationHost'})
 */
export interface NavigationHost {
  /** Opens a page using resolved platform transition options. */
  push: (route: string, params: any, navigation: ResolvedNavigation) => void;
  /** onResult is called once, when the page leaves the stack; canceled unless it finished with a result. */
  pushForResult: (
    route: string,
    params: any,
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

let host: NavigationHost | undefined;

export function navigationHost(): NavigationHost {
  return host ??= withGlobalNativeRefs('app-navigation', () => getHost().getNavigationHost());
}

export function publishRoutes(declaration: RouteDeclaration): void {
  const state = globalThis as any;
  navigationHost().updateRoutes(declaration);
  state.__valdiRoutesDeclaration = declaration;
}
