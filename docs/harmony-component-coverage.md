# Harmony component coverage against pinned Valdi and installed SDK26

Audit date: 2026-11-02. This is a read-only source/API audit, followed by the
parent-authorized creation of this report. It does not establish new build,
link, OS, simulator, physical-device, or runtime acceptance.

## Provenance and classification

- Valdi pin: `15feb6530ceecb971f4c8519ea8ab77474b959db`.
- Prepared source: `.tools/harmony/upstream`. The audit byte-compared
  `NativeTemplateElements.d.ts`, `AttributedText.d.ts`,
  `IRenderedElement.d.ts`, and `ElementRef.ts` with that exact git object using
  the sibling `../Valdi-node-only` object provider; all four matched.
  `.tools/harmony/upstream` is a prepared tree, not an independent git checkout.
- Platform overlays are separate from the pin. In particular,
  `scripts/harmony/apply-platform.mjs` adds Harmony class/platform handling,
  `ImageHarmony`, and the explicit video-asset rejection. Do not attribute those
  additions to the unmodified upstream pin.
- Installed SDK: `/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default`.
  Header references below are relative to
  `openharmony/native/sysroot/usr/include/` under that SDK.
- Official documentation snapshot:
  `openharmony/docs@f41b9345badd47c7ab0c263344cd7f4b5a549afb`.
  All official links below use immutable raw files from that snapshot.
  Every positively named candidate was checked against installed declarations.
  Public documentation, installed declarations, exported symbols, and observed
  OS behavior remain distinct evidence.

Classification:

| Label | Meaning |
| --- | --- |
| Available, unimplemented | Installed CAPI supplies a relevant substrate; the Harmony adapter or binding is absent. This does not promise full Valdi semantics. |
| Partial equivalent | Relevant CAPI exists, but only part of the Valdi contract maps directly. Remaining behavior needs an explicit adapter or contract decision. |
| No equivalent established | No matching constructor or semantic API was verified in this audit. This is not a claim that the whole OS capability is impossible. |
| Implemented, QA pending | Source implements the stated behavior; the specified runtime consumer/path still lacks acceptance. |
| Accepted fixture, bounded | Existing artifact-specific acceptance is recorded elsewhere. It does not establish exhaustive parity or acceptance of subsequent source. |

Source references are repository-root-relative. Line numbers identify the audit
snapshot and may move while another owner edits its authorized slice.

## Actual template and factory inventory

The exact pinned declaration file is
`.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_tsx/src/NativeTemplateElements.d.ts`
(abbreviated **NTE** below). It declares these 16 template entries:

`layout`, `slot`, `view`, `textanimationgroup`, `textfield`, `textview`,
`image`, `webview`, `video`, `label`, `scroll`, `spinner`, `blur`, `glass`,
`shape`, `animatedimage`.

`valdi_tsx/src/JSX.ts` additionally exposes structural `slotted` and
`custom-view`. These are not additional built-in native component factories.
Interactive interfaces add programmatic properties; `style` and `ref` are not
native constructor evidence.

