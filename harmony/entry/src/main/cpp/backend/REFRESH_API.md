# Native controlled pull-to-refresh

This backend-only phase adds `ArkUIRefreshView` through the existing custom-view
escape hatch. It adds no generic tag or pinned ScrollView prop.

## Business contract

```tsx
<custom-view
  harmonyClass="ArkUIRefreshView"
  width="100%"
  height="100%"
  refreshing={this.state.refreshing}
  enabled={this.state.enabled}
  onRefresh={this.onRefresh}
>
  <scroll width="100%" height="100%" horizontal={false}>
    {/* Existing Valdi content; keep one direct vertical scroll child. */}
  </scroll>
</custom-view>
```

The pinned `valdi_tsx/src/JSX.ts` already accepts `custom-view` attributes.
`valdi_core/src/JSXBootstrap.ts::makeNodePrototype()` removes `harmonyClass`
and resolves it to the backend factory on platform 6. `ArkUIViewManager`
supports only the new class name `ArkUIRefreshView`; its hierarchy inherits
`view` attributes and existing Yoga layout/ref behavior. The custom binder adds:

| Attribute | Type | Default / reset | Behavior |
| --- | --- | --- | --- |
| `refreshing` | boolean | `false` | Controlled native spinner state while attached and active. |
| `enabled` | boolean | `true` | Allows native pull initiation; keeps child scrolling available. |
| `onRefresh` | `() => void` or absent | absent | Requests business refresh from a native pull; no event payload. |

The owner sets `refreshing=true` when it accepts a request and sets it to
`false` when finished. No business callback is emitted for programmatic
`refreshing=true`. The native engine can emit `ON_REFRESH` for that transition;
the adapter suppresses the echo using controlled state, native drag arming, and
setter suppression. Duplicate native notifications cannot repeat an accepted
pull request. A later independent native drag can request again.

Native state changes `Drag`/`OverDrag` arm pull requests. Keyboard/accessibility
quick-start transitions without those native pull states do not request
business refresh through this bounded API.

`onRefresh` uses the existing `ValueFunctionFlagsBoundedMainThreadSync` callback
path. An admitted callback may update attributes, move children, detach, suspend,
or destroy its context. No native access follows that callback on the event
stack. A generation-checked queued reconciliation applies the current controlled
state when business code leaves it false. Asynchronous acceptance can therefore
stop the provisional native spinner before the later true update.

There is no threshold attribute, custom header, offset event, or synthesized JS
pull translation. The SDK default refresh offset is 64vp; Refresh retains
default VP units. The custom Valdi wrappers retain physical PX measurement.
`enabled=false` maps to `NODE_REFRESH_PULL_TO_REFRESH=false`, disabling threshold
initiation and callbacks. It does not promise to suppress all native follow-drag
motion/settling, and it does not disable the child Scroll.

## Native topology and lifecycle

The native tree is:

```text
Valdi Refresh custom wrapper
  ARKUI_NODE_REFRESH
    existing Valdi scroll custom wrapper (one direct Valdi child)
      existing ARKUI_NODE_SCROLL
        existing exact-size custom content
          Valdi content children
```

There is one actual Scroll and one existing content node. The native Refresh
owns the spinner, translation, threshold, and gesture behavior. Only wrapper
measure/layout callbacks measure and place the inner Refresh. Native Refresh
measures/places its child wrapper; the normal Scroll code measures its content.
Use a finite viewport with the direct Scroll filling it.

Insertion rejects extra children, non-Scroll children, or a known horizontal
Scroll before detach and again after snapshot/runtime callback reentry. Scroll
specification rejects a detected later horizontal-axis change under Refresh.
Removing/transferring the direct child releases the native relationship and
disables Refresh initiation while empty. Ordinary transaction child ownership,
cycle/index checks, image/input attachment, snapshots, and overlay hit testing
remain in the same hierarchy.

The direct child uses the SDK's default `SELF_ONLY` nested-scroll options.
ArkUI's `NestableScrollContainer::SetNestedScroll()` excludes Refresh parent
discovery when an explicit parent mode such as `SELF_FIRST` is used.
`SearchParent()` traverses intermediate custom wrappers and negotiates linkage
with Refresh. Leaving Refresh restores this backend's existing `SELF_FIRST`
policy. No extra recognizer is installed. For content shorter than the viewport,
the existing `bouncesVerticalWithSmallContent` prop can enable native edge
response; acceptance and interaction still require OS replay.

