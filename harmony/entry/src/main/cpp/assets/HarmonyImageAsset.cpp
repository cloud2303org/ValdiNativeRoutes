#include "HarmonyImageAsset.hpp"

namespace ValdiHarmony {

HarmonyImageAsset::HarmonyImageAsset(OH_PixelmapNative* pixelmap, Info info, Valdi::BytesView encodedBytes)
    : _pixelmap(pixelmap), _info(info), _encodedBytes(std::move(encodedBytes)) {}

HarmonyImageAsset::~HarmonyImageAsset() {
    if (_pixelmap != nullptr) {
        OH_PixelmapNative_Destroy(&_pixelmap);
    }
}

Valdi::Result<Valdi::BytesView> HarmonyImageAsset::getBytesContent() {
    if (_encodedBytes.empty()) {
        return Valdi::Error("Harmony image encoded source bytes were not retained");
    }
    return _encodedBytes;
}

Valdi::Value HarmonyImageAsset::getMetadata() const {
    Valdi::Value metadata;
    metadata.setMapValue("type", Valdi::Value(Valdi::StringBox::fromCString("image")));
    metadata.setMapValue("width", Valdi::Value(int32_t(_info.width)));
    metadata.setMapValue("height", Valdi::Value(int32_t(_info.height)));
    metadata.setMapValue("sourceWidth", Valdi::Value(int32_t(_info.sourceWidth)));
    metadata.setMapValue("sourceHeight", Valdi::Value(int32_t(_info.sourceHeight)));
    metadata.setMapValue("rowStride", Valdi::Value(int32_t(_info.rowStride)));
    metadata.setMapValue("allocationBytes", Valdi::Value(int32_t(_info.allocationBytes)));
    metadata.setMapValue("pixelFormat", Valdi::Value(_info.pixelFormat));
    metadata.setMapValue("alphaType", Valdi::Value(_info.alphaType));
    return metadata;
}

VALDI_CLASS_IMPL(HarmonyImageAsset)

} // namespace ValdiHarmony
