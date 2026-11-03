# Harmony BLE adapter

`HarmonyBleService.ets` implements the exact `BleHost` interface exported by
`PlatformServiceTypes.ets`, which mirrors
`valdi/modules/bluetooth/src/BleHost.ts`: 28 Promise methods, synchronous
`setEvents`, and ten typed event callbacks. The implementation uses the installed
Harmony SDK 26.0.0 declarations, not an Android/iOS API approximation.

## Composition and permissions

```ts
const permissions = new HarmonyPermissionService(context);
const service = new HarmonyBleService(context, permissions);
const host: BleHost = service.ble;
```

The final constructor is `(context: common.UIAbilityContext,
permission: HarmonyBlePermission)`. The exported permission interface has one
method: `requestPermission(kind: string): Promise<boolean>`. The permission owner
must explicitly implement that interface for ArkTS 1.1. It must handle
`requestPermission('bluetooth')` through its own permission service without
calling back into BLE adapter opening or a BLE operation queue. The same
permission instance is injected into BLE, Wi-Fi and NFC by the composition owner.
The BLE class never discovers a global Ability or constructs another permission
service.

Manifest permission needed for the ordinary BLE paths:

* `ohos.permission.ACCESS_BLUETOOTH`, with the host's user permission reason and
  usage scene.

The parent owns the manifest and shared Harmony permission branch. This change
does not edit them. Construction is inert. `openBluetoothAdapter` asks the
injected permission owner, checks support and current radio state, and registers
only this instance's callbacks. If Bluetooth is off, it rejects with
`E_BLE_ADAPTER_NOT_AVAILABLE`. It never calls an enable/disable API.

No `MANAGE_BLUETOOTH`, `GET_BLUETOOTH_PEERS_MAC`, or
`MANAGE_BLUETOOTH_ADVERTISER_NAME` permission is required by the implemented
ordinary paths. A requested custom advertising name which differs from the
existing system Bluetooth name rejects explicitly, as described below.

## Execution authority and TS FIFO removal prerequisite

`HarmonyBleExecutionCore.ets` is the single hardware admission authority used by
all service graphs in this ArkTS application executor. Its registry key comes
from the actual `context.applicationInfo.uid` and `.name`; missing/invalid
identity rejects. The core retains no Ability context, SDK client/server,
runtime host, event sink, dispatch closure, permission service, or business
state. It holds numeric ownership IDs, session-generation tokens, FIFO admission
tickets, and native-operation lease counters. Transient ticket admission
continuations are cleared immediately on grant/cancellation. The graph's async
call owns its own dispatch closure and releases it when cancellation rejects
admission.

Each opaque device ID has one execution lane shared across graphs in that
application scope. A central operation acquires the lane before any service
discovery, characteristic lookup or SDK call, and keeps it through the logical
operation. Connect, pairing, paired-state queries, service/characteristic
discovery, RSSI, read/write, notification/indication setup, negotiated-MTU
changes and ordered cached-MTU queries use this authority. Connected-device
enumeration submits its SDK work through each device's lane. Other devices
progress independently. Peripheral notification/indication dispatch shares
that same device lane.

The `@adapter` lane orders scan starts, advertising starts, GATT-server
allocation and service registration/removal across graphs. The SDK supports
independent scanner objects and advertising IDs; completed allocations remain
owned by their graph. Read-only radio/name queries do not acquire a command
lane. ATT request responses and explicit SDK resource teardown remain urgent,
out-of-band operations.

The runtime's pending Promise, timer and event state is separate from a
hardware lease. A business timeout rejects the caller but **does not release
the lane while its actual SDK Promise is outstanding**. The core observes the
real SDK terminal Promise, not the timeout gate. Void `connect()` is fenced by
an actual connected/disconnected SDK event or successful SDK client close.
Unconfirmed cleanup keeps the hardware lease quarantined; a later real native
terminal result or confirmed `STATE_OFF` can release it. Turning-on/off and
BLE transition notifications cancel business work but do not clear native
fences. A failed void-connect close with
no remaining observable terminal event may require confirmed `STATE_OFF` to clear that
fence. This is intentionally conservative.

