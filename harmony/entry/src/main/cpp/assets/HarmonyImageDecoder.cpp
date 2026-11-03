#include "HarmonyImageDecoder.hpp"
#include "HarmonyImageDecodePolicy.hpp"
#include "HarmonyImageFilter.hpp"
#include "HarmonyImageFilterInput.hpp"
#include "HarmonyImageNativeOwner.hpp"
#include "HarmonyImagePixelmapMetadata.hpp"

#include <multimedia/image_framework/image/image_source_native.h>
#include <memory>
#include <string>

namespace ValdiHarmony {
namespace {

template<typename T, auto Release>
using NativeOwner = ImageNativeOwner<T, Release>;

void destroyPixelmap(OH_PixelmapNative* value) {
    OH_PixelmapNative_Destroy(&value);
}

Valdi::Error sdkError(const char* operation, Image_ErrorCode code) {
    return Valdi::Error(std::string("Harmony image ") + operation + " failed (SDK code " +
                        std::to_string(static_cast<int32_t>(code)) + ")");
}

} // namespace

Valdi::Result<Valdi::Ref<Valdi::LoadedAsset>> decodeHarmonyImage(
    const Valdi::Ref<Valdi::Bytes>& ownedBytes, int32_t preferredWidth, int32_t preferredHeight,
    bool retainEncodedBytes, const std::function<bool()>& wasCanceled,
    const HarmonyImageFilterSpec& filter) {
    using namespace ImageDecodePolicy;
    if (ownedBytes == nullptr || ownedBytes->empty() || ownedBytes->size() > kMaxEncodedBytes) {
        return Valdi::Error("Harmony image encoded data is empty or exceeds 32 MiB");
    }
    if (!validPreferredSize(preferredWidth, preferredHeight)) {
        return Valdi::Error("Harmony image preferred dimensions must be between 0 and 8192");
    }
    if (wasCanceled()) return Valdi::Error("Harmony image load canceled");

    NativeOwner<OH_ImageSourceNative, OH_ImageSourceNative_Release> source;
    auto code = OH_ImageSourceNative_CreateFromDataWithUserBuffer(
        ownedBytes->data(), ownedBytes->size(), &source.value);
    if (code != IMAGE_SUCCESS) return sdkError("create source", code);
    if (!source.value) return Valdi::Error("Harmony image SDK returned an empty source");

    NativeOwner<OH_ImageSource_Info, OH_ImageSourceInfo_Release> sourceInfo;
    code = OH_ImageSourceInfo_Create(&sourceInfo.value);
    if (code != IMAGE_SUCCESS) return sdkError("create source info", code);
    code = OH_ImageSourceNative_GetImageInfo(source.value, 0, sourceInfo.value);
    if (code != IMAGE_SUCCESS) return sdkError("read source info", code);
    uint32_t width = 0, height = 0;
    code = OH_ImageSourceInfo_GetWidth(sourceInfo.value, &width);
    if (code != IMAGE_SUCCESS) return sdkError("read source width", code);
    code = OH_ImageSourceInfo_GetHeight(sourceInfo.value, &height);
    if (code != IMAGE_SUCCESS) return sdkError("read source height", code);
    // Bound full intrinsic size too: some codecs allocate a full-size intermediate
    // even when asked to downsample. Preferred sizing must not bypass this guard.
    if (!validDimensions(width, height)) {
        return Valdi::Error("Harmony image intrinsic dimensions exceed the 8192 / 16-megapixel budget");
    }
    const auto size = targetSize(width, height, preferredWidth, preferredHeight);
    if (!ImageFilterPolicy::admitsDecode(ownedBytes->size(), width, height, size, filter)) {
        return Valdi::Error("Harmony image decode/filter total working set exceeds 128 MiB or filter is invalid");
    }
    if (wasCanceled()) return Valdi::Error("Harmony image load canceled");

    NativeOwner<OH_DecodingOptions, OH_DecodingOptions_Release> options;
    code = OH_DecodingOptions_Create(&options.value);
    if (code != IMAGE_SUCCESS) return sdkError("create decoding options", code);
    code = OH_DecodingOptions_SetPixelFormat(options.value, PIXEL_FORMAT_RGBA_8888);
    if (code != IMAGE_SUCCESS) return sdkError("set RGBA8888 format", code);
    code = OH_DecodingOptions_SetDesiredDynamicRange(options.value, IMAGE_DYNAMIC_RANGE_SDR);
    if (code != IMAGE_SUCCESS) return sdkError("set SDR output", code);
    code = OH_DecodingOptions_SetIndex(options.value, 0);
    if (code != IMAGE_SUCCESS) return sdkError("set frame zero", code);
    Image_Size desired{size.width, size.height};
    code = OH_DecodingOptions_SetDesiredSize(options.value, &desired);
    if (code != IMAGE_SUCCESS) return sdkError("set decoding dimensions", code);

    NativeOwner<OH_PixelmapNative, destroyPixelmap> pixelmap;
    code = OH_ImageSourceNative_CreatePixelmapUsingAllocator(
        source.value, options.value, IMAGE_ALLOCATOR_TYPE_SHARE_MEMORY, &pixelmap.value);
    if (code != IMAGE_SUCCESS) return sdkError("decode pixelmap", code);
    if (!pixelmap.value) return Valdi::Error("Harmony image SDK returned an empty pixelmap");
    if (wasCanceled()) return Valdi::Error("Harmony image load canceled");

    NativeOwner<OH_Pixelmap_ImageInfo, OH_PixelmapImageInfo_Release> pixelInfo;
    code = OH_PixelmapImageInfo_Create(&pixelInfo.value);
    if (code != IMAGE_SUCCESS) return sdkError("create pixelmap info", code);
    HarmonyImageAsset::Info info;
    info.sourceWidth = width;
    info.sourceHeight = height;
    code = readHarmonyImagePixelmapMetadata(pixelmap.value, pixelInfo.value, &info.alphaType);
    if (code != IMAGE_SUCCESS) return sdkError("read pixelmap info/alpha mode", code);
    code = OH_PixelmapImageInfo_GetWidth(pixelInfo.value, &info.width);
    if (code != IMAGE_SUCCESS) return sdkError("read decoded width", code);
    code = OH_PixelmapImageInfo_GetHeight(pixelInfo.value, &info.height);
    if (code != IMAGE_SUCCESS) return sdkError("read decoded height", code);
    code = OH_PixelmapImageInfo_GetRowStride(pixelInfo.value, &info.rowStride);
    if (code != IMAGE_SUCCESS) return sdkError("read decoded row stride", code);
    code = OH_PixelmapImageInfo_GetPixelFormat(pixelInfo.value, &info.pixelFormat);
    if (code != IMAGE_SUCCESS) return sdkError("read decoded format", code);
    code = OH_PixelmapNative_GetAllocationByteCount(pixelmap.value, &info.allocationBytes);
    if (code != IMAGE_SUCCESS) return sdkError("read decoded allocation", code);
    if (info.pixelFormat != PIXEL_FORMAT_RGBA_8888 ||
        !validDecodedLayout(info.width, info.height, info.rowStride, info.allocationBytes)) {
        return Valdi::Error("Harmony image decoded format/layout exceeds the 64 MiB RGBA budget (" +
                            describeHarmonyImagePixelmap(info) + ")");
    }
    if (wasCanceled()) return Valdi::Error("Harmony image load canceled");

    // Drop codec/source scratch before allocating Drawing output/blur surfaces.
    source.reset();
    auto bytes = retainEncodedBytes ? Valdi::BytesView(ownedBytes) : Valdi::BytesView();
    auto asset = Valdi::makeShared<HarmonyImageAsset>(pixelmap.value, info, std::move(bytes));
    pixelmap.release();
    auto filtered = filterHarmonyImage(asset, filter, wasCanceled, 2 * uint64_t(ownedBytes->size()));
    if (!filtered) return filtered.error();
    return Valdi::Ref<Valdi::LoadedAsset>(filtered.moveValue());
}

} // namespace ValdiHarmony
