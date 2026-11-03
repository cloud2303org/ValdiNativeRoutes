# Native AppUI integration and Promise contract

Production implements the canonical generated
`snap::valdi_modules::app_pages::AppUIHost` interface through
`HarmonyGeneratedAppUIProxy`, with thirteen explicit `Future<T>` methods.
`hostValue()` uses the official `CppMarshaller` for its `CppGeneratedInterface`
c+ proxy. Generated request/reply DTOs are the business ABI. There is no AppUI
JSON message protocol, generic request/reply validator, callback fallback reply,
or NAPI acknowledgment export on this path.

## Mount and native integration ABI

Mount argument **8** is the owning window's feedback object:

```ts
interface AppUIFeedbackHost {
  showLoading(request: { title: string; mask: boolean }): Promise<void>;
  hideLoading(): Promise<void>;
  showToast(request: {
    title: string; icon: string; duration: number; mask: boolean;
  }): Promise<void>;
  hideToast(): Promise<void>;
}
```

Arguments 9 (`systemServices`) and 10 (`initialActive`) keep their positions.
NAPI invokes the selected explicit method with this object as receiver, requires
an actual Promise, and calls `then` with the Promise as receiver. Fulfillment
resolves the generated `Future<void>`; rejection, throws and non-Promise returns
reject it. Index preserves the existing loading/toast state and resolves after
its UIContext's frame callback, checking window/epoch identity. Feedback does
not enter another serialized queue. Length-aware NAPI conversion preserves
embedded NUL in feedback strings.

RuntimeHost constructs the per-runtime owner on UI:

```cpp
_appUI = std::make_shared<HarmonyAppUIHost>(
    _env, feedback, _dispatcher, js->getJsDispatchQueue(), _uiContext);
```

The borrowed `ArkUI_ContextHandle` defaults to null for source compatibility;
a native presentation without it rejects with `E_APP_UI_CONTEXT`. The owner
retains the corresponding ArkTS UIContext/NAPI reference through `closeOnUI()`.
The presenter implementation is compiled with other host sources and requires
`ace_ndk.z`, already used by the native backend.

`HarmonyNavigator::setForegroundPageObserver` forwards committed logical page
identity to `setForegroundPageOnUI`. It reads `_stack.back()` and its existing
selected tab child without creating a page. Each queued presentation binds its
owner when shown. A foreground change cancels the active presentation;
removing covered A under foreground B does not affect B. Push, committed back,
and retained-tab changes update ownership. Interactive preview/cancel preserves
it. Queued presentations bind on their turn and wait while foreground is empty.

`setPresentationActiveOnUI(false)` cancels presentations; new show requests
while inactive reject. `closeOnUI()` closes admission, schedules JS shutdown,
and unregisters/disposes native UI synchronously before UIContext release.
Existing system-service initial activity, reentry and teardown fences remain.

## Typed completion, queue and lifetime

The six native kinds are modal, action sheet, picker, date picker, bottom sheet,
and image preview. Explicit generated DTO adapters produce owned C++ strings,
booleans, integer fields, options and URLs plus the native enum. No Valdi map,
JS function, Context pin or NAPI value crosses into the native presenter. Only
CAPI representation and resource bounds are checked here; business schema,
default and selection validation stays with the shared business implementation.

The per-window presenter ABI is:

```cpp
HarmonyNativeAppUIPresenter(ArkUI_ContextHandle, PostUI, Completion);
// Completion: void(uint64_t id, HarmonyNativeAppUIResult result)
```

All presenter operations/destruction are UI-only. `PostUI` must enqueue
asynchronously, never inline. `HarmonyNativeAppUIResult` is a variant of native
modal reply, presentation reply, error, or void. `completeOnUI()` queues onto JS;
`finishOnJS()` removes the pending entry before settling its typed Promise.
`HarmonyPendingAppUIRequest` constructs the exact generated reply. The official
Future marshaller settles a real `ResolvablePromise`; void resolves as JS
`undefined`.

At most 64 admitted native/feedback/media requests retain Promise state and their
originating `RetainedContext`. That pin survives settlement/reentrant handlers.
Official JS dispatch retains the Context again through queued delivery of its
stashed resolve/reject handlers. Shutdown rejects pending Futures once; late
and duplicate results find no entry. `scanCode`, `pickAttachments`, and
`clearAttachmentCache` call the owning `HarmonyAppUIMediaService` through N-API.
They retain typed Future results and reject if the media owner is unavailable;
the host does not fabricate scans or attachments. See `docs/harmony-appui-media.md`
for SDK ownership, cancellation, cache handling, and verification boundaries.