| Entry | Pinned declaration | Current Harmony factory / boundary |
| --- | --- | --- |
| `layout` | NTE:613 | Runtime/Yoga structure; backend also recognizes logical `layout`. |
| `slot`, `slotted` | NTE:629; `JSX.ts` | Renderer structure, not missing OS widgets. |
| `view` | NTE:1070 | Logical `view` / `ArkUIView`; custom native wrapper. |
| `textanimationgroup` | NTE:1084 | No factory. It has common view/children attributes; grouping text animations still requires Valdi-specific ownership. |
| `textfield` | NTE:1289; interactive:1338 | `ArkUITextField`, using `ARKUI_NODE_TEXT_INPUT`. |
| `textview` | NTE:1350; interactive:1481 | `ArkUITextView`, using `ARKUI_NODE_TEXT_AREA`; plain editing subset. |
| `image` | NTE:1496 | `ArkUIImageView`, using native Image and `ImageHarmony` assets. Static image subset. |
| `webview` | NTE:1575 | No factory or Harmony implementation of the supplied native controller. |
| `video` | NTE:1594 | No factory; Harmony video asset loading explicitly rejects. |
| `label` | NTE:1811 | `ArkUILabel`, native Text with retained Drawing/StyledString paragraph. |
| `scroll` | NTE:1856; interactive:2113 | `ArkUIScrollView`, native Scroll with Valdi-owned content geometry. |
| `spinner` | NTE:2197 | No factory. |
| `blur` | NTE:2239 | No factory. |
| `glass` | NTE:2288 | No factory. Pinned contract is Apple Liquid Glass with an Android plain-view fallback. |
| `shape` | NTE:2336 | `ArkUIShapeView`, native Drawing path/fill/stroke subset. |
| `animatedimage` | NTE:2412 | No factory or animated asset-loader registration. |
| `custom-view` | `JSX.ts:26` | Explicit `harmonyClass` or compatible `viewFactory`; not arbitrary native-class support. `ArkUIRefreshView` is an implemented custom contract. |

Actual whitelist, factory construction, and native attribute registration:
`harmony/entry/src/main/cpp/backend/ArkUIViewManager.cpp:2274–2352`.
Unknown classes receive an unsupported-class delegate and a null factory.
Official iOS/Android class names in NTE do not establish Harmony support.

The official C node creation interface accepts only documented
`ArkUI_NodeType` values. Installed `arkui/native_node.h:65–185` contains no
Video, Web, Tabs, Glass, or TextAnimationGroup node constructor. A similarly
named ArkTS component or a native controller API is not evidence of such a
constructor. See [node types][node] and [native node ownership/threading][node-api].

## Attribute-level coverage of implemented components

### View, layout, gestures, and accessibility

Implemented native bindings include `backgroundColor`, `opacity`,
point-valued `borderRadius`, clipping, processed transforms, `accessibilityId`,
`accessibilityLabel`, selected category mappings, and the gesture family.
The latter includes tap/double-tap/long-press/drag/pinch/rotate actions,
predicates and disabled flags, raw touch callbacks, `hitTest`, `touchEnabled`,
delay/duration settings, and shorthand/per-edge touch area extension.

Sources:
`harmony/entry/src/main/cpp/backend/ArkUIViewManager.cpp:1484–1604,2301–2320`;
`harmony/entry/src/main/cpp/backend/NativeGestures.inc:690`.

| Remaining TS surface | Classification and verified native candidate |
| --- | --- |
| `border`, `borderWidth`, `borderColor` | Available, unimplemented bindings. Native `NODE_BORDER_WIDTH`, `NODE_BORDER_COLOR`, `NODE_BORDER_STYLE`, API12; installed `native_node.h:513,565,591`. Requires Valdi border preprocessing, edge ordering, units, reset and layout semantics. [Layout CAPI][layout]. |
| Percentage `borderRadius` | Explicitly rejected by current setter. `NODE_BORDER_RADIUS_PERCENT` exists in the API12 attribute family, installed `native_node.h:2042`; a separate percentage representation is required. Do not send percentages through the point-radius conversion. [Layout CAPI][layout]. |
| `boxShadow`, `background`, image/path masks and mask opacity | Unimplemented. Relevant API12 primitives include `NODE_CUSTOM_SHADOW`, gradients, `NODE_BACKGROUND_IMAGE`, and `NODE_MASK`; no complete Valdi grammar/compositing mapping was verified. Preserve this partial-equivalent boundary. [Node CAPI][node], [background attributes][base]. |
| Accessibility hint/value/state/navigation/priority and exact roles | Runtime storage exists, but the native setter only forwards the subset above. API12 description/group/mode/state/value attributes exist; `native_node.h:1578–1624,2095–2108`. They require semantic mapping, not just string forwarding. Current `header` maps to Text and `image-button` to Button. [Accessibility CAPI][accessibility]. |
| `cursor`, obscured-touch policy and exact platform-only styling | Not bound; no complete equivalent was established here. Do not classify these as impossible or invent setters. |

