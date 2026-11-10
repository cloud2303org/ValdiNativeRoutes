# Native module access

Business code accesses native services through generated Valdi modules. It does
not call an installer or pass native implementations into `startApp`.

For example, `app_vision/src/Vision.d.ts` declares:

```ts
import type { VisionHost } from './VisionHost';

/** @ExportModule({ios: 'VRVisionNativeModule', android: 'io.valdiroutes.pages.VisionNativeModule'}) */
export declare function getHost(): VisionHost;
```

The module annotation must attach to the first exported symbol in the file.
`AppContext.d.ts` therefore declares its module function before the exported
`AppContextHost` proxy interface.

The Node compiler generates strongly typed native bindings, including C++ module,
model and proxy descriptors. Host-backed modules register their Android/iOS
factory implementations with Valdi before the corresponding JS module is used.
For `nativeBuild: "cpp"`, the generated bindings and handwritten C++ factory
implementation are linked into the runtime. Neither path requires a JS
installation function.

## App capabilities

Host registration and runtime-linked C++ factories expose these native entries:

- `app_foundation/src/host/AppContext` exposes only the minimal navigation host. The application factory
  retains its owner. Authentication and Zustand state belong to the app.
- `app_vision/src/Vision` exposes Vision through the existing strongly typed
  Polyglot C++ bindings and handwritten C++ adapter. `nativeBuild: "cpp"` selects
  the implementation; VisionCore and static OpenCV/ncnn libraries link into the
  same ValdiRuntime. The adapter uses the runtime worker queue and disk cache.
  Calls do not need per-method Kotlin/Swift or JNI/Objective-C++ bridges.
