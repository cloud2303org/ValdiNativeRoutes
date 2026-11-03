# Native integration validation

## Paired fork full-development-r2 checkpoint — 2026-11-03

[business-full-development-r2-proof.json](../.ci/harmony/2026-11-02-completion/business-full-development-r2-proof.json)
binds `business-full-development-r2.hap`, 57,675,674 bytes, SHA-256
`36b5cc6ab1e7bf3cd5bfc9fdc751cee7a256fdf86f8050c0977dbb13c67479d5`,
with embedded x86_64 native SHA-256
`0bd8a22088726695a9a9bc9837348e82347e2ad1a826c00e31ba0f49648a944d`.
This is a fresh build of the maintained fork's current full-development runtime,
with `VALDI_HARMONY_USE_FORK_UI_ASSETS=ON`, paired `Valdi::HarmonyArkUI` /
`Valdi::HarmonyAssets`, the current 616-byte context layout, full Hermes CDP and
WebSocket support, and updated BLE JavaScript without the shared TS FIFO.
The receipt records build return code 0, `changedInputs: []` and profile
restoration. Development modules contain 231 JavaScript entries and 210 inline
maps across 11 modules. The original four strict links remain historical;
this HAP has its own current-source build and live evidence.

The separate
[runtime report](../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime.json)
has SHA-256
`ff8144f6aa920e0c2a6f762b6d2c2bb14efe517eafe727fbcc8970a13d6ebd21`.
Its [runtime seal](../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime-seal.json)
has SHA-256
`aa3d8f3283b962ae9ee78e0246b31eeee0d51ea539ac46cbfbc91393ff6cd00d`.
Both records were written November 2 UTC / November 3 Asia/Shanghai.
Documentation checks matched the HAP, native library, all 11 module hashes,
79 runtime evidence hashes, 32 additional seal references and 10 private
harness reference hashes. The seal explicitly treats the final helper bytes
as reference snapshots, not proof that every bring-up invocation used that
revision. The 2,688-entry input manifest has no current production-source
mismatch: its 25 current differences are the intentionally restored entry
profile and smoke rawfiles. Build-time drift remains zero.

Acceptance is on the Windows **Mate 90 Pro / API 26 / x86_64 emulator**:

- **Startup and UI:** LoginPage renders with native logical display dimensions
  365.714286 × 809.142857. The UI replay passes **11 top-level steps** with
  nested input/navigation workload sequences, zero failures; this is not an
  eleven-action total. A separate acknowledged resume fragment passes **4/4**.
  Fresh native `describe` points and raw `await-ui-element` checks remain
  geometry-specific; Harmony's runner has no semantic selector tree.
