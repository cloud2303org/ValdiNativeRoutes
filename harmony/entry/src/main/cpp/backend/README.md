# Valdi ArkUI backend

This directory implements the pinned Valdi `IViewManager`, `ViewFactory`,
`ViewAttributeHandlerDelegate`, `DefaultMeasureDelegate`, and `IViewTransaction`
contracts using the HarmonyOS ArkUI native C API. It requires the parent's
Harmony platform overlay on the staged upstream root:

- `Valdi::PlatformTypeHarmony` in `PlatformType.hpp`
- `snap::valdi_core::Platform::Harmony` in generated `Platform.hpp`

Both platform methods return Harmony. No Android or iOS identity is used.
The source contract is Valdi commit
`15feb6530ceecb971f4c8519ea8ab77474b959db` plus those platform overlays.

## Build

After adding `harmony/runtime-build`, add this directory with
`add_subdirectory(... backend)` and link the host shared library to
`valdi_arkui_backend`. Its PUBLIC dependencies are `valdi_runtime_ohos`,
`ace_ndk.z`, `native_drawing`, `pixelmap`, and `image_packer`. The standalone target also
compiles `../assets/HarmonyImageAsset.cpp` to close its typed image references.
It inherits the runtime target's staged
includes/compile definitions and requires C++20, RTTI, and exceptions.
Alternatively compile `ArkUIViewManager.cpp` and the parent's `assets/*.cpp`
directly in the host target with the same dependencies plus the decoder's
`image_source` dependency. Do not also link the standalone target in that mode.

The entire public API is in `ArkUIViewManager.hpp`, namespace
`Valdi::Harmony`. No NAPI, resource manager, runtime manager, or host lifecycle
code is implemented here.

## Host API

```cpp
Valdi::Harmony::ArkUIConfiguration config;
config.displayScale = density;  // physical px / Valdi point, NOT font scale
config.uiContext = uiContext;   // optional borrowed OH_ArkUI_GetContextFromNapiValue result
config.isUIThread = [dispatcher] { return dispatcher->isUIThread(); };
config.dispatchUI = [dispatcher](Valdi::DispatchFunction work, bool sync) {
    dispatcher->dispatch(new Valdi::DispatchFunction(std::move(work)), sync);
};
config.reportError = [logger](const std::string& error) {
    logger->log(Valdi::LogTypeError, error);
};
auto viewManager =
    std::make_unique<Valdi::Harmony::ArkUIViewManager>(std::move(config));

// Use viewManager for RuntimeManager::createViewManagerContext(...).
tree->setRetainsLayoutSpecsOnInvalidateLayout(true);
tree->setRootViewWithDefaultViewClass();
auto root = tree->getRootView();  // retain until unmount
Valdi::Size size(widthInPoints, heightInPoints);
viewManager->setRootSize(root, size, false);
tree->setLayoutSpecs(size, Valdi::LayoutDirectionLTR);
viewManager->mountRoot(root, nodeContent);
```

**On every host resize, call BOTH `setRootSize(root, size, rtl)` and
`tree->setLayoutSpecs(size, direction)`.** Valdi explicitly skips root frame
delivery in `ViewNode::applyFrame`; the backend cannot infer the root's Valdi
size from child transactions. Initial native measure can fall back to finite
host constraints, but explicit root size also establishes root event geometry.
For an ArkTS-sized surface, retain Valdi layout specs on invalidation as shown
above. Otherwise child changes ask the native host for new specs and updates
wait until that host calls `setLayoutSpecs` again.
Changing physical density requires recreating the manager/runtime: scale is
fixed in the manager and all Valdi/Yoga configuration.

`createRootView()` is an alternative when the host wants to supply a root to
`tree->setRootView(root)` itself.

`mountRootInParent(root, nativeParent, index)` mounts into an existing C-created
native container instead of NodeContent. That native parent must have suitable
host sizing/layout behavior and must not be a descendant of the root.
`unmountRoot(root)` synchronously detaches a root and permits later remount.
Keep host-owned NodeContent/native parents alive until unmount returns.
Do not attach the same handle separately using `OH_ArkUI_NodeContent_AddNode`;
the backend tracks its own attachments for safe disposal.

