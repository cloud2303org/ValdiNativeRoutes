# Harmony OTA integration handoff

The OTA core is now wired into the actual ResourceLoader, RuntimeHost, Navigator
and N-API environment lifetime. Its signed-package core and packaging helper remain
unchanged in this integration phase, including the reserved `latest.json` fix.
It uses staged BoringSSL/JsonCpp and the pinned native HTTPRequestManager interface.
Current business/HAP inputs contain no OTA configuration or native binary digest:
this source integration therefore stays explicitly disabled until parent packaging
supplies them. This is source/proof work, not enabled OTA live QA.

## Process ownership and current loader wiring

`HarmonyResourceLoader(manager, persistentRoot)` reads only packaged rawfile
`valdi_ota.json`, then obtains `HarmonyOTAProcess::acquire`. The native process owner
retains ONE frozen selection, including a disabled selection, after every host is
removed. A later loader must match that configuration and storage binding; it cannot
switch configuration, reset pendingLaunched or rerun rollback. No global JS runtime,
system port, shell observer or per-runtime HTTP manager is shared.

Required packaged string fields are `appVersion`, `fingerprint`, `url`, `publicKey`
and **`binaryIdentity`**. The last is exactly 64 lowercase SHA-256 hexadecimal
characters, produced by the parent from the actual native release binary and its
immutable release/install identity. It is not the compatibility fingerprint, a
version string, runtime handle, current timestamp or random UUID. Missing, malformed,
duplicate-key or oversized config, absent binary identity, empty endpoint, invalid
P-256 key/gates or unsafe storage yields a retained disabled owner and an explicit
credential-free disabled reason. No placeholder key, URL, identity or export record
is generated. The integration does not enable insecure HTTP.

RuntimeHost supplies the existing app-owned `_configuration.storageRoot`
(`filesDir/valdi`); it is created by the host's existing storage setup and canonicalized
before enabling the core. Only `<storageRoot>/valdi-ota` is OTA-owned. This persistent
store must be 0700 and survive process death; no evictable cache substitutes for it.
The packaged digest must change for a changed native binary/release identity,
including native rebuilds retaining versionName. An appVersion, fingerprint or binary
identity change drops old package state on the next actual process startup.

`loadModuleContent` passes the complete filename directly to `readModule`; it
does not append an extension. `loadRawAsset` passes the validated module/logical
name from `valdi-rawfile://` to `readAsset`. Returned bytes are copied into an owned
`Valdi::Bytes` and returned as `BytesView(owner)`, independent of the loader/OTA read
buffer's lifetime. Only `nullopt` permits HAP fallback. A listed verification/read
exception becomes `Valdi::Error` without trying the HAP's copy. Bootstrap metadata
remains a packaged-only native policy input.

The core's `resolveModulePath`/`resolveAssetPath` remain available for native
consumers, but the runtime loader uses verified bytes rather than reopening a path
or introducing a new asset URL scheme. The signed image layout remains:

```
res/assets/<module>/<logicalName>.png
res/assets/<module>/<logicalName>.webp
```

Selection uses `.png` before `.webp`, matching the existing resource loader. Scale
selection remains the business builder's canonical largest-density asset selection.
The helper maps `rawfile/assets/...` to `res/assets/...`. `modules/...` stays flat.
Bootstrap profile metadata (`valdi/build-info.json`) and tab icons are native/HAP
inputs, not OTA-overridden bootstrap policy. Parent native tab consumers can read
the same `readAsset` API to keep their icons consistent with the selected package.

Launch confirmation follows successful execution of the **initial
`updateRoutes` UI command and completion of its subsequent `changed()` call**.
Returning from the asynchronous `JavaScriptRuntime::callModuleFunction` dispatch
does not establish bootstrap success: the business bootstrap publishes its
declaration through `navigation.updateRoutes`, which queues the UI command.
Navigator marks the first route command at admission, under its existing admission
mutex. After that command and its `changed()` return, it retires the one-shot native
hook under the same mutex. A closed navigator, newer admitted publication, or error
suppresses the hook. A failed/superseded initial command cannot be confirmed by a
later updateRoutes. Observer registration, other commands and first render do not
trigger this hook.

