# Harmony integration into the maintained Valdi fork

## Current development source: local Harmony

On November 3, 2026, the user selected local-first iteration. The application's
`harmony/entry/src/main/cpp/backend`, `assets`, and `host` directories are the
development source for subsequent Harmony changes. Do not copy each change into
the maintained fork during this phase. Keep that worktree as a read-only
dependency and historical integration snapshot; preserve its existing dirty
changes and receipts.

The entry build profile explicitly selects
`VALDI_HARMONY_USE_FORK_UI_ASSETS=OFF`. Selecting a fork runtime remains separate
from selecting its UI/assets: a development build may consume the read-only fork
core while compiling the local UI/assets. Use a fresh CMake build directory when
changing a previously configured selection; do not reuse or erase historical
build evidence.

After the local implementation and its validation are stable, prepare one
reviewable port into the maintained fork under a separate user instruction.
Neither source copy is deleted. The paired-fork results below describe earlier
frozen inputs and do not validate later local changes.

## Historical paired-fork integration

Status: reviewed fork source and bounded x86_64 emulator acceptance, November 3,
2026. No fork commit, remote update or dependency-pin change has been made.
The first current-fork full-development HAP built and installed, but startup failed:
official DEV DebugConsole called the unsupported `Device.getDisplayHeight`,
causing a render error and the intentional uncaught-JS abort. The corrected r2
HAP passes startup, input/navigation replay, CDP breakpoint/continue, CPU capture,
Valdi trace export, reversible JavaScript hot reload, and background/resume checks.

An isolated integration worktree now exists at
`/Users/cloud/.config/superpowers/worktrees/Valdi-node-only/harmony-platform-20261102`,
on branch `harmony-platform-20261102`, starting at the application's exact pin
`15feb6530ceecb971f4c8519ea8ab77474b959db`. The original checkout and its branch
are unchanged. Device/platform, runtime profiles, factory/preloader lifetime,
map/image prerequisites, reusable ArkUI and reusable image assets are implemented,
frozen and independently reviewed. Default application builds still use the
existing pin and local runtime. Explicit fork application consumption is opt-in;
its source gates, host admission and both-ABI object checks pass. The paired fork
libraries now run in the r2 HAP on the API26 x86_64 emulator. Broader component
parity and physical-device acceptance remain separate.

The paired application selection is now implemented and independently reviewed
without findings. `VALDI_HARMONY_USE_FORK_UI_ASSETS` defaults to OFF; ON selects
both fork libraries and excludes both local source groups. Both ABI configure
and object checks pass, including cache identity and wrong-parent controls.
See [paired adoption](harmony-fork-ui-assets.md) for the original source/object
proof. The later linked HAP and runtime proof below extend that bounded evidence.

The first current-source HAP is
`.ci/harmony/2026-11-02-completion/business-full-development-r1.hap`, SHA-256
`1a170ae9fc6c741fb1248e8763f53141d1031d1030646790ab393448a434e96e`;
its native library is
`d83a73d64add0e58229fd3d31927708b22b9c19beacdfb9c37e02dce79b521ac`.
It uses original backend53/assets25 and the development modules preceding BLE
TS FIFO removal. The separate `full-development-r1-runtime-failure.json`
seals startup logs, matching native build ID, symbolication, and transport
cleanup. Its build-only proof remains unchanged. The display getter fix uses
actual SDK dimensions and density, with an explicit `native_display_manager`
link dependency. The fix is included in r2.

The corrected artifact is `business-full-development-r2.hap`, SHA-256
`36b5cc6ab1e7bf3cd5bfc9fdc751cee7a256fdf86f8050c0977dbb13c67479d5`;
its native library is
`0bd8a22088726695a9a9bc9837348e82347e2ad1a826c00e31ba0f49648a944d`.
It links current maintained-fork sources consistently with the 616-byte context,
selects fork ArkUI/assets together, and packages the reviewed FIFO-free BLE TS.
The build reports no source drift. The runtime report and additional seal are
`.ci/harmony/2026-11-02-completion/business-full-development-r2-runtime.json`
and `business-full-development-r2-runtime-seal.json`.

Recorded acceptance is deliberately bounded:

- The login/input/navigation flow passes all 11 top-level replay steps, with
  nested workload sequences; background/resume passes a separate four-step
  fragment replay. Native-uitest checks and live-tree coordinates are specific
  to the tested emulator geometry.
- Actual CDP pauses in `isSignedIn` at the generated location mapped to
  `//app_pages/src/auth.ts:45:4`, resumes, and passes before/after no-pause controls.
  The pinned shim flushes scripts before an unsupported `runIfWaiting` reply;
  pinned Hermes omits breakpoint hit IDs. Both protocol details and the exact
  location/control evidence are retained. No editor attachment is claimed.
