# Harmony routing fixture

The current full-development acceptance is a separate **business** HAP,
`business-full-development-r2.hap`, with paired fork UI/assets and a freshly
built maintained-fork runtime. Its 11 top-level UI steps include nested
input/navigation workloads; its resume fragment passes 4/4. Actual CDP/mapped
breakpoint controls, CPU capture/export, Valdi trace export and visible
JavaScript HMR are accepted within [the sealed validation scope](../VALIDATION.md#paired-fork-full-development-r2-checkpoint--2026-11-03).
This does not relabel the smoke Refresh/image/filter/ref paths as paired-HAP
passes. Legacy defaults and smoke rawfiles have been restored.

Native bootstrap: install the real `NavigationHost` with
`installNavigation` from `app_pages/src/NavigationHost`, then require
`harmony_smoke/src/app` and call its exported `start()` with no arguments.
It passes `routes.toHost()` directly to the real `NavigationHost.updateRoutes`
and returns that same typed `RouteDeclaration` object for host inspection.
Startup publishes once; duplicate calls return the saved object. `defineRoutes`
has no publication side effects. Development reloads use `routes.publish()`;
the bootstrap registers the pinned ModuleLoader's `onHotReload` observer and
loads fresh route exports before publishing. The Retained tab explicitly
publishes its modified declaration.

The build stages a scoped module named **app_pages**, copying these real
sources unchanged from `valdi/modules/app_pages/src`:
`NavigationHost.ts`, `Page.ts`, `PageComponent.ts`, and `navigation/**`,
including the exported `navigation/models.ts` ABI.
Only `routes.ts` and validation pages come from `harmony/smoke/app_pages/src`.
The full business application's bootstrap and app-owned business services use
the separate `harmony_business` profile. This smoke fixture does include the
real pinned ClientSQL module and a persistent restart counter; it does not
substitute fake native business modules.

The route transform resolves actual `@Component` classes to canonical
paths and removes eager component/resource imports. Tab icons come from the
existing `app_pages/res` PNGs. The build uses the transform's inline icon
bytes (`iconData`/`selectedIconData`) so the ArkTS bar can decode these
without an additional resource path. The same real PNGs are also staged in
`rawfile/tab-icons/{tab_home,tab_home_on,tab_components,tab_components_on}.png`,
with the source `@3x` suffix removed. Text-only tabs remain a host fallback.
Official ArkUI Tabs are implemented in ArkTS because the SDK has no C Tabs
factory. They overlay the full content viewport; official-tab pages receive
48vp controls plus the system bottom obstruction in their bottom inset.
Ordinary pages receive only system insets. Custom business bars demonstrate
56/88vp heights, but those heights are not added to page insets. Pages apply
the delivered insets once.

## Typed context boundary

The native host links the canonical generated C++ route/page models and uses
the official `CppMarshaller` for declarations, options, view models, contexts,
and stack entries. It delivers new view models for visibility/inset changes.
The smoke module copies the same shared TypeScript contracts:

- View model: `pageId`, `route`, dictionary `params`, `presentation`,
  `insets: {top,bottom,left,right}`, `visible`, `visibilityReason`.
- Context: native-backed callable `finish(result)` with a dictionary and `back()`.
- Global host: exactly the methods in the copied `NavigationHost.ts`.

Route declarations use a `RouteEntry[]`; params, results, resolved navigation,
and `StackPage[]` cross the bridge as typed values. Nested dictionaries/arrays
use Valdi's dictionary/any marshaller (`any` in the exported ABI resolves to
`UNTYPED_MAP`; application route generics remain typed). Cancellation carries `{}` and `true`,
distinct from a successful empty result. JSON in lifecycle/debug labels is
display-only.

`SmokePage.onCreate()` checks that the actual view model and both context
callbacks reached the component. It throws if the host creates a bare
counter-like context instead. The actual `Page` base handles onShow/onHide,
visible-effect cleanup, and status bar requests; `HARMONY_ROUTE` logs carry
page IDs, routes, counts and lifecycle reasons. The real console transformer
guards these logs with `runtime.isLoggingEnabled`; enable runtime logging
when collecting lifecycle evidence.

