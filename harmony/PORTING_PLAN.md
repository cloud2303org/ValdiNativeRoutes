# Harmony capability completion

The portable Valdi/Hermes runtime, native views, routing, animation, gestures,
and interactive back are integrated. Scroll, images/fonts, input, and the real
business host have since been implemented in the following order while preserving
the pinned runtime contracts. Acceptance remains capability-specific.

| Phase | Implementation | Acceptance |
| --- | --- | --- |
| Scrolling | Native scroll nodes, content specs, runtime offset synchronization, callbacks, programmatic offsets | Vertical/horizontal movement, offset changes, content resizing, child taps, gesture/back regression |
| Resources | LoadedAsset integration, packaged and remote images, image measurement, font registration | Real decoded images, load/error callbacks, cancellation, packaged font rendering |
| Input | Native single/multiline editors, change/selection events, focus and keyboard | Editing, programmatic text, selection, submit, focus/blur and keyboard lifecycle |
| Business host | Inventory and implement actual startup module dependencies | Real business entry renders; missing services fail explicitly |
| Integration | Independent reviews, both native ABIs, HBC/HAP build and device regression | Source, build, emulator, and physical-device evidence reported separately |

Backend implementation is serial because these capabilities share node layout,
events, and disposal. Contract audits may run concurrently. The parent owns
fixtures, host integration, and device QA; each delegated implementation declares
its exact file ownership.

Existing proof is recorded in `VALIDATION.md`. This plan does not mark future
capabilities as implemented or device-validated.

## Current integration checkpoint

The current **full-development-r2 business HAP** uses the rebuilt maintained
fork runtime with paired ArkUI/assets and passes bounded live acceptance.
Its [build proof](../.ci/harmony/2026-11-02-completion/business-full-development-r2-proof.json)
binds HAP SHA-256
`36b5cc6ab1e7bf3cd5bfc9fdc751cee7a256fdf86f8050c0977dbb13c67479d5`
and native SHA-256
`0bd8a22088726695a9a9bc9837348e82347e2ad1a826c00e31ba0f49648a944d`.
The build has zero input drift, current 616-byte context layout, full
CDP/WebSocket support, paired fork UI/assets and BLE TS FIFO removal.
The original four strict links retain only their historical snapshot scope.

- The sealed [runtime report](../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime.json)
  and [seal](../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime-seal.json)
  establish Windows API 26 x86_64 emulator acceptance: 11 top-level UI steps with
  nested input/navigation sequences, plus a separate passing 4-step resume
  fragment. Harmony points/raw native waits remain geometry-specific.
- Actual CDP exchange and the mapped auth breakpoint pass before/after no-pause
  controls and exact frame matching with resume. Pinned
  `Runtime.runIfWaitingForDebugger` flushes scripts but returns unsupported;
  Hermes omits hit IDs. These accommodated quirks do not establish complete
  protocol or original-source editor UI compliance.
- CPU export contains 1,009 raw / 1,008 normalized samples and 39 nodes,
  including LoginPage rendering, but 1,006 normalized samples are root samples:
  capture/export proof only, not a benchmark. Valdi trace exports 181 events
  (9 Renderer / 172 native), two threads, zero drops, no timeout; Perfetto JSON
  export does not establish OS tracing.
- Visible LoginPage HMR applies and restores the exact original bytes with
  script IDs 77→94→95. Background endpoint becomes null with owned forwards
  empty; resume obtains new ports and actual CDP attachment with PID 27154
  unchanged. Final clients/transports stop and forwards are `[Empty]`.
- Full-r1 built but DEV `Device.getDisplayHeight` caused an uncaught-JS abort.
  Its failure record and failed authoring/transport takes remain retained.
  R2 contains the cleanly reviewed SDK getters/native-display link fix.
  Its polished UI replay removes only the documented unmet pre-input assertion
  after a rejected CLI sequence executed nothing; other corrected checks remain.
- Controlled destroy/remount, ARM64 device, physical BLE, resource-image HMR,
  original-source editor UI and paired Refresh/image/filter/ref parity remain
  outside this pass. Legacy profile and smoke rawfiles are restored, OTA remains
  disabled, and no pin/commit/remote change is claimed. Independent evidence
  review remains separate.