Yoga dimensions, margins, padding, flex, direction, runtime lifecycle/layout
callbacks, lazy/viewport behavior, keys, styles and refs must be traced through
the core runtime rather than counted as missing native setters. Relevant core:
`.tools/harmony/upstream/valdi/src/valdi/runtime/Attributes/DefaultAttributes.cpp`,
`Attributes/Yoga/YogaAttributes.cpp`, and `Attributes/AccessibilityAttributes.cpp`.
Container padding and label text-content insets have different coverage.

All node operations use the main thread. Backend-created nodes have explicit
dispose ownership; borrowed native handles must not be independently disposed
or reparented. CAPI geometry units must be checked per attribute; backend
physical-pixel conversion is not interchangeable with native vp defaults.

### Label and attributed text

Implemented: string and attributed `value`, font/family/size/weight and listed
italic forms, run font/color/decoration inheritance, alignment including
justified, max lines, ellipsis/clip, letter spacing, relative line height and
absolute line height. Rendering and measurement share the same paragraph
builder. It uses `OH_ArkUI_StyledString_*` API12 and Drawing typography.

Sources:
`harmony/entry/src/main/cpp/backend/NativeLabel.inc:29–210`;
`harmony/entry/src/main/cpp/backend/ArkUIViewManager.cpp:1711`;
`harmony/entry/src/main/cpp/backend/LABEL_API.md`.
Rich span contract:
`.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_tsx/src/AttributedText.d.ts`.

| Remaining TS/span surface | Classification and SDK26 mapping |
| --- | --- |
| Inline image attachments | Explicit rejection at `NativeLabel.inc:44`. Available, unimplemented: API24 `OH_ArkUI_StyledString_Descriptor_CreateWithImageAttachment`, `OH_ArkUI_ImageAttachment_SetPixelMap`, width/height setters in vp; installed `styled_string.h:352,3054,3120,3148`. Caller manages input pointers, assets and descriptor destruction. Existing native asset replacement/cancellation must be integrated. [Styled strings][styled]. |
| Inline view attachments / label children | Explicit span rejection; `insertChildView` also rejects text/image children. API12 placeholders and API24 custom-span measure/draw callbacks are only a partial equivalent. A custom drawn span is not a live Valdi child tree. Child layout, lifetime, input and accessibility need an adapter. [Styled strings][styled]. |
| Span `onTap`, `onLayout` | Explicit rejection at `NativeLabel.inc:46`. API24 `OH_ArkUI_GestureStyle_RegisterOnClickCallback` and `OH_ArkUI_SpanStyle_SetGestureStyle` exist. API22 layout-manager/range-rectangle APIs and Drawing range geometry can supply measurement primitives. Native range/encoding, coordinate conversion and callback cancellation remain to implement; pinned `onLayout` documents single-line support. [Styled strings][styled], [Text attributes][text]. |
| Background color/padding/radius; outline/outer outline | Explicit rejection at `NativeLabel.inc:48–50`. API24 background color/radius styles and `OH_ArkUI_TextStyle_SetStrokeWidth/SetStrokeColor` exist. Stroke width is vp; color is ARGB. This does not establish padded rounded backgrounds or Valdi outer-outline drawing order. [Styled strings][styled]. |
| `animationTransform`; `textanimationgroup` | Explicit transform rejection; no group factory. No complete equivalent established for per-part identity, wall-clock restoration, regex partitioning and retained animation state. Generic node transforms do not implement this contract. |
| `textShadow`, `textGradient`, variable font axes | Available Drawing primitives, unimplemented parsing/render/measure integration. Foreground brush/shader and text-shadow APIs exist. `OH_Drawing_TextStyleAddFontVariation` API12 documents only `wght`; normalized variation API24 takes `[-1,1]` and requires a variable font. Do not promise arbitrary axes from the older API. [Drawing typography][typography], [shaders][shader]. |
| `selectable`, `selection`, selection callbacks/menus | Unbound. Native copy option API12, edit-menu/layout-manager API22, `NODE_TEXT_TEXT_SELECTION` API23 and selection-change events exist. Installed `native_node.h:3084,3613–3665,12982`. Own option/callback state and verify string-index semantics before mapping TS selection. [Text attributes][text]. |
| `adjustsFontSizeToFitWidth`, `minimumScaleFactor`, custom underline geometry | Not implemented. API12 native min/max font size and adaptive policy are candidates, in fp; they do not by themselves establish compatibility with the current externally built paragraph. Custom underline geometry still needs a defined drawing mapping. [Text attributes][text]. |
| Yoga baseline alignment; label padding/content insets | Runtime-contract gap. Drawing API9 `OH_Drawing_TypographyGetAlphabeticBaseline` returns physical px after layout, but pinned `DefaultMeasureDelegate` returns only `Size`. Native transactions do not deliver the required resolved label inset snapshot. A coordinated runtime contract is needed; do not privately mutate upstream Yoga ownership. |

