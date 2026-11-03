# Native first-login prerequisites

`HarmonyBusinessModules::create()` creates one **app-owned** capability owner.
Retain its `shared_ptr` in the same native host that owns the Runtime.

Current production wiring (`host/HarmonyRuntimeHost.cpp`) uses this owner for
TokenStore only. Business startup requires `HarmonySystemServiceHosts` and
registers that owner's BLE factory and permission host. The unsupported BLE and
permission entries here remain callable compatibility/QA APIs; they are not an
automatic production fallback. They now implement the same canonical generated
interfaces as the system adapters, with no new dependency on platform sources.

## Contracts inspected

- `app_pages/src/app.ts`: `startApp(debug, navigation, tokens)` calls
  `initializeBluetooth(permissions)`, theme installation, auth installation,
  ClientSQL initialization, API retention, and navigation installation. Its
  returned JSON selects `login` when synchronous `tokens.has()` is false.
- `bluetooth/src/Bluetooth.d.ts`: module **`bluetooth/src/Bluetooth`** exports
  `getHost()`. `BleHost.ts::bleHost()` obtains it, calls `setEvents(bleEvents)`,
  then caches it. No radio operation or permission prompt occurs at startup.
- `auth.ts`: `TokenStore` is an injected model with synchronous `has`, `read`,
  `write`, `clear`; it is not an exported native module. `signIn()` writes before
  changing cached auth or navigating; `signOut()` clears before doing either.
- `permissions/PermissionHost.ts`: the existing
  `installPermissionHost(host, androidSdk)` installs a proxy. Harmony passes 0.
  `permissions/index.ts` only calls Android permission operations on Android;
  BLE's non-Android permission fast path still reaches the native radio method,
  which must reject on this port.
- Android/iOS Bluetooth factories keep one native implementation; their
  `setEvents` replaces the app event sink. Their retained app startup scopes,
  injected TokenStore models, and root selection are the ownership reference.
- `harmony/PORTING_PLAN.md`, the native host README, and business-build README
  establish existing ClientSQL registration/disk cache and parent integration.

## BLE and permissions

For a deliberately unsupported compatibility/QA runtime, register
`business->bluetoothFactory()` before importing Bluetooth and inject
`business->permissionHostValue()`. Normal product startup uses the system-service
owner instead. Keep either factory scoped to its application Runtime.

`UnsupportedBleHost` implements all 29 concrete methods of generated `BleHost`;
`UnsupportedPermissionHost` implements the three generated `PermissionHost`
methods. `CppMarshaller` creates their persistent typed proxy values. There is
no handcrafted class schema or method-name dispatch. Generated signatures type
all arguments, event functions, and Promise result models. Invalid inputs fail
unmarshalling synchronously before an unsupported operation is entered.

All 28 BLE operations return rejected typed `Future<T>` values with
`E_BLE_SYSTEM_NOT_SUPPORTED`, or `E_BLE_NOT_INITIALIZED` after shutdown/owner
release. Permission operations return `E_PERMISSION_SYSTEM_NOT_SUPPORTED`, or
`E_BUSINESS_HOST_CLOSED` after shutdown/owner release. Nothing fabricates a grant,
opened settings, radio state or successful stop/close.

`setEvents(BleHostEvents)` snapshots the generated model's ten callbacks.
Unmarshalling validates all required callbacks before replacing the sink;
retired callbacks are released outside the mutex to allow reentrant teardown.
The module's synchronous `getHost` is a marshalled typed C++ function. It returns
the same generated interface instance across factory loads. Host methods and
factory callbacks retain only weak owner references.

TokenStore and StorageHost are the canonical generated ExportModel classes,
with explicitly assigned typed callback fields. Their synchronous contracts and
Android/iOS declarations are unchanged. C++ exceptions are converted to
`Valdi::Exception` because the generated noexcept trampoline catches that type.
Native reflection of interface values uses
`value.getProxyObject()->getTypedObject()->getPropertyForName(name)`; ExportModel
values use `value.getTypedObject()->getPropertyForName(name)`.

Keep `disableValueMarshaller=false` so the generated Promise return signatures
select the JS Promise bridge. Native tests check schema and settlement; they do
not establish JavaScript engine execution.

## Secure synchronous TokenStore

