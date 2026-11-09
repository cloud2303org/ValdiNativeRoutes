# Vision build and packaging

The selected architecture uses `app_vision/module.json` with `nativeBuild: "cpp"`.
The existing Polyglot compiler generates strongly typed C++ bindings; the
handwritten C++ adapter, VisionCore, OpenCV and ncnn are statically linked into
the same ValdiRuntime. Enabled modules come from `package.json` → `valdi.modules`.
This document describes that integration contract. Static runtime exports,
final App packaging and device execution have not yet been validated.

## Typed calls and runtime services

`app_vision/src/Vision` exposes the generated native entry, and
`app_vision/src/VisionHost.ts` provides the Promise facade for the typed callback.
Calls pass through generated C++ bindings to the module's handwritten adapter
and then to `vision/cpp`'s VisionCore. There is no per-method Kotlin/Swift
implementation or JNI/Objective-C++ Vision bridge.

The adapter uses the runtime worker queue for image processing and inference,
and the runtime disk cache for the returned PNG files. It preserves the typed
result/error callback and native-reference lifetime through completion.
Pages can ignore results after destruction while the pending callback remains
retained. This uses runtime services rather than separate platform worker/cache
implementations.

## Preparing dependencies and exporting the runtime

Install dependencies, then explicitly export the target runtime:

```sh
pnpm install
scripts/export-android.sh debug
# On macOS, for iOS:
scripts/export-ios.sh debug
# Then build the corresponding App:
pnpm build:android
# or pnpm build:ios
```

Windows uses `scripts/windows/export-android.ps1 -Config debug`.
Use the corresponding `release` export before building a Release App.

For enabled `nativeBuild: "cpp"` modules, `nativeDependencies` runs only during
these explicit manual runtime exports. The generic dependency runner invokes
the module's script with `check <platform>`; a valid cache skips preparation.
Otherwise it invokes `prepare <platform>` and checks again. Preparation or
post-check failure stops the export. Disabled modules' hooks do not run.

`vision/` owns VisionCore, `vendor-lock.json`, patches and ignored vendor caches.
Preparation verifies the pinned downloads and static-library/toolchain receipts.
Android requires arm64 archives built with runtime-compatible NDK r28 settings;
the old r27 shared libraries and receipts do not satisfy that contract.
iOS requires separate arm64 device and arm64 simulator static caches; one cannot
stand in for the other. Vendor preparation alone does not update an already
exported runtime.

Normal App builds (`pnpm android`, `pnpm ios`, `pnpm build:android` and
`pnpm build:ios`) consume the exported runtime. They do not run cpp-mode
dependency hooks or automatically export a runtime. Host-mode dependency hooks
remain part of normal Gradle/Xcode builds, along with host module compilation.
There is no public prebuild step or source-fingerprint mechanism that refreshes
the runtime automatically.

## Static code inside the dynamic runtime

The module-owned C++ build rules supply generated bindings, the handwritten
adapter, VisionCore and static vendor archives to the runtime link.
Android packages the resulting `libvaldi_runtime.so` in `valdi_runtime.aar`;
iOS packages the dynamic ValdiRuntime framework in `ValdiRuntime.xcframework`.
Static business/vendor code inside those runtime binaries is distinct from
shipping a standalone Vision DSO. The selected design does not package the old
`libvaldi_routes_vision.so` plus OpenCV/ncnn shared-library closure or compile a
Vision Objective-C++ wrapper into the iOS App target.

OTA remains the existing host Kotlin/Swift client plus host C codec linkage.
It is not migrated into ValdiRuntime, and disabling Vision must leave OTA's
native codec linkage available.

TS page changes use the normal hot-reload workflow. Changes to linked C++,
generated native contracts, vendor code/settings or the enabled cpp-module
selection require a manual runtime export followed by an App rebuild.
OTA cannot install the changed native code.

## Disabling or removing Vision

Remove Vision's demo page, route and any other TS consumers first, then remove
`app_vision` from `valdi.modules`. Manually re-export each target runtime and
rebuild the App. An enabled module importing a disabled module is rejected
rather than implicitly enabling it.

The new export omits Vision's dependency hook, C++ implementation, binding
closure and vendors unless another enabled module needs them. An old runtime
still contains its previously linked code; changing the list alone cannot
remove it. Cached vendor files may remain on disk. Delete `app_vision` and the
`vision/` dependency package only if no remaining consumer needs them. When deleting
the dependency package itself, also remove its `bazel_dep` and `local_path_override`
from `valdi/MODULE.bazel`; disabling the module alone can keep that declaration
and its cache in place.

The earlier shared-library experiment and its dated evidence remain in
[Android Vision shared vendors — historical comparison](vision-android-shared.md).
Those results do not validate this static runtime integration.

## Validation on 2026-11-09

The static integration passed Android and iOS Debug runtime exports, the Android
Debug APK build and the arm64 iOS simulator App build. The project test command
passed 450 tests and the codegen goldens. The Vision vendor checks and NDK lookup
suite passed 15 tests separately.

On the Windows `valdi_test` Android emulator, the installed Debug APK ran the
actual Vision computation twice: OpenCV 4.13.0, ncnn 1.0.20260526, 256 x 192 output,
64 x 64 inference input and 1052 edge pixels. Both PNGs rendered; the second run
replaced the first run's two files in the scoped native cache. Argent's app-launch
wait timed out before the login page appeared; this functional check starts from
an already loaded app and does not establish startup performance. No iOS device
execution, Release build, or Windows PowerShell workflow execution is claimed.
