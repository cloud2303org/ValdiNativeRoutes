import res from 'app_pages/res';
import { Device } from 'valdi_core/src/Device';
import * as v from 'valibot';
import { navigationHost } from './NavigationHost';
import { PageContext, PageViewModel } from './Page';

/** 'sheet' has a fixed height and shrinks its page for the keyboard; 'compactSheet' rides up with it. */
export type Presentation = 'push' | 'sheet' | 'compactSheet';
export type FormLayout = 'scroll' | 'plain';

/** Params and results of every route; the host only sees them as JSON. */
export interface RouteParams {
  login: Record<string, never>;
  main: { tab?: TabName };
  home: Record<string, never>;
  detail: { id: number; from: string };
  form: { layout: FormLayout };
  picker: { selected?: string };
  ble: Record<string, never>;
  presentation: Record<string, never>;
  vision: Record<string, never>;
  animation: { animation: string };
  device: Record<string, never>;
  wheels: Record<string, never>;
}

export interface RouteResults {
  login: never;
  main: never;
  home: never;
  detail: { visited: number };
  form: { summary: string };
  picker: { value: string };
  ble: never;
  presentation: never;
  vision: never;
  animation: never;
  device: never;
  wheels: never;
}

export type RouteName = keyof RouteParams;

/**
 * Params and results cross the host as JSON (JSON.stringify / readParams): a Date arrives as a string, undefined and
 * functions vanish, Map and class instances become {}. They are not checked at run time; instead every route's params
 * and result must be plain JSON at compile time, and RoutesAreJson fails to compile if one is not.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };
type IsJson<T> = { [K in keyof T]: T[K] extends { [key: string]: JsonValue | undefined } ? true : false }[keyof T];
type Check<T extends true> = T;
export type RoutesAreJson = Check<IsJson<RouteParams> | IsJson<RouteResults>>;

interface RouteDefinition {
  /** 'tabs' is the tab shell (TAB_BAR); 'native' pages are registered by each host (NativeScreens). */
  kind: 'valdi' | 'native' | 'tabs';
  title: string;
  /** Valdi component path, `ComponentName@module/path`. */
  component?: string;
  options?: NavigationOptions;
}

/** Android presets, as ExpoNativeRoutes' NativeRouteAnimations; iOS has only the system push and none. */
export const ANDROID_ANIMATIONS = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'] as const;
export const IOS_ANIMATIONS = ['default', 'none'] as const;
export type AndroidAnimation = (typeof ANDROID_ANIMATIONS)[number];
export type IosAnimation = (typeof IOS_ANIMATIONS)[number];

interface AnimationSettings<A extends string> {
  animation?: A;
  /** Integer 0–2000, default 300; 0 is the same as 'none'. */
  durationMs?: number;
}

/**
 * Same shape as ExpoNativeRoutes' navigation options: the global NAVIGATION, then the route's options, then the
 * call's, each with optional per-platform branches; later layers win, and a platform branch beats the shared keys
 * of its own layer. 'fullScreen' covers the stack on iOS, as a modal; Android has no such presentation.
 */
export interface NavigationOptions extends AnimationSettings<IosAnimation> {
  android?: AnimationSettings<AndroidAnimation>;
  ios?: AnimationSettings<IosAnimation> & { presentation?: 'push' | 'fullScreen' };
}

export const NAVIGATION: NavigationOptions = {
  animation: 'default',
  android: { animation: 'slideRight', durationMs: 300 },
};

export interface ResolvedNavigation {
  animation: string;
  durationMs: number;
  presentation: 'push' | 'fullScreen';
}

const unknownOption = 'Unknown navigation option';
const durationMessage = 'durationMs must be an integer from 0 to 2000';
const durationMs = v.optional(
  v.pipe(
    v.number(durationMessage),
    v.integer(durationMessage),
    v.minValue(0, durationMessage),
    v.maxValue(2000, durationMessage),
  ),
);
/** One layer of NavigationOptions. Both platform branches are checked, so a typo fails on both. */
const navigationLayer = v.strictObject(
  {
    animation: v.optional(v.picklist(IOS_ANIMATIONS, 'Unknown animation')),
    durationMs,
    android: v.optional(
      v.strictObject(
        { animation: v.optional(v.picklist(ANDROID_ANIMATIONS, 'Unknown animation')), durationMs },
        unknownOption,
      ),
    ),
    ios: v.optional(
      v.strictObject(
        {
          animation: v.optional(v.picklist(IOS_ANIMATIONS, 'Unknown animation')),
          durationMs,
          presentation: v.optional(v.picklist(['push', 'fullScreen'], 'Invalid iOS presentation')),
        },
        unknownOption,
      ),
    ),
  },
  unknownOption,
);

export function resolveNavigation(...layers: (NavigationOptions | undefined)[]): ResolvedNavigation {
  const platform = Device.isAndroid() ? 'android' : 'ios';
  const result: ResolvedNavigation = { animation: 'default', durationMs: 300, presentation: 'push' };
  layers.forEach(layer => {
    if (!layer) return;
    const { android, ios, ...shared } = v.parse(navigationLayer, layer);
    // A platform branch beats the shared keys of its own layer; a key left undefined keeps the layer below.
    for (const settings of [shared, platform === 'android' ? android : ios]) {
      Object.entries(settings ?? {}).forEach(([key, value]) => {
        if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
      });
    }
  });
  return result;
}

