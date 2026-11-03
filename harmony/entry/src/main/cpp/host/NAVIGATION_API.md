# Harmony routing integration contract

## Full viewport / typed shell API (2026-11-02)

`setInsets(handle, {top, bottom, left, right, tabBarHeight})` takes finite,
nonnegative logical vp. The four edges are system/cutout/navigation indicator
obstructions. `tabBarHeight` is the official bar's explicitly rendered control
height excluding the system bottom (48vp; zero while hidden for the keyboard).
Custom mode always ignores `tabBarHeight`; it receives system-only page insets.
`resize(handle, width, height)` always receives the complete content viewport,
including the area behind the tab overlay. Every retained/incoming/retiring
page tree has these dimensions; showing/hiding tabs never resizes the roots.
Default tab children receive `bottom + tabBarHeight`; custom tab children and
ordinary pages receive `bottom`.
The other edges are propagated unchanged. Inset updates refresh every live
view model, including transition roots, without settling native animations.

The shell's keyboard avoidance reduces the content viewport. The shell must
report bottom system obstruction zero while that bottom edge is lifted above
the keyboard and set `tabBarHeight: 0`; keyboard height remains separately
reported through `keyboardHeightChanged` for ApplicationBridge observers.
Insets do not add the keyboard height again.

`watchNavigation(handle, callback)` now emits `NavigationState` objects,
with the same field names described below, recursively converted through
NAPI; ArkTS must consume the object directly. See
`../types/libvaldi_harmony/index.d.ts` and the root `docs/typed-routing-contract.md`
for the exact signatures and shared model fields. AppUI's separate string
protocol is unchanged.

## Official and business custom tab modes

The shared generated `RouteTabBar` appends optional `mode` and `component`.
Omitted mode and `mode: 'default'` use real ArkUI `Tabs` / `TabContent` with
`BottomTabBarStyle.of(icon, text)`, `barOverlap(true)` and
`barBackgroundBlurStyle`. Unknown modes fail validation; custom mode requires a
canonical compiled business component path. Default mode rejects a component.
Public `tabs.bar` normalization belongs to the shared route compiler.

ArkTS registers actual per-tab page surfaces using:

```ts
registerTabSurface(handle: number, shellId: string, route: string, content: NodeContent): void;
registerTabBarSurface(handle: number, content: NodeContent): void;
```

Each real `TabContent` holds its own `ContentSlot`. The selected page's native
root is mounted in that slot in steady state. Previously selected roots,
contexts and business state remain retained in their tab surfaces. Pages are
created lazily when selected, rather than mounting every business page during
shell creation. `HarmonyNavigator` remains the selected-route owner.
`onContentWillChange` asks native to switch first and admits the ArkUI selection
only if native selected that route. ArkTS stores no second selected index;
the `Tabs` index is derived from the native snapshot. The container and its
children are keyed by native shell generation, and callbacks from old containers
cannot select a replacement shell.

During push/back, the existing native animator temporarily reparents the
participating roots into the page transition surface. Completion/cancellation
returns retained tab roots to their actual `TabContent` NodeContents. Outgoing
bar visibility persists until settlement; the official container stays above
the animation only while its bar is visible. Its page region passes through
to that surface, while the explicit official-bar bounds use
`HitTestMode.BLOCK_HIERARCHY` to consume bar touches. Covered containers are
hidden. This uses the existing root tweens, interactive-back/result ownership,
and teardown fences; no empty decorative Tabs replaces the actual page container.

The rendered official bar explicitly sets
`barHeight(48 + systemBottom)` and `BottomTabBarStyle.padding({bottom: systemBottom})`,
with default Tabs bottom expansion disabled. This reserves exactly the same
48vp control area that native adds to tab-child insets, plus the separately
reported system bottom. Keyboard presence sets both to zero. Bar visibility
changes do not change the full page viewport or the retained page's inset contract.

Custom mode creates the declared business Valdi component using the same runtime,
view-manager context and generated marshallers as the pages. Each shell owns
its own tab-bar tree/context until that shell is removed. Its generated
`TabBarViewModel` is `{items: RouteTab[], selectedRoute: string, safeAreaBottom: number}`;
`TabBarContext` supplies `selectTab(route: string): void`. The native callback
carries the shell ID: a callback from a retired/reloaded shell is inert. A valid
callback returns to that specific retained shell, selects its retained tab, and
drops covered stack entries. The host refreshes selection and system safe area.