Pair initiation is a special case: `pairDevice()`'s Promise settles the
`StartPair` request, not the asynchronous bond procedure. A graph-created
`BlePairBondLease` registers its own exact bond and radio callbacks before
issuing that request. Its hardware fence completes only on a matching
`BOND_STATE_BONDED`/`BOND_STATE_INVALID` notification, a positive BONDED query,
or confirmed `STATE_OFF`. Synchronous argument/async-work setup failure before
the request is dispatched can also release an unstarted reservation. An
asynchronous initiation rejection fails its caller but is conservatively not
treated as proof of bond termination.

Pairing delivery and PIN submission require this graph's admitted, current
device ticket and started, nonretired pair. A queued graph cannot answer
another graph's PIN event. Caller timeout, background, adapter shutdown, and
host close retire runtime delivery. The remaining terminal-only
observer has no PIN, Ability context, service/host reference or event sink; its
active pending-result reference is cleared on retirement. The shared execution
core still contains no SDK registrations or handles. A late bond terminal
event can release another graph's queued operation without reviving the old
caller's Promise or invoking its callbacks.

Ordinary APIs used here expose no app-safe cancellation of an ongoing bond.
The adapter does not call privileged pairing confirmation/cancellation. A
missing terminal notification therefore keeps that device lane quarantined
until a positive BONDED query at initiation completion or confirmed `STATE_OFF`;
there is no timer that silently unlocks a still-bonding device. Other device
lanes continue independently. At most one admitted terminal bond observer is
retained per device lane. Terminal observers unregister using their exact
callback objects; a failed SDK `off()` leaves an inert observer with runtime
delivery cleared. SDK bond events have a peer ID/state, not a request ID, so
the adapter relies on the ordinary SDK's per-peer state notifications; it
does not claim cross-process/VM or arbitrary out-of-band pairing ownership.
If BONDING is already observed at admission, the caller rejects and the
reservation observes its terminal state without submitting a new PIN/request.

Close/disconnect cancels the captured session's queued admissions and in-flight
caller waits synchronously, calls its SDK disconnect/close out of band, and
does not wait behind a hung connect or data operation. Repeated close while
cleanup is pending joins that cleanup. Closing one graph cancels only its
tokens; another graph's active/queued lease remains intact. Same-graph repeated
in-flight connect joins the original operation; a fresh connect to an already
connected session rejects `E_BLE_ALREADY_CONNECTED`.

Drains run in microtasks and validate the admission token again before
dispatch. Unavailability invalidates all application tickets before completion can
drain another command. Every graph still owns and checks its actual
`clients.get(deviceId) === session` identity, connected state, execution token
and service-cache revision. There is no comparison of an immutable session
generation to itself. The previous disconnect-continuation identity guard and
the descriptor 22-byte rejection policy remain in place.

Write byte views are copied at public admission, before waiting for a device
lane or service discovery. Peripheral values, service/descriptor values and
advertising manufacturer payloads are likewise copied before waiting for
hardware admission.

The shared `TSWeChatBleRuntime` FIFO may be deleted only after this native
platform authority and the equivalent iOS/Android BleCore authorities satisfy
the same contract and pass independent review. This BLE change does not remove
or alter that shared FIFO, the public ABI, or generated bindings. The guarantee
is for service graphs using this platform module's application executor; it
does not claim coordination across separate OS processes/ArkTS VMs.

## Central implementation

* Scanning owns a `ble.createBleScanner()` instance. It registers
  `BLEDeviceFind` before `startScan(filters, options)` and reads
  `ScanReport.scanResult`. It ignores lost reports. `stopScan()` and `off` use
  that same scanner and callback. Name/service filters use their native SDK
  fields. Address filters use the opaque `ScanFilter.deviceId` field.
* Device IDs are opaque SDK IDs, including normal-app virtual IDs. There is no
  MAC address promise, MAC-shaped validation, conversion to a privileged
  `BluetoothAddress`, or assumption that an ID survives reinstall or platform
  privacy changes.
* Advertisement bytes stay binary. Production helpers parse bounded AD
  structures, little-endian 16/32/128-bit UUIDs, service data, and UTF-8 local
  names. SDK-parsed service UUID/data fields take precedence when supplied.
  Duplicate suppression and the bridge's per-device millisecond `interval`
  are applied before event delivery; cached device snapshots still update.
  Bridge bytes are copied in both directions, including sliced `Uint8Array`
  views.
