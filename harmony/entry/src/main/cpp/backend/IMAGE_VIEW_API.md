# Native image views

`image` and `ArkUIImageView` are custom Valdi layout/gesture/animation wrappers
containing a real `ARKUI_NODE_IMAGE`. The parent registers the ImageHarmony
loader described in `../assets/IMAGE_API.md`. Backend source loading uses
`bindAssetAttributes(ImageHarmony)`; `src`, `onAssetLoad`, `filter`, and
`flipOnRtl` retain the pinned AssetAttributes/ViewNodeAssetHandler semantics.
There is no second downloader.

`setViewLoadedAsset` accepts null or a typed `HarmonyImageAsset`. Its pixelmap
is borrowed. The backend retains the asset and owns its ArkUI drawable
descriptor. Replacement, source reset, unmount and disposal reset
`NODE_IMAGE_SRC` before disposing that descriptor. Unmount keeps the logical
asset for remount; disposal/source reset release it after detachment.
All native attachment and disposal operations run on UI through the normal
transaction/dispatcher path. The upstream handler rejects obsolete requests.

Supported presentation attributes are `objectFit` (`fill`, `contain`, `cover`,
`none`, `scale-down`; default `fill`), `tint` (processed Valdi color),
`contentScaleX`, `contentScaleY` (default 1), and `contentRotation` (radians,
default 0). Content transforms affect only the inner image; common transforms,
opacity, animation and input remain on the wrapper. The asset handler supplies
the resolved RTL flip independently of content scale. These image attributes
apply discretely inside animated transactions.

`onImageDecoded(width, height)` receives two ordinary JS numbers containing
the installed pixelmap's decoded pixel dimensions, independent of view size or
displayScale. It fires once per actual asset replacement, after successful
native attachment; null/error assets emit no decode callback. A listener
applied after an asset can receive that asset's pending notification. Replacing
an inline callback after delivery does not replay the decode. Queued callbacks
retain the node and asset during delivery and validate asset/callback/lifecycle
generations; reset, rebind, suspension, unmount and disposal invalidate stale
deliveries. No native access follows synchronous JS.

Yoga frames size the wrapper and inner image exactly in physical pixels.
The asset binder measures ordinary resource assets using their logical
intrinsic dimensions. Direct loaded images fall back to decoded width/height
divided by displayScale, honoring constrained dimensions and aspect ratio.
Native pre-frame fallback uses those same pixelmap dimensions when available.
Image wrappers reject Valdi child views.

Still images only. URL/resource assets use the worker's typed native filter
implementation in `../assets/IMAGE_API.md`. Direct `LoadedAsset` sources bypass
that loader; an effective filter on that source is explicitly rejected by the
official `srcOnLoad` composite preprocessor before presentation. Null/empty/
identity filters remain valid. No filter work is moved onto UI.
SVG/vector raster parity, animated images, nine-patch/cap insets, and native image
presentation callbacks are not implemented. Tint uses the SDK image
4x5 color matrix (source alpha times tint alpha, constant tint RGB);
raster tint behavior and fit/transform clipping require parent
live validation. The parent owns the HAP, device pixel QA and resource fixtures.
Ordinary wrapper PNG snapshots are documented in `SNAPSHOT_REF_API.md`.