`AssetTokenStore` uses the installed API26 NDK's real
`asset/asset_api.h` / `asset_type.h`, linked with **`asset_ndk.z`**. These APIs
are available since API11 and are synchronous. No ArkTS shell, async warmup,
readiness cache, software key file, or plaintext fallback is needed.

The OS AssetStore owns the credential. Alias:
`io.valdiroutes.app.session.token.v1`, scoped by the OS to the calling app/user.
Writes use one `OH_Asset_Add` with `ASSET_CONFLICT_OVERWRITE`,
`ASSET_ACCESSIBILITY_DEVICE_FIRST_UNLOCKED`, `ASSET_AUTH_TYPE_NONE`, and
`ASSET_SYNC_TYPE_NEVER`. `ASSET_TAG_IS_PERSISTENT` is omitted: that tag controls
retention **across uninstall**, not ordinary cold-start durability, and setting
it can require `ohos.permission.STORE_PERSISTENT_DATA`. This implementation does
not request that permission or retain credentials through uninstall.

`has()` queries attributes only, with alias and a one-result limit; it does not
request secret bytes. `read()` returns `""` only for `ASSET_NOT_FOUND`.
`clear()` treats not-found as success. Writes return only after the synchronous
service call succeeds. SDK failures become `E_TOKEN_STORE:<operation> failed
(AssetStore status <number>)` native exceptions, so auth never navigates on a
failed write or clear. Locked, corrupt, unavailable or denied storage is not
silently interpreted as an absent token and is not deleted.

The bounded payload is **1..1024 UTF-8 bytes**; empty/ASCII-whitespace-only and
oversized tokens fail before contacting the SDK. The shared TS validator still
owns the normal `\S` input rule. Larger credentials need a separate approved
encrypted-blob/HUKS design; they are not truncated. No token is cached by the
C++ owner. Returned SDK secret buffers are zeroed before release; the transient
native read string is zeroed by an RAII guard after constructing StringBox,
including on an allocation exception. JS/Valdi
strings necessarily retain their own ordinary in-memory copies.

App-scoped SDK serialization covers multiple native owners using the same alias.
All **Value/JS-facing calls and shutdown must run on the Valdi JS queue**, as in
the existing host. The native AssetStore methods may independently run on other
threads. There is no UI-thread sync hop or JavaScript callback under the storage
mutex.

## Exact parent build and bootstrap handoff

Add these two sources to the parent's existing `valdi_harmony` target:

```cmake
target_sources(valdi_harmony PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}/business/AssetTokenStore.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/business/HarmonyBusinessModules.cpp")
target_link_libraries(valdi_harmony PRIVATE asset_ndk.z)
```

Register BLE as above after `createRuntime()` and before importing
`app_pages/src/app`. Preserve the existing real ClientSQL factory and disk cache;
this directory registers no SQL replacement.

The current host installs `__valdiRoutesNavigationHost` before importing the
smoke entry, so `defineRoutes()` can publish the default `$tabs` root during
imports. For business startup, **omit that early installation**. Pass the
navigation Value through a private bootstrap payload instead. `startApp()`
installs the existing NavigationHost only after its route imports have run;
apply its returned declaration once afterwards.

An exact minimal parent-owned entry wrapper using the **existing** APIs is:

```ts
import { startApp } from 'app_pages/src/app';
import { installPermissionHost } from 'app_pages/src/permissions/PermissionHost';

let started = false;
export function start(): void {
  if (started) throw new Error('Harmony business startup already attempted');
  started = true; // A partial failure must not re-run app initialization.
  const boot = (globalThis as any).__harmonyBusinessBootstrap;
  installPermissionHost(boot.permissions, 0);
  const json = startApp(boot.debug, boot.navigation, boot.tokens);
  const declaration = JSON.parse(json);
  if (!declaration.routes?.[declaration.root]) throw new Error('invalid startup root');
  boot.navigation.updateRoutes(json);
}
```

Compile that wrapper as `harmony_business/src/app` using the parent's HBC module
pipeline. It is entry glue only, not another business API. Prepare its private
payload using the actual native Values:

