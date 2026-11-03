# Harmony route sheets

Harmony route sheets are app-owned native ArkUI surfaces in the existing window.
They follow this application's Android/iOS ports of Software Mansion
react-native-bottom-sheet 0.16.2. They do not use system `bindSheet` or an AppUI
dialog. Route sheets and AppUI presentations have separate ownership.

The implementation is in progress on November 3, 2026. The helper's original
zero-height animation-intent fix passed its identical baseline/fixed native
regression and a second independent source review. Its subsequent input-gating
extension passed the original P2/lifetime fixtures and the new input fixture;
independent review of the helper and six actual closing callers is clean. The
bounded real-JSC caller characterization and its proof review are clean, with
three failing negative controls. Initial backend
review found two cleanup/callback-fence defects; their fixes and the iOS nested
drag conformance work are still being validated. Earlier SDK objects retain
their earlier source claims. Final independent review and live acceptance are
separate gates. The historical full-development-r2 HAP predates this work.

## Actual iOS route reference

`ValdiHost.swift` forwards shared navigation into `Navigator.open()` and
`showSheet()`. `App.swift`'s `SheetLayerView` creates `SheetHostView` for both
`sheet` and `compactSheet`. That host supplies the route sheet's 600pt/sec
flick threshold and nearest-detent selection, with the closed detent winning
an exact midpoint tie. `NativeRoutesUI/BottomSheet.swift` is a separate service
sheet; its 80-point/800pt/sec close criteria do not define route behavior.

`SCValdiScrollView` wraps a native `UIScrollView`. Its delegate publishes native
drag, scroll, target-offset and deceleration callbacks, applying runtime offset
corrections. Harmony likewise retains native ArkUI Scroll controls and their
ordinary inertia. The sheet adapter handles touch admission and boundary
handoff; NAPI supplies the shell and ownership seam. It does not substitute an
ArkTS `Scroll` or a custom Android-style scrolling engine.

The route host records the maximum initial distance to the edge across its
candidate scroll chain, waits until all candidates reach the edge, then pins
them while applying the cumulative pan remainder to the sheet. For offsets
30 and 20, a 70-point downward pan leaves 40 points for the panel. Sequentially
subtracting both scroll offsets would leave 20 and is not route parity. The
Harmony conformance fixture must check the selected source's normalized
offset/panel trace, split frames, reversal and cancellation; SDK event ordering
and actual UIKit execution remain outside that host fixture's proof.

## Ownership and navigation

`HarmonyNavigator` retains one sheet outside the base stack. Its page and the
base front page remain visible in the foreground. `currentPages()` lists the
base entries followed by the sheet; AppUI foreground identity selects the sheet
through its closing animation. Another open while the sheet exists changes the
base stack and retains the sheet. The base horizontal interactive-back observer
is disabled for the sheet's entire ownership lifetime.

Finish, back, scrim and a committed drag share one terminal claim. The terminal
generation is invalidated before cancellation or unbinding can reenter. The
page, result and native presentation stay retained during closing. Native page
unmount and panel detach precede clearing sheet ownership and reconciling the
base. Result delivery is queued next, followed by the context destruction fence
on JS. Runtime teardown detaches synchronously and drains admitted results; it
does not wait for an animation frame.

Commands that remove a caller wait behind sheet removal. Result admission
captures its emitting `Context::currentRef()` and actual ancestor chain on JS;
UI does not infer ownership from the current foreground page or walk a mutable
context parent chain. The result retains that emitting lineage through queued
callback delivery. Caller retirement cancels matching admitted results,
including attached pages and commands outside the dispatcher's current batch.
Explicitly unowned calls are distinct from captured callers and are not swept
by a global null/expired fallback. A weak context gate remains until owner
expiration because `Runtime::destroyContext()` called from JS dispatches the
actual destruction onto UI. The bounded real-JS/native characterization verifies
ordinary and owner-propagating wrappers, child contexts and asynchronous
continuations on a dedicated Valdi queue. It captures the actual dynamic
admission Context, not universal lexical callback ownership. A child callback
called directly in JS can emit under its child Context; the same callback called
from native emits under its holder root. A lexical callback invoked under
another page emits under that page. A supplied page parented to a global root
can emit globally; retiring that supplied page does not cancel the global request.

