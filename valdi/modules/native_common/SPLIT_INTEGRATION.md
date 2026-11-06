# Local service module split — parent integration handoff

All six modules are local under `valdi/modules/`. MMKV, permissions, Wi-Fi, NFC and AppUI use `nativeBuild: "host"`, `iosLanguage: "objc"`. `native_common` is pure TS, with no native build/factory. Node compiles TS/assets and generated Kotlin/Objective-C; Gradle/Xcode compile selected module `android/` and `ios/` sources. The standalone native targets created by `node_valdi_module` are unused. No third-party ABI or second Valdi runtime is introduced.

## Selection and TS contracts

Enable each module explicitly in `package.json` when its imports remain in the app. No service enables another service implicitly. The BUILD dependencies are:

- `mmkv`, `permissions`, `app_ui` -> `native_common`.
- `wifi`, `nfc` -> `native_common`, `permissions`.
- `bluetooth` -> `native_common`, `permissions`.
- `native_common` has no local-module dependency.

The app API remains a composition in `app_pages/src/api.ts`; it supplies its existing `ApiError` constructor to `appUIApi` and `storageApi`, preserving public error identity. Bluetooth is still composed from its existing independent module. The original app storage, permission, Wi-Fi, NFC, AppUIHost, nativeCall and structuredData forwarding paths have been deleted. Business and test consumers import the owning modules directly. Services use factory-backed `getHost()` and permissions' `getAndroidSdk()` directly, with no manual TS installation overrides. Wi-Fi, NFC and Bluetooth cache their native proxies and bind events under `withGlobalNativeRefs`.

`native_common/src/pickerSchemas.ts` contains pure validation shared by AppUI and inline wheel schemas. `app_pages/src/schemas.ts` keeps only the app-owned wheel schema logic; consumers import common request schemas directly. AppUI also imports the common schema module directly. Inline wheel schema imports do not import a native service. `native_common` owns the shared `bindMethods` and `nativeCall` helpers, including Bluetooth's imports; the unused app `bindMethods` and duplicate Bluetooth helpers are removed.

The `Permissions.d.ts` type import is deliberately after the module declarations. The symbol dumper uses the first root node's `@ExportModule` annotation to include every exported function. This is necessary to export both `getHost` and `getAndroidSdk`.

## Exact native source relocations

Android:

- `io/valdiroutes/app/Storage{HostImpl,Codec}.kt` -> `mmkv/android/`, package `io.valdiroutes.mmkv`.
- `io/valdiroutes/app/PermissionHostImpl.kt` -> `permissions/android/`, package `io.valdiroutes.permissions`.
- `io/valdiroutes/app/WifiHostImpl.kt` and `io/nativeroutes/wifi/*.kt` -> `wifi/android/` and `wifi/android/core/`, packages `io.valdiroutes.wifi` and `io.valdiroutes.wifi.core`.
- `io/valdiroutes/app/NfcHostImpl.kt` and `io/nativeroutes/nfc/*.kt` -> `nfc/android/` and `nfc/android/core/`, packages `io.valdiroutes.nfc` and `io.valdiroutes.nfc.core`.
- `io/valdiroutes/app/AppUIHostImpl.kt`, `io/valdiroutes/app/appui/*.kt`, and `io/nativeroutes/ui/*.kt` -> `app_ui/android/`, `app_ui/android/appui/`, `app_ui/android/ui/`, packages `io.valdiroutes.app_ui`, `io.valdiroutes.app_ui.appui`, `io.valdiroutes.app_ui.ui`.
- AppUI owns `NativeWheelBody`, `NativeWheelColumn`, `NativeWheelLogic`, and `SheetHostView`. The app's `WheelViews.kt` imports the shared wheel implementation and supplies only Valdi model conversion, input forwarding, recycling, and callbacks. The duplicate app wheel implementations and obsolete app `SheetHostView.kt` have been removed.
- `android/app/src/main/res/xml/ui_attachment_paths.xml` -> `app_ui/android/res/xml/ui_attachment_paths.xml`.
- The provider fragment is `app_ui/android/AndroidManifest.xml`, class `io.valdiroutes.app_ui.ui.AttachmentFileProvider`, authority `${applicationId}.ui.attachments`, unchanged cache directory.
- `ic_refresh.xml` lives in `app_ui/android/res/drawable`; the duplicate app copy is removed. Image preview resolves the host resource by name/package rather than importing app-owned `R`.

All source paths above are relative to `android/app/src/main/java` or the named new local module.

iOS:

- `ios/ValdiRoutes/Storage{HostImpl,Codec}.swift` -> `mmkv/ios/`.
- `ios/ValdiRoutes/PermissionHostImpl.swift` -> `permissions/ios/`.
- `ios/ValdiRoutes/Wifi/**` -> `wifi/ios/`.
- `ios/ValdiRoutes/AppUIHostImpl.swift`, `AppUIPromise.swift`, and `AppUI/{AppUI,AppPresenters,AppDialogView}.swift` -> `app_ui/ios/`.
- `ios/ValdiRoutes/NativeRoutesUI/**` -> `app_ui/ios/ui/` under the extended scope approved by the parent. App inline wheels consume those selected native controls.
- The app retains `KeyboardObserver.swift` for page insets; the obsolete app `SheetHostView.swift` has been removed. AppUI owns `AppUIKeyboardObserver` and `AppUISheetHostView` to avoid app-class dependencies. Factory registration prepares the module keyboard observer before text input; the module implementations preserve the existing keyboard/sheet algorithms.
- `ios/ValdiRoutes/Images/AppImages.swift` remains app-owned, supporting the shared image cache and Valdi image loader. It calls exported `SCValdiImage` directly; the old app image/void-promise bridge is removed.
- Each independent module that needs Promise<void> has a tiny unique helper: `permissions/ios/VRPermissionsVoidPromise.{h,m}`, `wifi/ios/VRWifiVoidPromise.{h,m}`, `app_ui/ios/VRAppUIVoidPromise.{h,m}`. Their implementations preserve the existing void promise bridge behavior.
- NFC gets a small iOS rejecting host. Public NFC remains Android-only and rejects before loading it, as before; direct typed host users get NOT_SUPPORTED.

