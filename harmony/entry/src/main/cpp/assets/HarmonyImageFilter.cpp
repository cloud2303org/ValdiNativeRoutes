#include "HarmonyImageFilter.hpp"
#include "HarmonyImageDrawing.hpp"
#include "HarmonyImageFilterInput.hpp"
#include "HarmonyImageNativeOwner.hpp"
#include "HarmonyImagePixelmapMetadata.hpp"

#include "valdi_core/cpp/Attributes/ImageFilter.hpp"

#include <algorithm>
#include <string>

namespace ValdiHarmony {
namespace {

void destroyPixelmap(OH_PixelmapNative* value) { OH_PixelmapNative_Destroy(&value); }

Valdi::Error nativeError(const char* operation, int32_t code) {
    return Valdi::Error(std::string("Harmony image filter ") + operation +
                        " failed (SDK code " + std::to_string(code) + ")");
}

Valdi::Result<HarmonyImageAsset::Info> readInfo(OH_PixelmapNative* pixelmap,
                                              const HarmonyImageAsset::Info& sourceInfo,
                                              const char* role) {
    ImageNativeOwner<OH_Pixelmap_ImageInfo, OH_PixelmapImageInfo_Release> nativeInfo;
    auto code = OH_PixelmapImageInfo_Create(&nativeInfo.value);
    if (code != IMAGE_SUCCESS || !nativeInfo.value) return nativeError("create info", code);
    HarmonyImageAsset::Info result = sourceInfo;
#define IMAGE_FILTER_READ(call) \
    do { code = (call); if (code != IMAGE_SUCCESS) return nativeError(#call, code); } while (false)
    IMAGE_FILTER_READ(readHarmonyImagePixelmapMetadata(pixelmap, nativeInfo.value, &result.alphaType));
    IMAGE_FILTER_READ(OH_PixelmapImageInfo_GetWidth(nativeInfo.value, &result.width));
    IMAGE_FILTER_READ(OH_PixelmapImageInfo_GetHeight(nativeInfo.value, &result.height));
    IMAGE_FILTER_READ(OH_PixelmapImageInfo_GetRowStride(nativeInfo.value, &result.rowStride));
    IMAGE_FILTER_READ(OH_PixelmapImageInfo_GetPixelFormat(nativeInfo.value, &result.pixelFormat));
    IMAGE_FILTER_READ(OH_PixelmapNative_GetAllocationByteCount(pixelmap, &result.allocationBytes));
#undef IMAGE_FILTER_READ
    if (result.pixelFormat != PIXEL_FORMAT_RGBA_8888 ||
        (result.alphaType != PIXELMAP_ALPHA_TYPE_OPAQUE &&
         result.alphaType != PIXELMAP_ALPHA_TYPE_PREMULTIPLIED &&
         result.alphaType != PIXELMAP_ALPHA_TYPE_UNPREMULTIPLIED) ||
        !ImageDecodePolicy::validDecodedLayout(result.width, result.height,
                                               result.rowStride, result.allocationBytes)) {
        return Valdi::Error(std::string("Harmony image effective filter unsupported ") + role +
                            " pixelmap metadata (" + describeHarmonyImagePixelmap(result) +
                            "; alphaAccessor=GetAlphaMode, expectedPixelFormat=" +
                            std::to_string(PIXEL_FORMAT_RGBA_8888) +
                            ", knownAlphaTypes=[" + std::to_string(PIXELMAP_ALPHA_TYPE_OPAQUE) + "," +
                            std::to_string(PIXELMAP_ALPHA_TYPE_PREMULTIPLIED) + "," +
                            std::to_string(PIXELMAP_ALPHA_TYPE_UNPREMULTIPLIED) + "])");
    }
    return result;
}

} // namespace

Valdi::Result<HarmonyImageFilterSpec> snapshotHarmonyImageFilter(const Valdi::Value& associatedData) {
    HarmonyImageFilterSpec result;
    if (associatedData.isNullOrUndefined()) return result;
    auto filter = associatedData.getTypedRef<Valdi::ImageFilter>();
    if (filter == nullptr) return Valdi::Error("Harmony image associated data must be a typed Valdi::ImageFilter");
    static_assert(Valdi::ImageFilter::kColorMatrixSize == 20);
    std::copy_n(filter->getColorMatrix(), result.matrix.size(), result.matrix.begin());
    result.sigma = filter->getBlurRadius();
    if (!result.valid()) {
        return Valdi::Error("Harmony image filter requires finite matrix coefficients within +/-1000000 "
                            "and blur radius between 0 and 128 decoded pixels");
    }
    return result;
}

Valdi::Result<Valdi::Ref<HarmonyImageAsset>> filterHarmonyImage(
    const Valdi::Ref<HarmonyImageAsset>& source, const HarmonyImageFilterSpec& spec,
    const std::function<bool()>& wasCanceled, uint64_t encodedWorkingBytes) {
    if (source == nullptr || !source->getPixelmap() || !spec.valid()) {
        return Valdi::Error("Harmony image filter requires a valid source and filter snapshot");
    }
    encodedWorkingBytes = std::max(encodedWorkingBytes, uint64_t(source->getRetainedSourceBytes().size()));
    using FilterResult = Valdi::Result<Valdi::Ref<HarmonyImageAsset>>;
    return dispatchHarmonyImageFilter<FilterResult>(
        source, spec, encodedWorkingBytes, wasCanceled, [&]() -> FilterResult {
            auto sourceInfo = readInfo(source->getPixelmap(), source->getInfo(), "source");
            if (!sourceInfo) return sourceInfo.error();
            const auto& input = sourceInfo.value();
            auto destinationEstimate = ImageFilterPolicy::surfaceBytes(input.width, input.height);
            if (!ImageFilterPolicy::renderWorkingBytes(input.width, input.height, input.allocationBytes,
                                                       destinationEstimate, encodedWorkingBytes, spec)) {
                return Valdi::Error("Harmony image filter total working set exceeds 128 MiB");
            }
            ImageNativeOwner<OH_Pixelmap_InitializationOptions, OH_PixelmapInitializationOptions_Release> options;
            auto code = OH_PixelmapInitializationOptions_Create(&options.value);
            if (code != IMAGE_SUCCESS || !options.value) return nativeError("create options", code);
#define IMAGE_FILTER_SET(call) \
            do { code = (call); if (code != IMAGE_SUCCESS) return nativeError(#call, code); } while (false)
            IMAGE_FILTER_SET(OH_PixelmapInitializationOptions_SetWidth(options.value, input.width));
            IMAGE_FILTER_SET(OH_PixelmapInitializationOptions_SetHeight(options.value, input.height));
            IMAGE_FILTER_SET(OH_PixelmapInitializationOptions_SetPixelFormat(options.value, PIXEL_FORMAT_RGBA_8888));
            IMAGE_FILTER_SET(OH_PixelmapInitializationOptions_SetAlphaType(options.value, PIXELMAP_ALPHA_TYPE_PREMULTIPLIED));
            IMAGE_FILTER_SET(OH_PixelmapInitializationOptions_SetEditable(options.value, false));
            if (wasCanceled()) return Valdi::Error("Harmony image filter canceled");

            ImageNativeOwner<OH_PixelmapNative, destroyPixelmap> destination;
            IMAGE_FILTER_SET(OH_PixelmapNative_CreateEmptyPixelmapUsingAllocator(
                options.value, IMAGE_ALLOCATOR_MODE_SHARED_MEMORY, &destination.value));
#undef IMAGE_FILTER_SET
            if (!destination.value) return Valdi::Error("Harmony image filter SDK returned an empty destination");
            auto destinationInfo = readInfo(destination.value, input, "destination");
            if (!destinationInfo) return destinationInfo.error();
            const auto& output = destinationInfo.value();
            if (output.width != input.width || output.height != input.height ||
                output.alphaType != PIXELMAP_ALPHA_TYPE_PREMULTIPLIED ||
                !ImageFilterPolicy::renderWorkingBytes(input.width, input.height, input.allocationBytes,
                                                       output.allocationBytes, encodedWorkingBytes, spec)) {
                return Valdi::Error("Harmony image filter destination layout or total working set is invalid (" +
                                    describeHarmonyImagePixelmap(output) + ")");
            }
            if (wasCanceled()) return Valdi::Error("Harmony image filter canceled");

            const auto status = drawHarmonyImageFilterPixels(
                source->getPixelmap(), destination.value, input.width, input.height, spec, wasCanceled);
            if (status != ImageFilterRenderStatus::Success) {
                return Valdi::Error(std::string("Harmony image native filter failed at stage ") +
                                    std::to_string(static_cast<int>(status)));
            }
            if (wasCanceled()) return Valdi::Error("Harmony image filter canceled");
            // Retain encoded source bytes, not a lossy re-encode of the rendered result.
            auto asset = Valdi::makeShared<HarmonyImageAsset>(
                destination.value, output, source->getRetainedSourceBytes());
            destination.release();
            return asset;
        }, [&](const char* message) -> FilterResult {
            return Valdi::Error(std::string(message) + " (" + describeHarmonyImagePixelmap(source->getInfo()) + ")");
        });
}

} // namespace ValdiHarmony