- The normalized CPU profile contains 1,008 samples and 39 nodes, including an
  application render frame. Of those samples, 1,006 are root/idle samples; this
  validates capture/export and is not a performance benchmark.
- The exported Valdi trace contains 181 events: nine Renderer events and 172
  native events on two recorded thread IDs, with zero drops and no timeout.
  Raw and Perfetto JSON are retained. This is not OHOS system tracing.
- JavaScript HMR changes the visible login heading and restores the original
  bytes. CDP reports script IDs 77, 94 and 95 for the three states. Image-resource
  HMR is untested.
- Backgrounding withdraws the endpoint and owned forwards; resuming supplies a
  fresh endpoint that accepts CDP. Final client shutdown leaves HDC's forward
  listing empty. Controlled native-host destruction/remount remains untested.

Integrated root checks report 286 passes, zero failures, three skips, and matching
binding goldens. Fresh Android and iOS application/module builds include the BLE
FIFO removal. Android records 32 JVM tests with nine skips and zero failures;
the runtime AAR is unchanged. The iOS runtime framework is unchanged. Neither
fresh mobile artifact has new radio/device acceptance, and native runtime-owner
session release remains separate work.

## Post-r2 source alignment

The later [three-platform alignment work](three-platform-alignment.md) uses the
existing Android/iOS business contract and the sibling
`/Users/cloud/project/NativeRoutesHarmony` application's RN/RNOH implementation
as references. It corrects the animation example's Harmony platform selection
and adds the existing `dismissKeyboardOnDrag` Boolean to both local and fork
backends. The latter has focused sanitizer and both-ABI SDK object evidence.
These source changes postdate `business-full-development-r2.hap`; that artifact
and its runtime seal retain their original inputs and do not validate the new
source. A fresh package and appropriate replay are required for runtime claims.
Scanner/attachment operations subsequently gained a generated-proxy/SDK
implementation with focused service/native tests, SDK ArkTS checks and both-ABI
host/presenter object compilation. After three scoped review corrections, fresh
independent review2 is clean and root checks pass 344 tests with three skips
and no failures. Actual system-presenter acceptance remains pending.
Sheet/native-route implementation remains in progress in the alignment
checklist.
The route direct-parameter correction and keyboard focus-generation follow-up
both passed fresh independent review. Root integration checks passed with
316 tests, zero failures, three skips and matching codegen goldens.
The keyboard proof separately records 51 sanitizer scenarios per source owner
and four SDK26 manager objects. None of these later source checks extends the
r2 HAP's device acceptance.

## Frozen implementation evidence

The Device/platform slice contains actual Djinni regeneration, Harmony Device
identification, independent JSX class selection, native attribute binding,
asset output and debugger platform mapping. Its reviewed follow-up also fixes
daemon serialization of `"harmony"` and key-position-only PropertyList removal.
The current receipt is
`/tmp/harmony-fork-review-fixes-20261103-apfu2f1n/final-receipt.json`;
recorded checks include 27 TypeScript tests, seven daemon tests and both-ABI
daemon compilation. Earlier evidence remains preserved. These checks do not
establish native Device event delivery.

The original `valdi/harmony/runtime` snapshot passed four actual SDK26 links:
lean release and full development, each for x86_64 and arm64-v8a. Every owned
archive is included with `--whole-archive --no-undefined --no-gc-sections`.
The full libraries contain the real CDP and WebSocket implementations, absent
from lean; all four use the same release heap configuration. The matrix and
source manifests are retained at
`/tmp/valdi-harmony-runtime-7hl3ei7w/strict-link-matrix.json` and
`final-source-sha256.json`.

These links establish closure for their immutable 1,357-file source snapshot.
Later reviewed source migrations changed the `IJavaScriptContext` and preloader
layouts, so those ELFs do not establish current-source ABI compatibility.
The public C++20 usage requirement was subsequently fixed and reviewed using
external C++17-parent RED/GREEN consumers. Initial configuration/probe failures
and three corrected build-adapter failures remain preserved.

Additional frozen slices:

- `valdi/harmony/arkui`: 74 files; component delegates selected during official
  attribute registration, with direct component update/reset dispatch.
  `/private/tmp/valdi-fork-arkui-freeze-final/freeze-receipt.json` records
  both-ABI compilation and original-snapshot archive closure. The application
  backend53 remains unchanged and has separate 39/39 Refresh emulator acceptance.
- `valdi/harmony/assets`: 46 files; `HarmonyImageAsset` implements the actual
  `ArkUIImageAsset` interface. Its real parent-cast control, 33 host test groups
  across two sanitizer configurations and both-ABI asset closure use fresh
  current-fork support objects. Receipt:
  `/private/tmp/valdi-fork-assets-validation/freeze-receipt.json`.
