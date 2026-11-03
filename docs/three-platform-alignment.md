# Android, iOS and Harmony alignment

The compatibility target is the existing shared application contract on
Android, iOS and Harmony. A Harmony SDK feature is not, by itself, a reason to
add a new application API or component.

This checklist was established on November 3, 2026 from current source. It
does not expand the acceptance of any previously built artifact.

## Contract and implementation boundaries

- Keep one shared TypeScript API, validation path and generated model contract.
  Native adapters implement that contract without changing result fields,
  units, cancellation, error text, callback ordering or ownership.
- Preserve intentional platform options. An iOS-only presentation is not a
  requirement for Android, but Harmony must not be identified as iOS or
  silently execute a different example while displaying the iOS description.
- Native appearance and transitions may follow each OS. Compare the requested
  operation, observable state, completion and lifecycle, rather than requiring
  identical native controls or pixels.
- An exported method that always rejects as unsupported is an implementation
  gap. Its presence in a generated interface is only ABI coverage.
- Source inspection, deterministic tests, SDK compilation, application builds,
  emulator replay and physical hardware acceptance are separate evidence.
  Report each feature at the boundary actually established.

The existing contracts remain authoritative:

- [AppUI Promise results, cancellation and errors](appui-promise-contract.md).
- [Routing, results, platform options and custom tabs](typed-routing-contract.md).
- [Native BLE queue and resource ownership](../valdi/modules/bluetooth/NATIVE_QUEUE_CONTRACT.md).
- [Shared BLE admission after FIFO removal](../tools/valdi-rolldown/bluetooth-execution.md).
- [Current Harmony artifact and acceptance boundaries](../harmony/VALIDATION.md).

## Existing shared application gaps

These take priority over adding optional controls from the official framework.

### Platform identification in the animation example

The previous `RouteAnimationPage.tsx` chose Android or iOS using
`Device.isAndroid()` alone. Harmony consequently received iOS labels and the
full-screen example, while the real options resolver selected the Harmony
branch and ignored the example's iOS-only presentation.

The source correction now preserves the Android and iOS cases, selects the
existing six Harmony presets explicitly, and identifies Harmony as ArkUI.
Full-screen presentation remains an iOS-only menu entry. The focused regression
executes production compiler output, Router/payload handling and the actual
options resolver: before the change, 16 cases passed and eight failed; after
the change, all 24 cases plus three existing option tests passed. This is source
and navigation-contract validation, not a newly packaged application replay.

A subsequent direct-parameter probe found that callers could still enter an
unavailable example through the shared string-valued route parameter, bypassing
the menu. Inherited object properties such as `constructor` also reached the
example lookup. Six extra cases failed while the original 24 still passed.
The lookup now checks the current platform's available examples first and
otherwise renders the existing available menu. All 30 focused cases plus the
three existing option tests pass. The direct-boundary receipt and unchanged
prior evidence are preserved under `/tmp/valdi-route-boundary-followup-ieos1xoy`.

Sources: [animation page](../valdi/modules/app_pages/src/RouteAnimationPage.tsx),
[options resolver](../valdi/modules/app_pages/src/navigation/options.ts) and
[regression](../tools/valdi-rolldown/route-animation-parity.test.ts).

### Form keyboard behavior

The shared [FormPage](../valdi/modules/app_pages/src/FormPage.tsx) already sets
`dismissKeyboardOnDrag={true}`. Android and iOS implement this property;
Harmony's previous native scroll-specific bindings did not implement it.
Host resize and the shared
[FocusScroller](../valdi/modules/app_pages/src/FocusScroller.ts) cover a
different part of the form's behavior and do not establish drag dismissal.

The current app and fork implementations now bind the Boolean with default and
reset `false`. Only an admitted native drag selects an already focused editor
in the same mounted root/backend and invokes the existing guarded
`NativeTextInput::focus(false)`. A temporary per-node guard prevents its
subsequent page-wide focus clear from affecting a reentrantly focused
replacement. The exact drag generation and owner are rechecked after blur.

An independent review found that the temporary guard also intercepted a later
explicit blur issued during `onEditEnd`. If that callback disabled or removed
the scroll, the independent blur could inherit the canceled drag's veto.
The correction scopes the veto to the initiating editor and its exact focus
generation; later explicit focus operations retain their own semantics.

The exact prior frozen source passed the original 45 cases and three added
controls, but failed all three new reentry reproductions in each tree.
The corrected app and fork each pass all 51 scenarios under ASan/UBSan.
Six mutation controls detect eight expected failures per tree, and four fresh
real SDK26 full-manager objects pass (app/fork on both ABIs).
The original Scroll/Refresh/input suite evidence remains preserved separately;
those suites were not repeated for the one-line follow-up.
This change has not been linked into a new HAP or replayed against the device
IME. Keyboard translation and other dismissal modes remain separate contracts.

