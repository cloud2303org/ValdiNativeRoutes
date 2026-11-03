The delegated backend implementation is source only. No native compiler,
native fixture, native build, device, HAP, or archive command was run by this
child. The parent owns all compilation and independent review.

The private API is `bindSheetInteraction(manager, realPageRoot, binding)`.
The host supplies `panel = surface.interactionNode()`,
`rootMountParent = surface.viewport()`, `context = _uiContext`, the revocable
lifetime, and begin/offer/end callbacks. The same context pointer must be the
one supplied to this manager's configuration. SDK context wrappers obtained
from nodes are not treated as context identities.

The backend verifies the root's exact native parent, the native ancestry from
that viewport to the explicit panel, three unique native node identities, the
root's mount epoch, token identity and generation, and current root ownership.
The panel/viewport are borrowed host-owned nodes. The backend unregisters its
own receiver, interrupter and recognizer before notifying end during unbind;
it never reparents or disposes either borrowed node. Recognizer/userdata
disposal is queued on the existing later UI dispatcher.

The panel owns one vertical recognizer. Native touch-test identities decide
whether a touch belongs to a backend vertical scroll, a non-scroll panel area,
Refresh, an editor, a native picker, or a wheel. Touch-test membership includes
native transforms and the real root's hostParent mount. There is no panel
discovery by rectangle or ancestor guessing. Non-scroll pan and native scroll
budget are mutually exclusive for the touch. Generic scroll start/frame events
cannot begin a session. Raw touchscreen admission plus the selected scroll's
WILL_START_DRAGGING is required for native-budget admission.

For an accepted scroll touch, only the selected deepest scroll's frame
allocates the native budget. Its exact vertical ancestor chain temporarily
uses SELF_ONLY, and its ancestor frame callbacks return zero, so ancestors do
not independently apply that budget. Downward motion allocates content to top
across the chain before offering the residual to the sheet; upward motion
offers to restore the sheet first, then allocates its remainder to content.
Only the selected chain changes nesting; terminal/cancel/unbind restores its
ordinary nesting. No mode or offset is written for wrong-start, unrelated,
Refresh or horizontal scrolls. Built-in wheel recognizers are never modified.

`SheetInteractionMount.inc` extends interaction traversal by resolving a
separately mounted root's actual hostParent against the same backend registry
and exact native parent identities. The frozen WheelArbitration.inc remains
bytewise unchanged. The same extension is used for input enablement, root
gesture wheel admission, and native Scroll/Refresh wheel admission.

`sheet-backend-native.cpp` includes the actual production helper, input,
mount, wheel-arbitration and scalar-state bodies with real SDK26 headers.
Only the native/renderer dispatch and runtime delivery boundaries are faked.
Compile it twice with the app and fork backend include directories using the
parent's existing real Valdi/SDK include setup and ASan/UBSan host fixture
workflow. It exercises conserved nested down/up budgets, duplicate ancestor
frames, repeated equal deltas, handle/empty-panel pan, generic-frame rejection,
begin rejection, begin/offer reentry, root mount replacement, invalid
remainders, at-most-once terminals, background cancellation, preserved
native picker/editor/Refresh priority, mounted wheel identity and deferred
recognizer disposal. It has deliberately not been compiled or executed here.
The affected full manager units still need both SDK26 ABIs.

`node scripts/harmony/tests/sheet-backend-check.mjs` performs source integrity
checks only and emits input hashes. It verifies the original immutable wheel31
receipt and protected input/label/wheel sources, allowing only the parent's
separate authorized WheelState P2 and its wheel-native fixture change, recorded
in the relationship-prior receipt. It does not prove C++ compilation or runtime
behavior.

The November 3 embedded-picker object-props migration separately updates the
explicit hashes for `NativeWheel.inc`, `NativeWheel.hpp`, `WheelState.hpp` and the
local wheel test. The source trio is mirrored into the maintained fork. Historical
wheel31 and P2 receipts remain unchanged. Current object-flow/reset execution and
12 negative controls are recorded in
`/tmp/valdi-picker-object-contract-20261103/harmony-reset-fresh/receipt.json`;
these host tests do not establish HAP or device behavior.

Native ordering remains pending: parent pan versus native Scroll admission,
WILL_START versus the first FRAME_BEGIN, ancestor frame ordering after scoped
nesting changes, native cancellation/interception, and release ordering.
Neither the source implementation nor the synthetic dispatcher is evidence
that a physical device delivered exactly those orders. The parent must retain
an instrumented native event trace and replay the affected sheet cases on the
new linked artifact before claiming device parity.
