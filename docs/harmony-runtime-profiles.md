# Opt-in Harmony app runtime profiles

The app defaults to the existing local **legacy lean** runtime. Its CMake
entry point now supports explicit consumption of the maintained fork's actual
`Valdi::HarmonyRuntime` target. This is source/build integration; it does not
change the Valdi pin, generate or stage modules, replace rawfiles, build a HAP,
or accept debugger/profiler behavior on a device.

The already accepted legacy HAP is a frozen artifact. Changing these source
files does not alter it. The original fork four-link SDK matrix and its source
snapshot remain separate from the current maintained source, which includes
subsequent daemon/platform/factory edits. Do not describe a fresh configuration
or host-object probe as a new four-link proof.

## Selection and caller inputs

Use a fresh CMake binary directory for each provider, fork, profile, ABI and
input-root tuple. The app freezes that tuple in its cache and rejects reuse
with different inputs. Do not copy a legacy cache into a fork build.

| Cache variable / helper environment variable | Meaning |
| --- | --- |
| `VALDI_HARMONY_RUNTIME_MODE` | `legacy` by default; explicitly `fork` to opt in |
| `VALDI_HARMONY_FORK_ROOT` | Absolute maintained source root containing `valdi/harmony/runtime/CMakeLists.txt` |
| `VALDI_HARMONY_PROFILE` | Required in fork mode: `lean-release` or `full-development` |
| `VALDI_HARMONY_EXTERNAL_DIR` | Explicit read-only prepared dependency root |
| `VALDI_HARMONY_PROTO_DIR` | Explicit read-only protoc 29.3 output root |
| `VALDI_HARMONY_WEBSOCKETPP_DIR` | Explicit caller-owned websocketpp root; full requires real headers |

A fork profile/root without `VALDI_HARMONY_RUNTIME_MODE=fork` is an error.
Fork mode without a profile or any of the four roots is an error. An explicit
`VALDI_HARMONY_SOURCE_DIR` must resolve to the selected fork root. Nothing
falls back to `.tools/harmony/upstream` after fork selection.

The helper `node scripts/harmony/profile-config.mjs` emits JSON with a
`cmakeArgs` array. It accepts the variables above as environment inputs, or
`--mode`, `--fork-root`, `--profile`, `--external`, `--proto`, and
`--websocketpp`. Explicit arguments take precedence. CMake itself uses cache
arguments, not shell environment variables; the existing HAP build wrapper
does not automatically forward the helper environment. There is no implicit
change to the current build-profile files.

Example configuration, after the maintained source prerequisites below have
been migrated and reviewed:

```sh
export SDK_NATIVE="/absolute/path/to/sdk/default/openharmony/native"
export FORK_ROOT="/absolute/path/to/maintained/Valdi"
export RUNTIME_EXTERNAL="$PWD/.tools/harmony/runtime-inputs/external"
export RUNTIME_PROTO="$PWD/.tools/harmony/runtime-inputs/generated/proto"
export WEBSOCKETPP_ROOT="/absolute/path/to/caller-owned/websocketpp"
export PROFILE_BUILD="/absolute/path/to/fresh/full-development-x86_64"

"$SDK_NATIVE/build-tools/cmake/bin/cmake" \
  -S harmony/entry/src/main/cpp -B "$PROFILE_BUILD" -G Ninja \
  "-DCMAKE_TOOLCHAIN_FILE=$SDK_NATIVE/build/cmake/ohos.toolchain.cmake" \
  "-DCMAKE_MAKE_PROGRAM=$SDK_NATIVE/build-tools/cmake/bin/ninja" \
  -DOHOS_ARCH=x86_64 -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
  -DVALDI_HARMONY_RUNTIME_MODE=fork \
  "-DVALDI_HARMONY_FORK_ROOT=$FORK_ROOT" \
  -DVALDI_HARMONY_PROFILE=full-development \
  "-DVALDI_HARMONY_EXTERNAL_DIR=$RUNTIME_EXTERNAL" \
  "-DVALDI_HARMONY_PROTO_DIR=$RUNTIME_PROTO" \
  "-DVALDI_HARMONY_WEBSOCKETPP_DIR=$WEBSOCKETPP_ROOT"
```

For fork lean, choose `lean-release` and another fresh output directory.
For legacy, omit all new opt-in flags. Both `arm64-v8a` and `x86_64` remain
the runtime's supported ABIs; they require separate output directories.
SDK/Huawei RCP availability and generated canonical/business bindings retain
their existing configure checks.

No helper downloads inputs, invokes preparation scripts, applies a source
patch, or changes a shared cache. Configure-generated files and dependency
build outputs stay under the supplied binary directory.

## App compatibility gate