RuntimeHost binds it before bootstrap using a weak native `HarmonyOTALaunch` token
and the owning runtime generation. `unmount` and `releaseOnUI` close/advance that
token before any teardown reentry; runtime logger/bootstrap failure marks it failed.
The token rechecks generation/closing/failure after all synchronous route observers
return. No callback retains or dereferences a raw RuntimeHost or shares a JS/service
owner. It invokes process-level confirm once and schedules a native update check.
Downloaded content is staged for the next cold process, never switched into a live
loader.

The process owns a separate native-only HTTP manager. Existing per-runtime managers
and their teardown remain isolated. NapiModule retains one environment lease after
installing its async cleanup hook, and releases it only after every host/worker has
drained and the dispatcher closes. The final environment cancels/joins OTA **before**
closing that process HTTP manager. Removing a host or an earlier environment does
neither. Frozen selection/readers remain retained; even a subsequently created
environment cannot rerun startup selection. Once all environments ended, network
work stays stopped until a new native process; it is not silently restarted.
The process destructor supplies the same shutdown ordering as a final safeguard.

There is no OTA callback into JS/UI. The HTTP adapter waits at most its explicit
45-second deadline (configurable); cancellation wakes within its 20 ms wait slice.
It safely ignores completions delivered after cancellation/deadline.

The request-manager contract must return promptly from `performRequest`; it must
retain a supplied completion while native work is outstanding. The current Harmony
native HTTP implementation satisfies that asynchronous interface. It owns its
platform transport, TLS, proxy, redirects and callback disposal. OTA sends anonymous
GETs with no credentials/headers. Exact status 200 is required. OTA limits accepted
bodies to 64 KiB latest, 1 MiB manifest, 4096-byte signature and 64 MiB total package.
The pinned HTTP interface is completion-based: its OS/network adapter can accumulate
a larger response before OTA rejects it. This is not a streaming memory ceiling;
changing that requires a separate native HTTP API/implementation extension.

## Signature, compatibility, storage and recovery

Wire protocol is exactly the existing root `scripts/ota.mjs` envelope, with platform
`harmony`:

```
<base>/harmony/<appVersion>/latest.json               {"version":"opaque-version"}
<base>/harmony/<appVersion>/<version>/manifest.json   raw JSON bytes
<base>/harmony/<appVersion>/<version>/manifest.sig    base64 DER ECDSA signature
<base>/harmony/<appVersion>/<version>/modules/...
<base>/harmony/<appVersion>/<version>/res/assets/...
```

