# Harmony native routes

The existing shared HomePage opens its declared `picker` route through the
existing generated NavigationHost. Harmony now creates real ArkUI controls for
that route. No business TypeScript, generated ABI, NAPI entry point, ArkTS shell,
backend, fork or AppUI implementation change is required.

`HarmonyNativeScreens` is owned by each navigator. Its factory map is keyed by
`RouteEntry.nativeName`, with `picker` registered by default. Route names need
not equal native names. An absent or unknown native name still throws when
opened; it does not create a replacement Valdi page or synthesize a selection.
Only push presentation is implemented in this change. Sheet ownership remains
separate future work.

The picker displays its declared title, a back button, and five fruit rows:
苹果、香蕉、橙子、葡萄、西瓜. Selection finishes with the dictionary
`{value: fruit}`; back cancels through the existing result dispatcher. The
additional native buttons push `detail` with `{id: 100, from: '原生页'}`, switch
to `wheels`, and show a modal followed by a confirmation/cancellation toast.
These match the current Android NativeScreens and iOS PickerScreen examples.

## Ownership, geometry and queues

A native Page owns its native surface and identity instead of a Valdi tree.
Its presentation root is created by the selected backend's public
`createRootView()`. The existing mount, park, root animation, resize, pop, tab
and teardown paths operate on that root. A covered picker keeps its controls,
identity and pending result, and reappears as the same page when detail closes.
Valdi tree operations remain guarded by the presence of a tree. A failed push
mount removes the failed page and restores the preceding committed page.

The backend CUSTOM root's receiver measures backend-owned children only.
`HarmonyNativeRouteSurface` therefore adds a custom event receiver and uses the
root node's separate `setUserData` slot. It first verifies that slot is empty.
Both selected public backend implementations use custom-event registration
userdata for their own Node; this adapter never replaces that userdata or their
measure/layout registrations.

On measure, the adapter copies the incoming physical-pixel constraint and
sets the native subtree's min/max/percent-reference dimensions to the page
viewport. Dimensions use the same rounded page points times display scale as
the backend frame. It calls `measureNode` on its Scroll subtree; on layout it
calls `layoutNode` on that subtree. It does not set the backend root's measured
size or layout position. A parent can consequently offer more space than the
page uses without stretching the native content beyond its root. The Scroll
contains the native column, title, back and action/fruit buttons, and applies
the existing page safe-area/tab insets.

Native actions capture weak exact Page ownership. They check the committed
front page, mounted page, visibility, activity, transition state and retirement
before admission and again when the queued UI command runs. An atomic identity
epoch also invalidates a click already queued before cover/background/reentry.
Exiting, invisible, stale and duplicate callbacks cannot act on another page.
Native controls remain allocated across cover/uncover.

RuntimeHost injects a weak provider for its existing HarmonyAppUIHost and its
actual JS dispatch queue. The provider calls public `hostValue()` and the
generated `CppMarshaller` on JS to obtain the generated AppUIHost reference.
Native modal/toast requests use the real generated DTOs and Future interface.
AppUI's pending map is never accessed on UI. The Future continuation schedules
the reply back to JS and checks the exact native identity epoch before
submitting the toast. Cover, background, close or replacement suppresses that
late toast, including after the picker becomes visible again. Errors do not
produce a toast. There is no additional NativeApp runtime or global AppUI.

Removal retires identity and native actions before unmount can reenter.
Surface retirement unregisters its controls/receiver, clears its root userdata
and detaches its native subtree. Actual control disposal and final backend-root
release are deferred through the existing UI dispatcher. Callback depth prevents
a reentrant dispatcher drain from disposing userdata or roots while the current
SDK receiver stack is still executing. Controls are disposed before the retained
backend root is released. Existing result delivery and JS context destruction
fences retain their order. RuntimeHost's development lease remains its first
private member with no early release.

## Validation and reproducibility

Fast source ownership fences are supplementary checks:

```sh
node --test scripts/harmony/tests/native-route.test.mjs
```

Reserve the single native compilation slot before running either probe. The
probe rejects a concurrent native compiler/build process before every command.
Commands run serially, with at most one compiler. Output directories must be new.

