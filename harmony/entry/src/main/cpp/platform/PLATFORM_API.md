# Frozen platform service port

`../business/HarmonySystemServiceHosts.hpp` is the RuntimeHost integration API.
`../../ets/platform/PlatformServiceTypes.ets` exports `PlatformServices`, all
`Ble*` models, `BleHost`, `BleHostEvents`, `PermissionHost`, `PermissionGrant`,
`WifiHost` and its models/events, and `NfcHost` and its models/events.

Construct `HarmonySystemServices(context: common.UIAbilityContext)` in the
owning UIAbility graph. Supply that object to native mount. The injected
interface is exactly:

```typescript
interface PlatformServices {
  version: 1;
  ble: BleHost;
  permissions: PermissionHost;
  wifi: WifiHost;
  nfc: NfcHost;
  setActive(active: boolean): void;
  close(): void;
}
```

Native UI thread, before mount:

```cpp
auto system = HarmonySystemServiceHosts::create(env, services, dispatcher, jsQueue);
```

On the Valdi JS queue, use `bluetoothFactory()` for
`bluetooth/src/Bluetooth`; inject `permissionHostValue()`, `wifiHostValue()` and
`nfcHostValue()` through the existing business install functions. The BLE getter
also exposes `bluetoothHostValue()`. Host interfaces and the Bluetooth module
are `ValueTypedProxyObject` values containing their actual generated
`ValueTypedObject` payloads, including parameter and Promise result models.
Generated DTO records remain `ValueTypedObject`. The schema's interface flag
must match the value representation at the official JS marshaller boundary.
Production mounts use these system-service interfaces, not the unsupported
capability implementations retained by HarmonyBusinessModules.
Factories and native functions use weak runtime ownership.

The business-wide binding rules, including synchronous generated-model hosts
and native AppUI, are documented in `docs/harmony-typed-api-contract.md`.

The service implementations are generated explicit subclasses of the canonical
`BleHost`, `PermissionHost`, `WifiHost` and `NfcHost` CppGeneratedInterface
classes: 52 typed Future overrides and three typed event installers. Their
signatures come from `dumpAllSymbols` / `processAnnotations` and the existing
`CppCodeGenerator.getTypeParser`. No emitted C++ is parsed, and no existing
codegen pipeline or canonical ABI output is changed.

`PlatformServiceAdapters.{hpp,cpp}` live in the production source tree. Each
runtime lazily owns one native instance of each interface. Official
`CppMarshaller` handles proxy identity, methods, DTO arguments and Future
results. `BluetoothModuleAdapter` implements the actual generated module
interface and returns the same typed BLE instance with only weak runtime
ownership. There is no reflective `ServicePort::hostValue(name)` builder and no
hand-maintained method dispatch switch.

Generated fixed method descriptors resolve the canonical schemas once and
verify the generated property index/name pairing. Low-level NAPI transport uses
that immutable metadata to invoke the actual ArkTS receiver, attach real
Promise handlers and install typed events. String property names in this
private metadata are not a public generic message protocol. Argument-type
errors now use the official marshaller's behavior before the typed virtual
method is entered; malformed OS results/events still pass the owned validator.

Lifecycle order is mandatory:

1. UI: `setActive(active)` forwards to the owning graph.
2. UI, before navigation/context disposal is queued: `closeOnUI()`. This closes
   native admission atomically, queues JS cancellation, then calls the owning
   graph's synchronous `close()`. That graph must invalidate outstanding OS work
   and detach its listeners; it must not wait for a permission dialog.
3. Valdi JS queue, before disposing any contexts: call `shutdownOnJS()`
   explicitly as the shutdown fence. It is safe after the cancellation queued by
   step 2. It settles every admitted Promise exactly once and releases retained
   event functions and their `RetainedContext` pins on JS.
4. Keep UI pumping until the JS teardown fence completes. UI, while NAPI env and
   dispatcher remain valid: `releaseOnUI()`, then drop the native owner.

Never destroy an open owner on an arbitrary worker thread. NAPI references are
created/read/deleted only on UI. A late Promise/event callback owns a weak
transport token and an owned schema/completion; it never owns a raw RuntimeHost.
Event replacements carry monotonically increasing epochs. Already queued
events from an older sink are discarded. All queue-crossing values are copied:
strings, records, arrays, booleans, null/undefined and exact Uint8Array view
bytes. Unknown record fields are dropped; missing or mistyped required fields,
non-finite numbers, invalid array kinds and oversized/deep values are rejected.
Numbers retain the shared contracts' SDK units.

Sources to add to the parent target:

- `platform/PlatformServiceCodec.cpp`
- `platform/PlatformServicePort.cpp`
- `platform/PlatformServiceAdapters.cpp`
- `platform/NapiPlatformServiceTransport.cpp`
- `business/HarmonySystemServiceHosts.cpp`

Include `valdi/native/generated` FIRST so the current canonical
`valdi_modules/app_pages/app_pages.hpp` wins over older prepared business
bindings. The prepared `.tools/harmony/business-bindings` root supplies the
Bluetooth bindings. Link the corresponding generated `bluetooth.cpp` and
canonical `app_pages.cpp` exactly once each. All four host models and their
referenced DTO/event schemas are required. Native dependencies remain the
existing Valdi runtime, UI dispatcher, `ace_napi.z`, `hilog_ndk.z` and `uv`.

Regenerate only the two production adapter files from the repository root:

```sh
tools/valdi-rolldown/node_modules/.bin/tsx \
  tools/valdi-rolldown/harmony-service-adapters.ts \
  --out harmony/entry/src/main/cpp/platform
```

Read-only freshness check (fails on missing/stale files; never creates output
folders or writes files):

```sh
tools/valdi-rolldown/node_modules/.bin/tsx \
  tools/valdi-rolldown/harmony-service-adapters.ts \
  --out harmony/entry/src/main/cpp/platform --check
```

Focused generator tests:

```sh
tools/valdi-rolldown/node_modules/.bin/tsx --test \
  tools/valdi-rolldown/harmony-service-adapters.test.ts
```

The port performs transport only. It does not implement or claim BLE scanning,
GATT, permission prompts, Wi-Fi or NFC hardware behavior. The service adapters
own the ArkTS kit operations for capabilities the SDK26 C audit found
incomplete; C-exposed state APIs can remain in native adapters. No AppUI, HTTP,
native backend or global service registry is introduced.

Focused validation, reusing existing runtime artifacts:

```sh
python3 harmony/entry/src/main/cpp/platform/tests/verify.py \
  --engine --output /tmp/harmony-platform-typed-adapters-proof
```

This compiles and strict-links both real SDK ABIs without an application
build/export, and runs the production native core with real Valdi and an OS
service double under ASAN/UBSAN. Host Node-API transport tests use official
Node-API headers/runtime to execute the production Promise/event transport.
`--engine` additionally compiles the pinned official Valdi JavaScriptCore adapter
and JavaScript marshaller, links macOS JavaScriptCore, asserts that the marshaller
is attached, and runs the engine-boundary regression. This is host JSC execution,
not OHOS Hermes execution. See `BOOTSTRAP_MARSHALLING.md` for the diagnosed source
path, DTO coverage, negative controls, and exact evidence limits.