The node retains paragraph/style/string resources; replacement resets the
borrowed Text paragraph attribute before old resources are released. New span
support must preserve that lifetime model. Real base glyph/run fixture evidence
exists, while advanced spans and exact fallback/line-breaking parity remain
outside acceptance.

### TextField and TextView

The actual binder is
`harmony/entry/src/main/cpp/backend/NativeTextInput.inc:582`.
Implemented subset: plain `value`, placeholder, font, color/placeholder color,
enabled/focused, character limit, selection, alignment, select-on-focus,
close-on-return, selected content/return-key names and editing/selection
callbacks, including the existing synchronous change processor.

| Remaining TS surface | Classification and exact candidate |
| --- | --- |
| `tintColor` | Available, unimplemented. `NODE_TEXT_INPUT_CARET_COLOR` / `NODE_TEXT_AREA_CARET_COLOR`, API12, ARGB; installed `native_node.h:4702,5724`. |
| `keyboardAppearance` | Available, unimplemented. `NODE_TEXT_INPUT_KEYBOARD_APPEARANCE` / `NODE_TEXT_AREA_KEYBOARD_APPEARANCE`, API15, `ArkUI_KeyboardAppearanceType`; installed `:5281,6085`. |
| `textDirection` | Available, unimplemented. Input/area `DIRECTION` attributes, API23, `ArkUI_TextDirection`; installed `:5488,6400`. Must map locale/inherited direction deliberately. |
| TextView `textOverflow`, `textDecoration`, gradient | Available, unimplemented. Area overflow API24 (`:6437`); decoration and linear/radial gradient API26 (`:6456–6508`). Native gradient uses angle/direction/repeat and an owned color-stop payload. |
| TextView `numberOfLines`, `lineHeight`, `lineHeightAbsolute`, `textGravity` | Unbound. Native area number-of-lines exists, but affects calculated height, which Valdi already owns. `NODE_TEXT_AREA_LINE_HEIGHT` API20 (`:6177`) is documented in the installed header as an `i32` with no unit. Do not guess its equivalence to Valdi relative/absolute line height. Vertical gravity mapping remains unverified. |
| Attributed editor `value`, custom underlines, selection menus/actions, background-effect color/padding/radius | Outside the current plain editor binder. Relevant text/rich-editor APIs are not proof of drop-in TextArea parity. No complete mapping was established; retain explicit scope. |
| Field shrink-to-fit/minimum scale; TextView `scrollToEndBeforeFocus` | Unimplemented. The latter is documented as iOS-only in NTE. No complete native editor mapping was verified. |
| `selectable`, inline predictions, autocapitalization/autocorrection and exact keyboard policy | No exact parity established. Autocapitalization/autocorrection are validated advisory settings; preview-text controls are not a substitute for prediction/correction policy. Existing signed-decimal, secure multiline, read-only/selectable and exact URL/suggestion/join/continue limitations remain. |

Primary reference: [official native input attributes][input].
Do not invent `keyboardType`, `secureTextEntry` or `editable` aliases; those
are not the pinned TS properties.