## Validation path

- Increment Home, switch to Retained, increment it, switch back. Each tab
  must keep its own count and page ID; logs must show tab hide/show reasons.
- Push typed detail from either tab. Finish returns `{visited: id}`;
  cancel/page-back returns `undefined`. The opener displays the result.
- Push the next detail, then open Stack actions. `back(2)` returns to the
  first detail. Open Stack actions again and replace it with detail #42;
  the label verifies the replacement params. `popToRoot` returns to tabs.
- On Stack actions, reset opens a new `reset` root with the originating
  page ID in params. Back at that root leaves it present. Reset-to-tabs
  recreates the shell; switch-to-tab can also reopen it from a plain root.
- Stack labels refresh on show, and Stack actions has an explicit refresh.
  `HARMONY_ROUTE` currentPages entries include the full page IDs/params.
- Retained's publish button changes its tab text, using the real
  `publishRoutes`/`updateRoutes` path; incrementing its count changes the
  text selected for the next publication. Host preserves the selected tab
  and current root route, rebuilding contexts and resetting their local state.
- Home's animation entry fades into the property-animation page. It exercises
  layout, opacity, background, radius, translation, and scale with standard and
  custom curves, a spring, and cancellation. The five-second linear option
  provides time to inspect intermediate presentation or leave while it runs.
- Animation's zoom detail and Stack's slide-up/immediate detail buttons exercise
  per-call route presets. Ordinary pushes use default slideRight/300ms.
- Home's gesture entry opens six compact modes: tap/double/long press,
  drag/raw touch, pinch/rotate, hit testing/extended bounds, and nested drag
  arbitration, plus synchronous raw-touch reentry. Disabled and predicate controls apply to each gesture family.
  The remove-in-predicate control replaces the target during synchronous
  admission, exercising the native callback's reentrancy boundary.
- Drag mode records raw start/end counts and cumulative displacement, with an
  optional 0.3s touch delay. Transform mode records multiplicative scale and
  radians using the actual `valdi_tsx/src/GestureEvents` types. Nested mode
  switches the child's predicate between rejecting and accepting so parent
  fallback and child capture can be observed separately.
- Hit mode initially omits custom `hitTest`, isolating the native 30pt extension
  with a 45pt left override. Enabling custom hit testing uses explicit local
  bounds; returning `true` unconditionally replaces the bounds test and can
  legitimately accept touches over other controls. Parent controls independently
  exercise disabled and false-hit-test subtree pruning.
- Reentry mode uses the real `makeMainThreadCallback` export. Normally its
  `onTouch(Ended)` disables the target; `onTouchEnd` must still run once.
  The alternate scenario changes delay from `onTouchStart`, then disables
  from `onTouchEnd`: the old raw sequence must terminate exactly once.
- Push detail from Gesture, drag from the left edge a short distance and hold
  before releasing: the detail/page ID and unresolved result must survive.
  A drag beyond the commit threshold returns to Gesture and cancels the result
  once. A later normal finish must still deliver its typed result. Native
  `HARMONY_INTERACTIVE_BACK` diagnostics record actual input progress and poses.
- Home's scroll entry exercises real vertical/horizontal nodes, immediate and
  animated offsets, content growth during drag, snap settlement and child taps.
  The current recorded path grows 24 rows to 40, settles at 200, taps row 4 and
  returns Home; all eleven replay steps passed.
- Scroll's Refresh entry opens the controlled native pull-to-refresh fixture.
  `custom-view` with `harmonyClass="ArkUIRefreshView"` wraps one vertical Scroll;
  business owns `refreshing`, `enabled` and `onRefresh`. Programmatic true
  displays the native spinner at requests 0 without echo; actual pull/release
  requests once and Finish sets false. Disabled initiation still permits child
  taps and scrolling (live offset 168 / row 5). Exit/reentry resets state and
  counts, including leaving while refreshing and reopening at false/true with
  zero counts. The separate 39-step replay passes uninterrupted with no
  failures/errors/skips; see [Refresh contract](../entry/src/main/cpp/backend/REFRESH_API.md).