```sh
python3 -B scripts/harmony/tests/native-route-probe.py \
  /tmp/native-route-sdk-new --sdk

python3 -B scripts/harmony/tests/native-route-probe.py \
  /tmp/native-route-host-new --host
```

The SDK probe uses the installed SDK26 toolchain and fresh real application
CMake configurations. It compiles HarmonyNativeRouteSurface, HarmonyNativeScreens,
HarmonyNavigator and HarmonyRuntimeHost for x86_64 and arm64-v8a under the real
default legacy/OFF and paired fork/ON selections. It compiles actual
`IJavaScriptContext`/`JSValueRef` header assertions for 616 bytes and the 96-byte
three-reference map transport fields. It never invokes the app/runtime build or
link targets. Existing `.cxx` commands/objects are not inputs. The current local
SDK/fork/external/proto/websocket roots are explicit in the probe and every
recorded configure command.

The host probe uses the source list and compiler flags from the reviewed
`/tmp/valdi-appui-media-p2-20261103/native-green/receipt.json` as a recipe. It
recompiles the bounded core/generated-data support subset against the current
actual headers. It does not link the old AppUI-run archive or a full runtime.
Subsequent runs can reuse that probe's support archive only after verifying its
recorded source/flag recipe, every consumed dependency hash and archive hash:

```sh
python3 -B scripts/harmony/tests/native-route-probe.py \
  /tmp/native-route-host-next --host \
  --support-from /tmp/native-route-host-new
```

`native-route-native.cpp` directly executes the real new helpers with actual
SDK declarations and an explicit in-process ArkUI function-table boundary. It
tests parent-triggered native measure/layout, a page smaller than its parent,
resizing, occupied userdata rejection, unknown factory names, every allocation
and insertion failure, receiver preservation, callback-stack reentry, duplicate
retirement and final root ownership. Its typed AppUI provider marshals and
unmarshals the actual generated interface, uses real DTOs/Futures, completes on
another thread, and checks JS-only submission, confirm/cancel/error replies,
cover/uncover epoch invalidation and close/reentry.

`native-route-extract.py` extracts production Navigator methods and Page,
Transition and Result definitions. Its metadata lists the adapted runtime,
tree, backend, animator and dispatcher boundaries; the navigation algorithm is
not duplicated. Generated DTOs, Value containers, result callback functions and
marshalling are real. `native-route-navigator.inc` exercises nativeName lookup,
unknown-name failure, fruit/back/result-once, native→detail→same-native
retention, foreground/background, stale queued and retired callbacks, tab
switches, root transitions, interactive back preview/cancel/commit with native
incoming and outgoing roots, covered sizing, allocation/mount failure and close
fences. Runtime creation and ArkUI rendering remain explicit substitutes.

Negative controls use the same executable tests with the historical Navigator
method bodies, a source copy lacking `measureNode`, and a source copy lacking
the reply-to-toast identity check. Each must fail at its behavior assertion.
All originals, failed attempts and negative source copies are retained in the
evidence directory. Receipts record commands, logs, inputs, dependencies,
objects/binaries and SHA256 maps.

The November 3 evidence is frozen under
`/tmp/valdi-native-route-20261103/freeze-receipt.json`. The reviewed media14
source hashes remain exactly equal to the receipt whose SHA256 is
`360a1133a3a223fe41df53a5183b8e41fa8d8f2009e974d23200cdaa2384fb56`.
Concurrent parent JS overlay/test-registration work and wheel source work are
outside this implementation's proof. SDK object compilation consumes selected
backend public headers, not the evolving wheel/backend implementation bodies.

This proves production helper behavior, extracted Navigator behavior and real
SDK object compatibility. It does not establish ArkUI on-device rendering,
full-runtime linking, integrated ArkTS/package acceptance, HAP identity or
physical interaction. No device, generator, pin, commit, remote operation,
sibling write or full application link is performed here.

The parent must register the new source fences in its own test entry point,
replace the historical whole-host body hashes in
`scripts/harmony/tests/fork-ui-assets.test.mjs` with meaningful invariants for
the authorized host delta, and integrate the later wheel/sheet work before a
fresh package/runtime acceptance pass. Historical receipts remain unchanged.
The native slot is released only by the implementation handoff, after the
final process scan and freeze.
