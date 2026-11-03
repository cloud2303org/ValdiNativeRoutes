# Native scroll integration

Backend implementation contract for the staged Valdi source pinned by the
parent to `15feb6530ceecb971f4c8519ea8ab77474b959db`, using the installed
SDK from `/Users/cloud/.config/harmony/env.zsh`.

## Fixture contract

Use logical native class `scroll` (alias `ArkUIScrollView`) in the Harmony
class mapping. The backend calls `bindScrollAttributes()`; keep the official
Valdi scroll layout defaults (`overflow="scroll"`, main axis from `horizontal`).
Use a fixed viewport and content larger than the viewport. Valdi owns every
child frame and the total content size; no ArkTS Scroll or JS transform wrapper
is required.

Use the existing `ElementRef<ScrollViewInteractive>` contract:

```ts
ref.setAttribute('contentOffsetAnimated', true);
ref.setAttribute('contentOffsetY', 240);
// Horizontal fixture: horizontal={true}, then contentOffsetX.
```

Declarative `contentOffsetX/Y`, `contentOffsetAnimated`, `staticContentWidth`,
`staticContentHeight`, and ordinary ref `setAttribute()` all take the runtime
scroll-spec transaction path. There is no native `scrollTo` action in the
pinned ScrollView API. No platform ViewNode wrapper is needed for ElementRef.

Observe official `onScroll`, `onScrollEnd`, `onDragStart`, `onDragEnding`,
`onDragEnd`, and `onContentSizeChange` payloads. Return `{x, y}` from
`onDragEnding` to override settling. Runtime owns event serialization, RTL
conversion, visibility/viewport updates, and content-size notifications.
Native events must call the ViewNode methods and honor returned offsets.
Nonanimated changes are notified by the runtime itself.

Prepare separate vertical, horizontal/RTL, paging, disabled-user-scroll,
indicator, small-content bounce, nested scroll, child tap/drag, and root
edge-back fixtures. Include animated and immediate ref jumps, live content
growth/shrink, callback reentry/removal, unmount during momentum, and
pause/resume. Device and HAP validation remain parent-owned.

## Native properties

Implemented native bindings: `scrollEnabled` (true), `pagingEnabled` (false),
`showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` (true),
`bounces` (true), `bouncesFromDragAtStart/End` (true),
`bouncesVerticalWithSmallContent` and `bouncesHorizontalWithSmallContent`
(false), and `cancelsTouchesOnScroll` (true).
Both axes means the official `horizontal` axis selector; free two-dimensional
diagonal scrolling is outside the pinned Valdi ScrollView contract.

The pinned `ScrollAttributes` and ScrollView TS interface have no
`contentInset*` properties and `setViewScrollSpecs()` contains only offset,
content size, and animated. Yoga padding is the supported content inset:
it is already included in child frames/content bounds. Do not add a second
native padding or shift. Safe-area/keyboard insets need a separate agreed
runtime/host integration; they are not silently inferred.

Native hierarchy: exact-size Valdi custom viewport -> real ArkUI Scroll ->
exact-size custom content -> Valdi children. Only custom measure/layout
callbacks call `measureNode`, `setMeasuredSize`, `layoutNode`, and
`setLayoutPosition`. Native Scroll owns physical scrolling, clipping, momentum,
scrollbar, edge spring, and paging.

## Explicit boundaries

Keyboard dismissal/translation, generic ScrollView refresh props, zoom, platform fading-edge
styles, deceleration-rate parity, scroll performance bridge, and native
platform wrapper APIs are outside this phase. Unsupported native attributes
fail binding rather than pretending to work. SDK gesture-arena decisions,
page physics, and edge spring timing follow ArkUI and require parent device
verification.

The later custom-view `ArkUIRefreshView` phase is documented in `REFRESH_API.md`.
It wraps one existing vertical Scroll; it adds no pinned ScrollView prop.

The SDK provides a scalar release speed rather than a mutable target offset
in `ON_WILL_STOP_DRAGGING`. A returned `onDragEnding` target is therefore
applied as a native 300ms ease-in-out controller animation on the next UI turn,
after ArkUI finishes its own release callback. This can replace the beginning
of the native fling; it is not UIKit's in-place target-pointer hook.
The same 300ms curve is used for `contentOffsetAnimated`. Paging, snapping,
scrollbar appearance, and edge physics follow the SDK.
Drag lifecycle registrations require API 21 or newer; the current Harmony
build profile specifies compatible/target SDK 26. Registration errors on an
older runtime are explicit factory failures.