Detach disables the native request threshold and controlled spinner while
invalidating queued work. Reattachment restores controlled attributes.
Suspension hides the spinner and suppresses requests while retaining the
business value; resume restores it. Logical-node replacement or clearing resets
the callback and defaults. Disposal unregisters both native events/receiver,
unlinks Refresh, and queues handle disposal with retained userdata until native
callback stacks unwind. Continue draining the existing UI dispatcher through
shutdown, as required by Scroll/gestures.

## Actual SDK closure and sources

Installed SDK: `26.0.0.865`, `native/sysroot/usr/include/arkui/native_node.h`.
The implementation uses `ArkUI_NativeNodeAPI_1`:

- `createNode(ARKUI_NODE_REFRESH)`, `addChild`, `insertChildAt`, `removeChild`,
  `disposeNode`, `setAttribute`, event registration/receiver APIs.
- `NODE_REFRESH_REFRESHING`: `ArkUI_AttributeItem.value[0].i32`, set/get only;
  reset is an explicit false write.
- `NODE_REFRESH_PULL_TO_REFRESH`: `value[0].i32`.
- `NODE_REFRESH_STATE_CHANGE`: component event `data[0].i32`, states 0..4.
- `NODE_REFRESH_ON_REFRESH`: component event without parameters.
- Existing `NODE_SCROLL_NESTED_SCROLL` with forward/backward i32 mode values.
- Existing native component-event accessors, wrapper measure/layout APIs,
  `NODE_CLIP` and `NODE_DIRECTION`.

No new native library is required; these are existing table entries and imports
from `ace_ndk.z`. `CMakeLists.txt` adds only the new backend sources.

Official source audit:

- [Refresh component behavior and one-child model](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkui/arkui-ts/ts-container-refresh.md)
- [Nested-scroll default](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkui/arkui-ts/ts-container-scrollable-common.md)
- [Native Refresh transition notifications](https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/core/components_ng/pattern/refresh/refresh_pattern.cpp)
- [Parent discovery and Refresh linkage](https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/core/components_ng/pattern/scrollable/nestable_scroll_container.cpp)

Installed headers determine API availability. The engine source above explains
the nested behavior and shared programmatic/pull notification; it is not a claim
that the installed device runs that exact repository revision.

## Validation boundary

`verify-objects.py` verifies both real SDK ABIs, preserves the previous 172
imports, checks real-header consumer/asset/parser closure and SDK
`--no-undefined` probes, and protects the input and NativeLabel exact hashes.

`tests/verify-refresh-native.py` mechanically extracts actual Refresh, insertion,
detach, disposal, suspension, shutdown and snapshot-cancellation production
bodies, using actual SDK declarations. Host ASan/UBSan executes the component
with adapted Valdi values, inactive Scroll subsystems, and a recording native
API boundary. Tests cover controlled pull, native programmatic echo, enabled,
reset/suspend/resume, callback shutdown with deferred disposal, snapshot remount
shutdown, transfer/nesting selection, horizontal rejection, one-child capacity,
snapshot reentry filling that capacity, and stale queued work after remount.
Direct child disposal hides an empty Refresh; child transfer invalidates old
queued reconciliation and request deduplication before the next pull.
Snapshot completion during child disposal cannot admit another pull request.
Guard-removal negative controls must reproduce programmatic echo, stale native
writes, extra children, omitted post-detach validation, and request admission
from a child already disposing.

The two reviewed axis update sites (`specs` and deferred `queueCommand`) share
one vertical-axis validator. A retry that acquires the tree lock rejects a
horizontal Refresh child before changing geometry, applying native properties,
or consuming/writing its pending offset command. Native property application
checks the same constraint. Disposing a Refresh parent restores a surviving
Scroll child's ordinary native nesting immediately after clearing its parent;
closing backends and children already disposing skip that restoration.

`tests/verify-refresh-scroll.py` additionally executes extracted production
`NativeScroll::specs`, queued lock retry, native properties, offset writer, and
Node disposal/root mounting, using production ScrollState and installed SDK
declarations. A controlled failed-lock sequence verifies the pending command
survives rejection without axis/native writes. A retained child begins with
recorded native SELF_ONLY, survives parent disposal, and mounts as a root with
recorded native SELF_FIRST. Immediate rejection, valid vertical offset writes,
and shutdown skipping are positive controls. Removing each reviewed guard must
reproduce its regression. Valdi tree/value types and native receivers are
adapted; these checks do not execute linked ViewNode locking or OS arbitration.

This does not execute native gesture arbitration, spinner rendering, release
physics, or a complete linked Valdi/ArkUI app. Parent owns the rebuilt HAP smoke
page, actual OS pull/release, Finish, enabled toggling, programmatic start,
child taps/scrolling, and lifecycle replay. No device acceptance is inferred
from compilation or the recording native boundary.
