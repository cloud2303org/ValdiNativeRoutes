The route-sheet reference is selected by `ios/ValdiRoutes/Navigator.swift`
`open`/`showSheet`, which constructs `SheetLayerView`. That layer is defined
in `ios/ValdiRoutes/App.swift` and owns `SheetHostView`. Fixed route sheets use
75% height; compact route sheets use the handle, content and safe-area/keyboard
geometry in App.swift. Primary proof hashes record Navigator.swift, App.swift,
SheetHostView.swift, SCValdiScrollView.m and SCValdiScrollViewDelegate.m.
The service `NativeRoutesUI/BottomSheet.swift` is read-only context, not the
route host's dismissal-threshold oracle.

SCValdiScrollView wraps the native UIScrollView, sizes its content, applies
runtime offsets, and forwards native delegate events. Its delegate permits
runtime onScroll to return a circular offset correction. The Harmony P2 guard
therefore runs inside the actual corresponding NativeScroll drain path, before
an obsolete manual publication can write such a returned offset.

The old Harmony allocator subtracted deepest consumption before giving an
ancestor its input. For child30,parent20 and down70, that SUM allocator left
sheet20. The selected iOS route host instead records the maximum edge distance
and pins native scrolls once the sheet takes over: normalized residual40.
The maintained adapter now gives the same selected native-source travel to
each selected vertical scroll coordinate and clamps each independently.
The maximum distance actually tracked by those coordinates consumes the one
travel budget. Only its residual is offered once to the sheet.

For a monotone down sequence, each selected distance evolves as
`remaining_i = max(0, initial_i - cumulativeDown)`. Consequently the residual
over the sequence is `max(0, cumulativeDown - max(initial_i))`. The actual body
derives this per frame from current native offsets; it does not take a maximum
of unrelated events and does not compare timestamps or equal float values.
Thus child30,parent20 with `[-15,-15,-40]` yields:

- After the first frame: child15, parent5, sheet0.
- After the second: child0, parent0, sheet0.
- After the third: child0, parent0, sheet40.

On reversal, upward input restores the partial sheet first through the existing
bounded remainder callback. Each selected native coordinate then receives the
same remaining content travel and clamps to its own extent. This uses current
offsets after each clamp rather than retaining an obsolete start threshold.
Geometry or command-generation changes during an ancestor's runtime callback
invalidate the old plan and its notice-specific correction guard before any
old circular write or deepest event return. An independent newer controller
command keeps its own generation and is allowed to execute.

The exact private terminal seam is:

```cpp
enum class SheetInteractionEndReason {
    Ended, GestureCanceled, LifecycleCanceled
};
```

`binding.end(session, velocityClosedwardVpPerSec, reason)` is native-private;
no JS/generated ABI changes. Native UP/END/WILL_STOP uses Ended. A valid native
touch/pan cancellation uses GestureCanceled with only a previously captured
finite velocity, or explicit zero if no sample exists. The backend does not
query the undocumented CANCEL velocity field. Multitouch interrupts the
single-finger session using GestureCanceled/zero. Unbind, root loss, input
disable, background and shutdown use LifecycleCanceled/zero. An invalid owner
cannot become a stale gesture dismissal.

WILL_STOP's scalar native release speed borrows its sign only from a finite,
nonzero motion sample captured by this current touch/pan session, following
the existing ScrollMotion.release direction pattern. With no sample, zero,
negative zero or nonfinite captured motion, the explicit velocity is zero.
The `scalar-release` control supplies native speed800 with each of those
states and with proven positive/negative motion. It now exercises the actual
NativeScroll.event WILL_STOP delivery body. CANCEL never queries its velocity
field. No fixture establishes the SDK's event ordering.