export const ROUTES: Record<RouteName, RouteDefinition> = {
  login: { kind: 'valdi', title: '登录', component: 'LoginPage@app_pages/src/LoginPage' },
  main: { kind: 'tabs', title: '首页' },
  home: { kind: 'valdi', title: '首页', component: 'HomePage@app_pages/src/HomePage' },
  detail: { kind: 'valdi', title: '详情', component: 'DetailPage@app_pages/src/DetailPage' },
  form: { kind: 'valdi', title: '表单', component: 'FormPage@app_pages/src/FormPage' },
  picker: { kind: 'native', title: '原生选择页' },
  ble: { kind: 'valdi', title: '蓝牙', component: 'BlePage@app_pages/src/BlePage' },
  presentation: { kind: 'valdi', title: '选择与展示', component: 'PresentationPage@app_pages/src/PresentationPage' },
  vision: { kind: 'valdi', title: 'OpenCV 与 ncnn', component: 'VisionPage@app_pages/src/VisionPage' },
  animation: { kind: 'valdi', title: '路由动画', component: 'RouteAnimationPage@app_pages/src/RouteAnimationPage' },
  device: { kind: 'valdi', title: 'Wi-Fi 与 NFC', component: 'DevicePage@app_pages/src/DevicePage' },
  wheels: { kind: 'valdi', title: '页面内滚轮', component: 'WheelPage@app_pages/src/WheelPage' },
};

export type TabName = (typeof TAB_BAR.tabs)[number]['tab'];

/**
 * The one tab shell, drawn by each host over its pages: the system tab bar on iOS (Liquid Glass from iOS 26, the
 * classic blur before), a blurred bar of evenly spread items on Android. Each tab shows a route of its own, a Valdi or a
 * native page, created when first selected and kept after. A tab page is not on the stack: a page pushed from it covers
 * the whole shell, bar included. Icons are res/ images, the selected one optional.
 */
export const TAB_BAR = {
  route: 'main',
  tabs: [
    { tab: 'home', route: 'home', text: '首页', icon: 'tabHome', selectedIcon: 'tabHomeOn' },
    { tab: 'wheels', route: 'wheels', text: '组件', icon: 'tabComponents', selectedIcon: 'tabComponentsOn' },
    { tab: 'device', route: 'device', text: '设备', icon: 'tabDevice', selectedIcon: 'tabDeviceOn' },
  ],
} as const satisfies {
  route: RouteName;
  tabs: readonly { tab: string; route: RouteName; text: string; icon: keyof typeof res; selectedIcon?: keyof typeof res }[];
};

/** A res/ key as exported: tabHomeOn is app_pages_tab_home_on on Android, tab_home_on in app_pages.bundle on iOS. */
function resourceName(key: string): string {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/** The route table and tab bar as the hosts read them (app.ts hands them over at startup). */
export function hostRoutes(): object {
  const tabBar = {
    ...TAB_BAR,
    tabs: TAB_BAR.tabs.map(({ icon, selectedIcon, ...tab }) => ({
      ...tab,
      icon: resourceName(icon),
      selectedIcon: resourceName(selectedIcon),
    })),
  };
  return { routes: ROUTES, tabBar };
}

export function readParams<R extends RouteName>(viewModel: PageViewModel): RouteParams[R] {
  return JSON.parse(viewModel.paramsJson || '{}') as RouteParams[R];
}

export interface StackPage {
  pageId: string;
  route: RouteName;
  params: JsonValue;
}

/**
 * Navigation from anywhere (a page, a request layer, app.ts), on the one stack the host owns; native pages call the
 * same operations on their host's Navigator. Valdi and native pages push each other and return results either way.
 * Every page a call removes is cancelled: its pushForResult caller gets undefined.
 */
export const router = {
  /** Throws on invalid options, before anything is pushed. */
  push<R extends RouteName>(route: R, params: RouteParams[R], presentation: Presentation = 'push', options?: NavigationOptions) {
    navigationHost().push(route, JSON.stringify(params), presentation, navigationJson(route, options));
  },

  /** Resolves with the page's result, or undefined when it closes without one. */
  pushForResult<R extends RouteName>(
    route: R,
    params: RouteParams[R],
    presentation: Presentation = 'push',
    options?: NavigationOptions,
  ): Promise<RouteResults[R] | undefined> {
    const navigation = navigationJson(route, options);
    return new Promise(resolve => {
      navigationHost().pushForResult(route, JSON.stringify(params), presentation, navigation, (resultJson, canceled) => {
        resolve(canceled ? undefined : (JSON.parse(resultJson) as RouteResults[R]));
      });
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
    navigationHost().reset(route, JSON.stringify(params));
  },

  /** Back to the tab shell (opening it as the root if the stack has none) with `tab` selected. */
  switchTab(tab: TabName) {
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

  push<R extends RouteName>(route: R, params: RouteParams[R], presentation: Presentation = 'push', options?: NavigationOptions) {
    router.push(route, params, presentation, options);
  }

  pushForResult<R extends RouteName>(
    route: R,
    params: RouteParams[R],
    presentation: Presentation = 'push',
    options?: NavigationOptions,
  ): Promise<RouteResults[R] | undefined> {
    return router.pushForResult(route, params, presentation, options);
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
  return JSON.stringify(resolveNavigation(NAVIGATION, ROUTES[route].options, options));
}
