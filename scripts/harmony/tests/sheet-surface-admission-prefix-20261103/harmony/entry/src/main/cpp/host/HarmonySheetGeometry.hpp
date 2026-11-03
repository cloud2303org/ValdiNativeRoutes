#pragma once

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace ValdiHarmony {

// One coherent observation, in logical vp. The available viewport starts at
// window y=0; it may already have lost some/all keyboard height to shell resize.
// keyboardOverlap is measured against the FULL window, never that viewport.
struct HarmonySheetMetrics {
    float width = 0;
    float fullWindowHeight = 0;
    float availableViewportHeight = 0;
    float keyboardOverlap = 0;
    float top = 0;
    float left = 0;
    float right = 0;
    float bottom = 0;
    bool compact = false;
};

struct HarmonySheetGeometry {
    float rootWidth = 0;
    float rootHeight = 0;
    float panelHeight = 0;
    float panelTop = 0;
    float handleHeight = 0;
    float contentHeight = 0;
    float contentInsetTop = 0;
    float contentInsetLeft = 0;
    float contentInsetRight = 0;
    float contentInsetBottom = 0;
    float keyboardCoveredRemainder = 0;
};

inline HarmonySheetGeometry computeHarmonySheetGeometry(const HarmonySheetMetrics& m) {
    // SHEET_GEOMETRY_SCALAR_BEGIN
    if (!std::isfinite(m.width) || !std::isfinite(m.fullWindowHeight) ||
        !std::isfinite(m.availableViewportHeight) || !std::isfinite(m.keyboardOverlap) ||
        !std::isfinite(m.top) || !std::isfinite(m.left) || !std::isfinite(m.right) ||
        !std::isfinite(m.bottom) || m.width < 0 || m.fullWindowHeight < 0 ||
        m.availableViewportHeight < 0 || m.keyboardOverlap < 0 ||
        m.top < 0 || m.left < 0 || m.right < 0 || m.bottom < 0 ||
        m.availableViewportHeight > m.fullWindowHeight) {
        throw std::invalid_argument("Sheet metrics must be finite coherent nonnegative vp");
    }
    HarmonySheetGeometry g;
    g.rootWidth = m.width;
    g.rootHeight = m.availableViewportHeight;
    const float observedResize = m.fullWindowHeight - g.rootHeight;
    const float keyboard = std::min(m.keyboardOverlap, m.fullWindowHeight);
    g.keyboardCoveredRemainder = std::min(g.rootHeight, std::max(0.0f, keyboard - observedResize));
    g.contentInsetLeft = std::min(m.left, g.rootWidth);
    g.contentInsetRight = std::min(m.right, std::max(0.0f, g.rootWidth - g.contentInsetLeft));
    g.contentInsetBottom = std::max(0.0f, m.bottom - keyboard);
    // Preserve the reference fixed detent's full-window top while the shell
    // resizes. Compact keeps its 340vp content until the system-top cap wins.
    const float nominal = m.compact
        ? 24.0f + 340.0f + g.contentInsetBottom + g.keyboardCoveredRemainder
        : std::max(0.0f, 0.75f * m.fullWindowHeight - observedResize);
    const float cap = std::max(0.0f, g.rootHeight - m.top);
    g.panelHeight = std::min(nominal, cap);
    g.panelTop = g.rootHeight - g.panelHeight;
    g.handleHeight = std::min(24.0f, g.panelHeight);
    g.contentHeight = std::max(0.0f, g.panelHeight - g.handleHeight - g.keyboardCoveredRemainder);
    // Insets go to the real page's layout specs, not viewport padding too.
    g.contentInsetTop = 0;
    g.contentInsetBottom = std::min(g.contentInsetBottom, g.contentHeight);
    return g;
    // SHEET_GEOMETRY_SCALAR_END
}

} // namespace ValdiHarmony
