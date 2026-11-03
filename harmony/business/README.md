# Real business modules for the Harmony native host

This directory owns the bootstrap, documentation and source/archive contract
tests. `tools/valdi-rolldown/harmony-business.ts` is an independent build entry
point. It compiles actual `valdi/modules` sources, including `app_pages`,
`bluetooth` and `calculator`, rather than the smoke pages. The existing
`app_pages/src/app.ts` and its `startApp` implementation are unchanged.

Run from the repository root after the existing Harmony upstream preparation
and local Node dependency installation:

```sh
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs \
  tools/valdi-rolldown/harmony-business.ts
node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs \
  --test harmony/business/contracts.test.ts
```

For the builder's own strict TypeScript check:

```sh
cd tools/valdi-rolldown
node node_modules/typescript/bin/tsc --noEmit --strict --target esnext \
  --module esnext --moduleResolution bundler --esModuleInterop \
  --skipLibCheck --allowJs --types node harmony-business.ts
```

The builder accepts `--source`, `--out`, `--stage`, `--bindings` and
`--git-source`, each followed by a directory. Defaults:

* Source: `.tools/harmony/upstream`, the prepared pin plus the existing
  `scripts/harmony/apply-platform.mjs` overlay.
* Local git object source: `VALDI_FORK_SOURCE` or sibling `../Valdi-node-only`.
  This is read locally; no fetch or remote operation runs.
* Rawfile output: `.tools/harmony/business-rawfile`.
* Copied business sources, generated resource declarations and tsconfigs:
  `.tools/harmony/business-stage`.
* Generated C++ bindings: `.tools/harmony/business-bindings`.

Each output directory is dedicated to this builder and is recreated on a build.
Output/source overlap and the active smoke tree are rejected before deletion.
Only a completed build writes `build-info.json`; a failed build can leave partial
archives without that success marker. Changing the output paths does not
activate the business build in the host.

The builder verifies pinned TS/config inputs against
`valdi/MODULE.bazel`'s immutable commit
`15feb6530ceecb971f4c8519ea8ab77474b959db`. For patched files it replays the
existing Harmony overlay on pristine inputs in a temporary directory and checks
byte equality. It never patches the shared upstream. The existing runtime
compiler's type-only `ElementFrame` re-export is confined to its temporary
compilation directory.

`build-info.json` records source hashes, pin/overlay provenance, zero type
diagnostics for each successful module, generated C++ paths, literal require
dependencies, archive hashes and HBC entry counts. Runtime modules use
`compileRuntimeModule`; app modules use `valdiTs`, `buildModule`, resource
generation, `generateNativeCode`/`nativeSourceFiles`, `precompile` and `pack`.
Every archived `.js` entry is checked for the Valdi precompiled module magic,
Hermes bytecode magic and HBC version 99 after unpacking.

## Rawfile and native integration contract

The output root has this layout:

```text
business-rawfile/
  modules/
    valdi_api_version                  # 0, matching the pinned runtime
    coreutils.valdimodule              # and .map.json for each module
    jasmine.valdimodule
    source_map.valdimodule
    valdi_tsx.valdimodule
    valdi_core.valdimodule
    client_sql.valdimodule
    app_pages.valdimodule
    bluetooth.valdimodule
    calculator.valdimodule
    harmony_business.valdimodule
  assets/app_pages/tab_*.png            # all six real tab variants
  assets/calculator/calculator.png
  tab-icons/tab_*.png
  valdi/build-info.json                 # host profile/bootstrap metadata
  build-info.json                       # full source/archive build proof
```

`HarmonyResourceLoader` reads archives from `modules/` and image bytes from
`assets/<module>/<logical-name>.png`. The real app and calculator asset catalogs
are inside their archives. The three tab pairs are also copied to `tab-icons/`;
the route transformer includes their actual PNG data in the declaration.
Wi-Fi and NFC live under `app_pages/src/wifi` and `app_pages/src/nfc`; they are
not independent module IDs.

The parent must select/stage this complete rawfile root in its own packaging
work, register the real business factories and install actual native objects
before calling the new entry. This builder does not change the active smoke
resources or any host/ArkTS/CMake source.

The exported entry is:

```ts
// module: harmony_business/src/app
export function start(): string;
```

The native host installs one private payload before evaluating business code.
`debug` is the host's application build flag, independent of the runtime build:

```ts
globalThis.__harmonyBusinessBootstrap = {
  debug: boolean,
  navigation: NavigationHost,
  tokens: TokenStore,
  permissions: PermissionHost,
  appUI: AppUIHost,
  wifi: WifiHost,
  nfc: NfcHost,
};
```

Do not preinstall `__valdiRoutesNavigationHost`. The bootstrap installs
`__valdiRoutesTokenStore = boot.tokens`,
`__valdiRoutesAppUIHost = boot.appUI` and
`__valdiRoutesPermissionHost = {host: boot.permissions, androidSdk: 0}` before
requiring the real app. It calls the shared `installWifiHost` and `installNfcHost`
with `boot.wifi` and `boot.nfc` before business initialization, registering the
existing event interfaces once. `permissions` is the raw PermissionHost, not its
installer wrapper. All AppUI/PermissionHost members must be callable, including
unsupported operations that should surface their native error when invoked.

