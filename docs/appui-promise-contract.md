# AppUI typed Promise contract

`valdi/modules/app_ui/src/AppUIHost.ts` is the native capability boundary for Android and iOS.
`AppUIHost` uses the existing `@ExportProxy` generator path used by `BleHost` and `PermissionHost`. Its native names
are `VRAppUIHost` and `io.valdiroutes.app_ui.AppUIHost`. Request/reply models and `installAppUI` retain their names
and fields. This replaces the old `done(error, fallbackReply)` boundary; the public `api` methods retain their
arguments, results, validation and `ApiError` behavior.

## Exact host ABI

These are function properties on the exported TypeScript interface. No method accepts a completion callback.

```ts
showModal: (request: ModalRequest) => Promise<ModalReply>;
showActionSheet: (request: ActionSheetRequest) => Promise<PresentationReply>;
showPicker: (request: PickerRequest) => Promise<PresentationReply>;
showDatePicker: (request: DatePickerRequest) => Promise<PresentationReply>;
showBottomSheet: (request: BottomSheetRequest) => Promise<PresentationReply>;
previewImage: (request: ImagePreviewRequest) => Promise<PresentationReply>;
scanCode: () => Promise<ScanCodeReply>;
pickAttachments: (source: string, limit: number, mimeTypes: string[]) => Promise<AttachmentSelection>;
clearAttachmentCache: () => Promise<void>;
showToast: (request: ToastRequest) => Promise<void>;
hideToast: () => Promise<void>;
showLoading: (request: LoadingRequest) => Promise<void>;
hideLoading: () => Promise<void>;
```

`api.ts` directly awaits the installed host. Validation and default filling still happen in `schemas.ts` before
native invocation. Replies remain trusted. The host is installed on `globalThis`, so reloading its module does not
lose the app-owned native proxy.

## Settlement and public results

Native operations must settle once. Presentations resolve after closing, including their existing page-removal
behavior. Toast/loading and cache operations resolve when their native work finishes. A `Promise<void>` fulfills
with undefined and becomes the existing `{ errMsg: '<method>:ok' }` public result.

- Modal cancellation resolves its `ModalReply`, including `confirm: false`, `cancel: true` and the existing content
  behavior.
- Picker cancellation resolves publicly with `confirm: false`, `cancel: true`, `value: ''`, `index: -1`, regardless
  of a highlighted selection. Date picker cancellation clears `value`; bottom sheet cancellation retains its flags.
- Preview close, including page removal, fulfills and returns `previewImage:ok`.
- Action sheet cancellation resolves a native `PresentationReply`, which the public API converts into
  `showActionSheet:fail cancel`. Cancellation of the image-source action sheet becomes `chooseImage:fail cancel`.
- Scanner cancellation rejects with `cancel`, producing `scanCode:fail cancel`.
- Attachment cancellation resolves `{ canceled: true, assets: [] }`. The public API treats either `canceled: true`
  or an empty asset list as `chooseImage:fail cancel` / `chooseFile:fail cancel`.
- Attachment source selection is unchanged: album maps to `photos`, camera always requests one image, files map
  to `files`, and MIME types and count limits are validated before the host call.

Native failures reject; they do not resolve a fabricated cancel reply, empty scan reply, attachment selection or
void success. Removing a caller page must not drop completion of an operation or strand the shared native queue.
The native promise/resolver and pending operation must remain owned until settlement, independently of any
page-created JS callback. This migration does not move queue, navigation or presenter ownership into `api.ts`.

`ApiError` still formats `'<method>:fail ' + (cause instanceof Error ? cause.message : String(cause))`, sets
`name = 'ApiError'`, and exposes the same text through `message` and `errMsg`. Any rejection remains a failure,
including `Error('')`, `''`, `undefined` or `null`. For example `Error('')` yields `hideToast:fail ` with a trailing
space; `undefined` rejection yields `hideToast:fail undefined`. A native adapter can normalize its own empty
failure message to its existing nonempty fallback before rejection. The shared API does not add a new fallback
or interpret empty rejection text as success. Synchronous native invocation failures are wrapped the same way.