Manifest fields: `platform`, `appVersion`, `fingerprint`, `version`, `files` (path to
lowercase SHA-256 hex). ECDSA P-256/SHA-256 covers the exact manifest bytes, including
whitespace and trailing newline, before JSON/schema parsing or payload downloads.
The public key must be an actual P-256 public SPKI key. The version pattern is
`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. The packaging helper additionally reserves
`latest.json` (including case variants) as an update ID, because the version
directory would collide with the latest pointer file. It rejects that ID before
invoking the signer or mutating output. Harmony deliberately narrows the generic `modules|res`
path grammar to the flat modules and canonical image paths its loader can consume.
Duplicate JSON keys, encoded paths, absolute paths, dot components, symlink/hardlink
files, directory escapes, bad hashes and unsupported layouts fail closed.

State is `binary`, `current`, `pending`, `pendingLaunched`, `failed`, matching the
other platforms' semantics. Staging writes files under an owned `download` directory,
fsyncs them and their directories, atomically renames the complete directory into
`packages/<version>`, syncs that rename, then atomically writes and syncs state.
Success is not reported until state has committed. Interrupted pre-state package
commits remain unreferenced orphans; startup removes them.

Before any startup override is exposed, its signature, gates and every file hash are
reverified; `pendingLaunched=true` is durably recorded. A second startup without
confirmation marks that version failed and uses `current`. Unreadable pending code
falls back to the last verified current package immediately. An unreadable current
package falls back to packaged code. Corrupt/unsafe state throws rather than
guessing whether the previous unconfirmed launch succeeded.

Provider selection is frozen. An update cannot replace a package that this process
is still testing as pending: it returns `PendingLaunch` until confirmation. Confirm
never deletes a directory underneath an active reader. Superseded directories are
collected on the next startup, together with stale staging.

Versions are opaque, as in the Android/iOS protocol: current/pending/failed IDs are
not downloaded again. There is no monotonic version counter, expiry, or signed
`latest.json`. A previously unseen older signed ID can be served. Cryptographic
anti-downgrade would require a protocol/release-policy change, not a different
comparison of opaque strings.

## Parent packaging/attestation still needed

The current host CMake glob picks up the new process-owner translation units and
already links the staged dependencies:

```cmake
target_link_libraries(valdi_harmony PRIVATE crypto jsoncpp_static)
```

Keep the existing native HTTP manager's platform libraries as supplied by that
implementation; OTA has no separate OS HTTP dependency. Do not add another BoringSSL
copy or enable a TLS bypass. No CMake edit was needed during this integration phase.
The proof compiles the current app translation units into isolated SDK objects and
strictly links both ABIs with existing runtime/business archives and real OS libs.

The parent packaging job must:

1. Produce a native **release export attestation**, tied to the built runtime, with
   `{"platform":"harmony","config":"release","valdi":"<64 hex>","native":"<64 hex>"}`.
   `valdi` uses the root fingerprint's `valdi` source list plus
   `["compiler-backend","node"]`; `native` hashes `valdi/native`. Both use the root
   sorted `name + NUL + SHA256(bytes) + newline` recipe. This helper checks that the
   tree still matches that attestation. It never fabricates one for an unbuilt runtime.
2. Run the existing `buildBusiness` in `tools/valdi-rolldown/harmony-business.ts` in
   the parent's controlled build, retaining the rawfile and generated C++ bindings
   from the same build. This OTA helper never invokes shared builders.
3. Compute the compatibility record with `computeCompatibility` or the CLI below.
   Native fingerprint inputs are enumerated in `harmonyNativeInputs`; they include
   Harmony host/backend/ArkTS, runtime/business build tooling and the public key.
   Bindings hash strips line comments/indentation using the root algorithm.
   Parent must freeze these inputs before writing the release record. The native
   fingerprint currently conservatively includes source tests/docs too.
4. Emit `valdi_ota.json` with `app-info`, package it as a rawfile, and give its fields
   to the host. The existing helper emits four fields; the parent must additionally
   generate `binaryIdentity` from the native artifact/release identity and add it to
   that **packaged** JSON. The loader requires all five fields. Bind the identity
   record to the actual final native build (or a build-generated immutable native
   identity section); do not hash an intermediate library then silently reuse it
   after changing native inputs. Keep the identity record in the release attestation,
   never in downloaded OTA content. No such record is fabricated here. An empty URL
   remains off. Require the real configured public key before opting into an endpoint.
5. Record `ota/releases/harmony/<appVersion>.json` explicitly during the release
   build. `pack` requires an equal recorded native fingerprint/parts. A changed
   native side must get a new app version/release record.
6. Supply an external signing executable that reads raw manifest bytes on stdin and
   writes base64 DER ECDSA-P256/SHA256 on stdout. It owns signing-key access. This
   helper validates its returned signature against the public key before publishing.
   The repository `ota/private.pem` is never consulted.

CLI examples use placeholders, not an invented service:

```sh
node scripts/harmony/ota.mjs fingerprint \
  --runtime-info /absolute/export/runtime-info.json \
  --bindings /absolute/business-bindings --public-key /absolute/public.pem

node scripts/harmony/ota.mjs app-info \
  --runtime-info /absolute/export/runtime-info.json \
  --bindings /absolute/business-bindings --public-key /absolute/public.pem \
  --app-version 1.0 --url "$CONFIGURED_OTA_BASE" \
  --record /absolute/releases/harmony/1.0.json
# Redirect stdout to the parent's staged rawfile/valdi_ota.json.

node scripts/harmony/ota.mjs pack \
  --runtime-info /absolute/export/runtime-info.json \
  --bindings /absolute/business-bindings --public-key /absolute/public.pem \
  --app-version 1.0 --version update-1 \
  --record /absolute/releases/harmony/1.0.json \
  --rawfile /absolute/business-rawfile --output /absolute/ota-dist \
  --signer /absolute/sign-manifest