Main owns the actual host callback and its policy tests. For the route host,
Ended and GestureCanceled use the same strict +/-600 flick rule, otherwise
nearest detent, with an exact midpoint choosing closed (closed index first).
LifecycleCanceled restores open when the owner is still valid and is inert
after retirement. The service sheet's 80/800 rule is not substituted.
The backend fixture transports literal positions49/50/51 and velocities
-601/-600/-599/0/599/600/601 through real END and CANCEL handlers without a
duplicate snap-policy model. Main's actual-host fixture asserts the decisions.

The pre-MAX SUM source is immutable at
`/tmp/valdi-sheets-20261103/backend-max-prefix/receipt.json`, SHA256
`65dd74438cee8e22bbfc72408041aa1b3451bde46a54b7fd4d9137224cb836ec`.
It contains the two P2 source candidates before MAX/private-reason changes;
it was not compiled or validated by the child. The original c1f0ab freeze,
da719928 pre-P2 snapshot, and paused-partial audit remain immutable separately.

`sheet-backend-max-native.cpp` uses the SAME real-body extraction and SDK
boundary as the P2 regression fixture. Generic callback reason adapters allow
the same source to compile against historical bool headers and the new enum.
Run separate SUM baseline cases `literal`, `unequal`, `equal`, `multiframe`,
`equal-frames`, `reverse-before`, `reverse-after`, `callback-geometry`,
`callback-primary-geometry`, `terminal-vectors`, `cancel-reasons` and
`scalar-release` to retain
meaningful REDs. Controls and the zero-edge case can pass on SUM. Fixed app and
fork must pass `all`. Run both P2 and MAX fixtures serially, never concurrently.

The `admission`, `exclusive` and `mount-context` controls use the current
actual production admission/mount bodies. They cover handle/empty-panel
dragging, logical-vp normalization, source separation, rejected begin,
Refresh/editor/native picker priority, the exact hostParent-mounted wheel
extension, context rejection and root mount identity. The wheel implementation
is included unchanged and its builtin recognizers are not replaced.

For MAIN ONLY, use the clang invocation in sheet-backend-p2.md, substituting
the desired generated selector and `sheet-backend-max-native.cpp`. Prepared
selectors now use fresh directories `backend-round3-generated-prefix-app/fork`
(db89 pre-reenable snapshot), `backend-round3-generated-sum-app/fork`
(pre-MAX SUM), and `backend-round3-generated-fixed-app/fork` (final).
No compiler or C++ fixture was run by this delegated child.

The original cancelNewDrag fixture, its db89 source freeze and the parent's
failed log remain preserved. That fixture committed the leaf native offset
without a DID_SCROLL notification, then called lifecycle NativeScroll.cancel
directly after raw CANCEL. The parent's diagnostic confirmed native0/cached30
became native30 when cancel wrote the cached offset; begins2 then left sheet0.
A separate diagnostic sample isolated that boundary but did not validate
SDK ordering. The corrected ordinary case explicitly delivers actual
NativeScroll.event DID_SCROLL, raw CANCEL, DID_STOP_DRAGGING and SCROLL_STOP,
then asserts native interaction enabled before admitting the next drag.
It changes no allocator or production cancellation physics. A distinct
lifecycle cancellation before DID_SCROLL remains OPEN.

Actual event extraction also includes production scrollInputRoot and
scrollDragCurrent. Editor-blur and descendant raw-cancel collaborators are
explicit fail-if-entered boundary seams; fixture controls disable those
features. Their behavior is not simulated or claimed validated. Re-enable
after lifecycle disable uses the actual touchEnabled setter and subtree
property reconciliation; own-disabled child controls remain disabled.

The new normalization matches the stated edge/MAX+pin panel-budget contract.
It does not prove identical native scroll inertia, simultaneous-recognizer
ordering, pointer interception, native edge-bounce behavior, transformed or
inverted UIKit scroll parity, or SDK release ordering. The Harmony adapter
supports the declared logical-vp vertical contract. Actual device traces must
still establish that the selected deepest FRAME_BEGIN source supplies the
whole admitted touch travel at the edge and that selected ancestors do not
independently apply it. No timestamps or synthetic event IDs establish that.