- Latest [Android](../.ci/harmony/2026-11-02-completion/ble-fifo-android-assemble-r1-proof.json)
  and [iOS](../.ci/harmony/2026-11-02-completion/ble-fifo-ios-build-r1-proof.json)
  BLE module/full-app builds pass, both with packaged TS FIFO absent.
  Android has 32 tests total / 9 skipped / 0 failures and unchanged runtime AAR;
  iOS retains its runtime framework. No new mobile-device or radio QA follows.

## Earlier typed-AppUI and Refresh checkpoints

Business-r2 and smoke-r4 retain their named HAP hashes and receipts. Later
typed-AppUI and native Refresh packages now have their own bounded emulator
acceptance. Later worktree changes still need a new artifact and acceptance
proof; full-r2 above does not extend these earlier paths to the paired HAP.

- Native Refresh:
  [build proof](../.ci/harmony/2026-11-02-completion/smoke-refresh-typed-r1-proof.json)
  binds HAP
  `2fd08cba3f8acf4f3acbd91efe91e9840ae14a1c662f43cfb444c2e6f74ba757`,
  native
  `af80a25d44d81e11212b6263f840fa6adc8e5431ebf0473cfc8cc5e9f162922b`.
  [Runtime receipt](../.ci/harmony/2026-11-02-completion/refresh-native-r2-runtime.json)
  and replay pass 39/39 uninterrupted, zero failures/errors/skips. Programmatic
  native spinner has requests 0/no echo; actual pull/release requests once;
  Finish writes false. Disabled initiation preserves taps and child scrolling
  (live offset 168 / row 5). Exit/reentry resets, including navigating out while
  refreshing and reopening at false/true with zero counts.
- Refresh authoring history: original r1 41-step take retains the initial
  unreadable `push Detail` wait and wrong-title unmet wait. R2 re-recorded the
  entire valid 39-step path, then replayed all captured actions/checks unchanged.
  Both spinner images were inspected by the parent. This is one Mate 90 Pro/
  API 26 x86_64 emulator replay using fresh describe points and raw
  `await-ui-element`, not portable QA, hardware, retained-child reparent,
  OS background/resume or shutdown-stress acceptance.
- The Refresh runtime receipt binds app backend53 to
  `/private/tmp/valdi-arkui-refresh-review-freeze/verification.json`, SHA-256
  `b9ad64ebd9ced53b29ab2cd89b0a55a50c40e18018465c4ea5fbf00e5699fbb9`,
  with a matching 53-file rehash at that checkpoint. The reusable fork's
  74-file slice was reviewed clean but was not adopted in that Refresh HAP.
  Original four lean/full two-ABI links remain historical-snapshot evidence.
  Full-r2 above has a separate rebuilt paired runtime and development pass;
  Refresh 39/39 remains accepted only on its older backend53 artifact.
- Typed-AppUI business:
  `business-typed-promise-r1-proof.json` / `business-typed-promise-r1-runtime.json`
  bind HAP `194fa98882b2ed8e69d2f432939dfe77c7b73e79f53f49aea90b924a72615b38`
  and native `8ba3896d353e5e6a72402dfe26714471a92deb7cf875dc88eecf940e50fd4e81`.
  Its separate 16/16 uninterrupted replay accepts typed bootstrap, logout
  cancel/confirm and restart auth/storage behavior, not all AppUI operations or
  radio services. Original locked-screen/setup/secret-fixture failures are
  retained. The shared TS BLE FIFO remains; runtime is still legacy lean.
- OTA host/process/resource selection and route-confirmation wiring have
  source/SDK/helper evidence at
  `/private/tmp/harmony-ota-integration-freeze-b1r3zt4c/integration-proof.json`.
  Config is absent and OTA remains disabled; enabled update/rollback acceptance
  is pending. See [current limits](VALIDATION.md) and the parent-owned
  [fork integration record](../docs/harmony-fork-integration.md).

Earlier business-r2 and smoke-r3/r4 package-specific checkpoints:

- Final business-r2 checkpoint: `business-native-r2-proof.json` binds HAP
  `a4a8b699292c37dd90831fd0e131d4afb4f9f93d5a6475c1c390caef37f3fba4`
  and native library
  `8cbe73351574cc808ae301960a148718be265533006a9d56bc47544d21b03b9d`;
  its receipt records unchanged inputs. Generated `c+` host/module interfaces
  now use public `ValueTypedProxyObject` wrappers, preserving their schemas.
  `/private/tmp/harmony-platform-bootstrap-proof-final/proof.json` records
  both-ABI strict links, 11 native, 14 Node-API and five official Valdi/JSC
  boundary tests, covering all 52 generated methods and 14 events; independent
  source review is clean. That host proof is separate from live Hermes execution.
- `business-r2c-recorded.yaml` / `business-r2c-replay.log` pass 23/23
  uninterrupted, zero failures/errors/skips: Login, original InputCheck native
  chevron/back, synthetic demo login, logout cancel retaining Home, restart Home,
  logout confirm Login and restart Login. Storage opens 1→2 are observed; the
  latest process has zero Valdi error lines. Demo fixtures were removed and
  the app is left signed out.
- Editable/queued modals and background cancellation have broader live-only
  observations. The long `business-r2b-replay.log` failed at 15 passed / 1 failed /
  40 skipped because scroll-dependent coordinates differed. Original recording,
  the incorrect substring-hidden check and polish, `qa-090.log`'s pre-dispatch
  invalid gesture, and the initial fixture source-path/setup failure remain
  preserved. No complete broader modal-suite pass or portable QA is claimed.
- `integrated-tests-final.json` / `.log` record root `pnpm test` 180 passed,
  zero failed, one opt-in skip and matching binding goldens. This root run
  predates the later native-port fix; the separate frozen proof above covers it.
  Picker/date/time/bottom sheet/image preview live QA, hardware, enabled OTA,
  live hot reload, native page factories/sheets/covers and video remain outside
  this accepted checkpoint. OTA source integration is recorded separately above.

- Their completion evidence is under `.ci/harmony/2026-11-02-completion/`.
  R3 HAP `de02fc8b7a5753831cecb2327a07ad4ab6360334d0d139caa2e2602ace67b875`,
  native `742e4a2d12730216558bfbc41318e87bf039a600f30fb3c9c22020160a19b0df`,
  passes 23/23 uninterrupted image steps: packaged/direct A→B, visible native
  PNG→JS base64→native decode, and restored custom icons.
  `images-r3-recorded.yaml` is retained unchanged; `images-r3-polished.yaml`
  removes one authored wrong wait for an image observer that direct LoadedAsset
  replacement does not re-fire. `qa-046.log` and `images-r3-polish.json` preserve
  that authoring error. This is not a passing result for the original bad wait.
- R4 HAP `3e219e32b4f2400fdc3f51855686930cdb1bcfd821bc8fe8aa16bb13499cae95`,
  native `b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7`,
  passes 14/14 filter steps: none/invert/grayscale/invert+blur/none, five loads,
  zero failures. The parent inspected gold inversion, grayscale and blur
  screenshots. Acceptance is visual and fixture-scoped, not exhaustive numeric
  parity or vendor/public-source identity.
- The source correction pairs official `GetImageInfo`/`GetAlphaMode` (API20+)
  instead of default-field `GetAlphaType`; unknown alpha is not relabeled.
  `/private/tmp/valdi-harmony-image-alpha-proof/proof.json` freezes 25 test groups
  and 58 imported SDK symbols per ABI, with assets unchanged across r4 and
  business-native-r1 builds.
- The earlier `business-native-r1.hap` built with HAP
  `170b28e673937af2784f5351bbb2b1ef55eca1343a06d736d2f8e312e273efc5`
  and the same r4 native library, but live startup failed. The first native error
  was `setValueToGlobalObject`: “Cannot convert type typed object to proxy object”;
  `qa-063.log` shows missing `__harmonyBusinessBootstrap`. A dedicated child owns
  the marshaller-boundary fix, now completed with the separate r2 proof above.
  R1 remains a failed checkpoint; only r2's recorded logout path is accepted.
  OTA loader integration, hardware services, video and the other limits below
  remain pending.