```

`pack` consumes completed HBC99 `build-info.json` module hashes/diagnostics, modules,
maps and assets; it never claims those were executed. Files are immutable by version.
It constructs a temporary sibling package, verifies the external signature, renames
the package, and publishes latest last. This is local static-file preparation;
deployment to a real server remains the parent's explicit job.

## Exact local hot-reload prerequisites (source research only)

Pinned staged source: `.tools/harmony/upstream`, corresponding to the project's
Valdi pin. This source has been inspected; no debugger endpoint was opened.

- `valdi/src/valdi/runtime/RuntimeManager.cpp:createDebuggerService` returns null
  specifically for `PlatformTypeHarmony`, even if `enableDebuggerService` is true.
  `HarmonyRuntimeHost.cpp` also currently constructs RuntimeManager with
  `enableDebuggerService=false`, `disableHotReloader=true`, `isStandalone=false`.
- `Debugger/DebuggerService.hpp:kDebuggerServiceEnabled` requires
  `snap::kIsGoldBuild || snap::kIsDevBuild`. `harmony/runtime-build/CMakeLists.txt`
  currently sets both generated build flags false; an app Debug flag alone does not
  enable this compiled runtime service.
- `DebuggerService.cpp` starts an actual TCP server, default mobile port **13592**
  (standalone **13591**). Explicit valid requested port wins, then
  `VALDI_DEBUGGER_SERVICE_PORT`, then the default. Device reachability/forwarding
  must be implemented and validated separately; OTA does not create it.
- This TCP connection carries JSON encoded inside `ValdiPacket`, through
  `DaemonClientTCPDataSender::requiresPacketEncoding`, `DaemonClient::submitPayload`
  and `ValdiPacketStream`. It is not a generic HTTP/Metro/WebSocket endpoint.
  `DaemonClient::sendConfiguration` sends `configure.application_id`,
  `configure.platform` and `configure.disable_hot_reload`; the existing switch
  emits only `"ios"` or `"android"`. `compiler/companion/src/protocol.ts` likewise
  defines the client platform as `'android' | 'ios'`. Harmony needs a coordinated
  daemon/compiler/runtime protocol extension and platform output routing.
- RuntimeManager attaches its DebuggerService listener to runtimes;
  `Runtime.cpp:receivedUpdatedResources` processes the real resource-update
  callback and schedules reload work. The running compiler/companion must build
  compatible Harmony resources and send those actual updates on the framed
  connection, with hot reload enabled. Current release business HBC output alone
  does not provide this watcher/transport.
- Hermes inspector target discovery (`sendJsDebuggerInfo`, WebSocket targets) is
  a separate path from Valdi resource hot reload. Enabling a JavaScript inspector
  does not fill the missing Harmony daemon platform handshake.

OTA intentionally exposes no `hotReload()` or pretend success path.

## Reproducible isolated proof

```sh
python3 harmony/entry/src/main/cpp/host/tests/run-ota-integration.py
python3 harmony/entry/src/main/cpp/host/tests/run-harmony-ota.py --sanitize
node --test scripts/harmony/tests/ota.test.mjs
```

The integration runner reads existing compile databases/archives without invoking
shared builders. It puts all fresh SDK objects, strict links, host crypto/helper
builds, signed fixtures and logs under `/private/tmp`. It runs the actual process
owner/core/loader with simulated rawfile/transport boundaries and runs extracted
production Navigator admission/route-validation/changed methods with actual generated
route models under ASan/UBSan. It covers multiple loaders/remounts without reselection,
disabled config/identity gates, owned bytes, listed errors versus fallback, real
confirmation, final-environment cancellation/join, reentrant close, superseding
publication, failed route/changed, stale generation and orphaned weak acknowledgement.
The original cold-rollback core regressions also execute.
Its signed fixtures use an ephemeral in-memory test private key, never user keys.
It retains isolated binaries, logs, exact consumed source copies, commands and
`integration-proof.json`; a source drift check prevents publishing mixed-input proof.

Host signed-fixture tests prove verification/storage/lifecycle behavior; the small
module/image fixture bytes are not executed as Valdi code. Cross links prove symbol
closure for the new sources, not a HAP install, OS HTTP fetch, device execution,
power-loss fault injection, or a full native application launch. Parent final
artifact/config/release attestation and enabled end-to-end OTA validation remain.