- Factory/preloader lifetime fixes and six map/image prerequisites have clean
  independent reviews. Their handoffs live under
  `valdi/harmony/tests/{factory-lifetime,map-image-prerequisites}`. The measured
  context ABI increase is 96 bytes; current consumers must rebuild consistently.
- The application full-development host uses exclusive admission through final
  destruction, because the Hermes bridge is process-wide. Native RED/full-GREEN/
  lean-GREEN checks and 14 SDK objects pass. Receipt:
  `/tmp/valdi-app-debugger-lease-validation-20261103-r1/final-receipt.json`.

HDC transport has a clean third review after discovery/retry/cleanup corrections;
44 focused cases are recorded. Development packaging has executed the full
business builder: 11 archives, 231 JavaScript entries and 210 inline maps.
These modules use prepared pinned source plus the verified application overlay,
not a newly published maintained-fork TypeScript package. Neither result proves
live debugger attachment, CPU samples, traces or hot reload on its own. The
separate r2 artifact evidence above establishes the stated emulator checks.

## Verified starting point

- The application consumes `cloud2303org/Valdi`, pinned to
  `15feb6530ceecb971f4c8519ea8ab77474b959db` in `valdi/MODULE.bazel`.
- The local fork checkout is `/Users/cloud/project/Valdi-node-only`. Its clean
  `valdiroutes` checkout is at `67e02521ce5bcf88aa0690e300a3135cb84379a4`,
  an ancestor of the application's pin. Migration must use an explicitly chosen
  baseline containing the application's pinned work; it must not reset or
  silently overwrite that checkout.
- `scripts/harmony/prepare-runtime.mjs` extracts the pinned source into
  `.tools/harmony/upstream`; `apply-platform.mjs` applies the Harmony overlay.
  The staged directory is generated input, not the maintained fork.
- The application's pinned fork platform and Device declarations do not contain Harmony.
  The staged overlay adds `PlatformTypeHarmony`, `DeviceSystemType.HARMONY`,
  `Device.isHarmony()`, Harmony JSX class selection, rendering-backend identity,
  and Harmony image output selection.
- The native Device bridge already returns `harmony`. Current Harmony packages
  therefore recognize the platform, but the framework portion depends on the
  application-local overlay.

## Ownership split

| Move into the fork's reusable Harmony support | Keep in this application |
| --- | --- |
| Platform identity, Device APIs and JSX platform selection | Route declarations, auth-selected roots and business bootstrap |
| ArkUI view manager, component bindings and common node lifetime | The generated `app_pages` and application Bluetooth contracts |
| Image loading/filtering, font integration, snapshots and native refs | Native navigation policy, page factories, Tab configuration and business padding |
| Native HTTP implementation behind the official request interface | App endpoint, public key, release identity and storage policy |
| Generic runtime initialization, dispatch and platform lifecycle mechanisms | UIAbility composition and application-specific service registrations |
| Reusable OS adapters with framework-owned interfaces | Adapters still depending on generated application models, until those dependencies are separated |

Do not copy the complete `host` or `platform` directories into the fork.
`PlatformServiceCodec.cpp` currently imports generated `app_pages` and Bluetooth
schemas. `HarmonyRuntimeHost` also knows the business bootstrap and app navigator.
These dependencies must be inverted or remain application adapters.

The framework entry point should accept native configuration, module factories,
resource providers and bootstrap instructions. It must not hardcode this
application's login page, routes or `harmony_business/src/app`.

## Work sequence

1. Preserve the original accepted packages and source freezes. Refresh now has
   39/39 emulator replay acceptance; OTA is source-reviewed and remains disabled.
2. Keep the isolated baseline and all reviewed migrations frozen while building
   the current full-development runtime and application with matching headers.
   Its build graph is fresh; historical runtime archives are not reused.
3. Prove real HDC discovery, a mapped breakpoint/continue, CPU profile export,
   Valdi trace export, TS/resource reload and lifecycle cleanup.
4. Adopt `Valdi::HarmonyArkUI` and `Valdi::HarmonyAssets` together through an
   explicit application option. Exclude both local implementation source lists
   and select the fork headers consistently. The concrete image type retains
   its name but changes parent; mixing old and new definitions is invalid.
5. Rebuild and replay rendering, images, input, scrolling, Refresh, snapshots,
   navigation and business authentication against the adopted library targets.
6. Migrate remaining reusable HTTP/lifecycle support only behind framework-owned
   interfaces; application model-dependent adapters remain local.
7. Reduce equivalent application source rewrites after actual fork consumption
   is accepted. Publication, commits, dependency-pin and registry updates remain
   separate future work; none is authorized or performed by this local migration.
   ABI-affecting adoption requires matching platform exports and application
   rebuilds.