Earlier completion-r2 checkpoint:

- Completion-r2 evidence is frozen under `.ci/harmony/2026-11-02-completion/`.
  `smoke-native-r2-proof.json` identifies HAP
  `a431156f064a87272c2f53d7c4b72e9288dd9c258b38076a99bfb3f12107d784`
  and native library
  `080bc53b13033cca801f319b4f17993673edef7b146d6d25eaf171a2fe47c8f9`.
  The receipt reports no changed inputs. Runtime JSON and the uninterrupted
  replay establish 58/58 on HarmonyOS 7/API 26 x86_64 emulator geometry, not
  portable selector QA or complete media acceptance.
- Native glyphs/rich runs are visible in the home/foundation/custom-bar
  screenshots. Official→custom 56/88vp→official switching does not crash in the
  reproduced path; empty custom-root regions pass page clicks through and tab
  counts remain retained. Official Tabs are ArkTS SDK components with no C
  factory; default controls are 48vp plus system bottom. Custom example heights
  do not add to page insets.
- R2 PNG signature and 1168x420 IHDR checks and opaque JS ref returns pass; live
  C++ native-ref consumption remains unaccepted. R3 later establishes the visible
  PNG base64/native decode round trip.
  RCP POST JSON, seven-byte binary PUT, PATCH and cancellation pass eight checks
  on this artifact; no HTTP version is forced.
- **At r2, plain images failed new filter-alpha validation**:
  `smoke-r2-native.log` lines 233–238 and `smoke-r2-image-failure.png`.
  Image-fixture icons/PNG preview were absent. R3/r4 restore and visually accept
  the listed paths; that later proof does not turn the r2 failure into a pass.
- C API AppUI source and owner review are complete; its business live pass is
  pending. Real BLE/Wi-Fi/NFC/permission service source has typed-port tests and
  SDK checks; hardware behavior remains unvalidated.
- OTA isolated core/packager source is implemented and reviewed; the reserved
  `latest.json` update-ID issue is fixed with four packager tests. Host/resource
  loader/launch-confirmation integration and hot reload remain pending.
- The mount-reentry freeze proof at
  `/private/tmp/valdi-arkui-mount-reentry-freeze/verification.json` covers 172
  imports for both ABIs and source/helper validation, with clean source review.
  The reproduced custom-root switch passes on r2; arbitrary teardown timing and
  physical-device behavior remain outside that proof.

Earlier integration results below keep their original package scope:

- Typed routing is integrated across shared TS, generated Android/ObjC/C++
  bindings and all three native hosts. Startup returns `RouteDeclaration`;
  params/results use detached dictionaries. The common runtime patch preserves
  booleans and special own keys. Final Android/iOS application builds pass,
  as do ten Android and five Foundation ownership regressions.
- Harmony's tab bar now overlays a full-window native surface with native blur.
  System safe areas and tab obstruction are delivered independently to pages;
  keyboard overlap is reconciled on startup/foreground. Native geometry probes
  prove the title's top inset and have been removed from the final package.
  The earlier typed smoke recording passes 47/47. Package-specific evidence is
  at the top of [VALIDATION.md](VALIDATION.md); prior counts below are historical.
- Scroll, image, and input validation routes are enabled in the smoke sources.
  Earlier packaged image pixels and a module font rendered on the emulator;
  the current image regression is listed above. The
  input backend fixes the three reviewed r2 P2 issues. The completed bounded
  setter-echo policy anchors its 500ms deadline to native setter completion,
  passes fifteen negative controls and has a clean second review. Noninstrumented
  foundation QA passes idle set/clear + `abc` 9/9, focused set 3/3 and ten writes
  21/21, with change count remaining 1. Final canonical 19-step input replay passes; the original r3 failure cause is unproven.
- The fixture builder packs a real `res.assetcatalog`, the existing tab PNGs,
  and `res/roboto_mono_regular.ttf`. Seven module/route/option checks pass.
- Packaged image bytes resolve through the private
  `valdi-rawfile://<module>/<logical-resource>` scheme. Its Bytes loader reads
  `rawfile/assets/<module>/<logical-resource>.png` or `.webp` on the runtime
  worker queue; the runtime's existing adapter supplies those bytes to image
  decoder factories.
