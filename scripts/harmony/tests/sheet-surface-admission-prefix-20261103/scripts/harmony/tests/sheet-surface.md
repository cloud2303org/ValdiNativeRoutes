# Harmony same-window sheet carrier

These files are new app-owned host code. SDK compilation, native fixture
execution, integrated link, ArkUI layout and device acceptance are **pending**.
The native14/media14 receipts remain historical and do not validate this carrier.

The public interface is in `HarmonySheetSurface.hpp`. `create` takes a dedicated
retained `NodeContent`, the window's `ArkUI_ContextHandle`, a later-UI-turn queue,
and the scrim terminal request. New nodes are allocated synchronously under
SDK26 `OH_ArkUI_RunTaskInScope` for that context. The surface owns six native Stack nodes:
full-viewport carrier, scrim, panel, 24vp handle area, 36x4vp handle bar, and the
real page viewport. A real Valdi root is mounted with
`viewManager.mountRootInParent(root, surface->viewport())` using the backend's
actual signature. The surface never owns or disposes that foreign page root.
Navigator supplies page layout width/contentHeight and geometry content insets;
the viewport does not duplicate those safe-area insets as padding.

`layout(geometry, offset)` sets native dimensions/positions explicitly in vp.
With an active settle it ignores the supplied offset, preserves the displayed
closedward fraction, and retargets the same terminal destination against the new
panel height. Direct drag first calls `cancelAnimation()` (which returns the
current logical offset). `currentOffset()` is also readable without canceling.
Positive offset and velocity mean downward; open is 0 and closed is panelHeight.
Geometry assumes the sheet NodeContent occupies the available viewport from
window y=0. The shell must supply one coherent observation rather than deriving
fullWindowHeight by adding keyboard height.

`animateTo` owns an SDK animator in the same UI context. SDK26
`native_animate.h` exposes `ArkUI_NativeAnimateAPI_1::createAnimator` and
`disposeAnimator`, `OH_ArkUI_Animator_Play/Cancel`, and frame/finish/cancel
registration on `ArkUI_AnimatorOption`. Its linear [0,1] frame progress samples
a 450ms critically damped spring (omega=8/0.45, initial velocity bounded to
five times the remaining displacement per second). Every sample translates the
whole native panel and applies the matching scrim progress. Successful finish
writes the exact endpoint before delivering `completion(true)`. A frame/final
write error delivers false. Allocation/start errors throw synchronously.
Explicit cancel/background/detach/retire suppress canceled completions.

`setActive(false)` cancels animation, hides the full subtree, disables input and
uses BLOCK_DESCENDANTS (SDK26 NONE would still allow descendants). Active
DEFAULT blocks lower siblings while allowing real page controls; BLOCK would
swallow the page's children.

Terminal ordering is external page unmount, then `retire()`. Both `detach()`
and `retire()` synchronously remove the carrier and its complete panel/scrim
subtree from NodeContent. Retire also queues owned-node disposal. All SDK
callbacks retain owner/token to a later UI turn; canceled animator disposal is
also deferred, with generation revoked BEFORE SDK Cancel can reenter. Scrim
callback copies its callable before invoking it. No global retention exists.
The provided queue must keep draining after teardown admission and before the
host releases NodeContent/UIContext. A queue that throws violates the ownership
contract; a failed native removal cannot silently count as successful terminal
detach. Those two unrecoverable ownership failures terminate rather than return
with dangling SDK state or a still-attached visual panel.

Run only the JavaScript scalar check while the parent's native slot is held:

```sh
node --test scripts/harmony/tests/sheet-geometry.test.mjs
```

It executes production geometry statements through a narrow translation; this
is arithmetic and branch validation, not C++/SDK/device evidence.
`sheet-geometry-check.mjs` wraps that exact Node command and emits a JSON receipt
with source and inspected SDK-header SHA-256 digests. It invokes no native tool.
`sheet-surface-native.cpp` is an **uncompiled** future fixture against the real
SDK26 declarations and actual surface implementation with fake SDK dispatchers.
It covers panel/scrim frame writes, retargeting, stale generations, background
input, external page ownership, synchronous reentrant retirement, callback
unwind retention, frame failure, partial node allocation, mount failure, and
animator allocation/start failure. It does not prove SDK event ordering or
actual ArkUI rendering and must not be included in historical receipts.
The failed external page-add case exercises the viewport admission boundary;
real Valdi backend `mountRootInParent` integration remains the Navigator owner's
fixture responsibility.