Existing iOS `VR…` transport names are retained. New module protocol/factory names are unique. MMKV uses generated module name `MMKVStorage` to avoid collision with the SwiftPM `MMKV` module.

## Parent host wiring

Android factory class names:

- `io.valdiroutes.mmkv.MMKVModuleFactoryImpl`
- `io.valdiroutes.permissions.PermissionModuleFactoryImpl`
- `io.valdiroutes.wifi.WifiModuleFactoryImpl`
- `io.valdiroutes.nfc.NfcModuleFactoryImpl`
- `io.valdiroutes.app_ui.AppUIModuleFactoryImpl`

All take `Context`. Retain and construct eagerly on main at factory registration. Wi-Fi and NFC install their activity-observing native cores in these constructors, independent of JS laziness.

Permissions Activity access is exactly:

```kotlin
import io.valdiroutes.permissions.PermissionModuleFactoryImpl

// After registerFactories(applicationContext), before the Activity resumes:
PermissionModuleFactoryImpl.requireHost().attach(this, permissionsLauncher)
// In the RequestMultiplePermissions launcher callback:
PermissionModuleFactoryImpl.requireHost().onResult(grants)
// In Activity teardown:
PermissionModuleFactoryImpl.requireHost().detach(this)
```

The companion holds one application-scoped permission queue. The JS module returns that same instance. The Activity must not create another `PermissionHostImpl`.

AppUI app-level Android imports should point at `io.valdiroutes.app_ui.appui.*` and `io.valdiroutes.app_ui.ui.*`; `AppUIHostImpl`/`AppUIPromise` are in `io.valdiroutes.app_ui`. Keep existing `AppUI.attach`, `detach`, `topPageChanged`, `AppModalHost`, `AppPresentationHost` calls and the explicit `NativeImages.install(AppImages.createLoader(...))` image-loader port with the new import path. No app-level usages were changed by this sub-agent.

iOS factory runtime class names are `VRMMKVModuleFactory`, `VRPermissionsModuleFactory`, `VRWifiModuleFactory`, `VRNfcModuleFactory`, `VRAppUIModuleFactory`. Construct on main, retain in registration. Retained implementations replace the old ValdiHost-owned capability objects and generated `VRInstall…` calls. Keep navigation reporting `AppUI.shared.topPageChanged(...)`.

Configure the image transport before runtime registration, on main:

```swift
AppUI.imageLoader = AppImages.load
```

The port's type is `NativeImageLoading.Loader?`. `AppPresenters` passes the supplied loader directly to `ImagePreview`; success/failure completion and cancellation closures are unchanged. An unset loader rejects preview immediately with `E_NO_IMAGE_LOADER` before entering the page queue. Clearing the loader while a request waits also rejects at presentation time and advances the queue.

Generated protocols/factory headers belong in the parent's `ValdiModuleImports.h`. Include the three module-owned void promise helper headers as well, so Swift sees their interfaces. The app image loader imports `SCValdiImage` through ValdiRuntime; no app image-bridge header remains.

## Platform contributions

Metadata includes:

- MMKV Android `2.4.3` and SwiftPM revision `007a393cd5e255e9aa68d6648f7179159bdf0f9d`, unchanged persistent `app-structured` store ID/directories/codec.
- AppUI Compose BOM `androidx.compose:compose-bom:2026.09.00` through `androidPlatforms`, versionless Compose UI/foundation/material3 dependencies, CameraX/MLKit/ViewPager2/Coil/native-control dependencies, provider fragment/resources, CAMERA/INTERNET and camera feature, camera/photo usage descriptions.
- Wi-Fi permissions/features, `removeMaxSdkVersion: true` on FINE/COARSE to preserve merge policy, matching shared location description, CoreLocation/Network/NetworkExtension/UIKit frameworks, HotspotConfiguration and wifi-info entitlements.
- NFC Android permission/feature; iOS does not request CoreNFC capabilities because its API remains unsupported.
- Permissions Activity/core dependencies and UIKit framework; requested feature permissions are contributed by their owning feature modules.

The parent owns selection, shared build/tool changes, Gradle/Xcode source roots, generated binding/import files, app imports/lifecycle usage changes, metadata aggregation, base manifest cleanup and existing regression fixture/test paths. No native compilation, build/device action, commit/push, fork/Harmony edit, or review child was performed here.

## Focused validation

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test valdi/modules/native_common/tests/module-split.test.mts
```

This compiles all six modules with the real Node compiler/code generator into temporary directories (no checked-in generated app writes), checks Kotlin/Objective-C SDK export and independent dependency failures, and executes the real TS facades for structured storage/error identity, permission serialization, Wi-Fi event hookup, iOS NFC rejection, and UI validation/cancellation/error identity. The eight test cases include Wi-Fi factory-proxy caching and absence of manual installation overrides. This command requires a separate parent validation run after cleanup; source/JS/binding-generation checks do not establish native host behavior. Host integration validation is recorded separately in `docs/service-modules.md`.
