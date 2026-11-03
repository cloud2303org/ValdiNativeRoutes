#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdint>

namespace ValdiHarmony::ImageDecodePolicy {

inline constexpr size_t kMaxEncodedBytes = 32U * 1024U * 1024U;
inline constexpr uint32_t kMaxDimension = 8192;
inline constexpr uint64_t kMaxPixels = 16U * 1024U * 1024U;
inline constexpr uint64_t kMaxDecodedBytes = 64U * 1024U * 1024U;

struct Size {
    uint32_t width;
    uint32_t height;
};

inline bool validDimensions(uint32_t width, uint32_t height) {
    return width > 0 && height > 0 && width <= kMaxDimension && height <= kMaxDimension &&
           uint64_t(width) * height <= kMaxPixels;
}

inline bool validPreferredSize(int32_t width, int32_t height) {
    return width >= 0 && height >= 0 && uint32_t(width) <= kMaxDimension &&
           uint32_t(height) <= kMaxDimension;
}

// Integer fit inside a preferred box, preserving aspect ratio to pixel rounding.
// Zero is unspecified; never send a zero dimension to the SDK. Never upscale.
inline Size targetSize(uint32_t width, uint32_t height, int32_t preferredWidth, int32_t preferredHeight) {
    Size result{width, height};
    if (preferredWidth > 0 && uint32_t(preferredWidth) < result.width) {
        result.width = uint32_t(preferredWidth);
        result.height = std::max(uint32_t(1), uint32_t(uint64_t(height) * result.width / width));
    }
    if (preferredHeight > 0 && uint32_t(preferredHeight) < result.height) {
        result.height = uint32_t(preferredHeight);
        result.width = std::max(uint32_t(1), uint32_t(uint64_t(width) * result.height / height));
    }
    return result;
}

inline bool validDecodedLayout(uint32_t width, uint32_t height, uint32_t rowStride,
                               uint32_t allocationBytes) {
    return validDimensions(width, height) && uint64_t(rowStride) >= uint64_t(width) * 4 &&
           uint64_t(rowStride) * height <= kMaxDecodedBytes &&
           uint64_t(allocationBytes) >= uint64_t(rowStride) * height &&
           allocationBytes <= kMaxDecodedBytes;
}

} // namespace ValdiHarmony::ImageDecodePolicy