Fork selection runs the new helper with `--audit` before adding the runtime.
That audit reads only explicitly supplied cache inputs; unrelated environment
values cannot change its source selection. There is no skip-check flag.

The gate freezes reviewed file hashes for the four C++ lossless-map transport
files and the four nullable-factory/preloader files. These include class-layout
changes, so they cannot be dropped simply because a runtime links. The expected
hashes and reasons are in `requiredRuntimeFiles` in `profile-config.mjs`.
A different maintained implementation, including harmless textual changes,
requires explicit source review and an update to that receipt; a hash mismatch
is a prerequisite failure, not proof that every differing implementation is bad.

The audit also checks the accepted loaded-image behavior: unwrap
`WrappedObject` before casting a `LoadedAsset`, and install a directly loaded
asset only after observer teardown. Those fixes affect
`JavaScript/JavaScriptRuntime.cpp` and `Context/ViewNodeAssetHandler.cpp`.
Full development additionally requires the official manager APIs and both
native Harmony debugger/daemon mappings.

At the initial integration audit, the maintained fork lacked the four
lossless-map runtime changes and the two loaded-image fixes. The factory
child subsequently migrated all four factory/preloader files byte-for-byte.
Both profiles must continue to fail app configuration until the remaining
prerequisites are present. Migrate them in the maintained source under their
owner's scope, then rerun the gate. This integration never applies
`lossless-map-transport.patch` or `apply-platform.mjs` to the fork.

The iOS NSNumber portion of the shared lossless patch is outside this OHOS
runtime ABI gate. Passing it does not prove cross-platform migration.

## Target and ABI ownership

The app links `Valdi::HarmonyRuntime` in fork mode, which brings the real
Hermes adapter, selected engine/API closure and core runtime. Linking only
`valdi_runtime_ohos` would omit the selected engine adapter.

ClientSQL keeps its actual `valdi_clientsql_ohos` target, public native/generated
include directories, bundled SQLite and whole-archive static registration.
The app adds the selected runtime as a public dependency of that target as
well. The official HTTP factory remains a direct app source so its registration
survives static archive extraction before `RuntimeManager::postInit()`.
Canonical `app_pages` binding hashes are still compared before compilation.

The maintained runtime owns the Hermes heap model, feature macros, exception
policy and its source manifests. This app does not rebuild those policies in
another wrapper or raise the VM/websocket targets from C++17. The exported
runtime target's public C++20 requirement reaches consumers while preserving
an unrelated parent's C++17 default.

`full-development` selects the real compiler, Hermes API/CDP/JSI, debugger and
memory instrumentation, Valdi WebSocket transport, DEV and default tracing.
`lean-release` keeps the lean backend and lean API, with no debugger closure.
Both preserve the runtime's release heap ABI, `NDEBUG`, and VM optimization
policy. CMake `Debug` describes the app configuration; it does not select the
full runtime.

## Host development behavior

Only the selected fork `full-development` profile defines
`VALDI_HARMONY_FULL_DEVELOPMENT=1`. The app's unrelated
`VALDI_HARMONY_APPLICATION_DEBUG` still follows CMake `Debug`, preserving the
business bootstrap's existing behavior.

The host uses the actual `RuntimeManager` constructor:

```cpp
// enableDebuggerService, disableHotReloader, isStandalone, debuggerPort
true, false, false, std::nullopt  // full development
false, true, false, std::nullopt  // legacy or fork lean
```

Full development verifies `debuggerServiceEnabled()`, calls
`setApplicationId()` with the exact `bundleName` extracted from
`harmony/AppScope/app.json5` at configure time (currently
`io.valdiroutes.harmony`), and calls `attachHotReloader()` after `createRuntime()`.
Identity is set before the existing `applicationDidResume()` starts transports.
The runtime retains its official default/environment debugger-port resolution.
The host introduces no alternate port policy or guessed debugger methods.
Existing pause/resume, full teardown, HTTP shutdown, OTA selection/confirmation,
and worker/UI lifetime fences remain in their existing paths.

Full development admits **one live or destroying native host per process**.
Managers share the Hermes bridge/debugger transport, so independent managers
cannot safely own debugger start/stop or the daemon port simultaneously. A
private `HarmonyDevelopmentHostLease` is the host's first member: it acquires
before every other member is constructed and releases after all other members
are destroyed. The authority stores only an occupied flag and mutex, with no
host references or callbacks.

A competing full-development constructor throws before retaining NAPI objects
or creating a manager/service. Constructor failures unwind admission normally;
a failure after the host has entered the NAPI map retains it through the
existing asynchronous destroy owner. Pause/resume, UI unmount, worker teardown
and UI release do not release the lease. Await the existing destroy completion
before mounting a replacement. The lease is compiled out of legacy and fork
lean, whose existing NAPI 16-host limit is unchanged. No public mount signature
or NAPI ownership code changes.