The custom surface is an absolute full-viewport ArkTS `ContentSlot`, not a
native preset bar. It uses full viewport layout specs, never measures custom
bar height, and never adds custom geometry to page insets. Business code owns
its visible bar height and any matching page padding. The wrapper uses
`HitTestMode.Transparent`; the custom native root is enabled once with
`ArkUIViewManager::setRootHitTestPassthrough(root, true)`, whose backend policy
persists for later descendants and preserves consuming child gestures.
Business root `hitTest` may gate its visible bar region; full-screen ancestors
should not consume gestures outside that region. These are source integration
contracts; device touch arbitration still requires runtime QA.

Every registered NodeContent receives a strong NAPI reference in the owning
`HarmonyRuntimeHost`. Environment reservations prevent another host from
reusing any live/destroying surface. References and reservations, including
retired shell surfaces, survive UI unmount and worker runtime teardown and are
released only with the existing destroy completion on UI. Duplicate
cross-tab/overlay registrations fail; stale shell registrations do not mutate
replacement shells. Retired surface references are intentionally kept until
host destruction, so repeated declaration reloads retain their small
NodeContent owners for that host lifetime.

## Interactive back (native host/backend boundary)

The host uses `ArkUIViewManager::setRootDragObserver(root, RootDragObserver)`
from [`../backend/GESTURE_API.md`](../backend/GESTURE_API.md). No navigation
gesture props or new business JS APIs are introduced. The navigator's internal
`beginInteractiveBack()`, `progressInteractiveBack(dx)` and
`endInteractiveBack(velocityX, canceled)` run synchronously on UI.
Admission requires an active, idle, mounted top page above the root, DOWN
within physical left 24vp, and rightward horizontal movement. The backend PAN
uses NORMAL arbitration; descendant admitted drag/pinch gestures retain priority.

Preview keeps the logical stack, outgoing context and result unchanged. It mounts
the retained incoming root underneath the outgoing root using indexed NodeContent
insertion, without detaching/reparenting the root that owns the active pointer.
Progress directly sets outgoing x = width * progress and incoming x =
−width/4 * (1 − progress). Preview does not change either visibility view model.
Thus canceled previews produce no unbalanced `onShow` effects.

Release commits at 35% distance, or at least 4% distance with forward velocity
of 700vp/s. A reverse velocity of −700vp/s cancels even after the distance gate;
native Cancelled always cancels. Velocity is considered fresh only within 120ms
of at least 0.5vp of actual movement, measured at native callbacks with a monotonic
clock. A 400ms hold at 18% therefore cancels by distance even if the recognizer
retains its earlier move velocity; a 400ms hold at 75% commits by distance.
There are no timers for this freshness check.
Release uses a native EaseInOut root tween from
the last finger pose to either endpoint, with duration proportional to remaining
distance and clamped to 80–240ms. Edge back always uses this horizontal reveal;
the route's chosen preset/duration still governs ordinary push/back animations.

Commit pops the logical stack and publishes incoming `onShow('navigation')`.
The outgoing page stays mounted and visible until native completion, then its
existing exactly-once back result is canceled and its context is retired.
Cancellation restores identity on the outgoing root and detaches the preview
root, leaving the original stack/context/result unchanged. Incoming tab-bar
visibility is deferred until completion so neither preview nor release resizes
the content under the pointer.

Any stack mutation, tab change, route reload, active-state change or destruction
cancels an uncommitted preview back to the original page before proceeding.
Any content resize also cancels an interactive preview, including height-only
changes. A release that already committed instead settles to its destination,
then proceeds with the mutation. Generation invalidation precedes native cancel,
observer disposal and unmount, including synchronous/reentrant terminal callbacks.

ArkTS `Index.ets` uses the observer's `interactiveBackEnabled` to disable the
window system's edge-back hot zone while custom navigation can handle it.
The local SDK26 `@ohos.window.d.ts` defines `setGestureBackEnabled(boolean)` and
`isGestureBackEnabled()`. `Index` captures the original value and serializes
disable/restore writes across transitions. Reaching the root, page backgrounding
and cleanup restore that value, including a pending late disable. Hardware
`onBackPress()` continues through the existing native `back()` method.

