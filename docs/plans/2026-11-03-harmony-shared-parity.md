# Harmony shared application parity

The user requested continued implementation on November 3, 2026. The target is
the existing Android/iOS application contract, with the sibling
`/Users/cloud/project/NativeRoutesHarmony` as a read-only SDK and framework
reference. Existing working changes and historical artifacts remain preserved.

## Sequence and ownership

1. Implement scan, attachments and owned-cache deletion through the generated
   AppUI interface. Freeze and independently review that implementation.
2. Add native page content and the registered `picker` screen, preserving the
   existing navigation/result contract.
3. Implement the existing column/time/tree inline wheel classes on Harmony,
   preserving shared validation and settled-selection callbacks. The current
   `WheelPickers.tsx` names only Android/iOS classes; AppUI picker dialogs are
   separate.
4. Add a separate route-sheet owner and the same-window sheet surface, then
   complete native gesture/scroll handoff through backend-owned hooks.
5. Carry the already reviewed key-position-only `removeProperty` fix into the
   staged JavaScript platform overlay and its pinned-input verifier. A read-only
   production-function probe on November 3 reproduced the old corruption in
   `.tools/harmony/upstream`; the maintained fork has the correction. Preserve
   the old staging/artifact evidence and generate a verified new input set.
6. Independently review each implementation, run integrated checks, and build
   and replay a fresh package from the resulting source.

Native compilation has one owner at a time. No commits, pin changes, remote
publication, sibling edits, or destructive cleanup are part of this work.

The resumed direction retains the ArkUI C API native Scroll and uses the
existing iOS route sheet as the primary behavior reference. Its shared drag
distance uses the maximum distance to the edge across participating scrolls,
followed by pinning at the edge. Do not sum those distances: for child 30,
parent 20 and downward travel 70, the reference panel travel is 40, not 20.
Validate this using the actual production backend path, including split frames,
reversals and cancellation; native SDK event ordering remains a live-check gate.

## Scan and attachment contract

The generated `AppUIHost` signatures and shared TypeScript wrappers remain
unchanged. The SDK-facing implementation uses the real installed SDK.

- Scanner returns the original code and one of the six shared scan-type names.
  User cancellation rejects with `cancel`; SDK errors remain errors.
- Photos, camera and documents return owned attachment metadata and `file://`
  cache copies. Empty selection answers `canceled: true`. Preserve count and
  MIME constraints, close source descriptors, and remove partial copies on
  failure.
- Cache deletion affects only owned attachment copies and is serialized
  against in-flight copying.
- Android and iOS media presenters are outside the page-owned modal queue.
  Route changes do not cancel them. Runtime/window retirement revokes delivery;
  an SDK presentation temporarily hiding its own host is not retirement.
- SDK Promise delivery cancellation is not proof that physical SDK UI stopped.
  Preserve any required physical-operation fence without retaining the closed
  runtime, page, context or callback graph.

Use plain owned data between UI and JS queues and the official generated DTO
marshaller for results. Keep modal presentation and feedback behavior intact.

## Native route content

The existing `picker` route is selected by its declared native screen name.
Unknown native names still fail. A native screen owns its controls, callback
registrations and identity-bound actions; its presentation root belongs to the
existing backend.

The native picker must return `{value: fruit}`, support back cancellation, and
retain its pending result and state while a detail page covers it. Preserve
the native examples for push, switchTab, and AppUI invocation through the same
runtime's services.

Generalize root sizing, visibility, parking, transitions and removal to handle
either a Valdi tree or native content. Avoid dereferencing a nonexistent Valdi
tree for a native page.

`createRootView()` supplies a custom root whose backend measure/layout
receiver handles backend children. Native content therefore needs a separately
owned measurement/layout adapter; merely inserting a column beneath that root
is insufficient. Preserve backend event registrations and root ownership.
Remove the additional receiver and native children before releasing the root.

## Inline wheel implementation

Use concrete Harmony column/time/tree native classes selected at bind time,
with a Harmony-only render-time class spread on the existing shared custom
views. Retain static iOS/Android class names and the existing `config: string`
/ `onChange(string)` contract.

The current mobile AAR/framework bootstrap does not consume `harmonyClass`.
Keep that key out of hoisted prototypes: after both static class attributes,
spread a helper that returns `{ harmonyClass: className }` only when
`String(Device.getSystemType()) === 'harmony'`, otherwise `{}`. Put style,
config and callback attributes after the spread. Do not return an enumerable
undefined class key or use a static class in an untaken Harmony JSX branch.
Verify with the real pinned mobile types and packaged core, as well as the
isolated corrected Harmony overlay. This does not require a mobile runtime
export or ambient JSX replacement.

The installed SDK26 distinguishes TextPicker selection change from
`NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP`, whose contract includes settlement.
DatePicker/TimePicker lack that corresponding inspected NDK stop event.
Compose calendar/time wheels from native TextPicker columns rather than
substituting a change callback, finger-up or debounce for settlement.

Use owned range-content arrays instead of punctuation-separated label strings.
Preserve canonical column values, tree paths and all five calendar/time
formats. Normalize cascading descendants and Gregorian month/day bounds
without timezone conversion.

