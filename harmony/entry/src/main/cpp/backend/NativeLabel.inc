// Included within detail after Backend/font resolution and TextStyle.
static_assert(ARKUI_TEXT_ALIGNMENT_START == 0);
template<typename T, void (*Destroy)(T*)>
using DrawingPtr = std::unique_ptr<T, decltype(Destroy)>;

template<typename T, void (*Destroy)(T*)>
static DrawingPtr<T, Destroy> drawing(T* value) {
    if (!value) fail("native text typography allocation failed");
    return DrawingPtr<T, Destroy>(value, Destroy);
}

static void applyLabelFont(TextStyle& style, const Value& value) {
    if (!value.isString()) fail("font must be a plain string");
    static_cast<LabelFont&>(style) = parseLabelFont(value.toStringBox().toStringView());
}

static LabelDecoration runDecoration(TextDecoration decoration) {
    switch (decoration) {
        case TextDecoration::None: return LabelDecoration::None;
        case TextDecoration::Strikethrough: return LabelDecoration::Strike;
        case TextDecoration::Underline: return LabelDecoration::Underline;
        case TextDecoration::DashedUnderline: return LabelDecoration::Dashed;
        case TextDecoration::DottedUnderline: return LabelDecoration::Dotted;
        case TextDecoration::Unset: break;
    }
    fail("unknown attributed text decoration");
}

static void labelContent(TextStyle& target, const Value& value) {
    std::vector<LabelRunOverride> runs;
    std::string plain;
    if (value.isString()) {
        plain = value.toStringBox().slowToString();
        validateLabelContent(plain);
    } else {
        auto attributed = castOrNull<TextAttributeValue>(value.getValdiObject());
        if (attributed == nullptr) fail("label value requires a string or processed TextAttributeValue");
        runs.reserve(attributed->getPartsSize());
        for (size_t i = 0; i < attributed->getPartsSize(); ++i) {
            const auto& source = attributed->getStyleAtIndex(i);
            // These are real runtime fields, including explicit zero-valued
            // optionals. Reject before replacing the committed label.
            if (source.imageAttachment || source.inlineViewAttachment != nullptr)
                fail("attributed label image/view attachments are unsupported");
            if (source.onTap != nullptr || source.onLayout != nullptr)
                fail("attributed label span onTap/onLayout callbacks are unsupported");
            if (source.background != nullptr)
                fail("attributed label backgrounds/padding/radius are unsupported");
            if (source.outlineColor || source.outlineWidth || source.outerOutlineColor || source.outerOutlineWidth)
                fail("attributed label outlines are unsupported");
            if (source.animationTransform) fail("attributed label span animation transforms are unsupported");
            LabelRunOverride run;
            run.content = attributed->getContentAtIndex(i).slowToString();
            validateLabelContent(run.content);
            if (source.font) run.font = parseLabelFont(source.font->toStringView());
            if (source.color) run.color = labelARGB(source.color->value);
            if (source.textDecoration != TextDecoration::Unset) run.decoration = runDecoration(source.textDecoration);
            runs.push_back(std::move(run));
        }
    }
    target.attributed = !value.isString();
    target.text = std::move(plain);
    target.runs = std::move(runs);
}

// Shared by live attributes and the DefaultMeasureDelegate snapshot. Every
// metric-affecting value is validated and interpreted identically.
static bool labelStyleAttribute(TextStyle& style, std::string_view key, const Value& value) {
    if (key == "value" || key == "text") labelContent(style, value);
    else if (key == "font") applyLabelFont(style, value);
    else if (key == "fontSize") {
        positiveSize(value.toDouble());
        style.size = static_cast<float>(value.toDouble());
    } else if (key == "fontWeight") style.weight = fontWeight(value);
    else if (key == "fontFamily") style.family = value.toStringBox().slowToString();
    else if (key == "color") style.color = argb(value);
    else if (key == "textAlign") style.alignment =
        value.toStringBox().toStringView() == "justified" ? ARKUI_TEXT_ALIGNMENT_JUSTIFY : textAlignment(value);
    else if (key == "textDecoration") style.decoration = labelDecoration(value.toStringBox().toStringView());
    else if (key == "numberOfLines") {
        const auto number = value.toDouble();
        if (!std::isfinite(number) || number < 0 || number > std::numeric_limits<int>::max() ||
            std::floor(number) != number) fail("numberOfLines must be a nonnegative integer");
        style.lines = static_cast<int>(number);
    } else if (key == "letterSpacing") {
        labelScalar(value.toDouble(), "letterSpacing", false);
        style.letterSpacing = value.toDouble();
    } else if (key == "lineHeight") {
        labelScalar(value.toDouble(), "lineHeight", true);
        style.lineHeight = value.toDouble();
    } else if (key == "lineHeightAbsolute") {
        labelScalar(value.toDouble(), "lineHeightAbsolute", true);
        style.lineHeightAbsolute = value.toDouble();
    } else if (key == "textOverflow") {
        const auto text = value.toStringBox().toStringView();
        if (text != "clip" && text != "ellipsis") fail("textOverflow supports clip or ellipsis");
        style.ellipsis = text == "ellipsis";
    } else return false;
    return true;
}