Each admitted sequence emits `HARMONY_INTERACTIVE_BACK` JSON at INFO under the
`ValdiHarmony` tag, once at `phase:"start"` and once after settlement at
`phase:"end"`. It records a transition `id`, actual `inputEvents`,
`progress`/`maxProgress`, monotonic `elapsedMs` and at most eight `nativeSamples`
containing actual pan `dx`/`dy`, progress and the root X poses written for that
event. Samples are collected at admission, at roughly 10% progress increments
and at the terminal input; once full, only the last slot is replaced. The end
record adds `committed`, `canceled`, `nativeCanceled`, `reason`, effective
`velocityX`, `reportedVelocityX` and `releaseIdleMs`. Interrupted previews log
`reason:"interrupted"` and cancel. Native root animator diagnostics continue
separately as `HARMONY_ANIMATION`; neither stream synthesizes gesture input or
logs every motion frame.

`HarmonyRuntimeHost` exposes these UI-thread-only methods:

```cpp
bool back(); // consumes a pop, or settles a still-running final pop
void selectTab(const std::string& route);
void setInsets(NavigationInsets insets);
Valdi::Value navigationState() const;
void setNavigationObserver(std::function<void(const Valdi::Value&)> observer);
```

The observer receives an immediate snapshot on registration and then a snapshot
after commands, animation completion, lifecycle changes, and errors. It is
cleared by `unmount()`.
Snapshot object (the literal below documents fields, not a string transport):

```json
{"tabs":[],"selectedTab":"","tabShellId":"","tabBarMode":"default","overlayVisible":false,"tabBarVisible":false,"canGoBack":false,"transitioning":false,"interactiveBackEnabled":false,"interactive":false,"progress":0,"statusBarStyle":"auto"}
```

`tabs` contains the generated declaration's
`{route,text,icon,selectedIcon,iconData?,selectedIconData?}`.
`tabShellId` identifies the presented/retained native shell generation;
`tabBarMode` is `default` or `custom`. `overlayVisible` means the native page
surface contains the current page or a transition; otherwise the real selected
`TabContent` contains it. During transitions between tab shells, the presented
shell and selection stay with the outgoing bar until settlement.
Failures add an actionable `error` string; the next successful command clears it.
`transitioning` means two roots are attached for a native transition.
`interactive` includes finger preview and its commit/cancel release tween.
`progress` is the last clamped finger displacement / captured width, emitted
from native pan events; release animation frames remain native and do not
update this field. Idle progress is zero. `interactiveBackEnabled` means the
active host has a back destination or a transition to settle; while a transition
is active, additional gestures are not admitted. ArkTS uses this capability
through the final exit so the system cannot intercept its edge mid-animation.
`canGoBack` also remains true during a final pop so a rapid second native back
settles that pop rather than leaving the ability mid-transition.
`tabBarVisible` normally means the front stack entry is the tabs shell. During
a transition it keeps the outgoing page's tab-bar visibility until completion,
then publishes the destination's visibility. Neither tab-bar mode ever
changes the page viewport dimensions.

ArkTS owns the tab surfaces and gives the host full content dimensions through
`resize()`, with system/overlay obstructions separately passed to `setInsets()`.
The shell supplies the normal overlay height even when an ordinary page hides
the tab bar; native adds it only for retained shell children. Keyboard avoidance
sets both official-bar height and bottom system obstruction to zero while resizing
the full content viewport. Selecting a tab uses the same semantics as JS `switchTab`:
return to the retained shell, remove covered pages, then show its retained page.
Height-only `resize()` updates all retained and both ordinary transitioning roots
without canceling their native timeline, including the retiring page already outside the
logical stack. Backend `Frame` writes do not cancel `RootTransform` or
`RootOpacity` tracks. Width changes settle first, then resize all retained pages.
`slideUp` keeps the height captured at transition start for its offscreen
endpoint and ends at identity even if the viewport height changes.

Startup installs a native ValueFunction-backed navigation host. Smoke exposes
it as `globalThis.__valdiRoutesNavigationHost` before calling
`harmony_smoke/src/app.start()`; business passes it through
`__harmonyBusinessBootstrap.navigation`, so authenticated startup can select
the root before publishing. The parent-owned bootstrap forwards the returned
typed declaration once to `updateRoutes`; `callModuleFunction` itself discards
its return. Later explicit publications use the same generated declaration.

