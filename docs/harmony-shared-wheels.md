# Shared inline wheels on Harmony

The existing `ColumnPicker`, `TimePicker` and `TreePicker` components now select
`ArkUIColumnWheelView`, `ArkUITimeWheelView` and `ArkUITreeWheelView` on Harmony.
This implements the inline direct-object `config` contract. Column/time callbacks
receive a string; tree callbacks receive a direct string array. Legacy string
configurations are rejected.
Presented AppUI dialogs and route sheets have separate owners.

## Shared source and compiler compatibility

`WheelPickers.tsx` keeps static `iosClass` and `androidClass`. A class-only,
typed dynamic spread follows them, before style, config and callback:

```tsx
iosClass="VRColumnWheelView"
androidClass="io.valdiroutes.app.ColumnWheelView"
{...harmonyWheelClass('ArkUIColumnWheelView')}
```

The helper uses the existing `Device.getSystemType()` API and
`String(...) === 'harmony'`. Existing Android/iOS bootstrap archives do not
remove `harmonyClass`, so it must not appear in any static prototype, including
an untaken JSX branch. On those platforms the dynamic spread is empty. Harmony
starts with a Deferred custom view and receives its dynamic class before config.

Both the consumed companion compiler and maintained fork reject
`viewFactory` combined with a static `harmonyClass`, in either attribute order.
No shared JSX declaration augmentation or generated binding edits are needed.

The compatibility test compiles the actual three components and schemas against
the immutable MODULE pin and a scratch archive of that pin transformed by the
actual platform script. It supplies explicit real type roots, executes debug
and minified output using the packaged Android AAR/iOS framework bootstrap,
Renderer, NodePrototype and PropertyList implementations, and records the native
boundary. It checks controlled rerender identity, dynamic attribute order,
callbacks, and the real lazy visibility/key/ref contract under both transformers.
It does not rebuild or stage platform artifacts.

## Backend ownership and selection

`WheelState.hpp` owns canonical public values, calendar arithmetic, tree
normalization and pending/acknowledged echoes. `NativeWheel.inc` owns the actual
SDK controls, registrations, immutable control generations and array lifetimes.
`NativeWheel.hpp` declares the private component and its bind-time class mapping.
The wheel uses a dedicated concrete wheel delegate;
the generic per-update component dispatch is not expanded.

The local backend binds `config` as an untyped Valdi attribute and validates its
map/array fields into the wheel domain model. No JSON reader/writer is used by
this boundary or its echo comparison. Tree echo keys retain a vector of strings.
The canonical exported models describe the same fields, but this backend does
not invoke their generated `CppMarshaller` methods: the standalone backend
links only runtime/SDK libraries, while app-specific `app_pages.cpp` belongs to
the enclosing app host. Requiring it here would couple the reusable/fork backend
and its bounded probe to application schema registration. That integration is
not included in this scoped migration. The fork copy must be synchronized by
the parent before building a profile that selects it.

Each visible logical column is an SDK26 `ARKUI_NODE_TEXT_PICKER`. Labels use
`OH_ArkUI_TextPickerRangeContentArray_Create/SetTextAtIndex/Destroy` and
`ARKUI_TEXTPICKER_RANGETYPE_RANGE_CONTENT`; punctuation remains literal text.
Embedded NUL strings are rejected. Arrays and owning label strings survive the
native node. `OPTION_SELECTED` getters and event indices are checked, looping
is disabled, and row height is 40 points.

The SDK's `NODE_TEXT_PICKER_EVENT_ON_CHANGE` updates only tentative interaction
state. Only a stopped selection from a current immutable control can commit.
No finger-up, timer, debounce or permanently touched flag substitutes for
`NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP`.

Configuration is validated into a candidate model and all new controls are
allocated, configured and mounted before committed state changes. Malformed
configuration and native allocation/mount failure retain the previous state and
controls. Config reset replaces the model with an empty state, invalidates the
old generation and retires controls through deferred disposal. It clears
selection/config/echo history while preserving the separately bound callback;
callback reset clears only the callback.
Callback-only changes and acknowledged controlled echoes do not rebuild.
Structural changes reset the echo scope.

