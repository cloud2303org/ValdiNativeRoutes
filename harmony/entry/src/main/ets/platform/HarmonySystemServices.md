# ArkTS system services: parent integration handoff

The service graph is constructed once per RuntimeHost, on the owning ability's UI
thread, with `new HarmonySystemServices(context: common.UIAbilityContext)`.
It implements the frozen `PlatformServices` interface with `version: 1`,
`ble`, `permissions`, `wifi`, `nfc`, `setActive(boolean): void`, and `close(): void`.
No service graph, permission authority, callback broker or context is global.

The graph creates one `HarmonyPermissionService(context)` and injects that same
instance into `HarmonyBleService(context, permissions)`,
`HarmonyWifiService(context, permissions)`, and
`HarmonyNfcService(context, permissions)`. PermissionService explicitly implements
the BLE-owned `HarmonyBlePermission` interface, as required by ArkTS nominal
typing. Its `requestPermission(kind: string): Promise<boolean>` accepts
`bluetooth`, which maps to `ohos.permission.ACCESS_BLUETOOTH`, and the supported
raw Harmony permission names. No permission request calls BLE or changes a radio.

Call `setActive(true)` only for the foreground ability. New graphs start inactive.
Backgrounding stops the Wi-Fi app session and NFC reader; callers explicitly
start these again when returning to the foreground. Graph close synchronously
invalidates pending work, releases owned callbacks, and resets NFC connections.
It does not await uncancellable system dialogs. `NfcHost.close(handle)` closes
one technology; the graph invokes `HarmonyNfcService.dispose()` for full teardown.
All shared methods retain real Promise return types and instance receivers.
All bridge binary values are `Uint8Array`; SDK-local NFC `number[]` values are
copied at the boundary. There is no JSON transport.

Wi-Fi has one intentionally shared **SDK resource coordinator**:
`HarmonyWifiCandidateCoordinator.forContext(context)`, injected as the optional
third argument of `HarmonyWifiService`. Its registry key uses the SDK's actual
`applicationInfo.uid` and application name, including across distinct
ApplicationContext wrappers. SDK candidate configurations/IDs belong to that
application, not to a RuntimeHost. The coordinator therefore holds one exclusive
candidate lease across graphs until SDK removal succeeds. A new graph receives
`E_WIFI_CONNECTION_OWNED` while an earlier allocation or candidate lease remains;
it cannot update/reuse a candidate ID that an old graph still needs to remove.
This is a conservative app-wide provisioning policy.

The coordinator contains numeric owners, a candidate lease, removal/recovery
state, ApplicationContext and SDK lifecycle listeners. It contains no Valdi host,
permission service, runtime, NAPI value, event sink or callback from a runtime.
Permissions, typed ports, events and JS contexts remain per graph. Closed graphs
release their owner immediately; unresolved SDK ownership retains only the
coordinator. Eligible recovery during a pending removal is latched by generation
and coalesces into one follow-up after rejection. Failure without another
recovery signal does not retry. Idle SDK listeners are removed when allocation
and removal finish; the registry entry is removed once no graph owners or SDK
lease remain.

## Permissions and parent-owned declarations

The installed SDK is
`/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/ets`.
The implementation uses its actual declarations, particularly
`@ohos.abilityAccessCtrl.d.ts`, `security/PermissionRequestResult.d.ts`,
`@ohos.settings.d.ts`, `@ohos.wifiManager.d.ts`, `@ohos.nfc.controller.d.ts`,
`@ohos.nfc.tag.d.ts`, and `tag/{tagSession,nfctech}.d.ts`.

The parent owns manifest declarations, localized reasons and shared business
Harmony gates. Required permissions for these implemented features are:

| Permission | Grant type | Feature | Parent resource |
| --- | --- | --- | --- |
| `ohos.permission.ACCESS_BLUETOOTH` | user_grant | BLE authorization | Add localized `permission_access_bluetooth_reason`, for example “Allow Bluetooth to discover and connect nearby devices.” Set the owning ability's used scene. |
| `ohos.permission.GET_WIFI_INFO` | normal system_grant | scan results and actual linked network | Declare normally; no runtime authorization dialog. |
| `ohos.permission.SET_WIFI_INFO` | normal system_grant | `startScan`, candidate configuration and connection | Declare normally; no runtime authorization dialog. |
| `ohos.permission.NFC_TAG` | normal system_grant | foreground reader and tag I/O | Declare normally; no system-app requirement or authorization dialog. |

No location feature is implemented by these services, and API 26 `startScan` plus
`getScanInfoList` does not require location. Do not add `LOCATION`,
`APPROXIMATELY_LOCATION`, `MANAGE_BLUETOOTH`, MAC address privileges,
`SET_WIFI_CONFIG`, or NFC enable/disable privileges for this path.
PermissionService can check/request raw location names for a future actual
location feature, but Wi-Fi never requests them.

The parent can use `check('bluetooth')` or
`requestMultiple(['bluetooth'])`; responses are **exactly**
`{ permission: string, result: string }`, retaining the caller's permission key.
`result` is `granted`, `denied`, or `never_ask_again`, with no `granted` boolean.
Unknown names, Android names, undeclared permissions and invalid prerequisites
reject with `E_PERMISSION_INVALID` rather than returning a fabricated denial
or grant. `GRANTED`, `RESTRICTED` and normal grants use
`getSelfPermissionStatus`. User authorization uses
`requestPermissionsFromUser`. Auth result `-1` with a shown dialog is `denied`;
`-1` with an explicitly unshown dialog is `never_ask_again`. Missing dialog
metadata does not establish permanent denial. Invalid `authResults=2` and
error reasons 1/2/3 reject. Settings uses
`settings.openAppDetailSettingsPage(context, context.applicationInfo.name)`.

## Wi-Fi behavior and explicit limits

`startWifi` verifies permissions and the global radio state, then attaches only
this instance's connection callback. It does not enable Wi-Fi.
`stopWifi` cancels the app's scans/connections, detaches exact owned callbacks
and removes only its candidate configurations; it never disables Wi-Fi or
disconnects a system network. Pending candidate creation has a late-result
cleanup path.

`getWifiList` subscribes before `startScan`, waits for `wifiScanStateChange=1`,
reads `getScanInfoList`, and emits the real mapped results. Scan failure/timeout
rejects; an empty successful SDK list stays empty. There is no fake scan cache.
BSSIDs from ordinary app scans and link queries are SDK virtual/randomized
addresses, passed through unchanged and treated as
`DeviceAddressType.RANDOM_DEVICE_ADDRESS` for candidate matching. They do not
prove hardware MAC identity. RSSI and frequency retain SDK dBm/MHz units.

`connectWifi` adds an app-owned candidate and uses API 26
`connectToCandidateConfig({ networkId, withUserAction: true,
userActionTimeout: 30, addNetworkToSystem: false })`.
Approval alone does not resolve the method: `getLinkedInfo` must report
`ConnState.CONNECTED` with matching SSID and optional virtual BSSID. Connection
events trigger rechecks, and a bounded association timeout rejects.
The shared contract carries a password but no security type; this implementation
provisions open networks or WPA PSK. Enterprise credentials, certificates,
WPA3-specific provisioning and WEP are not exposed by this contract.
SDK errors are mapped without including native error text or passwords.
`2501006` maps to `E_WIFI_USER_DENIED`, `2501005` to
`E_WIFI_CONNECTION_TIMEOUT`, disabled radio to `E_WIFI_DISABLED`, permissions to
`E_WIFI_PERMISSION_DENIED`, unavailable capability to
`E_WIFI_SYSTEM_NOT_SUPPORTED`, and invalid configuration to `E_WIFI_SYSTEM_CONFIG`.
No generic failure is mislabeled as a wrong password.