- Home's resource checks load packaged bytes, packaged image decode and the
  domestic Baidu HTTPS image. On earlier packages the control returned 200/6617 bytes and decoded
  202x66 without protocol, proxy or TLS changes. ImagePage switches packaged
  sources and direct loaded-asset A/B images, exercises load/decode/error
  callbacks, and renders/measures the packaged mono font (`iiii` and `WWWW`
  both measure 48.285713 points).
  Completion-r2's plain-image alpha-validation failure remains historical.
  R3 restores packaged/direct A→B images, custom icons and visible native
  PNG→JS base64→native decode; its polished replay passes 23/23.
  R4 passes 14/14 for none/invert/grayscale/invert+blur/none with five successful
  loads and zero failures. These are visual fixture checks, not exhaustive
  numeric parity or proof of vendor/public-source identity.
- The completion-r2 home, foundation and custom 56/88vp bar screenshots show
  actual native glyphs and styled runs. The recorded custom→official return
  passes without a crash, page taps pass through empty custom-root regions,
  and tab counts remain retained.
- Snapshot/ref checks verify a PNG signature and 1168x420 IHDR plus opaque JS
  reference objects. R3 additionally verifies visible PNG base64/native decode;
  live C++ reference-consumer resolution remains unaccepted. Foundation's RCP POST JSON, seven-byte
  binary PUT, PATCH and cancellation sequence completes eight checks without
  forcing an HTTP version.
- Home's input entry uses real native field/area nodes with value, selection,
  focus, submit and keyboard controls. After the three r2 fixes, setter echo
  handling now uses the completion-anchored 500ms bounded policy, with fifteen
  negative controls and a clean second review. The noninstrumented foundation
  checkpoint passes idle set/clear + `abc` 9/9, focused set 3/3, and ten writes
  21/21 with change count remaining 1. Original r3 causation remains unproven;
  the final canonical smoke replay also passes 19/19.
- Home's SQL check writes count 1 and, after process restart, reads/increments
  the same database to 2. This does not establish business/token persistence.

Routes/components are `home` → `HomePage@app_pages/src/HomePage`,
`second` → `SecondTabPage@app_pages/src/SecondTabPage`,
`detail` → `DetailPage@app_pages/src/DetailPage`,
`stack` → `StackPage@app_pages/src/StackPage`, and
`reset` → `ResetPage@app_pages/src/ResetPage`, and
`animation` → `AnimationPage@app_pages/src/AnimationPage`, and
`gesture` → `GesturePage@app_pages/src/GesturePage`,
`scroll` → `ScrollPage@app_pages/src/ScrollPage`,
`image` → `ImagePage@app_pages/src/ImagePage`, and
`input` → `InputPage@app_pages/src/InputPage`, and
`refresh` → `RefreshPage@app_pages/src/RefreshPage`. `$tabs` is the real
`defineRoutes` shell, with `home` selected initially.

## Backend scope

The fixture uses `view`, flattened layout, native attributed/plain `label`, scroll/image
nodes and single/multiline native editors. Tappable views serve as buttons.
The builder packs the real asset catalog, tab PNGs, module font and ClientSQL.
Harmony navigation supports native default/slideRight, slideUp,
fade, zoom, and immediate none. Property animations use Valdi's actual animation
API and ArkUI native frame callbacks. Unsupported options fail validation.
Native Shape fill/stroke/path support also has source/SDK checks for both ABIs
and a fixture generated by the real builder; the earlier elements business package
also passes the seven-step InputCheck submission/back replay. See
[SHAPE_API.md](../entry/src/main/cpp/backend/SHAPE_API.md) for the exact contract,
including unsupported gradients, partial strokes and morphing.
The exact remaining unsupported/pending matrix and package-specific evidence
are in [VALIDATION.md](../VALIDATION.md). Both-ABI source/link verification is
distinct from x86_64 emulator execution; no physical-device run is claimed.
See [label contract](../entry/src/main/cpp/backend/LABEL_API.md) and
[snapshot/ref contract](../entry/src/main/cpp/backend/SNAPSHOT_REF_API.md) for the
implemented APIs and remaining limits. R3 image/preview and R4 filter fixture
acceptance supersede the r2 failure without establishing complete media parity.