The calendar uses integer Gregorian fields, supports years 1000 through 9999,
and clamps months/days without timezone conversion. It preserves year,
year-month, date, time and datetime formatting, including 1900/2000/2100 leap
rules. Datetime has a 44-point date/time segment row above 200-point wheels;
segment changes do not emit a selection. Native custom-node measure/layout
explicitly measures and positions the owned controls in pixels.

Trees resolve duplicate values by first match. A changed parent discards its
suffix and normalizes all descendants in one commit. Selecting a duplicate
parent with the same public value silently restores its canonical row while
preserving the valid suffix.

Selection commits state and pending echo before retaining/invoking the callback.
Callbacks are checked for owner teardown and may synchronously reconfigure,
remove, rebind or close their owner. No native SDK access follows user code.
Detach/background retires motion and event generations without inventing a
selection; remount creates fresh controls from the committed model. Logical
rebind clears callbacks and echo history. Retirement unregisters before unlink
and queues control/userdata/array disposal beyond active native callback,
measure and layout frames.

## Scroll admission and future sheet seam

`WheelArbitration.inc` reads SDK26 touch-recognizer ownership in the interruption
callback. Backend-owned Scroll/Refresh handles reject their own recognizer when
the touch-test chain belongs to a live descendant wheel. The wheel's built-in
recognizers continue; no borrowed node/recognizer is mutated. Ordinary
Scroll/Refresh admission is preserved. The parent never starts scrolling and
then compensates its offset.

The existing custom-root RootPan/Drag admission also consults this classifier
before calling the host admission callback. It is identity-scoped to the
backend's current mounted logical subtree, not a global touched bit or a cached
screen rectangle. This can be reused by a future sheet rooted in that subtree.
A sheet whose page is mounted through a separate `hostParent` root will need a
private backend seam that additionally resolves the explicitly owned mounted
root identity; logical `children` traversal alone does not cross that boundary.
The sheet owner must not infer wheel ownership or mutate borrowed ArkUI nodes.
This change does not implement the sheet.

## Reproducible bounded proof

Native compilation requires the parent's shared serial slot. On November 3,
2026 the parent granted the slot after iOS tests and Android prebuild stopped.
The direct-object host probe passed with all 11 negative controls caught; see
the receipt below. Earlier proof receipts apply to the prior contract.
Every compiler/link command performs a global native-process scan.

```sh
WHEEL_PROOF_DIR=/tmp/valdi-wheel-20261103/js-sealed \
  tools/valdi-rolldown/node_modules/.bin/tsx --test \
  tools/valdi-rolldown/wheel-platform-compat.test.ts

python3 harmony/entry/src/main/cpp/backend/tests/verify-wheel-native.py \
  --output /tmp/valdi-wheel-20261103/host-sealed --negative-controls \
  --flow /tmp/valdi-wheel-20261103/js-sealed/harmony-native-flow.json

python3 harmony/entry/src/main/cpp/backend/tests/verify-wheel-sdk.py \
  --output /tmp/valdi-wheel-20261103/sdk-sealed
```

Use a new output directory when replaying. The host probe freshly compiles the
bounded current-fork Value/JSON/callback support set with ASan/UBSan;
JSON remains only as test-fixture notation and serialized replay-file input; it never
links an old Context archive. Its optional support reuse accepts only this
probe's hash-verified freshly compiled support. The test runs production wheel,
Node, input and arbitration bodies against real SDK declarations and real Valdi
values, with explicit ArkUI/UI-dispatcher boundary doubles.

The recorded Harmony compiler/Renderer flow is replayed through the maintained
production default class binding and `ViewNode::setViewClassNameForPlatform`
body before real wheel configuration. The surrounding tree/factory lifecycle
is an explicit host adapter. This is not full native-runtime execution.

The same host test source catches independent mutations of programmatic
admission, tentative settlement, callback reset, structural/pending echoes,
stale controls, native-frame disposal, calendar clamping, tree suffixes,
ancestor admission and Deferred platform resolution. The JS RED and GREEN
runs likewise retain the identical test source and preserved baseline inputs.

The SDK probe compiles both full current managers and the real consumer for
both ABIs, asserting the 616-byte current `IJavaScriptContext` ABI. It forms
manager/consumer relocatable closures and links all wheel SDK imports strictly
against the existing `libace_ndk.z`, using the real SDK declarations. Those
strict SDK links are not an application or complete runtime link.

