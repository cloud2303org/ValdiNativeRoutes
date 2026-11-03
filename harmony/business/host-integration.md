# Harmony business host integration

The native entry selects its bootstrap from packaged
`rawfile/valdi/build-info.json`. An absent marker preserves the existing smoke
entry. A present marker must parse successfully and identify one of:

```json
{"profile":"smoke","bootstrap":{"module":"harmony_smoke/src/app","export":"start"}}
```

```json
{"profile":"business","bootstrap":{"module":"harmony_business/src/app","export":"start","payloadGlobal":"__harmonyBusinessBootstrap"}}
```

Other module/export names, a conflicting profile, or a business payload name
other than `__harmonyBusinessBootstrap` fail mount. The loader bounds metadata
to 1 MiB. It reads only this canonical path, not historical metadata copies
at the rawfile root or inside `modules/`. The parent packaging script owns
selecting/staging the complete smoke or business resource tree.

## Startup

Smoke retains its original early NavigationHost installation and
`harmony_smoke/src/app.start()` call. It does not construct business, AppUI, or
StorageHost services.

Business constructs and retains one `HarmonyBusinessModules`, one
`HarmonyAppUIHost`, and one `HarmonyStorageHost` per native runtime owner. The
BLE factory is registered on that runtime before evaluating business JS.
Device/Application factories, real ClientSQL static registration and the
app-owned persistent `DiskCacheImpl` remain in the existing startup path.

Before calling `harmony_business/src/app.start()` with no arguments, the host
enqueues these globals on the same JS scheduler:

```ts
globalThis.__valdiRoutesStorageHost = /* actual native StorageHost */;
globalThis.__harmonyBusinessBootstrap = {
  debug: /* app target's CMake Debug configuration, independent of runtime NDEBUG */,
  navigation: /* actual navigator.makeNavigationHost() */,
  tokens: /* actual business.tokenStoreValue() */,
  permissions: /* actual business.permissionHostValue() */,
  appUI: /* actual appUI.hostValue() */
};
```

The host does not install `__valdiRoutesNavigationHost` in business mode.
The separate bootstrap validates its dependencies, installs the permission
wrapper `{host: permissions, androidSdk: 0}`, AppUI and TokenStore, then
requires the real `app_pages/src/app`. Its synchronous `startApp` selects the
auth root using secure token access after initializing the database and services.
Only its returned typed `RouteDeclaration` is forwarded, unchanged and once,
to `navigation.updateRoutes`. `defineRoutes` has no publication side effects,
including under the pinned lazy ModuleLoader. See [README.md](README.md) for
the bootstrap-owned guard and exact JS startup contract.

No native code assumes that `permissionHostValue()` or the BLE host is a
ValueMap. Typed native objects pass through unchanged. Their Promise
marshalling remains owned by the business implementation.

## AppUI shell

The existing seven mount arguments are retained. The shell adds an optional
eighth argument, `(requestJson: string) => void`. Business mode requires it;
legacy smoke callers can continue using seven arguments.

The native AppUI object implements `showLoading`, `hideLoading`, `showToast`
and `hideToast` using the existing real `AppUIHost.ts` callback contract.
These methods return `undefined`, not a `Value(ResolvablePromise)`. Requests
cross to the owning ArkTS UI dispatcher as:

```ts
interface AppUIRequest {
  id: number; // positive safe integer, scoped to this host
  method: 'showLoading' | 'hideLoading' | 'showToast' | 'hideToast';
  request?: { title: string; mask: boolean; icon?: string; duration?: number };
}
```

`Index.ets` displays actual ArkUI loading/toast overlays over the whole app,
including the tab bar. It renders the requested title, loading indicator or
success/error glyph, and applies mask hit testing. A toast appears above a
loading overlay. Replacement and hide clear the prior toast timer. Duration
is in milliseconds; a single timer is bounded by the platform timer range
of 2,147,483,647 ms.

After applying shell state, the next frame callback invokes
`completeAppUI(handle, requestId, error)`, with `''` for success. This
acknowledges state application at the next frame start, not measured display
presentation. Native delivers the original `done(error)` on the Valdi JS
queue, exactly once; duplicate/late request replies are ignored. Throwing
ArkTS observers produce an error callback and their NAPI exception is cleared.
Native pending callbacks are bounded to 64 requests per host. Shows while the
page is backgrounded fail explicitly.

Each pending request owns a real `Valdi::RetainedContext` taken from
`Context::currentRoot()` on JS, alongside its `ValueFunction`. This retains the
owner's disposables, including the stashed JS function, after a navigation
reset/pop destroys the page. A plain strong Context or ValueFunction reference
does not provide that guarantee. The request is removed before result delivery;
its callback and then its disposable pin are released on JS after delivery.

Frame callbacks and timers check both host identity and page epoch before
acting. Destruction clears shell state/timers and closes native UI admission
before the runtime teardown fence. Pending callbacks receive
`E_APP_UI_CLOSED` on JS while its context still exists. No JS-backed callback
is moved to or released by a UI dispatch task.

Other AppUI methods are callable but raise `E_APP_UI_UNSUPPORTED`. This
includes modal, action sheet, picker, date picker, bottom sheet, image
preview, scanner and attachments. In particular, Home's sign-out confirmation
currently requires an unsupported modal; first login/token persistence does
not establish working sign-out UI.