- The platform overlay adds `ImageHarmony = 8` without renumbering existing
  output types. JavaScript image-output resolution selects the same value.
- ArkTS passes its actual `filesDir` to mount. The runtime uses
  `<filesDir>/valdi` as its persistent owned root. Secure synchronous TokenStore
  is separately implemented with OS AssetStore. Diagnostic business QA proves
  demo-login session restoration after process restart and storage opens 1→2;
  the final canonical eight-step business replay also passes.
- New host rawfile/resource, NAPI, and persistent-root code compiles against
  real SDK headers for both target ABIs, with strict ARM64 host/runtime link
  evidence. Recorded runtime proof is x86_64 emulator-only; no physical run.
- `regression-foundation-final.log` records passing root `pnpm test` groups
  (39/5/93) and binding comparisons. `contracts-foundation-final.log` records
  seven smoke/option checks; `business-contracts-final.log` records eleven
  business contract checks at that earlier checkpoint. The later
  `business-contracts-lazy-fix.log` records fourteen tests using real Rolldown
  output and the pinned ModuleLoader; independent review is clean.
- Native Shape is implemented with 131 imported SDK symbols checked for both
  ABIs and a real builder fixture. See
  [SHAPE_API.md](entry/src/main/cpp/backend/SHAPE_API.md). Device Shape acceptance
  passes the final seven-step InputCheck submission/back replay.

## First native scroll checkpoint

The first integrated HAP built and ran on the Windows Mate 90 Pro emulator.
Its SHA-256 is
`e2b44aaa27b65e7a66d5a2f0c5ee32b900817e9620643e85e845515a12017105`.
Live checks reached a real native ScrollView, tapped a content row, scrolled
vertically and horizontally, jumped immediately to 600 points, animated back
to zero, and returned to the retained Home page.

This package predates the reviewed scroll lifecycle fixes and current resource/
SQL fixture changes. It is an intermediate checkpoint, not final acceptance.
Evidence and the recorded path are under
`.ci/harmony/2026-11-02-elements/`.

Three scroll review findings have since been fixed with production journal
regressions and both-ABI compilation: geometry-only content updates preserve
active sequences, stale settling targets cannot block a new sequence, and
consumed lifecycle notices survive deferred delivery across cancellation.
The second review found two further orderings, now fixed: historical End
delivery preserves a newer animation's runtime flag, and drag corrections wait
for the matching native layout revision. A third review found no remaining
defect in this scope. The updated emulator path grew 24 rows to 40 during a
drag, settled at 200 points with one start/end pair, tapped row 4 and returned.
Its complete 11-step recorded replay passed.

The native HTTP adapter and SDK image decoder have separate two-ABI compile/link
proofs and sanitizer tests. Image metadata uses JavaScript number values and
the required `type: "image"` discriminator. Native image attachment and shared
font registration are implemented. The first display HAP exposed a missing
`onImageDecoded` binding; that binding and a reentrant font-style ordering fix
are included in the input backend's 94-symbol verification. Subsequent foundation
HAP evidence proves packaged/direct A/B image attachment and replacement,
`onImageDecoded`, and shared module-font rendering/measurement. Equal `iiii` and
`WWWW` widths are 48.285713 points. Baidu HTTPS returned 200/6617 bytes and decoded
202x66; invalid bytes take the failure path. Earlier failed image checkpoints
remain in the evidence.

ClientSQL/SQLite and actual generated bindings build for both ABIs; all 34
unchanged pinned native SQL tests pass on macOS. The HAP target now retains the
pinned factory's static registration before `RuntimeManager::postInit()`, and the
HBC builder includes `client_sql`. The emulator wrote count 1, restarted the
process, and read/incremented the same database to count 2.