static void drawingCheck(OH_Drawing_ErrorCode code, const char* operation) {
    if (code != OH_DRAWING_SUCCESS) fail(std::string(operation) + " failed, Drawing code " + std::to_string(code));
}

static void nativeRunStyle(OH_Drawing_TextStyle* native, const LabelRunStyle& style, double scale) {
    OH_Drawing_SetTextStyleFontSize(native, style.size * scale);
    OH_Drawing_SetTextStyleFontWeight(native, style.weight / 100 - 1);
    OH_Drawing_SetTextStyleFontStyle(native, style.italic ? FONT_STYLE_ITALIC : FONT_STYLE_NORMAL);
    OH_Drawing_SetTextStyleColor(native, style.color);
    OH_Drawing_SetTextStyleBaseLine(native, TEXT_BASELINE_ALPHABETIC);
    if (!style.family.empty()) {
        const char* families[] = {style.family.c_str()};
        OH_Drawing_SetTextStyleFontFamilies(native, 1, families);
    }
    OH_Drawing_SetTextStyleLetterSpacing(native, style.letterSpacing * scale);
    OH_Drawing_SetTextStyleHalfLeading(native, true);
    // SDK defaults to fontSize multiples; Valdi's relative lineHeight means
    // natural shaped font height. Absolute height instead uses pixel min/max.
    const auto metrics = labelLineMetrics(style, scale);
    drawingCheck(OH_Drawing_SetTextStyleAttributeInt(native, TEXT_STYLE_ATTR_I_LINE_HEIGHT_STYLE,
        metrics.naturalHeight ? TEXT_LINE_HEIGHT_BY_FONT_HEIGHT : TEXT_LINE_HEIGHT_BY_FONT_SIZE),
        "set label line height basis");
    OH_Drawing_SetTextStyleFontHeight(native, metrics.factor);
    if (metrics.absolutePixels) {
        drawingCheck(OH_Drawing_SetTextStyleAttributeDouble(native, TEXT_STYLE_ATTR_D_LINE_HEIGHT_MINIMUM,
            *metrics.absolutePixels), "set label minimum line height");
        drawingCheck(OH_Drawing_SetTextStyleAttributeDouble(native, TEXT_STYLE_ATTR_D_LINE_HEIGHT_MAXIMUM,
            *metrics.absolutePixels), "set label maximum line height");
    }
    const auto decoration = style.decoration == LabelDecoration::None ? TEXT_DECORATION_NONE :
        style.decoration == LabelDecoration::Strike ? TEXT_DECORATION_LINE_THROUGH : TEXT_DECORATION_UNDERLINE;
    const auto decorationStyle = style.decoration == LabelDecoration::Dashed ? TEXT_DECORATION_STYLE_DASHED :
        style.decoration == LabelDecoration::Dotted ? TEXT_DECORATION_STYLE_DOTTED : TEXT_DECORATION_STYLE_SOLID;
    OH_Drawing_SetTextStyleDecoration(native, decoration);
    OH_Drawing_SetTextStyleDecorationStyle(native, decorationStyle);
    OH_Drawing_SetTextStyleDecorationColor(native, style.color);
}