* A client registers connection, characteristic, MTU and service-change
  listeners before `connect()`. The void return from `connect` does not resolve
  the host Promise. The connected event does, with a default 20-second timeout.
  Disconnect waits for the disconnected event, with a 10-second timeout, then
  closes that client's SDK resources.
* Service and characteristic lookup uses SDK `getServices()` results owned by
  the connection object/generation. Disconnect and service-change invalidate
  them. Late discovery/read/MTU completion from a previous connection cannot
  update a reconnected session.
* Reads await `readCharacteristicValue` and emit the returned bytes through
  `characteristicUpdate`; the public Promise resolves `void`. Notifications use
  `setCharacteristicChangeNotification`, and indications use the distinct
  `setCharacteristicChangeIndication`. Writes use the actual SDK
  `GattWriteType.WRITE` or `WRITE_NO_RESPONSE`, copy the payload, and enforce
  the negotiated ATT payload size.
* RSSI uses `getRssiValue`. SDK 26 `setBLEMtu` returns the actual negotiated MTU,
  not the requested number. The initial ATT MTU is 23; the real return and
  `BLEMtuChange` events update it. Duplicate identical MTU events are suppressed.
  `getBLEMTU` returns the cached negotiated ATT MTU.
* `getConnectedBluetoothDevices` enumerates this owner's connected sessions,
  discovers their services, applies requested service filters, and reads their
  SDK names. It does not claim ownership of another application's clients.
* Pairing uses ordinary `connection.pairDevice`, `bondStateChange`,
  `pinRequired`, and `setDevicePinCode`. The shared Base64 PIN is decoded to
  1–16 printable ASCII bytes for the SDK string parameter. Success requires an
  actual BONDED event/state. Pairing confirmation that requires elevated
  `MANAGE_BLUETOOTH` is never invoked; numeric comparison and other user
  confirmations remain system UI interactions.

## Peripheral implementation and explicit limits

All seven peripheral host methods are implemented with real ordinary APIs:
`createGattServer`, `addService`, `removeService`, asynchronous
`ble.startAdvertising`/`ble.stopAdvertising`, `sendResponse`,
`notifyCharacteristicChanged`, and `GattServer.close`. The adapter does not
report peripheral capability optimistically: `BleAdapterState` leaves optional
`peripheralAvailable` absent because the ordinary SDK has no equivalent
capability query. SDK capability failures reject.

Characteristic properties, read/write/encrypted permissions, initial values,
and custom descriptor permissions are passed to the SDK. The adapter owns
CCCD creation and per-central subscription flags. Characteristic read/write,
descriptor read/write, and server connection listeners are installed before
the server is returned. Read and acknowledged write requests have unique
bridge callback IDs and a 10-second response deadline. An unanswered request
receives ATT Unlikely Error. An expired/already-answered/wrong-characteristic
callback is rejected. No-response writes emit their event and update the
local value without inventing an ATT response.

CCCD writes distinguish notification and indication flags. The bridge emits
subscribed/unsubscribed events and sends notifications only to subscribed
connected centrals, with the real SDK Promise deciding completion.
Disconnect/service removal/server close clear requests and subscriptions.

The following scopes are explicitly rejected:

* A nonempty `deviceName` different from `connection.getLocalName()` rejects
  `E_BLE_SYSTEM_NOT_SUPPORTED`. SDK `AdvertiseData.advertiseName` requires
  `MANAGE_BLUETOOTH_ADVERTISER_NAME`; ordinary code cannot silently replace it.
  An empty name omits it; the existing system name uses `includeDeviceName`.
  Service UUIDs, manufacturer data, iBeacon bytes, connectability, and low/
  medium/high advertising power are otherwise mapped to real SDK advertising
  parameters. SDK errors such as packet size, resource exhaustion or unsupported
  advertising remain failures.
* The server `BLEMtuChange` callback carries only a number, with no central ID.
  The adapter cannot safely associate a negotiated MTU with each central. It
  therefore rejects outbound notification values above 20 bytes, and characteristic
  or descriptor read responses whose remaining value exceeds 22 bytes. A long read response
  rejects `E_BLE_SYSTEM_NOT_SUPPORTED` and sends ATT Invalid Attribute Value
  Length, rather than silently returning a short successful response.
  Central-side negotiated MTU handling has no such limitation.