Protected input/label implementations, public manager headers, CMake, shared
generated bindings, pins, staging scripts and the sibling reference remain
outside this change. Evidence is frozen separately from earlier historical
receipts. Rendering, real gesture behavior, fresh application/HAP integration
and device parity remain separate validation steps.

## November 3 source freeze

The receipt root is `/tmp/valdi-wheel-20261103`. `freeze-receipt.json` inventories
the exact owned sources, before/after deltas, proof receipts and protected hashes.

* `js-sealed`: 3/3 compatibility tests pass. `js-identical-sealed-red` uses the
  identical test hash with preserved baseline wheel/compiler inputs and fails
  the two intended missing-class/conflict cases.
* `host-sealed`: current production passes and all 11 independent mutations
  fail the same test source. All 63 support translation units were compiled
  fresh from current sources. `fork-host-sealed` passes the same production
  host/replay checks using that hash-verified support.
* `sdk-sealed`: app/fork full managers, consumer objects, relocatable closures
  and strict SDK wheel import links pass for both x86_64 and arm64.
* `regressions-sealed`: existing Refresh checks (19 cases), Refresh/Scroll
  checks (9), Scroll keyboard-dismiss checks (59), and unchanged scroll/input
  state tests pass. The scratch legacy seam gains inactive wheel fields/hooks;
  original production bodies and assertions remain intact.
* The existing real JSX compiler regression suite passes 26/26 tests.

The public manager header and protected editor/label files match their task
baseline in both backends. Parent-owned sheet source changes to `Index.ets` and
the native module declaration are outside wheel ownership and are recorded
separately from the original media baseline.

## Retouch settlement correction

The first independent source review found that another DOWN before a pending
native scroll stop cleared its tentative index. The sequence
`DOWN → CHANGE(b) → UP → DOWN → STOP(b)`, with the getter still at `b` and no
second CHANGE, could therefore leave native `b` with committed `a` and no
callback. This was a static finding, subsequently reproduced in the production
host fixture; it was not a device reproduction.

`WheelInteraction::begin()` now preserves an already armed interaction. A fresh
interaction still starts without a tentative index; accepted STOP, CANCEL and
control-generation retirement retain their existing invalidation behavior.
The fixture additionally checks cancellation between touches, replacement
controls, successive completed gestures, returning to the committed value, and
absence of permanent authorization after a completed gesture.

The supplemental receipt is
`/tmp/valdi-wheel-retouch-p2-20261103-hj35mac9/freeze-receipt.json`.
The identical fixture fails the retouch case against the original header while
its three isolation/completion controls pass, then passes against the corrected
header. The full existing ASan/UBSan host suite and all 11 mutation controls
also pass their expected outcomes.

This supplemental proof uses the frozen pre-sheet backend seams from the
original 31-file receipt, the corrected header matching both live backends,
and the revised fixture matching both live copies. The surrounding default
class bodies and extraction helpers are frozen and inventoried. Support-cache
reuse verifies all 511 original source/header inputs and its archive hash.
Concurrent parent-owned sheet edits to manager/scroll sources are recorded
separately and are not compiled or validated by this proof. No SDK whole-manager
recompile, application/runtime link, HAP or device run accompanies this fix.
The original receipt and its artifacts remain unchanged.


### Direct-object migration validation receipt

The following fresh probe completed with exit 0 in the parent's exclusive slot:

```sh
python3 harmony/entry/src/main/cpp/backend/tests/verify-wheel-native.py \
  --output /tmp/valdi-picker-object-contract-20261103/harmony-host-fresh \
  --negative-controls \
  --flow /tmp/valdi-picker-object-contract-20261103/harmony-native-flow.json
```

The current production test passed; all 11 negative controls exited 75 with
regression assertions. The receipt is
`/tmp/valdi-picker-object-contract-20261103/harmony-host-fresh/receipt.json`;
`commands.json` and per-command logs are alongside it. The run recorded 100
commands, 697 input hashes and 88 output artifact hashes. Support objects were
freshly compiled, with no `--support-from` reuse.