Actual native page creation supplies detached route data and generated native
PageContext/TabBarContext payloads. `ContextManager` does not infer a current
parent, and the component handler's parent resolver selects only retained JS
values. The fixture checks real generated payloads resolve no parent, injected
real JS callbacks nested in arrays/maps do resolve a holder root, and the
production detachment path rejects those unsupported route parameters. Matching
staged/fork source hashes support this independent page-root premise. A full
JavaScriptRuntime, renderer-created tree and OHOS Hermes run remain unproved.

The native `picker` uses the same sheet owner and real backend root. Sizing and
retirement check the optional Valdi tree before accessing it. A native page's
result caller remains the originating admission identity, independently of
whether the destination has a Valdi tree.

## Native surface and geometry

The shell retains a dedicated `sheetNodeContent` above pages and tab surfaces,
below loading and toast. NAPI collision accounting includes it through the
DestroyJob. `HarmonyRuntimeHost::ownsContent()` and `contents()` include it, and
its `napi_ref` remains owned until host destruction after deferred UI cleanup.
The development lease remains the first private runtime member. Existing media,
AppUI provider, presenter and pending DTO implementations are unchanged.

`HarmonySheetSurface` owns the scrim, clipped native panel, 24vp handle and
content viewport. The real page root mounts with backend `mountRootInParent()`.
The helper exposes the explicit owned `interactionNode()` panel and `viewport()`
mount parent. Both become unavailable after detach. The backend borrows these
nodes; it does not reparent or dispose them.

Metrics publish full window height, available viewport height, keyboard overlap
and system bottom as one observation in vp. They do not reconstruct full height
by blindly adding keyboard height to an already resized viewport. A fixed sheet
uses the nominal 75% full-window detent, accounting for observed viewport resize
once. Compact uses 24vp handle + 340vp content + unobscured bottom safe area and
rides the keyboard. The status/cutout top caps the panel; page content receives
top inset zero, horizontal safe areas and unobscured bottom, without tab height.
The shell retains `KeyboardAvoidMode.RESIZE`.

Foreground visibility and input admission are separate. Closing first revokes
the interaction binding and disables helper input, while retaining the visible
carrier through the settle. `setInputEnabled()` changes enabled/hit-test state
and scrim admission without hiding or canceling an animation. Background
`setActive(false)` still hides and cancels; foreground restores the stored input
gate rather than silently enabling a closing panel. A retained full-window
carrier requests blocking hit-test behavior during closing; physical ArkUI
event routing still needs live acceptance.

The native animator moves the entire panel and scrim. Relayout preserves the
animation's original opening/closing intent even when both numeric endpoints
collapse to zero. Finishing while collapsed completes once at numeric zero;
completion reentry can restore geometry and begin a fresh generation. Background
revokes interaction, cancels an uncommitted drag back to open, hides both pages,
and preserves an open sheet.

## Interaction seam

The private `SheetInteraction.hpp` binding is separate from `RootDragObserver`.
It identifies the real mounted root, exact native viewport parent, explicit
owned panel, the manager's UIContext and a generation/lifetime token. Host
callbacks retain only their session/generation owners; they do not capture raw
host or native-node pointers. Host revokes/unbinds before page unmount, panel
detach, replacement or background. Backend owns recognizers, scroll receivers,
userdata and disposal deferred past native callback unwind.

The axis is vertical and units are logical Valdi points / ArkUI vp. Positive
sheet displacement or velocity moves down toward closed. Negative content delta
means a downward request. For finite signed input and remainder, the remainder
cannot amplify or flip sign; closedward sheet displacement equals remainder
minus input. Downward motion consumes deepest-scroll/ancestor capacity to top
before the sheet. Upward motion restores the sheet before scrolling content.

A touch sequence selects one structural source: native scroll budget or
non-scroll panel pan. Generic scroll-start/frame events cannot open a drag:
SDK26 `NODE_SCROLL_EVENT_ON_SCROLL_FRAME_BEGIN` also supports keyboard and mouse.
Its `data[0].f32` is the amount, `data[1].i32` the state, and returned
`data[0].f32` the actual scroll. The SDK documents no globally unique event ID.
Timestamp or floating-value equality cannot prove nested-budget deduplication.
Native ordering and live instrumentation remain acceptance requirements.

Begin may reject. Each accepted session ends/cancels at most once. After every
host callback, backend must recheck root/token/generation/mount/session before
any native write, including frame return values. Preserve Refresh priority,
wheel/editor/input exclusive regions and wheel built-in recognizers. Exact
identity-resolved host-parent traversal extends the existing wheel logical
subtree; borrowed-node mutation or global rectangle guesses are not substitutes.