Programmatic configuration and delayed events need generation-tagged native
controls. Only a current-generation stopped selection can emit a changed
value. Preserve both platforms' pending-echo handling so delayed JS renders
cannot move an already advanced wheel backward. Structural configuration
changes reset that echo scope; callback-only changes do not rebuild controls.
Retirement invalidates delivery and unregisters controls without synthesizing
a final selection.

Add wheel lifecycle and native measure/layout handling to both backends.
Keep their bind-time component dispatch architecture and protected editor and
label implementations intact. Wheel touches are exclusive interaction regions
for the owning scroll and sheet; their boundary rows must not transfer a drag.

The official and consumed JSX processors also need the `harmonyClass` member
in their existing `viewFactory` conflict check, with real compiler fixtures
covering either attribute order. Preserve static/dynamic attributes, lazy,
key and ref behavior. Coordinate source/overlay validation with the packaging
prerequisite; do not demonstrate this using a permissive handwritten JSX type.

## Separate sheet ownership

Maintain one sheet separately from the base stack, matching the existing
Android/iOS navigators. Both its page and the base front page remain visible
while foregrounded. AppUI foreground identity selects the sheet first.
`currentPages()` lists base entries followed by the sheet.

Opening another route while a sheet exists changes the base stack while
retaining the sheet, as the reference implementations do. Native back addresses
the sheet first, including during closing. Base horizontal interactive back is
disabled for the sheet's full lifetime.

Sheet finish, back, scrim and committed downward drag share one terminal path:

1. Accept one result or cancellation.
2. Retain the page, parent, callbacks and animation through closing.
3. Invalidate the terminal generation before cancellation can reenter.
4. Unmount the real page root and detach presentation nodes.
5. Clear sheet ownership and reconcile base visibility.
6. Deliver the existing result, then fence context destruction through JS.

Commands that remove the caller wait behind sheet removal. Their admitted
result requests remain tracked, including commands outside the dispatcher's
current batch. Terminal host teardown detaches synchronously and drains all
result/context fences before runtime teardown; it does not wait indefinitely
for another frame.

## Shell, geometry and input

Use a dedicated retained sheet `NodeContent` in the same window, above page/tab
surfaces and below loading/toast overlays. Register it through a private native
shell seam with collision accounting and lifetime retention. The backend's
existing `mountRootInParent()` mounts the page inside an owned native viewport.

The reference fixed sheet uses a nominal 75% detent. The compact sheet uses
24 points of handle plus 340 points of content plus bottom safe area. Supply
top inset zero, horizontal safe areas, and unobscured bottom safe area to sheet
content; do not add tab-bar height.

Publish coherent full-window, available-viewport and keyboard metrics. Preserve
the shell's existing resize avoidance and avoid inferring full height by
unconditionally adding keyboard height to a resized viewport. Background hides
both pages, cancels uncommitted drags to open, disables input and preserves an
open sheet's state.

Whole-panel drag and scroll-boundary handoff need a lifetime-safe internal
backend interface. The backend must remain the sole owner of dynamic scroll
receivers, event userdata and editor/wheel arbitration. A handle-only drag is
not full gesture parity. Narrow backend hooks are permitted where required;
preserve the old receipts as historical evidence rather than freezing out a
necessary implementation.

Use a private root-scoped sheet binding separate from `RootDragObserver`.
Host callbacks receive an owned session identity and logical displacement;
the backend retains ownership of scroll receivers and native userdata.
Specify vertical delta, velocity and remainder signs explicitly, bound
consumption to the available displacement, and recheck root/session validity
after callbacks before native writes. Ending or canceling a session is terminal.

The SDK frame-begin event includes keyboard/mouse input and does not itself
prove touch-drag admission. Its documented payload has displacement and scroll
state, without a global input-event ID. Deduplicate by assigning a single
authoritative motion path and accounting for nested consumption; timestamps
or equal float deltas are not an event-identity proof. Native ordering still
requires instrumentation and later device acceptance.

The sheet task may prepare host code and the new private seam while wheels own
the backend. Existing manager/scroll edits and native compilation wait for an
explicit source and compile-slot handoff.

## Validation

Use meaningful production-path failures before fixes and retain failed
attempts. Test callback reentry, independent focus, late completion, native
allocation/mount failures, duplicate terminals, background, resizing, owner
replacement and teardown.

Exercise native carrier layout, picker-to-detail-to-picker, sheet/base
visibility, sheet-first AppUI identity, result-after-detach, caller retirement
ordering and tab isolation. Test the actual helpers and navigator integration;
source strings or a duplicated navigation model are insufficient.

Compile affected C++ units for SDK26 x86_64 and arm64 and run the real ArkTS
checks. Complete a fresh current-source application link and package before
device claims. Do not link archived old context implementations with the
maintained 616-byte context headers.

Replay the affected shared scenarios on the exact new artifact. Keep scanner
camera/hardware availability separate from cancellation or SDK-failure
acceptance. The earlier full-development-r2 HAP and keyboard source/object
proofs retain their own inputs and do not validate these new implementations.