`ArkUIViewManager::nativeNode(root)` and `ArkUIView::nativeNode()` return the
borrowed `ArkUI_NodeHandle`; these accessors require the UI thread. The host
must not dispose or reparent the borrowed node directly.

For background/foreground, call `setSuspended(true/false)` alongside the
runtime's application pause/resume operations. Suspension cancels accepted gestures and suppresses new input
delivery; resume invalidates native measurement/layout without replacing the
Valdi tree or its state.

Teardown:

1. On UI, suspend and `unmountRoot(root)` while host NodeContent is still alive.
2. Destroy the Valdi context/tree and fully tear down its runtime, continuing
   to service the UI dispatcher while worker teardown runs.
3. Drain pending UI dispatches, then call `shutdown()` (UI or a serviced worker).
4. Drain UI dispatches again (native animation disposal leaves callback stacks
   before releasing its C handles), then release remaining views/factories/manager
   before closing the dispatcher.

`shutdown()` is terminal and idempotent. It disposes all native nodes even if a
Valdi view is still retained, unregisters all touch/interception/gesture/custom/draw listeners,
releases retained `ValueFunction`s and draw callbacks, and detaches the tree.
The destructor also invokes shutdown. It cannot make a closed dispatcher work:
the dispatcher must outlive every view and pending node deletion. Last view
release on a worker schedules disposal on UI.

All native calls, including typography allocation/measurement/destruction, run
on UI. Off-UI transactions use upstream `DeferredViewTransaction` and require
a valid `MainThreadManager`. Synchronous backend dispatch drops tracked Valdi
locks, matching the upstream deferred transaction dispatch pattern. The host's
dispatch implementation must propagate synchronous exceptions and must accept
every asynchronous disposal before it closes.

## Supported classes and attributes

Harmony JS platform 6 builtins may directly use logical native class names:

- `view`: native custom container, also the default/root class.
- `layout`: same native container if explicitly requested as a backing class;
  ordinary Valdi layout placeholders remain managed by Valdi.
- `label`: native custom layout wrapper containing an actual `ARKUI_NODE_TEXT`.
- `image`: native custom layout wrapper containing an actual `ARKUI_NODE_IMAGE`.
- `scroll`: native custom viewport containing an actual `ARKUI_NODE_SCROLL`
  and a Valdi-sized custom content container.
- `ArkUIView`, `ArkUILabel`, `ArkUIImageView`, `ArkUIScrollView`: explicit native aliases.
- `ArkUIRefreshView`: controlled native pull-to-refresh through the existing
  `custom-view harmonyClass` escape hatch; see `REFRESH_API.md` for its three
  attributes and single direct vertical Scroll contract.

`getClassHierarchy()` inherits the common view attributes and the runtime's
ordinary Yoga/default attributes. Native text input controls
deliberately return false from `supportsClassNameNatively()`
and fail factory creation. Do not map those tags to `view`.

Common bound attributes: `backgroundColor` (the standard Valdi color binder,
RGBA converted to ArkUI ARGB), `opacity` in [0, 1], `borderRadius` in points
(single value or Valdi four-corner syntax), `clipToBounds`, and the gesture attributes documented in `GESTURE_API.md`.
Percentage border radius produces an explicit error.
The upstream composite transform binder handles `translationX/Y`, `scaleX/Y`,
`rotation` (radians), `transform`, and `transformOrigin`. Its postprocessed
five-component transform is rendered using native translation, scale, and
z-axis rotation. Translation is scaled to physical pixels; rotation is converted
to ArkUI degrees. Valdi resolves percentage translations, origins, and RTL
before this backend receives the transform.

Label attributes: plain or attributed `value` (standard label spelling) or `text` alias,
`fontSize` in points, `fontWeight` 100..900 in steps of 100 or
`normal`/`regular`/`medium`/`semibold`/`bold`, `fontFamily`, `color`,
`textAlign` (`left`/`right`/`center`/`justified`), `textDecoration`, `letterSpacing`,
`lineHeight`, `lineHeightAbsolute`, `textOverflow`, and `numberOfLines`
(default 1; 0 means unlimited). Use one of `value` and `text`, not both.
Real attributed parts preserve per-run fonts, colors and decorations.
See `LABEL_API.md` for the source audit, unsupported span errors and exact limits.