The real application starts BLE event registration, ClientSQL opening, and
synchronous token-presence checking before selecting login/home. Database
support can reuse the pinned portable ClientSQL implementation. A separate
business bootstrap must also suppress the route declaration's early default
root publication until `startApp()` has selected the authenticated root. That
separate builder/bootstrap now passes fourteen business contract checks and stages
actual HBC99 application/runtime modules. The native host selects this profile
from package metadata and installs app-owned BLE event registration, typed
unsupported BLE/permission Promise surfaces, OS AssetStore TokenStore,
StorageHost, and loading/toast AppUI before calling the real startup.
Implementation and focused reviews are complete for that native host scope.
`promise-live-runtime.log` and `promise-live-proof.json` independently establish
live Hermes consumption: 31 real Promise rejections and three WeChat checks.
Closed/released-owner device phases have not run. The signed-out Home-before-Login
bug is fixed with a forwarding navigation facade that suppresses lazy route
publication until startup returns its auth-selected declaration, then forwards
retained facade calls normally. Real Rolldown/ModuleLoader checks and independent
review cover this behavior. `business-lazy-startup-runtime.log` records only the
Login context before sign-in.

On the diagnostic native business package, demo Login→Home passes 6/6,
process restart restores the session through real OS AssetStore, business
storage opens increase 1→2 (`qa-071.log`, `qa-072.log`), and loading→toast→hide
passes 4/4. `business-auth.yaml` has a complete uninterrupted eight-step passing
replay (`business-auth-replay.log`), requiring a fresh install and synthetic QA
secrets. `business-checkpoint-runtime-proof.json` identifies that diagnostic
package; the final canonical eight-step replay also passes. Smoke SQL and business storage
are separate persistence proofs.

The HTTPS diagnostic and domestic control evidence is recorded in
[NETWORK_VALIDATION.md](NETWORK_VALIDATION.md). No protocol, proxy or TLS policy
was changed in order to obtain the successful control responses.
Current acceptance uses domestic endpoints only. See `VALIDATION.md` for the
remaining unsupported capabilities and exact pending verification boundaries;
the parent will append final canonical evidence after final device execution.

The separate plain ArkTS/native input comparison now has an uninterrupted
`input-probe-current.yaml` replay: four groups / eleven nested actions pass in
`input-probe-replay.log`. Both editors produce correct `abc`. Programmatic
setters demonstrably deliver delayed change echoes carrying the newly
registered target ID (`input-probe-runtime.log`); this passing diagnostic replay
did not by itself establish a production echo fix. Later noninstrumented
`input-final-idle-abc.log`, `input-final-focused-set.log` and
`input-final-ten-writes.log` establish the 9/9, 3/3 and 21/21 checkpoint results.
The latter uses argument-file transport that actually executes all ten writes.
The earlier `input-ledger-repeat.log` exceeded the Windows command length limit
and did not execute; it is excluded from repeated-pass evidence.

The earlier input checkpoint is preserved as `foundation-input-checkpoint.hap`,
SHA-256 `8f58c06ef5304b413c04e70c559d06ba71fefd7730a60db7882adb3070e885f5`.
It predates the now-complete nullable-factory runtime fix. The superseding
package and final runtime results are recorded below; the historical InputCheck
crash remains in `business-input-check-cppcrash.log`.

## Final core build checkpoint

The nullable-factory runtime overlay is complete, has two clean source reviews,
and passes native cache/preloader regressions and both-ABI strict links.
The final complete ARM64 host/backend/assets/business strict link also passes.
Final smoke and canonical business HAPs share native SHA-256
`a6ff242d52c68d7f27a39255309f28d13852d1f86de8cc5b1ff3600dedc8c9d8`;
see [VALIDATION.md](VALIDATION.md) for exact package identities and device status.
The first final input replay executed zero app steps because the target HDC
transport hung. That environment failure is preserved separately from app QA.

The superseding smoke package now passes the recorded input walkthrough and
uninterrupted 19/19 replay (`input-final-stable-replay-r2.log`). Exact user-change
counts use single-character commits; the previous multi-character assumption
and transient unreadable-tree failures are preserved as failed attempts.

The final canonical business package passes the complete eight-step demo
auth/session/storage/loading replay and seven-step original InputCheck/Shape
submission/back replay. The chevron is visually confirmed in `shape-final.png`.
`final-acceptance.json` binds all results to the final packages. Remaining
capabilities and physical/release limits remain listed in VALIDATION.md.