- `app_ota/src/Ota` exposes the existing native OTA client through `OtaHost`.
  Its Promise methods read native version state or check/download an update.
  The `app_ota/src` facade retains the proxy in a global-reference scope.
  OTA remains the host Kotlin/Swift client with host C codec linkage and is not
  migrated into ValdiRuntime.
  See [OTA access](ota.md#javascript-and-native-access).

Both hosts additionally register `app_foundation/src/splash/SplashScreenNative`
for the synchronous startup splash policy. See [SplashScreen](splash-screen.md).

`startApp(debug)` still installs the error handler and theme observer, initializes
the app database, retains the service facades, and selects the authenticated
initial route. Database migration and application initialization are separate
from native module installation. Route declarations remain TypeScript.

## Native consumers and application composition

ThemeBridge and AppUI are enabled by default as the template's foundation
components. AppUI is one complete selection, including scanner and attachment
dependencies. Their source ownership stays inside their modules; application
startup and presentation wiring stay in the host.

Native code can consume module implementations directly:

- **ThemeBridge:** AppUI's Kotlin/Swift `UiDesign` reads `ThemeTokensStore`.
  This is a declared `app_ui -> theme_bridge` native dependency. Both native UI
  and the generated JS accessor read the native token tree. Valdi and native
  pages own their backgrounds; the Android/iOS route containers do not paint a
  shared page color. Android's normal window has no background drawable.
  The light/night `page_background` resources provide the system splash and
  startup error background only. Android Force Dark is disabled because the
  application selects its own palettes. Transparent route containers do not
  synchronize navigation transitions with asynchronous content rendering.
- **AppUI:** native pages call Android `NativeApp.ui` or iOS `app.ui`.
  Activity attachment, foreground-page notifications and application image-loader
  injection provide presentation context. Wheel adapters and their tests are
  module-owned; the Android host explicitly registers their binders.
- **Permissions:** Android's Activity borrows the retained permission host's
  launcher, forwards result maps, and detaches at teardown. The JS permission
  service adds its shared scheduling and state policy on top.
- **Video:** native runtime setup shares one service between the generated
  module factory and the official video loader. Android additionally forwards
  Activity/fullscreen/PiP lifecycle calls. Per-player objects remain native.
- **OTA:** native startup selects the module provider before runtime creation,
  then the host starts a background check and supplies native tab-image lookup.
- **Foundation:** the application implements its NavigationHost/AppContext and
  synchronous Splash contracts. These depend on the application's actual
  navigator and startup policy, so their assembly remains host-owned.

See [AppUI integration/removal](../valdi/modules/app_ui/README.md),
[native theme access](../valdi/modules/theme_bridge/README.md),
[video integration](video-demo.md), and [OTA integration](../valdi/modules/app_ota/README.md).
Changing an installation application ID does not rename these native APIs,
generated Objective-C identities or Kotlin packages.

## Service access and lifetime

MMKV, permissions, Wi-Fi, NFC, AppUI, Bluetooth and Video use their generated
native entries. Manual `install*Host`, auth/navigation/Vision installers, and
`initializeBluetooth` / permission-provider configuration are removed.
Tests supply native implementations at their module-loading boundary.

Bluetooth imports the shared permissions service directly. Its permission
requests use the same queue as Wi-Fi and NFC. Constructing the Bluetooth facade
does not initialize the native host; its first operation obtains and caches the
host and installs one native event sink.

Bluetooth, Wi-Fi and NFC register persistent event sinks inside the official
`withGlobalNativeRefs` scope. The scope is established synchronously around
native marshaling. Pages own independently removable JS listeners, while the
native event sink belongs to the application.

Navigation obtains its cached native capability in a global-reference scope.
Application state is ordinary JS and needs no native reference scope.
Vision registers its one-shot worker callback in that
scope so leaving its demo page does not dispose a still-pending native callback.
The page ignores results after destruction.

Video retains its per-player object and subscription lifetime. It is not made
an application-wide singleton by this change.

## Verification

The module-access, routing, service and Bluetooth tests execute production TS
sources with native entries supplied at the runtime boundary. Codegen tests
check the real generated factories and the startup signature accepting only `debug`.
These checks do not replace Android/iOS compilation or device tests.

Linked C++, runtime-linked native contracts, vendor settings and enabled cpp-module
selection changes require an explicit manual runtime export and an App rebuild.
CPP-mode `nativeDependencies` hooks run only in those exports; host-mode hooks
remain in normal App builds. Normal builds do not compute source fingerprints
or automatically export a runtime. TS page edits continue to use normal hot reload.

Static Vision code resides inside the dynamic runtime binary, rather than a
standalone Vision/vendor DSO. Android requires runtime-compatible NDK r28 arm64
static caches; iOS requires arm64 device and simulator static caches.
See [Vision build and packaging](vision-build.md). No static Vision export,
App build or device result is established by this documentation change.
A JS-only bundle update is insufficient for native changes.
No startup speedup follows solely from these source changes;
that requires a new measurement using the same endpoint and build conditions.

## Editor and package boundaries

`module-build/modules` is a link to `valdi/modules`. An editor can open a TSX
file through either path. Configurations whose SDK/type paths are relative to
only one of those parents can lose the Valdi base config and JSX declarations
when opened through the other path. This is a configuration-resolution issue,
not a requirement to replace typed JSX with an unrestricted tag dictionary.

Generated, ignored editor configs now use canonical absolute SDK, module,
generated-resource and npm paths. They are local to the current checkout;
regenerate with `pnpm tsconfig` after moving it. Before SDK preparation, the
tracked `valdi/tsconfig.editor-base.json` supplies scalar compiler options.
The command explicitly reports that full Valdi types still need
`node scripts/prepare-valdi.mjs`. Native compilation retains that prerequisite.

Cross-module source imports use Valdi IDs such as `app_ui/src/api`. The
filesystem targets in TypeScript `paths` are editor/compiler mappings; they
are not a package distribution contract.

Ordinary npm dependencies use the Node package resolver and are bundled by the
existing pipeline. The current app shares `valdi/package.json` for npm
dependencies. Each enabled Valdi module is built separately into its own
`.valdimodule`; a dependency imported by several modules can be bundled into
several archives. This is not an independently versioned npm package per module.

Installing a complete native Valdi module through npm is a
different operation: current module discovery still expects enabled local
`valdi/modules/<id>` directories. Package discovery, native sources, resources,
generated bindings and factory registration must all be connected before that
can be advertised as an npm-native-module installation workflow.

The iOS app still owns its navigation containers and shared image-cache policy.
The image pipeline is in `ios/ValdiRoutes/Images/AppImages.swift`, using
`SCValdiImage` directly. The old app `ValdiImageBridge` / `ValdiVoidPromise`
wrappers are removed; AppUI keeps its own module-owned Promise helpers.

Application-owned Host type extensions are described in [Extending app hosts](extending-app-host.md).
