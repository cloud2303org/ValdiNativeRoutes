# Harmony Valdi runtime host

This directory contains the C++20 host and `valdi_harmony` NAPI module. The parent
CMake target globs its `.cpp` files and links the actual Valdi runtime and
`backend/ArkUIViewManager.cpp`. It requires `ace_ndk.z`, `ace_napi.z`,
`hilog_ndk.z`, `rawfile.z`, `uv`, and **`native_drawing`** (the backend's real
text measurement implementation).

## ArkTS contract

- `mount(content, resourceManager, width, height, scale, uiContext): number`
- `resize(handle, width, height): void`
- `setActive(handle, active): void`
- `destroy(handle): Promise<void>`
- `watchNavigation(handle, callback): void` (UI-thread JSON snapshots)
- `back(handle): boolean` (whether system Back was consumed)
- `switchTab(handle, route): void`

Dimensions are Valdi points / ArkUI vp. Scale is physical pixels per point,
normally `UIContext.vp2px(1)`. The initial host keeps scale fixed; remount after a
density change. Zero dimensions are accepted. Width and height must be finite,
nonnegative, and at most 1,000,000; scale must be finite and in `(0, 64]`.
Handles are positive safe integers, belong to their NAPI environment, and are
invalidated as soon as destruction is queued. Repeated destruction reports an
unknown/destroyed handle. There are at most 16 mounted or destroying hosts per
environment. NodeContent cannot be reused until its destroy promise resolves.

`resourceManager` must be the real Ability ResourceManager and expose the SDK
`getConfigurationSync()` method. Configuration locale and resolved color mode
are sampled at mount, resize, and setActive. Content and ResourceManager are
strongly retained until native teardown finishes. Pass the actual page
`getUIContext()` as the final mount argument. Its native context is used by
ArkUI animations and its ArkTS object is retained until backend teardown;
opaque per-node context handles are not compared by pointer identity.

Bootstrap installs the actual `NavigationHost` global and invokes
`harmony_smoke/src/app.start()`. The scoped `app_pages` module contains the
shared routing code and validation pages. The loader
opens the full filename requested by ResourceManager (normally
`rawfile/modules/<module>.valdimodule`) with NativeResourceManager and
copies the complete archive into an owned Valdi Bytes allocation. Module archive
reads are serialized, reject path traversal, and have a 256 MiB per-archive
limit. `valdi_core`, `app_pages`, and `harmony_smoke` are checked before runtime creation.
Runtime requests load the other compiler-produced dependency archives normally.
Packaged image/font asset URLs have no implementation in this initial host:
resolution logs an explicit unsupported error and returns an empty URL.

## Runtime and backend lifecycle

Each mount owns a RuntimeManager, Runtime, ViewManagerContext, navigator,
resource loader, and actual `Valdi::Harmony::ArkUIViewManager`. All routed pages
within that host share its runtime and own separate contexts/trees. Distinct
mounted hosts have distinct runtimes. RuntimeManager uses the real JavaScript
bridge, Harmony platform, Hilog logger, no disk cache, and no keychain.
PersistentStore is consequently unavailable; no persistent keys are generated.
Debugger/hot reload are disabled and `isStandalone` is false.

The host calls postInit, registerBytesAssetLoader, createViewManagerContext,
createRuntime, registers Device/Application factories, installs the default JS
view manager context, and resumes the application. It creates the real component
tree, calls `setRootViewWithDefaultViewClass`, sets LTR layout specs, and calls
backend `mountRoot` with the tree's root view. Root attachment and detachment
always use the backend's ownership-aware methods.
ArkTS owns the surface dimensions, so the tree retains layout specs during
child invalidation and receives both `setRootSize` and `setLayoutSpecs` on resize.

A libuv async handle on the owning NAPI/UI loop carries Valdi UI dispatch.
Synchronous calls run inline on UI or wait on a per-task condition variable.
Synchronous exceptions propagate back to the caller; asynchronous exceptions
are logged. The dispatcher deletes every owned DispatchFunction after execution.
Backend callbacks capture a strong dispatcher reference.

Destroy stops navigation admission, settles root transitions, retires pending
result/getter callbacks, detaches roots, suspends backend events, and queues page
context destruction after result delivery. A libuv worker clears JS-backed observers on the Valdi JS queue
and performs fullTeardown while the UI loop continues servicing synchronous
requests. Completion drains UI dispatch, releases runtime/context objects, calls
backend shutdown, releases resource/native/NAPI references, and resolves the
promise. A dedicated thread is used only if libuv rejects the worker enqueue.
An async NAPI cleanup hook applies the same process to remaining hosts and closes
the dispatcher after all worker jobs complete. No UI-thread join waits for
teardown. If both worker enqueue and fallback thread creation fail during env
cleanup, cleanup remains pending and the actual failure is logged, rather than
freeing state that can still be referenced by native tasks.

setActive calls the corresponding RuntimeManager application lifecycle method,
suspends/resumes backend event delivery, and publishes foreground/background
notifications on the Valdi JS queue.

## Initial native bridge capabilities

The DeviceBridge reports `harmony`, content window dimensions, display scale,
ResourceManager locale, monotonic uptime, non-web/non-desktop identity, and
observations for size and sampled dark mode. Insets are content-local zero:
ArkTS owns placement in the application window. Dynamic type scale is an explicit
1.0 host policy. Both size and inset observers invalidate Device.ts caches when
the surface dimensions change.

Physical screen dimensions, device model/version, timezone/metric settings,
clipboard, haptics, and back-button hooks raise a Valdi native module exception.
They do not report an emulated platform or successful no-op operation.
ApplicationBridge supports real foreground/background subscriptions and
isForegrounded. App version and integration-test detection raise unsupported
exceptions. Keyboard observation is absent (`undefined`), using Application.ts's
existing optional-feature behavior; this host does not publish invented keyboard
events. The standalone Device/Application modules are not linked or reused.

Native API errors throw ArkTS exceptions. Asynchronous module evaluation/render
errors are emitted by Valdi's real logger to Hilog tag `ValdiHarmony`, domain
`0xFF00`; mount returning a handle is not evidence of a successful first
render.

`HarmonyNavigator` supplies native stack operations, typed JSON results,
retained tabs, lifecycle visibility, and animated push/back. See
[NAVIGATION_API.md](NAVIGATION_API.md) for ordering, cancellation, resize, and
observer contracts. Optional backend animation diagnostics are logged once
per completed/canceled animation with bounded real-frame samples.

## Verification boundary

The implementation was compiled against the staged pinned Valdi headers and the
Harmony API26 NDK. Host/backend objects and a strict `--no-undefined` shared
library link against the real whole-archive Valdi runtime verify C++/ABI/link
closure. They do not validate NAPI startup, actual ArkUI layout/taps, pause/resume,
or asynchronous environment cleanup on a running Harmony device. The parent
owns HAP build/install and device validation.
