#pragma once

#include "FontResolver.hpp"
#include <optional>

namespace Valdi::Harmony::detail {

enum class LabelDecoration { None, Strike, Underline, Dashed, Dotted };

struct LabelFont : FontSpec {
    bool italic = false;
};

// Keep editor shorthand unchanged. Labels additionally accept the pinned
// iOS/Android system italic forms; module fonts use their own file's slant.
inline LabelFont parseLabelFont(std::string_view value) {
    std::istringstream input{std::string(value)};
    std::string name, size, extra;
    if (!(input >> name >> size) || (input >> extra))
        throw std::runtime_error("font requires a family and a positive finite point size");
    bool italic = false;
    if (name.starts_with("system-")) {
        if (name.ends_with("-italic")) {
            italic = true;
            name.resize(name.size() - 7);
        }
        if (name == "system-demi-bold") name = "system-semibold";
    }
    auto parsed = parseFont(name + " " + size);
    return {std::move(parsed), italic};
}

inline LabelDecoration labelDecoration(std::string_view name) {
    if (name == "none") return LabelDecoration::None;
    if (name == "strikethrough") return LabelDecoration::Strike;
    if (name == "underline") return LabelDecoration::Underline;
    if (name == "dashed-underline") return LabelDecoration::Dashed;
    if (name == "dotted-underline") return LabelDecoration::Dotted;
    throw std::runtime_error("unsupported textDecoration: " + std::string(name));
}

inline uint32_t labelARGB(int64_t color) {
    const auto rgba = static_cast<uint32_t>(color);
    return (rgba >> 8) | (rgba << 24);
}

struct LabelRunStyle : LabelFont {
    uint32_t color = 0xff000000;
    LabelDecoration decoration = LabelDecoration::None;
    double letterSpacing = 0;
    double lineHeight = 1;
    std::optional<double> lineHeightAbsolute;
};

struct LabelRunOverride {
    std::string content;
    std::optional<LabelFont> font;
    std::optional<uint32_t> color;
    std::optional<LabelDecoration> decoration;
};

struct LabelRun {
    std::string content;
    LabelRunStyle style;
};

struct TextStyle : LabelRunStyle {
    std::string text;
    std::vector<LabelRunOverride> runs;
    bool attributed = false;
    int lines = 1;
    bool ellipsis = true;
    int alignment = 0; // SDK ARKUI_TEXT_ALIGNMENT_START, checked at the boundary.
};

struct LabelLineMetrics {
    bool naturalHeight;
    double factor;
    std::optional<double> absolutePixels;
};

inline double labelParagraphWidth(double physicalPixels) {
    if (!std::isfinite(physicalPixels) || physicalPixels < 0)
        throw std::runtime_error("native label requires finite nonnegative pixel width");
    // SDK TypographyLayout requires > 0 even for a zero-size/empty view.
    // The native wrapper still owns its exact (possibly zero) clip/frame.
    return std::max(1.0, physicalPixels);
}

inline bool labelHasPaintArea(int32_t width, int32_t height) {
    return width > 0 && height > 0;
}

inline LabelLineMetrics labelLineMetrics(const LabelRunStyle& style, double scale) {
    return {!style.lineHeightAbsolute,
            style.lineHeightAbsolute ? *style.lineHeightAbsolute / style.size : style.lineHeight,
            style.lineHeightAbsolute ? std::optional(*style.lineHeightAbsolute * scale) : std::nullopt};
}

inline void labelScalar(double value, const char* name, bool positive) {
    if (!std::isfinite(value) || std::abs(value) > 100000 || (positive && value <= 0))
        throw std::runtime_error(std::string(name) + " must be finite " +
                                 (positive ? "and positive" : "points") + " within 100000");
}

inline void validateLabelContent(std::string_view value) {
    // The SDK AddText API has no byte length. Never silently truncate a run.
    if (value.find('\0') != std::string_view::npos)
        throw std::runtime_error("embedded NUL in label text is unsupported by SDK AddText");
}

inline LabelRun inheritLabelRun(const LabelRunStyle& base, const LabelRunOverride& part) {
    validateLabelContent(part.content);
    LabelRun run{part.content, base};
    if (part.font) static_cast<LabelFont&>(run.style) = *part.font;
    if (part.color) run.style.color = *part.color;
    if (part.decoration) run.style.decoration = *part.decoration;
    return run;
}

// This is the production resolution/publish boundary. A font loader may replace
// the value/style, detach the node, or destroy the host synchronously. Check
// after every lookup, not only after the final span, and never publish stale
// aliases. The snapshot owns all run strings and styles across reentry.
template<class Snapshot, class Resolve, class Valid, class Publish>
bool applyResolvedLabel(FontApplicationEpoch& epoch, Snapshot snapshot,
                        Resolve&& resolve, Valid&& valid, Publish&& publish) {
    const auto generation = ++epoch.generation;
    std::vector<LabelRun> runs;
    if (snapshot.attributed) {
        for (const auto& part : snapshot.runs) runs.push_back(inheritLabelRun(snapshot, part));
    } else {
        runs.push_back(inheritLabelRun(snapshot, {snapshot.text, {}, {}, {}}));
    }
    // Resolve the paragraph default too: empty labels and ellipsis use it.
    std::vector<std::pair<std::string, std::string>> aliases;
    const auto familyAlias = [&](const std::string& family) {
        for (const auto& [name, alias] : aliases) if (name == family) return alias;
        auto alias = resolve(family);
        aliases.emplace_back(family, alias);
        return alias;
    };
    snapshot.family = familyAlias(snapshot.family);
    if (epoch.generation != generation || !valid()) return false;
    for (auto& run : runs) {
        run.style.family = familyAlias(run.style.family);
        if (epoch.generation != generation || !valid()) return false;
    }
    publish(snapshot, runs);
    return true;
}

} // namespace Valdi::Harmony::detail
