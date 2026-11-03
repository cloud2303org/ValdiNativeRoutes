#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace Valdi::Harmony::detail {

// Constraints are in points; negative bounds mean unspecified. Exact bounds
// determine that axis and derive the unconstrained axis from aspect ratio.
inline std::array<float, 2> imageIntrinsicSize(float intrinsicWidth, float intrinsicHeight,
                                              float width, bool exactWidth,
                                              float height, bool exactHeight) {
    if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
        return {exactWidth ? width : 0, exactHeight ? height : 0};
    }
    float ratio = 1;
    if (exactWidth) ratio = width / intrinsicWidth;
    else if (exactHeight) ratio = height / intrinsicHeight;
    if (!exactWidth && width >= 0) ratio = std::min(ratio, width / intrinsicWidth);
    if (!exactHeight && height >= 0) ratio = std::min(ratio, height / intrinsicHeight);
    return {exactWidth ? width : intrinsicWidth * ratio,
            exactHeight ? height : intrinsicHeight * ratio};
}

// SRC_IN tint: RGB comes from the tint; source alpha is multiplied by tint
// alpha. Offsets in the SDK 4x5 matrix are channel values in [0,255].
inline std::array<float, 20> imageTintMatrix(uint32_t argb) {
    std::array<float, 20> matrix {};
    matrix[4] = float((argb >> 16) & 255);
    matrix[9] = float((argb >> 8) & 255);
    matrix[14] = float(argb & 255);
    matrix[18] = float((argb >> 24) & 255) / 255;
    return matrix;
}

} // namespace Valdi::Harmony::detail