`maunal: true` rejects with `E_WIFI_SYSTEM_NOT_SUPPORTED`: no equivalent manual
system picker contract is implemented. `setWifiList` rejects with
`E_WIFI_SET_WIFI_LIST_UNSUPPORTED`; app candidate configuration does not implement
the existing mini-program system picker list semantics.
The legacy-named `getLocationPermissionState` and
`requestLocationPermission` represent actual Wi-Fi permission readiness:
granted when GET/SET permissions are present; blocked when denied; unavailable
when declaration checks fail. They do not prompt for location.
Partial connected info contains SSID only.

## NFC behavior and error contract

`isNfcSupported()` and `getNfcState()` use the real API 26 controller. No NFC radio
enable/disable operation is called. Reader mode uses `tag.on('readerMode', ...)`
and an ElementName derived from the exact context's application name,
ability name and module name. Reader and controller callbacks are retained and
removed by identity on stop/background/dispose.

Actual `TagInfo` objects stay private in the instance. Handles include a random
per-instance namespace, discovery generation and serial; new tags, stop,
background and dispose invalidate them. Supported SDK technologies are exposed
with the existing `android.nfc.tech.*` wire names because the shared adapter
already uses these identifiers. Methods accept both those full identifiers and
the adapter's short technology names.

Tag I/O uses real technology factories and `TagSession.connect`,
`resetConnection`, `isConnected`, `transmit`, `getMaxTransmitSize`, and
`setTimeout`. ATQA/SAK and ISO-DEP historical bytes come from SDK metadata.
One technology is connected at a time. NDEF discovery messages come from
`readNdef().getNdefRecords()`; writes use SDK `createNdefMessage`, URI/text record
factories, `isNdefWritable` and `writeNdef`. No NDEF success is synthesized.
A failed discovery read emits no fabricated records. A tag close rejects
pending I/O immediately; later SDK completion cannot revive a closed tag
operation. Stop and discovery replacement reset retained sessions, including an
in-progress initial NDEF read.

Shared prefixes are preserved: unsupported hardware `E_NFC_13000`, switch off
`13001`, invalid parameter `13011`, NDEF encoding failure `13012`, expired/unknown
tag `13013`, invalid tech `13014`, absent tech `13015`, connect failure `13016`,
system/I/O error `13017`, discovery stopped `13018`, permission/foreground
authorization `13019`, duplicate discovery `13021`, existing connection `13022`,
not connected/closed technology `13023`, and unsupported technology function
`13024`. Full host disposal uses `E_NFC_SESSION_RELEASED`, already recognized by
the shared mapper. NFC_TAG denial is never described as requiring a system app.

## Validation boundary

Run from the repository root:

```sh
node --test harmony/entry/src/main/ets/platform/tests/HarmonySystemServices.test.mjs
node harmony/entry/src/main/ets/platform/tests/HarmonySystemServices.check.mjs
node harmony/entry/src/main/ets/platform/tests/HarmonySystemServices.check.mjs --arkts
```

The checker copies only the service sources/types and BLE sibling dependencies
into an isolated temporary directory, binds imports to the actual installed SDK,
and removes that temporary directory afterward. `--arkts` runs the SDK's own
ArkTS 1.1 linter and strict checker, without invoking Hvigor, export, NAPI or a
device. `HARMONY_ETS_SDK` can point to another SDK's `ets` directory.

The tests execute the production ArkTS sources after TypeScript transpilation
with controlled SDK doubles. They verify permission result semantics, typed
data mapping, cancellation/late callbacks, actual-link verification, candidate
cleanup, per-instance ownership, graph composition, handle expiry, NFC tag
close, metadata and NDEF conversion. These are source and lifecycle tests.
Physical permission dialogs, Wi-Fi approval and association, randomized address
stability, NFC reader delivery and RF tag transactions remain hardware
unvalidated. No device, Hvigor, export, manifest, CMake, NAPI, RuntimeHost, Index,
shared business, commit or remote changes were performed by this child.