- **CDP and mapped breakpoint:** actual WebSocket exchange and verified
  application identity pass. The packaged map resolves `//app_pages/src/auth.ts:45:4`
  to the `isSignedIn` frame. Boolean/no-pause controls pass before installation
  and after removal; while installed, the exact script/location/function/reason
  matches, pauses and resumes. See
  [breakpoint report](../.ci/harmony/2026-11-02-completion/full-development-r2-breakpoint-r3/report.json).
  The pinned protocol has two recorded quirks: `Runtime.runIfWaitingForDebugger`
  flushes Valdi's scripts but replies `Unsupported method
  'Runtime.runIfWaitingForDebugger'`; Hermes pause notifications omit hit IDs.
  The former is an explicitly accommodated unsupported response, not a successful
  method result. The latter uses exact frame matching plus causal controls,
  not a fabricated `hitBreakpoints` value. This does not claim complete CDP
  compliance or editor attachment/original-source breakpoint UI acceptance.
- **CPU capture/export:** raw profile has 1,009 samples; normalized output has
  1,008 samples and 39 nodes, including an application `LoginPage.onRender` frame.
  Of the normalized samples, 1,006 are root samples. This mostly idle
  input/navigation capture validates profiling transport and export, not a
  performance benchmark or representative hotspot measurement.
- **Valdi trace/export:** 181 events comprise 9 Renderer and 172 native events
  across two thread IDs, zero dropped and `timedOut: false`. Raw trace and
  Perfetto JSON exports are retained. These are Valdi process events, not OHOS
  system/scheduler tracing.
- **Visible JavaScript HMR:** LoginPage changes `欢迎回来` to
  `欢迎回来 · HMR r2`, then restores the original text and exact original bytes.
  Script IDs progress **77→94→95**. `qa-170.log` and `qa-171.log` retain the
  visible checks. Resource-image HMR remains unaccepted.
- **Background/resume and cleanup:** background endpoint is null and owned HDC
  forwards are `[Empty]`; resume produces new ports and a successful actual CDP
  attachment with native PID **27154** unchanged. This is background/resume,
  not controlled native-host destroy/remount. Final client stop closes owned
  connections and both transport sessions, with final forwards `[Empty]`.
  The emulator remains running.

**Failed full-development-r1 remains failed.**
[full-development-r1-runtime-failure.json](../.ci/harmony/2026-11-02-completion/full-development-r1-runtime-failure.json)
binds its earlier successful build, HAP
`1a170ae9fc6c741fb1248e8763f53141d1031d1030646790ab393448a434e96e`,
native `d83a73d64add0e58229fd3d31927708b22b9c19beacdfb9c37e02dce79b521ac`.
DEV `DebugConsole.tsx` invoked unsupported `Device.getDisplayHeight`; rendering
failed and the uncaught-JS handler intentionally aborted. Debugger server
startup on that artifact did not establish CDP exchange. The cleanly reviewed
SDK Device display-getter / `native_display_manager` fix is included in r2,
whose successful startup is separate evidence. The failed startup, detached
transport attempts and cleanup remain retained.

Full-r2 UI authoring history also remains retained: earlier wrong expectations
and CLI invocations failed, including a rejected input sequence that executed
nothing. `full-development-r2-ui-polish.json` removes only the documented unmet
pre-input assertion; corrected input and other checks remain unchanged.
The passing result belongs to the final polished replay, not those failed takes.

This artifact exercises paired fork login/input/navigation and the development
paths above. It does **not** accept paired Refresh/image/filter/snapshot/ref
parity or all framework features. The older Refresh 39/39 below still belongs
only to its original backend53 smoke HAP. No ARM64 device, physical BLE radio,
controlled host destroy/remount, original-source editor UI, resource-image HMR
or OS tracing is accepted. OTA config remains absent and disabled. Legacy
default profile and smoke rawfiles are restored; no dependency pin, commit or
remote publication follows from this checkpoint. Independent evidence review
is separate and is not declared complete here.

## Mobile BLE packaging checkpoint — 2026-11-03

[Android assemble proof](../.ci/harmony/2026-11-02-completion/ble-fifo-android-assemble-r1-proof.json)
and [iOS build proof](../.ci/harmony/2026-11-02-completion/ble-fifo-ios-build-r1-proof.json)
record successful latest BLE module/full-application builds. Android reports
**32 tests total, 9 skipped, 0 failures/errors**; its runtime AAR is unchanged
(`4fcf7574e5f5d6263f343f0471863e1b6e5e07964fbdb30507e91549900b6793`),
and APK SHA-256 is
`2a38cf0e53678fc6fd6743b6458da3339ec6c36d33ef568c9f2e89df29a94e8a`.
iOS retains the prior accepted runtime framework; native runtime SHA-256 is
`50f07a73850c3b3da493e1769c94c4fb1b9f5cf2da7222b8917cf29860ceac43`.
Both proofs inspect packaged JavaScript and record **TS FIFO absent**.
These are build/package/JVM-test results, not fresh mobile-device or radio QA;
runtime-owner/session-release wiring retains its separate boundary.
Earlier typed-AppUI artifacts below still contain the TS FIFO and retain their
original identities.

## Controlled native Refresh checkpoint — 2026-11-03

The build proof
[smoke-refresh-typed-r1-proof.json](../.ci/harmony/2026-11-02-completion/smoke-refresh-typed-r1-proof.json)
and separate live receipt
[refresh-native-r2-runtime.json](../.ci/harmony/2026-11-02-completion/refresh-native-r2-runtime.json)
bind this checkpoint to `smoke-refresh-typed-r1.hap`, 50,820,381 bytes, SHA-256
`2fd08cba3f8acf4f3acbd91efe91e9840ae14a1c662f43cfb444c2e6f74ba757`,
with embedded x86_64 native SHA-256
`af80a25d44d81e11212b6263f840fa6adc8e5431ebf0473cfc8cc5e9f162922b`.
The build receipt records return code 0 and `changedInputs: []`.
The build proof's `runtimeExecuted: false` describes that build-only record;
the runtime receipt and
[replay log](../.ci/harmony/2026-11-02-completion/refresh-native-r2-replay.log)
separately establish **39/39 uninterrupted**, zero failures/errors/skips,
48,306ms on the Windows **Mate 90 Pro / API 26 / x86_64 emulator**.
The receipt was written November 2 UTC, November 3 in Asia/Shanghai.

This fixture uses `custom-view` / `harmonyClass="ArkUIRefreshView"` with one
direct vertical Scroll child and business-controlled `refreshing`, `enabled`
and `onRefresh`; see [Refresh contract](entry/src/main/cpp/backend/REFRESH_API.md).
The accepted behavior is:

- Programmatic `refreshing=true` displays the real native spinner with
  `Requests=0`, without an echoed business request. Finish sets false and
  increments the finish count.
- Actual pull/release from the list top issues exactly one request; the
  business sets true and Finish completes it with false.
- With `enabled=false`, the observed pull does not initiate refresh.
  Child taps still increment the count, child scrolling exposes row 5, and a
  second tap works with requests still at 1. The separate live tree records
  offset 168; the replay checks row 5 and the request/tap counts without an
  exact-offset assertion.
- Exit/reentry resets local state and counts. After a new pull, navigating
  out **while refreshing** and reopening restores `refreshing=false`,
  `enabled=true`, requests/finishes/taps/offset all zero.

The parent inspected both
[programmatic spinner](../.ci/harmony/2026-11-02-completion/refresh-native-programmatic-r1.png)
and [pull spinner](../.ci/harmony/2026-11-02-completion/refresh-native-pull-r1.png)
images. The latter shows the gray native spinner above displaced Scroll content.
The disabled child/offset observations are retained in
`refresh-native-disabled-child-r1.log` and `refresh-native-scroll-row5-r1.log`.

**Authoring history is retained.** `refresh-native-r1-recorded.yaml` is the
original 41-step take, including an initial `push Detail` wait with no
trustworthy read and the unmet wrong-title `Native scroll geometry` wait.
R2 re-recorded the **entire 39-step valid path** through the recorder, then
replayed all captured actions/checks unchanged. `refresh-native-r2-recorded.yaml`,
`refresh-native-r2-record-finish.json`, the per-step author receipts and the
final `refresh-native-r2-polished.yaml` preserve that separate recording.
The r2 result is not a pass obtained by deleting unreadable failed steps from r1.

The app backend proof remains
`/private/tmp/valdi-arkui-refresh-review-freeze/verification.json`, SHA-256
`b9ad64ebd9ced53b29ab2cd89b0a55a50c40e18018465c4ea5fbf00e5699fbb9`.
The runtime receipt records a matching current rehash of all **53 files**.
Documentation verification independently rehashed those 53 files, the HAP,
its native library and all 51 sealed evidence files with no mismatch.
The both-ABI SDK/source/helper checks remain separate from this emulator replay.

Harmony's runner has no semantic selector tree. Points came from fresh
`describe` frames on this exact emulator; `await-ui-element` checks remain raw
tool steps. This is one geometry-specific replay, not portable QA or hardware
acceptance. Disabled-pull evidence is finite and does not characterize all
native follow-drag/settling behavior. Retained-child reparenting, OS
background/resume and shutdown stress are not accepted by this replay;
their separate source/host regressions retain their own scope.
This HAP uses the original application backend and legacy lean runtime,
includes typed AppUI/services but tests Refresh only, and has no OTA config.
No fork adoption or live CDP/CPU/trace/HMR acceptance is implied.

## Typed AppUI business checkpoint — 2026-11-03

[business-typed-promise-r1-proof.json](../.ci/harmony/2026-11-02-completion/business-typed-promise-r1-proof.json)
binds `business-typed-promise-r1.hap`, 51,200,326 bytes, HAP SHA-256
`194fa98882b2ed8e69d2f432939dfe77c7b73e79f53f49aea90b924a72615b38`
and native SHA-256
`8ba3896d353e5e6a72402dfe26714471a92deb7cf875dc88eecf940e50fd4e81`.
Its separate
[runtime receipt](../.ci/harmony/2026-11-02-completion/business-typed-promise-r1-runtime.json)
records **16/16 uninterrupted**, zero failures/errors/skips on the same emulator:
typed bootstrap reaches Login and authenticated Home, logout cancel dismisses
the modal while preserving authentication, restart restores Home with storage
opens 1→2, logout confirm returns to Login, and restart remains signed out.
This is separate from the older business-r2c 23-step auth/InputCheck path.

The original typed-AppUI recording and failed locked-screen/setup/fixture-secret
attempts remain retained. Its polish removes initial emulator wake setup and
the failed unavailable-secret sequence; successful recorded behavior is replayed
unchanged. No secret values are part of this report. The artifact includes
52 generated typed service adapters and retains the shared TS BLE FIFO.
This modal/auth path does not accept all 13 AppUI operations, real radio
interoperability, Refresh, fork runtime adoption or enabled OTA. Broader
editable/queued/background-cancel observations and failed r2b history below
retain their earlier package scope.

## Earlier fork source boundary and disabled OTA — 2026-11-03

The reusable fork ArkUI slice is frozen at **74 files** with clean independent
source review, recorded in
`/private/tmp/valdi-fork-arkui-freeze-final/freeze-receipt.json`.
It adds bind-time component delegates and a caller-owned image interface.
At this earlier freeze the application consumed its **original 53-file backend**;
the Refresh HAP above does not contain that reusable fork slice. Those
real-header objects and consumer/helper checks alone did not establish
application adoption. The separate full-development-r2 HAP above now supplies
current paired-fork build and scoped runtime evidence.

The original four lean-release/full-development × x86_64/arm64-v8a strict links
at `/tmp/valdi-harmony-runtime-7hl3ei7w/strict-link-matrix.json` are preserved
historical-snapshot evidence. The then-current map/image interface and
factory/preloader layouts required fresh coordinated OHOS rebuilding;
full-development-r2 supplies that new artifact's build and bounded live proof.
The original archives do not prove later ABI layouts, and future source changes
still require their own builds. Source review alone does not establish runtime
acceptance. CDP, capture/export and visible JavaScript HMR are now accepted only
within full-r2's limits above. See the parent-owned
[fork integration record](../docs/harmony-fork-integration.md) for the migration
plan; this completion record preserves the narrower artifact boundaries.

OTA host/process selection, resource loading, rollback and route-confirmation
wiring now have separate source/SDK/helper evidence in
`/private/tmp/harmony-ota-integration-freeze-b1r3zt4c/integration-proof.json`.
That freeze records both-ABI links and ASan/UBSan checks, with
`enabledLiveQA: false`. Packaged configuration is absent, so OTA remains
**disabled**; no signed update/download/install/rollback acceptance is claimed.
These source results supersede the earlier “integration pending” source status
below, while preserving the absence of enabled end-to-end runtime acceptance.

## Final business-native-r2 checkpoint — 2026-11-02

This frozen report is bound to `business-native-r2-proof.json`,
`business-native-r2-runtime.json` and `business-native-r2-receipt.json` under
`.ci/harmony/2026-11-02-completion/`.
The HAP is 50,466,591 bytes, SHA-256
`a4a8b699292c37dd90831fd0e131d4afb4f9f93d5a6475c1c390caef37f3fba4`;
its embedded x86_64 native library is
`8cbe73351574cc808ae301960a148718be265533006a9d56bc47544d21b03b9d`.
The receipt records build return code 0 and `changedInputs: []`; the build proof
binds the module/input-manifest hashes. Runtime JSON separately records actual
**HarmonyOS 7 / API 26 / x86_64 emulator** execution. This business r2 and the
smoke r4 below are immutable artifact checkpoints, not blanket validation of
the current worktree as later source changes arrive. The later typed-AppUI and
Refresh checkpoints above have separate artifacts and acceptance scopes.

The r1 root cause was a generated `c+` interface supplied as a bare typed
object. The official attached marshaller requires `ValueTypedProxyObject`.
Native service hosts and the Bluetooth module now use the public proxy
extension while preserving their generated schemas and typed record DTOs.
[BOOTSTRAP_MARSHALLING.md](entry/src/main/cpp/platform/BOOTSTRAP_MARSHALLING.md)
traces this boundary and the negative controls. The frozen proof at
`/private/tmp/harmony-platform-bootstrap-proof-final/proof.json` records:

- Strict SDK links for x86_64 and arm64-v8a, with no undefined symbols.
- Eleven native helpers and fourteen actual Node-API transport tests.
- Five linked boundary tests using the official pinned Valdi JavaScriptCore
  adapter and attached marshaller, covering all 52 generated Promise methods
  and 14 events with production port/codec and OS doubles.

Independent source review is clean. The host engine proof executes conversion
and property assignment, not `JavaScriptRuntime::setValueToGlobalObject` itself
or Hermes; actual Harmony startup is established by the separate emulator run.
These schema/transport tests do not establish hardware services or ARM64 execution.

`business-r2c-recorded.yaml` / `business-r2c-replay.log` pass **23/23
uninterrupted**, zero failed/errored/skipped, 38,215ms. This fresh auth group
avoids scroll-dependent controls and covers:

- Login as the initial root; original InputCheck native typing/submit, chevron
  and back.
- Synthetic demo login to Home, C API logout cancel retaining Home, and
  process restart restoring Home. Storage opens increase from 1 to 2.
- C API logout confirm returning to Login, followed by process restart
  remaining on Login.

`business-r2-login.png` and `business-r2b-inputcheck.png` preserve the Login and
original InputCheck screenshots. Runtime JSON and `business-r2-final-native.log`
record zero Valdi error-level lines for the latest process only. Generated
scoped demo fixtures were removed; no real backend account was used, and the
recorded final app state is signed out on Login.

Broader AppUI observations are **live-only**, not a full-suite replay pass:
editable modal input produces `新名字：采样设备native-qa`; queued modals with first
confirm and second cancel produce `两个都关了：确定、取消`; background cancellation
also produced its observed result. Picker/date/time, bottom sheet and image
preview remain live-pending. Those observations do not extend the auth replay's
scope to every native dialog.

The long `business-r2b-replay.log` remains a **failed** run: 15 passed, 1 failed,
40 skipped, zero errored. Scroll-dependent coordinates differed, a tap missed
the modal-confirm control, and the following title wait timed out.
`business-r2b-recorded.yaml` retains the original capture;
`business-r2b-polished.yaml` and `business-r2b-polish.json` preserve the removal
of one incorrect hidden substring assertion: `第一个` also matched the second
dialog's content. The exact second-title check was recorded afterward; this
authoring correction does not turn the failed long replay into a pass.
`qa-090.log` retains an invalid swipe rejected before execution. The initial
test-fixture source path could not resolve at the tool-server cwd; that failed
take is preserved separately from the later clean auth group. All recordings
remain fixed-coordinate/raw-accessibility emulator QA because Harmony's runner
has no selector tree; no portable QA or uninterrupted broader modal-suite pass
is claimed.

`integrated-tests-final.json` / `integrated-tests-final.log` record root
`pnpm test`: **180 passed, 0 failed, 1 opt-in skip**, with Kotlin/ObjC/C++ goldens
identical and Swift ABI equivalent. The skip is the opt-in isolated Bazel native
patch check; its earlier isolated proof is retained. This root run predates the
later native-port fix and does not cover it; the frozen bootstrap proof and
artifact-specific emulator replay above provide that separate evidence.
At that checkpoint Refresh and OTA host/loader/launch-confirmation integration
were pending; the later sections above record Refresh's bounded emulator pass
and OTA's disabled source integration. Hardware services, video, native page
factories/sheets/fullscreen covers and the other matrix limits remain pending.
Later worktree changes require their own frozen package and acceptance evidence.

## Completion-r3/r4 images and business startup — 2026-11-02

Current evidence remains under `.ci/harmony/2026-11-02-completion/`. These
checkpoints supersede r2's image failure for the tested image/filter fixtures;
they do not replace the broader smoke-r2 replay. Business-native-r1 failed here;
the superseding business-r2 evidence above accepts its specified presenter paths.
Runtime is **HarmonyOS 7 / API 26 / x86_64 emulator**, with no physical ARM64
execution. Build-only proof JSON uses `runtimeExecuted: false`; the corresponding
smoke runtime JSON and replay logs separately establish actual execution.

| Package | HAP SHA-256 | Embedded native SHA-256 |
| --- | --- | --- |
| `smoke-native-r3.hap` | `de02fc8b7a5753831cecb2327a07ad4ab6360334d0d139caa2e2602ace67b875` | `742e4a2d12730216558bfbc41318e87bf039a600f30fb3c9c22020160a19b0df` |
| `smoke-native-r4.hap` | `3e219e32b4f2400fdc3f51855686930cdb1bcfd821bc8fe8aa16bb13499cae95` | `b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7` |
| `business-native-r1.hap` | `170b28e673937af2784f5351bbb2b1ef55eca1343a06d736d2f8e312e273efc5` | `b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7` |

Each package has its named `*-proof.json`, input manifest and successful build
receipt with `changedInputs: []`. A shared native hash does not imply matching
smoke/business startup outcomes.

- **R3 images:** `smoke-native-r3-runtime.json` and `images-r3-replay.log` record
  23/23 uninterrupted steps, zero failures/errors/skips, 26,608ms. Packaged
  images, direct LoadedAsset A→B replacement, custom icons and visible native
  PNG→JS base64→native decode are restored. Screenshot evidence includes
  `smoke-r3-image-plain.png`, `smoke-r3-direct-b.png`, `smoke-r3-snapshot.png`
  and `smoke-r3-custom.png`. The PNG is 1168x420. This accepts that round trip;
  opaque-ref native C++ consumer resolution remains unaccepted.
- **R3 authoring history:** `images-r3-recorded.yaml` is preserved unchanged.
  `images-r3-polished.yaml` removes only the incorrect wait for an onAssetLoad
  notification after a direct LoadedAsset assignment, which does not re-fire
  that image observer. `images-r3-polish.json` records removed step 7 and the
  actual direct-source state check. `qa-046.log` preserves the failed authored
  expectation; `qa-047.log` preserves the corrected live check. The passing count
  applies to the polished replay, not the original failed wait. Effective
  filtering was still unaccepted on r3, whose default alpha getter reported 0.
- **R4 filters:** `smoke-native-r4-runtime.json` and `filters-r4-replay.log`
  record 14/14 uninterrupted steps, zero failures/errors/skips, 15,601ms.
  `filters-r4-recorded.yaml` exercises none→invert→grayscale→invert+blur→none,
  with five successful loads and zero load failures. The parent visually
  inspected gold inversion, gray and blur output in `smoke-r4-invert.png`,
  `smoke-r4-grayscale.png` and `smoke-r4-blur.png`. Acceptance is limited to this
  fixture's visible results; exhaustive numeric pixel/alpha/color-space parity,
  source immutability across all cases and vendor/public-source identity are
  not established.

The source correction pairs `OH_PixelmapNative_GetImageInfo` with
`OH_PixelmapImageInfo_GetAlphaMode`, the official API available since API 20,
instead of reading `GetAlphaType`'s distinct default metadata field as current
mode. No unknown alpha value is relabeled, and no pixel conversion is used to
satisfy the check. See [image asset contract](entry/src/main/cpp/assets/IMAGE_API.md).
The latest assets freeze at
`/private/tmp/valdi-harmony-image-alpha-proof/proof.json` records 25 sanitizer
test groups per run, both ABIs and 58 SDK imports per ABI. Assets source is
unchanged across the r4 smoke and business-native-r1 builds. Its source/helper
checks do not identify the vendor runtime's implementation; the separate parent
runtime/filter evidence above provides the fixture observation.

**Business-native-r1 live startup failed.** `business-native-r1.hap` built successfully,
but the parent's first native startup error is `setValueToGlobalObject`:
“Cannot convert type typed object to proxy object”. `qa-063.log` then shows
“Harmony business requires native __harmonyBusinessBootstrap before start”.
This failed artifact does not accept C API logout or the new presenter.
The separate business-r2 checkpoint above fixes and validates its actual
marshaller boundary and specified logout paths. Earlier auth/session/loading
proofs retain their older package identities. Hardware services, OTA host/loader/launch-confirmation
integration, hot reload, video and the remaining matrix limits stay pending.

All completion replays retain the Harmony coordinate/raw-live-wait limitation:
the runner has no selector tree, so these are emulator-specific recordings,
not portable selector QA. No protocol/proxy/TLS policy change is inferred from
these results.

## Completion-r2 frozen checkpoint — 2026-11-02

This is an earlier package-specific checkpoint; “final” labels below
retain their historical milestone scope. Evidence is under
`.ci/harmony/2026-11-02-completion/`. Its image failure and unaccepted preview
remain historical evidence; the r3/r4 results above establish the later fixes.

`smoke-native-r2-proof.json` identifies `smoke-native-r2.hap`, 50,048,359 bytes,
SHA-256 `a431156f064a87272c2f53d7c4b72e9288dd9c258b38076a99bfb3f12107d784`;
its x86_64 native library is
`080bc53b13033cca801f319b4f17993673edef7b146d6d25eaf171a2fe47c8f9`.
The receipt (`smoke-native-r2-receipt.json`) reports build return code 0 and
`changedInputs: []`; the proof binds the module and input-manifest hashes.
The build proof's `runtimeExecuted: false` describes that build-only record.
The separate `smoke-native-r2-runtime.json` records actual execution of this
same artifact on **HarmonyOS 7 / API 26 / x86_64 emulator**.

`smoke-r2-recorded.yaml` / `smoke-r2-replay.log` pass **58/58 uninterrupted
steps**, zero failures/errors/skips, 68,271ms. Harmony's runner has no selector
tree: coordinates come from native UI discovery, with raw live-tree waits.
This recording is specific to the emulator's geometry, not portable selector QA.
It explicitly does **not** accept image decode or pixel output.

- Visually inspected `smoke-r2-home.png`, `smoke-r2-custom56.png`,
  `smoke-r2-custom88.png` and `smoke-r2-foundation.png` show real native glyphs
  and styled rich runs, including CJK/emoji/RTL samples. Accessibility text
  alone was not used as glyph-rendering proof.
- Official→custom 56/88vp→official switching passes without a crash in the
  reproduced path. Page clicks pass through empty custom-root regions, and
  default/custom tab counts remain retained. This is not proof of arbitrary
  teardown/reentry timings.
- Official Tabs are actual ArkTS SDK components: this SDK has no C Tabs factory.
  Default controls occupy 48vp plus system bottom; official-tab page insets
  include those 48vp, while ordinary/custom pages receive system insets only.
  The custom business 56/88vp examples own their geometry; their height is not
  added to page insets. This supersedes the earlier 60vp layout description.
- PNG signature and IHDR checks pass at **1168x420** (`qa-034.log`).
  Opaque native-ref JS objects return (`qa-032.log`). Live C++ consumer
  resolution and bitmap re-decode are **not** accepted; PNG preview display is
  absent. See [snapshot/ref contract](entry/src/main/cpp/backend/SNAPSHOT_REF_API.md).
  Descendant taps with touch-stop are recorded (`qa-039.log`), but interruption
  of an active animation is not established.
- The same artifact passes eight RCP HTTP sequence checks: POST JSON, PUT binary
  with seven bytes, PATCH and cancellation (`http-r2-sequence.log`,
  `http-r2-sequence-args.json`). RCP retains HTTP-version negotiation and redirect
  defaults; no forced HTTP version, protocol, proxy or TLS policy change was
  introduced. Acceptance endpoints remain domestic.

**Failure on r2:** `smoke-r2-native.log` lines 233–238 rejects even the plain
packaged image with “Harmony image filter requires a bounded RGBA8888 pixelmap
with known alpha type”. `smoke-r2-image-failure.png` shows `Loaded=0 failed=1`,
no decoded image, and filter `none`. The image-fixture icon/PNG-preview path is
absent/unaccepted. Older image passes, valid PNG header bytes and the 58-step
replay do not establish current media/filter completion. Filter source has
matrix/blur support. Ordinary-image restoration and effective-filter fixture
acceptance were still pending at this checkpoint, then established by r3/r4.

Mount reentry source/helper proof is frozen at
`/private/tmp/valdi-arkui-mount-reentry-freeze/verification.json`: 172 SDK imports
per ABI, x86_64/aarch64 object/consumer closure and SDK link checks, sanitizer
scenarios using production method bodies with adapted ownership/native
boundaries, and clean source review. This is both-ABI source/link evidence;
ARM64 execution and physical hardware are not established. The r2 switch path
provides the separate emulator observation.

Native C API AppUI presentation source is implemented with clean owner review,
but its new business live acceptance is pending. Earlier loading/toast and
unsupported-modal observations below describe earlier packages, not the new
presenter. Real BLE/Wi-Fi/NFC/permission service implementations have typed-port
tests and SDK checks; hardware behavior is unvalidated. The isolated OTA core and
packager are implemented and reviewed; reserved `latest.json` update IDs are now
rejected with four packager tests. Host/resource-loader/launch-confirmation
integration and hot reload remain pending. See the current limits matrix below.

Historical r1 failures remain in `smoke-native-r1-runtime.json`: blank native
glyphs despite accessibility labels and a default→custom switch SIGSEGV in
`Typography::SetIndents`. `custom-tabs.png` is the launcher after that crash,
not successful custom rendering. Failed recordings and crash logs are retained;
the later reproduced r2 switch/rendering success does not erase them.

## Typed routing and overlaid tabs — 2026-11-02

This earlier milestone superseded route transport and shell-layout details in the
checkpoints below. Evidence lives in `.ci/harmony/2026-11-02-typed-routing/`.
The upstream pin remains `15feb6530ceecb971f4c8519ea8ab77474b959db`.

- Startup returns generated `RouteDeclaration`; options, page models and stack
  entries use generated models. Params/results cross as native dictionaries,
  with strict route-specific TypeScript generics and recursive snapshots.
  Cancellation is an empty dictionary plus `true`. Routing no longer uses JSON
  serialization, including the ArkTS navigation observer. Unrelated AppUI
  transport is unchanged.
- `defineRoutes` is pure. Explicit publication and official ModuleLoader reload
  observation replace import-time publication. Error handling installs first;
  authentication, storage and startup ordering remain synchronous.
- The shared pinned-runtime patch preserves NSNumber booleans and own
  `__proto__` data keys through both JS map reconstruction paths. Actual full
  and lean Hermes consumers and Foundation regressions passed, including
  negative controls. All runtime exports were rebuilt after the final patch.
- The native page fills the window beneath an overlaid ArkTS tab bar using
  native background blur and translucent tint. Yoga title y is 50.857143vp
  (system top 38.857143 + 12); native y is 178px at scale 3.5. The native root
  starts at screen y=0, height 809.142883vp. Accessibility clipping at the status
  bar is not an additional page offset. Tab bottom inset is 88vp (28 + 60),
  ordinary-page bottom inset is 28vp. Temporary layout diagnostics are removed.

Final build and automated checks:

- Android's final patched runtime export and normal `pnpm build:android` pass.
  All ten durable RouteData helper/Navigator/NativePage JUnit regressions pass
  in the normal Gradle graph (`android-unit-tests.log`).
- iOS's patched runtime export and normal `pnpm build:ios` pass. Five native
  Foundation snapshot regressions pass. This milestone does not claim an iOS
  or Android device UI run.
- Both full Harmony HAP profiles build, including the standard
  `pnpm build:harmony:business` command. The source-cache resolver now uses the
  complete Bazel output-base cache when header exports prune execroot links;
  its regression is included in the root test runner.
- Final root `pnpm test`: 44 / 5 / 99 passes, zero failures, one separately
  enabled Bazel patcher check skipped; binding goldens match
  (`regression-final-with-cache.log`). That patcher was also exercised
  independently. Smoke/options/business contracts pass 24/24.
- The complete ARM64 runtime and host/backend/assets/business/generated-binding
  strict whole-archive links pass. `host-arm64-proof.json` explicitly records
  `runtimeExecuted: false`. Activity reentry has nine sanitizer scenarios;
  the final independent source review reports no material findings.
- The final smoke recording replays 47/47 uninterrupted, covering nested route
  params/results, empty success versus cancellation, retained tabs/counts,
  replace, back(2), pop-to-root, transition options and declaration updates
  (`smoke-final.yaml`, `smoke-final-replay.log`).

| Final x86_64 emulator package | Bytes | SHA-256 |
| --- | ---: | --- |
| `smoke-final.hap` | 45464266 | `de5ffcc266ef0cd3189ed41abb34babe20c7251e5a06f086377bc789dc1e7b4a` |
| `business-final.hap` | 45872382 | `3277c7fbaa09473660e47e34a63945679fce63bc5b20738fd99d19535f304841` |

Both contain native library SHA-256
`a5104ea84ac1899b098a3671871fa5951d2326add3e5a658b40b9de58b252031`.

The canonical business package also passes two consecutive clean-install
replays of `business-final.yaml`: **16/16 groups each**, zero failures/errors,
40170ms and 39835ms (`business-final-replay.log`,
`business-final-replay-r2.log`). The three recorded run-sequence groups complete
all 17 nested actions. These exercise:

- No saved token: Login is the first page. Synthetic demo login reaches Home;
  process restart restores Home, with persistent open count 1 to 2.
- Typed detail params and `currentPages`, followed by a successful typed result.
- The original InputCheck: native typing/submit, exact displayed result and
  native chevron back.
- Content scrolling behind tabs, loading visible, completion toast, loading
  removed, and tab availability.

`typed-business-tabs-final.png`, `typed-login.png` and
`typed-input-keyboard.png` are visually inspected screenshots. The keyboard
image comes from the same final package's earlier live input/background/resume
check (`qa-047.log` through `qa-051.log`); that background sequence is not part
of the final auth replay. The business HAP's Windows hash matches its Mac hash.
The emulator is left running on the signed-in, scrolled Home page.

These are recordings for this emulator's geometry. Harmony's e2e runner has no
selector-tree source: taps came from fresh native `describe` frames and checks
use raw `await-ui-element`, so the recordings are not portable selector tests.
Replaying business auth requires a clean test-app installation and the named
synthetic secrets on the Windows tool server.

Failed attempts remain evidence. `business-signout-unsupported.yaml` and
`business-signout-runtime.log` show that Home's sign-out confirmation reaches
the existing unsupported `showModal` path; sign-out was not validated and token
removal is not claimed. The first auth recording had a tool-server secret-scope
error before typing. An invalid swipe was rejected before dispatch. The first
loading walkthrough did not observe its short-lived state; both final complete
replays did observe it. These attempts are not included in passing counts.

These unsigned packages are emulator artifacts. Production signing and physical
ARM64 behavior remain unvalidated. Harmony sheets/covers/native page factories,
additional AppUI dialogs, BLE radio, and the documented backend gaps remain
outside this milestone.

## Earlier elements and business checkpoint — 2026-11-02

Current source is broader than the historical milestones below. Evidence is in
`.ci/harmony/2026-11-02-elements/`. Runtime observations here are from the
Windows Mate 90 Pro **x86_64 emulator**, not physical ARM64 hardware. Source,
SDK object/symbol verification and link evidence cover both native ABIs;
`host-arm64-proof.json` records a strict whole-archive link with
`runtimeExecuted: false`. Later changes require their own package/source proof;
an earlier proof is not automatic validation of an active child's new sources.

- Native scrolling: vertical/horizontal movement, immediate/animated offsets,
  row taps and content growth during drag are recorded. The reviewed lifecycle
  fixes preserve matching sequences and layout revisions. The complete current
  path grows 24 rows to 40, settles at 200 points, taps row 4 and returns Home.
  `scroll-current.yaml` / `scroll-current-replay.log` pass all eleven steps.
- Images: packaged home/components resources and direct decoded-asset A/B
  replacement attach to native image nodes. `direct-home.png`,
  `direct-components.png`, `image-sources-sequence.log`, and `qa-032.log` through
  `qa-035.log` retain the observations. Load/decode callbacks and the invalid-byte
  failure path were exercised.
- Domestic HTTPS: Baidu returned HTTP 200 with 6617 bytes; native decode produced
  202x66 pixels, row stride 808 and allocation 53328 bytes
  (`network-comparison-proof.json`, `foundation-runtime-before-input.log`).
  Current acceptance endpoints are domestic only. Earlier unsuccessful network
  diagnostics remain evidence; no protocol, proxy or TLS policy was changed.
- Fonts: the packaged Roboto Mono font renders and shares registration with
  measurement. `font-measure` records in `foundation-runtime-before-input.log`
  give both `iiii` and `WWWW` width 48.285713 and height 26.285715 logical points.
  This establishes those mono metrics, not universal font/fallback parity.
- ClientSQL: the smoke fixture wrote persistent count 1, restarted the process,
  then read/incremented it to 2 (`qa-013.log`, `qa-014.log`,
  `modules-sql-fixture.log`). Business storage and credential persistence have
  their own later diagnostic-package proof below.
- Input: real single/multiline native editors are implemented. Live focus,
  keyboard overlap and `abc` with selection `[3,3]` are recorded after r2
  (`qa-043.log` through `qa-045.log`). The three reviewed P2 source issues were
  fixed and the focused review is clean.
  The separate plain ArkTS/native comparison has correct `abc` in both editors.
  Its uninterrupted `input-probe-current.yaml` replay passes four groups /
  eleven nested actions (`input-probe-replay.log`). The diagnostic runtime log
  demonstrates that setter echoes arrive after re-registration carrying the
  **new target ID**, so changing a target ID alone is not suppression.
- Production input checkpoint: the completed policy gives pending setter
  acknowledgements a bounded 500ms window anchored to native setter completion,
  with at most eight generations and observable user edits cancelling pending
  expectations. Fifteen negative controls pass and the second review is clean.
  Temporary diagnostic logging, text fingerprints and the backend Hilog
  dependency are removed. On the noninstrumented package, idle set/clear then
  `abc` passes 9/9 (`input-final-idle-abc.log`), focused set passes 3/3
  (`input-final-focused-set.log`), and ten programmatic writes actually execute
  and pass 21/21 through argument-file transport (`input-final-ten-writes.log`);
  the user-change count remains 1. These results establish the tested paths,
  not the cause of the original r3 failure, which remains unproven.
- Shape: native `shape` / `ArkUIShapeView` Drawing path fill/stroke is implemented.
  Source/SDK checks cover both ABIs and 131 imported symbols, plus a fixture from
  the actual pinned TypeScript builder. See
  [SHAPE_API.md](entry/src/main/cpp/backend/SHAPE_API.md) for the path contract and
  limits. Final InputCheck rendering, input submission and native back now pass
  the recorded seven-step device replay; `shape-final.png` shows the chevron.

The earlier noninstrumented input checkpoint is retained as
`foundation-input-checkpoint.hap` / `foundation-input-checkpoint.json`, SHA-256
`8f58c06ef5304b413c04e70c559d06ba71fefd7730a60db7882adb3070e885f5`.
Its native hash is
`3978d548c432537fd43b61dffbfdbefd8f6f2bd6bc889904a579155f845957b3`.

The P1 nullable-factory fix is complete in the durable platform overlay.
Factories returning null are not cached; cache cleanup/statistics tolerate null;
the preloader retires unsupported requests and protects stop/restart during
unlocked resolution. Two independent source reviews are clean.
`nullable-factories-final.log` passes two tests, including six native production
runtime cases and fresh-pin byte idempotence. Both ABIs passed strict runtime
linking. The final complete ARM64 host/backend/assets/business link also passes
(`host-arm64-complete.log`, `host-arm64-proof.json`); no ARM64 runtime execution
is inferred.

The superseding noninstrumented packages are built and archived:

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| `foundation-final.hap` | 41683887 | `0f0d805a0cadb2f2f85bbb0804a0d1c0671964ce3e5ecdb5399e7ca15f048080` |
| `business-final.hap` | 42092761 | `2a8295c784b14ae46ccd51c813d9d56bc1426ec86ab45ff61fa54bc44474aaba` |

Both package proofs record the same native library SHA-256:
`a6ff242d52c68d7f27a39255309f28d13852d1f86de8cc5b1ff3600dedc8c9d8`.
Neither library contains the temporary input ledger diagnostics or fingerprints.
The runtime provenance hash is
`799b84a7c555839f2d2d9837d07ea97b04218b60f30a84f03281d322f4da6671`.
Final input/business device replays and Shape acceptance are tracked separately
below; package construction alone does not establish their outcomes.

Final replay recovery is retained in the `harmony-*recovery*.log`,
`harmony-force-process-restart.log` and `harmony-unlock-after-force.log` records.
The original process was forcibly terminated and a new cold process started
without resetting user data. The target uses 8 GiB RAM for this pass; original
configuration files are backed up under the Windows user's `.argent/` directory.
On-demand `Valdi-Harmony-ColdBoot-QA` and `Valdi-Harmony-HDC-QA` tasks have no
automatic trigger. Argent and the independent Android emulator were kept running.
The locked-screen launch error and the first cold title-wait timeout remain
failed attempts, not passing input checks.


The real business HBC builder/bootstrap and app-owned native services are
implemented and reviewed: metadata-selected startup, BLE event registration,
typed unsupported BLE/permission methods, OS AssetStore synchronous TokenStore,
direct StorageHost injection, and native/ArkTS loading/toast AppUI.
`HarmonyRuntimeHost.cpp` installs these before evaluating
`harmony_business/src/app.start()`. Root `pnpm test` passed its 39/5/93 groups
and binding comparisons (`regression-foundation-final.log`); seven smoke/option
checks and eleven business contract checks passed
(`contracts-foundation-final.log`, `business-contracts-final.log`) at the earlier
checkpoint. The later `business-contracts-lazy-fix.log` passes fourteen checks
using real Rolldown output and the pinned ModuleLoader, with independent review
clean. The forwarding navigation facade suppresses `updateRoutes` while lazy
startup evaluates, publishes the auth-selected return declaration once, then
forwards subsequent calls through retained facade references.

Live Hermes Promise QA is independently verified in `promise-live-runtime.log`
line 102: `phase: live`, `ok: true`, `realPromisesRejected: 31`,
`wechatChecks: 3`. `promise-live-proof.json` records the actual business HAP hash
`8adda3ae5126b49ebf11bc806186e1eb613504dd93eb9f3b9110a3b7050be193`
and native library hash
`c81592def8e911a334b991e96e782cf7c6a6b294a99680d26ddf8029343f7874`.
Closed/released-owner phases have not executed on device. The same business run
exposed an auth initial-root bug: signed-out Home (`token=none`, contexts 2/3)
appeared before Login. That defect is now fixed and has separate device proof:
`business-lazy-startup-runtime.log` records only the Login context before sign-in.

`business-checkpoint-runtime-proof.json` identifies the **diagnostic native
business package**, HAP SHA-256
`7f667a183abfee77bdd9d730b38fa72e9451fa22b8cfeaf25674a62a4b1138c5`,
native SHA-256
`648802aa37cbbb474a3f77bd51bfdd3ca8a4582ef1b8b95b4cd8a3393583ef0e`.
Demo Login→Home passes 6/6 (`business-demo-login.log`); after process restart the
session is restored using real OS AssetStore and Home storage opens increase
1→2 (`qa-071.log`, `qa-072.log`). Loading→toast→hide passes 4/4
(`business-loading-toast.log`). The complete `business-auth.yaml` replay passes
all eight steps uninterrupted (`business-auth-replay.log`). It requires a fresh
install with no saved session/storage and uses synthetic QA secrets. This is
demo authentication and process-restart persistence proof on that diagnostic
package; it does not establish remote production authentication, uninstall
retention, physical-device behavior or final canonical-package replay.

That proof JSON's `unresolvedAtThisCheckpoint` entries are historical: the later
noninstrumented input results above supersede its “not executed yet” input
status. The final InputCheck/Shape device result is recorded below separately
from that diagnostic package. The original crash
is preserved in `business-input-check-cppcrash.log`.

Earlier failures are retained: missing `onImageDecoded` binding
(`qa-029.log`), pre-unwrapping resource errors (`runtime-resource-failure.log`,
`services-before-unwrapping.yaml`), pre-r2 input `bca` and empty setter echoes
(`qa-038.log`, `qa-039.log`, `input-first-failure.log`,
`input-per-key-runtime.log`), and the incomplete foundation recording
(`foundation-checkpoint-failed.yaml`, `recording-r2-finish.log`).
The latter recording includes a failed wait and is not a full passing replay.
Later successful image/scroll/input observations do not erase these checkpoints.
The earlier `input-ledger-repeat.log` is a Windows command-too-long failure:
the ten-write command **did not execute** and is excluded from pass evidence.
The new argument-file ten-write run above really executes 21/21 actions.
Original r3 causation remains unproven. Superseding package identities and core checks are recorded above; final device
replay has its own acceptance record.

## Final input acceptance

The final smoke package passes all 19 steps of
`input-final-stable.yaml` uninterrupted (`input-final-stable-replay-r2.log`,
94862 ms, zero failures/errors). Its first recorded walkthrough also passed
all 19 steps. Checks include idle/focused setter suppression, ten writes,
UTF-16 clamping, uppercase processing, return/edit-end, background/resume,
enabling/disabling, callback-driven removal/restoration, multiline newline
payload/caret and returning Home. The native backend is noninstrumented.

The original multi-character oracle was invalid: one automation call produced
two real commits (`a`, `Ab`), correctly processed once each into `A`, `AB`.
`input-commit-oracle-proof.json` matches the actual three processor/change pairs.
The final recorded version uses single-character user input for exact count
checks and preserves Unicode/programmatic coverage. Harmony's runner has no
selector tree, so point actions retain their documented platform exception;
raw accessibility waits provide outcome checks. The 30-second tree-read budget
is a tooling allowance, not a performance guarantee.

The original replay failures, unreadable tree timeouts and the successful
subsequent read of the expected foreground state remain recorded. They are not
passing attempts. The bounded 500ms policy and its unmarked same-text ambiguity
still apply; original r3 causation remains unproven.

## Final business and Shape acceptance

The canonical `business-final.hap` passes all eight steps in
`business-final-auth-replay.log` (27227 ms): fresh Login, existing demo-token
sign-in, Home, process restart with restored OS AssetStore session, persistent
open count 1 to 2, loading, completion toast and loading dismissal. This is the
existing demo flow, not server authentication.

The original InputCheck page then passes its first recorded walkthrough and
all seven replay steps in `shape-final-replay.log` (14940 ms). The original
Drawing chevron is visibly rendered at the expected scale in `shape-final.png`;
the native field submits `shape` once and the actual native back button returns
Home. `shape-final.yaml` requires the retained demo session. This does not
establish exhaustive curves, arcs, RTL/density, resizing, gradients or release
behavior. The earlier unsupported-Shape abort remains preserved.

`final-acceptance.json` ties these results to both final HAPs and their common
native library. Mac and Windows package SHA-256 values agree. The canonical
business package remains at the normal build output path and on the emulator.

## Remaining unsupported and pending matrix

| Area | Exact remaining boundary |
| --- | --- |
| Input verification / policy | Final noninstrumented smoke package passes the recorded 19-step input walkthrough and uninterrupted replay; earlier checkpoints retain their own identities. Original r3 cause unproven. Within the bounded 500ms policy, same-text commits without observable user hooks/preview can be indistinguishable from one pending acknowledgement; late, evicted, repeated or user-cancelled echoes are processed as edits. Remaining IME/composition/selection/submit/lifecycle combinations lack full live acceptance. |
| Input SDK limits | Advisory autocapitalization/autocorrection; no exact URL keyboard, suggestion policy, join/continue labels, signed decimal, secure multiline or read-only `selectable` parity. Correction is post-commit, deletion is best effort, and TextArea Enter versus a one-character newline paste can be ambiguous. |
| Business acceptance | Immutable business-native-r2 passes 23/23 auth/InputCheck/logout/restart steps, including cancel→Home, confirm→Login, restart state and storage opens 1→2; r1 startup failure preserved. Longer r2b run failed 15/1/40 skipped; broader modal checks live-only. Remote production auth and uninstall retention not established. Earlier live Promise phase passed; closed/released phases unexecuted. |
| BLE / Wi-Fi / NFC / permissions | Real service source, typed ports, lifecycle tests and SDK checks implemented; older packages used rejecting service surfaces. Latest full-r2 and mobile builds package BLE JS without TS FIFO; Android/iOS build/package results add no fresh mobile-device/radio acceptance. Hardware permissions, BLE/RF operations, Wi-Fi approval/association and NFC tag I/O unvalidated. Wi-Fi manual picker/list injection and enterprise/WPA3-specific provisioning remain outside the shared contract; see [system services](entry/src/main/ets/platform/HarmonySystemServices.md). |
| AppUI | C API logout modal cancel/confirm accepted in business-r2c replay; later typed-AppUI artifact separately passes 16/16 auth/modal/restart steps. Editable/queued/background-cancel modal results observed live-only; no full broader modal-suite or all-13-operation replay pass. Picker/date/time, bottom sheet and image preview live-pending; no additional action-sheet live acceptance. Scanning and attachment picking/cache clearing unsupported. Earlier loading/toast evidence remains scoped to its packages; see [native AppUI](entry/src/main/cpp/host/HarmonyNativeAppUIPresenter.md). |
| Navigation | Sheets, fullscreen covers, native page factories and snapshot crossfade unsupported. |
| Scroll / Refresh | Controlled native Refresh passes its separate original backend53 smoke-HAP 39/39 emulator replay: no programmatic request echo, one request per observed pull/release, Finish, disabled initiation with child tap/scroll, and exit/reentry including leaving while refreshing. This is not paired full-r2 Refresh acceptance. Finite disabled observation only; retained-child reparent/Refresh background/shutdown stress remain source/host-only. No accepted keyboard dismissal/translation, zoom, fading-edge/deceleration parity, scroll performance bridge or native platform wrappers. ArkUI owns arbitration/physics; drag-ending target correction is a subsequent 300ms animation. |
| Image / filters | R3 packaged/direct A→B, custom icons and PNG round-trip visible; r4 none/invert/grayscale/invert+blur/none passes with five loads and no failures. Fixture visual acceptance only, not exhaustive numeric pixel/alpha/color-space parity or vendor source identity. Effective filters on direct loaded images remain unsupported. Animated images, SVG/vector raster parity, nine-patch/cap insets and native presentation callbacks unsupported; full tint/fit/transform clipping unverified. |
| Shape | Native path/fill/stroke implemented with both-ABI checks and a real builder fixture. Original InputCheck chevron/submission/back pass on earlier packages and business-native-r2; failed r1 startup preserved. Exhaustive curves/arcs/contours, density/RTL, frame updates and teardown/unsupported-class controls remain unvalidated. Gradient fill, partial stroke ranges and path morphing unsupported; see [SHAPE_API.md](entry/src/main/cpp/backend/SHAPE_API.md). |
| Text / backend | Native attributed runs and listed styles implemented; real glyphs/runs visible on r2. Inline image/view attachments, span tap/layout callbacks, span backgrounds/outlines/transforms, variable axes, text shadows/gradients, selection, shrink-to-fit, label Yoga baseline/insets and exact fallback parity remain unsupported/unvalidated as documented. Label/image children, non-Harmony loaded assets, generic native actions, percentage radii, raster bitmap factory and synchronous layout outside ArkUI callbacks remain unsupported; see [labels](entry/src/main/cpp/backend/LABEL_API.md). |
| Snapshots / refs / touch-stop | PNG signature/IHDR and opaque JS objects pass on r2; r3 adds visible native PNG→JS base64→native decode/preview acceptance. Native-ref C++ consumer resolution, other bitmap-consumer paths and active-animation touch-stop interruption lack live acceptance. Video/protected/offscreen/full-content capture unsupported. No generic JS native-method dispatcher; see [snapshot/ref limits](entry/src/main/cpp/backend/SNAPSHOT_REF_API.md). |
| OTA / hot reload / video | Core/packager and host/process/resource/route-confirmation wiring have source/SDK/helper proof; reserved latest-ID fix has four tests. Harmony config absent, OTA disabled, enabled end-to-end update/rollback acceptance pending. Full-r2 accepts visible LoginPage JavaScript HMR and exact-byte restoration (script IDs 77→94→95); resource-image HMR remains unaccepted. Video unimplemented. See [OTA handoff](entry/src/main/cpp/host/HarmonyOTA_INTEGRATION.md). |
| Tabs / overlay | Official ArkTS SDK Tabs use 48vp controls plus system bottom; custom 56/88vp business examples add no custom height to page insets. Reproduced custom/official switch, empty-root click-through and retained counts pass on r2; broader reentry/lifecycle cases and physical-device behavior remain unvalidated. |
| Fork / development runtime | Full-r2 rebuilds current 616-byte-context runtime with paired fork ArkUI/assets and zero build drift. Actual CDP/mapped breakpoint controls, mostly idle CPU capture/export, Valdi process trace/Perfetto JSON export and visible JavaScript HMR pass on x86_64 emulator. Pinned unsupported runIfWaiting reply and omitted hit IDs are documented; no full protocol/editor UI, benchmark or OS-trace claim. Original four runtime strict links remain historical; future source changes need new proof. |
| Core / lifecycle / release | Earlier nullable-factory/mount-reentry/assets proofs retain their scope. Bootstrap proxy proof covers two ABI links, 11 native/14 Node-API/5 official JSC tests; root 180/0/1 predates that native fix. Smoke r2 58/58, r3 image 23/23, r4 filter 14/14, business r2c auth 23/23, typed-AppUI 16/16, Refresh 39/39 and full-r2 11 top-level UI / 4 resume steps are separate artifact paths. Full-r2 background/resume clears/recreates endpoints and owned forwards with PID 27154 stable; controlled host destroy/remount remains unaccepted. Full paired Refresh/image/filter/ref parity, exhaustive lifecycle timings, production signing/release and physical-device execution remain unvalidated. |

The following sections preserve the scope and package identity of each earlier
milestone. Their exclusions describe those packages, not the current source.

## Gesture and interactive-back milestone

Validated on 2026-11-02. Mac built the final HAP; the Windows Mate 90 Pro
x86_64 emulator ran it through the existing Argent host. The package is
38,218,712 bytes, SHA-256
`bbbde4e7516b08253bc301dfbaefb1c6a760fcdc692fe28661c50c2ababfdce0`;
the transferred Windows file has the same hash.

Final-package checks passed for:

- Tap/double-tap Ended-only delivery and one Started notification per long
  press. All six gesture families were exercised with disabled and rejecting
  predicates; counters remained unchanged while rejected.
- Drag start/change/end alongside raw touch, independent raw events while
  drag was rejected, and 0.3s delayed observation. A quick release before
  the deadline produced Ended without Started, following the documented
  pinned iOS state path.
- Two-pointer pinch (about 2.50 scale), rotation (about 1.57 radians), and
  their simultaneous delivery. Actual payloads have numeric pointer counts,
  pointer IDs and logical coordinates; admission uses indexed coordinates
  instead of the SDK's zero scalar coordinates during interruption.
- Native target extensions on all four edges, left-edge override, and
  rejection outside the declared region. These checks initially omit custom
  hit testing. Separate custom-child and ancestor hit tests, and ancestor
  `touchEnabled=false`, suppress descendants and restore correctly.
- Nested drags: rejecting the child permits parent capture; accepting the
  child increments only the child. Inline callback rerenders preserve the
  accepted sequence.
- A predicate synchronously removing its target; synchronous
  `onTouch(Ended)` disabling its target without losing `onTouchEnd`; and
  synchronous `onTouchStart` changing delay followed by `onTouchEnd`
  disabling the target without duplicate terminals. The two raw scenarios
  finish at exactly `start=2, end=2`.
- Interactive short-drag cancellation, distance-based commit, retained
  context/result through a canceled preview, and a later typed
  `{visited: 1}` finish. A 10s held cancel has 620 actual native input
  updates and maximum progress 0.154687; the distance commit reaches 0.725.
- Page drag versus edge back: with an accepting page predicate, an edge
  sequence increments the page drag and stays on that page. Rejecting the
  page predicate lets the same edge sequence return to Home.

`interactive-held-native.png` captures both native roots while the contact is
still down. The capture script records `INPUT_ACTIVE=True` before and after
the screenshot. The outgoing page is shifted right and its retained
predecessor is visible underneath. The corresponding native sequence
contains 728 input updates and cancels after release. An earlier screenshot
attempt ran after release; its files remain in the evidence and are not
used as held-frame proof.

The live-recorded `harmony/smoke/e2e/harmony-gestures.yaml` passed all 20 steps
on the final package. Harmony runner selectors are unavailable, so this
profile-specific path uses coordinates discovered from the live 1280x2832
tree and raw live-tree `await-ui-element` checks. Long press and chord-based
two-finger rotation use the installed OS's documented input commands because
Argent's Harmony gesture tools do not provide those actions.

The final package also passed 79 live action/check records. The merged retained
logs contain 909 numeric-pointer payloads and no Valdi error-level entries.
The last property-animation regression delivered 70 native frames and one
successful JS completion at 1223ms. `runtime-acceptance.json` checks the two
canceled previews, two committed edge sequences, exactly two result deliveries
(one canceled, one typed finish), and exactly two synchronous raw end callbacks.

Production animation/gesture/deadline tests, strict native object compiles
and all 86 imported ArkUI/Drawing symbol checks pass for x86_64 and ARM64.
The complete host/backend also passes an ARM64 shared-library link with the
Valdi runtime under whole-archive and undefined symbols forbidden. Native
source hashes in that proof match the final package sources. Existing
`pnpm test` groups (39, 5, 93) and the six Harmony option/archive/router tests
pass. Independent reviews found and then verified fixes for synchronous
node lifetime and terminal callback reentry; the final focused review has
no remaining concrete findings.

Evidence is under `.ci/harmony/2026-11-02-gestures/`: HAP/hash/build proof,
per-action trees/logs, raw OS-input capability output, recorded/replayed
path, bounded native progress logs, held screenshot, and ARM64 source/link proof.
The durable fixture and replay path are under `harmony/smoke/`.

This establishes the listed native input behavior on the emulator, not a
physical ARM64 run. ArkUI owns recognition slop/timing and cross-node compatible
gesture arbitration; same-node pan/pinch/rotation simultaneity and the tested
parent/child precedence are established. This is not byte-for-byte emulation
of UIKit/Android detector internals. Background/rotation/teardown at every
possible gesture timing remain outside this live pass; cancellation ordering
has source review and production-helper tests.

## Routing and animation milestone

Validated on 2026-11-02 using the same Mac build environment and Windows
x86_64 Mate 90 Pro emulator described below. This milestone supersedes the
earlier counter-only scope.

The scoped `app_pages` fixture copies the real routing contracts and compiles
them with the existing Node pipeline into HBC99. One native runtime owns the
navigation host and separate page contexts/trees.

Device checks passed for:

- Typed detail params, `pushForResult`/`finish`, system-back cancellation, and
  retained home/second-tab counters and page IDs.
- `back(2)`, replace, pop-to-root, reset to a plain root, root-back no-op,
  reset-to-tabs, and opening the tab shell from a plain root.
- Dynamic route/tab declaration updates: retain the valid root/selected tab,
  rebuild contexts, and update native tab label/icon metadata. ArkTS keys include
  metadata because a stable route-only ForEach key retained the old label.
- Foreground/background on a retained tab, including the correct
  `show:foreground` / `hide:background` reasons.
- Native fade, zoom, slideRight/default, slideUp, and immediate route navigation.
- Valdi layout/opacity/color/radius/translation/scale animation, custom cubic,
  spring, active cancellation, and leaving a page while its animation runs.

Actual ArkUI diagnostics include 22 frames for the first 350ms fade, 69 frames
for a 1.2s property animation, and 64 for the spring. An active cancellation
produced 56 frames and exactly one JS completion with `canceled: true` at
976ms; leaving a page canceled another animation at 1300ms before destroying
its context. Intermediate geometry is present in the native UI tree.
The main run contains 24 native animation terminations, six unique property
completion callbacks, and no Valdi error logs for that process.

The first animation attempt exposed opaque per-node context wrappers being
compared by pointer. The final host passes the actual ArkTS `UIContext` through
NAPI and retains it until backend teardown. A separate cancel attempt arrived
after the five-second animation had finished; the batched input sequence then
verified real in-flight cancellation. Both unsuccessful attempts remain in the
evidence rather than being treated as passing animation checks.

`pnpm test` passed its 39, 5, and 93 test groups, with binding comparisons
unchanged. The three scoped archive/router tests and three Harmony option tests
passed. Production interpolation/spring/timing math checks passed, including
ODE residuals for under/critical/overdamped springs. Real SDK object checks and
all 72 imported ArkUI/Drawing symbols passed for x86_64 and ARM64. All final
native host/backend translation units also passed an ARM64 whole-archive
shared-library link with undefined symbols forbidden. ARM64 execution is not
claimed.

Final HAP, with matching Mac/Windows SHA-256:

```text
entry/build/default/outputs/default/entry-default-unsigned.hap
size:   37923194 bytes
sha256: 40b884ef02229a471b3702b61743d9e1e63710d81c7792202cd7fd268d941cfa
```

Evidence is under `.ci/harmony/2026-11-02-routing/`: build/test logs, native UI
trees and action records, batched cancellation/leave sequences, merged runtime
logs, runtime acceptance JSON, ARM64 link/source-hash proof, and final screenshots.
The final HAP additionally verifies the native tab metadata refresh fix; the
native production sources are identical to the linked ARM64 proof.

This earlier routing/animation package connected only `onTap` and host system
Back. The subsequent gesture milestone covers the additional input capabilities.
Sheets,
fullscreen covers, native page factories, snapshot crossfade, scrolling,
image/input nodes, business services, production signing, and physical-device
validation are outside this milestone. Reentrant observer teardown has source
review and ordering fixes; its full native callback timing is not claimed as
device-tested.

## Earlier counter milestone

Validated on 2026-11-02.

## Build environment

- Mac ARM64, official Command Line Tools `26.0.0.865`.
- HarmonyOS SDK / NDK `26.0.0.105`, API 26.
- Hvigor `6.26.9`, ohpm `26.0.0.630`, JDK 21.
- Valdi fork commit `15feb6530ceecb971f4c8519ea8ab77474b959db`.
- Patched Hermes `260318099.0.4`, lean VM, HBC version 99.

`pnpm build:harmony` prepares pinned sources and dependencies, rebuilds runtime
JS and the TSX counter with the existing Node compiler, and produces the HAP.
The final host includes the full-filename resource loader, explicit root sizing,
and retained surface layout specs.

Both ARM64 and x86_64 runtime builds passed a whole-archive shared link with
undefined symbols forbidden. The final six host/backend translation units also
compiled and linked against the actual ARM64 runtime and SDK. This is compile
and link evidence; ARM64 has not been executed on a physical device.

`pnpm test` passed, including existing script/compiler tests and generated
binding comparisons. All nine existing/Harmony JSX platform tests passed.
A separate read-only source review found no additional concrete defect in the
experimental counter scope.

## Windows emulator acceptance

Target: running Mate 90 Pro, HarmonyOS
`7.0.0.107(SP8DEVC00E999R4P11)`, API 26, actual ABI `x86_64`.
Mac builds were transferred to Windows; no Windows compilation was used.
Argent `0.31.0` supplied installation, launch, UI tree discovery, taps, waits,
screenshots, and restart.

The following passed on `io.valdiroutes.harmony`:

1. Install the unsigned HAP and render the native TSX screen with `Count: 0`.
2. Tap the native clickable node using its accessibility-tree frame.
3. Observe `Count: 1` in the native UI tree and `HARMONY_COUNTER=1` in Hermes JS logs.
4. Background with Home, return to the app, and observe `Count: 1` preserved.
   Runtime logs contain the corresponding application pause/resume events.
5. Force-restart the application and observe a fresh `Count: 0`.

The system Back action on this emulator backgrounds the root application and
preserves its instance. It does not establish execution of the host's explicit
`destroy()` / asynchronous environment-cleanup path. That path has source and
link verification, but its graceful timing is not claimed as device-tested.

The tested HAP is
`entry/build/default/outputs/default/entry-default-unsigned.hap`:

```text
size:   37091964 bytes
sha256: 076203e7968e4947257220123cb31dacbfc36476d9a7d631b8444960bc6a3d77
```

Local evidence is under `.ci/harmony/2026-11-02/`, including `count1.png`,
platform test output, and final ARM64 host source hashes/link evidence.
The Windows emulator and the independent Android emulator are left running.

## Scope of the earlier counter package

That counter package proved TSX -> Hermes -> Valdi C++ -> ArkUI rendering and native event
round trips for `view` / `layout` / `label`. It does not establish that the
existing business application, routes/tabs, scrolling, image/input widgets,
animations, Bluetooth, SQLite, OTA, production signing, or physical devices
are supported. See the host/backend READMEs for explicit capability limits.
