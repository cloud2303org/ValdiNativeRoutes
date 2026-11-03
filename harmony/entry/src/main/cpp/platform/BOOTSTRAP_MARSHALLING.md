# Business bootstrap marshalling regression, 2026-11-02

The parent captured one underlying bootstrap conversion failure in
`.ci/harmony/2026-11-02-completion/business-r1-startup-native.log`: the JS error
and UI notification both report `Cannot convert type 'typed object' to type
'proxy object'` while setting the global. The subsequent missing
`__harmonyBusinessBootstrap` is a consequence. The associated runtime receipt
identifies HAP SHA256
`170b28e673937af2784f5351bbb2b1ef55eca1343a06d736d2f8e312e273efc5`
and native SHA256
`b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7`.

## Pinned official contract

The repository pins Valdi `15feb6530ceecb971f4c8519ea8ab77474b959db`.
The following paths are relative to the prepared pinned source
`.tools/harmony/upstream/` (also available under
`valdi/bazel-valdi/external/valdi+/`). This audit used the actual local source
and generated bindings, rather than assuming engine behavior from direct C++
port calls:

- `docs/docs/native-annotations.md`, Export Annotations: `@ExportModel` emits
  a model class; `@ExportProxy` emits an interface that native code implements.
- `valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp:656`:
  `setValueToGlobalObject` converts the complete value using `valueToJSValue`
  before assigning the global. An error in a nested host prevents assignment.
- `valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp:209` and `:231`:
  typed objects and proxies use distinct entry points when a
  `JavaScriptValueMarshaller` is attached. The no-marshaller fallback inflates
  fields directly and therefore cannot prove the production boundary.
- `valdi/src/valdi/runtime/JavaScript/JavaScriptValueMarshaller.cpp:63`:
  the generated class schema selects the appropriate registered marshaller.
- `valdi_core/src/valdi_core/cpp/Utils/DefaultValueMarshallers.hpp:1146`:
  `ObjectValueMarshaller::unmarshall` branches on `ClassSchema::isInterface()`.
  Its interface branch, at `:1078`, requires a `ValueTypedProxyObject` using
  `checkedTo<Ref<ValueTypedProxyObject>>()`, then converts the underlying typed
  fields and retains proxy identity through the official object store.
- `valdi_core/src/valdi_core/cpp/Utils/ValueTypedProxyObject.hpp:22` exposes
  the typed payload constructor and `getType()` extension point. The pinned
  `valdi/test/integration/Runtime_tests.cpp:149` uses this same small subclass
  pattern; its proxy tests around `:4823` verify retention and JS round trips.

The actual bindings in `.tools/harmony/business-bindings/valdi_modules/`
register `BleHost`, `PermissionHost`, `WifiHost`, `NfcHost`, and
`BluetoothModule` as `c+` interfaces. Previously both `ServicePort::hostValue`
and `BluetoothFactory::loadModule` supplied bare typed objects. This mismatch
explains the saved failure before the business entry point runs.

## Current production implementation

`PlatformServiceAdapters.{hpp,cpp}` now contains generated explicit subclasses
of the four canonical CppGeneratedInterface hosts. The actual generated
`BleHost::marshall`, `PermissionHost::marshall`, `WifiHost::marshall` and
`NfcHost::marshall` paths use official `CppMarshaller` proxy handling.
`PlatformServiceInterface.hpp` is only a small helper for that official API;
it no longer defines a custom proxy class or assembles method trampolines.

The 52 Future overrides and three event installers come from the annotation
model pipeline and canonical C++ type parser. Fixed generated descriptors
resolve their schemas once. `ServicePort` owns only thread handoff, deeply
owned value validation, pending completion, event epochs and lifecycle pins.
Its old reflective `hostValue(name)` builder has been removed. The facade's
public host getters remain unchanged.

`PlatformBluetoothModule.hpp` explicitly subclasses the generated
`BluetoothModule`, retains the typed BLE interface, and keeps only a weak port
reference. Both module and host values use actual c+ proxy marshalling. DTO
records retain their c schemas and typed-object representation. Native Future
results cross the official Future marshaller before JS Promise settlement.
No schema flag is changed, no callback signature is erased, and the existing
nonempty fallback for empty rejection strings/Error.message is preserved.
The canonical app_pages root is included before stale prepared business
bindings. See `PLATFORM_API.md` for generation and read-only `--check` commands.

## DTO and Promise audit

The actual generated availability, Wi-Fi info/permission/credential records,
permission grants, BLE models, NFC handle/tag/message records, and event
containers use `c` record schemas. These must remain typed objects. A
TypeScript `interface` declaration alone does not determine `isInterface()`:
the generated schema distinguishes `@ExportModel` and `@ExportProxy`.

The linked boundary suite constructs fixtures from every generated method's
parameter/result schema and every generated event's parameter schema. It
asserts that DTO classes are records, passes parameters through JS and the
production port, fulfills all 52 real native Promises through the attached
official JS marshaller, then marshals the received JS values back and compares
their typed contents. This includes `nfc.getAvailability`,
`wifi.getConnectedWifi`, `connectWifi`, both Wi-Fi permission methods,
permission-grant arrays, optional fields, nested DTO arrays and byte arrays.
All 14 generated BLE/Wi-Fi/NFC events also traverse the production event path
and official typed JS callback marshaller.

Negative controls unwrap the proxy and submit each original populated host
payload in a nested map; all four reproduce the saved conversion error.
The bare Bluetooth module payload independently reproduces it. Positive tests
verify the nested bootstrap assignment, its callable methods, repeated proxy
identity, and the production Bluetooth factory's `getHost()` return.

## Reproduction and evidence boundary

```sh
python3 harmony/entry/src/main/cpp/platform/tests/verify.py \
  --engine --output /tmp/harmony-platform-typed-adapters-proof
```

The driver compiles and strictly links the platform sources, facade, generated
bindings and dispatcher for real SDK x86_64 and arm64-v8a. It runs 12 native
helpers and 14 production Node-API transport tests with ASAN/UBSAN, including
the empty-string and empty-Error-message rejection regressions. `--engine`
adds seven linked engine-boundary tests, including all 52 malformed OS
results, all 14 malformed OS events, and weak runtime ownership through the
actual generated module/host proxies. `proof.json` records source hashes,
ABI link commands, executable hash, engine identity and explicit limits;
`results.xml`, `node-api-tests.log`, and `engine-results.xml` carry results.

Only OHOS-targeted Hermes libraries are prepared locally; those cannot be
linked into a macOS host executable. The engine proof therefore compiles the
official pinned Valdi JavaScriptCore adapter and shared marshaller against the
macOS JavaScriptCore framework. It asserts an attached marshaller and executes
the same conversion and property-assignment operations as the official global
setter, without instantiating `JavaScriptRuntime` or calling its setter.
The OS services and scheduler are doubles. This is actual JS execution with
the official Valdi boundary, not an OHOS Hermes/business bundle/HAP acceptance
claim. The parent owns that subsequent runtime validation.

The pinned JSC adapter uses Clang zero-length VLA extensions for zero-argument
calls. The host driver disables only UBSAN `vla-bound` for the two upstream
adapter translation units `JavaScriptCoreContext.cpp` and
`JSCoreCustomClasses.cpp`. Other UBSAN checks, ASAN, and all checks on platform
production/test code remain enabled. No upstream source is patched.
