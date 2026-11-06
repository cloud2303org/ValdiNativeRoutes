import type { Asset } from 'valdi_core/src/Asset';
import type { RouteDeclaration } from './models';
import { publishRoutes } from './NavigationHost';
import type { NavigationOptions } from './options';

export type EmptyParams = Record<string, never>;
export type PageComponent = abstract new (...args: any[]) => { onRender(): void };

export interface PageDefinition<P extends {} = EmptyParams, R extends {} = never> {
  readonly kind: 'valdi' | 'native';
  readonly title: string;
  readonly component?: string;
  readonly nativeName?: string;
  readonly options?: NavigationOptions;
  /** Type-only contracts; never serialized to the native host. */
  readonly _params?: P;
  readonly _result?: R;
}

/** The compiler replaces the component reference with its canonical Valdi path, without loading the page. */
export function valdiPage<P extends {} = EmptyParams, R extends {} = never>(config: {
  component: PageComponent;
  title: string;
  options?: NavigationOptions;
}): PageDefinition<P, R> {
  if (typeof config.component !== 'string') {
    throw new Error('valdiPage.component must be compiled by the Node Valdi route transformer');
  }
  return { kind: 'valdi', title: config.title, component: config.component, options: config.options };
}

export function nativePage<P extends {} = EmptyParams, R extends {} = never>(config: {
  name: string;
  title: string;
  options?: NavigationOptions;
}): PageDefinition<P, R> {
  if (!config.name.trim()) throw new Error('nativePage.name must not be empty');
  return { kind: 'native', title: config.title, nativeName: config.name, options: config.options };
}

export interface TabItem<N extends string = string> {
  readonly route: N;
  readonly text: string;
  readonly icon: Asset;
  readonly selectedIcon?: Asset;
}

/** Custom components are compiled to canonical class paths, just like valdiPage.component. */
export type TabBarDefinition =
  | { readonly type: 'default' }
  | { readonly type: 'custom'; readonly component: PageComponent };

type NoInfer<T> = [T][T extends any ? 0 : never];

export type Pages = Record<string, PageDefinition<any, any>>;
export type PageName<P extends Pages> = Extract<keyof P, string>;
/** The shell is internal; applications use router.resetToTabs(), not a manually declared shell route. */
export const TAB_SHELL = '$tabs';

interface ImageReference {
  name: string;
  /** Only dev builds inline these small icons, so the native tab bar can refresh without rebuilding the app. */
  data?: string;
}

function imageReference(asset: Asset): ImageReference {
  const ref = asset as unknown as ImageReference;
  if (!ref || typeof ref.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(ref.name)) {
    throw new Error('Tab icons must directly reference the declaring module resources');
  }
  return ref;
}

function tabBarReference(bar: TabBarDefinition | undefined): { mode: string; component?: string } {
  if (bar === undefined) return { mode: 'default' };
  if (!bar || (bar.type !== 'default' && bar.type !== 'custom')) {
    throw new Error('tabs.bar.type must be default or custom');
  }
  if (bar.type === 'default') {
    if ('component' in bar) throw new Error('tabs.bar.component is only allowed for custom bars');
    return { mode: 'default' };
  }
  // The transformer consumes the class reference; no component implementation is loaded here.
  const component = bar.component as unknown;
  if (typeof component !== 'string' || !/^[^@\s]+@[^/\s]+\/src\/[^\s]+$/.test(component)) {
    throw new Error(
      'tabs.bar.component must be compiled to an exported @Component class path by the Node Valdi route transformer',
    );
  }
  return { mode: 'custom', component };
}

export function defineRoutes<
  const P extends Pages,
  const T extends readonly TabItem<NoInfer<PageName<P>>>[] = readonly [],
>(config: {
  pages: P;
  navigation?: NavigationOptions;
  initial?: NoInfer<PageName<P>>;
  tabs?: { initial?: NoInfer<T[number]['route']>; items: T; bar?: TabBarDefinition };
}) {
  const names = Object.keys(config.pages);
  if (!names.length) throw new Error('pages must contain at least one page');
  if (names.includes(TAB_SHELL)) throw new Error(`${TAB_SHELL} is reserved`);
  const has = (name: string) => names.includes(name);
  const items = config.tabs?.items ?? [];
  if (config.tabs && !items.length) throw new Error('tabs.items must not be empty');
  if (config.tabs) tabBarReference(config.tabs.bar);
  const seen = new Set<string>();
  for (const item of items) {
    if (!has(item.route)) throw new Error(`Unknown route in tabs: "${item.route}"`);
    if (seen.has(item.route)) throw new Error(`Duplicate tab: "${item.route}"`);
    seen.add(item.route);
    imageReference(item.icon);
    if (item.selectedIcon) imageReference(item.selectedIcon);
  }
  if (config.tabs?.initial && !seen.has(config.tabs.initial)) {
    throw new Error(`tabs.initial "${config.tabs.initial}" is not in tabs.items`);
  }
  if (config.initial && !has(config.initial)) throw new Error(`Unknown initial route: "${config.initial}"`);
  const home = config.tabs ? TAB_SHELL : (config.initial ?? names[0]);
  const result = {
    pages: config.pages,
    navigation: config.navigation,
    tabs: config.tabs,
    home,
    assertRoute(name: string): PageDefinition<any, any> {
      if (!has(name)) throw new Error(`Unknown route: "${name}"`);
      return config.pages[name];
    },
    assertTab(name: string): void {
      if (!seen.has(name)) throw new Error(`Unknown tab: "${name}"`);
    },
    toHost(root = home): RouteDeclaration {
      if (root !== TAB_SHELL || !config.tabs) result.assertRoute(root);
      return {
        routes: [
          ...names.map(route => {
            const page = config.pages[route];
            return {
              route,
              kind: page.kind,
              title: page.title,
              component: page.component,
              nativeName: page.nativeName,
            };
          }),
          ...(config.tabs ? [{ route: TAB_SHELL, kind: 'tabs', title: items[0].text }] : []),
        ],
        tabBar: config.tabs
          ? {
              route: TAB_SHELL,
              initial: config.tabs.initial ?? items[0].route,
              ...tabBarReference(config.tabs.bar),
              tabs: items.map(item => {
                const icon = imageReference(item.icon);
                const selected = item.selectedIcon ? imageReference(item.selectedIcon) : icon;
                return {
                  route: item.route,
                  text: item.text,
                  icon: icon.name,
                  selectedIcon: selected.name,
                  iconData: icon.data,
                  selectedIconData: selected.data,
                };
              }),
            }
          : undefined,
        root,
      };
    },
    /** Explicit development reload/config update; defining routes never calls native. */
    publish(root = home): void {
      publishRoutes(result.toHost(root));
    },
  };
  return result;
}
