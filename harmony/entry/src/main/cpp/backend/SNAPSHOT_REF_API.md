# Native snapshots, opaque references, and touch-stop

This phase implements the pinned Valdi transaction/ref contracts in the ArkUI
backend. It adds no TS module, generic native method dispatcher, video surface,
or view-raster bitmap factory.

## Worker admission

`ArkUIConfiguration` has this optional callback:

```cpp
std::function<bool(DispatchFunction)> dispatchWorker;
```

The backend calls admission on UI. `true` admits one execution on an existing
per-runtime worker; `false` rejects without retaining/executing the function.
Never execute inline/on UI. Missing admission explicitly fails a snapshot,
including for standalone consumers. No backend-owned worker is created.
Parent owns the weak runtime holder, shutdown admission flag and queue wiring.

Success/encoding errors may complete on the worker. Capture/admission errors,
detach, logical-node changes, suspension and shutdown complete on UI. Completion
is claimed once under a gate, then invoked without that lock. A success already
claimed before shutdown may finish its in-flight callback; otherwise lifecycle
cancellation wins and the worker cannot publish again. Completions must be
thread-safe, as the official asynchronous transaction callback is.

Root mounting revalidates the source immediately after detach, whose C++
snapshot completion can synchronously shut down the manager. Native-parent
mounting also retains and revalidates a backend-owned target and checks its
insertion index again. External host-owned parent handles remain borrowed;
their caller must keep them alive through the mount call.

Worker closures capture only the request and UI thread identity, not a Node,
Backend, runtime, or UI dispatcher. Queued cancellation releases owning PixelMap
and callback captures immediately. Running encoding retains its local PixelMap
until the SDK call returns. No encoder work posts to UI after shutdown.

## Ordinary-node PNG snapshots

`snapshotView` captures the actual outer custom wrapper with
`OH_ArkUI_GetNodeSnapshot` on UI, requesting scale 1, sRGB and SDR. It requires
active attachment and positive native measured dimensions; the SDK additionally
rejects unrendered nodes. It reconstructs no content.

The validated owning PixelMap is encoded on the worker with
`OH_ImagePackerNative_PackToDataFromPixelmap`, MIME `image/png`. Returned
`BytesView` owns its backing `Bytes`. The pinned runtime already maps nonempty
success to base64 for `takeSnapshot()` and errors/empty results to `undefined`.
There is no data-URL prefix.

Bounds:

- At most 4096 pixels per dimension and 4 megapixels.
- RGBA/BGRA 8888; validated stride/allocation, at most 16 MiB captured data.
- One output buffer capped at 16 MiB, with no retry/growth loop.
- Two outstanding jobs per backend. Canceled queued/running jobs count until
  they unwind, including cancellation followed by immediate resume.

SDK encoding may use internal workspace beyond caller-owned buffers. All owning
out-pointers are released on errors. A running SDK encode is not interruptible;
it may finish after cancellation but cannot publish stale results. Video,
protected surfaces, offscreen/full-content capture are outside this contract.

Link `image_packer` in addition to `ace_ndk.z`, `native_drawing`, and `pixelmap`.
This directory owns the standalone target; parent owns the app target.

## Opaque references

`createViewNodeWrapper(node, false)` implements synchronous `getNativeNode()`;
`true` implements deprecated `getNativeView()` and `onViewChange`. Both return
an opaque `ValdiObject` (`ArkUIViewNodeRef`), retaining the logical ViewNode and
distinguishing the legacy platform-reference bit as pinned standalone does.
Creation runs under the runtime tree lock without touching ArkUI/dispatching UI.

C++ consumers use `opaque.getTypedRef<ArkUIViewNodeRef>()`. UI-only `getView()`
returns `Result<Ref<View>>`, resolves the current backing view under an immediate
tree-lock attempt, verifies tree/backend ownership, then calls
`ViewNode::getViewAndDisablePooling()`. Expired/detached logical tree or destroyed
backend returns null; a busy tree or wrong backend returns an error.
Tokens never cache native pointers. A backing view can change/disappear while a
logical reference remains alive.

No numeric handle crosses JS and no `callMethod` is invented. Existing UI-only
`nativeNode()` is borrowed: never independently dispose/reparent it.
`ElementRef.setAttribute()` keeps its existing runtime/scroll-spec path.

## Direct loaded-image filters

The backend registers a no-cache preprocessor on the official `srcOnLoad`
composite after `bindAssetAttributes(ImageHarmony)`. The pinned applier populates
this tuple from already processed `src`, callback, RTL and typed filter parts.
URL/resource assets retain the worker loader path. Direct `LoadedAsset` plus a
nonidentity matrix or nonzero blur explicitly fails preprocessing. Null/empty/
identity filters remain valid. No mutable ViewNode attributes are read from UI,
and no asset source or worker code is duplicated in the backend.

## stopScrollingOnTouch

The existing boolean prop is bound with default/reset false. Native DOWN in the
already registered `NODE_ON_TOUCH_INTERCEPT` handler invokes touch-stop before
optional JS hit testing/raw callbacks. It samples the actual offset, cancels
inertial/pending animation via the existing journal/controller, then rechecks
lifetime after runtime callbacks. It does not consume the DOWN, cancel descendant
raw touches, or replace an admitted drag. No extra recognizer is installed.

## Validation boundary

`verify-objects.py` compiles the actual backend and real-header native-ref
consumer for both SDK ABIs, checks relocatable consumer/asset/parser closure,
SDK exports, and real `--no-undefined` import probes including the PNG packer.
Host ASan/UBSan executes production snapshot bounds/gate and scroll journal for
queued/running cancellation, terminal races, callback reentry, resource release,
and touch-stop correction invalidation.

The mount reentry regression extracts the production mount/detach/dispose/
shutdown and snapshot-cancellation bodies and executes them with installed SDK
declarations, adapted ownership types, inactive subsystems, and native API
boundaries. ASan/UBSan covers shutdown in each of the three mount entry points,
target disposal, target index changes, and normal mounting. Removing the
post-detach guards must reproduce every reentry failure.

These checks do not execute Harmony rendering. Parent builds after source
freeze, visually confirms labels/runs/buttons, repeats custom-tab root
replacement, and exercises PNG bytes/refs/touch-stop on that artifact.
