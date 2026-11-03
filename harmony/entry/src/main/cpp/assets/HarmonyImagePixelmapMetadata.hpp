#pragma once

#include <multimedia/image_framework/image/pixelmap_native.h>

namespace ValdiHarmony {

// GetImageInfo populates alphaMode; GetAlphaType reads a different field in
// public OH6. Read that populated native mode without changing pixels or
// treating UNKNOWN as a known alpha type. GetAlphaMode is an SDK C API since 20.
// See IMAGE_API.md for immutable provenance and the vendor-runtime boundary.
inline Image_ErrorCode readHarmonyImagePixelmapMetadata(
    OH_PixelmapNative* pixelmap, OH_Pixelmap_ImageInfo* info, int32_t* alphaType) {
    const auto code = OH_PixelmapNative_GetImageInfo(pixelmap, info);
    if (code != IMAGE_SUCCESS) return code;
    return OH_PixelmapImageInfo_GetAlphaMode(info, alphaType);
}

} // namespace ValdiHarmony
