# Harmony image assets

Public contract for parent registration and backend image attachment.

## Registration

Compile `assets/HarmonyImageAsset.cpp`, `assets/HarmonyImageDecoder.cpp` and
`assets/HarmonyImageAssetLoader.cpp`, plus `assets/HarmonyImageFilter.cpp` and
`assets/HarmonyImageDrawing.cpp`. The parent's existing
`file(GLOB ASSET_SOURCES CONFIGURE_DEPENDS .../assets/*.cpp)` discovers these
sources on its next configure/build; no CMake edit is required. Register
`Valdi::makeShared<ValdiHarmony::HarmonyImageAssetLoaderFactory>(workerQueue)`
with `AssetLoaderManager::registerAssetLoaderFactory`. The worker queue must be
non-null and outlive its queued work (the loader retains it). Prefer a serial
worker to bound concurrent decode memory.

Output is the staged official `snap::valdi_core::AssetOutputType::ImageHarmony`
(8). Existing values 0 through 7 are unchanged. The factory uses the provided
`IRemoteDownloader`; it does not resolve rawfiles or perform HTTP itself.
`AssetLoaderManager` adapts registered Bytes loaders for the requested scheme,
including `valdi-rawfile://<module>/<logical-name>`, data, HTTP(S), and file.

Link SDK 26 `libimage_source.so` and `libpixelmap.so` (CMake names
`image_source`, `pixelmap`). Native ArkUI presentation uses
`libace_ndk.z.so` (`ace_ndk.z`) for
`OH_ArkUI_DrawableDescriptor_CreateFromPixelMap` and
`OH_ArkUI_DrawableDescriptor_Dispose`; there is no separate drawable library
for these ArkUI functions. The parent owns CMake/registration.

## Backend presentation

Include `assets/HarmonyImageAsset.hpp`. A successful load is a
`Valdi::Ref<Valdi::LoadedAsset>` containing `ValdiHarmony::HarmonyImageAsset`.
Use `Valdi::castOrNull<HarmonyImageAsset>(asset)` (requires RTTI, as in the
current host), then retain a `Valdi::Ref<HarmonyImageAsset>` for the entire native
attachment lifetime.

* `getPixelmap()` returns a borrowed `OH_PixelmapNative*`. Never release,
  mutate, or transfer ownership of it.
* `getWidth()` / `getHeight()` are actual decoded pixel dimensions.
* `getInfo()` includes decoded and source dimensions, actual row stride,
  allocation byte count, SDK pixel format and alpha type.
* Create an ArkUI descriptor from the borrowed pixelmap on the UI thread.
  Pass that descriptor to `NODE_IMAGE_SRC` through `ArkUI_AttributeItem.object`.
  The backend owns the descriptor. Keep both descriptor and asset alive while
  the node uses them. On replacement/reset, detach/reset the node attribute,
  dispose its old descriptor, then release the old asset.
* The loader completion executes on the worker queue. Dispatch attachment to
  the UI thread. Check the view's current request generation after dispatch;
  cancellation cannot revoke a completion already delivered before cancel.
  Capture the asset strongly in the dispatch so stale results are safely freed.

The asset destroys its pixelmap exactly once with `OH_PixelmapNative_Destroy`
on destruction (including the SDK wrapper). Its metadata is a
Valdi map with `width`, `height`, `sourceWidth`, `sourceHeight`, `rowStride`,
`allocationBytes`, `pixelFormat`, `alphaType`. Optional `getBytesContent()`
returns owned **encoded source bytes**, not raw RGBA pixels; this is disabled
by default and returns an explicit error. Pass `true` as the factory's second
argument to retain source bytes. Use SDK pixelmap APIs for raw pixel access.

## Decode policy and cancellation

The implementation decodes frame zero into SDR RGBA8888 using SDK native image
source/pixelmap C APIs. It does not animate images.

### Typed filter integration (implementation contract)

`PinnedAssetAttributes` / `AssetAttributes::preprocessFilter` already turn the
TS filter array into a typed `Valdi::ImageFilter`. The loader accepts only that
typed object or null/undefined; it snapshots its composed matrix and blur radius
before the asynchronous download. It never reparses a TS array.