All fixed route boundaries use the generated
`snap::valdi_modules::app_pages` models and official `CppMarshaller`:
`RouteDeclaration` (routes array), `ResolvedNavigation`, `PageViewModel`,
`PageInsets`, `PageContext`, `TabBarViewModel`, `TabBarContext` and `StackPage[]`. The navigator stores the typed
declaration, not a string or dynamically keyed route table. Params and results
are non-null native `ValueMap` dictionaries. They are recursively copied on the
emitting JS call before queuing UI; copied data admits only maps, arrays,
strings, finite numbers, booleans and null/undefined. Typed objects normalize
to owned maps before generated unmarshalling. Functions, proxies, opaque
objects and typed arrays are rejected. Depth is limited to 64 and a command
payload to 100000 value nodes, including repeated references. Results complete
with `{}`/`true` on cancellation or the dictionary/`false` on success.
`currentPages` returns a generated `StackPage[]` array, including structured
params; canceled getters return `[]`. There is no route JSON serialization,
parsing or config string. AppUI and native diagnostic JSON remain separate.

The entry CMake includes the canonical generated `app_pages.cpp` and include
root at `valdi/native/generated`, in addition to its `host/*.cpp` glob. The
generated source provides schema/marshaller definitions for both smoke and
business. One runtime/manager serves all per-page contexts/trees.

Supported presentation is `push` and the retained `$tabs` shell.
`sheet`, `compactSheet`, fullscreen covers and native routes are rejected.
Status-bar style is exposed for ArkTS to apply, rather than implemented as a
fake platform service.

| Animation option | Push | Single back / top-page finish |
| --- | --- | --- |
| omitted / `default` | `slideRight`, 300ms by default | Reverse the popped entry's preset and duration |
| `slideRight` | Incoming x: width → 0; retained outgoing x: 0 → −width/4 | Outgoing x: 0 → width; revealed incoming x: −width/4 → 0 |
| `slideUp` | Incoming y: height → 0 | Outgoing y: 0 → height |
| `fade` | Incoming opacity 0 → 1; outgoing opacity 1 → 0 | Crossfade to the revealed page |
| `zoom` | Incoming scale .92 → 1 and opacity 0 → 1 | Outgoing scale 1 → .92 and opacity 1 → 0 |
| `none` / `durationMs: 0` | Immediate | Immediate |

The resolved ABI always supplies animation, duration and presentation; the
public TypeScript resolver supplies default duration 300. `durationMs` is an
integer from 0 through 2000. `none`
remains immediate even with a nonzero explicit duration. Root creation without
an outgoing page and navigation while the app is inactive are immediate.
`replace` accepts and stores the preset for a subsequent back, but replaces
immediately. Reset, multi-pop, pop-to-root, declaration reload and tab switches
are immediate after settling any active transition.

`HarmonyNavigator` uses the shared backend's public
`ArkUIViewManager::tweenRoots()` API described in
[`../backend/ANIMATION_API.md`](../backend/ANIMATION_API.md).
It supplies two mounted/sized roots, explicit `RootVisualState` endpoints and
`NativeTweenOptions.duration` in seconds, using the default EaseInOut curve.
Intermediate frames and completion come from the native ArkUI animator; there
is no JavaScript timer or timeout-based completion.

Only one transition, including interactive preview, is active. The existing UI dispatcher serializes JS commands,
including commands submitted while already on UI. New push/back mutations
settle a committed transition to its logical destination, or cancel an
uncommitted interactive preview, then apply the new command; there is no
separate animation command backlog.
Thus a rapid back during push first finishes that push and then runs its reverse.
`currentPages()` observes the destination stack immediately, before visual
completion, and does not settle the tween. Duplicate finishes from an exiting
page cannot pop another entry or change its already-committed result.

Push appends the incoming root above the outgoing root. Completion restores
identity, detaches the outgoing root and retains its context/tree in the stack.
Back pops logically first, mounts the revealed root below the departing root
and retains the popped entry in the transition until native completion.
Only then does it complete the result and remove/destroy that entry.
`finishTransition(id)` clears its generation before calling the animator's
`cancel()` / `cancelRootAnimations()`, so synchronous cancellation callbacks and
late completions cannot finalize twice. It restores both root visual states to
identity before detaching. `settleTransition()` is used before destructive
mutations, width changes, app active/inactive changes and close.

