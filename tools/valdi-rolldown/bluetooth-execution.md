# BLE execution authority migration

## Source gate released on 2026-11-03

The parent explicitly released the native authority **source** gate for TS FIFO
removal after reporting these independent reviews clean:

- Mobile review7, frozen receipt `/tmp/ble-native-review7-green/freeze.json`,
  SHA256 `45663972bcb7d8a538b6da07ce1d73dd85c22e484edd1636fb68321dda5a05ff`.
  The receipt records 53 Kotlin and 33 Swift cases against actual production
  core/engine code with deterministic SDK boundaries, Android 36 / Blessed
  3.0.12 compilation, and arm64 iOS SDK typechecking.

This TS change rechecked the mobile receipt hash. It does not rerun those native
compilers or extend their validation boundaries. The parent reported all prior
findings fixed; the independent clean-review conclusions are parent-supplied.

The capability fake in `bluetooth-execution.test.ts` expresses the native FIFO
contract at the real emitted-TS host boundary. Passing it does not establish
platform integration parity or physical-radio acceptance.

The mobile receipt retains a conservative SDK limit: a connected `createBond`
can be queued successfully but refused by the OS without a terminal callback.
The public timeout settles once, while native holds that device until a terminal
callback or actual hardware invalidation. A retired same-instance guard can
likewise wait for terminal delivery or actual manager close. TS neither times
out that hold nor guesses SDK cancellation.

Native session/factory teardown remains parent-owned. Fresh BLE module/APK
integration builds and hardware acceptance remain pending. The source gate
release authorizes this TS deletion without claiming those later gates passed.

Do not remove the shared permission request tail as part of this migration.
That requires a separate native permission broker audit.

## Admission snapshot

`writeOptions` now copies the public `ArrayBuffer` synchronously during
validation, before the dispatch checkpoint or any native wait. `native.ts` still converts
the retained copy to the `Uint8Array` required by the native host. The public
input type, native Promise result boundary and generated host ABI are unchanged.

The first test run reproduced two failures: queued writes transmitted the
caller's subsequent buffer mutations. After the schema copy, both regressions
pass. The subview case passes exact range ArrayBuffers to the public API and
also checks incoming native Uint8Array subviews; public writes continue to
reject ArrayBufferView inputs.

## Execution and lifecycle ownership

`QueuedOperation`, `DeviceQueue`, `deviceQueues`, `enqueue`, `drainQueue` and the
queue cancellation helpers have been removed from `wechat.ts`.

`dispatchDevice` validates runtime state, captures lifecycle generations, and
independently reaches native after one microtask checkpoint. Multiple calls
reach native in public admission order before any previous result completes.
TS stores no pending task list, active operation or completion tail.

The checkpoint preserves same-turn close/disconnect cancellation. Adapter
session/open, power and device generations prevent old unsubmitted work from
entering a recovered session, including disconnect/reconnect or off/on events
delivered in the same turn. Connect completions also check those generations
before clearing disconnected state, so late success cannot revive old state.
Native owns serialization, cancellation and completion after submission.

The runtime keeps its adapter and connection observers after page listeners are
removed to maintain public state and lifecycle generations. The one-host event
sink, UUID normalization, discovery caches, public validation/error mapping and
page listener teardown behavior remain. No exported release API or ABI changes
are introduced.

## Focused verification

From `tools/valdi-rolldown`:

```sh
./node_modules/.bin/tsx --test bluetooth.test.ts bluetooth-execution.test.ts
./node_modules/.bin/tsc --project ../../valdi/modules/bluetooth/tsconfig.json --noEmit
```

The initial snapshot phase passed 10 tests and the module typecheck. The next
pre-removal run captured six failures: native admission remained serialized by
TS, and late connect success could revive disconnected or power-retired state.
The final focused suite passes 20 tests and the module typecheck.

Coverage includes all seven formerly queued operation kinds entering native
after one checkpoint; native per-device serialization and independent device
progress; write mutation and exact subview buffers; public errors; same-turn
close/disconnect; reconnect, power and adapter generations; native cancellation
of admitted active/pending work; late completions; notification delivery during
blocked work; and page listener teardown.

Logs and a SHA256 source/test freeze are retained under
`/tmp/ble-ts-fifo-removal-20261103/`. These checks execute emitted production
TypeScript with only the native capability boundary replaced. They do not
build or run a platform application.
