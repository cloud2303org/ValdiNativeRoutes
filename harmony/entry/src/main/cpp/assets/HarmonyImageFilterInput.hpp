#pragma once

#include "HarmonyImageFilterPolicy.hpp"
#include <string>

namespace ValdiHarmony {

// Numeric SDK metadata only: never include source URLs, encoded bytes or pixels.
template<typename Info>
std::string describeHarmonyImagePixelmap(const Info& info) {
    return "pixelFormat=" + std::to_string(info.pixelFormat) +
           ", alphaType=" + std::to_string(info.alphaType) +
           ", width=" + std::to_string(info.width) +
           ", height=" + std::to_string(info.height) +
           ", rowStride=" + std::to_string(info.rowStride) +
           ", allocationBytes=" + std::to_string(info.allocationBytes);
}

// The decoder has already validated its output's format and allocation. Keep
// layout/combined-memory checks for every caller, but do not make an identity
// asset depend on Drawing-only format/alpha requirements or another SDK query.
// The renderer callback contains ALL Drawing metadata reads and allocations.
// Kept independent of Valdi/SDK types so this production dispatch can be tested
// with a renderer that rejects metadata, without pretending to render pixels.
template<typename Result, typename Source, typename IsCanceled, typename Render, typename Failure>
Result dispatchHarmonyImageFilter(
    const Source& source, const HarmonyImageFilterSpec& spec, uint64_t encodedWorkingBytes,
    IsCanceled&& wasCanceled, Render&& render, Failure&& failure) {
    if (wasCanceled()) return failure("Harmony image filter canceled");
    if (!spec.valid()) return failure("Harmony image filter snapshot is invalid");
    const auto& info = source->getInfo();
    if (!ImageDecodePolicy::validDecodedLayout(info.width, info.height,
                                               info.rowStride, info.allocationBytes)) {
        return failure("Harmony image filter source decoded layout exceeds the 64 MiB RGBA budget");
    }
    const auto destinationEstimate = spec.isIdentity() ? 0 :
        ImageFilterPolicy::surfaceBytes(info.width, info.height);
    if (!ImageFilterPolicy::renderWorkingBytes(info.width, info.height, info.allocationBytes,
                                               destinationEstimate, encodedWorkingBytes, spec)) {
        return failure("Harmony image filter total working set exceeds 128 MiB");
    }
    if (wasCanceled()) return failure("Harmony image filter canceled");
    if (spec.isIdentity()) return source;
    return render();
}

} // namespace ValdiHarmony