Tracing follows the maintained runtime's generated build options and
`VALDI_HARMONY_TRACING`; it is not separately redefined on the host. A full
runtime's recorder events are distinct from OS tracing: OHOS still uses
upstream `NullEmitter`, so this does not implement HiTrace or scheduling
correlation. No usable trace export, CPU profile, breakpoint, pause/continue,
or live hot reload is claimed by configuration/object compilation.

The sibling business packager owns development source output and maps
(`development?: boolean` / `--development`). It does not stage or activate
rawfiles through this integration. The parent must later coordinate matching
native/source-package staging, runtime links, HAP generation and device QA.

## Focused validation and next invocation

```sh
node --test scripts/harmony/tests/profile-config.test.mjs

python3 scripts/harmony/tests/profile-configure.py \
  --fork-root "$FORK_ROOT" --sdk "$SDK_NATIVE" \
  --external "$RUNTIME_EXTERNAL" --proto "$RUNTIME_PROTO" \
  --websocketpp "$WEBSOCKETPP_ROOT" \
  --output "/absolute/path/to/fresh/profile-config-evidence"
```

The driver configures the real legacy app, proves implicit full selection is
rejected, configures real C++17 external consumers of both maintained profiles,
and attempts both real fork app configurations. It checks effective compile
commands, public C++20 propagation, adapter linkage and internal C++17 modes.
Known missing app source prerequisites are recorded explicitly in `results.json`
as `prerequisitesBlocked`; they are not counted as successful app configurations.
Other configure failures stop the driver.

Only after the parent grants a free sequential compiler slot, add
`--compile-host-objects`. This compiles the real legacy host TU, the external
public-header consumer and actual app host TU under each fork profile, one
compiler process at a time. The fork host API probe uses the real ClientSQL
target and caller inputs, without linking or building runtime archives. That
probe does **not** waive the app compatibility gate. Once it passes, successful
real app configurations also compile their actual host command. The driver
does not invoke Ninja builds, link new runtimes, package a HAP, change exports,
or touch rawfiles. Use `--arch arm64-v8a` with fresh output for the other ABI.

Retain logs, `compile_commands.json`, runtime `generated/inputs/manifest.json`,
`results.json`, and object hashes separately from the original four SDK ELFs
and the accepted legacy HAP. The next parent action is to resolve the source
gate and rerun this focused driver before coordinating any larger build.

The exclusive-admission follow-up has source checks that never invoke a native
compiler:

```sh
node --test scripts/harmony/tests/profile-config.test.mjs \
  scripts/harmony/tests/development-host-admission.test.mjs
```

When the parent releases the native compiler/linker slot, run the portable
production lease lifetime harness:

```sh
python3 scripts/harmony/tests/development-host-lease.py \
  --compiler /usr/bin/clang++ \
  --baseline-header /absolute/path/to/preserved/pre-fix/HarmonyRuntimeHost.hpp \
  --output /absolute/path/to/fresh/admission-evidence
```

Add `--prepare-only` to write fixtures/commands without starting a compiler.
The runner takes the actual first-member declaration from the selected host
header and uses the real production lease and `takeHostForDestruction()`.
The pre-fix declaration reproduces overlapping admission (RED); current full
development must reject it (GREEN). Lean must still admit sixteen owners.
Checks cover cross-TU authority, reentrant construction, rejected-constructor
isolation, partial-construction rollback, ownership transfer to a destroying
job, a worker-thread teardown boundary, destructor/member ordering, and
deterministic concurrent contenders.

This reduced ownership harness does not instantiate Valdi managers or execute
actual runtime pause/resume/debugger operations. The source integration checks
verify that those production lifecycle methods cannot release/reset admission;
the real SDK host object probe separately validates integration. Device debugger
and full runtime acceptance remain later coordinated work.

The November 3, 2026 focused run is retained at
`/tmp/valdi-app-profile-config-20261103-r3/results.json`: five Node tests passed,
legacy app configuration passed, implicit full selection was rejected, and both
real external fork configurations passed. The effective full VM/compiler closure
has 311 translation units and its API/JSI/CDP closure has 31; lean has 192 and 15.
The checks compare actual CMake commands to the runtime's frozen source lists
and inspect runtime-owned DEV/tracing values and consumer feature macros.
Five SDK26 x86_64 objects compiled sequentially: three actual host objects
(legacy, fork lean, fork full) and two public-header consumers. The host probes
use the same app development CMake helper as production, including exact
AppScope identity extraction. Both actual fork app configurations stopped
on the six remaining source prerequisites listed above. No arm64 app-object,
new runtime link, HAP, device debugger or source-package acceptance is claimed.
