# Native module access

Business code accesses native services through generated Valdi modules. It does
not call an installer or pass native implementations into `startApp`.

For example, `app_pages/src/vision/Vision.d.ts` declares:

```ts
import type { VisionHost } from './VisionHost';

/** @ExportModule({ios: 'VRVisionNativeModule', android: 'io.valdiroutes.pages.VisionNativeModule'}) */
export declare function getHost(): VisionHost;
```

The module annotation must attach to the first exported symbol in the file.
`AppContext.d.ts` therefore declares its module function before the exported
`AppContextHost` proxy interface.

The Node compiler generates the native module protocol, factory and proxy
descriptors. Android and iOS register factory implementations with Valdi before
the corresponding JS module is used. Factory registration remains native host
setup; it does not require JS to call an installation function.

## App capabilities

`AppNativeModules.kt` and `AppNativeModules.swift` register the two shared app entries:

- `app_pages/src/AppContext` exposes navigation and token storage. Factories
  retain the owners behind these capabilities; token storage is created lazily.
- `app_pages/src/vision/Vision` exposes the existing Vision implementation.
  The host is created on first access. The Android JNI implementation and its
  shared OpenCV/ncnn dependencies remain unchanged; iOS retains static vendors.

Android additionally registers `app_pages/src/splash/SplashScreenNative` for
the synchronous startup splash policy. iOS does not implement this entry.

`startApp(debug)` still installs the error handler and theme observer, initializes
the app database, retains the service facades, and selects the authenticated
initial route. Database migration and application initialization are separate
from native module installation. Route declarations remain TypeScript.

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

Auth and navigation likewise obtain their cached native capabilities in a
global-reference scope. Vision registers its one-shot worker callback in that
scope so leaving its demo page does not dispose a still-pending native callback.
The page ignores results after destruction.

Video retains its per-player object and subscription lifetime. It is not made
an application-wide singleton by this change.

## Verification

The module-access, routing, service and Bluetooth tests execute production TS
sources with native entries supplied at the runtime boundary. Codegen tests
check the real generated factories and the startup signature accepting only `debug`.
These checks do not replace Android/iOS compilation or device tests.

Changes to the generated C++ descriptors also require a runtime rebuild and an
updated runtime export receipt. A JS-only bundle update is insufficient for
this migration. No startup speedup follows solely from these source changes;
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
