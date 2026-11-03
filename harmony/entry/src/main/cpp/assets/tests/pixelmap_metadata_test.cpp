// Official PixelmapNative docs distinguish the default alpha type from the
// current image alpha mode. Exercise that semantic difference with distinct
// values, using the production SDK-typed seam and audited public OH6 behavior.
// This is not vendor SDK26 execution or proof of native pixel output.
#include "../HarmonyImagePixelmapMetadata.hpp"
#include <cassert>
#include <iostream>

struct OH_PixelmapNative { int32_t nativeAlpha; };
struct OH_Pixelmap_ImageInfo { int32_t alphaMode = 0, alphaType = 0; };

namespace {
int infoReads = 0, modeReads = 0, defaultReads = 0;
Image_ErrorCode infoError = IMAGE_SUCCESS, modeError = IMAGE_SUCCESS;
void reset() {
    infoReads = modeReads = defaultReads = 0;
    infoError = modeError = IMAGE_SUCCESS;
}
} // namespace

extern "C" {
Image_ErrorCode OH_PixelmapNative_GetImageInfo(OH_PixelmapNative* pixelmap, OH_Pixelmap_ImageInfo* info) {
    ++infoReads;
    if (infoError != IMAGE_SUCCESS) return infoError;
    info->alphaMode = pixelmap->nativeAlpha;
    // Public OH6 GetImageInfo does not write info->alphaType.
    return IMAGE_SUCCESS;
}
Image_ErrorCode OH_PixelmapImageInfo_GetAlphaMode(OH_Pixelmap_ImageInfo* info, int32_t* alpha) {
    ++modeReads;
    assert(infoReads == 1);
    if (modeError != IMAGE_SUCCESS) return modeError;
    *alpha = info->alphaMode;
    return IMAGE_SUCCESS;
}
Image_ErrorCode OH_PixelmapImageInfo_GetAlphaType(OH_Pixelmap_ImageInfo* info, int32_t* alpha) {
    ++defaultReads;
    *alpha = info->alphaType;
    return IMAGE_SUCCESS;
}
} // extern "C"

namespace {
void readsCurrentAlphaInsteadOfDefaultAlpha() {
    for (int32_t nativeAlpha : {PIXELMAP_ALPHA_TYPE_OPAQUE, PIXELMAP_ALPHA_TYPE_PREMULTIPLIED,
                                PIXELMAP_ALPHA_TYPE_UNPREMULTIPLIED}) {
        for (int32_t defaultAlpha : {PIXELMAP_ALPHA_TYPE_UNKNOWN, PIXELMAP_ALPHA_TYPE_OPAQUE,
                                     PIXELMAP_ALPHA_TYPE_PREMULTIPLIED,
                                     PIXELMAP_ALPHA_TYPE_UNPREMULTIPLIED}) {
            reset();
            OH_PixelmapNative pixelmap{nativeAlpha};
            OH_Pixelmap_ImageInfo info;
            info.alphaType = defaultAlpha;
            int32_t alpha = -1;
            assert(ValdiHarmony::readHarmonyImagePixelmapMetadata(&pixelmap, &info, &alpha) == IMAGE_SUCCESS);
            assert(alpha == nativeAlpha && info.alphaType == defaultAlpha);
            assert(modeReads == 1 && defaultReads == 0);
            assert(pixelmap.nativeAlpha == nativeAlpha); // read-only; no normalization or relabel
        }
    }
}

void doesNotRelabelActuallyUnknownModes() {
    reset();
    OH_PixelmapNative pixelmap{PIXELMAP_ALPHA_TYPE_UNKNOWN};
    OH_Pixelmap_ImageInfo info;
    info.alphaType = PIXELMAP_ALPHA_TYPE_PREMULTIPLIED; // known default must not hide unknown current mode
    int32_t alpha = -1;
    assert(ValdiHarmony::readHarmonyImagePixelmapMetadata(&pixelmap, &info, &alpha) == IMAGE_SUCCESS);
    assert(alpha == PIXELMAP_ALPHA_TYPE_UNKNOWN && modeReads == 1 && defaultReads == 0);
}

void propagatesSdkErrorsWithoutFallback() {
    reset();
    OH_PixelmapNative pixelmap{PIXELMAP_ALPHA_TYPE_PREMULTIPLIED};
    OH_Pixelmap_ImageInfo info;
    int32_t alpha = -1;
    infoError = IMAGE_BAD_PARAMETER;
    assert(ValdiHarmony::readHarmonyImagePixelmapMetadata(&pixelmap, &info, &alpha) == IMAGE_BAD_PARAMETER);
    assert(alpha == -1 && infoReads == 1 && modeReads == 0 && defaultReads == 0);
    reset();
    modeError = IMAGE_BAD_PARAMETER;
    assert(ValdiHarmony::readHarmonyImagePixelmapMetadata(&pixelmap, &info, &alpha) == IMAGE_BAD_PARAMETER);
    assert(alpha == -1 && infoReads == 1 && modeReads == 1 && defaultReads == 0);
}
} // namespace

int main() {
    readsCurrentAlphaInsteadOfDefaultAlpha();
    doesNotRelabelActuallyUnknownModes();
    propagatesSdkErrorsWithoutFallback();
    std::cout << "Production pixelmap metadata seam: 3 groups passed (SDK-header-typed fault injection)\n";
}