Supported font shorthand is `system 16`, `system-WEIGHT 16` (weights 100..900),
or `module:font_name 16`; labels also accept system italic forms.
Sizes may vary. `fontSize`, `fontWeight`, and
`fontFamily` explicitly override shorthand fields, regardless of binder apply
order. Module fonts use optional `loadFontData` and shared process-lifetime,
versioned registrations in the borrowed global font collection. Rendering and
measurement resolve the same family alias; bytes survive every host teardown.
See `FONT_API.md` for syntax, ownership and feature limits.

Images use the pinned `bindAssetAttributes(ImageHarmony)` source/callback
contract and retain typed native pixelmaps through owned ArkUI descriptors.
`objectFit`, `tint`, `contentScaleX/Y`, `contentRotation`, and resolved RTL flip
affect the inner image independently of wrapper input/animation. Unmount resets
native sources and remount recreates descriptors. See `IMAGE_VIEW_API.md`.

Yoga remains responsible for `width`, `height`, flex, positioning, spacing,
alignment, padding, layout direction, and flattened layout-only nodes. The
backend consumes Valdi's resolved frames; it does not recreate the Yoga tree.
It rounds point coordinates to pixels using `displayScale`.

Each backing view is an `ARKUI_NODE_CUSTOM`. Its native measure callback
measures each child at its exact Valdi width/height and calls
`setMeasuredSize()`. Its layout callback uses `layoutNode()` to place children
at the supplied Valdi x/y and `setLayoutPosition()` for itself. Those APIs
never run from a transaction, setter, or arbitrary host callback. ArkUI
`NODE_POSITION`, Stack/Column auto layout, and JS renderers are not used.
Frame/layout invalidation requests a new ArkUI measure pass.
Scroll wrappers measure their real Scroll at the exact viewport size; its
custom content measures Valdi children at their exact frames and declares the
runtime's content extent independently of which offscreen views are mounted.
Scroll offsets do not translate those children manually. See `SCROLL_API.md`
for native bindings, ref usage, event synchronization, insets, and QA handoff.

The label measure delegate snapshots processed layout attributes through
upstream `DefaultMeasureDelegate`, builds real `ArkUI_StyledString` runs with
`OH_ArkUI_StyledString_CreateTypography` / `OH_Drawing_TypographyLayout`, and
converts native results back to points using Valdi's `sanitizeMeasurement`.
It uses the same `NativeLabel` builder as the Text renderer, including run
styles, line heights, spacing, direction, alignment and overflow, and handles exact,
at-most, and unbounded Yoga constraints. The rendered text has the same
pixel unit convention and uses the system font fallback. Fine typography
parity (e.g. platform line-breaking policy and font fallback differences)
still requires on-device validation.

Native input uses SDK 26 `native_gesture.h` recognizers and actual
`NODE_TOUCH_EVENT` / `NODE_ON_TOUCH_INTERCEPT` events. `onTap` no longer
registers `NODE_ON_CLICK_EVENT`, avoiding a second tap path. Single/double taps,
long press, drag, pinch, rotation, all six disabled/predicate variants, raw
start/all/end touch callbacks, delayed raw observation, subtree `touchEnabled`,
custom `hitTest`, and shorthand/edge touch area extensions are bound through
Valdi's existing attributes. See `GESTURE_API.md` for native arbitration,
units, lifetime rules, host edge-pan integration, and platform differences.

Predicates and hit testing use the pinned `ValueFunction::callSyncWithDeadline`
with `SkipIfTimedOut`, real event data and Boolean admission. They drop tracked
locks and use the JS bridge's MainThreadManager batching. Timeout rejects the
candidate. The host dispatcher cannot pump arbitrary JS-to-UI `dispatchSync`;
such a callback can still reach the bounded deadline. Ordinary action delivery
preserves SyncWithMainThread, uses bounded waits for non-changed events, and
allows throttling of changed events. Inline callback replacements preserve an
accepted recognizer; subsequent events dispatch to the current handler.

`scheduleOnNextDraw` uses the real per-node ArkUI draw-completed hook. The
queue is consumed on a draw completion and released at disposal. A suspended
or unmounted tree is not promised a draw completion. This is a rendering
pipeline signal, not proof of physical screen presentation.

## Explicit limitations