Separately, install `__valdiRoutesStorageHost` directly before the private
payload/start call. Storage is not a field in that payload and does not use an
`AppStorage` native module. The existing `storage.ts.installStorageHost` only
assigns this global, so direct native installation has the same contract:

```ts
interface StorageHost {
  get(key: string): string;             // JSON text; '' when absent
  set(key: string, json: string): boolean;
  remove(key: string): void;
  clear(): void;
}
```

These four native ValueFunction callbacks run synchronously on the JS thread;
they return primitive values or void, never a Promise. Business `storage.ts`
validates keys and serializes/deserializes JSON. A false result from `set`
becomes a synchronous `setStorageSync:fail` error. This ordinary JSON store
must remain separate from secure TokenStore.

The host-owned Harmony implementation uses the existing bundled SQLite at
`filesDir/valdi/app-storage.sqlite3`. Its implementation and persistence QA
belong to the host work. Install the global before opening Home: actual
`HomePage.onCreate` immediately reads `api.getStorageSync('demo.homeOpens')`,
increments it and calls `api.setStorageSync`. Although `startApp` does not
access storage itself, signed-in startup can open Home as soon as its route
declaration reaches native. Omitting the global therefore fails at Home's
first storage access.

The host reads `rawfile/valdi/build-info.json`. Its stable selection fields are:

```json
{
  "schemaVersion": 1,
  "profile": "business",
  "bootstrap": {
    "module": "harmony_business/src/app",
    "export": "start",
    "arguments": [],
    "payloadGlobal": "__harmonyBusinessBootstrap"
  }
}
```

The compact marker also has the pin, engine/HBC/platform, modules, injection
names and publication details. Full provenance and archive/source proof stay
in the root `build-info.json` so native profile selection reads a small file.
A host can keep its existing smoke default when this
profile is absent; it should select the exact known business module/export
for the `business` profile and must not evaluate untrusted arbitrary paths.

The exact `NavigationHost` is
`valdi/modules/app_pages/src/NavigationHost.ts`: `push`, `pushForResult`,
`replace`, `back`, `popToRoot`, `reset`, `switchTab`, `setStatusBarStyle`,
`currentPages`, `updateRoutes`. Typed dictionary/model and callback signatures follow that
source. The bootstrap validates that every member is callable before importing
the business app.

`TokenStore` is `valdi/modules/app_pages/src/auth.ts`:

```ts
interface TokenStore {
  has(): boolean;
  read(): string;              // '' when absent
  write(token: string): void;
  clear(): void;
}
```

These methods must synchronously return their real native result on the JS
thread. `has()` is the startup decision; returning a Promise, using an
asynchronous ArkTS reply, or returning `undefined` cannot implement this
contract. TokenStore must be backed by secure persistent native storage; no
in-memory or plaintext fallback is included here.

The pinned `JavaScriptRuntime` integration is:

```cpp
// Use actual implementations owned by the parent/native-business layer.
js->setValueToGlobalObject(STRING_LITERAL("__valdiRoutesStorageHost"), storageHostValue);
Valdi::Value boot;
boot.setMapValue("debug", Valdi::Value(applicationDebug));
boot.setMapValue("navigation", navigator->makeNavigationHost());
boot.setMapValue("tokens", tokenStoreValue);
boot.setMapValue("permissions", permissionHostValue);
boot.setMapValue("appUI", appUIHostValue);
js->setValueToGlobalObject(STRING_LITERAL("__harmonyBusinessBootstrap"), boot);
js->callModuleFunction(STRING_LITERAL("harmony_business/src/app"),
                       STRING_LITERAL("start"), nullptr);
```

`tokenStoreValue` above is a `Valdi::Value` map whose callable members wrap
`Valdi::ValueFunctionWithCallable`; each callable receives
`const Valdi::ValueFunctionCallContext&` and returns `Valdi::Value`. For example,
`has` returns `Value(bool)`, `read` returns a string Value, `write` reads parameter
0 with `getParameterAsString(0)`, and `clear` has no parameters. Surface native
failures through `context.getExceptionTracker()` and keep implementations alive
for the runtime lifetime. Do not silently convert a storage failure into a
signed-out result.

The pinned implementations of `setValueToGlobalObject` and
`callModuleFunction` both enqueue on the JS scheduler. Enqueue installation
before startup. `callModuleFunction` returns `void` and discards the JS return,
so the bootstrap explicitly calls the real `navigation.updateRoutes(declaration)`.
It does not rely on C++ receiving `start()`'s return. The native callback can
queue the supplied typed `RouteDeclaration` onto the UI thread.

The bootstrap has only type imports at module evaluation. Inside `start` it:

1. Validates the private payload and all real native objects.
2. Installs TokenStore/AppUI/PermissionHost globals and withholds
   `__valdiRoutesNavigationHost`.
3. Requires actual `app_pages/src/app` and calls
   `startApp(debug, navigation, tokens)` with the real supplied host.