## Native implementation requirements

Android implements generated `AppUIHost: ValdiMarshallable`. Kotlin methods return
`com.snap.valdi.promise.Promise<Reply>` / `Promise<Unit>`; the adapter settles a native `ResolvablePromise` from
the existing native completion. It dispatches UI work as required and retains the native completion until settled.
Known public failures use the opt-in `PromiseRejectionException` runtime marker. Its message reaches JNI
verbatim, while ordinary Throwable diagnostics retain their existing class/cause formatting. The adapter
normalizes blank messages to `AppUI operation failed` and preserves the native error code. Without that opt-in,
the ordinary runtime serializer would turn scanner cancellation into an exception-prefixed public error.

iOS implements generated `VRAppUIHost <NSObject, SCValdiMarshallable>`. Objective-C methods return
`SCValdiPromise<VRReply *> *`; void methods return `SCValdiPromise<SCValdiUndefinedValue *> *`. Swift uses
these same imported `SCValdiPromise` types. The compiler imports `showModalWithRequest:` as
`showModal(with:)` and similarly shortens the other request methods; attachment selection imports as
`pickAttachments(withSource:limit:mimeTypes:)`. It explicitly settles
`SCValdiResolvablePromise<Reply>` from the native completion, retaining that owner until completion. Void uses
the module-owned `VRAppUIVoidPromise` helper, which fulfills with `SCValdiUndefinedValue`; failures call the native
rejection API. Arrays inside attachment results remain part of the generated typed model.

The BLE module's separate Swift generator emits `ValdiPromise<Reply>` / `ValdiPromise<Void>` and uses explicit
`SwiftValdiMarshaller_PushNewPromise`, `GetPromise`, `ResolvePromise`, `RejectPromise`, and `pushUndefined()`.
That implementation establishes native ownership and settlement requirements, but its Swift return types
cannot be substituted for the canonical Objective-C-generated AppUI protocol. Swift `async` bridging alone
is not evidence that typed objects, arrays and void are handled correctly.

The iOS helper's Void `start` argument is explicitly escaping because it is captured by the imported
Objective-C start block. Object emission caught this requirement after source-only typechecking had passed.

## Canonical generation and focused checks

Run from `tools/valdi-rolldown`, with the repository's existing dependencies installed. Regeneration is serialized
with other canonical generators/builders in the shared checkout:

```sh
node node_modules/tsx/dist/cli.mjs codegen.ts app_ui \
  --kotlin-out ../../android/app/generated/valdi \
  --objc-out ../../ios/Generated/valdi --objc-framework ValdiRuntime \
  --cpp-out ../../valdi/native/generated

node node_modules/tsx/dist/cli.mjs codegen.ts app_ui \
  --kotlin-out ../../android/app/generated/valdi \
  --objc-out ../../ios/Generated/valdi --objc-framework ValdiRuntime \
  --cpp-out ../../valdi/native/generated --check

node node_modules/tsx/dist/cli.mjs --test appui-promise.test.ts
```

The real generator writes seven canonical files:

- `android/app/generated/valdi/app_ui.kt`
- `ios/Generated/valdi/AppUI/AppUI.h`
- `ios/Generated/valdi/AppUI/AppUI.m`
- `ios/Generated/valdi/AppUITypes/AppUITypes.h`
- `ios/Generated/valdi/AppUITypes/AppUITypes.m`
- `valdi/native/generated/valdi_modules/app_ui/app_ui.hpp`
- `valdi/native/generated/valdi_modules/app_ui/app_ui.cpp`

The focused tests execute real application compiler output for `AppUIHost.ts`, `api.ts`, `schemas.ts` and
`storage.ts`, using actual npm validation/date dependencies and supplying native services at their boundary.
They check all 13 method signatures and invocations, absence of JS completion arguments, every canonical file
against real generator output, C++ `c+`/Promise schemas, undefined void fulfillment, delayed settlement, rejection,
empty errors, validation/defaults, cancellation, attachment mapping and host-module reload.