The new `HarmonyImageFilter.hpp` exposes `snapshotHarmonyImageFilter(Value)` and
`filterHarmonyImage(asset, spec, wasCanceled, encodedWorkingBytes)` for callers
that already have an immutable image. The loader invokes the latter after
decoding. It preserves source bytes and source dimensions and returns a new
pixelmap for an effective filter. Identity returns the original asset.

Identity dispatch uses the already-validated source dimensions, stride and
allocation to retain layout/combined-memory bounds, then returns that exact
asset before any Drawing metadata query, format/alpha restriction or
destination allocation. Unknown alpha metadata does not make an unfiltered
image fail. The decoder's original RGBA8888 format check, intrinsic dimensions,
stride/allocation checks and memory admission still run before this dispatch.
No decode bound is relaxed.

For an **effective** filter, unsupported SDK source/destination metadata fails
explicitly. The error includes the observed numeric `pixelFormat`, `alphaType`,
`width`, `height`, `rowStride` and `allocationBytes`, plus the expected format
and accepted alpha enum values. It contains no URLs, encoded bytes or pixels.
An unknown alpha value is not guessed to mean opaque or premultiplied.

The parent's r2 HAP (`a431156f064a87272c2f53d7c4b72e9288dd9c258b38076a99bfb3f12107d784`,
embedded x86_64 library `080bc53b13033cca801f319b4f17993673edef7b146d6d25eaf171a2fe47c8f9`)
logged the former rendering-metadata error even for plain packaged images.
Source tracing establishes that decoder format/layout checks had already
passed before the helper queried metadata and applied its extra alpha check.
The r2 log does not reveal the numeric alpha value. The r3 log confirms plain
image loading was restored and reports the default alpha getter returning zero
for effective input: `pixelFormat=3, alphaType=0, width=72, height=72,
rowStride=288, allocationBytes=20736`. The parent also reports correct plain PNG
transparency, direct A-to-B replacement, custom icons and PNG capture/re-decode
on r3. These do not establish effective-filter output or the current alpha mode.

#### Current alpha mode: official contract and native source