See the [implementation and proof boundaries](../harmony/entry/src/main/cpp/backend/SCROLL_DISMISS_KEYBOARD.md).
The original immutable receipt is
`/tmp/valdi-scroll-dismiss-keyboard-20261103/freeze-receipt.json`,
SHA-256 `429c833a4817196d218521c0a92de3b2bb75a8a52d6903f1cc080b9a7f682cf9`.
The superseding focus-generation receipt is
`/tmp/valdi-scroll-dismiss-keyboard-p2-20261103/freeze-receipt.json`,
SHA-256 `d1a4e9a588bab69770b2f9cac9be0fb6a38dd95b6cbbafdb572a534ab527015f`.
All 477 prior evidence files remain unchanged.
The fresh second independent review found no remaining supported-path defect
in this correction. It inspected source and sealed evidence without rerunning
tests, compilers or devices.

### Scanner and attachment operations

The shared
[PresentationPage](../valdi/modules/app_pages/src/PresentationPage.tsx) calls
`scanCode`, `chooseImage`, `chooseFile` and `clearAttachmentCache`.
Android and iOS have native implementations. The
[Harmony AppUI host](../harmony/entry/src/main/cpp/host/HarmonyAppUIHost.cpp)
previously rejected `scanCode`, `pickAttachments` and `clearAttachmentCache`.
These methods now use a runtime-owned SDK media service through the existing
generated C++ proxy and Promise marshaller; the shared API and generated
bindings are unchanged. The corrected freeze passed fresh independent review.

Implementing these operations must retain the existing AppUI Promise ABI,
selection metadata and public cancellation semantics. Returning empty data or
a fabricated canceled result for an SDK failure is not compatibility.
The actual Android/iOS scanner and attachment picker are app-wide operations,
outside the page-owned modal queue. Changing the top route does not cancel
them. Their window/runtime owner still controls teardown and stale delivery;
opening their own system presentation must not be mistaken for owner teardown.

The implementation uses the SDK system scanner, photo picker, document picker
and camera picker. Scanner cancellation uses the documented cancellation code.
Selected files are copied to the dedicated `valdi-appui-attachments` cache,
with MIME/count checks and descriptor/partial-copy cleanup. Cache deletion
does not require a foreground presenter.

Runtime close retires API delivery. An unresolved SDK operation retains a
resource-only application/cache fence through its actual terminal and cleanup;
rejecting a Promise does not claim to dismiss system UI. Completed UI results
wait while the same runtime is backgrounded. No caller CAMERA permission or
additional native library was required by the inspected SDK system APIs.

The frozen implementation records 21 service/native cases, 11 existing feedback
cases, the existing presenter/model regressions and nine unchanged shared API
groups. Native cases use actual Node-API, a Valdi JSC engine and generated
Promise marshalling with fresh host dependencies under ASan/UBSan. SDK evidence
covers strict ArkTS 1.1 and four C++ objects across both ABIs.
SDK selection and file I/O remain doubled at their import boundaries in these
tests; no new HAP or real scanner/camera/picker execution is claimed.

See [implementation details](harmony-appui-media.md) and the sealed receipt
`/tmp/valdi-appui-media-20261103/freeze-receipt.json`,
SHA-256 `c5aa3bcb01fb26c2728860839d64cfc8330e56a11c4ace1cd4108e81956f9b2d`.

The first independent review found three P2 issues: attachment failures could
deliver while backgrounded, mixed-case MIME requests were rejected, and explicit
`media: undefined` failed optional-host validation. The correction runs rollback
before waiting for foreground error delivery, normalizes MIME admission and
matching, and treats undefined media as absent while rejecting malformed owners.
Identical regression bodies record service 14-pass/14-fail to 28-pass,
combined service/native 21-pass/16-fail to 37-pass, and compatibility
11-pass/2-fail to 13-pass. The changed host compiled for both SDK ABIs and the
Node addon with hash-verified private fresh-source support objects.

The superseding receipt is
`/tmp/valdi-appui-media-p2-20261103/freeze-receipt.json`,
SHA-256 `360a1133a3a223fe41df53a5183b8e41fa8d8f2009e974d23200cdaa2384fb56`.
The original receipt and all 776 original evidence files remain unchanged.
Fresh second independent review found no remaining concrete findings and
verified all 14 current files, 776 original and 202 follow-up evidence hashes,
and the source/object mappings. No app/HAP/device acceptance is added by this
correction.

### Sheet and native-page routing

