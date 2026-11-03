# Typed routing ABI

The shared TypeScript contract is in `app_pages/src/navigation/models.ts`.
All listed interfaces are pure data `@ExportModel`s. Android names use
`io.valdiroutes.pages.<Name>`; Objective-C names use `VR<Name>`; C++ names
use `snap::valdi_modules::app_pages::<Name>`.

```ts
interface ResolvedNavigation {
  animation: string;
  durationMs: number;
  presentation: string; // push | fullScreen
}
interface RouteEntry {
  route: string;
  kind: string; // valdi | native | tabs
  title: string;
  component?: string;
  nativeName?: string;
}
interface RouteTab {
  route: string;
  text: string;
  icon: string;
  selectedIcon: string;
  iconData?: string;
  selectedIconData?: string;
}
interface RouteTabBar {
  route: string; // $tabs
  initial: string;
  tabs: RouteTab[];
  mode?: string; // default | custom; omitted normalizes to default
  component?: string; // required only for custom: AppTabBar@app_pages/src/AppTabBar
}
interface RouteDeclaration {
  routes: RouteEntry[];
  tabBar?: RouteTabBar;
  root: string;
}
interface StackPage {
  pageId: string;
  route: string;
  params: any; // compiler spelling for a nonnullable dictionary
}
```

Business code chooses the tab container in `defineRoutes`:

```ts
import { AppTabBar } from './AppTabBar';

defineRoutes({
  pages: { /* valdiPage(...) and nativePage(...) declarations */ },
  tabs: {
    initial: 'home', // optional; defaults to the first item
    items: [/* existing route/text/icon/selectedIcon items */],
    bar: { type: 'custom', component: AppTabBar },
  },
});
```

Omitting `bar`, or specifying `{ type: 'default' }`, selects the official
platform tab component and retains its container-managed insets.
`{ type: 'custom', component: AppTabBar }` selects a business-authored Valdi
component. It does not select a preset native bar. The real route transformer
resolves the exported `@Component` class to its canonical module class path,
including named/default exports, and removes imports consumed only as metadata,
exactly as for `valdiPage.component`. Evaluating routes never eagerly loads the
custom component. Arbitrary UI callbacks and raw class-path strings are rejected
in business declarations.

`toHost()` always emits `mode: 'default'` or `mode: 'custom'`; a custom declaration
also emits the compiled `component`. Both the transformer and runtime helper
reject invalid modes, a component on a default bar, and a missing/invalid custom
component. For host input, missing `mode` normalizes to `default` for older
declarations; unknown modes and mismatched component/mode combinations must be
rejected before constructing the tab shell.

The custom root **absolutely overlays pages**. The host **does not measure its
intrinsic height** and **does not add its bar height to page insets**. Only system
safe area goes to pages. Business code shares its chosen bar height and padding
between its custom component and page layouts. There is no host height callback,
automatic custom-bar content avoidance, or JSON ABI.

Business code must keep the full-viewport custom root and layout ancestors
free of gesture handlers and full-viewport touch targets. Only the visible bar's
children own gestures. A business-authored bounded `hitTest` on the root is
allowed: the approved smoke component uses its own `onLayout` viewport height
and accepts only `y >= viewportHeight - barHeight - safeAreaBottom` once laid
out, rejecting the empty page area above the bar. This predicate filters hit
testing; it does not attach a full-root `onTap` or claim the empty area as a
gesture target. The layout measurement stays in business code; the host still
does not measure bar height or add it to page insets.

`app_pages/src/TabBar.ts` defines the generated component contract:

```ts
/** @ViewModel; exported as VRTabBarViewModel / io.valdiroutes.pages.TabBarViewModel */
interface TabBarViewModel {
  items: RouteTab[];
  selectedRoute: string;
  safeAreaBottom: number;
}
/** @Context; exported as VRTabBarContext / io.valdiroutes.pages.TabBarContext */
interface TabBarContext {
  selectTab: (route: string) => void;
}
```

The host supplies current items, selection, and system bottom safe area to the
custom component and updates its view model when these change. `selectTab` uses
the host's existing tab-switch path, including its route validation.

`startApp(debug, navigation, tokens): RouteDeclaration` remains synchronous.
It installs the error handler first, initializes services before opening any
page, and chooses the authenticated root after installing the token store.
There is no additional startup wrapper.

