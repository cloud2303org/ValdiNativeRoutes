import { navigationHost } from '../NavigationHost';
import type { PageContext, PageViewModel } from '../Page';
import { routes } from '../routes';
import { type JsonValue, TAB_SHELL } from './config';
import { type NavigationOptions, resolveNavigation } from './options';

export type { NavigationOptions } from './options';

export type Presentation = 'push' | 'sheet' | 'compactSheet';
export type FormLayout = 'scroll' | 'plain';
export type RouteName = keyof typeof routes.pages;
export type TabName = NonNullable<typeof routes.tabs>['items'][number]['route'];
export type RouteParams = { [N in RouteName]: NonNullable<(typeof routes.pages)[N]['_params']> };
export type RouteResults = { [N in RouteName]: NonNullable<(typeof routes.pages)[N]['_result']> };
type NavigateArgs<R extends RouteName> = {} extends RouteParams[R]
  ? [params?: RouteParams[R], presentation?: Presentation, options?: NavigationOptions]
  : [params: RouteParams[R], presentation?: Presentation, options?: NavigationOptions];

export function readParams<R extends RouteName>(viewModel: PageViewModel): RouteParams[R] {
  return JSON.parse(viewModel.paramsJson || '{}') as RouteParams[R];
}

export interface StackPage {
  pageId: string;
  route: RouteName | typeof TAB_SHELL;
  params: JsonValue;
}

/**
 * Navigation from anywhere (a page, a request layer, app.ts), on the one stack the host owns; native pages call the
 * same operations on their host's Navigator. Valdi and native pages push each other and return results either way.
 * Every page a call removes is cancelled: its pushForResult caller gets undefined.
 */
export const router = {
  /** Throws on invalid options, before anything is pushed. */
  push<R extends RouteName>(route: R, ...args: NavigateArgs<R>) {
    const [params = {}, presentation = 'push', options] = args;
    navigationHost().push(route, JSON.stringify(params), presentation, navigationJson(route, options));
  },

  /** Resolves with the page's result, or undefined when it closes without one. */
  pushForResult<R extends RouteName>(route: R, ...args: NavigateArgs<R>): Promise<RouteResults[R] | undefined> {
    const [params = {}, presentation = 'push', options] = args;
    const navigation = navigationJson(route, options);
    return new Promise(resolve => {
      navigationHost().pushForResult(
        route,
        JSON.stringify(params),
        presentation,
        navigation,
        (resultJson, canceled) => {
          resolve(canceled ? undefined : (JSON.parse(resultJson) as RouteResults[R]));
        },
      );
    });
  },

  /** Replaces the top page (closing a sheet over it first). */
  replace<R extends RouteName>(route: R, params: RouteParams[R], options?: NavigationOptions) {
    navigationHost().replace(route, JSON.stringify(params), navigationJson(route, options));
  },

  /** Closes the top `delta` pages, sheets and full-screen pages included; never the root. */
  back(delta = 1) {
    navigationHost().back(delta);
  },

  popToRoot() {
    navigationHost().popToRoot();
  },

  /** Clears the whole stack, root included, and opens `route` as the new root: after login or logout, for example. */
  reset<R extends RouteName>(route: R, params: RouteParams[R]) {
    routes.assertRoute(route);
    navigationHost().reset(route, JSON.stringify(params));
  },

  resetToTabs(tab?: TabName) {
    if (!routes.tabs) throw new Error('No tabs declared');
    if (tab) routes.assertTab(tab);
    navigationHost().reset(TAB_SHELL, JSON.stringify(tab ? { tab } : {}));
  },

  /** Back to the tab shell (opening it as the root if the stack has none) with `tab` selected. */
  switchTab(tab: TabName) {
    routes.assertTab(tab);
    navigationHost().switchTab(tab);
  },

  /** The stack from its root to the top page, sheet last; tab pages are not on it. */
  getCurrentPages(): Promise<StackPage[]> {
    return new Promise(resolve => navigationHost().currentPages(json => resolve(JSON.parse(json) as StackPage[])));
  },

  async canGoBack(): Promise<boolean> {
    return (await this.getCurrentPages()).length > 1;
  },
};

/** A page's own handle: router's operations, plus closing this very page. */
export class Router {
  constructor(private readonly context: PageContext) {}

  push<R extends RouteName>(route: R, ...args: NavigateArgs<R>) {
    router.push(route, ...args);
  }

  pushForResult<R extends RouteName>(route: R, ...args: NavigateArgs<R>): Promise<RouteResults[R] | undefined> {
    return router.pushForResult(route, ...args);
  }

  /** Closes this page and delivers the result to whoever opened it with pushForResult. */
  finish<R extends RouteName>(result: RouteResults[R]): void {
    this.context.finish(JSON.stringify(result));
  }

  /** Closes this page without a result; a tab page has nothing to close. */
  back(): void {
    this.context.back();
  }
}

function navigationJson(route: RouteName, options?: NavigationOptions): string {
  return JSON.stringify(resolveNavigation(routes.navigation, routes.assertRoute(route).options, options));
}