* Prepared characteristic/descriptor writes receive ATT Request Not Supported.
  Nonzero write offsets receive ATT Invalid Offset. The shared event ABI has
  no prepared-write execute/cancel transaction, so it cannot represent such a
  transaction correctly.
* Caller-supplied CCCD descriptors are rejected: subscription descriptors are
  owned and validated by this adapter. Values above 512 bytes reject.

These are narrow contract/privilege limits, not fake capability success.

## Ownership and lifecycle

`setActive(false)` invalidates pending foreground opens, cancels pairing waits,
stops discovery, and drops late scanner callbacks. It preserves established
central GATT connections, existing GATT servers, and advertising. Returning to
foreground does not automatically resume scanning. This policy never invents a
disconnect just because the host is backgrounded.

`closeBluetoothAdapter` shuts down the current adapter session and allows a
later explicit reopen. `close()` permanently disposes this service instance and
releases its event object. Both invalidate epochs, reject owned outstanding
Promises, clear timers, stop owned scans/advertisements, detach normal runtime callbacks using
the exact registered function objects, and disconnect/close owned clients and
servers. Closing one server cancels its pending native waits immediately.
If a previously pending scanner/advertiser start returns after disposal, the
late-created resource is stopped. Nothing unregisters another owner's callback
or turns off the user's radio. The shared execution authority contains no global
runtime/event singleton.
An unfinished bond deliberately retains its terminal-only lease callbacks after
host/adapter close; caller delivery is already cleared. Those callbacks have
no path to the closed host and unregister on proven bond termination/OFF.
PIN Promise completion uses that same retireable lease. Its SDK-facing rejection
callback captures no service, pair or PIN. Timeout, background, close and terminal
bond/OFF clear the lease's pending delivery even if the PIN Promise never settles.

The adapter's state/bond/PIN registrations use a per-instance relay. Every
forwarder is cleared before the first SDK `off()` call, so synchronous teardown
reentry and late callbacks cannot reach the retired graph. Failed `off()` calls
retain their exact callback handles for a later explicit adapter close/reopen or
repeated `close()` retry. Reopen allocates fresh delivery callbacks and never
reactivates an old registration. There is no failure-driven retry loop or global
runtime cleanup owner. The SDK may continue to retain **inert callback/lease
metadata** when removal fails; that metadata has no path to the closed runtime,
permission service, ability context, host events or pairing PIN.

Default SDK Promise timeout is 20 seconds. Connect and pairing accept their
ABI-provided positive timeout. Cleanup is best effort where SDK teardown itself
throws; no detached SDK Promise is left without a rejection handler.

## Source-only validation

From the repository root:

```sh
node --test harmony/entry/src/main/ets/platform/HarmonyBleHelpers.test.cjs harmony/entry/src/main/ets/platform/HarmonyBleService.test.cjs
node harmony/entry/src/main/ets/platform/HarmonyBleService.sourcecheck.cjs
```

The helper test copies the production `.ets` helper into an isolated temporary
`.ts` compilation using the existing TypeScript compiler and executes that
output. It does not reproduce helper logic in tests. The adapter tests execute
the production service and execution core against controlled SDK boundaries to
exercise two-graph same-device FIFO ordering, independent-device progress,
queued cancellation, timeout/native-terminal separation, failed-cleanup
quarantine, connecting cancellation, repeated close, payload admission
snapshots, adapter allocation order, callbacks, actual session replacement,
response/notification behavior and late completion.
They do not prove actual radio behavior.

The 2026-11-03 review regressions additionally reproduce queued PIN collision,
timeout/background/close while StartPair has settled but the device remains
BONDING, all four transitional radio states with failed-close quarantine, late
initiation settlement after terminal bond state, asynchronous initiation
failure without terminal evidence, and confirmed-OFF cleanup after host close.
The six review2 regressions deliberately leave the SDK PIN Promise unresolved
through timeout/close and terminal bond/OFF, inspect its retained callback
references, and exercise three failing `off()` calls, synchronous `close()`
reentry, late callbacks, explicit repeated-close cleanup and adapter reopen.
The test compiler annotates lexical arrow receivers in a WeakMap because Node's
inspector omits that hidden slot; the production callback bodies and receivers
are preserved. Inspector scope/own-reference traversal then checks the actual
retained callbacks for graph, permission and PIN references. No GC timing,
production test API or duplicated adapter implementation is used.

