# HarmonyOS native host

This is an experimental ArkUI C API host for the pinned Valdi C++ runtime.
The separate **full-development-r2 business HAP** now builds the current
maintained fork with paired ArkUI/assets and passes scoped live acceptance on
the Windows Mate 90 Pro/API 26 x86_64 emulator. Actual CDP exchange and a mapped
auth breakpoint with causal controls, CPU capture/export, Valdi trace export,
visible JavaScript HMR with exact-byte restoration, and background/resume
reattachment pass. Its UI replay has 11 top-level steps with nested
input/navigation workloads; the resume fragment separately passes 4/4.
These results do not establish complete protocol compliance, performance
benchmarking, OS tracing or full renderer parity. See
[the sealed checkpoint](VALIDATION.md#paired-fork-full-development-r2-checkpoint--2026-11-03).

The default entry point is `harmony_smoke/src/app.start()`, compiled with the existing
Node TSX pipeline and the pinned Hermes HBC 99 compiler. It uses the application's
existing typed route declarations, `NavigationHost`, `PageViewModel`,
`PageContext`, and `Page` lifecycle through a scoped routing fixture.
The pinned ClientSQL/SQLite implementation is linked and registered, with an
app-owned persistent directory. A separate business profile implements the real
application HBC bootstrap, native startup services, secure synchronous tokens,
storage, and AppUI loading/toast integration. Live Hermes Promise QA has passed
31 real rejections and three WeChat classifications. Earlier packages established
demo sign-in, OS AssetStore session restoration, persistent storage,
loading/toast, native input and shape rendering. Current startup returns a typed
route declaration and publishes the auth-selected root once; route definition
is pure. The final business-r2, completion-r3/r4 and earlier package identities and
acceptance results are recorded at the top of [VALIDATION.md](VALIDATION.md);
the older checkpoints remain there as historical evidence.
The earlier completion-r2 smoke checkpoint passes 58/58 emulator steps for its
recorded path. Superseding r3 restores packaged/direct A→B images, custom icons
and a visible native PNG→JS base64→native decode round trip, with 23/23 replay.
R4 passes 14/14 for none/invert/grayscale/invert+blur/none, five successful loads
and zero failures. This is fixture visual acceptance, not exhaustive numeric
parity or proof that the vendor binary matches audited public source.
Business-native-r2 fixes r1's typed-interface marshaller failure using public
`ValueTypedProxyObject` wrappers while preserving generated schemas. Its clean
auth replay passes 23/23: Login, original InputCheck/chevron/back, synthetic demo
login, C API logout cancel/confirm and process-restart state. Storage opens 1→2
are observed. Edited/queued modals and background cancellation have additional
live-only evidence; the broader r2b replay failed and is not a full modal-suite
pass. Picker/date/time/bottom-sheet/image-preview live acceptance and real
BLE/Wi-Fi/NFC hardware behavior remain pending. The later typed-AppUI business
package passes its separate 16/16 auth/modal replay. Native controlled Refresh
now passes 39/39 on the Mate 90 Pro/API 26 x86_64 emulator: programmatic spinner
without request echo, actual pull/release, Finish, disabled initiation with child
taps/scrolling, and exit/reentry including leaving while refreshing. Each pass
is tied to its own artifact.
OTA core, packager and host/loader/route-confirmation wiring have source/SDK/helper
proof. Configuration is absent, OTA remains disabled, and enabled update
acceptance remains pending. Visible JavaScript hot reload is separately accepted
on full-development-r2; resource-image reload is not.
Build and emulator evidence is recorded in
[VALIDATION.md](VALIDATION.md).
The ongoing completion phases and intermediate checks are recorded in
[PORTING_PLAN.md](PORTING_PLAN.md).

## Build on Mac

Install the official Mac ARM Command Line Tools and set
`DEVECO_CLI_CLT_PATH` to its `command-line-tools` directory. The build script also
discovers installations under `~/Library/Huawei/<version>/command-line-tools`.
The SDK and Java must be usable on the host; simulator images are not required.

```sh
pnpm build:harmony
```

The initial HAP targets the Windows emulator's `x86_64` ABI. The native wrapper
also accepts ARM64 (`arm64-v8a`); use a separate CMake build directory for that ABI.
The runtime source/dependency staging requirements and native build commands
are documented in [runtime-build/README.md](runtime-build/README.md).

Expected HAP path:

```text
harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

An unsigned HAP is for emulator validation. It is not a production signed
release or evidence of physical-device installation.

## Runtime boundaries

- `runtime-build/` builds the portable Valdi runtime, Yoga, protobuf, and the
  patched Hermes lean VM. It excludes SnapDrawing, JNI, and Apple wrappers.
- `entry/src/main/cpp/backend/` implements native nodes and view transactions.
- `entry/src/main/cpp/host/` owns UI dispatch, resources, runtime instances,
  device/application bridges, native navigation, and the NAPI boundary.
- `scripts/harmony/apply-platform.mjs` applies the Harmony platform additions
  to a writable export of the pinned fork. The common lossless dictionary patch
  is also registered in the pinned Bazel archive for Android/iOS; fetched sources
  are never edited by hand.
- `tools/valdi-rolldown/harmony.ts` rebuilds the platform-patched runtime JS
  modules, the shared routing sources, and the validation pages into HBC archives
  for the HAP.

## Routing

`HarmonyNavigator` installs the existing `NavigationHost` before application
module evaluation. One runtime serves the whole navigator; each page owns a
separate Valdi context/tree and page-scoped `finish`/`back` callbacks. Native owns
the stack, cancellation/results, retained tab instances, and visibility updates.
ArkTS observes native snapshots, hosts official Tabs or the custom Valdi bar, applies
status-bar style, and forwards system Back. At the root, Back falls through to
normal Harmony behavior.

Route declarations, transition options, page models and stack entries use the
generated Valdi models. Parameters and results use structured dictionaries,
with route-specific TypeScript types and native snapshots at ingress. Routing
does not serialize messages as JSON; ArkTS navigation snapshots are objects.
`startApp` synchronously returns `RouteDeclaration`, and defining routes has no
publication side effect. Debug reload explicitly publishes the new declaration.
See [the shared ABI](../docs/typed-routing-contract.md).

Official ArkUI Tabs overlay the full-size native content surface; this SDK has no
C factory for Tabs. Their default controls occupy 48vp plus system bottom.
System/cutout/indicator obstructions are combined by maxima. Official-tab pages
receive system bottom plus 48vp; ordinary pages receive only system bottom.
Custom 56/88vp bars are business examples, and their height is not added to page
insets. The overlay does not resize the content surface. Keyboard
RESIZE reduces the viewport, hides tabs and removes bottom/tab obstruction
insets; current keyboard overlap is reconciled on foreground entry.

Supported operations are `push`, `pushForResult`, `replace`, `back(delta)`,
`popToRoot`, `reset`, `switchTab`, `currentPages`, and declaration updates. Route
updates rebuild the root and discard covered pages while preserving a still-valid
root route and selected tab, matching the existing application contract.

The initial presentation is `push`. Sheets, fullscreen covers, and native page
factories are explicitly unsupported. Push and single-page back/finish support
`slideRight`, `slideUp`, `fade`, and `zoom`; `default` uses slideRight/300ms.
`none` or duration 0 applies immediately. Replace/reset/multi-pop/tab selection
settle an active transition and apply immediately.

The ArkUI backend implements Valdi `animate()` / `createAnimation()` for layout
frames, opacity, background color, point radii, translation, scale, and rotation.
Timing curves include the four standard curves, custom cubic Bezier, and a
unit-mass spring. Cancellation freezes the presentation and completes once with
the cancellation flag. Plain text/style changes inside an animated update apply
immediately. See [backend animation contract](entry/src/main/cpp/backend/ANIMATION_API.md).

The smoke fixture copies the actual routing sources at build time and supplies
small validation pages. The separate business profile stages the real application
and calls `harmony_business/src/app.start()` after installing its native services.
The host selects the profile from the packaged bootstrap metadata.
See [smoke/README.md](smoke/README.md) for its exact bootstrap, components, and
checks; application code continues to use `defineRoutes` and `router`.

The three platform identifiers have distinct roles: C++ `PlatformTypeHarmony`
selects runtime behavior, JS platform `6` selects JSX classes, and native
`Platform::Harmony` identifies ArkUI view wrappers. The native rendering backend
is JS backend `4`. Harmony built-ins use logical names such as `view` and `label`;
custom native views use `harmonyClass`.

ArkTS supplies its actual `filesDir`, and the runtime uses `<filesDir>/valdi`
as its owned persistent disk root. ClientSQL and the Bytes loader use that root.
The business profile uses OS AssetStore through `AssetTokenStore` for synchronous
`has`/`read`/`write`/`clear`, without a plaintext fallback. Synthetic demo-login
session restoration and business storage persistence across process restart
are proven on the diagnostic package, not across uninstall or on physical
hardware. The auth replay requires a fresh install and synthetic QA secrets.
Unsupported platform
services report errors. Video remains unimplemented. The separate
full-development-r2 checkpoint accepts visible JavaScript hot reload within
its recorded scope; default legacy packages retain their earlier boundaries.

The native Scroll backend supports vertical/horizontal scrolling, runtime
content-size/offset synchronization, immediate/animated ref offsets, drag and
scroll callbacks, paging, indicators, and basic bounce controls. See
[scroll contracts](entry/src/main/cpp/backend/SCROLL_API.md).
Controlled pull-to-refresh uses
`custom-view` with `harmonyClass="ArkUIRefreshView"` around one direct vertical
Scroll,
with business-owned `refreshing`, `enabled` and `onRefresh`.
Programmatic true shows the native spinner without a business request;
the observed pull/release requests once and Finish writes false.
Disabled initiation preserves child taps and scrolling, including live
offset 168 / row 5. See [Refresh contract](entry/src/main/cpp/backend/REFRESH_API.md)
and [artifact-specific validation](VALIDATION.md).
The finite replay does not accept retained-child reparenting, OS
background/resume, shutdown stress or all native follow-drag/settling behavior.
Packaged image bytes resolve through a private rawfile scheme; native image
decoding and HTTP download are registered through Valdi's existing asset-loader
pipeline. Earlier packages proved native image attachment, packaged/direct A/B
replacement, and module-font rendering/measurement. The earlier domestic Baidu
HTTPS control returned 200 with 6617 bytes and decoded to 202x66 pixels.
R2's plain-image alpha-validation failure remains historical evidence; r3
restores plain/direct images and preview decode, and r4 accepts the listed filter
fixture visually. The source now pairs `GetImageInfo` with official API20+
`GetAlphaMode`, rather than the distinct default `GetAlphaType` metadata field.
It does not relabel unknown alpha values or convert pixels to satisfy validation.
The frozen assets proof covers 25 test groups and 58 SDK imports for both ABIs;
its source is unchanged across the r4 smoke and business-native-r1 builds.
The staged platform overlay unwraps context-attached loaded assets
before the runtime reads their metadata. See [validation evidence](VALIDATION.md)
for checkpoints and remaining image/font limits.

Attributed native labels now render real styled runs; see
[label contract](entry/src/main/cpp/backend/LABEL_API.md). Ordinary-node snapshots
return PNG bytes with a verified signature and 1168x420 IHDR in the r2 run, and
opaque native-ref JS objects are returned. R3 additionally proves visible PNG
base64 round-trip/native decode. Live native-ref C++ consumer resolution remains
unaccepted; PNG display does not establish every bitmap-consumer path.
See [snapshot/ref contract](entry/src/main/cpp/backend/SNAPSHOT_REF_API.md).
RCP HTTP POST JSON, PUT binary (seven bytes), PATCH and cancellation pass eight
checks on the same artifact, without forcing an HTTP version or changing proxy/TLS
policy.

Keyboard overlap comes from the owning Window's `keyboardHeightChange` observer,
converted from pixels to logical points and delivered through the existing
`Application.observeKeyboardHeight` contract. Native single/multiline editors
are implemented; live focus, keyboard overlap and correct `abc` editing are
recorded on the x86_64 emulator. Setter echo handling now uses a bounded 500ms
policy anchored to completion of the native setters, with fifteen negative
controls and a clean second review. Temporary diagnostics and text fingerprints
are removed. The noninstrumented foundation checkpoint passes idle set/clear
then `abc` (9/9), focused set (3/3), and ten programmatic writes (21/21), with
the change count staying at 1. The old r3 failure's cause remains unproven.
See [input contract](entry/src/main/cpp/backend/INPUT_API.md). Floating keyboards need not
produce the same overlap notifications as fixed keyboards.

Native `shape` / `ArkUIShapeView` path fill and stroke are implemented through
Drawing, with both-ABI source/SDK checks (131 imports) and a fixture from the real
TypeScript builder. The earlier elements business package renders the original chevron
and passes the seven-step InputCheck submission/back replay. Gradient fill, partial strokes and path morphing remain unsupported.
See [shape contract](entry/src/main/cpp/backend/SHAPE_API.md).

Input uses real ArkUI tap/double-tap, long-press, pan, pinch, and rotation
recognizers. The existing Valdi props control disabled state, synchronous
predicates, custom hit testing, subtree touch enablement, and extended bounds.
Raw touch start/change/end runs alongside recognizers, with optional delayed
observation. NORMAL native arbitration gives admitted descendant drags precedence;
rejecting their predicates permits ancestor fallback. Pinch/rotate/pan on the
same node can run together.

Left-edge back directly moves both native page roots with the finger. A canceled
preview keeps the same stack, context, visibility and pending result; a committed
release runs a native settlement animation and completes the normal back result.
The host preserves/restores the window's original system gesture-back policy.
See [gesture contracts and differences](entry/src/main/cpp/backend/GESTURE_API.md)
and [interactive navigation](entry/src/main/cpp/host/NAVIGATION_API.md).
Native recognition thresholds follow ArkUI, and compatible gestures on different
nodes remain subject to its arbitration. This does not reproduce every internal
UIKit/Android detector detail or complete the other Valdi native element classes.

The recorded source/SDK checkpoints cover both native ABIs; ARM64 has strict
whole-archive link proof. Runtime acceptance is on the Windows x86_64 emulator
only. Production signing and physical-device execution remain unvalidated.
The earlier completion-r4 smoke HAP has SHA-256
`3e219e32b4f2400fdc3f51855686930cdb1bcfd821bc8fe8aa16bb13499cae95`,
native SHA-256
`b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7`.
Its 14-step filter replay is distinct from r3's 23-step image replay and r2's
58-step broader walkthrough; all use geometry-specific coordinates because
Harmony's runner has no selector tree. They are not portable QA.

The superseding business-native-r2 HAP has SHA-256
`a4a8b699292c37dd90831fd0e131d4afb4f9f93d5a6475c1c390caef37f3fba4`,
native SHA-256
`8cbe73351574cc808ae301960a148718be265533006a9d56bc47544d21b03b9d`.
Its receipt records unchanged inputs; `business-r2c-replay.log` passes all
23 auth-group steps uninterrupted with no failures/errors/skips. The latest
process has zero Valdi error-level lines, and the final recorded app state is
signed out. Generated demo fixtures were removed. The separate longer r2b run
has 15 passed, 1 failed, 40 skipped because scroll-dependent coordinates missed
a control; broader modal observations are live-only and are not portable QA.
See [validation scope](VALIDATION.md) for the frozen both-ABI/engine proof and
remaining acceptance limits.
Business-r2 and smoke-r4 results remain tied to their immutable hashes/receipts.
The later Refresh smoke HAP, `smoke-refresh-typed-r1.hap`, has SHA-256
`2fd08cba3f8acf4f3acbd91efe91e9840ae14a1c662f43cfb444c2e6f74ba757`,
native SHA-256
`af80a25d44d81e11212b6263f840fa6adc8e5431ebf0473cfc8cc5e9f162922b`.
[Its runtime receipt](../.ci/harmony/2026-11-02-completion/refresh-native-r2-runtime.json)
records 39/39 uninterrupted with zero failures/errors/skips and a matching
53-file app backend rehash against proof SHA-256
`b9ad64ebd9ced53b29ab2cd89b0a55a50c40e18018465c4ea5fbf00e5699fbb9`.
The parent inspected both native-spinner images. R1's original 41-step take
retains its unreadable initial wait and unmet wrong-title wait; r2 re-recorded
the entire valid 39-step path and replayed its captured actions/checks unchanged.
Later worktree changes are not covered by these package-specific passes.

The earlier reusable fork ArkUI freeze has 74 reviewed files. The Refresh HAP
above still uses original backend53/legacy lean and retains its 39/39 acceptance
only on that artifact. The later `business-full-development-r2.hap` adopts paired
fork UI/assets with a fresh current-source full-development runtime build:
HAP SHA-256
`36b5cc6ab1e7bf3cd5bfc9fdc751cee7a256fdf86f8050c0977dbb13c67479d5`,
native SHA-256
`0bd8a22088726695a9a9bc9837348e82347e2ad1a826c00e31ba0f49648a944d`.
The build receipt records zero input drift. It includes the 616-byte context
layout, SDK display-getter fix, full CDP/WebSocket support and BLE TS FIFO
removal. The original four strict links remain historical-snapshot proof.

The [sealed runtime report](../.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime.json)
records mapped-breakpoint controls and pinned protocol quirks, a mostly idle
CPU capture (1,009 raw / 1,008 normalized samples, 39 nodes, 1,006 root samples),
181 Valdi process trace events on two threads, and visible LoginPage HMR with
script IDs 77→94→95. CPU export is not a benchmark; Perfetto JSON is not OS
tracing. Background removes endpoint/owned forwards, resume attaches on new
ports with PID 27154 unchanged, and final client stop leaves forwards `[Empty]`.
Full-r1's DEV `getDisplayHeight` startup abort and failed bring-up takes remain
retained. No controlled destroy/remount, original-source editor UI,
resource-image HMR, paired Refresh/image/filter/ref parity, ARM64 device or
physical BLE acceptance is claimed. Legacy defaults and smoke rawfiles are
restored; OTA remains disabled. See [validation boundaries](VALIDATION.md)
and the parent-owned
[fork integration plan](../docs/harmony-fork-integration.md).

Latest Android/iOS BLE module and full-app builds also pass with packaged TS
FIFO absent. Android reports 32 tests total / 9 skipped / 0 failures and an
unchanged runtime AAR; iOS retains its runtime framework. These package/build
results add no fresh mobile-device or radio QA.

The earlier business-native-r1 HAP shared r4's native library but failed startup:
`setValueToGlobalObject` reports “Cannot convert type typed object to proxy
object”, followed by missing `__harmonyBusinessBootstrap` (`qa-063.log`).
That failure remains historical evidence; r2 fixes the actual interface/proxy
boundary and separately accepts the recorded C API logout cancel/confirm path.

The earlier completion-r2 smoke HAP has SHA-256
`a431156f064a87272c2f53d7c4b72e9288dd9c258b38076a99bfb3f12107d784`,
native SHA-256
`080bc53b13033cca801f319b4f17993673edef7b146d6d25eaf171a2fe47c8f9`.
Its build receipt reports unchanged inputs; its uninterrupted 58-step replay
ran on the HarmonyOS 7/API 26 x86_64 emulator. It uses geometry-specific
coordinates because Harmony's runner has no selector tree; it is not portable QA
or overall media acceptance. R3/r4 add their own image/filter acceptance above.

The earlier elements smoke HAP has SHA-256
`0f0d805a0cadb2f2f85bbb0804a0d1c0671964ce3e5ecdb5399e7ca15f048080`;
the corresponding earlier business HAP has SHA-256
`2a8295c784b14ae46ccd51c813d9d56bc1426ec86ab45ff61fa54bc44474aaba`.
Both share the same noninstrumented native library and reviewed nullable-factory
runtime fix. Input 19/19, business auth/AppUI 8/8 and original InputCheck/Shape
7/7 uninterrupted replays passed on those packages. They do not verify the new
C API AppUI business path or hardware services.
The exact unsupported and pending matrix is in [VALIDATION.md](VALIDATION.md).
Network acceptance uses domestic endpoints only, without protocol, proxy or TLS
policy changes; earlier failed diagnostics remain historical evidence.

## Validate on Windows

Build on Mac, transfer the HAP, and use Argent with the connected Harmony
device id from `list-devices`. The emulator tested for this project is a
configured Mate 90 Pro instance; select its actual connected id at run time.
Use `reinstall-app`, `launch-app`, `describe`, and coordinates from fresh returned
accessibility frames for taps. Harmony's e2e runner has no semantic selector
tree: retain raw `tool: await-ui-element` checks against the live tree.
These recordings are specific to this emulator geometry, not portable QA or
physical-hardware acceptance.

The routing acceptance path starts at `Harmony routes / Home`, increments its
counter, pushes typed detail parameters, returns a result, switches between
retained tabs, and exercises stack operations and lifecycle visibility.
`HARMONY_ROUTE` native logs include route/page IDs and lifecycle events.
The animation page exercises timing curves, springs, cancellation, and leaving
while a property animation is running. `HARMONY_ANIMATION` contains bounded
samples from actual ArkUI callbacks and a native frame count.
This checks native input -> Hermes JS -> native navigation -> Valdi -> ArkUI. Merely
building a static archive, linking a shared library, or opening the ArkTS host
does not prove that path.
