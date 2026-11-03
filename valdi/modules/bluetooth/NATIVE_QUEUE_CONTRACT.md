# Native BLE queue contract

This change owns only the iOS/Android `BleCore` and `BleEngine` sources and the
focused tests in this module. TS FIFO removal, Harmony authority, permissions,
AppUI, exported interfaces, generated bindings, and application lifecycle wiring
are separate work.

## Authority and ordering

`BleCore` remains the application-wide hardware authority. `createSession()`
creates a separate native caller owner; session state and event tokens are not
global runtime/user state. A native consumer must use a session rather than call
the internal engine directly.

Admission and completion linearize on the existing main lane. Device keys are
trimmed and case-normalized for scheduling. One device has one active OS request;
independent devices can progress concurrently. `@adapter`, resource leases, scan
signature compatibility, and peripheral engine backpressure remain in place.
Eligible work admitted during cancellation resumes in admission order.

Identical outstanding connects (normalized device key and the same timeout
argument) coalesce at admission, including while queued behind another request.
Each caller receives a separate result owned by its session. Once that task
completes, another connect is a fresh engine call and retains
`E_BLE_ALREADY_CONNECTED`. Different timeout arguments do not coalesce.

## Invalidation and cancellation

The engine starts an invalidation fence before disconnect, failed connection,
connect timeout, adapter loss, or explicit hardware-close cleanup can reject
engine futures or emit events:

1. Retire the affected OS delivery tokens/delegates.
2. Advance core generations, retire affected leases, and detach the complete
   old task generation before notifying any caller.
3. Reject affected caller results. Reentrant submissions are admitted but held.
4. Finish engine promise cleanup and state events.
5. Release the fence and dispatch eligible new work.

Core completion checks both task identity and captured generations. An old
completion cannot settle a cancelled result or remove a replacement queue's head.
The existing `BleFuture` implementations keep terminal results single-assignment.
Connection/value events recheck their delivery generation after settling a
request, because a result observer can synchronously close hardware.

Hardware close is still hardware close. The adapter-close control task survives
the invalidation it initiates; its result is still cancelled by session release.
Device-close control work bypasses the device FIFO so it can cancel a pending
connect. These methods do not become aliases for session release.

On iOS, an already-started adapter open survives `.unknown`/`.resetting` manager
transitions while old device work is invalidated. Terminal authorization and
unsupported-hardware failures keep their native error categories. Retired
CoreBluetooth delegates have their existing weak `owner` cleared; new
connections receive new delegates. Android callbacks capture a connection token,
and central callbacks also capture their manager lifetime. Before settling or
invalidating an address, Android central callbacks check the last peripheral
instance obtained by the engine. Blessed can evict a disconnected instance before
posting its callback; a reconnect can already own a different instance at that
address. The previous instance's delayed disconnect, failure, or connected
callback must not settle or retire replacement work.

Android disconnect results are keyed by the exact SDK peripheral identity.
Repeated closes of that peripheral join its pending result; a replacement
peripheral at the same address gets its own SDK cancellation and result.
Retired disconnect/failure callbacks remove and settle only their own close
waiter, without address invalidation or connection events. An old connected
callback leaves its close pending until terminal delivery. Current terminal
callbacks retain the invalidation fence before settling results. Adapter
shutdown and power loss detach and reject all current and retired close waiters.
Each waiter is removed before observers run, so reentrant replacement closes
and duplicate terminal callbacks cannot consume a different close result.

Android pair timers capture their exact promise, manager generation, and
connection token. A stale timer neither rejects a successor nor removes its
PIN. An active timeout removes its own PIN before rejecting the caller, while
an attempt-identity pin keeps the native device FIFO blocked. OS bond state
`NONE` alone is not terminal delivery. A bond terminal callback settles any
remaining caller result, then posts a guarded handler drain; only that drain
releases the device pin. Other devices remain eligible. Session release cancels
that session's result without releasing this OS lifetime.