`stopScrollingOnTouch` is now bound (default/reset false): native DOWN
interception samples/cancels momentum before JS raw callbacks, preserves an
admitted drag and leaves descendant hit testing/touches intact. It uses the
existing journal, including deferred release/correction invalidation.
`decelerationRate`, keyboard attributes and platform fading-edge attributes
remain unbound. Circular offsets are reconciled through
ViewNode's returned correction, but preserving native fling velocity across a
circular wrap is not promised.

## Runtime and lifetime

`NODE_SCROLL_EVENT_ON_DID_SCROLL` reads the native absolute offset (the event's
payload contains **deltas**, not an absolute position). Geometry and custom
layout use physical pixels at the configured displayScale. The Scroll node
keeps its default VP units for offset properties/events; the inner custom
content uses PX. Native Scroll and content are fixed LTR because ViewNode
already resolves RTL offsets and physical child frames.

Clamped and unclamped offsets are passed separately to ViewNode, with numeric
point-per-second velocity from actual offset samples and the native release
speed magnitude. The runtime serializes events, flips logical horizontal
velocity when required, updates contentOffset attributes and schedules viewport
updates/culling. `onContentSizeChange` is bound entirely by the runtime.

Nonanimated specs normally produce no duplicate JS event: ViewNode already
notifies the change. If native bounds clamp a requested offset, the actual
offset is reconciled through ViewNode. Animated no-op requests still finish
the runtime's animation flag. Specs wait for the new native layout before
issuing controller commands, with revision checks against newer frame/spec
updates. Only custom measure/layout callbacks call layout primitives.