The current `harmony/VALIDATION.md` records acceptance of the final
noninstrumented 19-step input walkthrough/replay, with remaining IME,
composition, selection, submit and lifecycle combinations pending. This report
adds no acceptance and does not retroactively resolve earlier failed artifacts.
The bounded setter-echo policy and unproven original r3 cause remain as recorded
in `harmony/entry/src/main/cpp/backend/INPUT_API.md`.

### Image and asset loading

NTE:1496–1569 is covered at the source level:

- `src`, `onAssetLoad`, `filter`, `flipOnRtl` use the official asset composite.
- `onImageDecoded`, `objectFit`, `tint`, `contentScaleX/Y`, `contentRotation`
  have backend bindings. Callback dimensions are decoded physical pixels;
  content rotation follows Valdi radians.
- The native Image borrows its PixelMap from a retained `HarmonyImageAsset`.
  The backend owns the drawable descriptor and clears native source before
  descriptor/asset release. Asset destruction owns PixelMap destruction.

Sources:
`harmony/entry/src/main/cpp/backend/IMAGE_VIEW_API.md`;
`harmony/entry/src/main/cpp/backend/DirectImageFilter.hpp`;
`harmony/entry/src/main/cpp/assets/HarmonyImageAsset.cpp`;
`harmony/entry/src/main/cpp/assets/HarmonyImageAssetLoader.cpp:143`;
`harmony/entry/src/main/cpp/host/HarmonyRuntimeHost.cpp:222–230`.

Classification: **accepted static fixtures, bounded**. Existing records include
packaged/direct A-to-B replacement and PNG round-trip, and the five-load
none/invert/grayscale/invert+blur/none fixture. They do not prove exhaustive
numeric pixel/alpha/color-space parity, vendor implementation identity, all
tint/fit/transform/clipping cases, or acceptance of subsequent source.

Effective filters on direct `LoadedAsset` explicitly reject; URL/resource
filters use the worker loader. Null/empty/identity filters remain accepted.
The decoder selects frame zero at
`harmony/entry/src/main/cpp/assets/HarmonyImageDecoder.cpp:76`.
Animated decoding, SVG/vector parity, cap-inset/nine-patch behavior and native
presentation callbacks remain separate capabilities, not imaginary NTE props.

### Scroll and Refresh

`harmony/entry/src/main/cpp/backend/NativeScroll.inc:525` calls the official
scroll binder and adds enabled, paging, both indicators, bounce variants,
touch cancellation and touch-stop. Core
`.tools/harmony/upstream/valdi/src/valdi/runtime/Attributes/ScrollAttributes.cpp`
owns offsets, static sizes, scroll/drag/content-size callbacks, viewport
extensions, circular ratio, anchor preservation and sticky properties.

| Remaining surface | Classification and constraints |
| --- | --- |
| Keyboard dismissal/translation; scroll perf logger bridge | Unimplemented; no complete mapping established in this audit. |
| `fadingEdgeLength`, start/end flags and Android extended edge behavior | Partial equivalent. `NODE_SCROLL_FADING_EDGE`, API14, installed `native_node.h:9322`, supplies enable plus length in vp. It does not directly represent every independent Valdi edge flag. |
| `decelerationRate` | Partial equivalent. API12 `NODE_SCROLL_FRICTION` (`:9130`) is dimensionless; no verified equivalence to Valdi normal/fast physics. |
| Zoom | **Extension, not a missing official pinned prop.** API20 `NODE_SCROLL_MAX_ZOOM_SCALE`, `MIN_ZOOM_SCALE`, `ZOOM_SCALE`, `ENABLE_BOUNCES_ZOOM` exist (`:9478–9534`), with did/start/stop events (`:14322–14344`). Scale is dimensionless. NTE and pinned scroll specs contain no zoom contract. |

The pinned interactive ref path uses `setAttribute` for offsets and animation,
not an invented native `scrollTo` action. There are no pinned `contentInset*`
props. Yoga padding already contributes to content geometry; do not apply it a
second time natively. Drag-ending target correction is a subsequent 300ms
native animation, not UIKit-style mutation of an in-flight target pointer.
See [official scroll attributes][scroll] and
`harmony/entry/src/main/cpp/backend/SCROLL_API.md`.

