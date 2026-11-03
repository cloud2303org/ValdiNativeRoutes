# Harmony AppUI scanner and attachment operations

The Harmony implementation now routes `scanCode`, `pickAttachments` and
`clearAttachmentCache` through the generated `app_pages::AppUIHost` interface,
`Valdi::TypedPromise` and the official `CppMarshaller`. The shared TypeScript
API and canonical generated bindings are unchanged. No RN, RNOH, Nitro or JSON
transport is involved.

## Concrete native dispatch

All thirteen public methods remain concrete overrides of the canonical generated
`app_pages::AppUIHost`. Feedback and media requests cross the JS-to-UI dispatcher
as separate owned DTOs (`ShowLoading`, `HideLoading`, `ShowToast`, `HideToast`,
`ScanCode`, `PickAttachments`, `ClearAttachmentCache`). Overload resolution selects
the concrete UI operation. Each overload supplies its fixed NAPI property name
and exact arguments to a reusable Promise transport helper; no request kind or
string is inspected to choose an API method.

`MediaResultKind` describes only the scan/selection/void result parser. The
native presentation kind still describes modal/picker/preview content in the
existing C++ presenter queue. Neither replaces the generated public interface.
The mount signature, argument/resource bounds, errors, owner signals, Context
pins, weak callbacks and completion queues retain their existing behavior.

The native media test suite includes an interleaved seven-operation regression
through the attached generated proxy. It verifies exact argument shapes and
receiver identity, Promise `then` receivers, typed results, background rejection
for feedback show methods and continued hide/cache-clear availability.

## Ownership and lifetime

`Index.layout()` constructs a fresh `HarmonySystemServices` for the native
RuntimeHost's platform services. It separately constructs a fresh
`HarmonyAppUIMediaService` and passes it as `feedback.media` in the existing
AppUI mount object. The service is not a member of `HarmonySystemServices`:
there is no change to its validated platform-service contract or shutdown
ordering.

`HarmonyRuntimeHost` already retains the mount arguments, creates
`HarmonyAppUIHost` on UI, forwards navigator committed-route identities and
activity changes, closes AppUI on UI before its JS shutdown fence, and releases
mount references on UI. `HarmonyAppUIHost` now retains `feedback.media`, forwards
those existing signals through its typed `setOwner(page, active)` method,
invokes its three Promise methods and closes/releases it in `closeOnUI()`.
`Index` also closes the media service if synchronous mount fails.

Scanner/picker operations belong to the runtime/window, outside the modal
queue and individual route ownership. This follows the actual Android
`AppUI.kt` and iOS `AppUI.swift` system-presenter ownership. A logical route
change does not cancel them. `HarmonyPendingAppUIRequest` pins the calling
Valdi Context and owns the native Promise through settlement even if that
page's context is removed.

New UI requests require an active window and committed route. A pending SDK
presentation may itself hide `Index`, so an inactive signal alone does not
cancel it. Completion waits for foreground on the same runtime. Actual user
background also blocks new launches and holds result delivery until return.
SDK26 exposes no reliable signal here distinguishing an SDK-caused hide from
Home/background, and these presenter APIs expose no physical cancellation
method. The implementation makes neither distinction by timer nor a claim
that rejecting a Promise closes native UI.

Picker failure follows the same visibility rule as success and scanner
failure. SDK rejection, camera failure and copy/stat/close errors first roll
back partial files immediately, including while backgrounded. Only delivery
of the resulting error waits for foreground. Cleanup failures also wait for
foreground after every cleanup attempt; runtime close retires delivery
immediately and wakes any parked failure. Cache-clear errors remain independent
of foreground.

Runtime/window teardown synchronously retires API delivery, clears the
service's resolve/reject/resume references and ability-context field, and
rejects the native pending requests once. Late SDK callbacks cannot complete a
replacement host. Any SDK Promise that has not terminated continues holding
only its retired work and necessary SDK context.

A static fence stores only application/cache identity strings, never a
runtime, context, Promise, NAPI reference or callback. It conservatively admits
one SDK/cache operation per application cache scope. It survives close/reopen
until actual SDK terminal delivery and file cleanup. Thus reopening a runtime
while an old physical picker/scanner remains open returns
`E_APP_UI_MEDIA_BUSY`, rather than launching another presenter or clearing
files underneath old work. If the SDK never terminates, that scope remains
fenced for the process lifetime. There is no timed unlock.

Cache clearing is filesystem work and does not require a foreground presenter.
It shares the resource fence to avoid racing selection copies and rollback.

## SDK26 behavior and dependencies

The inspected SDK is
`/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default`.

- HMS `@kit.ScanKit` supplies `scanBarcode.startScanForResult` and
  `scanCore.ScanType`. Album recognition is disabled. The six supported types
  map to `QR_CODE`, `EAN_13`, `EAN_8`, `CODE_128`, `CODE_39` and `UPC_A`.
  Only documented BusinessError `1000500002` maps to native rejection
  `Error('cancel')`; internal error `1000500001`, parameter errors, unsupported
  output types and empty recognition are failures. The SDK declaration
  explicitly says its default scanner UI has system camera access and callers
  do not request camera permission.