Visibility follows `Page.ts` / `PageComponent.ts`. Incoming/revealed pages get
`onShow('navigation')` when attached for ordinary entry or when an interactive
preview commits. A retained outgoing page stays
visible through push, then receives `onHide('covered')` on completion. A popped
page stays visible through exit and goes directly to destruction: it receives
no extra hide event. Removed/replaced/reset pages likewise receive destruction
without a synthesized hide. Actual tab switches use `tab`; foreground/background
changes on the same retained tab use `foreground` / `background`.
There are no `back`, `removed` or `unmount` visibility reasons.

Results are completed once (including rejected opens and teardown cancellation)
on the runtime's JS queue. Removed contexts are destroyed after the result queue
fence, so removing a caller in the same multi-pop does not suppress its callback.
All admitted result/getter requests are tracked under the admission mutex,
independently of dispatcher batches, and are retired when their callback delivery
is scheduled. Close atomically stops admission, settles any committed finish
(preserving its typed result), and cancels every other admitted request before
returning to the host's worker teardown fence. This includes requests still in a
dispatcher's already-swapped local batch during a reentrant observer close.
Uncommitted interactive previews are canceled before pending results are closed.
Those commands later find their results completed and cannot enqueue a second
cancellation behind the fence. Late requests rejected on JS after close deliver
there directly; no synchronous JS invocation originates on UI.
Tab pages have their own context/tree and cannot close themselves independently
of their shell. Reloaded declarations preserve a valid existing root and selected
tab, cancel the old stack, and create new contexts from the new definitions.

Typed transport/inset validation on 2026-11-02 compiled all four translation
units (`HarmonyNavigator.cpp`, `HarmonyRuntimeHost.cpp`, `NapiModule.cpp` and
canonical generated `app_pages.cpp`) for OHOS x86_64 and aarch64 against the
existing x86_64 CMake compile database, with the aarch64 target substituted for
the second ABI and the canonical generated include directory added. The source
compile commands, staged Valdi headers and OHOS SDK/sysroot were otherwise
retained. Objects are `/tmp/{HarmonyNavigator,HarmonyRuntimeHost,NapiModule,app_pages}-typed-{x86_64,aarch64}.o`;
matching `.log` files record compiler output. The repeatable driver is
`/tmp/compile-harmony-typed-host.py`. The only compiler warning is the existing
unused `--gcc-toolchain` argument. These are individual object builds, not
final shared-library/HAP linking or device proof.

The parent integration pass owns ArkTS compilation, final linking/HAP and
runtime QA: nested typed params/results/currentPages; canceled and empty-success
results; authenticated startup and typed reload; system/cutout/navigation
indicator changes; keyboard show/hide with zero bottom/overlay obstruction;
retained tab insets; inset changes during push/back/interactive preview/release;
unchanged viewport dimensions when the overlay hides/shows; rapid mutations;
and reentrant observer teardown. Existing interactive-back gesture arbitration,
visibility and exactly-once result scenarios still apply.

The tab-mode source pass on 2026-11-02 compiled `HarmonyNavigator.cpp`,
`HarmonyRuntimeHost.cpp` and `NapiModule.cpp` as individual x86_64 and aarch64
OHOS objects against the canonical generated tab models and backend public
header. Driver: `/tmp/compile-harmony-tabs-host.py`; objects and logs:
`/tmp/{HarmonyNavigator,HarmonyRuntimeHost,NapiModule}-tabs-{x86_64,aarch64}.{o,log}`.
The only C++ diagnostic was the existing unused `--gcc-toolchain` argument.
`node /tmp/check-harmony-tabs-arkts.cjs` uses the installed SDK ets-loader
TypeScript compiler and ArkTS 1.1 linter directly: zero syntax/semantic/lint
errors, with the SDK native `.so` verification warning. This does not invoke
Hvigor, modulebuilder or HAP export, and does not establish final linking,
runtime bar layout or gesture arbitration. Parent QA must cover default/custom
route reloads, both custom heights, page touches outside the custom bar,
exclusive child/bar taps, retained tab state, keyboard/system-safe-area changes,
and all existing transition/result/lifecycle scenarios.
