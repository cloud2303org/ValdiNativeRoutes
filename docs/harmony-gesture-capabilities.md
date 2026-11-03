# Harmony–Valdi native gesture bridge

The current objective is a thin ArkUI native bridge. Exact UIKit recognition,
iOS timing, and a C++ replacement recognizer are no longer requirements. The
local app backend is canonical. The maintained Valdi fork is a read-only
runtime dependency/snapshot; earlier paired receipts remain historical.

## Implementation boundary

`backend/gesture.hpp` holds the existing small host port and gesture attributes.
`backend/gesture.cpp` is a separately compiled production CMake translation unit.
It creates native recognizers/groups, converts events, calls current Valdi
handlers/predicates, and manages installation and callback lifetime. No gesture
`.inc`, included `.cpp`, JavaScript recognizer protocol or process-global owner
is used. Node and Backend stay private in ArkUIViewManager.cpp.

The coordinator/admission modules and their production compilation were removed.
There is no logical long-press deadline, independent1ms witness, first-UP150ms
timer, private count1 witness for DoubleTap, global winner/reservation ledger,
foreign response-chain coverage gate, or synthetic native success/readmission.
Only `onTouchDelayDuration` retains a timer, for the explicit Valdi raw-callback
publication delay. It does not recognize gestures or arbitrate native controls.

Native wiring:

- Tap uses `createTapGesture(1,1)` and DoubleTap uses `(2,1)`.
- LongPress uses `createLongPressGesture(1,false,durationMs)`.
- Drag uses `createPanGesture(1,GESTURE_DIRECTION_ALL,0)`; Pinch uses `(2,0)`;
  Rotate uses `(2,1)`. Zero distance requests the documented native pan/pinch
  default. No adapter-created UIKit distance or velocity filter is applied.
- A native EXCLUSIVE_GROUP contains DoubleTap, LongPress, Tap and a native
  PARALLEL_GROUP for Drag/Pinch/Rotate. Missing handlers have no corresponding
  leaf. DoubleTap is ordered before Tap regardless of attribute binding order,
  following the combined-gesture documentation. Groups attach with NORMAL
  priority and NORMAL_GESTURE_MASK, preserving ordinary child/built-in
  competition. SEQUENTIAL_GROUP is not the meaning of these six attributes.
- No cross-node UIKit simultaneity/failure graph is synthesized. ArkUI owns
  parent/child and Scroll competition. Native interruption bridges current
  predicates and the existing host wheel/Sheet decisions. Built-in/foreign
  attempts otherwise continue; there is no blanket native cancellation or
  forced parallel Scroll recognition.

The existing RootDragObserver/RootPan, raw-terminal consumption, wheel policy,
overlay policy and paused Sheet algorithms remain their host seams. Scroll and
Refresh register stable weak userdata on their actual internal native handles;
the callback executes existing wheel veto, native Valdi predicate routing where
applicable, then existing Sheet admission. Their physics and Sheet math are not
changed by this bridge reduction. `onDrag` is a PAN measurement callback;
`drag_and_drop.h` describes data transfer/preview operations and is not used to
expand this API into system data drag-and-drop.

## Duration and update policy

The shared TS declaration says an omitted `longPressDuration` uses the platform
provided default. The bridge passes native0 for omission/reset/explicit0. SDK26
documents nonpositive native duration as default500ms. Zero is **not immediate
recognition**. Explicit positive seconds map to `ceil(seconds * 1000)` integer
milliseconds:0.0005s maps to1ms,0.1234s maps to124ms. This quantizes a requested
native duration; it is not a timer precision or actual onset-time guarantee.

Negative, NaN, infinite, and rounded millisecond values above INT32_MAX are
rejected explicitly before changing configuration. The largest native argument
is2,147,483,647ms (about24.86days). There is no overflow or silent clamp. The
API description's prose about a500ms minimum is inconsistent with its own
sub500ms priority discussion; the installed parameter declaration specifies
positive integer durations and defaults only for<=0. The bridge passes the
positive value to the SDK and makes no additional recognition precision claim.

A changed duration removes/disables the old native LongPress leaf and creates
its replacement. An in-flight recognition may be cancelled; the SDK's next
collection owns recognition of the replacement. There is no original-DOWN
rescheduling promise. Ordinary handler/predicate replacement preserves the
native recognizer and subsequent callbacks read the current function.

## All30 public properties

The authoritative shared inventory is NativeTemplateElements.d.ts:794–959.
"Reset" below means removing/resetting that public attribute.