## Build and validation

The separate full-development-r2 business HAP has SHA-256
`36b5cc6ab1e7bf3cd5bfc9fdc751cee7a256fdf86f8050c0977dbb13c67479d5`,
native SHA-256
`0bd8a22088726695a9a9bc9837348e82347e2ad1a826c00e31ba0f49648a944d`.
Its [runtime report](../../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime.json)
and [seal](../../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime-seal.json)
bind the current 616-byte-context/full-CDP/WebSocket runtime, paired fork
UI/assets, updated no-FIFO BLE JS and zero-drift build to the Windows API 26
x86_64 emulator. Full-r1's DEV `getDisplayHeight` startup abort is preserved;
the cleanly reviewed SDK getter/native-display link fix enables r2 startup.

The development pass includes actual mapped auth breakpoint pause/resume with
no-pause boolean controls before installation and after removal. Pinned
`runIfWaitingForDebugger` flushes scripts but replies unsupported, and absent
Hermes hit IDs require exact frame/reason matching plus controls; neither
quirk is complete protocol compliance. CPU export has 1,009 raw / 1,008
normalized samples, 39 nodes and a LoginPage render frame, with 1,006 root
samples: mostly idle capture/export, not benchmarking. Valdi trace exports
181 events (9 Renderer / 172 native), two threads, zero drops/no timeout;
Perfetto JSON is not OS tracing. Visible LoginPage HMR applies/restores exact
bytes, script IDs 77→94→95. Background clears endpoint/owned forwards, resume
attaches through new ports with PID 27154 unchanged, and final client stop
leaves forwards `[Empty]`.

The 11-step UI result counts top-level steps with nested input/navigation,
and the 4-step resume replay is a separate fragment. Original failed takes
remain preserved; UI polish removes only the documented unmet pre-input
assertion after a CLI sequence was rejected without execution. No controlled
host destroy/remount, editor original-source UI, resource-image HMR, paired
Refresh/image/filter/ref parity, ARM64 device or physical BLE pass is claimed.
Latest Android/iOS BLE builds separately package JS without TS FIFO; Android
reports 32 tests total / 9 skipped / 0 failures with unchanged runtime AAR,
and iOS retains its runtime framework. There is no fresh mobile-device/radio QA.

The later Refresh checkpoint is `smoke-refresh-typed-r1.hap`, HAP SHA-256
`2fd08cba3f8acf4f3acbd91efe91e9840ae14a1c662f43cfb444c2e6f74ba757`,
native SHA-256
`af80a25d44d81e11212b6263f840fa6adc8e5431ebf0473cfc8cc5e9f162922b`.
[Build proof](../../.ci/harmony/2026-11-02-completion/smoke-refresh-typed-r1-proof.json)
and unchanged-input receipt are separate from
[refresh-native-r2-runtime.json](../../.ci/harmony/2026-11-02-completion/refresh-native-r2-runtime.json)
and its 39/39 uninterrupted replay, 48,306ms, zero failures/errors/skips.
The parent inspected `refresh-native-programmatic-r1.png` and
`refresh-native-pull-r1.png`. The disabled-child logs record offset 168 / row 5;
the replay asserts row visibility and request/tap counts without fixing offset.
All evidence is under `.ci/harmony/2026-11-02-completion/`.

The original `refresh-native-r1-recorded.yaml` retains all 41 steps, including
the unreadable initial `push Detail` wait and unmet wrong-title
`Native scroll geometry` wait. R2 re-recorded the entire executed 39-step valid
path through the recorder. Its original capture, finish receipt, author-step
receipts and final `refresh-native-r2-polished.yaml` preserve all captured
actions/checks unchanged for replay. This is not removal of failed unreadable
r1 steps to obtain a pass.
Points came from fresh `describe` frames on the Mate 90 Pro/API 26 x86_64
emulator; live waits stay raw `tool: await-ui-element` because Harmony's runner
has no semantic selector tree. One geometry-specific replay does not establish
portable QA, hardware behavior, retained-child reparenting, OS background/resume,
shutdown stress or exhaustive disabled follow-drag/settling behavior.