The shared [HomePage](../valdi/modules/app_pages/src/HomePage.tsx) opens
`sheet` and `compactSheet` forms and the native `picker` route.
[HarmonyNavigator](../harmony/entry/src/main/cpp/host/HarmonyNavigator.cpp)
admits only push presentations in the reviewed picker freeze. The native
`picker` implementation passed independent source/evidence review with no
concrete findings. It supplies real ArkUI fruit
controls, dictionary results, back cancellation, mixed native/Valdi navigation,
retained covered pages and the existing runtime's typed AppUI actions.

The [implementation record](harmony-native-routes.md) describes the native
measure/layout adapter and callback ownership. The receipt at
`/tmp/valdi-native-route-20261103/freeze-receipt.json` has SHA-256
`e8eeb7110ebcda67fcee36c9a4b86a07f0b6f81abd8caa329e3849d7fdb5f793`.
Recorded proof includes four SDK configurations, 16 changed-unit objects,
four ABI assertion objects, host sanitizer execution and three behavioral
negative controls. Parent selection/admission/native-route source checks
pass 8/8. This is not full application linking, a new HAP or device acceptance.
The read-only review checked all 14 source files, 1,995 evidence files and
14 preserved media files. Subsequent sheet work may extend the same host files;
the picker receipt continues to identify its own frozen inputs.

App-owned sheet implementation is now in progress, with native compilation
and shared backend edits waiting for the wheel task's handoff. An admission
failure returned to the existing result callback as canceled does not prove
that the requested page was presented or canceled by the user.

### Inline wheel components

The shared [WheelPage](../valdi/modules/app_pages/src/WheelPage.tsx) uses the
column, time/date and cascading tree components in
[WheelPickers](../valdi/modules/app_pages/src/WheelPickers.tsx), including a
sheet scenario whose wheel drag must move neither the containing scroll nor
the sheet. The implementation reached a source freeze; independent review
found one P2 in re-grabbing an unsettled wheel:
Harmony-only dynamic class selection preserves the existing mobile runtimes,
and both backends supply concrete column/time/tree factories. See
[implementation and evidence limits](harmony-shared-wheels.md).

The receipt `/tmp/valdi-wheel-20261103/freeze-receipt.json` has SHA-256
`e8f0a5fc48542959e0364edce28368095cd2ad76289bc54a3645d640cb28b925`.
Parent verification confirmed all 31 live/frozen source hashes before handing
the backend to sheet integration. The three JS compatibility tests were
registered in the root runner and independently rerun successfully by the
parent. Recorded native evidence includes sanitizer execution, 11 mutation
controls, both ABI SDK objects/closures/import probes, and existing regression
suites. This is not a full application link or wheel device acceptance.
Later sheet backend edits remain outside that frozen wheel proof.

A second touch before the native stop event clears the pending tentative
selection. If no further change event occurs, the stop fails to commit the
visible selection or deliver its callback. A focused correction and regression
now preserve the tentative selection while the interaction remains armed.
The same fixture reproduces the baseline failure and passes with the fix;
cancellation, generation replacement and successive-gesture controls also
pass, together with the existing sanitizer suite and 11 mutation controls.
The supplemental receipt is
`/tmp/valdi-wheel-retouch-p2-20261103-hj35mac9/freeze-receipt.json`,
SHA-256 `bfc0ac20284ac2446ca5fb50c2a73319a6ccf046a769aab9ef08f8827356d8ef`.
Fresh second independent review is CLEAN, with no remaining concrete findings
in the five-file correction. It verified identical RED/GREEN fixture inputs,
the unchanged production event path, all 11 mutation failures and 511 support
origin hashes. This proof uses frozen pre-sheet backend seams and the actual
corrected headers; it does not validate the ongoing sheet manager implementation.

These inline controls are distinct from AppUI's transient `showPicker` and
`showDatePicker` dialogs. Implementing a route sheet or protecting an unknown
gesture does not itself supply the inline wheel renderer. Their shared
validated configuration, controlled updates and settled-selection callbacks
must be preserved when adding the Harmony implementations.

## RN Harmony implementation reference

The sibling source is `/Users/cloud/project/NativeRoutesHarmony`, inspected at
commit `503dc193583307d1781c1d8dfff378c6d0495bc6`.
It declares React Native 0.84.1 and React Native Harmony 0.84.4.
The sibling is a read-only implementation reference, not a new Valdi runtime
dependency or a source of device acceptance for this application.

Trace both the application adapter and installed framework:

1. `packages/api` and `packages/ui/src/specs/NativeRoutesUI.nitro.ts` describe
   the API-side requests and attachment/scan results.