Dependencies are the current fork at
`/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102`,
SDK26 headers, the bounded source recipe in
`/tmp/valdi-appui-media-p2-20261103/native-green/receipt.json`, and existing host
fmt/jsoncpp libraries under `harmony/business-build/.artifacts/host/deps`.
No new generated-code dependency was introduced.

Tests pass actual map/array Values through `applyWheelAttribute`. Additional
fixtures are constructed directly without a JSON parser. Coverage includes
legacy string rejection, wrong field types, nonintegral/boolean/infinite column
counts, null children, depth-limit rejection, a 13-level tree, literal special
characters, direct-array synchronous echo/retirement, stale branch events, and
deep-tree detach/remount. Existing calendar, allocation failure, callback owner,
receiver lifetime and negative-control tests remain in the probe and passed.
This proves host execution of extracted production bodies with real Valdi Values
and SDK declarations, including the parent's compiler/Renderer object-flow
replay. It does not prove a whole-manager build, HAP, or device execution.

The maintained fork was not mutated. Before building with
`VALDI_HARMONY_USE_FORK_UI_ASSETS=ON`, the parent must narrowly synchronize
`NativeWheel.inc`, `NativeWheel.hpp` and `WheelState.hpp` to
`valdi/harmony/arkui` in that fork; all three still differ. Local-backend builds
select the updated local implementation. The parent-owned sheet source-integrity
check also pins older wheel source/test hashes; its authorized-change accounting
needs updating separately rather than changing the historical receipts.


### Config-reset review follow-up (final host verification passed)

After the direct-object host receipt above, review identified an old reset bug:
configure A, DOWN/CHANGE, reset config, bind callback B, then an old SCROLL_STOP
could deliver A's selection to B. Config reset now uses `replace(WheelState{})`,
which clears config/selection/echo state and invalidates/retires old controls
without resetting `onChange`. Activation cannot restore the removed config.

The former no-op expectation was removed. The host regression now exercises
callback binding before/after reset, both subsequent callback/config application
orders, a stale scroll-stop before and after new configuration, pending echo
clearance, and direct tree path clearance. The probe adds a `config-reset`
negative control that restores the old no-op. After Android build/tests finished,
the parent granted the exclusive native slot and the following fresh run passed:

```sh
python3 harmony/entry/src/main/cpp/backend/tests/verify-wheel-native.py \
  --output /tmp/valdi-picker-object-contract-20261103/harmony-reset-fresh \
  --negative-controls \
  --flow /tmp/valdi-picker-object-contract-20261103/harmony-native-flow.json
```

The current production test exited 0; all 12 negative controls exited 75 with
regression assertions. In particular, restoring the no-op failed with
`REGRESSION: config reset delivered old selection to new callback`.
The final receipt is
`/tmp/valdi-picker-object-contract-20261103/harmony-reset-fresh/receipt.json`.
All 705 recorded input hashes and 90 output hashes were rechecked after the
103-command run. The five prepared production/test hashes also matched.
`/tmp/valdi-picker-object-contract-20261103/harmony-reset-final.json` records the
final receipt hash, canonical source/destination paths and authorized-change
hash inputs for parent synchronization. Support was freshly compiled, no source
fixes were needed during the run, and the native slot was released. The original
object-flow file was replayed unchanged. Whole-manager/HAP/device proof remains
outside this host probe.

The non-touch/a11y concern predates this migration. At review, the complete
`NativeWheel::event` body matched the untouched maintained-fork file at
`/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102/valdi/harmony/arkui/NativeWheel.inc`.
The fork's lines 318 and 322 respectively arm on `UI_TOUCH_EVENT_ACTION_DOWN`
and reject picker notices when `interaction.armed` is false. Its file SHA256 was
`a55c0a6b3983b747c983cb3ad1826a2e47c49821f323566344982284989c68bf`;
the identical event-body SHA256 was
`cac2a0e625daa04826534daf9ef74016e57c0bc571a4e71ca595701434f8b3ad`.
This establishes the source baseline, not a device accessibility result. The
armed guard remains unchanged; no new user-origin semantics are assumed.

With the final fix host-verified, the parent owns synchronization of only the
three production wheel files identified above, with canonicalized source and
destination paths, and authorized source-integrity hash accounting for the
changed wheel sources/tests. Do not rewrite historical receipts or automatically
copy the whole backend.