The source check loads the installed SDK's patched TypeScript compiler and
`ArkTSLinter_1_1`, checks the service/helpers/exact platform types against the
actual `@kit.ConnectivityKit` declarations, and removes its temporary build
information. It never invokes Hvigor. The sibling composition check can validate
the combined graph as well.

Installed primary declaration sources:

* `$DEVECO_SDK_HOME/default/openharmony/ets/api/@ohos.bluetooth.ble.d.ts`:
  `BleScanner`, `ScanReport`, `GattClientDevice`, `GattServer`, `GattProperties`,
  `GattPermissions`, `AdvertisingParams`, `AdvertiseData.advertiseName`.
* `@ohos.bluetooth.connection.d.ts`: `pairDevice`, `getPairState`,
  `setDevicePinCode`, `bondStateChange`, `pinRequired`.
* `@ohos.bluetooth.access.d.ts` and `@ohos.bluetooth.constant.d.ts`: radio and
  connection state enums.

Pairing termination source contract audited on 2026-11-03:

* Installed SDK `@ohos.bluetooth.connection.d.ts:109-146` describes `pairDevice`
  as starting pairing. Lines 683-707 expose separate `bondStateChange` delivery;
  lines 1068-1098 define INVALID/BONDING/BONDED as 0/1/2. The initiation Promise
  is not a documented bond-terminal signal.
* OpenHarmony `communication_bluetooth` commit
  `fa1152af879a1e8ac0da0c840e651f658e2fdeaf`,
  `frameworks/js/napi/src/connection/napi_bluetooth_connection.cpp:775-796`
  constructs async work whose result is the return code of
  `BluetoothRemoteDevice::StartPair()`.
  `frameworks/inner/src/bluetooth_remote_device.cpp:223-233` forwards that
  request to the host proxy.
  `frameworks/js/napi/src/connection/napi_bluetooth_remote_device_observer.cpp:52-62`
  separately publishes the native pair-status change through the bond-state
  event. This corroborates the installed declaration contract; it is not a
  provenance claim that the installed vendor binary was built from that commit.
* Installed SDK `@ohos.bluetooth.access.d.ts:243-294` defines confirmed OFF as
  0, turning on/off as 1/3, and BLE transitions as 4/6. ON/BLE_ON are 2/5.
  Only confirmed OFF is used as global native termination proof.
* The SDK's `setDevicePairingConfirmation` requires `MANAGE_BLUETOOTH`; it
  is not used for cancellation or automatic confirmation.

Frozen review receipts are under
`/tmp/harmony-ble-authority-review-20261103-1/`. `red.log` and
`red-source-hashes.json` record the original eight failing cases against the
frozen implementation. `run-receipts.cjs` records final command logs, before/
after SHA-256 source seals, compiler inputs, exact runner hashes, and inline
SDK-stub test-file hashes in `final-receipt.json`. Pinned upstream source
copies and their hashes accompany that receipt. The receipt/source checks do
not build, export, or exercise a device.
The prior receipt is preserved byte-for-byte with SHA-256
`dd63f6b7101d78d8e531969b86542732455024ab4b99a2529751ccae4fcf6bd6`.
The separate review2 receipt directory is
`/tmp/harmony-ble-authority-review2-20261103-1/`; it preserves the six failing
tests against the original frozen service/core, records an isolated RED replay,
and seals the GREEN production sources, test compiler metadata, inline SDK
stubs, receipt runner, SDK/compiler inputs and all command logs. Its test
totals are 59 BLE (prior 53 plus six lifetime regressions) and 34 composition.
The source/unit evidence still leaves shared TS FIFO deletion gated on parent
independent review of the native execution authority.

No full Hvigor/HAP/export build, device interaction, pairing, radio toggle,
on-device scan, GATT interoperability, long-running background behavior, or
advertising hardware capability has been validated by these source/unit checks.
No manifest, host, page, shared business module, NAPI, backend, or CMake file is
part of this implementation's write scope.