2. `ohos/native/ui/src/main/ets/UIRuntime.ets` contains the SDK-facing paths:
   `scanBarcode.startScanForResult`, `PhotoViewPicker.select`,
   `DocumentViewPicker.select`, `cameraPicker.pick`, permission requests,
   file-descriptor copying into the owned cache, and cache deletion.
3. `ohos/native/native-routes/src/main/ets/NativeRoutesHost.ets`,
   `NativeRouteView.ets` and `NativeScreens.ets` contain native navigation,
   registered native screens, retained surfaces and presentation ownership.
4. `node_modules/@react-native-oh/react-native-harmony/Libraries/Components/ScrollView`
   contains the Harmony scroll delegate and drag-to-keyboard dismissal path.
   Continue through the installed RNOH text-input/ArkUI implementation rather
   than assuming a React Native JavaScript prop directly names a Harmony SDK
   operation.

The traced keyboard path is native drag-state transition, `scrollBeginDrag`,
the Harmony ScrollView delegate's `keyboardDismissMode === 'on-drag'` check,
`TextInputState.blurTextInput(currentlyFocusedInput())`, the native `blur`
command, then RNOH's `ArkUINode::setFocusStatus(0)` using `NODE_FOCUS_STATUS`.
The separate `UIRuntime.dismissInputs` operation clears its UIContext focus.
These are different entry points; neither justifies hiding a process-wide
keyboard or clearing another runtime's focused editor.

For Valdi, the existing guarded `NativeTextInput::focus(false)` is the relevant
owned-editor operation. Its editing-stop path may synchronously reenter
JavaScript. A scroll caller must therefore retain its owners and recheck
retirement, input eligibility and the drag generation before further delivery.

The RN native routing reference's `NavDestinationMode.DIALOG` implements its
full-screen destination. It is not the shared application's bottom-sheet
route. Service dialogs and custom-content sheets have separate ownership and
disappearance signals; do not treat one as proof of the other's parity.

Reuse the verified SDK mechanisms and ownership rules through Valdi's own
adapters. RN surfaces, TurboModule/Nitro registration, JSI handles and the RN
JSON reply transport are framework-specific. They do not replace Valdi's typed
Futures, official marshalling or per-runtime lifetime.

Compare error and cancellation semantics explicitly before adapting code.
For example, the RN scanner wraps SDK failures with `ERR_SCAN_CODE`, whereas
the existing shared Valdi scanner contract distinguishes cancellation through
the native rejection message `cancel`. Similar SDK calls alone do not make the
two public contracts equivalent.

## Acceptance before claiming alignment

For each implemented operation, check the shared request and result first,
then success, user cancellation, SDK failure, owner disappearance, background,
late completion, repeated completion and a second request after retirement.
For events, also check unsubscription and replacement-owner isolation.

Compile affected native adapters against each platform's real dependencies.
Use the same shared business scenario on all three platforms and bind replay
results to the exact packaged module and native library. A build or mock-host
test must not be reported as device acceptance.

Custom Harmony Refresh remains an extension. Existing refs, base layout,
ordinary text, static images, gestures and animations must be assessed by their
actual implementation and remaining validation boundaries, not reclassified
wholesale as missing.

## Integrated source checks

After the route and keyboard corrections, the actual root `pnpm test` passed
on November 3, 2026: 316 passed, zero failed and three skipped. All codegen
goldens matched. The root runner includes the 30 route parity cases.
Keyboard sanitizer and SDK object evidence is recorded separately above;
the root command does not rerun those keyboard suites.

A private preload added `--test-concurrency=1` to the three Node test groups,
without substituting production or test source. The root runner, route source
and tests, and local backend production hashes remained unchanged during the
run. The log and execution receipt are
`.ci/harmony/2026-11-02-completion/three-platform-alignment-root-r1.log`
and `three-platform-alignment-root-r1.json`.
No new application package, HAP, device replay or radio acceptance was produced
by this integration check.

After adding the media service's 14 deterministic cases to the root runner,
another actual `pnpm test` run passed: 330 passed, zero failed, three skipped,
with matching goldens. The 14 frozen implementation/test/doc hashes stayed
unchanged. Its log and receipt are
`.ci/harmony/2026-11-02-completion/shared-media-root-r1.log`
and `shared-media-root-r1.json`. The native media addon requires its explicit
serial probe runner and is not automatically compiled by the root command.

After the three media review corrections and their additional regressions,
the actual root command passed again: 344 passed, zero failed, three skipped,
with matching goldens. It executed all 28 media service cases; native addon
execution remains separate. All 14 superseding source hashes stayed unchanged.
The preserved log and receipt are
`.ci/harmony/2026-11-02-completion/shared-media-root-r2.log`
and `shared-media-root-r2.json`.
