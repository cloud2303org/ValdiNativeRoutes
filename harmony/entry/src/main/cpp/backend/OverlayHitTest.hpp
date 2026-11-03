#pragma once
#include <optional>

namespace Valdi::Harmony::detail {

enum class OverlayHitMode { Default, None, BlockHierarchy, BlockDescendants };

struct OverlayHitPolicy {
    OverlayHitMode mode;
    bool passToChildren;
};

// NONE skips only self. BLOCK_HIERARCHY carries an interactive descendant's hit
// through every NONE ancestor, so an underlying sibling cannot also activate.
// TRANSPARENT would allow that sibling to join even when a child hit.
inline OverlayHitPolicy overlayHitPolicy(bool scope, bool enabled, bool interactive) {
    if (!enabled) return {OverlayHitMode::BlockDescendants, scope};
    if (!scope) return {OverlayHitMode::Default, false};
    if (interactive) return {OverlayHitMode::BlockHierarchy, false};
    return {OverlayHitMode::None, true};
}

// The native intercept result is installed on the FrameNode for this hit.
// Keep the saved policy separate from a previous predicate's rejection mode.
inline std::optional<OverlayHitMode> overlayInterceptMode(bool managed, OverlayHitMode saved, bool admitted) {
    if (!admitted) return OverlayHitMode::BlockDescendants;
    if (managed) return saved;
    return std::nullopt;
}

} // namespace Valdi::Harmony::detail