There is one native presentation FIFO. Button events choose a result;
`registerOnDidDisappear` schedules retirement off the SDK callback stack.
Retirement unregisters receivers, disposes the controller, detaches/disposes
nodes and picker range data, releases ownership, and completes once. Duplicate
events/disappearance are inert. A failed close retains dialog ownership and
cannot open a second dialog over it. Activity cancellation uses the explicit
cancel-all hook; unrelated page disposal does not.

Editable modal cancellation preserves edited text. Picker/action-sheet/date/
bottom-sheet cancellation returns an empty selection. Image preview dismissal
completes successfully with its last visible image; a foreground-owner change
still cancels it. These native result semantics are preserved by the refactor.

## SDK APIs and supported boundaries

Native custom C node content is hosted in a system-managed native dialog.
This does not claim identical built-in AlertDialog styling. Actual SDK26
headers used by production include:

- `arkui/native_interface.h`: `OH_ArkUI_QueryModuleInterfaceByName`.
- `arkui/native_dialog.h`: `ArkUI_NativeDialogAPI_3`, embedded API1
  `create/setContent/show/close/dispose`, `registerOnWillDismissWithUserData`,
  and `registerOnDidDisappear`.
- `arkui/native_node.h`: `OH_ArkUI_RunTaskInScope` (API20), node creation,
  attributes, per-node receivers, input string events and picker numeric events.
- `arkui/node_attributes/picker.h`: SDK-owned
  `OH_ArkUI_TextPickerRangeContentArray_*` (API19), preserving arbitrary labels
  without semicolon serialization.

This path requires API20 for multi-instance context scope and dialog API3
(API19). Missing tables reject with `E_APP_UI_UNSUPPORTED`; there is no ArkTS
presentation fallback. The unused ArkTS JSON-envelope presentation prototype
has been removed. Business calls enter the generated `AppUIHost` interface;
presentation kinds select native UI rendering only, not public API methods.

Calendar fields are local values. Native DatePicker handles date/year-month/
datetime in 1901..2100; native TextPicker columns cover year-only and wider
1000..9999 ranges, including leap-year/month day updates. TimePicker uses
24-hour selection. DatePicker event months are zero-based as declared by the
C header. Image preview uses a native Swiper of Image nodes with http/https/file
sources; network permissions and sandbox access still govern loading. There
is no fabricated image data, scanning or attachment behavior.

C text attributes are NUL-terminated, so presentation text with embedded NUL
rejects. Resource bounds are 16 KiB per text field, 512 options/images, and
128 KiB aggregate text. Feedback uses NAPI rather than these C text attributes.

## Verification and artifact boundary

```sh
python3 harmony/entry/src/main/cpp/host/tests/AppUI-run.py
node harmony/entry/src/main/cpp/host/tests/AppUI-check-presenter.cjs
```

The runner puts `valdi/native/generated` first, compiles canonical generated cpp
and production host/presenter/dispatcher for x86_64 and arm64-v8a, and strictly
links them to actual SDK libraries and the pinned Valdi runtime with
`--no-undefined`. RuntimeHost/NAPI integration also compiles for both ABIs.
Stale business-binding output is never copied or rewritten.

ASan/UBSan host execution covers real typed Future/ResolvablePromise settlement,
undefined void, Context pins, capacity, shutdown/late completion; production
host/dispatcher with the actual Node-API runtime; and all thirteen generated
methods through the pinned macOS JavaScriptCore adapter and its attached
`JavaScriptValueMarshaller`, including nested business-bootstrap conversion.
The engine test scheduler retains each queued Context like the real runtime.
Only the pinned JSC adapter's zero-length VLA extension is excluded from
`vla-bound` in its two source files; other sanitizers remain enabled.

Native node, event, FIFO/disappearance and teardown tests use actual SDK types
and an in-process ArkUI boundary simulator. Focused Navigator tests execute
actual foreground observer, changed, covered-page finish and close method
bodies with small collaborators. They cover Root -> A -> B, B's dialog while
covered A finishes, push/tab changes, interactive preview/cancel versus commit,
queued ownership and close/reentry.

The SDK checker parses/typechecks production Index and native feedback
mount declarations against real SDK26 declarations. It is not a full Hvigor/
HAP ArkTS build. Host runtime execution is macOS JSC/Node, not OHOS/Hermes
execution, device rendering or animation proof. No module/export/HAP/device
operation is part of these checks. The first copied smoke HAP predates the
foreground ownership correction and retains the known old page-removal bug;
that copied artifact was not edited. The current intermediate HAP does not
validate this Promise refactor.