`NavigationHost` retains its exported native names. Its changed methods are:

```ts
push(route: string, params: any,
     presentation: string, navigation: ResolvedNavigation): void;
pushForResult(route: string, params: any,
     presentation: string, navigation: ResolvedNavigation,
     onResult: (result: any, canceled: boolean) => void): void;
replace(route: string, params: any,
        navigation: ResolvedNavigation): void;
reset(route: string, params: any): void;
currentPages(done: (pages: StackPage[]) => void): void;
updateRoutes(declaration: RouteDeclaration): void;
```

`back`, `popToRoot`, `switchTab`, and `setStatusBarStyle` keep their signatures.
`PageViewModel.params` replaces `paramsJson` with `any`;
`PageContext.finish(result: any)` replaces `resultJson`.
Canceled result callbacks carry `{}` and `true`; successful empty objects
carry `{}` and `false`.

The real companion/exporter rejects `Record<string, unknown>` with
`Unrecognized type '__type'. Only annotated types can be exported.` Its supported
`any` spelling resolves to `UNTYPED_MAP`, schema `m<s,u>`, rather than an arbitrary
native reference. This spelling is limited to the exported ABI. Nested structured
values use Valdi's dictionary/any marshaller. No route
transport calls `JSON.stringify` or `JSON.parse`. The public application API
retains its route-specific parameter/result generics and JSON-compatible data
constraints. The router snapshots dictionaries recursively, rejects functions,
accessors, nonplain instances, cyclic values, symbol keys and nonfinite numbers,
and omits optional object fields whose value is undefined. Arrays retain order,
null, booleans, finite numbers and Unicode strings. The native ABI uses plain
strings for discriminants.

`defineRoutes` validates and returns a declaration builder without publishing
to native. `routes.toHost(root?)` builds the typed declaration.
`routes.publish(root?)` explicitly publishes a replacement declaration after
reload/update; native rebuilds the root, removes covered pages and preserves a
still-valid root route and selected tab. Startup
returns its declaration directly and does not call `updateRoutes`.

The debug App bootstrap registers the official
`getModuleLoader().onHotReload(module, 'app_pages/src/routes', callback)` once.
It loads routes/auth through the loader rather than holding a static dependency
that would unload the observer with routes. The callback runs after unload,
reads current module exports and explicitly publishes the auth-selected root.
The observing module's official disposable removes the listener at app-module
unload. A normal unload and initial startup do not publish.

## Generated ABI evidence

The real Node `tools/valdi-rolldown/codegen.ts app_pages` pipeline generated:

- `android/app/generated/valdi/app_pages.kt`
- `ios/Generated/valdi/app_pagesTypes/app_pagesTypes.h` and `.m`
- `ios/Generated/valdi/app_pages/app_pages.h` and `.m`
- `valdi/native/generated/valdi_modules/app_pages/app_pages.hpp` and `.cpp`

Kotlin full constructors (optional fields also have generated overloads):

```kt
ResolvedNavigation(animation: String, durationMs: Double, presentation: String)
RouteEntry(route: String, kind: String, title: String,
           component: String? = null, nativeName: String? = null)
RouteTab(route: String, text: String, icon: String, selectedIcon: String,
         iconData: String? = null, selectedIconData: String? = null)
RouteTabBar(route: String, initial: String, tabs: List<RouteTab>,
            mode: String? = null, component: String? = null)
RouteDeclaration(routes: List<RouteEntry>, tabBar: RouteTabBar? = null, root: String)
StackPage(pageId: String, route: String, params: Map<String, Any?>)
TabBarViewModel(items: List<RouteTab>, selectedRoute: String, safeAreaBottom: Double)
TabBarContext(selectTab: (route: String) -> Unit)
```

Parameters/results use a **nonnull outer** `Map<String, Any?>`; nested values
may be null. `onResult` is `(Map<String, Any?>, Boolean) -> Unit`.
Use `emptyMap()` for cancellation. TypeScript numbers map to Kotlin `Double`,
including the integer-validated duration. The declaration route array becomes
`List<RouteEntry>`, not a dictionary keyed by name.

Objective-C constructors contain required properties; optional properties are
assigned after construction:

```objc
[[VRResolvedNavigation alloc] initWithAnimation:animation
                                   durationMs:durationMs
                                 presentation:presentation];
[[VRRouteEntry alloc] initWithRoute:route kind:kind title:title];
[[VRRouteTab alloc] initWithRoute:route text:text icon:icon selectedIcon:selectedIcon];
[[VRRouteTabBar alloc] initWithRoute:route initial:initial tabs:tabs];
[[VRRouteDeclaration alloc] initWithRoutes:routes root:root];
[[VRStackPage alloc] initWithPageId:pageId route:route params:params];
[[VRTabBarViewModel alloc] initWithItems:items selectedRoute:selectedRoute safeAreaBottom:safeAreaBottom];
[[VRTabBarContext alloc] initWithSelectTab:selectTab];
```

Objective-C maps are nonnull `NSDictionary<NSString *, id> *`, arrays are
`NSArray<VRRouteEntry *> *`, duration is `double`, and `tabBar`, `component`,
`nativeName`, `iconData`, `selectedIconData` and `mode` are nullable. Set
`VRRouteTabBar.mode` and `.component` after its required-field constructor.
`VRTabBarViewModel.items` is `NSArray<VRRouteTab *> *`, `selectedRoute` is a nonnull
string, and `safeAreaBottom` is `double`. `VRTabBarContext.selectTab` is a nonnull
`void (^)(NSString * _Nonnull)` block. Null dictionary
values use Foundation's `NSNull`. Cancel with `@{}` and `YES`.

C++ uses `std::vector<RouteEntry>`, nullable `Valdi::Ref<RouteTabBar>`,
`Valdi::Ref<Valdi::ValueMap>`, `Valdi::StringBox` and `double`. Full constructors
preserve the interface field order, including optional fields:

```cpp
RouteDeclaration(const std::vector<RouteEntry>& routes,
                 const Valdi::Ref<RouteTabBar>& tabBar,
                 const Valdi::StringBox& root);
StackPage(const Valdi::StringBox& pageId, const Valdi::StringBox& route,
          const Valdi::Ref<Valdi::ValueMap>& params);
RouteTabBar(const Valdi::StringBox& route, const Valdi::StringBox& initial,
            const std::vector<RouteTab>& tabs,
            const std::optional<Valdi::StringBox>& mode,
            const std::optional<Valdi::StringBox>& component);
TabBarViewModel(const std::vector<RouteTab>& items,
                const Valdi::StringBox& selectedRoute, double safeAreaBottom);
TabBarContext(const SelectTabFn& selectTab);
```

The real generated host schema contains:

```text
'push':f(s, m<s,u>, s, r:'[0]')
'pushForResult':f(s, m<s,u>, s, r:'[0]', f(m<s,u>, b@))
'currentPages':f(f(a<r:'[1]'>))
'updateRoutes':f(r:'[2]')
```

Here `[0]` resolves to `ResolvedNavigation`, `[1]` to `StackPage`, and `[2]`
to `RouteDeclaration`. `RouteDeclaration` itself has
`'routes':a<r:'[0]'>,'tabBar':r?:'[1]','root':s`, referencing `RouteEntry`
and `RouteTabBar`.

The appended tab-bar fields and separate component models have schemas:

```text
RouteTabBar: 'route':s,'initial':s,'tabs':a<r:'[0]'>,'mode':s?,'component':s?
TabBarViewModel: 'items':a<r:'[0]'>,'selectedRoute':s,'safeAreaBottom':d
TabBarContext: 'selectTab':f(s)
```

Both `[0]` references above resolve to `RouteTab`. The real generator emits
Android's `TabBarContextFactory` and iOS dependency metadata for `VRTabBarContext`
from the `@Context` annotation; the `@ViewModel` annotation marks `TabBarViewModel`
for component view-model use.

`tools/valdi-rolldown/typed-routing.test.ts` executes the real routing sources,
the pinned lazy `ModuleLoader` unload/replacement/disposal path, and the real
companion dump/annotation/native-generation pipeline. It also records the
unsupported `Record` diagnostic and generated signatures on all three native
targets. These shared tests establish JavaScript behavior and generated ABI;
native build/runtime validation is reported separately by each host.