4. Installs the error handler first, then initializes BLE, theme, auth,
   ClientSQL, API and navigation through real `startApp`. Valdi's lazy module
   proxies can evaluate `routes` only after
   navigation installation, when `routes.toHost(rootRoute())` first reads its
   exports. `defineRoutes` is pure and cannot open a default Home before the
   auth decision. Database initialization remains synchronous before Home opens.
5. After `startApp` returns, installs the original supplied navigation object,
   passes exactly the returned `RouteDeclaration` object to `updateRoutes` once,
   and saves that same object as `__valdiRoutesDeclaration`.
6. Returns the declaration to a direct JS caller. Subsequent explicit
   `routes.publish()`/`publishRoutes(declaration)` updates use the real host
   normally. If startup throws, any prior navigation global is restored.

The authoritative initial declaration is the unmodified typed `startApp`
return. There is no publication-suppression facade or JSON route transport.
`RouteDeclaration.routes` is an array of `RouteEntry` values; params/results
are dictionaries, resolved options are `ResolvedNavigation`, and stack queries
return `StackPage[]`. The native payload and factory APIs
are unchanged. Call `start` once per runtime, before
opening any business pages or importing `app_pages/src/app`/`routes` elsewhere.
After success, duplicate `start()` calls return the saved original object without
initialization or publication. Reentry during startup and retry after a partial
startup failure throw; create a fresh runtime after failure because native/JS
initialization may already have side effects.
Do not pre-call a host installer whose module transitively imports the routes.
Install StorageHost directly, then the private payload, before startup. The native module import roots the bootstrap
through the runtime module container; its real `require` records the app
dependency. Avoid explicitly unloading the startup scope while the app lives.

## Native dependencies and remaining work

`package.json`'s actual enabled modules and their `module.json`/`BUILD.bazel`
inputs are recorded; no fake implementations replace native `.d.ts` modules.
Generated C++ bindings use the same project codegen, under
`business-bindings/valdi_modules/<module>/<module>.{hpp,cpp}`.

* **Required during startup:** Device/Application runtime bridge factories,
  the private payload with secure TokenStore, NavigationHost, AppUIHost and
  PermissionHost, the directly injected synchronous StorageHost before Home opens,
  `client_sql/src/ClientSQLNative.openDatabase`, and
  `bluetooth/src/Bluetooth.getHost().setEvents(...)`. The latter must return an
  app-lifetime BLE host. Its generated factory path is exactly
  `bluetooth/src/Bluetooth`, type
  `snap::valdi_modules::bluetooth::BluetoothModuleFactory`; `getHost()` returns
  `Valdi::Ref<BleHost>`. Native Promise behavior and all event/payload contracts
  remain the actual `bluetooth/src/BleHost.ts` declarations. ClientSQL opens the
  real generated app schema synchronously, version 1, with the `submission`
  table. Native secure TokenStore and BLE implementation are separate work.
* **Required by business pages/actions:** `__valdiRoutesAppUIHost`,
  `__valdiRoutesStorageHost`, `__valdiRoutesWifiHost`,
  `__valdiRoutesNfcHost`, `__valdiRoutesPermissionHost`,
  `__valdiRoutesVisionHost`; `calculator/src/Calculator.multiply`;
  `app_pages/src/cpp/Cpp` (`BUILD_INFO`, `sha256`, `stats`); and the native
  `picker` route. The exact global value shapes and installer functions live
  in the corresponding real source files. PermissionHost's global is the
  installer's `{host, androidSdk}` wrapper, not just its raw host. This build
  supplies declarations and JS, not these native implementations.
* **Platform policy still matters:** current NFC business code explicitly
  checks `Device.isAndroid()` and reports unsupported on Harmony. Current
  Wi-Fi permissions follow the non-Android path (including unavailable scan).
  Packaging those sources or installing a native factory does not change those
  policies. No platform spoofing or business policy changes occur here.
* **Backend login remains pending:** the current real LoginPage uses a delayed
  `demo.*` token and demo text. No backend URL, credentials or real login
  request is configured by this work. Auth root selection and token/router
  contract tests are not evidence that backend login works.

The tests execute actual transformed Rolldown business output with bundled npm
dependencies and real `app.startApp`, auth, routing, BLE and Wi-Fi/NFC JS. They
run the pinned upstream `ModuleLoader` with its actual lazy proxies and
`require(path, true)` behavior, plus eager CommonJS startup cases. A regression
observes real `installNavigation` to verify that lazy route evaluation occurs
after installation, that defining routes has no native side effect, and that
explicit live route updates still work with route JSON APIs disabled.
Only Device/debugger/ClientSQL/BLE/StorageHost native boundaries are supplied by test
adapters. They prove signed-out and signed-in root selection, one correct
initial publication, lazy page loading, synchronous token access, auth
sign-in/out routing, Home's synchronous storage API path, real asset bytes and native module identities. They also
unpack/check every compiled archive and compare staged source hashes. They do
not prove native linking, secure storage, SQLite storage persistence, Bluetooth hardware, UI rendering,
networking, backend authentication or on-device operation. No full Hvigor or
device run is part of this build.