```cpp
Valdi::Value boot;
boot.setMapValue("debug", Valdi::Value(debug)); // Native host build type.
boot.setMapValue("navigation", _navigator->makeNavigationHost());
boot.setMapValue("tokens", _business->tokenStoreValue());
boot.setMapValue("permissions", _business->permissionHostValue());
auto* js = _runtime->getJavaScriptRuntime();
js->setValueToGlobalObject(STRING_LITERAL("__harmonyBusinessBootstrap"), boot);
js->callModuleFunction(STRING_LITERAL("harmony_business/src/app"),
                       STRING_LITERAL("start"), nullptr);
```

The two JS APIs enqueue on the same task scheduler; payload installation precedes
evaluation. The pin's `callModuleFunction()` runs under the Runtime's retained
global context (`_globalContext->retainDisposables()`), not a routed page context.
Keep that Runtime and `_business` alive for the app. A successful mount handle
does not imply bootstrap success: consume Valdi's existing error logger and
confirm the native route snapshot has the auth-selected root.

On teardown, stop navigation/native admission first, then on the JS queue call
`_business->shutdown()` alongside the existing bridge observer cleanup, before
full runtime teardown. It is idempotent. It drops all BLE JS event references,
rejects stale native calls, and does not erase the durable token. Release
`_business` after runtime teardown. Callback retirement can reenter registration,
getHost or shutdown safely; a closed owner never reopens. Parent must call this
for partial-startup failure as well.

## Remaining startup/product requirements

- Package the actual app entry and transitive modules/resources, particularly
  `bluetooth`, `client_sql`, `app_pages/res`, and compiler-transformed route
  component paths. The existing fixture is not the complete app bundle.
- Retain Device/Application bridges, theme/dark-mode support and ClientSQL
  initialization, persistent disk root, and proper root publication above.
- First login **render** needs the native text fields and shared styles. The
  Login button additionally calls `AppUIHost.showLoading`, `hideLoading`, and
  `showToast`; the parent must implement/install that existing AppUI host before
  claiming an end-to-end sign-in. This task supplies secure token storage, not
  those UI services.
- StorageHost, Wi-Fi, Vision, calculator/Cpp module factories and native picker
  pages remain separate capabilities for pages/actions that use them. This task
  does not install successful placeholders for them. The route compiler's
  `valdiPage` path transform must preserve lazy page loading.
- Verify actual OS AssetStore availability, first-unlock policy, write/relaunch/
  read/clear, reinstall behavior and error propagation on the intended device.
  System-service runtime availability and encrypted on-device persistence have
  not been exercised here. No HAP or device claim follows from the native proof.

## Focused verification

Prerequisites: prepared pinned runtime sources and both existing runtime proof
builds, plus the existing `harmony/business-build/.artifacts/host` native test
closure. This runner reads their real compilation databases and libraries; it
does not rebuild or modify them.

```sh
python3 harmony/entry/src/main/cpp/business/tests/verify.py \
  --sanitize --output /tmp/valdi-harmony-business-proof
```

The runner checks the actual TS BLE method/event contract, compiles business,
storage, and the real generated app_pages/bluetooth translation units with the
SDK26 compiler for `x86_64` and `arm64-v8a`, and strictly links each shared proof
against actual Valdi, SQLite and `libasset_ndk.z.so` with `--no-undefined`.

The host suite links the real generated code, pinned Valdi and SQLite. It covers
stable app identity, valid typed inputs for every unsupported method, malformed
input rejection, event snapshot/validation, reentrant replacement/teardown,
stale-owner rejection, synchronous token round trips, SDK failures, bounds,
secret-buffer cleanup and concurrent callers. Storage-specific tests cover
canonical model round trips, UTF-8/NUL keys, SQLite reopen persistence,
remove/clear, failed writes returning false without overwriting existing data,
and retained callbacks after shutdown/owner release. ASAN/UBSAN instrument the
production units and tests; reused runtime/SQLite archives are not rebuilt.

These are generated schema and native execution checks, not JavaScript engine
execution or proof that Hermes `await` rejects. The old opaque-host negative
control was removed because production now uses canonical generated proxies
rather than the replaced handcrafted schema conversion.

Only the OS AssetStore C service boundary is replaced on macOS. Its test double
retains bytes in memory to validate requests and failure behavior; it is never
linked into production. This is **not** a test of OS encryption, persistence or
hardware. `/tmp/valdi-harmony-business-proof/proof.json` records source hashes,
ABI artifact hashes, exact native link commands, and ELF evidence.

