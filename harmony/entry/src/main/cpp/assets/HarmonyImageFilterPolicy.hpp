#pragma once

#include "HarmonyImageDecodePolicy.hpp"
#include <array>
#include <cmath>
#include <optional>

namespace ValdiHarmony {

// A value snapshot, never a borrowed/mutable ImageFilter across a worker hop.
struct HarmonyImageFilterSpec {
    std::array<float, 20> matrix{1, 0, 0, 0, 0,
                               0, 1, 0, 0, 0,
                               0, 0, 1, 0, 0,
                               0, 0, 0, 1, 0};
    float sigma = 0;

    bool hasMatrix() const {
        return matrix != HarmonyImageFilterSpec{}.matrix;
    }
    bool isIdentity() const { return sigma == 0 && !hasMatrix(); }
    bool valid() const {
        if (!std::isfinite(sigma) || sigma < 0 || sigma > 128) return false;
        for (auto value : matrix) {
            if (!std::isfinite(value) || std::abs(value) > 1000000) return false;
        }
        return true;
    }
    std::array<float, 20> drawingMatrix() const {
        // The float Drawing API forwards all 20 coefficients to
        // SkColorFilters::Matrix. Biases, including alpha, stay normalized.
        // See IMAGE_API.md for immutable public OH6 source provenance and the
        // separate SDK26 vendor-runtime validation boundary.
        return matrix;
    }
};

namespace ImageFilterPolicy {

inline constexpr uint64_t kMaxWorkingBytes = 128U * 1024U * 1024U;

// Charge aligned rows, not only logical pixels. No caller-supplied multiplication
// can overflow: dimensions and sigma are validated before padding/arithmetic.
inline uint64_t surfaceBytes(uint32_t width, uint32_t height) {
    return ((uint64_t(width) * 4 + 255) / 256) * 256 * height;
}

inline std::optional<uint64_t> renderWorkingBytes(
    uint32_t width, uint32_t height, uint64_t sourceAllocation, uint64_t destinationAllocation,
    uint64_t encodedWorkingBytes, const HarmonyImageFilterSpec& spec) {
    using namespace ImageDecodePolicy;
    if (!validDimensions(width, height) || !spec.valid() ||
        sourceAllocation > kMaxDecodedBytes || destinationAllocation > kMaxDecodedBytes ||
        encodedWorkingBytes > 2 * kMaxEncodedBytes) return {};
    uint64_t result = encodedWorkingBytes + sourceAllocation;
    if (!spec.isIdentity()) {
        result += destinationAllocation;
        // Drawing can materialize its source as an immutable image.
        result += surfaceBytes(width, height);
        if (spec.sigma > 0) {
            const auto halo = uint32_t(std::ceil(3.0 * spec.sigma));
            // Reserve matrix output and two separable-blur work surfaces,
            // including 3-sigma halos on both sides. Do not independently admit
            // source/destination/scratch up to the per-pixelmap cap.
            result += 3 * surfaceBytes(width + 2 * halo, height + 2 * halo);
        } else if (spec.hasMatrix()) {
            result += surfaceBytes(width, height);
        }
    }
    if (result > kMaxWorkingBytes) return {};
    return result;
}

inline bool admitsDecode(size_t encodedBytes, uint32_t sourceWidth, uint32_t sourceHeight,
                         ImageDecodePolicy::Size target, const HarmonyImageFilterSpec& spec) {
    using namespace ImageDecodePolicy;
    if (encodedBytes > kMaxEncodedBytes || !validDimensions(sourceWidth, sourceHeight) ||
        !validDimensions(target.width, target.height) || !spec.valid()) return false;
    const auto decoded = surfaceBytes(target.width, target.height);
    // Borrowed downloader storage can coexist with the owned copy if the worker
    // executes inline. Allow a full intrinsic codec intermediate plus a second
    // intrinsic workspace, even for preferred-size decoding.
    const auto decodePeak = 2 * uint64_t(encodedBytes) +
                            2 * surfaceBytes(sourceWidth, sourceHeight) + decoded;
    return decodePeak <= kMaxWorkingBytes &&
           renderWorkingBytes(target.width, target.height, decoded, decoded,
                              2 * uint64_t(encodedBytes), spec).has_value();
}

} // namespace ImageFilterPolicy
} // namespace ValdiHarmony