Ordinary-node PNG snapshots, opaque native references and opt-in
`stopScrollingOnTouch` are described in `SNAPSHOT_REF_API.md`, including the
optional per-runtime `dispatchWorker` admission contract.

Non-Harmony loaded assets, native actions, percentage radii,
advanced attributed spans (see `LABEL_API.md`), label/image child views, and unbound native attributes are unsupported.
Label-specific text content insets/padding and Yoga baseline alignment are not
implemented; native text fills its Valdi frame and uses native glyph baselines.
The pinned runtime has no baseline return or resolved text-inset transaction hook.
Container padding and child
placement still come from Yoga's resolved child frames.
Attribute failures return `Valdi::Error` through the standard delegate;
unsupported transaction/manager operations throw descriptive C++ exceptions.
Snapshot callbacks receive a failure result.

`layoutView()` cannot promise synchronous native layout outside ArkUI's
measure/layout callbacks and therefore throws an explicit unsupported error.
Ordinary frame transactions and Yoga layout do not require that hook in the
pinned runtime. No raster bitmap factory is
provided. Views disable Valdi pooling so callback or native style state cannot
leak across logical nodes. Gesture coverage and the remaining native arbitration/timing differences are
listed in `GESTURE_API.md`; scroll-specific differences are in `SCROLL_API.md`.

Errors in C event/layout/draw callbacks cannot unwind through ArkUI. They go
to required `reportError`; teardown API failures are reported and terminate
rather than leaving a dangling C callback user-data pointer.

## Native animations

`createAnimator()` implements the pinned runtime `snap::valdi_core::Animator`
interface. `flushAnimator()` starts a real `ArkUI_NativeAnimateAPI_1` animator
using `ArkUIConfiguration::uiContext` when the host supplies its actual
`OH_ArkUI_GetContextFromNapiValue()` handle. The host retains the ArkTS UIContext
through backend shutdown and the subsequent UI cleanup drain.
Without an explicit context, the backend obtains one context from the first
mounted root using `OH_ArkUI_GetContextByNode()` and binds it to the common
NodeContent/native parent. Fallback groups and later animations must use this
same mount surface; explicit context binding supports multiple mount surfaces
within the host's declared UI instance.
Never compare context handle pointer values: the upstream implementation in
`interfaces/native/node/node_adapter_impl.cpp` allocates a new `ArkUI_Context`
wrapper containing an instance ID on each call. SDK 26 exposes the type
opaquely, without a public instance-ID accessor or context-release API.
The fallback therefore queries once per backend rather than once per target
or animation; explicit host binding is preferred. Context pointers are never
dereferenced or deleted using a guessed private ABI.
Each SDK `onFrame` callback receives native interpolated progress and drives
the stored presentation values. Custom node frame x/y/width/height are
interpolated and invalidate native measure/layout on each frame; they are
never passed to `animateTo`, which cannot interpolate this custom C++ geometry.

Supported interpolation:

* Layout origin and size, including Yoga's resolved margin/width/height changes.
  A newly created node without previous geometry receives its first frame
  immediately.
* Opacity, straight ARGB background color channels, four point-valued corner
  radii, and the resolved translation/scale/rotation transform.
* All four actual Valdi enums: Linear, EaseIn, EaseOut, EaseInOut; four-point
  cubic Bezier overrides the enum. Native SDK curves perform timing easing.
* Positive stiffness/damping springs use the analytic unit-mass damped spring
  equation driven by a native linear animator clock. SDK 26 explicitly excludes
  spring curve handles from `AnimatorOption_SetCurve`; this backend does not
  pass an unsupported curve handle. Under-, critical-, and overdamped springs
  are supported. With a positive duration, the spring is sampled over that
  interval then set exactly to the endpoint. The pinned JS spring API has no
  duration; duration=0 selects twelve time constants of the slowest decay.
  This is a finite spring approximation, not upstream per-property velocity/
  displacement threshold tracking. Initial velocity is zero.

Noninterpolated label text/font/color/alignment/max-lines changes and
clip/tap/hierarchy changes apply immediately within an animated transaction.
They do not reject a transaction containing numeric/layout animation.
Snapshot crossfade is explicitly rejected. Springs require both positive
coefficients <=1,000,000, no cubic control points, and a derived settling
interval <=60 seconds. Cubic x coordinates must be in [0,1]. No fake immediate
completion substitutes for an unsupported animation.