**Parent-provided freeze status: Refresh53 reviewed, pending OS validation.**
`ArkUIRefreshView` is a custom-view contract around one vertical Scroll, not a
new pinned ScrollView prop. This report neither edits that slice nor upgrades
its runtime acceptance. Source contract:
`harmony/entry/src/main/cpp/backend/REFRESH_API.md`.

### Shape

Implemented bindings at
`harmony/entry/src/main/cpp/backend/NativeShape.inc:178` are `path`, fill/stroke
color, stroke width, cap and join. Existing simple path/chevron fixture evidence
does not establish exhaustive curves/arcs/contours, RTL/density or lifecycle
parity.

- `fillGradient`: available, unimplemented.
  `OH_Drawing_ShaderEffectCreateLinearGradient` API11 and brush shader
  attachment exist; own/destroy shader resources, convert coordinates
  consistently, use ARGB colors and normalized stop positions.
- `strokeStart/End`: available primitive, unimplemented mapping.
  `OH_Drawing_PathGetSegment` API18 (`drawing_path.h:946`) takes path distances.
  Valdi fractions need length conversion and an explicit multi-contour policy.
- Morphing: no complete equivalent established; path extraction is not morphing.

See [Drawing shaders][shader], [paths][path], and
`harmony/entry/src/main/cpp/backend/SHAPE_API.md`.

## Missing media and other native factories

### Video

NTE:1594–1656 declares source, volume, playback rate, seek time and
loaded/begin/error/completed/progress callbacks. Video time values are
milliseconds. The official platform implementations bind platform-specific
video assets; for example, pinned
`valdi_core/src/valdi_core/ios/valdi_core/SCValdiVideoView.m:195` binds VideoIOS.

Current rejection:
`.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_core/src/Asset.ts:146–149`.
No VideoHarmony output or player factory has been implemented.

**Available substrate, unimplemented adapter:**

1. `ARKUI_NODE_XCOMPONENT`, API12.
2. `OH_ArkUI_SurfaceHolder_Create`, surface callbacks and
   `OH_ArkUI_XComponent_GetNativeWindow`, API19.
3. `OH_AVPlayer_Create`, source, video-surface, prepare, play/pause, volume,
   seek and release APIs, API11; instance-aware info/error callbacks API12;
   `OH_AVPlayer_SetPlaybackRate`, API20.

Installed declarations: `arkui/native_node.h:95`,
`ace/xcomponent/native_interface_xcomponent.h:1589,1625`,
`multimedia/player_framework/avplayer.h:95–632`.
See [official AVPlayer][avplayer] and [XComponent lifecycle][xcomponent].

Required semantics:

- TS rate zero means pause; zero is not a valid native playback-rate value.
- Seek/duration/current position use milliseconds.
- Set video surface after source and before prepare.
- Own the player/holder/callback registrations and respect the surface/window
  lifetime. Asynchronous player release does not guarantee display-buffer
  release; synchronous release guarantees it but needs an asynchronous teardown
  design to avoid blocking the owning UI flow.
- Handle source replacement, backgrounding, pooling and stale callbacks before
  treating a URL-playing prototype as a complete Valdi implementation.

### AnimatedImage

NTE:2412–2496 declares looping, signed `advanceRate` with zero pause, current
time/start/end bounds in seconds, progress, font provider and fit.
Pinned iOS `valdi/src/valdi/ios/Views/SCValdiAnimatedContentView.mm:66` binds
Lottie output and renders SnapDrawing animated content. Android
`valdi/src/java/com/snap/valdi/views/AnimatedImageView.kt` also uses SnapDrawing.
This is broader than a GIF frame player.

**Partial native equivalent, unimplemented:**