The [official PixelmapNative C API reference](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-image-kit/capi-pixelmap-native-h.md#oh_pixelmapimageinfo_getalphatype)
explicitly distinguishes **default alpha type** (`GetAlphaType`) from the
**image's current alpha mode** (`GetAlphaMode`). This is a semantic API
difference, not permission to treat a reported zero as premultiplied.
The checked immutable documentation revision is
[`2103b11b1219ba415c395a75584de393c728008a`](https://github.com/openharmony/docs/blob/2103b11b1219ba415c395a75584de393c728008a/zh-cn/application-dev/reference/apis-image-kit/capi-pixelmap-native-h.md#oh_pixelmapimageinfo_getalphatype),
raw Markdown lines 75 and 795; the `GetAlphaMode` entry follows its own anchor.
The installed SDK26 header
`multimedia/image_framework/image/pixelmap_native.h:636-647` declares
`OH_PixelmapImageInfo_GetAlphaMode` as an actual C API available since API 20.

The immutable public OH6 image-framework source
[`20a749b2bba0f78616ed7d6a0db12f3cbef64606`](https://github.com/openharmony/multimedia_image_framework/blob/20a749b2bba0f78616ed7d6a0db12f3cbef64606/frameworks/kits/js/common/pixelmap_ndk/pixelmap_native.cpp)
shows the matching field flow:

* `OH_Pixelmap_ImageInfo` contains distinct `alphaMode` and `alphaType` fields
  at lines 71-79.
* `OH_PixelmapNative_GetImageInfo`, lines 680-703, sets `alphaMode` from the
  underlying native pixelmap's current `GetAlphaType()`, at line 687.
* `OH_PixelmapImageInfo_GetAlphaMode`, lines 388-394, reads that populated
  `alphaMode`; `GetAlphaType`, lines 418-424, reads the separate default field.

`HarmonyImagePixelmapMetadata.hpp` now pairs `GetImageInfo` with `GetAlphaMode`
for the decoder and both effective-filter source/destination checks. The
asset's existing metadata key `alphaType` contains this **current mode enum**;
the key is retained for compatibility. No alpha enum is rewritten, no pixels
are changed, and no normalization or conversion is performed. Known-mode
validation remains: if the current mode itself is unknown, filtering fails
explicitly. Diagnostics identify `alphaAccessor=GetAlphaMode`, so a future
unknown-mode failure is distinguishable from r3's default-field observation.

The Drawing binding is independently backed by
[`graphic_graphic_2d` at `0fa4396a14a9717472a45ca45f184338760f720a`](https://github.com/openharmony/graphic_graphic_2d/tree/0fa4396a14a9717472a45ca45f184338760f720a/rosen/modules/2d_graphics/drawing_ndk):
`src/drawing_pixel_map.cpp:25-28` registers the native object;
`drawing_utils/native_pixel_map_manager.cpp:59-74` unwraps its underlying
`Media::PixelMap`. `src/drawing_canvas.cpp:140-159,522-540` passes that pixelmap
to native rendering, and `drawing_utils/drawing_canvas_utils.cpp:178-190`
builds destination Drawing info from the underlying image info's alpha type.
The source draw path at lines 84-104 extracts its native Drawing image from
that same pixelmap. It does not use our separately allocated C info object.
This explains why the r3 default-getter value alone cannot classify the native
pixels as having unknown alpha.

The official API contract and installed declarations justify the accessor
selection. Public OH6 implementation source is **not a source/build mapping
to proprietary SDK26 vendor OS binaries**. Current-mode values and effective
native filter output on that OS remain parent runtime validation.

The parent built both HAPs from the frozen paired-getter implementation:
`smoke-native-r4.hap` SHA256
`3e219e32b4f2400fdc3f51855686930cdb1bcfd821bc8fe8aa16bb13499cae95`
and `business-native-r1.hap` SHA256
`170b28e673937af2784f5351bbb2b1ef55eca1343a06d736d2f8e312e273efc5`.
Both embed x86_64 `libvaldi_harmony.so` SHA256
`b8af4a6d2ff641658df65db48638bf7ac0c3e86f64b0afd209d00c8af11c68e7`;
these hashes were independently checked without building or modifying a HAP.

The native graph is ColorFilter matrix -> ImageFilter color node ->
ImageFilter Gaussian blur with CLAMP edges and an original-size crop -> CPU
DrawingCanvas bound to a fresh RGBA8888, premultiplied, non-editable pixelmap.
The original pixelmap is only a drawing source. All 20 matrix coefficients,
including RGB and alpha offsets, pass through unchanged in normalized channel
units. There is no multiplication of offsets by 255.
`getBlurRadius()` is passed as sigma in **decoded image pixels**, matching the
pinned iOS `CIGaussianBlur.inputRadius` path: no Android mask-radius conversion,
no VP/density multiplication, and no additional scaling when preferred-size
decoding downsamples. This preserves iOS's matrix-then-blur order regardless
of TS operation order, already collapsed by the runtime preprocessor.
Existing view tint is separate and is not baked into the image.

**Direct `LoadedAsset` sources bypass `AssetLoader::loadAsset`.** This change
does not make their `filter` attribute work automatically. A backend/runtime
integration must explicitly invoke the helper (on its worker and with its own
request-generation guard), or reject that combination. No claim of direct-asset
filter support is made here; that integration is outside `assets/**` ownership.

Link `native_drawing` in addition to the existing `image_source` and `pixelmap`.
No new library is needed beyond those already linked by the parent.

#### Matrix source provenance and validation boundary

The normalized float-matrix contract was checked against immutable **public
OpenHarmony 6 release source**:

* `openharmony/graphic_graphic_2d` at
  `0fa4396a14a9717472a45ca45f184338760f720a`, under
  `rosen/modules/2d_graphics/`:
  `drawing_ndk/src/drawing_color_filter.cpp:64-77` forwards the original array
  through `ColorFilter::CreateFloatColorFilter`.
  `src/drawing/effect/color_filter.cpp:42-45,136-138` forwards it to
  `InitWithColorFloat`; `src/drawing/engine_adapter/skia_adapter/skia_color_filter.cpp:55-58`
  forwards it unchanged to `SkColorFilters::Matrix`.
* `openharmony/third_party_skia` at
  `87bbdb4ef0223c0a8d913568fd0a717e8e617ff5`:
  `m133/src/effects/colorfilters/SkMatrixColorFilter.cpp:35-37,70-95,111-116`
  copies all 20 coefficients without rescaling and appends the matrix and clamp
  stages. `m133/src/opts/SkRasterPipeline_opts.h:3368-3376` adds the offsets
  directly; its clamp stages at `2373-2379` operate on normalized [0,1] channels.
* The pinned local Valdi renderer,
  `.tools/harmony/upstream/snap_drawing/src/snap_drawing/cpp/Layers/ImageLayer.cpp:103`,
  also passes `filter->getColorMatrix()` directly to `SkColorFilters::Matrix`.

For the normalized affine contract, invert maps `0.2` to `0.8`, adding `0.25`
to `0.2` produces `0.45`, and alpha `0.5 * 0.5 + 0.125` produces `0.375`.
Host regressions check these semantics plus exact forwarding of every matrix
entry into the production SDK-typed C seam. They do not rasterize native pixels.

These public source commits are **not a demonstrated source/build mapping to
the proprietary SDK26 vendor OS**. Installed SDK26 headers and strict links
prove ABI/import compatibility only. Actual inversion, grayscale and blur
output, alpha/color-space behavior and iOS pixel parity remain live parent QA.
The parent owns the packaged none/invert/grayscale/invert+blur smoke fixture;
no device-output result is claimed by this assets implementation.

The policy rejects negative/nonfinite blur, sigma above 128, and nonfinite or
absolute matrix coefficients above 1,000,000, with an explicit load error.
Identity snapshots share the source without allocating a destination.
Effective filters allocate a fresh shared-memory pixelmap and publish it only
after synchronous CPU rendering, canvas destruction and a final cancellation
check. Output dimensions stay equal to the decoded source; source dimensions
and optionally retained encoded source bytes are preserved.

### Combined working-set admission

`HarmonyImageFilterPolicy.hpp` limits each operation's modeled peak to 128 MiB.
Decode admission charges both encoded buffers, two full intrinsic RGBA codec
surfaces, and the decoded output; this check runs before pixelmap decoding, even
when preferred sizing requests a small thumbnail. The codec source is released
before starting native filtering.

Filter admission charges the encoded working bytes, actual source allocation,
destination allocation, a possible Drawing source copy, and three padded
work surfaces for matrix output / two-pass Gaussian blur. Padding is
`ceil(3 * sigma)` on each side, with rows rounded up to 256 bytes. Matrix-only
processing reserves one matrix intermediate. Destination allocation is checked
again using the SDK's actual stride/allocation before drawing. This prevents
independently admitting several 64 MiB allocations. It intentionally rejects
some images accepted by the earlier single-pixelmap policy.

This is a conservative **per-operation admission model**, not an SDK allocator
quota or a process-wide limit. SDK-private codec/Drawing caches and scratch
allocation maxima are not exposed by these C APIs. A serial worker avoids
overlapping operation workspaces; queued encoded buffers and already displayed
assets remain separately owned. A hard process RSS guarantee would require
allocator/process isolation beyond this assets implementation.

Zero preferred dimensions mean unspecified. Both zero preserve intrinsic
dimensions; one zero derives the other dimension from source aspect ratio.
Two positive dimensions fit within the requested box without upscaling.
Invalid/oversized source images fail before decoding; preferred sizing cannot
bypass the source budget. Encoded bytes, source dimensions, target dimensions,
row stride and decoded allocation are bounded; see `HarmonyImageDecodePolicy.hpp`
for exact limits. SDK decoding itself is synchronous and cannot be interrupted:
cancel propagates to the downloader and prevents pending/late completion,
while an in-progress decode/filter releases its stale output when it returns.
The graph checks cancellation before matrix/blur/draw work and after drawing;
the existing request gate suppresses completion after cancellation. UI request
generation checks remain required for a completion already delivered before
cancel, as described above.

Each non-canceled request completes at most once. Cancellation is terminal and
synchronizes with callback delivery: after `cancel()` returns no new callback
can start. An external cancel waits for an already executing callback; a callback
may cancel its own request. Downloader completion may occur synchronously,
asynchronously, or reentrantly; installing a returned cancelable after a
synchronous completion must not overwrite the completed/canceled state.

A null worker is a host configuration error and reports an immediate error on
the calling thread; normal download/validation/decode completions use the worker.

## Validation boundary

Object compilation and SDK symbol verification do not prove device decode or
native view attachment. The parent owns image fixtures, full builds and runtime
attachment and pixel-parity validation. Tests and exact compile/import
verification are documented in `tests/README.md`.
