# Attributed labels and text styles — backend phase, 2026-11-02

## Contract and implementation

`label`/`ArkUILabel` continue to use a custom wrapper containing a real
`ARKUI_NODE_TEXT`. `value` (or the existing `text` alias) is bound with the
pinned runtime's `bindTextAttribute`. The runtime parses the TS attributed
entry stream into `Valdi::TextAttributeValue`; the backend consumes its
`getPartsSize()`, `getContentAtIndex()` and `getStyleAtIndex()` methods.
It does not parse an approximate array schema or call `toString()` to flatten
styled content.

Every part becomes a separate `OH_ArkUI_StyledString_PushTextStyle` /
`AddText` / `PopTextStyle` operation. Font, foreground color, and text
decoration override only that run; absent values inherit the label defaults.
An explicit transparent color and `textDecoration: 'none'` remain overrides.
The runtime has already resolved the nested style stack before this boundary.
UTF-8 contents, including newlines, CJK, emoji and RTL text, are handed to the
native shaper. Embedded NUL is explicitly rejected because AddText has no
length parameter.

`NativeLabel` is the **single paragraph builder** for rendering and
measurement. It creates the actual StyledString and calls
`OH_ArkUI_StyledString_CreateTypography` and primes it with
`OH_Drawing_TypographyLayout` before assigning
`NODE_TEXT_CONTENT_WITH_STYLED_STRING`. The actual rendering paragraph is laid
out at its current physical-pixel width before native Text measurement.
Measurement creates the same object, uses the same layout method, and reads
longest-line width and height. SDK layout width must be positive: a zero-size
wrapper uses one pixel for shaping and retains its exact zero frame.
The inner Text has native clipping explicitly enabled and its own native opacity
is zero before geometry is known or when either resolved pixel dimension is
zero; positive geometry restores that opacity to one. This suppresses actual
glyph/ellipsis ink without depending on the outer `clipToBounds` setting.
Both paths share resolved runs, fonts, color, decoration, spacing, line
height, direction, alignment, max lines, ellipsis, and greedy word wrapping
with fallback for a word wider than the line.

The node owns the paragraph, StyledString, paragraph style, individual native
run styles and backing strings until replacement or node disposal. A
replacement first resets the native styled-string attribute, clearing Text's
cached paragraph manager, before installing the new pointer and releasing old
resources. Disposal explicitly resets the borrowed attribute/cache before
native node disposal and paragraph release. StyledString destruction
releases its builder and internally copied styles; the returned Drawing
paragraph is separately destroyed exactly once. All operations occur on UI.

Fonts use the existing process-lifetime, byte-owning `FontRegistry` and
borrowed global font collection. Within one paragraph each logical family
loads once, so repeated spans share one exact registration even if the host's
loader can change resources. The entire logical style is copied before the
first loader call. A generation check after **each** unique family lookup
drops stale work if a callback replaces attributes, detaches the node, or
shuts down the host. Logical styles retain logical names, never native aliases.

## Supported styles

Existing attributes remain, with these label additions:

- `textDecoration`: `none`, `strikethrough`, `underline`, `dashed-underline`,
  `dotted-underline`, at label or attributed-run level.
- `letterSpacing`: finite point values, including negative spacing; converted
  to physical pixels for both rendering and measurement.
- `lineHeight`: positive multiple of **shaped natural font height**. SDK 26's
  `TEXT_STYLE_ATTR_I_LINE_HEIGHT_STYLE = TEXT_LINE_HEIGHT_BY_FONT_HEIGHT`
  provides this distinction from a fontSize multiple.
- `lineHeightAbsolute`: positive points, taking precedence over `lineHeight`.
  It selects the fontSize basis with a per-run factor and identical pixel
  minimum/maximum line heights. SDK half-leading centers extra leading above
  and below the glyphs; mixed font sizes use native alphabetic baselines.
- `textOverflow`: `ellipsis` (tail, default) or `clip`.
- `textAlign`: existing `left`/`right`/`center` plus `justified`. Left/right
  mean start/end, as documented in the pinned TS contract, and reverse in RTL.
  A frame direction change rebuilds the paragraph.
- `font`: existing module font forms and system weights plus the pinned
  system italic forms, including `system-italic`, `system-medium-italic`,
  `system-bold-italic`, `system-semibold-italic`, and `system-demi-bold[-italic]`.
  This extra parser is label-only; editor shorthand behavior is unchanged.

`fontSize`, `fontWeight` and `fontFamily` still override the shorthand fields
independently of live binder ordering. Attributed run font overrides replace
the run's entire font specification, consistent with the runtime style.

`numberOfLines` now defaults/resets to **1**, matching the TS label contract
and iOS label default; `0` explicitly means unlimited. This corrects the
previous backend default of unlimited. All style inputs needed by the shared
builder participate in the processed layout snapshot. Color and decoration
changes therefore also invalidate measurement, conservatively.

## Exact limits

The following runtime span fields return explicit attribute/measurement errors
before the committed content is replaced:

- inline image and view attachments;
- span `onTap` and `onLayout`;
- attributed backgrounds, background padding and rounded backgrounds;
- inner/outer outline color or width, including explicit zero widths;
- per-part animation transforms.

Some SDK APIs can represent placeholders and other spans. They do not supply
the pinned Valdi attachment ownership, drawing, hit-testing, callback, and
animation integration by themselves. These features are **not implemented in
this phase**, rather than being claimed impossible on SDK 26 or silently
stripped. No label child-view support is introduced.

Variable font axes, dynamic-type shorthand, custom underline geometry, text
shadows/gradients, selection and shrink-to-fit are not added here.