- API12 ImageAnimator node/attributes and animated PixelMap drawable creation.
- API22 drawable start/stop/pause/resume/status controller.
- API12 `OH_ImageSourceNative_GetFrameCount`, `GetDelayTimeList` and
  `CreatePixelmapList`; installed `image_source_native.h:624,671,746`.
- ImageAnimator duration is milliseconds and its frame array does not support
  dynamic updates. Full-frame decode can use substantial memory. Own and release
  each PixelMap, descriptor and controller.

No complete CAPI equivalent was established for seeking, start/end subranges,
signed arbitrary rate, timeline progress, font provider or Lottie rendering.
Do not equate ImageAnimator with Valdi AnimatedImage. A decoder/timeline adapter
or separate renderer remains necessary.
See [ImageAnimator attributes][image], [drawable controls][drawable],
and [image decoder][image-source].

### Spinner, Blur, Glass, WebView, TextAnimationGroup

| Factory / TS attributes | Classification and candidate |
| --- | --- |
| Spinner `color` | Available, unimplemented. API12 `ARKUI_NODE_LOADING_PROGRESS`, `NODE_LOADING_PROGRESS_COLOR`, `ENABLE_LOADING`; installed `native_node.h:83,4633,4650`. ARGB color, native node lifetime/main-thread ownership. [Loading attributes][loading]. |
| Blur `blurStyle`, children | Available backdrop primitive, unimplemented factory/style mapping. API12 `NODE_BACKGROUND_BLUR_STYLE`, installed `native_node.h:858`; blur/color/adaptive enums and intensity `[0,1]`. `NODE_BLUR` blurs content and is not a backdrop substitute. Exact Valdi style equivalence requires a decision. [Node CAPI][node]. |
| Glass `glassStyle`, tint, interactive, appearance | No matching constructor/material equivalence established. Pinned NTE:2272+ explicitly describes Apple Liquid Glass and Android plain-view fallback. Native blur does not prove Liquid Glass parity. |
| WebView `controller` | No native Web node constructor in installed enum, and no Harmony controller adapter. ArkWeb native functions do not prove C-only component construction. Preserve a host/ArkTS boundary if needed; do not guess a constructor. |
| TextAnimationGroup common attributes/children | No matching native constructor or complete group semantics established. Needs integration with Valdi text-part animations and lifecycle. |

## Core refs, assets and runtime boundaries

Pinned public reference APIs are
`.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_core/src/IRenderedElement.d.ts`
and `ElementRef.ts`:

- `getNativeNode()` is synchronous and opaque.
- Deprecated `getNativeView()` is asynchronous.
- `takeSnapshot()` returns a promise of a base64 string or undefined.
- `ElementRef.setAttribute()` applies the existing runtime attribute path.
- Pinned `NativeNode.d.ts` declares an empty opaque native interface. It does
  not define a generic native-method dispatcher.

Harmony implements opaque `ArkUIViewNodeRef` objects at
`harmony/entry/src/main/cpp/backend/ArkUIViewManager.cpp:2378`.
Resolution occurs on UI, validates ownership/lifetime, and obtains the current
backing view rather than caching a raw pointer. Native handles remain borrowed.
**Native-ref C++ consumer runtime resolution remains QA pending.**

`callAction()` explicitly fails and `getViewRasterBitmapFactory()` returns null
at `ArkUIViewManager.cpp:2355,2391`. PNG node snapshots do not implement the
raster bitmap-factory interface. Existing PNG round-trip and opaque-JS-object
acceptance does not cover every native bitmap consumer or active-animation
touch-stop interruption. Video/protected/offscreen/full-content capture is
outside the implemented snapshot contract. See
`harmony/entry/src/main/cpp/backend/SNAPSHOT_REF_API.md`.

Do not turn this into a claim that all native interfaces are missing.
Generated typed proxy/DTO host interfaces are already integrated; see
`harmony/entry/src/main/cpp/platform/PLATFORM_API.md:24–40`.
Each new platform interface still needs its own ownership, marshalling and
lifecycle adaptation.

## Public documentation versus installed SDK