Bond callbacks capture their pairing attempt separately from their connection
token. Duplicate/captured old callbacks and old drain closures cannot settle a
new attempt or free its fence. The drain keeps already-posted Blessed terminal
lambdas on the old callback until they have run. Hardware invalidation cancels
old caller work and retires its active pin. A retired SDK instance cannot accept
another pair until its pending terminal delivery drains; reuse fails with the
existing `E_BLE_PAIR_FAILED` category. A distinct replacement SDK instance may
proceed. SDK disconnect/failure and actual manager close release retired records.
Every callback construction now takes the exact SDK peripheral. Reconnect
captures that object's retired pairing attempt when replacing the mutable
transport callback; fresh pairing supplies its new attempt explicitly. A retired
bond success/failure/lost delivered through the reconnect callback therefore
still drains its old record, without changing the current connection or freeing
a newer pairing pin. No address-based attempt lookup is performed at delivery.

The cached Blessed 3.0.12 AAR was inspected directly with `javap` (SHA256
`71acc944c84289366c23eace08ff666d8f1f82ae0615e3781153f6ba92bedb68`).
`BluetoothPeripheral.getBondState()` reads `BluetoothDevice.getBondState()`;
`handleBondStateChange` posts the terminal lambdas, which read the mutable
`peripheralCallback` at delivery. The central manager's `createBond` returns
early for connected/connecting devices. The engine therefore installs the
callback using the public peripheral property and calls public
`BluetoothPeripheral.createBond()`, checking its Boolean admission result.
No bond-cancel API is assumed or added.

SDK limitation: connected `createBond()` may accept its internal queued command,
then later log an OS refusal without delivering a bond terminal callback.
The caller still times out, but the device stays safely pinned until a terminal
callback or explicit hardware invalidation. The same-instance reuse guard can
also remain until terminal delivery or actual manager close. There is no safe
time-based inference that the operation ended, and no automatic radio teardown
is added to mask this limit.

## Session and resource lifetime

`BleSession.release()` cancels only that session's results and removes its event
tokens and leases. A queued task with no remaining waiters is removed without
entering the engine. Releasing an active request's last waiter does **not** free
its device slot: the OS request must complete, or hardware invalidation must
retire it, before the next operation can safely run.

A coalesced connect can continue for another session after the first caller
releases. Release does not disconnect shared hardware. Scan/notification cleanup
still runs only after the last lease owner releases. Resource completion checks
generations before it can re-create a lease or schedule cleanup, so a retired
connection cannot disable a replacement connection's resource.
Queued cleanup rechecks the current owner set when it reaches the engine, under
the same native FIFO slot. It skips disabling a resource if a new owner acquired
it ahead of cleanup. This applies both to last-owner release and to completion of
an enable whose caller released while it was pending.
Successful enable also reacquires the current lease-map entry after its engine
action and generation checks. Android scan starts emit adapter-state events
synchronously; a listener can release the previous last owner and remove the
pre-action entry before enable returns. The new owner must join the current map,
so deferred cleanup sees that owner and its later release still cleans up.
iOS notification lease keys share the engine's existing UUID canonicalizer:
16-bit and 32-bit UUIDs expand to the Bluetooth base-128 representation, with
the same trimming and case rules as characteristic lookup. Enable, alias
disable, and release cleanup therefore share ownership for the same physical
characteristic, without relying on `CBUUID.uuidString` shortening.

Peripheral engines, ATT response expiry, notification backpressure, OS input
validation, and existing byte copies are unchanged. The behavioral suite below
targets central/adapter core-engine paths; it does not claim peripheral radio or
OS callback-order validation.

## Runtime lifecycle handoff

No automatic runtime-release hook is wired by this change. The pinned Valdi
source at `15feb6530ceecb971f4c8519ea8ab77474b959db` exposes:

- `valdi_core/valdi_core.djinni`: `ModuleFactory.getModulePath` and `loadModule`;
- `valdi/src/java/com/snap/valdi/modules/ValdiGeneratedModuleFactory.kt`:
  `onLoadModule` and final `loadModule`;
- `valdi_core/src/valdi_core/ios/valdi_core/SCValdiGeneratedModuleFactory.h/.m`:
  `onLoadModule` and `loadModule`.