Native runs use actual alphabetic baselines, including differently sized
fonts. **Yoga text-baseline alignment remains unsupported**: the pinned
`MeasureDelegate::measure` returns only `Size`; `DefaultMeasureDelegate` and
`IViewTransaction` expose no text baseline return hook. The backend does not
install a private Yoga callback on upstream-owned nodes.

**Label-specific Yoga padding/content insets remain unsupported**. Yoga owns
padding reservation and passes content constraints to the measure delegate,
but the pinned transaction delivers only the outer resolved frame and no
resolved text inset snapshot. The renderer fills that frame, as before.
Reading mutable Yoga state from arbitrary UI callbacks or overriding the
shared Yoga padding binder would violate runtime ownership. Container padding
still places ordinary child views through Yoga. Supporting text insets requires
a coordinated runtime frame/inset contract in a later phase; no new TS business
props are introduced as a workaround.

## Audited source

The project pins Valdi `15feb6530ceecb971f4c8519ea8ab77474b959db` plus the
parent's staged overlays. Both repository external source and actual staged
`.tools/harmony/upstream` headers were used; the verifier compiles the staged
ones.

Relevant paths below are relative to that upstream root:

- `valdi_core/src/valdi_core/cpp/Attributes/TextAttributeValue.{hpp,cpp}`:
  actual part/style fields and optional-versus-unset semantics.
- `valdi/src/valdi/runtime/Attributes/TextAttributeValueParser.cpp` and
  `AttributesBindingContext.cpp`: preprocessing and text binding.
- `src/valdi_modules/src/valdi/valdi_tsx/src/AttributedText.d.ts` and
  `NativeTemplateElements.d.ts`: business-facing rich/style contracts.
- `valdi/src/java/com/snap/valdi/attributes/impl/AbstractTextViewAttributesBinder.kt`,
  `impl/richtext/FontAttributes.kt`, `TextViewHelper.kt`, and
  `valdi/src/valdi/android/AttributedTextJNI.hpp`: Android inheritance,
  decoration, line height, overflow and style binding.
- `valdi/src/valdi/ios/Views/SCValdiLabel.m` and `ios/Text/NSAttributedString+Valdi.m`,
  `SCValdiProcessedText.m`, `SCValdiFontAttributes.m`, `SCValdiFontManager.m`:
  iOS part merge, default line limit, relative/absolute line heights,
  RTL alignment and italic forms.
- `valdi/src/valdi/runtime/Views/{MeasureDelegate,DefaultMeasureDelegate}.hpp`,
  `runtime/Interfaces/IViewTransaction.hpp`, `runtime/Context/ViewNode.cpp`:
  Size-only measurement, snapshot and frame/padding boundaries.

The installed SDK is Huawei command-line-tools `26.0.0.865`, headers under
`sdk/default/openharmony/native/sysroot/usr/include`:

- `arkui/styled_string.h`: real builder and typography APIs.
- `arkui/native_node.h`: styled-string attribute and borrowed heap lifetime;
  native Text attributes also expose baseline offset and padding, but those
  are not a replacement for a resolved Valdi frame/inset/baseline contract.
- `native_drawing/drawing_text_typography.h`: actual font/slant/color,
  decoration style, line-height basis/min/max, half-leading, baseline, direction,
  ellipsis and shaping interfaces.

OpenHarmony implementation source additionally corroborated the non-obvious
borrowed lifetime/reset behavior:
`interfaces/native/node/native_node_extented.cpp` creates the separate
paragraph without destroying it in StyledString_Destroy;
`frameworks/core/components_ng/pattern/text/text_model_ng.cpp` installs the
external paragraph and clears the paragraph manager on reset. Public
OpenHarmony source is corroboration, not proof that the installed proprietary
device runtime uses the identical revision. SDK object/symbol checks below are
against the actual installed SDK.

## Verification and handoff

Run:

```sh
python3 harmony/entry/src/main/cpp/backend/verify-objects.py \
  --output /tmp/valdi-arkui-richtext-20261102
python3 harmony/entry/src/main/cpp/backend/tests/input-negative-controls.py
```

The verifier retains every previous helper check, adds production
`LabelText.hpp` / `OverlayHitTest.hpp` semantic tests under ASan/UBSan, compiles
the actual backend and asset/parser closure for x86_64 and arm64, verifies
all imported SDK C symbols, and links real `--no-undefined` SDK probes.
StyledString now creates the Drawing builder internally; the previous direct
Drawing handler import requirement is replaced by real StyledString imports,
and the handler's SDK export is still checked. No unused synthetic import was
added to satisfy that previous check.

Host tests cover real helper decisions for Unicode run preservation, style
inheritance and explicit overrides, italic forms, RGBA conversion, natural
versus absolute line-height priority, repeated-family alias identity, late-span
font-loader replacement/disposal, empty rich text, rich-to-plain replacement,
and scoped overlay policy. They do not execute native ArkUI or claim pixel
parity.

Parent execution still needs mixed-font/color/decoration rendering, Arabic/
emoji/CJK shaping, line wrap/ellipsis/clip at bounded widths, RTL alignment,
module-font replacement/reentry, and pause/remount behavior. Physical font
fallback and exact Android/iOS line-break/leading equality are not established
by compile/link evidence.

The separately requested root API is documented in `OVERLAY_HIT_TEST_API.md`.
Input, scroll, gesture, shape, font/image, and animation behavior outside that
opt-in overlay scope is retained. Snapshot/native-reference/touch-stop additions
are documented in `SNAPSHOT_REF_API.md`; video/refresh remain separate phases.