Content-size synchronization at the runtime's unchanged published offset is
geometry-only. It updates extents and requests layout while retaining the
current drag/animation, deferred release correction, and queued notices; it
does not issue a controller offset write. This includes synchronous content
growth from `onDragStart`. An initial spec, animated request, changed offset
(including the runtime's shrink adjustment), or same-size command replaces
the sequence. Replacement consumes and queues the old drag/scroll terminals
before advancing generation. Specs defer terminal delivery until after the
native transaction returns, because ViewNode ignores lifecycle calls while
`isUpdatingScrollSpecs()` is true.

Native event delivery attempts the tree lock once, without blocking UI on a
worker waiting for a native transaction. If busy, a retained UI retry drains
ordered lifecycle notices and coalesces only adjacent offset samples.
`onDragEnding` consequently executes on that retry when the tree is busy;
its returned target remains applicable only to the same native sequence.
Callbacks can replace offsets, unmount, suspend or shut down: terminal flags
and an entire notice batch are captured before JS; generation and ownership
are rechecked before applying returned corrections.

`ScrollState.hpp` is the production lifecycle journal used by NativeScroll.
Generation changes discard obsolete offset samples, but retain accepted
start/release/cancel/end notices in order. A release consumed before tree-lock
contention therefore still invokes `ViewNode::onDragEnding()` (which emits
both `onDragEnding` and `onDragEnd` in the pinned runtime), even if cancellation,
a new command, or another drag wins before delivery. Returned targets from
obsolete releases and all cancellation callbacks are ignored. A new drag
closes the previous active sequence before its own start. Corrections carry
their generation; accepting a new drag clears the obsolete target, and an
old posted task cannot clear a newer target. Only an end for the correction's
own generation waits for that correction to settle.

Historical ends delivered while a newer sequence is active notify the resolved
`onScrollEnd` callback directly. The pinned `ViewNode::onScrollEnd()` clears
`ViewNodeScrollState::currentlyAnimating` before calling JS; `onScroll()` does
not restore it. Passing an older end through that method would let a subsequent
immediate ref jump to the unchanged published offset return early instead of
canceling the newer animation. The backend uses the public
`ViewNode::getAttributesApplier().getResolvedAttributeValue()` and
`getAttributeIds().getIdForName()` APIs to obtain the same function installed
by the official `ScrollAttributes` binder. It uses
`TouchEvents::makeScrollEvent()`, zero velocity, and
`ValueFunctionFlagsBoundedMainThreadSync`, matching the official scroll-end
notification. Physical offsets are resolved with `getRtlScrollOffsetX()`,
matching `ViewNodeScrollState`'s RTL conversion. Current ends and ends with no
newer active sequence still use `ViewNode::onScrollEnd()`. There is no runtime
flag setter exposed by ViewNode, no private state access, and no restoration
after JS that could overwrite reentrant commands.

Accepted `onDragEnding` targets remain stored until `laidOutRevision` equals
`geometryRevision`, just like ordinary commands. An unchanged-offset content
growth can preserve the release generation while invalidating layout, so
generation alone is insufficient. A posted attempt against stale extents
does not consume the correction; `didLayout()` queues a new attempt. Each
attempt also checks generation, and a stale queued generation yields its
queue slot to any newer correction. Native STOP remains suppressed for the
pending correction's generation until it can be applied.

At accepted native drag start, `cancelsTouchesOnScroll` consumes descendant raw
touch terminals before notifying them. It does not remove/reinstall child
gesture recognizers during native arbitration. Child taps keep the existing
recognizer path and remain available on the next gesture. Nested scrolls use
native SELF_FIRST chaining in both directions, except the direct child of
`ArkUIRefreshView`, which retains SDK default SELF_ONLY to allow Refresh's
native linkage. No extra PAN or high-priority
recognizer is installed: existing child gestures and the root edge-back
observer retain ArkUI's NORMAL precedence. A horizontal child's accepted
native scroll can beat the ancestor horizontal edge PAN; host route gating
and system edge interception remain host-owned as in `GESTURE_API.md`.

Detach/reparent, suspension, subtree touch disabling, and disposal stop native
momentum and consume the old sequence once. Normal disposal unregisters native
scroll/content listeners and detaches the inner handles immediately; their C
disposal is queued until native callback stacks unwind, retaining userdata and
the backend. Continue servicing/draining the existing UI dispatcher through
shutdown, as for gestures and animations.

## Parent build checkpoint

`python3 harmony/entry/src/main/cpp/backend/verify-objects.py` compiles the actual
backend against staged Valdi/dependency headers and installed SDK 26, with
C++20 and `-Wall -Wextra -Werror`, for `x86_64-linux-ohos` and
`aarch64-linux-ohos`. Both passed; all 87 imported ArkUI/Drawing C symbols are
exported by both SDK target libraries. The verifier now explicitly requires
the real component-event accessor used by the release-speed decoder.
Production scroll geometry/motion/lifecycle helpers and the existing
gesture/deadline/animation helpers passed host execution.

The November 2, 2026 round-two review fixes were verified with:

```sh
python3 harmony/entry/src/main/cpp/backend/verify-objects.py \
  --output /tmp/valdi-scroll-round2-objects
```

Both objects compiled against the actual staged runtime/dependency headers;
both SDK symbol checks passed (87 imports each). Host execution also passed
the production journal regressions in `tests/scroll-state.cpp`:

- Content growth during drag start, geometry sync with a queued release,
  retained correction, and retained animated command.
- Posted release correction overtaken by a new drag; stale task cannot hide
  later ends or erase a newer correction.
- Consumed release followed by cancellation or another drag while the tree
  lock is unavailable; lifecycle order and original payloads survive,
  obsolete samples drop, adjacent current samples still coalesce.
- Actual command supersession, synchronous callback replacement, ignored
  obsolete/cancel return targets, and generation-specific end suppression.
- Animation A's historical end after B starts, followed by an immediate ref
  jump to the unchanged published offset before B's first frame and after
  a frame sample; the newer flag remains set until the ref command cancels B.
  The same ordering also covers an immediate ref jump or animation C from
  inside the historical callback, without restoring obsolete animation state.
- `onDragEnding` grows content at the unchanged offset and returns a target
  beyond the old extent. Attempts before layout, including another intervening
  geometry revision, retain the target; matching layout consumes it once.
  A new drag while waiting still invalidates the old target.

Negative checks against temporary copies of the production helper confirmed
that unconditional runtime finishing and consumption before matching layout
each fail the corresponding new regression. These are host execution of the
production journal/routing/layout guard, plus real-header backend object and
SDK import verification; they do not execute a linked ViewNode/ArkUI runtime.

Objects: `/tmp/valdi-scroll-round2-objects/ArkUIViewManager-x86_64.o` and
`/tmp/valdi-scroll-round2-objects/ArkUIViewManager-arm64.o`.
No upstream, fixture, host, image/input source, HAP, device, full Hvigor, remote
command, or commit is part of this backend review-fix phase.

Parent reported initial HAP live QA on November 2: actual ScrollView viewport
260 VP, row 0 tap delivered to JS, drag reached offset 166 with one start/end,
and the native tree culled to rows 2–6. That HAP predates these review fixes
and the parent's grow-on-drag/Snap100 fixtures; it does not validate the final
backend. Parent owns the final HAP rebuild/link and actual
`ScrollPage.tsx` execution (260-point viewport, 24-to-40 items, horizontal
180x240 items, toggles/ref jumps/events/child taps/culling), plus runtime
verification of nested arbitration, lifecycle and RTL behavior.
Parent's HAP2 includes the earlier fixes and parent resource/SQL work but also
predates these two round-two fixes. It does not validate this checkpoint.