Animation groups preserve logical target and presentation values separately.
`beginFromCurrentState=true` samples presentation; false uses the previous
logical target. A new write to the same property cancels the previous group;
other properties/groups can continue independently. Cancellation freezes
presentation, cancels and disposes the native animator, and delivers true.
Normal completion delivers false. Cancellation before flush is remembered
and its supplied completion receives true when flushed. Repeated cancellation
does not redeliver completion. An animator is single-use.

All state and native API operations run on UI. Valdi completion Values are
invoked with `ValueFunctionFlagsNeverCallSync`, letting the runtime's own
wrapper marshal JS callbacks safely. Native host tween completions run on UI.
Native callbacks retain animation state, tracks hold only weak node ownership,
and disposal cancels by node identity even when its last shared owner is
already being destroyed. C handles/options/curves are disposed outside their
native callback stack; queued cleanup retains the backend. Unmount cancels
the subtree, node disposal cancels its groups, and shutdown cancels everything
before removing native nodes. Suspension cancels and freezes current groups;
resume does not replay them.

The first parent emulator attempt exposed the context-wrapper identity issue:
zero native frames and cancelled=true before native creation. That failed
attempt is not animation execution evidence. The explicit-context/single-
surface fallback correction has been recompiled for both architectures;
native frame and visual validation belongs to the parent's subsequent HAP run.

See `ANIMATION_API.md` for two-root route tween integration and bounded native
frame diagnostics. Delay/speed/repeat/autoreverse exist in the host tween
options; the actual seven-argument Valdi factory has no such parameters.

## Verification

```sh
python3 harmony/entry/src/main/cpp/backend/verify-objects.py
```

The script reads the prepared runtime's `compile_commands.json`, uses the
real staged Valdi/dependency headers plus installed OHOS SDK, and produces
x86_64 and arm64 objects under `/tmp/valdi-arkui-objects` with C++20 and
`-Wall -Wextra -Werror` (excluding inherited unused-parameter warnings).
It creates only a temporary include alias from the upstream `phmap/` include
spelling to the dependency's real `parallel_hashmap/` headers. It does not
alter the dependency archive or substitute ABI stubs.

The script also runs host executables against production gesture state and
native deadline cancellation (see `GESTURE_API.md`) and production animation math:
frame/transform interpolation, spring overshoot, differential equation checks
in all three damping regimes, default settling duration, timeline speed, and
invalid/overflowing durations. The test source is in `tests/` so a parent
`backend/*.cpp` glob does not compile its main function into the app.
It also tests production scroll extents/bounds, empty/small content, horizontal
geometry, sampled/release velocity, and sequence replacement/terminal reentry.

New font/image helper checks run with AddressSanitizer and UndefinedBehaviorSanitizer:
system/module syntax, mutable-buffer ownership, concurrent cache reuse,
changed-file/module alias isolation, failed registration retry, intrinsic
image geometry and source-alpha tint matrix.

Both target object compiles have passed. All 151 directly imported ArkUI/Drawing/pixelmap
C symbols were also checked against `libace_ndk.z.so` and
`libnative_drawing.so`/`libpixelmap.so` for both target triples; none were missing.
Each ABI also links a real `--no-undefined` SDK import probe. A relocatable
backend + HarmonyImageAsset link proves closure of the standalone backend's
asset methods/typeinfo. Verification rejects private font-collection create/
destroy imports and font unregister imports. Evidence files are emitted in
the output directory, including `verification.json`.
This validates the real C++/ArkUI ABI
at compile time; the host math executable does not execute ArkUI callbacks.
These checks are not a linked runtime, HAP, device, visual, text-parity,
counter-interaction, or pause/resume execution proof. The host integration
must perform those checks after the runtime target and HAP are available.

The 2026-11-02 rich-label phase adds `tests/label-text.cpp` under ASan/UBSan, preserving
all earlier suites and the separate input negative controls. See `LABEL_API.md`.
The host-only, UI-only `setRootHitTestPassthrough(root, enabled)` opt-in is
documented in `OVERLAY_HIT_TEST_API.md`; it leaves other roots' hit policies
unchanged and persists through later insertion/gesture changes.
