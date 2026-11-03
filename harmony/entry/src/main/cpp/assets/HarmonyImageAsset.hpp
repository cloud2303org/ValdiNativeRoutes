#pragma once

#include "valdi_core/cpp/Resources/LoadedAsset.hpp"
#include <multimedia/image_framework/image/pixelmap_native.h>

namespace ValdiHarmony {

// Immutable after construction. Retain this asset while a native view uses its pixelmap.
class HarmonyImageAsset final : public Valdi::LoadedAsset {
public:
    struct Info {
        uint32_t width = 0;
        uint32_t height = 0;
        uint32_t sourceWidth = 0;
        uint32_t sourceHeight = 0;
        uint32_t rowStride = 0;
        uint32_t allocationBytes = 0;
        int32_t pixelFormat = 0;
        int32_t alphaType = 0;
    };

    // Takes sole ownership of pixelmap; only pass a successfully decoded, validated map.
    HarmonyImageAsset(OH_PixelmapNative* pixelmap, Info info, Valdi::BytesView encodedBytes = {});
    ~HarmonyImageAsset() override;
    HarmonyImageAsset(const HarmonyImageAsset&) = delete;
    HarmonyImageAsset& operator=(const HarmonyImageAsset&) = delete;

    // Borrowed pointer. Do not release, mutate or transfer it to an owning wrapper.
    OH_PixelmapNative* getPixelmap() const { return _pixelmap; }
    uint32_t getWidth() const { return _info.width; }
    uint32_t getHeight() const { return _info.height; }
    const Info& getInfo() const { return _info; }
    const Valdi::BytesView& getRetainedSourceBytes() const { return _encodedBytes; }
    Valdi::Result<Valdi::BytesView> getBytesContent() override;
    Valdi::Value getMetadata() const override;
    VALDI_CLASS_HEADER(HarmonyImageAsset)

private:
    OH_PixelmapNative* _pixelmap;
    Info _info;
    Valdi::BytesView _encodedBytes;
};

} // namespace ValdiHarmony
