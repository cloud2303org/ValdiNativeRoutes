# Embedded picker Views and object properties

The Valdi `ColumnPicker`, `TimePicker` and `TreePicker` interfaces are unchanged.
Their Android custom views now use a native `ViewGroup` containing Canvas wheel
columns rather than a `ComposeView` and `LazyColumn` per picker.

The subsequent Android popup migration also replaces the Column, Time and Tree
picker bodies in Sheet, Content and Page presentations. `NativeWheelBody` and
`NativeWheelColumn` are shared with embedded wheels; the tree page uses native
tabs and a recycled `ListView`. Compose remains only in the existing mounting,
header/footer and overlay infrastructure, not in picker controls. Confirmation
samples and settles the visible selection synchronously; cancellation stops
motion without committing it.

The final popup migration build passed with 80 tests passed and 9
JNI-recorder-dependent tests skipped. Atomic date/time settlement samples all
moving columns before a single clamp, shared by embedded segment switches and
popup confirmation. Both focused suites passed all 38 tests.
Build evidence: `/tmp/valdi-wheel-p2-build-retry-20261103.log`.
Preserved APK: `/tmp/valdi-wheel-p2-20261103.apk`, SHA-256
`37c05ccf8f13929c63b071f351d75fb25643604adcf66a5eef7af97794839cf9`.
Runtime validation of this follow-up is tracked separately from the embedded
picker evidence below.

The final APK was transferred to Meizu 20 (`100.76.164.6:5555`), its device-side
SHA-256 matched, and `pm install -r` succeeded at 17:49 on November 3.
The original first-install timestamp remained unchanged. The saved `date-picker`
flow passed on that phone (13 executed steps; four login-branch steps skipped).
The datetime popup was then opened and its native year/month/day columns and
date/time segment controls verified in the accessibility tree. This is a basic
device check, not a measured performance or complete accessibility claim.

On `emulator-5554`, the installed APK hash also matched the final artifact.
`native-popup-final-suite-20261103-emulator` passed twice consecutively with
88 passed, zero failed/errored/skipped steps per run. It verifies popup selection
and confirmation, cancellation retaining the committed value on reopening,
hour/minute changes surviving segment switches, the confirmed datetime result,
and an embedded selection callback. Receipts: `/tmp/native-popup-final-pass1.json`
and `/tmp/native-popup-final-pass2.json`.
The homepage timer produces an idle warning. The embedded swipe retains a
documented coordinate exception because its controls are absent from the
accessible tree; popup gestures use semantic NumberPicker anchors. Simultaneous
in-flight column clamping has unit coverage but was not separately stress-tested
through device gestures.

`NativeWheelColumn` draws the visible rows, owns vertical drags, flings with
`OverScroller`, and commits a selection after snapping. Text ellipsizing uses a
32-entry cache and never measures the entire option collection during drawing.
Date/time segments, five 40dp rows, selected backgrounds, fading, date clamping,
tree dependencies and delayed controlled-value echoes are retained.
Recycling clears callbacks, interaction eligibility, selection and echo state;
detachment cancels motion without delivering a stale animation callback.

The temporary `limitToViewport={false}` experiment has been removed. The final
implementation runs with normal Valdi viewport recycling.

## Object contract

`WheelHost.ts` declares the generated `ColumnWheelConfig`, `TimeWheelConfig`,
`TreeWheelConfig` and recursive `WheelTreeNode` models. The existing schemas
normalize input before `WheelPickers.tsx` sends a data object as `config`.
Column/time callbacks carry strings; tree callbacks carry string arrays.
There is no JSON string encoding or parsing in these active boundaries.

Android binds the object attribute and decodes the exact generated model with
`ValdiMarshallableObject.fromUntyped`. iOS uses generated models through an
Objective-C exception-to-NSError helper; its UIKit wheels remain unchanged.
Harmony accepts and validates Valdi maps/arrays in the reusable backend without
adding an app-specific generated-model dependency. This is structured marshalling,
not a claim of zero-copy transport.

Harmony config reset retires old controls, invalidates events and clears echoes
while retaining the independently bound callback. The three production wheel
sources were synchronized to the maintained fork with before/after hash checks;
the historical source receipts were not altered. Harmony's preexisting touch-DOWN
arming restriction for non-touch adjustments remains unchanged.

## Verification on November 3, 2026

- Android runtime export and final Debug build passed; 67 JUnit tests passed,
  including 22 new wheel logic/cache/reset tests.
- Actual compiler/Renderer contract checks passed for Android, iOS and Harmony,
  both debug and minified output, including recursive object data, direct array
  callbacks, and lazy/key/ref preservation.
- iOS hosted SDK/generated-model tests passed 7 cases, exercising production
  attribute blocks, UIKit picker delegates, malformed-object handling and callbacks.
- Harmony current-body host test and all 12 negative controls passed, including
  the old-config/new-callback reset regression.
- Windows AVD: single-column selection, sheet gesture isolation, tree-array
  callback round trip and date/time segment/minute interaction passed.
- Independent source review found no remaining introduced actionable issue.

The Android tests used `127.0.0.1:15555`, the Windows API36 x86_64 AVD running
the arm64 Debug APK through translation. The Meizu installation was not updated
in this task. The iOS checks are focused hosted tests, not full-app touch QA.
Harmony checks are host execution, not HAP/device execution. TalkBack interaction
was not executed; native accessibility selection descriptions/actions are present.

Reproduction and evidence:

```sh
node scripts/project.mjs android :app:testDebugUnitTest --max-workers=2
WHEEL_PROOF_DIR=/tmp/valdi-picker-object-contract-final-20261103 \
  tools/valdi-rolldown/node_modules/.bin/tsx --test \
  tools/valdi-rolldown/wheel-platform-compat.test.ts
```

The recorded `picker-scroll-profile-20261103` and `wheel-selection` flows cover
the parent scroll and selection. `native-wheel-tree-array-20261103` is a fragment
with an explicit pushed-page/display prerequisite; it retains documented raw
wheel coordinates because Valdi's discovery tree omits the native column rows.

## Performance evidence

The same three parent-scroll gestures, with no active CDP sampling:

- Original Compose with normal viewport recycling: 3 composition initializations,
  39 recompose slices and 6 `AndroidOwner:onMeasure` slices; maximum touch-handler
  slice 1684.83ms.
- Native View with normal viewport recycling: none of those picker Compose slices;
  maximum touch-handler slice 264.90ms.
- The intermediate Compose-retention experiment measured 229.26ms, so this one
  run does not prove the native version faster than keeping every Compose picker
  alive. The native version removes that retention requirement and avoids the
  multi-picker Compose startup work.

Warm frame-timeline maximum was 2084.82ms before and 712.49ms after; the captured
frame counts differ (23 versus 39). Scheduling and emulator GPU transport still
dominate portions of both traces. These are not real-device FPS or latency claims.
The first-entry trace has no picker `Compose:initializeView` or `onMeasure`;
the surrounding Compose tab shell still has ordinary recomposition/layout.

Artifacts are under `/tmp/valdi-picker-profile/` (`native-view-cold.json`,
`native-view-warm.json`, baseline `compare-before.json`, build/install logs and
raw traces). iOS evidence is `/tmp/wheel-object-binding-ios-run1-20261103/`.
Harmony evidence is
`/tmp/valdi-picker-object-contract-20261103/harmony-reset-fresh/receipt.json`.