Native source moves and dispatch refactoring need their own review. Existing
source/helper checks must remain distinct from new artifact and device results.
Use the existing input, text, scrolling, Tab, snapshot, HTTP and business-auth
checks as behavioral regressions. A directory move alone is not acceptance.

## Device integration

The maintained framework should expose the same ordinary usage as its other
platform branches:

```ts
Device.getSystemType() === 'harmony'
Device.isHarmony()
```

Tests must check positive Harmony detection and negative Android/iOS detection,
independent `harmonyClass` selection, display size/scale and lifecycle events.
Do not select Android classes or claim unrelated Device methods are supported.
The current bridge explicitly rejects several Device capabilities; filling those
is separate work requiring the actual SDK and runtime evidence.

## OTA scope and current boundary

The active OTA work updates signed `.valdimodule` archives, source maps and the
supported image resources. Hermes executes the modules' compatible HBC. It does
not replace Hermes, the ArkUI backend, native bindings, or shared libraries.
Native ABI/HBC changes require a matching application release.

The current source work wires process-wide package selection, resource loading,
rollback, shutdown, and confirmation after successful initial native route
acceptance. It is not yet a newly built and accepted end-to-end OTA application.
At this audit the staged business rawfiles contain no `valdi_ota.json`; absent
configuration is disabled. A real endpoint, signing configuration, compatibility
record and trustworthy binary identity are still release integration inputs.

Generic signed-package storage and selection can be reusable library support.
Business startup acknowledgement, release configuration and publication policy
remain application responsibilities.

## Full Hermes development and tracing support

This is part of the requested fork integration. The original fork snapshot
passed both profiles' two-ABI strict links. Current-source application and selected
live tooling checks now pass for the r2 x86_64 emulator artifact described above.
The historical four-link matrix remains evidence for its original snapshot.

The default legacy application remains lean. The maintained full-development
source includes the real compiler/API/CDP/JSI, debugger and WebSocket closure,
DEV/tracing generation, Harmony daemon identity, enabled host debugger/hot reload,
and exclusive full-host admission. Its application configuration and both-ABI
host object checks pass. The complete r2 HAP links current runtime and paired
UI/assets sources; arm64 device execution remains outside that acceptance.
The pinned full profile also uses `NDEBUG` and `-O3`: those flags alone do not
distinguish profiles; compiler/API/CDP closure and feature definitions do.

Retain these separate implementation and acceptance boundaries:

- Keep the lean release profile and introduce a complete development runtime
  profile using the pinned Hermes source manifests, matching configuration
  headers, JSI/API/debugger dependencies and generated bytecode.
  The pinned full closure replaces `LEAN_BACKEND_SRCS` with `COMPILER_SRCS`,
  includes `API_SRCS`, `CDP_SRCS` from `hermes.BUILD`, JSI, ZIP and extensions
  bytecode, and enables `HERMES_ENABLE_DEBUGGER`, `HERMES_MEMORY_INSTRUMENTATION`,
  `HERMES_API` and `VALDI_HAS_WEBSOCKET_SERVER` on their appropriate targets.
  Preserve the matching release heap model throughout. API/CDP exception flags
  differ from the VM's `-fno-exceptions` flags and must stay target-scoped.
- Wire Hermes debugger registration and CDP transport through actual Valdi
  interfaces. Verify source-map-backed breakpoints, pause, inspection, continue,
  and teardown on the Harmony runtime.
- Enable and test JavaScript CPU profiling through the supported profiler path.
  A successful start call alone is insufficient: export and inspect a nonempty
  profile from real application work.
- Wire Valdi/native tracing and its supported collector/export path separately.
  JavaScript profiling, Valdi rendering/layout trace events, and OS scheduling
  traces must retain their individual evidence boundaries.
- Extend daemon platform negotiation, device discovery, development module
  transport and reload lifecycle where required. Debugger attachment does not
  by itself establish hot reload.
  This fork uses the Node development pipeline instead of the disabled legacy
  compiler hot-reload entry points. Add HDC discovery/forwarding and debugger
  endpoint handling to that actual pipeline, plus development module output
  with usable source maps; keep release HBC output unchanged.

Removing `HERMESVM_LEAN` or changing one app-level debug boolean cannot establish
this support. Both runtime profiles need their own two-ABI compile/link checks;
development capabilities additionally need live attachment and usable exported
profile/trace evidence. Existing full/lean host marshalling tests do not provide
OHOS debugger or tracing acceptance.

The existing OS tracing emitter is `NullEmitter` on OHOS. Native Valdi recorder
exports can be wired first; HiTrace/OS scheduling correlation requires a separate
adapter. Hermes' POSIX sampler also adds actual `SIGPROF`, thread-signal and
semaphore dependencies that need OHOS execution tests, not just symbol closure.