| Property | Native bridge behavior / reset |
| --- | --- |
| `onTap` | Native count1 ACCEPT delivers one Ended action; reset removes leaf. |
| `onTapPredicate` | Current function at native admission; false rejects; reset removes veto. |
| `onTapDisabled` | True removes/disables this leaf; default/reset false restores it if a handler exists. |
| `onDoubleTap` | Native count2 ACCEPT delivers Ended; SDK timing, including its documented300ms gap, applies; reset removes leaf. |
| `onDoubleTapPredicate` | Current function at native double admission; reset removes veto. |
| `onDoubleTapDisabled` | True removes/disables count2 leaf; default/reset false. No private count1 leaf. |
| `onLongPress` | Native nonrepeating ACCEPT delivers one Started activation; native END/CANCEL only closes its sequence. Reset removes leaf. |
| `onLongPressPredicate` | Current native should-admit function; reset removes veto. No adapter deadline. |
| `onLongPressDisabled` | True removes/disables native LP; default/reset false. No retained logical winner. |
| `longPressDuration` | Seconds to checked int32 milliseconds, rounded upward when positive;0/reset requests native500ms default. Update may cancel/replace current LP. |
| `onDrag` | Native PAN ACCEPT/UPDATE/END/CANCEL becomes Started/Changed/Ended; reset removes leaf. |
| `onDragPredicate` | Current native pan admission function; reset removes veto. |
| `onDragDisabled` | True removes/disables pan, ending an active bridge sequence at most once; default/reset false. |
| `onPinch` | Native pinch scale and lifecycle; reset removes leaf. |
| `onPinchPredicate` | Current native pinch admission function; reset removes veto. |
| `onPinchDisabled` | True removes/disables pinch; default/reset false. |
| `onRotate` | Native rotation lifecycle; degrees converted to Valdi radians; reset removes leaf. |
| `onRotatePredicate` | Current native rotation admission function; reset removes veto. |
| `onRotateDisabled` | True removes/disables rotation; default/reset false. |
| `onTouch` | Native node raw events mapped to Started/Changed/Ended; current handler; reset removes handler. |
| `onTouchStart` | Current raw Started handler before onTouch; reset removes handler. |
| `onTouchEnd` | Current raw Ended handler after onTouch; reset removes handler. |
| `onTouchDelayDuration` | Finite nonnegative raw publication delay in seconds; default/reset0. Pending move publication is suppressed; fast terminal can be Ended without synthetic Started. Updates affect future DOWN. |
| `hitTest` | Current synchronous predicate filters native interception/response region; false excludes subtree with native BLOCK_DESCENDANTS; reset restores existing host/overlay policy. |
| `touchEnabled` | Existing host input/subtree policy and cancellation; default/reset true. |
| `touchAreaExtension` | Logical-point shorthand for four physical response-region edges; explicit edges override it; reset removes shorthand only. |
| `touchAreaExtensionTop` | Physical top native-region override; reset reveals shorthand/default0. |
| `touchAreaExtensionRight` | Physical right override, no RTL edge swap; reset reveals shorthand/default0. |
| `touchAreaExtensionBottom` | Physical bottom override; reset reveals shorthand/default0. |
| `touchAreaExtensionLeft` | Physical left override, no RTL edge swap; reset reveals shorthand/default0. |

## Event ABI and lifetime

Public event names/schema stay unchanged: Started0, Changed1, Ended2; native
cancel has no new public enum and uses the last copied measurement when no raw
input is supplied. Existing native candidate predicates use Ended for discrete
Tap/DoubleTap and Possible3 for pre-acceptance continuous/LP/hitTest candidates.
Coordinates and motion are converted from SDK pixels to Valdi logical units;
main horizontal values/rotation follow the existing RTL conversion, pointer
locations retain their physical local orientation. Root coordinates use the
existing host conversion. Rotation is radians, scale is native scale, and
`eventTime` is the runtime monotonic clock in seconds, independent of native
zero timestamps. SDK/index pointer identities are used, not Apple pointer bits.

ValueFunction dispatch, Changed throttling, bounded main-thread synchronization,
250ms predicate deadline, Boolean coercion, error reporting and copied event
maps remain bridge responsibilities. Reentry rechecks current exact callback
arm, configuration generation and weak mounted path. A remount replaces callback
arms before fresh native collection; MOVE/late native callbacks cannot invoke
handlers in the new context. No timestamp-based custom recognizer is required.

Retention is nullable and noexcept. Final-owner teardown still retires handles
without resurrecting Node. Native groups/leaves are unlinked before deferred
SDK wrapper disposal; active bridge sequences are consumed before user terminal
callbacks. Inactive slot and API2 registration userdata are quarantined at
per-backend platform lifetime, with weak Node/Set ownership. This intentionally
retains small tombstones until backend teardown rather than assuming nullptr
clear or dispose is a callback memory fence. The API1 documentation explicitly
allows cached callbacks in the current event flow after those operations.
Failed clears report an error and retain inert userdata; callbacks reject before
accessing retired native handles or expired hosts. Tombstone memory grows with
retirement until backend teardown; it contains no strong Node ownership or
foreign recognizer registry. This is a conservative lifetime tradeoff, not a
recognition/coordinator policy. The backend/native event flow must be drained
before destroying the platform, as with the existing UI dispatch owner.