- `@kit.MediaLibraryKit` supplies `PhotoViewPicker.select` with IMAGE_TYPE and
  the requested maximum count. SDK26 declares the zero-argument constructor.
  `@kit.CoreFileKit` supplies `DocumentViewPicker(context).select`, file URI
  metadata and file-descriptor copying. Empty URI arrays are user cancellation.
  Rejected SDK Promises remain failures.
- `@kit.CameraKit` supplies `cameraPicker.pick(context, [PHOTO], ...)` with the
  back camera. It always returns at most one image. SDK26 declares result code
  `0` as success and `-1` as failure: nonzero codes are never fabricated
  cancellation. Camera output with code `0`, empty URI and empty media type is
  the system-presenter empty terminal result; a populated media type without
  its URI is a failure. A populated result must have PHOTO media type.
  System-camera invocation has no caller permission annotation in SDK26; no
  CAMERA declaration, runtime permission request or permission reason was
  added.
- `@kit.ArkData` supplies uniform MIME/filename descriptors. `@ohos.util`
  supplies UUIDs. The SDK's ArkTS annotation parser option is enabled in the
  standalone checker so its actual `@arkts.lang` declarations parse.
  No SDK declaration is patched or replaced.

The camera empty-terminal distinction was also traced through OpenHarmony's
real `CameraPickerNapi` source: `OnDestroy()` calls `FinishPicker(0)`, empty
URI/mode fields are the initial state, and completion returns those fields.
The examined upstream source snapshot is retained in the evidence directory
as `camera-picker-reference.cpp` / `.h` with hashes. This is a source reference,
not proof of the implementation in a particular device's Camera application.
The SDK26 declaration itself does not provide a separate cancellation enum.

## Selection metadata and cache behavior

The service validates native source/count bounds defensively without changing
shared schema defaults. Photo selections use the requested count; camera
forces one result. Excessive SDK selection counts fail rather than silently
truncating or publishing an inconsistent result.

Every asset contains an independent UUID, a `file://` cache URI, the original
URI's filename, MIME derived from the filename's uniform type descriptor, and
the copied file's actual size. Unknown extensions use
`application/octet-stream`. MIME allowlists support exact types and type
wildcards; returned selection metadata is checked before publication.
Requested MIME values are lowercased once before source MIME admission,
document filtering and copying. SDK descriptor MIME values are also
canonicalized to lowercase for comparison and returned metadata, matching the
shared schema's acceptance of mixed-case strings and iOS MIME matching.
Document suffix filters are an optimization, with broad selection for
wildcards/unrepresentable filters and exact post-selection MIME checking.
The camera result's MIME is inspected rather than assumed to be JPEG.

Copies use an opened source file descriptor, not a guessed URI pathname.
Destination paths are registered before copying, so partial outputs,
stat failures, close failures and any later selection error all enter rollback.
Every opened descriptor gets a `finally` close attempt. Results publish only
after the entire selection succeeds. Teardown during copying suppresses the
result and cleans outputs after the outstanding file operation finishes.

Rollback attempts every registered destination even if one unlink fails.
An unlink failure is an explicit `E_ATTACHMENT_CACHE` failure; the remaining
owned copy can be removed by a later cache-clear call. This cannot guarantee
physical deletion when the filesystem itself refuses deletion.

Only `${cacheDir}/valdi-appui-attachments` is cleared. The shared filesystem
scope deliberately excludes unrelated caches and the read-only source URI.
Missing/never-created cache is successful void completion. Directory deletion
errors reject, and a close during deletion does not release the resource fence
before the filesystem Promise terminates.

## Reproducible checks and evidence limits

Run from the repository root:

```sh
node --test scripts/harmony/tests/appui-media.test.mjs
node scripts/harmony/tests/appui-media-check.mjs
python3 -u scripts/harmony/tests/appui-media-probe.py /tmp/unique-appui-media-proof --node
```

The last command owns the native compile slot, checks for competing native
builders before every invocation and runs compilers serially. It compiles
`HarmonyAppUIHost.cpp` and `HarmonyNativeAppUIPresenter.cpp` with the actual
SDK26 commands for x86_64 and arm64-v8a. The extended plain result variant and
official generated DTO completion adapters are instantiated by these objects.

The host harness rebuilds the bounded 130-source macOS host dependency subset
and official JSC adapter from current source into a private evidence directory.
No prebuilt Valdi archive is linked, avoiding the old/current
`IJavaScriptContext` ABI mix. Only the unrelated fmt/json dependency archives
are reused. The actual Node-API runtime connects the production ArkTS adapter
to the production C++ host and attached generated proxy/Promise marshaller.
SDK interactions/file I/O are doubled at their SDK import boundary; ArkUI
rendering uses the existing real-header boundary fixture.

ASan/UBSan are enabled for fresh host sources. The pinned JSC adapter's
zero-length VLA extension has the existing narrow `vla-bound` suppression in
its two relevant translation units. No other sanitizer check is disabled.
The passing harness includes a negative control that restores the former
three always-unsupported branches in an isolated source copy and requires
the same native-path tests to fail.