## Persistent JSON storage

The real dependency is `app_pages/src/storage.ts`'s
`__valdiRoutesStorageHost`; there is no separate AppStorage native module on
this path. `get/set/remove/clear` synchronously use the already bundled
SQLite implementation. No additional JS module or alternate business API is
introduced.

The dedicated database is `<Ability.filesDir>/valdi/app-storage.sqlite3`.
Values are stored verbatim as JSON text under SQL-bound text keys.
`get` returns `''` when absent; `set` returns true only after its SQLite
statement commits, and false on statement write failure. Open, read, bind,
prepare, remove and clear failures become native `E_STORAGE` exceptions.
The database uses full SQLite synchronization and a 5-second busy timeout;
distinct native runtimes use separate connections to the same persistent
file. Every prepared statement is finalized before returning.

This is ordinary app-private storage for Home's `demo.homeOpens` counter and
the existing storage API, not credential storage. Secure tokens remain in
the business AssetTokenStore. ClientSQL's database and schema remain separate.
`clearStorageSync` deletes only this dedicated key/value table. Nothing
deletes persisted values during teardown.

## Teardown and build

UI teardown closes AppUI admission before navigation cleanup drains the UI
dispatcher, and queues AppUI cancellation on JS before navigation queues page
context disposal. The later JS fence repeats AppUI `shutdownOnJS()` safely,
then calls business `shutdown()`, storage `shutdownOnJS()`, and bridge observer
cleanup before `RuntimeManager::fullTeardown`. This also handles partial mount
failures. Native service owners are released on UI after runtime teardown;
late shell work cannot enqueue callbacks behind the fence.

Destruction first extracts the handle's host from the environment map and
counts its destroy job, before any unmount operation or callback drain. Nested
destruction of that handle reports the existing unknown/destroyed-handle error
without touching the claimed owner. The owning job starts its worker only
after unmount returns. NodeContent stays reserved until final UI release, and
the job keeps environment cleanup alive throughout this interval.

Unmount sets closing immediately and collects errors while completing the
remaining navigation cancellation, page retirement, event suspension and HTTP
shutdown phases. UI failures cannot prevent worker cleanup. The destroy Promise
rejects with collected failures after worker teardown and UI release finish.
The ArkTS shell catches synchronous destroy errors as well as Promise rejection,
and clears its handle only after native destruction accepts ownership. If both
libuv enqueue and fallback thread creation fail, native retains the host for
retry/environment cleanup and the shell retains its handle.

CMake includes the two existing business production sources and links
`asset_ndk.z`. It preserves whole-archive ClientSQL registration, including
the existing bundled SQLite dependency. App debug behavior uses
`VALDI_HARMONY_APPLICATION_DEBUG`, derived from the application target's
Debug configuration.

## Verification on November 2, 2026

Focused proof artifacts are in
`/tmp/valdi-harmony-host-integration-proof/`:

* `compile-host.py` / `objects.json`: six production translation units
  (`HarmonyBootstrap`, `HarmonyAppUIHost`, `HarmonyResourceLoader`,
  `HarmonyStorageHost`, `HarmonyRuntimeHost`, `NapiModule`) compile for both
  `x86_64` and `aarch64` using the installed SDK26 compiler and real
  pinned Valdi/generated headers, with `-Wall -Wextra -Werror`.
* `check-arkts.cjs`: the installed SDK's ArkTS parser, semantic checker and
  ArkTS 1.1 linter report zero errors for `Index.ets` against the real SDK
  declarations and native module `.d.ts`. There is one SDK warning, 28014,
  stating that NAPI module verification is not implemented by that checker.
* `check-contracts.py` / `host-contracts`: actual production bootstrap/storage
  code runs with real Valdi Value/ValueFunction code and real bundled SQLite
  under AddressSanitizer and UndefinedBehaviorSanitizer. Tests cover both
  profiles, eight invalid metadata cases, synchronous storage reads/writes,
  UTF-8 and bound arbitrary keys, multiple owners, reopening/persistence,
  remove/clear, malformed arguments, stale/closed owners, write rejection and
  open failure. Reused dependency archives are not rebuilt with sanitizers.
* `python3 harmony/entry/src/main/cpp/host/tests/run-host-lifecycle.py`:
  compiles the four lifecycle translation units (`HarmonyAppUIHost`,
  `HarmonyRuntimeHost`, `HarmonyNavigator`, `NapiModule`) for both ABIs with
  SDK26 and strict warnings. Runs the production ownership/error helpers and
  pending-AppUI request type under AddressSanitizer/UndefinedBehaviorSanitizer,
  using actual pinned Context, RetainedContext and DisposableGroup code. Covers
  nested duplicate destruction during a simulated dispatcher drain, continuation
  after cleanup faults, and result/cancellation delivery after a separate thread
  destroys the page Context. It checks that disposal is deferred through callback
  delivery and final release occurs on the delivering thread.

Re-run the proof scripts directly with Python/Node. They neither build a
HAP nor use a device. This proof does not execute AppUI through NAPI/ArkUI,
measure actual frame presentation, verify OS AssetStore persistence, or
validate login/backend traffic. The parent owns full package/link/device QA.
BLE/permission unsupported-operation Promise behavior is separately owned
by the business layer and needs its real-Hermes validation.