The runtime receipt records all 53 app backend files matching
`/private/tmp/valdi-arkui-refresh-review-freeze/verification.json`, SHA-256
`b9ad64ebd9ced53b29ab2cd89b0a55a50c40e18018465c4ea5fbf00e5699fbb9`.
This Refresh HAP uses that original backend and legacy lean runtime; it does
not adopt the independently reviewed 74-file fork slice. The separate full-r2
business HAP above supplies paired-fork build and bounded development evidence.
Original four lean/full runtime strict links remain historical-snapshot proof;
source review alone is not runtime acceptance. OTA config remains absent and
disabled; typed AppUI/services are included in this older smoke HAP, but its
39/39 replay accepts Refresh only.

Earlier image/filter checkpoints under `.ci/harmony/2026-11-02-completion/` are
`smoke-native-r3.hap` (HAP SHA-256
`de02fc8b7a5753831cecb2327a07ad4ab6360334d0d139caa2e2602ace67b875`,
native `742e4a2d12730216558bfbc41318e87bf039a600f30fb3c9c22020160a19b0df`)
and `smoke-native-r4.hap` (HAP SHA-256
`3e219e32b4f2400fdc3f51855686930cdb1bcfd821bc8fe8aa16bb13499cae95`,
native `b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7`).
Their runtime JSON and replay logs establish 23/23 image and 14/14 filter steps,
respectively, on the x86_64 HarmonyOS 7/API 26 emulator. They retain the
coordinate/raw-live-wait limitation; they are not portable selector QA.

`images-r3-recorded.yaml` preserves the original capture; the replay uses
`images-r3-polished.yaml`, excluding one incorrect authoring wait for an
onAssetLoad notification that direct LoadedAsset replacement does not re-fire.
The failure and correction remain in `qa-046.log`, `qa-047.log` and
`images-r3-polish.json`. R4's `filters-r4-recorded.yaml` cycles
none/invert/grayscale/invert+blur/none; the parent visually inspected inversion,
grayscale and blur. No exhaustive pixel parity or vendor source identity is
claimed.

The alpha correction pairs official API20+ `GetImageInfo`/`GetAlphaMode`, rather
than treating `GetAlphaType`'s default field as current mode; no alpha relabeling
is used. `/private/tmp/valdi-harmony-image-alpha-proof/proof.json` freezes 25 test
groups and both-ABI 58-import checks. Assets are unchanged across the r4 smoke
and business-native-r1 builds.

The earlier frozen completion-r2 checkpoint is `smoke-native-r2.hap` under
`.ci/harmony/2026-11-02-completion/`, HAP SHA-256
`a431156f064a87272c2f53d7c4b72e9288dd9c258b38076a99bfb3f12107d784`,
native SHA-256
`080bc53b13033cca801f319b4f17993673edef7b146d6d25eaf171a2fe47c8f9`.
`smoke-native-r2-receipt.json` records unchanged inputs.
`smoke-native-r2-runtime.json` and `smoke-r2-replay.log` record 58/58 steps
uninterrupted on HarmonyOS 7/API 26 x86_64 emulator. The recording
`smoke-r2-recorded.yaml` uses coordinates and raw live-tree checks because
Harmony's runner has no selector tree; this is not portable QA. The passing
recording explicitly excludes image decode/pixel acceptance. See
`smoke-r2-native.log` lines 233–238 and `smoke-r2-image-failure.png` for the
then-observed plain-image failure. r1 blank-label and custom-root crash evidence is
retained in `smoke-native-r1-runtime.json` and the failed recordings/logs.