struct NativeLabel {
    // Reverse destruction: paragraph, styled builder, retained run styles,
    // paragraph style, then all backing text/family strings.
    TextStyle defaults;
    std::vector<LabelRun> runs;
    DrawingPtr<OH_Drawing_TypographyStyle, OH_Drawing_DestroyTypographyStyle> paragraphStyle;
    std::vector<DrawingPtr<OH_Drawing_TextStyle, OH_Drawing_DestroyTextStyle>> runStyles;
    DrawingPtr<ArkUI_StyledString, OH_ArkUI_StyledString_Destroy> styled;
    DrawingPtr<OH_Drawing_Typography, OH_Drawing_DestroyTypography> typography;
    std::optional<double> layoutWidth;

    void layout(double width) {
        width = labelParagraphWidth(width);
        if (layoutWidth && *layoutWidth == width) return;
        // External TxtParagraph::Layout does not shape/reflow this paragraph.
        // Both the installed render paragraph and measurement paragraph must
        // enter Rosen TypographyLayout before ArkUI consumes their metrics.
        OH_Drawing_TypographyLayout(typography.get(), width);
        layoutWidth = width;
    }

    NativeLabel(const TextStyle& style, const std::vector<LabelRun>& content, bool rtl, double scale)
        : defaults(style), runs(content),
          paragraphStyle(drawing<OH_Drawing_TypographyStyle, OH_Drawing_DestroyTypographyStyle>(
              OH_Drawing_CreateTypographyStyle())),
          styled(nullptr, OH_ArkUI_StyledString_Destroy), typography(nullptr, OH_Drawing_DestroyTypography) {
        auto* paragraph = paragraphStyle.get();
        OH_Drawing_SetTypographyTextDirection(paragraph, rtl ? TEXT_DIRECTION_RTL : TEXT_DIRECTION_LTR);
        OH_Drawing_SetTypographyTextAlign(paragraph,
            style.alignment == ARKUI_TEXT_ALIGNMENT_START ? TEXT_ALIGN_START :
            style.alignment == ARKUI_TEXT_ALIGNMENT_END ? TEXT_ALIGN_END :
            style.alignment == ARKUI_TEXT_ALIGNMENT_CENTER ? TEXT_ALIGN_CENTER : TEXT_ALIGN_JUSTIFY);
        OH_Drawing_SetTypographyTextFontSize(paragraph, style.size * scale);
        OH_Drawing_SetTypographyTextFontWeight(paragraph, style.weight / 100 - 1);
        OH_Drawing_SetTypographyTextFontStyle(paragraph, style.italic ? FONT_STYLE_ITALIC : FONT_STYLE_NORMAL);
        if (!defaults.family.empty()) OH_Drawing_SetTypographyTextFontFamily(paragraph, defaults.family.c_str());
        if (style.lines > 0) OH_Drawing_SetTypographyTextMaxLines(paragraph, style.lines);
        OH_Drawing_SetTypographyTextEllipsis(paragraph, style.ellipsis ? "\xe2\x80\xa6" : "");
        OH_Drawing_SetTypographyTextEllipsisModal(paragraph, ELLIPSIS_MODAL_TAIL);
        OH_Drawing_SetTypographyTextBreakStrategy(paragraph, BREAK_STRATEGY_GREEDY);
        OH_Drawing_SetTypographyTextWordBreakType(paragraph, WORD_BREAK_TYPE_BREAK_WORD);
        styled = drawing<ArkUI_StyledString, OH_ArkUI_StyledString_Destroy>(
            OH_ArkUI_StyledString_Create(paragraph, globalFonts()));
        runStyles.reserve(runs.size());
        for (const auto& run : runs) {
            auto native = drawing<OH_Drawing_TextStyle, OH_Drawing_DestroyTextStyle>(OH_Drawing_CreateTextStyle());
            nativeRunStyle(native.get(), run.style, scale);
            OH_ArkUI_StyledString_PushTextStyle(styled.get(), native.get());
            OH_ArkUI_StyledString_AddText(styled.get(), run.content.c_str());
            OH_ArkUI_StyledString_PopTextStyle(styled.get());
            runStyles.push_back(std::move(native));
        }
        // The Text setter uses storage->paragraph, populated by this call.
        // StyledString_Destroy does not destroy that paragraph; we own it.
        typography = drawing<OH_Drawing_Typography, OH_Drawing_DestroyTypography>(
            OH_ArkUI_StyledString_CreateTypography(styled.get()));
        // A new Text can be measured independently before its custom parent
        // receives a frame. Prime even empty paragraphs before publishing the
        // external pointer; the wrapper later reflows at its exact pixel width.
        layout(1);
    }
};