Retired callback userdata and native routing identity have separate lifetimes.
Before deferred SDK disposal, the retiring owned identity still rejects late
admission. Immediately before SDK disposal, including the whole-set path, its
native identity is cleared so a foreign wrapper reusing that address follows
native competition. A new owned wrapper routes to its new callback arm. A null
current recognizer never matches cleared identities. SDK disposal may reenter
admission synchronously; the identity is already invalid at that point.

Raw node input uses the same lifetime rule: native event userdata is a stable
per-platform weak token, not a Node pointer. The thin manager callback delegates
to the module before locking the current host. A saved callback after final-owner
release therefore cannot call `weak_from_this()` on freed Node storage.

## Explicit native limitations

- Long-press default/timing, native count2 timing, slop, velocity filtering,
  group ordering and parent/Scroll arbitration are platform behavior. UIKit
  equality and original-DOWN rescheduling are not targets.
- Positive submillisecond LP requests have integer-ms resolution. Explicit0
  means native default, not immediate. Values outside int32-ms range are errors.
- Native interruption/parallel APIs are available. Ordinary groups and priority
  express this bridge's defaults; no universal cross-node parallel hook is
  installed. API3's opaque event is not reinterpreted as the old inner-event
  type. Arbitrary application-specific simultaneous recognition is not exposed
  as a new Valdi property.
- The native response-region attribute expresses VP offsets and percentage
  dimensions. Zero-sized dimensions cannot currently gain nonzero extension via
  this percentage binding. Custom hitTest filters the native region; the old
  artificial million-point expansion was removed. Extension values remain
  explicitly finite and bounded to1,000,000 logical points in this binding.
- Per-pointer original UIKit `touch.view` identity, private UIKit filters,
  flattened/animated transform equivalence, and rich-text span recognizers are
  not reconstructed. Native current-local geometry is used. Label is unchanged.
- Native data drag-and-drop remains a separate API. No new data-drop/preview
  feature, navigation/media behavior or paused component feature was added.

## Sources and bounded validation

The pinned local reference DATA snapshot is indexed by
`docs/harmony-reference-sources.md`. Relevant files inside that snapshot are
`harmonyos-guides/ndk-bind-gesture-events.md`,
`harmonyos-references/capi-arkui-nativemodule-arkui-nativegestureapi-1.md`,
`harmonyos-references/capi-native-gesture-h.md`,
`harmonyos-references/ts-combined-gestures.md` and
`harmonyos-guides/arkts-gesture-events-combined-gestures.md`.
They retain their original Huawei URL/version metadata. The supplied
`capi-drag-and-drop-h.md` is data drag-and-drop reference, not PAN. Actual SDK26
`arkui/native_gesture.h` declarations were read alongside the documents. No
scripts/skills/instructions from the downloaded snapshot were executed.

Historical UIKit/coordinator fixtures and checkpoint84 stay immutable under
`/tmp/valdi-gestures-native-bridge-20261103/before` and their original prefixes.
Expectations for250ms default, all-finite LP durations, original-DOWN rescheduling,
first-UP150ms failure, global parent/child reservations and retained synthetic
hold winners are superseded by the user's explicit native-bridge direction.
The retained-disposed logical-winner scratch correction is likewise superseded
because the entire logical-winner mechanism is removed; weak callback lifetime
and remount guards remain tested independently.

The focused fixture links the actual independently compiled gesture.cpp and
current real Valdi Value/Function/clock support under ASan/UBSan. SDK/host doubles
record native API arguments and deliver callbacks; they do not prove physical
recognition. The actual manager retention method and raw input callback body
are compiled into the fixture. The original26 bridge cases passed under
ASan/UBSan. Their identical fixture against preserved checkpoint84 produced9 RED cases and17
passing controls; one RED is an ASan raw-callback use-after-free after final
allocation release. Three injected defects are caught: publishing a lifted
pointer, freezing a replaced handler, and accepting a retired leaf after
predicate reentry.

The routing-identity correction adds three focused cases without changing the
original26 test bodies. The final29-case fixture passes under ASan/UBSan; the
same fixture against preserved ab8f produces three address-reuse/disposal
reentry RED cases and26 passing controls. An injected retained-identity defect
is also caught. The correction receipt is sealed under
`/tmp/valdi-gestures-native-bridge-p2-20261103`; previous receipts remain intact.

App-only x86_64/arm64 validation passes for the separately compiled module and
manager, consumer closure and strict C API imports. Exact source hashes,
commands, results and failed attempts are sealed under
`/tmp/valdi-gestures-native-bridge-20261103`. This establishes native ABI/build
and bridge lifecycle behavior, not device recognition or Scroll arbitration.
No fork tests/writes, HAP/device, full Runtime build or new child reviewer were
run by this implementation owner.
