# Native gesture integration

The canonical public-property and event contract is
[Harmony–Valdi native gesture bridge](../../../../../../docs/harmony-gesture-capabilities.md).
It documents all 30 public properties, native configuration, reset/update
behavior, conversions, callback lifetime, and validation limits. This
README-linked page retains the host-only RootPan and mounting instructions.
Earlier UIKit/coordinator policies in this file are superseded by that native
bridge contract.

## Host-only root drag observer

The internal host API is declared in `ArkUIViewManager.hpp`:

```cpp
RootDragObserver observer;
observer.admit = [](float x, float y, float dx, float dy) -> bool {
    return x <= 24 && dx > 0 && std::abs(dx) > std::abs(dy);
};
observer.onEvent = [](const RootDragEvent& event) {
    // phase: RootGesturePhase::{Started, Changed, Ended, Cancelled}
    // x/y: current position; dx/dy: displacement from DOWN
    // velocityX/Y: points per second
};
manager.setRootDragObserver(root, std::move(observer));
manager.setRootDragObserver(root, {}); // cancel and unregister
```

Observer callbacks run on UI. `admit` runs synchronously at native PAN
admission, with the original root-local DOWN x/y and current displacement.
Return false to reject this root observer's candidate. The PAN uses native
NORMAL priority; ArkUI owns competition with descendants and native controls.
The host gates route transitions, edge zone, direction, and whether back is
currently possible. This internal native API adds no TS props. Observer
coordinates follow physical root direction, independent of RTL; public JS
coordinates use the Valdi logical conversion described in the canonical doc.

An accepted sequence emits Started, zero or more Changed, then Ended or
Cancelled. Retiring an active observer consumes its sequence before invoking
Cancelled, allowing callbacks to unregister without duplicate terminals.
The host owns navigation stack mutation, visuals and system edge policy.
Keep the UI dispatcher, UIContext and captured host state valid through
unregistration, shutdown and the subsequent native/UI event-flow drain.
Clearing a native callback is not a memory fence.

## Root mounting

`mountRoot(root, content, int index)` inserts only that root using
`OH_ArkUI_NodeContent_InsertNode`. Use `mountRoot(incoming, content, 0)` to
reveal a previous page below an outgoing page without detaching the outgoing
root or interrupting its PAN. The original two-argument overload still appends.
The host keeps NodeContent and its native parent valid until `unmountRoot()`
returns, and keeps the dispatcher/UIContext valid through deferred cleanup.

## Native bridge policies

These reminders summarize the canonical document; new public behavior should
be documented there rather than maintained as a second contract here.

- Omitted/reset/explicit-zero `longPressDuration` passes native zero, requesting
  SDK26's 500ms default. Positive seconds round upward to checked int32
  milliseconds. Negative, nonfinite and out-of-range values are rejected.
  A duration change replaces only the LongPress leaf and may cancel its
  in-flight recognition. There is no original-DOWN rescheduling promise.
- Native count2 timing applies. The native exclusive group orders DoubleTap,
  LongPress, Tap, then the native parallel Drag/Pinch/Rotate subgroup. Groups
  use NORMAL priority/mask; there is no custom 150ms or cross-node winner ledger.
- `hitTest` filters the native response region. It does not create an unbounded
  region. Touch-area edges are physical and do not swap in RTL. Percentage
  response regions currently cannot extend a zero-sized dimension.
- `eventTime` comes from the runtime monotonic clock in seconds. Native geometry
  is converted to Valdi logical units; rotation is radians. Pointer arrays omit
  lifted/cancelled touches; derived gesture pointers use index identities.
- Both gesture predicates and `hitTest` use the bounded 250ms synchronous call
  and Valdi Boolean coercion. Errors, timeout or owner teardown reject.
  Subsequent actions read the current handler. Handler/predicate replacement
  preserves its leaf; availability changes affect the corresponding leaf.
- Native disposal invalidates its routing identity before calling the SDK.
  Retired callback userdata remains inert and retained through platform
  lifetime, including cached callbacks and failed clears. Raw callbacks use
  stable weak tokens. The platform must outlive the drained native event flow.

Recognition thresholds, timing and parent/Scroll competition belong to ArkUI.
The focused host fixture exercises the actual compiled bridge and recorded SDK
boundary; two-ABI object/import checks establish build compatibility. Neither
proves physical recognition or production device Scroll arbitration. See the
canonical document and its sealed receipts for exact validation results.
