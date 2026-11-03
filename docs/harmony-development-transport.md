# Harmony Node development transport

**Cleanup review 2:** the latest frozen focused suite is **44 passed / 0 failed /
0 skipped**. The original 27-test receipt, the review-1 39-test receipt and their
inventories are preserved below as prior evidence. See the
[cleanup review 2 freeze](#cleanup-review-2-freeze) for the current fixes, cleanup
audit, RED/GREEN proof and final eight-file inventory.

The original receipt and hash inventory below are retained as **prior,
pre-review evidence**. The [P2 review corrections and final receipt](#p2-review-corrections-and-final-receipt)
append the corrected behavior, RED/GREEN evidence and current source hashes.
The original 27-test result is historical; the corrected focused suite has
39 passing tests. The parent has since registered these test files in its root
runner; this review correction does not edit that runner.

Source receipt: November 3, 2026 (local Asia/Shanghai). This slice integrates
Harmony into `tools/valdi-rolldown/dev.ts`, the application's actual Node build,
watch and resource-push path. It adds reusable, independently importable device,
daemon framing and Hermes discovery/upgrade helpers. Importing these helpers
does not start a watcher, discover a device, forward a port or listen on a socket.

This is source integration with fake process/socket tests. No HDC device command,
device connection, daemon/server launch, HAP install, simulator operation, full
build, fork edit or live endpoint validation was performed. Only the installed
HDC CLI's `--help` was executed. The separately owned fork runtime slice is
building lean/full profiles for four ABI/profile combinations with strict links;
those artifacts are outside this receipt. The current application still uses its
lean runtime and disabled host debugger service.

## Explicit selection

From the repository root, after a suitable development package and host service
have been supplied:

```sh
HDC_PATH=/absolute/path/to/sdk/openharmony/toolchains/hdc \
HARMONY_DEVICE=EXACT_HDC_CONNECT_KEY \
HARMONY_APPLICATION_ID=EXACT_NATIVE_CONFIGURE_APPLICATION_ID \
pnpm dev
```

`HARMONY_DEVICE` selects Harmony exclusively. Discovery runs `hdc list targets`
and filters for that exact connect key. It never chooses the first available
phone and never initiates a network/device connection. A missing target waits
for a later poll; HDC failure is reported and never falls back to ADB. The
expected application ID is mandatory; it must be the identity actually supplied
by the native debugger service, which need not equal a package/bundle name.
Neither credentials nor signing configuration are read.

`HDC_PATH` defaults to `hdc` on PATH. Harmony mode disables the existing Android
and iOS launch menu, so its keys cannot discover or launch another platform.
Without `HARMONY_DEVICE`, the existing Android emulator/`ANDROID_SERIAL` filter,
booted iOS simulator discovery and interactive controls remain in use.

Both `configure.platform === "harmony"` and an exact, case-sensitive
`configure.application_id` match are required before the first resource event
or endpoint publication. A mismatch replies with the original request ID and
an error, closes the socket, and revokes the session. A later configure changing
identity also revokes it. `disable_hot_reload: true` allows inspection discovery
but suppresses initial and incremental resource pushes.

## Wire contract and source payload

The native DebuggerService listens on mobile port **13592**. Its direct TCP
connection carries `ValdiPacket`, not HTTP or WebSocket:

```text
33 c6 00 01 | uint32LE UTF-8 JSON byte length | JSON bytes
```

The app initiates the handshake:

```json
{"request":{"request_id":"001","configure":{"application_id":"expected","platform":"harmony","disable_hot_reload":false}}}
{"response":{"request_id":"001","configure":{}}}
```

IDs remain strings and are not renumbered. Unsupported requests receive
`response.error.error_message` with their original `request_id`.

Resources retain the existing development build's JavaScript and inline source
maps. This change does not recompile or rewrite their contents:

```json
{"event":{"updated_resources":{"resources":[{"bundle_name":"app_pages","file_path_within_bundle":"src/app.js","data_string":"original source"}]}}}
```

UTF-8 bytes use `data_string`; other bytes use `data_base64`, exactly as the
existing Android/iOS push path. Harmony uses the same production encoder and
resource serializer as those platforms. The decoder supports split/coalesced
frames and rejects invalid magic, invalid JSON, nonobject payloads and packet
lengths above 128 MiB.

## Daemon inspection, Hermes CDP and tracing

`HarmonyDevTransport.endpoint` and its optional `onEndpoint` callback expose
`HarmonyDevEndpoint`. Production `dev.ts` logs the JSON endpoint after a verified
configure and again when debugger discovery changes:

```ts
interface HarmonyDevEndpoint {
  platform: 'harmony';
  deviceId: string;
  applicationId: string;
  daemon: { host: '127.0.0.1'; port: number; autoForward: false };
  debugger?: {
    remotePort: number;
    jsonListUrl: string;
    targets: readonly { id: string; webSocketDebuggerUrl: string }[];
  };
}
```

The daemon endpoint is an already forwarded, local TCP endpoint. The pinned
fork CLI's `connectToDaemon(endpoint.daemon)` accepts its `{ port,
autoForward: false }` shape. Retain that object form: passing only the number
opts the pinned CLI into its generic ADB forwarding path.

An inspection client opens its own native TCP session through this tunnel.
The resource connection does not relay or intercept that client's messages.
The pinned inspection protocol sends
`event.payload_from_client.sender_client_id` and `payload_string`, with an
inner `requestId`. The native reply is a
`request.forward_client_payload` carrying `client_id`, `payload_string` and a
separate outer `request_id`; the inspection client answers that outer request.
Do not confuse these IDs or route an inspection response to the resource
connection. Existing CLI context/trace methods retain their own sender IDs,
correlation, receiver and connection ownership. No generic business dispatcher
was added.

Native Hermes discovery is:

```json
{"event":{"js_debugger_info":{"port":49111,"websocket_targets":["1","23"]}}}
```

`websocket_targets` are runtime IDs, not WebSocket URLs. The pinned
`HermesDebuggerServer` serves `/json` and `/json/list`, builds
`ws://localhost:<device-port>/<runtime-id>`, and accepts upgrades at
`/<runtime-id>`. Its unknown-ID fallback chooses the first runtime.

Consequently a bare HDC forward would leave discovery advertising an unusable
device port on the host. This transport owns a loopback HTTP/TCP proxy that:

- Publishes `/json` and `/json/list` from the latest native discovery event,
  replacing the authority with its actual host loopback port.
- Publishes a `webSocketDebuggerUrl` for every unchanged runtime ID at
  `ws://127.0.0.1:<proxy-port>/<runtime-id>`.
- Accepts only the announced exact upgrade paths, preventing the native
  first-runtime fallback from attaching a stale target.
- Tunnels the original upgrade headers, remainder and subsequent bytes through
  the owned HDC CDP forward. CDP request IDs, responses and profiling payloads
  are not parsed or rewritten.

These are the actual local URLs to use with a debugger. The logged remote
port is provenance, not a host attachment URL. A zero port or empty target list
withdraws the CDP proxy while keeping a configured daemon endpoint available.
Repeated identical discovery retains its proxy; changes replace its forward
and proxy. All endpoint ports may change after reconnection. Consumers must
discard withdrawn endpoint objects.

This enables the transport surface needed by full Hermes development and
inspection. It does not itself enable Hermes debugger/profiler compilation,
CPU sampling, Valdi rendering/native tracing or OS traces. Hermes CPU/CDP
profiling and the pinned daemon client's `performanceTraceStatus`,
`performanceTraceStart` and `performanceTraceStop` are separate paths requiring
the appropriate native runtime and listener. No breakpoint, heap, CPU profile,
render trace, exported trace or trace content has been validated here.

## HDC command evidence and forward ownership

The help inspected was from:

```text
/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/toolchains/hdc --help
```

It documents `list targets`, `-t connectkey`, `fport localnode remotenode`,
`fport ls` and `fport rm taskstr`. The official HDC guide gives the full-pair
removal example `hdc fport rm tcp:1234 tcp:1080`. The production helper uses:

```text
hdc list targets
hdc -t <exact-key> fport ls
hdc -t <exact-key> fport tcp:<positive-host-port> tcp:13592
hdc -t <exact-key> fport tcp:<positive-host-port> tcp:<announced-cdp-port>
hdc -t <exact-key> fport rm tcp:<owned-host-port> tcp:<owned-device-port>
```

HDC is never passed `tcp:0`. A temporary Node loopback listener selects a free
positive host port, closes it, then HDC binds that port. There is a normal
close-before-forward allocation race; the helper checks the global forwarding
list before creation and verifies the exact mapping afterward. An allocation
or forwarding failure is reported and a later poll can retry.

Current official HDC `BuildForwardVisableLine` emits connect key, both nodes and
`[Forward]`/`[Reverse]`. The parser requires that full format and fails closed on
unknown rows, including old listings without a target key. Actual installed
server output has not been queried. It must be checked during the future live
acceptance pass; it is not evidence that an installed daemon matches the source.

The helper retains only newly created forwards, never adopts a preexisting
mapping, and removes only a recorded mapping still matching the exact target,
direction and local/remote pair. It never clears all forwards, kills HDC,
disconnects a device or removes a replacement mapping. Daemon socket failure,
target disappearance, discovery failure, CDP replacement, failed proxy startup,
and `SIGINT`/`SIGTERM`/`SIGHUP` stop all dispose owned resources. Pending removal
after a transient HDC error remains tracked and is retried during later cleanup.
Shutdown awaits cleanup; the OS may still prevent removal when HDC is unavailable.
An unacknowledged create (for example, CLI timeout after a possible side effect)
cannot prove ownership and is not deleted speculatively. Abrupt process kill
cannot guarantee cleanup either.

Official source references, inspected read-only:

- HDC guide at `openharmony/docs`, commit
  `5bce3307f08f3ac9d3358297dce72b442795a86b`,
  `en/device-dev/subsystems/subsys-toolchain-hdc-guide.md`.
- HDC implementation at `openharmony/developtools_hdc`, commit
  `41dfc07c9a6edfdb6c5fb9c026690dcff2a78986`,
  `src/host/server.cpp` (`BuildForwardVisableLine`) and
  `src/host/server_for_client.cpp` (global forward list/remove handling).
- Combined stdout/stderr of the installed help: SHA-256
  `c85dcbad3d27bd6eabf2190ad946497a1f0f89b9b92c05023d01646eafcf1ee9`.

## Frozen Valdi source receipt

Application pin in `valdi/MODULE.bazel`:
`cloud2303org/Valdi@15feb6530ceecb971f4c8519ea8ab77474b959db`.
The following files under `valdi/bazel-valdi/external/valdi+` were checked
byte-for-byte against `git show <pin>:<path>` in the local fork:

```text
a42465e3e1558104237881c2ba6285ea75ed8c04cd73aa61fd8cc7ce028f3f76 compiler/compiler/valdi.proto
fdbdb6175fdb2fc16da05c43eb5bec0795cf17342855f2835e271f01bb02e028 valdi_core/src/valdi_core/cpp/Resources/ValdiPacket.cpp
96913001ea56faba58e5142ac33aaff9640feb686cb9b8dd6573a7e6acf8a30a valdi/src/valdi/runtime/Debugger/DaemonClient.cpp
a80e8bd87af38fd1adb4c5a68be1a52cd34d629758905489bdba2f274431017b valdi/src/valdi/runtime/Debugger/DebuggerService.cpp
6702f2513cd5e4ec3d2ae41cddbe2c50a6e0aeb1a28ad95027a8682f2e049fa8 valdi/src/valdi/hermes/HermesDebuggerServer.cpp
17c568ed1360f028840faec388a4142d1f0ba8ccc074196ce3b85037df89ef4b valdi/src/valdi/hermes/HermesDebuggerRegistry.cpp
ebaa7d564c689fa470abd6315e1c9720ea08bb04617a2035eb0d9f318564797a npm_modules/cli/src/utils/daemonClient.ts
```

There is no daemon JSON message `.proto` or legacy compiler `Reloader/` in this
pin's tree. Its actual `compiler/compiler/valdi.proto` declares UDP
`DaemonServiceDiscoveryPayload`, `DaemonAwakeMessage` and `ClientAwakeMessage`;
it does not declare `configure`, `updated_resources` or `js_debugger_info`.
Those JSON field names above come from the inspected native implementation and
pinned Node inspection client, not a fabricated/generated protobuf schema.
The pin's configure platform switch supports iOS/Android; the coordinated
native Harmony platform branch remains a required fork/host input.

Implementation source SHA-256 receipt (paths under `tools/valdi-rolldown`):

```text
1054dbcf63476f79cd4f6d2a90ac8916f6ed77f28c4d351436e8d6e3d9a71a82 dev.ts
7c61bbe68b0e82e0aa920e7cfc46939f4bd5d7be397e760abf1ae02892f4f277 dev-protocol.ts
b6532dcca7e2b0e2b31dc23f58c05c70b61749cb4c8db92a3d71dff1be4f42d5 harmony-dev-device.ts
49a18bef7bcc3f4cf4bff2a52930569de7bf1077b36ff8f35aeff011dbaa971d harmony-dev-cdp.ts
84e8d5831793225ab49ca374317beb1c58595865d0e7e295c30b775921c17aa8 harmony-dev-transport.ts
be75a449a7bccb3c86d881df1e99c01185855fafeca988745c47c4f1ca10c148 dev-protocol.test.ts
ace3215bd3aaf1103fea1100a687d6d698130993960370864f7b537a7e4e40c4 harmony-dev-transport.test.ts
108313df03c968bc37371c097ad5ec53d51fd423fa27f08cf833c905094e93d6 harmony-dev-cdp.test.ts
```

## Focused validation and parent handoff

The parent owns `scripts/project.mjs` and should register these new test names
in the existing tools test invocation:

```text
dev-protocol.test.ts
harmony-dev-transport.test.ts
harmony-dev-cdp.test.ts
```

Run them directly without launching the watcher:

```sh
cd tools/valdi-rolldown
node node_modules/tsx/dist/cli.mjs --test \
  dev-protocol.test.ts harmony-dev-transport.test.ts harmony-dev-cdp.test.ts
```

The tests use the production helpers with fake process/socket/server boundaries.
Result: **27 passed, 0 failed, 0 skipped**; the existing dev-controls tests:
**4 passed, 0 failed**. Strict standalone TypeScript checking passed.
They cover framing/configure, exact target and application rejection, unchanged
UTF-8/binary/source-map payloads, native debugger fields, local discovery URLs,
upgrade bytes and IDs, attach/disconnect/reconnect and port replacement,
stop-in-flight races, failed setup/cleanup, unrelated forward preservation and
absence of ADB fallback. The existing dev-controls tests run with their existing
fake device/process boundaries. Strict standalone TypeScript checking covers
all new helpers and focused tests. The parent-reported full source baseline
of 203 pass / 0 fail / 3 skipped was not rerun or reclassified by this slice;
the root runner is unchanged by this work.

Next required acceptance work is owned outside this transport slice:

1. Supply the actual full development runtime package, matching ABI/profile,
   Hermes compiler/HBC version, API/CDP closure, tracing definitions and native
   symbols. Strict library links alone do not establish host debugger behavior.
2. Wire the host's full development service and Hermes registration/listener,
   enable appropriate native DEV/GOLD service flags, emit `"harmony"` and the
   exact configured identity, and allow reload in that development package.
   Current lean/disabled host wiring does not satisfy these prerequisites.
3. Package matching Node development JavaScript/modules/maps and resources.
   This change does not modify `pipeline.ts`, `hermes.ts`, runtime module
   production, Harmony business staging or HAP generation.
4. With an explicitly approved target, verify actual HDC listing/forwarding,
   resource reload and byte identity; fetch local `/json/list`; attach to each
   exact WebSocket target; exercise mapped breakpoints, pause/inspect/continue,
   CDP profiling and daemon tracing separately; inspect nonempty exported
   profiles/traces; then verify disconnect, reattach, stop and unrelated-forward
   preservation. Record those as new live/artifact evidence.

The four reusable helper files can be moved into the maintained fork CLI once
its migration owns that step. They depend only on Node built-ins and local
transport helpers, with no application routing, business, host or build imports.

## P2 review corrections and final receipt

This revision changes only `harmony-dev-transport.ts`,
`harmony-dev-device.ts`, `harmony-dev-transport.test.ts`, and this document.
The prior inventory above is preserved verbatim. `dev.ts`, the shared protocol
encoder, the CDP proxy and their other focused tests retain their original
receipt hashes. The parent-owned runner already includes the three transport
test files; no runner or build/builder changes are part of this correction.

### Discovery ordering and identity

In the inspected pinned `DebuggerService.cpp`, `onClientConnected()` calls
`addDaemonClient()` before `submitDaemonClientConfiguration()`.
`addDaemonClient()` notifies its JS listeners, which can therefore emit
`event.js_debugger_info` before the configure request is enqueued. A later
discovery event is not guaranteed.

The original helper discarded such discovery and its original lifecycle test
manually emitted another event after configure. The corrected helper retains
the latest validated desired port/targets on the receiving daemon **session**,
including discovery received before configure. It performs no CDP setup or
endpoint/resource publication until that session's exact Harmony platform and
application identity have been verified. Configure then requests a coalesced
poll to reconcile the retained discovery; no second native event is needed.
An identity rejection closes the session, and a new session starts without its
predecessor's desired discovery.

### Retry and asynchronous ownership

Initial setup and retry now use the same serialized, coalesced `poll()`.
Each poll makes at most one debugger setup attempt. A forwarding or proxy-start
failure retains the desired discovery for a later eligible poll, including the
existing production one-second device poll. There is no new timer, recursive
retry, self-enqueued retry or polling loop inside the helper. Concurrent calls
share the active poll promise, and an already matching proxy does not create
new forwards on later polls.

After each asynchronous setup boundary, the helper checks that the session is
still verified, connected and current, that stop has not begun, and that the
desired discovery snapshot has not been replaced. Stale acquired forwards and
proxies are disposed without publishing their endpoint. A replacement discovery
retains only the newest desired state and can be reconciled on the next poll.
Stop or disconnect prevents the old session from retrying.

`HarmonyDevForwards.releaseUnused()` retries pending owned cleanup while
preserving the active daemon forward. A new debugger forward is blocked until
unused owned leases have been removed. This prevents repeated proxy-start
failures from accumulating duplicate forwards when removal itself temporarily
fails. Existing exact target/pair/direction ownership checks and the limits for
unacknowledged creation, unavailable HDC or abrupt process kill remain in effect.

### RED/GREEN evidence

Before production edits, the helper SHA-256 was the frozen prior value
`84e8d5831793225ab49ca374317beb1c58595865d0e7e295c30b775921c17aa8`.
Running this new focused selection against it:

```sh
cd tools/valdi-rolldown
node node_modules/tsx/dist/cli.mjs --test \
  --test-name-pattern='single debugger' harmony-dev-transport.test.ts
```

produced **0 passed / 3 failed**:

- Single discovery before configure: the debugger endpoint remained undefined
  after valid configure without a second event.
- Single discovery followed by a one-time HDC forwarding failure: the endpoint
  remained undefined on the next coalesced poll.
- Single discovery followed by a one-time proxy-start failure: the endpoint
  likewise remained undefined on the next coalesced poll.

All three expected remote port `49000` and received `undefined`. The old masked
lifecycle test was also changed to use its original pre-configure event rather
than reinjecting discovery. A further test first reproduced duplicate forwards
when a setup retry ran before pending removal had succeeded; the unused-lease
gate fixes that retry ownership case.

The corrected focused command is unchanged:

```sh
node node_modules/tsx/dist/cli.mjs --test \
  dev-protocol.test.ts harmony-dev-transport.test.ts harmony-dev-cdp.test.ts
```

Result: **39 passed / 0 failed / 0 skipped**. The suite includes one-event
recovery, exact identity gating and session isolation, one attempt per eligible
coalesced poll under persistent failure, pending-removal gating, and replacement,
disconnect and stop during both HDC forwarding and proxy creation. Stale
endpoints are never published and unrelated forwards survive disposal.
Strict standalone TypeScript checking passed for all four reusable helpers and
the three focused test files.

All process, socket and server boundaries were fakes; no port was opened.
No HDC/device/simulator command, live server, fork edit, pipeline/Hermes/business
builder change, dependency addition, root-runner edit, full build or live
endpoint validation was performed in this review correction. The original
development-package/host full-debug wiring and live acceptance requirements
remain pending outside this slice.

### Final source SHA-256 inventory

Paths are relative to `tools/valdi-rolldown`. This inventory supersedes the prior
implementation inventory for the corrected files without replacing its history:

```text
1054dbcf63476f79cd4f6d2a90ac8916f6ed77f28c4d351436e8d6e3d9a71a82 dev.ts
7c61bbe68b0e82e0aa920e7cfc46939f4bd5d7be397e760abf1ae02892f4f277 dev-protocol.ts
dfd51123d3e15237603be5e567c34c1937543a10c00b7c822c4f99887bd233f0 harmony-dev-device.ts
49a18bef7bcc3f4cf4bff2a52930569de7bf1077b36ff8f35aeff011dbaa971d harmony-dev-cdp.ts
8498be055a7e2b3dc4f4f8da1efee9b9f39117a4f2afb16cf700d2267d109230 harmony-dev-transport.ts
be75a449a7bccb3c86d881df1e99c01185855fafeca988745c47c4f1ca10c148 dev-protocol.test.ts
6630325c29ae0aa2f7d50ef3c89836f98a1e76583439a5c9ab3744595c2e998b harmony-dev-transport.test.ts
108313df03c968bc37371c097ad5ec53d51fd423fa27f08cf833c905094e93d6 harmony-dev-cdp.test.ts
```

## Cleanup review 2 freeze

This correction changes only `harmony-dev-device.ts`,
`harmony-dev-transport.ts`, `harmony-dev-transport.test.ts` and this document.
The preceding review-1 document had SHA-256
`9b914ab02a4b7b147d3abce8b280d8bcc942b4f6f842794a41f1ba73786e3fb6`.
Its text and both earlier inventories are retained; this section and the
latest-status notice are additions. Review 1's exact-identity gate, session-local
discovery, event-before-configure handling, coalesced polls and bounded setup
retry behavior remain in place.

### Two cleanup combinations

`HarmonyDevForwards.close()` now returns the boolean from
`releaseUnused([])`. Before acquiring a daemon forward, `poll()` requires that
cleanup result to be true and checks stop again after the await. A failed
removal retains the original exact owned handle and prevents another
`tcp:13592` mapping. Polls may retry that cleanup, but they cannot allocate a
new daemon mapping until it succeeds. No preexisting or unrelated mapping is
adopted or removed.

When a retained discovery is empty and its proxy/forward fields are already
cleared, `reconcileDebugger()` now retries
`releaseUnused([session.forward])` before returning. This covers a CDP removal
that failed during the single withdrawal event: later polls drain the retained
owned lease while preserving the daemon forward and endpoint. The branch
never acquires a replacement debugger forward and needs no repeated discovery.

### RED and GREEN proof

The unchanged production helpers used for RED had SHA-256:

```text
dfd51123d3e15237603be5e567c34c1937543a10c00b7c822c4f99887bd233f0 harmony-dev-device.ts
8498be055a7e2b3dc4f4f8da1efee9b9f39117a4f2afb16cf700d2267d109230 harmony-dev-transport.ts
```

Before those helpers were edited, this new test selection produced
**0 passed / 2 failed**:

```sh
cd tools/valdi-rolldown
node node_modules/tsx/dist/cli.mjs --test \
  --test-name-pattern='cleanup review 2:' harmony-dev-transport.test.ts
```

- With only `fport rm` failing, create/list operations remained successful.
  Closing each daemon socket across four coalesced poll cycles created
  **five** daemon forwards instead of the expected **one**.
- After one empty CDP discovery event and one failed removal, restoring HDC
  and polling again left **one** owned CDP mapping instead of **zero**.

Both regressions pass with the corrected helpers. The daemon test verifies
that the original lease is retained through repeated removal failures, cleanup
uses only its exact target/local/remote pair, and reconnection starts only after
removal succeeds. The withdrawal test emits no second discovery, keeps the
daemon endpoint, closes its proxy, cleans the stale CDP lease on a later poll,
and creates zero replacement debugger forwards. Both preserve unrelated
mappings, including mappings on the same explicitly selected target.

The full focused suite reports **44 passed / 0 failed / 0 skipped**:
the existing 39 cases remain green, with two new regressions and three cleanup
audit cases. Strict TypeScript checking passes for all four helper files and
three focused test files.

### Cleanup call-site audit

The audit traced the actual `HarmonyDevForwards` ownership set, `open`,
`release`, `releaseUnused` and `close`; transport `poll`, `reconcileDebugger`,
`clearDebugger`, `disconnect` and `close`; and the owned CDP proxy teardown.
Result handling is intentional according to whether a path can acquire more
resources afterward:

| Actual path | Cleanup/result behavior |
| --- | --- |
| `poll()` with no daemon session | Failed `forwards.close()` now blocks acquisition; retained handles are retried on later coalesced polls. Stop is checked again before acquisition. |
| Positive debugger setup/replacement | The existing `releaseUnused([session.forward])` boolean gate still prevents setup while unused owned leases remain. Desired discovery is retained. |
| Empty debugger discovery with cleared fields | The new cleanup call retries unused leases before returning. Its result does not trigger acquisition; later polls retry any retained lease. The daemon is preserved. |
| Target absence or discovery failure | `disconnect()` releases CDP and daemon resources, then the poll attempts full cleanup and returns/throws. No resource acquisition follows on that path. Reattachment must pass the daemon cleanup gate. Two new audit tests retain both failed leases and verify that discovery recovery alone cannot bypass removal failure. |
| Socket close, invalid configure or invalid framing | `disconnect()` drops the unusable session references; `release()` retains exact handles on HDC errors. The same gated daemon-acquisition branch controls the next session. No old desired discovery is reused. |
| Failed forward verification, synchronous socket setup or proxy startup | The existing catch/finally paths release acquired resources, preserve failed removals in the ownership set and end the attempt. Future daemon/CDP attempts must pass their respective cleanup gates. |
| Stop or stop during setup | Stop is set before queued teardown. `disconnect()` releases CDP and daemon resources; its finally paths and terminal `forwards.close()` attempt remaining leases. Stopped polls acquire nothing. The terminal path does not spin or claim that failed removals succeeded; logs report pending cleanup and another explicit `close()` retries retained leases. A new audit test verifies failure retention, zero subsequent polling/acquisition, eventual explicit-close cleanup and idempotence after success. |

`clearDebugger()` may clear its active field after a failed removal, but the
manager does not clear that ownership handle. This distinction is now covered
for both positive desired state and withdrawal. `release()` deletes a handle
only after removal/absence is confirmed; mismatch and unrelated mappings are
not removed. The owned proxy closes tracked HTTP/upgraded sockets, and
transport finally blocks attempt forward release even if proxy teardown fails.
There is no new retry loop, timer, global cleanup operation or architecture
change.

Terminal cleanup remains bounded best effort when HDC is unavailable, and
abrupt process termination/unacknowledged creation retain the previously
documented limits. This freeze does not claim live cleanup or a live endpoint.
All tests used fake process/socket/server boundaries; no port was opened.
There were no devices, live servers, remotes, builds, dependency changes,
fork/host edits, pipeline/business-builder edits or root-runner writes.

### Final source SHA-256 inventory for cleanup review 2

Paths are relative to `tools/valdi-rolldown`. The earlier review-1 eight-file
inventory remains a prior receipt rather than being overwritten:

```text
1054dbcf63476f79cd4f6d2a90ac8916f6ed77f28c4d351436e8d6e3d9a71a82 dev.ts
7c61bbe68b0e82e0aa920e7cfc46939f4bd5d7be397e760abf1ae02892f4f277 dev-protocol.ts
37748e4a7025fc8a4042187fed66da6749168ca728a0ee8ec700d08278c52666 harmony-dev-device.ts
49a18bef7bcc3f4cf4bff2a52930569de7bf1077b36ff8f35aeff011dbaa971d harmony-dev-cdp.ts
11a81ff5f7387fd63ce108dbdeea7d05620231a0a9f09512314d84ea3f035e33 harmony-dev-transport.ts
be75a449a7bccb3c86d881df1e99c01185855fafeca988745c47c4f1ca10c148 dev-protocol.test.ts
10d87df0fe863c82d52465f4088eff5516bee84514beceb3fd46a7f9e2adc529 harmony-dev-transport.test.ts
108313df03c968bc37371c097ad5ec53d51fd423fa27f08cf833c905094e93d6 harmony-dev-cdp.test.ts
```
