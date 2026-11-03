#pragma once

#include "HarmonyImageFilterGraph.hpp"
#include <functional>
#include <multimedia/image_framework/image/pixelmap_native.h>

namespace ValdiHarmony {

// Actual production C-API drawing seam. No Valdi/runtime dependencies; both
// OHOS ABI tests strictly link this entire object against the real SDK.
// Caller validates/owns pixelmap layouts and working-set admission. Source and
// destination must be distinct; destination is private until this returns.
ImageFilterRenderStatus drawHarmonyImageFilterPixels(
    OH_PixelmapNative* source, OH_PixelmapNative* destination, uint32_t width, uint32_t height,
    const HarmonyImageFilterSpec& spec, const std::function<bool()>& wasCanceled);

} // namespace ValdiHarmony
