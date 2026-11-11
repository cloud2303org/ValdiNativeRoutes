import type { PageContext, PageViewModel } from '../page/Page';
import type { PageDefinition, Pages, TabItem } from './config';
import { TAB_SHELL } from './config';
import { snapshotRouteData } from './data';
import type { StackPage as HostStackPage, ResolvedNavigation } from './models';
import { navigationHost } from './NavigationHost';
import { type NavigationOptions, resolveNavigation } from './options';

export type { NavigationOptions } from './options';

/** The route metadata a router needs; concrete pages and application policy stay with the caller. */
export interface RouterConfig {
  readonly pages: Pages;
  readonly navigation?: NavigationOptions;
  readonly tabs?: { readonly items: readonly TabItem[] };
  assertRoute(name: string): PageDefinition<any, any>;
  assertTab(name: string): void;
}

export type RouteName<C extends RouterConfig> = Extract<keyof C['pages'], string>;
export type TabName<C extends RouterConfig> = NonNullable<C['tabs']>['items'][number]['route'];
export type RouteParams<C extends RouterConfig> = {
  [N in RouteName<C>]: NonNullable<C['pages'][N]['_params']>;
};
export type RouteResults<C extends RouterConfig> = {
  [N in RouteName<C>]: NonNullable<C['pages'][N]['_result']>;
};
/** A page's TS view of the shared native model; no runtime conversion or validation. */
export type RouteViewModel<C extends RouterConfig, R extends RouteName<C>> =
  Omit<PageViewModel, 'route' | 'params'> & {
    route: R;
    params: RouteParams<C>[R];
  };
export type NavigateArgs<C extends RouterConfig, R extends RouteName<C>> = {} extends RouteParams<C>[R]
  ? [params?: RouteParams<C>[R], options?: NavigationOptions]
  : [params: RouteParams<C>[R], options?: NavigationOptions];

export interface StackPage<C extends RouterConfig> extends HostStackPage {
  route: RouteName<C> | typeof TAB_SHELL;
  params: {};
}

/**
 * Bind reusable navigation operations to an application's route declaration. Construction does not
 * resolve the native host or publish routes. Every instance retains its own route names and types.
 */
export function createRouter<C extends RouterConfig>(routes: C) {
  function navigationOptions(route: RouteName<C>, options?: NavigationOptions): ResolvedNavigation {
    return resolveNavigation(routes.navigation, routes.assertRoute(route).options, options);
  }

  const router = {
    /** Validate data/options before sending an operation to the host's one native page stack. */
    push<R extends RouteName<C>>(route: R, ...args: NavigateArgs<C, R>) {
      const [params = {}, options] = args;
      navigationHost().push(route, snapshotRouteData(params), navigationOptions(route, options));
    },

    /** Closing a page without a result resolves undefined, including removal by another stack operation. */
    pushForResult<R extends RouteName<C>>(route: R, ...args: NavigateArgs<C, R>): Promise<RouteResults<C>[R] | undefined> {
      const [params = {}, options] = args;
      const payload = snapshotRouteData(params);
      const navigation = navigationOptions(route, options);
      return new Promise(resolve => {
        navigationHost().pushForResult(route, payload, navigation, (result, canceled) => {
          resolve(canceled ? undefined : result as RouteResults<C>[R]);
        });
      });
    },

    replace<R extends RouteName<C>>(route: R, params: RouteParams<C>[R], options?: NavigationOptions) {
      navigationHost().replace(route, snapshotRouteData(params), navigationOptions(route, options));
    },

    /** Close the top delta pages, including full-screen covers; never remove the root. */
    back(delta = 1) {
      navigationHost().back(delta);
    },

    popToRoot() {
      navigationHost().popToRoot();
    },

    reset<R extends RouteName<C>>(route: R, params: RouteParams<C>[R]) {
      routes.assertRoute(route);
      navigationHost().reset(route, snapshotRouteData(params));
    },

    resetToTabs(tab?: TabName<C>) {
      if (!routes.tabs) throw new Error('No tabs declared');
      if (tab) routes.assertTab(tab);
      navigationHost().reset(TAB_SHELL, tab ? { tab } : {});
    },

    switchTab(tab: TabName<C>) {
      routes.assertTab(tab);
      navigationHost().switchTab(tab);
    },

    /** Stack entries from root to top. Individual tab pages are not stack entries. */
    getCurrentPages(): Promise<StackPage<C>[]> {
      return new Promise(resolve => navigationHost().currentPages(pages => resolve(pages as StackPage<C>[])));
    },

    async canGoBack(): Promise<boolean> {
      return (await router.getCurrentPages()).length > 1;
    },
  };
  return router;
}

export type TypedRouter<C extends RouterConfig> = ReturnType<typeof createRouter<C>>;

/** Bind an application's typed router to one page's finish/back capabilities. */
export class Router<C extends RouterConfig> {
  constructor(private readonly context: PageContext, private readonly router: TypedRouter<C>) {}

  push<R extends RouteName<C>>(route: R, ...args: NavigateArgs<C, R>) {
    this.router.push(route, ...args);
  }

  pushForResult<R extends RouteName<C>>(route: R, ...args: NavigateArgs<C, R>): Promise<RouteResults<C>[R] | undefined> {
    return this.router.pushForResult(route, ...args);
  }

  finish<R extends RouteName<C>>(result: RouteResults<C>[R]): void {
    this.context.finish(snapshotRouteData(result));
  }

  back(): void {
    this.context.back();
  }
}
