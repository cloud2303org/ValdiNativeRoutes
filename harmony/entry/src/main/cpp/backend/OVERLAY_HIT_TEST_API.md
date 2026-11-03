# Root-scoped overlay hit testing

```cpp
void ArkUIViewManager::setRootHitTestPassthrough(const Ref<View>& root, bool enabled);
```

This host API is **UI-only**, validates manager ownership and root identity,
and can be called after root creation/sizing before or after mounting. It adds
no business property, layout behavior, measurement, or tab bar architecture.

Enable it on the business Valdi custom bar's full-viewport root. The ArkTS
ContentSlot wrapper must also allow sibling hit testing (the tab integration
uses its own `HitTestMode.Transparent`). The host's shell remains responsible
for its own wrapper policy.

## Why root TRANSPARENT alone is insufficient

Actual SDK 26 `arkui/node_attributes/common_attributes.h` documents:

- `DEFAULT`: self and children hit, sibling hit testing is blocked.
- `TRANSPARENT`: self and children hit, siblings also hit.
- `NONE`: self is skipped, children remain eligible.
- `BLOCK_HIERARCHY` (API 20): hits stop lower-priority sibling/ancestor paths.
- `BLOCK_DESCENDANTS`: self and descendants do not hit.

Making only the root transparent permits page and bar recognizers to both
join one touch. Making only the root NONE leaves full-size, DEFAULT child
layouts able to block empty regions.

The backend applies a policy **only inside the enabled root**:

1. Empty wrappers, layout nodes, labels/images/shapes without actions use NONE.
2. The first consuming gesture/raw-touch/input/scroll/root-drag boundary uses
   BLOCK_HIERARCHY. Its descendants keep ordinary behavior.
3. `hitTest` alone is a filter; it is not a consumer. A full-viewport root can
   restrict traversal to the bar bounds without becoming a viewport target.
4. `touchEnabled=false` keeps the existing BLOCK_DESCENDANTS/disabled behavior.

OpenHarmony's `FrameNode::TouchTest` propagates a child's BLOCK_HIERARCHY result
through NONE ancestors and stops sibling traversal. It skips self collection
for NONE, yielding no target in empty regions. Its
`TriggerOnTouchIntercept` installs the intercept result on the node, so the
backend restores the scoped mode on every admitted interception. A rejected
custom hitTest keeps the existing BLOCK_DESCENDANTS result; the next accepted
hit restores the proper policy instead of leaving the node in a stale mode.
These source observations corroborate the SDK contract; installed runtime
execution is still required to confirm full host/native composition.

The root flag persists across mount/unmount and applies to later descendants.
Insertion/reparent, detach, surviving children after parent disposal, gesture
availability/raw callback changes/resets, touchEnabled, and root drag observer
changes recompute the policy. Removing the flag or moving a subtree elsewhere
restores normal modes. No gesture recognizer is replaced just to change this
policy, preserving the existing accepted-gesture lifecycle.

The host helper tests exercise the production policy's scope, boundary,
disabled state and restoration decisions. SDK compilation proves the native
modes and intercept API exist for both ABIs; it does not execute an input path.
Parent QA must check empty-area page taps, actual bar taps without page
activation, nested layouts, disabled/rebound gestures, root predicate reject
then accept, and custom/system bar transitions.