The backend mount-reentry freeze verifies 172 imports for both ABIs with source
checks and helper regressions at
`/private/tmp/valdi-arkui-mount-reentry-freeze/verification.json`. The replay
establishes the reproduced switch path only. Earlier business-native-r1 startup
failed: its HAP
`170b28e673937af2784f5351bbb2b1ef55eca1343a06d736d2f8e312e273efc5`
shares r4's native library but reports a typed-object/proxy conversion failure
at `setValueToGlobalObject`, followed by missing `__harmonyBusinessBootstrap`
in `qa-063.log`. That failure remains preserved; the superseding r2 fixes the
actual generated-interface boundary with public `ValueTypedProxyObject` wrappers,
retaining host and Bluetooth-module schemas.

The final business-r2 checkpoint is `business-native-r2.hap`, HAP SHA-256
`a4a8b699292c37dd90831fd0e131d4afb4f9f93d5a6475c1c390caef37f3fba4`,
native `8cbe73351574cc808ae301960a148718be265533006a9d56bc47544d21b03b9d`.
The receipt records unchanged inputs. Its dedicated
`business-r2c-recorded.yaml` / `business-r2c-replay.log` pass 23/23 uninterrupted
with no failures/errors/skips: Login, original InputCheck chevron/back, synthetic
demo login, logout cancel preserving Home, restart Home, confirm logout Login,
and restart Login. Storage opens increase 1→2. The latest process has zero Valdi
error-level lines; demo fixtures were removed and the recorded final app state
is signed out. Screenshots are `business-r2-login.png` and
`business-r2b-inputcheck.png`.

The broader editable/queued/background-cancel modal checks are live-only.
The long r2b replay failed with 15 passed, 1 failed and 40 skipped after
scroll-dependent button coordinates diverged. Its original recording and the
polish correcting one erroneous substring-hidden check remain preserved, as do
the pre-dispatch invalid swipe (`qa-090.log`) and initial fixture source-path
setup failure. The new clean auth group is the passing replay; this does not
establish a complete uninterrupted modal suite or portable selector QA.

The frozen bootstrap proof at
`/private/tmp/harmony-platform-bootstrap-proof-final/proof.json` records
both-ABI strict links, 11 native, 14 Node-API and five official Valdi/JSC boundary
tests (52 generated methods / 14 events), with clean independent source review.
The separate root `integrated-tests-final.json` / `.log` records 180 passed,
zero failed, one opt-in skip and matching goldens; it predates the native-port
fix and does not substitute for that focused proof or the emulator replay.
Picker/date/time/bottom-sheet/image-preview live QA, hardware services, enabled
OTA, video and navigation presentation limits remain pending. The separate
full-r2 JavaScript HMR pass does not extend these earlier artifact scopes.
OTA source integration is recorded separately below.

The later typed-AppUI business HAP has SHA-256
`194fa98882b2ed8e69d2f432939dfe77c7b73e79f53f49aea90b924a72615b38`,
native `8ba3896d353e5e6a72402dfe26714471a92deb7cf875dc88eecf940e50fd4e81`.
`business-typed-promise-r1-runtime.json` records a separate 16/16 uninterrupted
auth/modal/restart pass, zero failures/errors/skips, retaining earlier failed
locked-screen/setup/fixture-secret takes. It includes typed service adapters
and retains the shared TS BLE FIFO, but accepts neither all AppUI operations
nor real radio behavior.

All smoke/business acceptance belongs to its immutable hashes and receipts;
later worktree changes require separate proof. OTA host/process/resource/
route-confirmation source wiring now has both-ABI/helper evidence, but config
is absent and enabled update/rollback acceptance remains pending. The earlier
source-pending descriptions retain their historical checkpoint scope. See
[current validation](../VALIDATION.md) and the parent-owned
[fork integration record](../../docs/harmony-fork-integration.md).