The private terminal reason distinguishes `Ended`, `GestureCanceled` and
`LifecycleCanceled`. Ordinary end/cancel on a valid current session uses the
same route detent rule: velocity strictly above +600 closes, strictly below
−600 opens, otherwise nearest detent with a closed midpoint tie. A lifecycle
invalidation cannot commit a dismissal from stale motion. Native CANCEL does
not read an undocumented CANCEL velocity field; the adapter uses finite motion
captured for the current touch/pan session, or an explicit zero fallback. The
host's actual-body fixture covers the same position/velocity table for both
ordinary terminal reasons and keeps lifecycle cancellation separate.

## Evidence and reproduction

Historical native picker receipt:
`/tmp/valdi-native-route-20261103/freeze-receipt.json`, SHA-256
`e8eeb7110ebcda67fcee36c9a4b86a07f0b6f81abd8caa329e3849d7fdb5f793`.
Historical media receipt: `/tmp/valdi-appui-media-p2-20261103/freeze-receipt.json`.
The wheel31 baseline receipt remains historical at
`/tmp/valdi-wheel-20261103/freeze-receipt.json`, SHA-256
`e8f0a5fc48542959e0364edce28368095cd2ad76289bc54a3645d640cb28b925`.
Both backend source trees were copied before sheet edits into
`/tmp/valdi-sheets-20261103/backend-wheel31-baseline`.

The original helper source receipt is
`scripts/harmony/tests/sheet-geometry-20261103-source-receipt.json`, SHA-256
`9018356eda3ae58554fc289ca78e0e06382ecf978a01775b529fa517382eaf1d`.
The P2 superseding source receipt is
`scripts/harmony/tests/sheet-surface-p2-20261103-source-receipt.json`, SHA-256
`a412dc50e0f8c470002f6ba596d3915ac9a063c5e3635080a62c054818a84d11`.
Immutable pre-fix helpers and identical regression sources are preserved under
`scripts/harmony/tests/sheet-surface-p2-prefix-20261103` and
`sheet-surface-p2-regression-frozen-20261103`.

`sheet-geometry.test.mjs` translates the actual production scalar statements;
its eight passing checks are arithmetic evidence, not native rendering proof.
`sheet-surface-native.cpp` and `sheet-surface-p2-native.cpp` link the actual helper
against real SDK declarations and explicit fake dispatchers. The production-body
`sheet-navigator-extract.py` documents each collaborator/type adaptation; the
navigation algorithm comes from `HarmonyNavigator.cpp`. These fixtures do not
establish real SDK event ordering or real JS wrapper attribution.

Native probes must hold the parent thread's single compile slot. The bounded
`sheet-probe.py` serializes commands, checks other native compiler processes and
records logs, failures, dependency hashes and outputs in a fresh evidence
directory. It does not build the app, HAP or use a device. No old Context archive
may be mixed with current 616-byte interface headers. Live handle/empty-content
drag, nested scroll handoff, wheel/input exclusion, keyboard/rotation/background,
result timing and final artifact acceptance remain pending until an explicitly
identified new package is built and exercised by the parent.

Current bounded execution records include:

- `/tmp/valdi-sheets-20261103/surface-navigation-integration`: the same actual
  helper and fixture with old/fixed unchanged Navigator methods. The baseline
  fails on an actual native hidden-visibility write; the fixed methods pass
  native visibility/input/frame, reconcile/resize/background and detach-before-
  result assertions. Root mount, UI/JS dispatch and Context retirement remain
  explicit collaborators.
- `/tmp/valdi-sheets-20261103/caller-freeze-20261103/receipt.json`, SHA-256
  `8e35d83b9e6de77f1fe4d7bbafe3fb706bb6782b1240789121dc8501b1e3b111`:
  seven frozen caller sources, all original attempts, fresh ABI support origins,
  real JSC/wrapper/queue execution and three operation-specific negative controls.
- `/tmp/valdi-sheets-20261103/arkts-resumed-full-2`: full unchanged `Index.ets`
  builder source checked with actual SDK26 declarations, ArkUI syntax configuration
  and ArkTS 1.1. Zero errors, 23 warnings and 686 hashed consumed sources. This is
  no-emit type/lint checking; no ArkUI output transform, app link or HAP occurred.