These checks establish the shared TypeScript behavior and generated ABI. The VM reload check does not destroy a
real Valdi page context. Native compilation, linked marshalling, actual page teardown, queue progression and
device presentation behavior require separate platform implementation/build/runtime evidence.

The parent executed the eight iOS native Promise/Objective-C bridge XCTest cases on the booted
`Valdi Demo iPhone 17 (iOS 26.5)` simulator: eight passed, zero failed or skipped. The durable runner
also reproduced that result against the fresh exported runtime:

```sh
python3 ios/Tests/run-appui-promise-tests.py --udid <already-booted-simulator-udid>
```

The runner generates an isolated test project and does not boot or select a device. Evidence is retained in
`.ci/harmony/2026-11-02-completion/appui-promise-ios-runtime-r3-proof.json` and
`appui-promise-ios-repro-r1/results.xcresult`. The earlier isolated-header setup failure and actual escaping
closure build failure remain in the r1/r2 records. These tests exercise native retention, release, rejection,
undefined, typed attachment results and canonical protocol marshalling; they do not present actual dialogs
or establish calling-page teardown behavior.

The normal iOS export and full Debug application build subsequently passed. The simulator framework is
byte-identical to the artifact used by the eight XCTest cases. The immutable application then passed actual
Argent replays: two-modal queue 21/21, editable modal 16 passing with two Android-only steps skipped,
scanner cancellation 20/20, and toast/loading 21/21. Scanner cancellation requires exactly
`scanCode:fail cancel`; modal completion and editable text are checked after returning to the JS page.

The first queue replay failed because its second-title wait also matched the first dialog's body. That
record remains preserved. The corrected replay waits for exact dialog titles and readiness before tapping.
Artifact hashes, copied YAML and bounded results are retained in
`.ci/harmony/2026-11-02-completion/appui-promise-ios-runtime-r2-proof.json`.
These simulator paths do not establish all thirteen methods, calling-page disposal or radio behavior.
The immutable application predates the latest BLE ownership changes.

## Android artifact and application checks

The runtime rejection marker and callback handling are integrated in the pinned Valdi fork.
Historical patch parser/export evidence remains in the archived work.
The actual main-workspace preparation and Android runtime AAR export subsequently passed. Inspection of
the AAR's `classes.jar` confirms the marker class and production callback branch are present.

Normal Debug assemble passed. Gradle unit tests executed 23 passing cases and skipped nine serializer cases
that require the JNI recorder; the separate integrated-source runner executed all 17 AppUI/serializer cases.
Evidence is in `.ci/harmony/2026-11-02-completion/appui-promise-android-export-r3-receipt.json`,
`appui-promise-android-assemble-tests-r1-proof.json`, and
`appui-promise-android-current-patch-20261103-proof.json`.

On the dedicated `ValdiRoutes_NoHwKeyboard` Android emulator, the installed APK passed the recorded
two-modal queue and action-sheet selection paths. The new
`.argent/e2e/appui-promise-android-scan-cancel-20261103.yaml` regression was recorded live and replayed
end to end twice; its final comparison requires exactly `结果：scanCode:fail cancel`.
The scanner regression expects the signed-in demo fixture. Initial home stillness warnings remain in the
runtime proof; scanner navigation and the final exact error check have their own assertions.

The immutable APK, AAR, screenshot and bounded run results are referenced by
`.ci/harmony/2026-11-02-completion/appui-promise-android-runtime-r1-proof.json`.
This is emulator evidence for those AppUI paths, not all thirteen methods, caller-page disposal, or BLE radio
acceptance. That APK precedes the later BLE queue fixes. BLE native code is packaged in an independent module,
so subsequent BLE changes require a module/APK rebuild rather than another identical runtime AAR export.