The original frozen checks pass 14 service scenarios, 21 combined service/native cases,
11 existing feedback tests (including all thirteen generated methods), the
existing native presenter regressions, the existing canonical Promise/model
regressions and nine shared API test groups. The unsupported control passes
the 14 service scenarios and fails all seven native media cases as expected.

Original evidence is sealed under `/tmp/valdi-appui-media-20261103` with source,
SDK declaration, command, object, addon and log hashes in `freeze-receipt.json`.
Earlier failed probe attempts are retained. They include Node's bundled
OpenSSL header precedence interfering with a BoringSSL dependency compile and
a harness flag-order failure that re-enabled the known zero-length VLA check,
and an earlier negative-control fixture cleanup failure. These are retained
separately from the final passing run and normal-exit negative control.

The independent-review follow-up corrects three P2 findings: foreground error
delivery after immediate rollback, case-insensitive MIME matching/filtering,
and native mount admission for explicit `media: undefined`. Omission and
explicit undefined both admit a feedback-only host; malformed objects and
nonobject values are still rejected.

Identical new test bodies were run against the original production sources
before editing and again after correction. RED produced 14 service failures,
16 combined service/native failures and two compatibility failures; GREEN
passes all 28 service scenarios, 37 combined service/native cases and 13
compatibility tests. The real SDK26 ArkTS type/linter check also passes with
the same six SDK warnings.

Superseding evidence is under `/tmp/valdi-appui-media-p2-20261103`. It references
the original receipt SHA-256
`c5aa3bcb01fb26c2728860839d64cfc8330e56a11c4ace1cd4108e81956f9b2d`
and verifies all 776 original evidence files unchanged. For this follow-up,
the native probe recompiles the changed host on both Harmony ABIs and in the
Node-API addon, using the prior fresh-source private host dependency objects.
It additionally recompiles the small BoringSSL source dependency whose prior
receipt did not include a source hash. No old legacy Valdi archive is linked.
Unchanged presenter/model regressions and shared/root tests are not rebuilt
or rerun by this focused follow-up.

The selective reproduction command is:

```sh
python3 -u scripts/harmony/tests/appui-media-probe.py /tmp/unique-appui-media-review-proof \
  --node --media-only --reuse-from /tmp/valdi-appui-media-20261103/native-r4
```

The cache checks the exact command, source hash and prior object hash before
reuse. Changed headers or libraries invalidate the bounded cache; changed
source translation units are compiled again. Original receipt and evidence
files are never rewritten.

This evidence is source/contract execution, real SDK ArkTS checking, two-ABI
object compilation and macOS native Promise execution. It does not establish
OHOS linked Hermes behavior, application packaging, real scanner/camera UI,
device permission behavior or device filesystem access.

The concrete-dispatch follow-up passed 28 standalone service tests, SDK26
ArkTS checking (six SDK warnings), 38 combined service/native tests, all 13
feedback/compatibility tests, the native presenter and canonical Promise/model
regressions, and the unsupported-behavior negative control. Its final evidence
is `/tmp/appui-typed-dispatch-20261103-r7/receipt.json`.

Earlier runs stopped at the native compile-slot guard when other compilers
appeared; they did not report source compilation failures. The final run reused
82 successfully compiled SDK/core objects from the interrupted `r6` run through
an isolated `/tmp/appui-typed-dispatch-20261103-resume-cache` receipt, then built
the remaining sources and tests. The cache reverified recorded source/header
hashes, exact normalized commands and sealed object hashes. Its additional
26,301-file include inventory was captured after the interruption; timestamps
preceded `r6` except for its generated NAPI forwarding header. It is not a claim
of a pre-run transitive dependency hash snapshot. The original `r6` receipt was
preserved. No legacy Valdi archive was linked.

## Parent integration

No CMake, module permissions, resources, NapiModule, RuntimeHost, Navigator,
shared API, generated bindings or sibling source changes are required.

The parent owns the overall status in `docs/appui-promise-contract.md` and
`docs/three-platform-alignment.md`, including the independent review and
packaged-device acceptance boundaries.
The existing `host/tests/AppUI-feedback.test.cjs` now checks missing/invalid
media owners explicitly and supplies a valid typed media boundary for all
thirteen generated methods. Its existing modal/feedback checks are retained.
`AppUI-native.cpp:416` intentionally tests a missing ArkUI dialog API; that
unsupported error is unrelated to the media gap and remains valid.

The new serial probe runs the updated existing feedback suite, the existing
native presenter suite and the existing canonical Promise/model suite against
its fresh-source host objects. The legacy `host/tests/AppUI-run.py` still
points to the old host archive and has wider parallelism; use the new probe
for these checks rather than combining its old archive with current
`IJavaScriptContext` headers. Changing that legacy driver is not required by
the production integration.

The shared `tools/valdi-rolldown/appui-promise.test.ts` remains unchanged and
continues to test distinct scanner rejection and attachment cancellation.
Fresh independent review, normal app/HAP builds and Harmony device acceptance
belong to parent integration.