The immutable public AVPlayer document gives playback rate `[0.125,4]`.
Installed SDK26 `avplayer.h:625` documents `[0.125,8]`, with `[0.125,4]` for
API24 and below. The symbol and API20 introduction match, but the documented
range differs. Record both; OS acceptance still needs the target runtime.

The current image metadata implementation uses
`OH_PixelmapImageInfo_GetAlphaMode`, API20, declared at
`multimedia/image_framework/image/pixelmap_native.h:646`.
See `harmony/entry/src/main/cpp/assets/HarmonyImagePixelmapMetadata.hpp`.
The earlier `GetAlphaType` versus `GetAlphaMode` mismatch is an example of why
successful declaration/export checks do not prove field semantics.

The TextArea line-height unit omission is another unresolved semantic boundary.
Do not fill such gaps by borrowing units from a nearby ArkTS API or a different
component.

## Tabs, acceptance and excluded concurrent work

Installed CAPI node types do not contain Tabs. Keep the minimal ArkTS host
using the actual official Tabs component; do not infer a C constructor from
Swiper or assemble a substitute and call it official Tabs.
Existing `harmony/VALIDATION.md` records specific official/custom-tab fixtures;
this report does not broaden them.

Existing acceptance remains attached to the exact artifacts recorded in
`harmony/VALIDATION.md`, including static images/filters, base text, simple
shapes, input and snapshot paths. Source coverage and prior compile/import
checks are not new acceptance of today's tree.

Parent freeze boundaries:

- Refresh53 is reviewed and pending OS validation.
- Active AppUI Promise work is excluded from this report. Typed AppUI native
  dialogs/pickers are a separate service contract, not missing Valdi template
  tags; their implementation and acceptance remain with that owner.
- No code, builds, exports, OS checks or acceptance upgrades are authorized by
  this report.

## Ranked next slices after freeze

1. **Close existing QA boundaries:** Refresh53 OS validation, native-ref C++
   resolution and active-animation touch-stop on an identified artifact. Keep
   AppUI Promise work under its current owner.
2. **Small existing-component bindings:** caret tint, keyboard appearance and
   text direction; then Spinner. Use exact installed enums, resets and lifecycle
   behavior with focused runtime fixtures.
3. **Text spans in bounded stages:** image attachment first, then tap/layout
   callbacks; separate live inline views, outlines/backgrounds and animation
   ownership. Extend measurement and teardown together.
4. **Video:** add the asset/output/player lifecycle contract and XComponent
   surface integration, then source replacement, rate/seek/event and background
   acceptance. A playing URL alone is insufficient.
5. **Common style and Shape:** borders/percentage radii, explicit accessibility
   forwarding, gradient fill and partial strokes with multi-contour policy.
6. **Animated content:** choose the required format/timeline contract before
   choosing ImageAnimator, custom decoded frames or a separate renderer.
7. **Optional extensions:** scroll zoom only through a separately agreed TS/
   runtime contract; preserve existing pinned behavior and the minimal ArkTS
   Tabs boundary.

These are implementation proposals and pending acceptance slices, not claims
that component parity is complete.

## Immutable official references

[node]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h.md
[node-api]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-arkui-nativemodule-arkui-nativenodeapi-1.md
[layout]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-layoutattributes.md
[base]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-base.md
[accessibility]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-accessibility.md
[styled]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-styled-string-h.md
[text]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-text.md
[typography]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkgraphics2d/capi-drawing-text-typography-h.md
[input]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-textinputcategory.md
[scroll]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-scrollablecontainer.md
[shader]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkgraphics2d/capi-drawing-shader-effect-h.md
[path]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkgraphics2d/capi-drawing-path-h.md
[avplayer]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-media-kit/capi-avplayer-h.md
[xcomponent]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-interface-xcomponent-h.md
[image]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-image.md
[drawable]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-drawable-descriptor-h.md
[image-source]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-image-kit/capi-image-source-native-h.md
[loading]: https://raw.githubusercontent.com/openharmony/docs/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/reference/apis-arkui/capi-native-node-h-nodeattributetype-informationdisplay.md
