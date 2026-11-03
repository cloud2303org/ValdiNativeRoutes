# Existing dismissKeyboardOnDrag parity

`dismissKeyboardOnDrag` is a Boolean scroll attribute, defaulting and resetting
to `false`. When true, an accepted native
`NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING` blurs the already focused editor in
the scroll's mounted root before raw-touch cancellation and `onDragStart`.
Duplicate drag notifications, native `SCROLL_START`, wheel/programmatic motion,
disabled/suspended/retired or unmounted scrolls do not initiate a blur.

The reference is the sibling `/Users/cloud/project/NativeRoutesHarmony`:

- `node_modules/@react-native-oh/react-native-harmony/Libraries/Components/ScrollView/ScrollView.js:1296`
  dismisses before the begin-drag callback.
- `Libraries/Components/ScrollView/delegates/BaseScrollViewDelegate.ts:29`
  selects the existing `on-drag` policy.
- `Libraries/Utilities/dismissKeyboard.js` calls
  `TextInputState.blurTextInput(TextInputState.currentlyFocusedInput())`.
- `ohos/oh_modules/@rnoh/react-native-openharmony/src/main/cpp/RNOHCorePackage/ComponentInstances/TextInputComponentInstance.cpp:742`
  calls the node's `setFocusStatus(0)`.
- `RNOH/arkui/ArkUINode.cpp:1116` writes `NODE_FOCUS_STATUS=0`.

Official Valdi Android `ValdiScrollView.kt:504` blurs before drag-start
notification. iOS `SCValdiScrollView.m` configures
`UIScrollViewKeyboardDismissModeOnDrag` for its immediate dismissal mode.
The existing shared `FormPage.tsx:54` already requests this Boolean attribute.

Harmony traverses only the owning scroll's mounted root, under the same
backend. This includes a focused sibling editor. It snapshots one strongly
retained input/node identity and verifies active editor state, native focus,
root membership and liveness before calling the existing
`NativeTextInput::focus(false)`. It does not stop or retire the input lifecycle.

SDK26 `native_node.h` documents that setting `NODE_FOCUS_STATUS=0` can shift
the page's **currently** focused component to its root. Stopping editing can
synchronously run an edit-end callback that focuses a replacement. A temporary
per-node `scrollBlurCurrent` guard therefore fences the focus-clear write inside
the existing `focus(false)` call. The guard rechecks the exact drag epoch,
scroll/input ownership, root, liveness, eligibility and current native focus.
The veto applies only to the original editor identity at the exact
`focusGeneration` expected from this scroll's `focus(false)` (the captured
generation plus one). A later explicit focus operation or a rebound editor
owns its native writes, even while the temporary predicate remains installed.
For example, an edit-end callback may disable/remove the scroll, leave its
sibling editor mounted, and explicitly blur that editor. That nested blur must
still clear native focus. A replacement node focused by edit-end remains
protected from the original scroll call's page-wide clear.
It restores any prior guard on normal return and exceptions. The protected
`NativeTextInput.inc` and `InputState.hpp` are unchanged.

The scroll event also rechecks that same drag epoch and mounted root after blur,
before consuming raw-touch terminals, before their delivery, and before draining
scroll callbacks. A replacement drag is never treated as the original drag.

## Focused proof

Run with SDK26's `native/sysroot/usr/include` as `SDK_INCLUDES` and an external
output directory:

```sh
python3 tests/verify-scroll-dismiss-keyboard.py \
  --sdk-includes "$SDK_INCLUDES" --output /tmp/dismiss-green --negative-controls
python3 tests/verify-scroll-dismiss-keyboard.py \
  --backend /tmp/preserved-original-backend --original-red \
  --sdk-includes "$SDK_INCLUDES" --output /tmp/dismiss-red
python3 tests/verify-scroll-dismiss-keyboard.py \
  --backend /tmp/valdi-scroll-dismiss-keyboard-20261103/frozen/app \
  --focus-operation-red \
  --sdk-includes "$SDK_INCLUDES" --output /tmp/dismiss-p2-red
python3 tests/verify-scroll-dismiss-regressions.py \
  --sdk-includes "$SDK_INCLUDES" --output /tmp/dismiss-regressions
```

The original-source run deterministically fails the binding, descendant-editor
drag and sibling-editor drag expectations. The fixed run executes 51 scenarios
under ASan/UBSan. The prior frozen implementation still passes all original 45
cases and three added controls, and fails three independent-blur repros:
scroll disabled, scroll removed, and editor rebound on the same node. The six
added cases also cover explicit blur while the scroll stays active and
replacement-node focus after scroll disable/removal.
Six extracted-production mutation controls (eight failing scenarios) prove detection of
a missing post-blur guard, unsafe page-wide focus clear, incorrect reset,
missing exact drag-generation check, missing raw-delivery reentry check, and
loss of the exact focus-operation scope.

The focused seam executes verbatim production scroll admission/events,
attributes/properties, journal/drain, editor `focus`/`valid`/`activate`, and
`Node::integer`/`set`/`live` bodies. SDK declarations are real. Native focus and
edit-change delivery, lifecycle invalidation, raw-touch terminals, Valdi
callbacks/values and tree locking are adapted boundaries. It does not execute
ArkUI's IME implementation or the full editor event receiver. This is host
production-body evidence, not device acceptance.

The regression runner executes the existing Scroll/Refresh production-body
tests and scroll/input state tests. Its external copy of the existing adapted
Node boundary gains only the new `scrollBlurCurrent` field; original test files,
expectations and extracted production bodies remain unchanged.

`tests/compile-scroll-dismiss-managers.py` replays saved manager-only SDK26
compiler commands against current real fork headers for both app and fork,
x86_64 and arm64. It saves fresh commands, dependency hashes, objects and logs,
and checks the global native slot before each invocation. It performs no
runtime/archive/application link, HAP build, code generation or device work.

The frozen evidence for this change is
`/tmp/valdi-scroll-dismiss-keyboard-20261103/freeze-receipt.json`.
The superseding P2 evidence is
`/tmp/valdi-scroll-dismiss-keyboard-p2-20261103/freeze-receipt.json`;
it seals fresh source/test/runner snapshots, RED/GREEN results, mutation
controls and four current-header SDK26 manager objects. The original receipt
and its entire evidence directory remain unchanged.
Earlier app53/fork74 receipts are preserved as historical evidence. Current
source differs from those frozen inventories; no old receipt is rewritten and
no current HAP or device fix is claimed.
