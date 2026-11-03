# Harmony native API binding contract

Business code calls named, typed host methods. The shared TypeScript declarations
and their canonical generated C++ bindings define parameter and result types.
Harmony must not maintain a second business method-name dispatcher, positional
argument decoder, or handwritten host schema.

## Binding forms

Two existing generated forms are supported:

- `@ExportProxy` hosts use concrete C++ implementations of the generated
  interface. BLE, permissions, Wi-Fi, NFC and AppUI use this form.
- Function-bearing `@ExportModel` hosts use the generated model's typed callback
  fields and `CppMarshaller`. Navigation, Storage and TokenStore retain this
  existing cross-platform contract. Do not change their annotations just to
  obtain a different C++ inheritance shape: that also changes Android/iOS
  generated APIs and their native constructors.

Both forms delegate signature checking and marshalling to canonical generated
bindings. A generated callback field is not a handwritten `ValueMap` export.
Synchronous storage and token methods remain synchronous; navigation retains its
existing callbacks and UI-queue ordering. Asynchronous capabilities keep their
Promise/Future contract.

## Platform implementation

BLE, permissions, Wi-Fi and NFC use the generated `PlatformServiceAdapters`.
The private N-API transport resolves the generated descriptor's method name on
the owning ArkTS service and calls that function with its receiver. This lookup
is part of the common binding mechanism. It does not require ArkTS business code
to interpret an incoming `{method, arguments}` message.

AppUI implements the generated `AppUIHost`. Native dialogs and pickers stay in
the C++ presenter; feedback and media call explicit ArkTS SDK methods. Native
presentation-kind and result-kind selection is internal UI behavior, not public
API dispatch. Presentation serialization, cancellation and owner lifetimes are
preserved independently of method binding.

Storage remains a per-runtime SQLite host. TokenStore retains the existing
secure native asset store. A binding refactor must preserve token buffer cleanup,
weak-owner errors, shutdown behavior and synchronous startup authentication.

## Boundaries

- HTTP already implements the framework's typed `HTTPRequestManager`; HTTP
  verbs are protocol data, not native API method names.
- `DeviceBridge` and `ApplicationBridge` are framework compatibility modules.
  Their module export registration is not a business host schema.
- Vision has a shared typed declaration but is not installed by the current
  Harmony runtime. This refactor does not add a native Vision engine.
- The unused ArkTS AppUI JSON-envelope prototype was removed. Production
  presentation uses `HarmonyAppUIHost` and `HarmonyNativeAppUIPresenter`.

## Verification

Test generated marshalling and invocation, not only source text:

1. Check generated adapter freshness and shared TypeScript contract tests.
2. Invoke migrated hosts through the real generated C++ bindings, including
   synchronous results, invalid arguments, native errors and expired owners.
3. Exercise navigation's detached data, callbacks and UI scheduling, and AppUI's
   Promise settlement, cancellation and late completion behavior.
4. Compile affected production sources against the real OHOS SDK for both ABIs.

Host/native tests and SDK compilation do not constitute HAP, Hermes-on-OHOS or
device validation. Record those separately when performed.

### Validation record — 2026-11-03

- Shared adapters/services, typed routing and AppUI Promise contracts: 39 tests
  passed, including real cross-platform contract generation.
- Storage/TokenStore and typed unsupported capabilities: 18 ASAN/UBSAN tests
  passed; SDK26 x86_64 and arm64-v8a compilation and strict linking passed.
  Receipt: `/tmp/harmony-typed-business-proof/proof.json`.
- Navigation: all ten generated callbacks exercised with real generated models
  and marshalling. SDK compilation passed for both architectures with both
  legacy and fork backends. Receipts:
  `/tmp/navigation-typed-binding-20261103-r3/receipt.json` and
  `/tmp/navigation-typed-sdk-final/receipt.json`.
- Navigation caller lifecycle: real Valdi/JSC wrappers and DispatchQueue
  characterization passed under sanitizers. Child-lineage, retirement-gate and
  global-null-caller negative controls each detected their intended regression.
  Receipt: `/tmp/navigation-typed-caller-final-r3/receipt.json`. The fixture now
  checks the generated callback wrapper rather than assuming the delivery owner
  holds a bare JS function. Rendering and production scheduler collaborators
  remain test boundaries.
- AppUI: 28 service tests, 38 combined service/native tests and 13
  feedback/compatibility tests passed (these suites overlap, not an aggregate
  count). SDK object compilation, native presentation, canonical Promise/model
  regressions and the unsupported-behavior negative control passed. Receipt:
  `/tmp/appui-typed-dispatch-20261103-r7/receipt.json`.
- Existing system-service adapters passed two-ABI SDK strict linking and real
  Valdi/JSC plus N-API boundary regressions. Receipt:
  `/tmp/valdi-typed-api-platform-20261103/proof.json`.

Intermittent external compiler processes interrupted serial probes. Navigation
resumed only recorded objects after exact command, dependency and output-hash
checks. AppUI reused 82 verified objects from its interrupted run; its additional
include inventory was captured after that interruption, not before the original
compilation. Original receipts were retained.

The older `native-route-probe --host --only navigator` fixture has preexisting
sheet-field/entry-signature incompatibilities; it is not claimed as passing.
The generated-binding and real-JSC caller tests above provide the migration
checks. No HAP, OHOS/Hermes execution or device validation was performed.