From the project root:

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs tools/valdi-rolldown/harmony.ts
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test tools/valdi-rolldown/harmony-options.test.ts
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs --test harmony/smoke/contracts.test.ts
```

This builds modules only, without a native/HAP build or device operations.
`build-info.json` lists the exact bootstrap and route component names.
The current contracts execute real Rolldown output using the pinned upstream
ModuleLoader in eager and lazy modes. They verify pure declaration evaluation,
one initial typed publication, explicit reload/tab updates, nested params and
results, empty success versus cancellation, and typed stack queries with route
`JSON.parse`/`JSON.stringify` disabled in the VM. Build smoke and business
sequentially after shared model generation; their compiler caches are shared.
The saved `contracts-foundation-final.log` reports seven smoke/option checks;
`business-contracts-final.log` reports eleven earlier business checks; the later
`business-contracts-lazy-fix.log` reports fourteen using actual Rolldown output
and the pinned ModuleLoader. Independent lazy-startup review is clean, and
`regression-foundation-final.log` records passing root `pnpm test`.
All are under `.ci/harmony/2026-11-02-elements/`.

`e2e/harmony-gestures.yaml` records the basic tap/double/disabled/predicate
path. It uses coordinates from the live Mate 90 Pro tree because Argent's
Harmony runner has no selector tree. Its raw `await-ui-element` steps use the
working live uitest tree; they must not be converted to unsupported runner
selectors or `await: {idle: true}`. Long press/rotation and interactive holds
are separate live checks, not claims made by this recorded path.

The elements evidence directory preserves `scroll-current.yaml` and its
eleven-step passing replay. The separate `input-probe-current.yaml` compares
plain ArkTS and native input with no Valdi business bootstrap: its uninterrupted
replay passes four groups / eleven nested actions and both editors produce
`abc`. Its setters also expose delayed callbacks carrying a newly registered
target ID. This comparison is diagnostic proof. Later noninstrumented
`input-final-*.log` sequences establish the 9/9, 3/3 and 21/21 checkpoint results.
The ten-write sequence actually executes through argument-file transport;
`input-ledger-repeat.log` did not execute because the Windows command was too
long and is excluded. Temporary diagnostics and text fingerprints are removed.
Failed resource/image/input checkpoints and incomplete foundation recordings
remain documented in `../VALIDATION.md`.

The separate real-business HAP has verified live Hermes Promise rejection
(31 actual Promises, three WeChat checks); closed/released phases have not run.
The earlier signed-out Home-before-Login defect was fixed by a forwarding
facade in that historical package. Current typed startup uses pure route
declarations and publishes only the auth-selected return. The diagnostic package creates only Login before demo sign-in,
passes Login→Home 6/6, restores the real OS AssetStore session and storage opens
1→2 after process restart, and passes loading→toast→hide 4/4.
`business-auth.yaml` / `business-auth-replay.log` preserve the complete
uninterrupted eight-step replay; a fresh install and synthetic QA secrets are
prerequisites. `business-checkpoint-runtime-proof.json` identifies the diagnostic
native package.

The earlier noninstrumented input checkpoint is now preserved as
`foundation-input-checkpoint.hap`, SHA-256
`8f58c06ef5304b413c04e70c559d06ba71fefd7730a60db7882adb3070e885f5`.
The superseding `foundation-final.hap` includes the reviewed nullable-factory
runtime fix and has SHA-256
`0f0d805a0cadb2f2f85bbb0804a0d1c0671964ce3e5ecdb5399e7ca15f048080`.
Core regression checks and both-ABI strict linking pass; final device replay
and Shape acceptance are recorded in [VALIDATION.md](../VALIDATION.md).
The historical InputCheck crash remains in `business-input-check-cppcrash.log`.

The earlier elements smoke package passes the 19-step recorded input walkthrough and
`input-final-stable-replay-r2.log` uninterrupted replay.
`input-final-stable.yaml` uses single-character user commits for exact counters,
raw accessibility checks and documented Harmony coordinate exceptions.
Original oracle, lock-screen and unreadable-tree failures remain in evidence.

The earlier canonical business package separately passes the eight-step demo
auth/session/storage/loading replay and seven-step InputCheck/Shape replay.
See `business-final-auth-replay.log`, `shape-final-replay.log`, `shape-final.png`
and `final-acceptance.json` in the elements evidence directory.