These factories expose no runtime unload/dispose callback. The local
`ios/Module.swift` and `android/CalculatorModuleFactory.kt` retain a host with one
lazy session but receive no teardown handle. A finalizer, page-context disposal,
or guessed `onUnloadModule` is not a valid substitute.

The parent must establish an explicit runtime-owner release contract. The early
proposal is a distinct `BleHost.releaseSession(): Promise<void>` if the owner
cannot call a retained concrete native host directly. Its implementation must
close that host's admission, clear its event sink, and release only its existing
session without lazily creating one during teardown. It must not close the
adapter or another caller's resources. No such exported ABI or generated binding
is added here.

## Verification and limits

Run from the repository root:

```sh
python3 valdi/modules/bluetooth/tests/run_native_queue.py \
  --platform all --check-sdk --output /tmp/ble-native-queue-proof
```

The driver compiles the production core and engine, executes each case in a
separate process, and records per-case logs plus production, runner, and all
test/stub SHA256 values in each platform's `results.json`. It does not invoke Bazel, Gradle, Xcode builds, exports,
or devices. Test dependencies come from installed Swift and cached Kotlin/Android
artifacts; the driver performs no network fetch.

For the pristine pre-change source used during this task:

```sh
python3 valdi/modules/bluetooth/tests/run_native_queue.py \
  --platform swift --baseline \
  --baseline-ref e2aba889f65543f8f5e52024bede6d8aed99901d \
  --output /tmp/ble-native-queue-red-swift
python3 valdi/modules/bluetooth/tests/run_native_queue.py \
  --platform kotlin --baseline \
  --baseline-ref e2aba889f65543f8f5e52024bede6d8aed99901d \
  --output /tmp/ble-native-queue-red-kotlin
```

`--baseline` materializes Git blobs only under the output directory; it never
reverts shared checkout files. A nonzero result is expected for the regression
cases on that source.

Swift tests replace CoreBluetooth at the OS boundary and execute the real
`BleDelegates`, `BleFuture`, `BleCore`, and `BleEngine`. Android tests replace the
Android/Blessed boundary and the peripheral engine, while executing the real
central core/engine, futures, models, mappers, and listener/promise stores.
Deliberately delayed futures use the existing internal `submit` path; production
classes gain no test-only API.

The Android Handler boundary stores delayed closures and advances a deterministic
test clock explicitly; posted handler work drains through an explicit FIFO.
Pair regressions execute the unchanged production timer
body, including after early bond failure and adapter reopen. PIN assertions
dispatch a pairing broadcast through the production receiver and inspect the
bytes submitted to the OS boundary. No sleeps or production timer hooks are used.
Deferred terminal tests read the mutable SDK callback at delivery, and cover
timeout-before-terminal, posted duplicates, captured late callbacks, other-device
completion, session release, reentrant callers, power/close retirement, immediate
SDK refusal, and quarantine of a retired SDK instance. The four earlier pairing
tests retain their result/PIN/counter checks but now require native terminal
drain before same-device successor execution.
Reconnect regressions start pairing while disconnected, close without an SDK
cancel, reconnect the same cached object, and deliver the old terminal through
the new mutable callback. Success/failure/lost, reentrant close with another
session, session release, and power recovery all verify later pair admission
and rejection of late old callbacks against a new pair's PIN and fence.

The follow-up review regressions use distinct Android peripheral objects and
separate cache eviction from central callback delivery. They also hold a real
notification enable or RSSI operation active while another session queues enable
ahead of release cleanup. Existing counters remain asserted: stale cleanup must
not add an OS disable, and releasing the new last owner must still add exactly one.

`--check-sdk` separately typechecks **all** Swift core sources for arm64 iOS using
the installed iPhoneOS SDK, and compiles **all** Kotlin core sources against the
cached Android 36 SDK, Blessed 3.0.12, and AndroidX Core/Core KTX 1.17.0. This checks
the actual external API contracts, including unchanged peripheral sources; it is
not app linking, a radio test, or proof of device-specific SDK behavior.