## Parent real-Hermes consumer QA fixture

`tests/promise-consumer.js` is exact QA entry glue for the parent. It has not
been run against Hermes by this scoped task. The existing macOS test archive
does not include the JavaScript/Hermes runtime closure, and the staged OHOS
libraries cannot execute on macOS. `proof.json` records
`jsConsumerExecuted: false`.

Use a dedicated QA instance of the actual business Runtime, with its existing
Hermes task scheduler, production factory registration, normal value marshaller,
and normal `startApp()`/permission bootstrap. This isolates the fixture's event
registration and deliberate business-owner shutdown from the product session.
Do not replace the factory, promises, permission host, or JS module loader with
test implementations.

1. In the parent's temporary QA staging area, include this file unchanged as
   `harmony_business/src/promise-consumer.js` through the same existing
   CommonJS/HBC v99 packaging path. Include the actual `bluetooth` modules,
   particularly `src/extension`, `src/wechat`, `src/native`, and `src/BleHost`.
   Do not add it to the product startup wrapper or change shared TS.
2. Retain the real `HarmonyBusinessModules` owner on the QA host, register
   `bluetoothFactory()`, and install `permissionHostValue()` as
   `__harmonyBusinessBootstrap.permissions` in this isolated unsupported QA runtime. Complete
   normal `startApp()` first so its existing BluetoothPermissions service is
   configured. This fixture does not read or write tokens.
3. Install `__harmonyBusinessPromiseQAReport` using
   `JavaScriptRuntime::setValueToGlobalObject`. Its value is a synchronous native
   `ValueFunctionWithCallable` accepting one JSON string
   (`context.getParameterAsString(0)`) and recording it for the external QA
   driver. Return `Value::undefined()`. Retain that callback in the Runtime's
   app scope. Do not block the JS queue waiting for it.
4. Call
   `js->callModuleFunction(STRING_LITERAL("harmony_business/src/promise-consumer"),
   STRING_LITERAL("live"), nullptr)`.
   Wait externally for exactly
   `{"phase":"live","ok":true,"realPromisesRejected":31,"wechatChecks":3}`.
   The fixture requires `instanceof Promise`, a callable `then`, and actual
   `await` rejection for all 28 radio and three permission methods. Synchronous
   throws, opaque objects and fulfillment fail. It then exercises the actual
   public `bluetoothApi()` twice: both opens must reject with error 10009 /
   `E_BLE_SYSTEM_NOT_SUPPORTED`; state must still reject with 10000 /
   `E_BLE_NOT_INITIALIZED`. Thus the `wechat.ts` success branch cannot silently
   mark the adapter opened. It also checks synchronous getHost/setEvents.
5. Once that callback has completed, enqueue `business->shutdown()` on
   `js->getJsDispatchQueue()->async(...)`, keeping the Runtime alive. Enqueue the
   module's `closed` function after it on that queue. Wait externally for
   `{"phase":"closed","ok":true,"realPromisesRejected":31,"wechatChecks":0}`.
   All retained radio calls must reject `E_BLE_NOT_INITIALIZED`, all retained
   permission calls `E_BUSINESS_HOST_CLOSED`. Retained getHost/setEvents must
   throw synchronously with `E_BUSINESS_HOST_CLOSED`.
6. Release the last native business owner on the JS queue, leaving its Runtime,
   the report callback, native module factory, and fixture's captured JS hosts
   alive. Check the business `weak_ptr` is expired; avoid capturing a strong
   owner in a queued closure. Then call `released` and require
   `{"phase":"released","ok":true,"realPromisesRejected":31,"wechatChecks":0}`.
   This runs the same stale-call checks against the released-owner branches.
7. Any `ok:false`, missing completion (use an external 10-second per-phase
   deadline), exception log, non-Promise, fulfillment, wrong code, or unexpected
   BLE event fails QA. Save the three reports and the actual Hermes version,
   loaded artifact hashes, platform/ABI, and native ownership/phase evidence.
   Then tear down this QA Runtime through the existing lifecycle.

This scoped implementation ran neither a device nor a full Hvigor build. The
parent's eventual real-Hermes results must be recorded separately from the
native proof above.
