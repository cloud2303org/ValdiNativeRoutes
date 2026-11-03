#include "HarmonyRawfileAssetLoader.hpp"

#include "valdi/runtime/Resources/AssetLoaderCompletion.hpp"
#include "valdi/runtime/Resources/BytesAsset.hpp"
#include "valdi_core/cpp/Utils/SimpleAtomicCancelable.hpp"

namespace ValdiHarmony {

HarmonyRawfileAssetLoader::HarmonyRawfileAssetLoader(
    std::shared_ptr<HarmonyResourceLoader> resources, Valdi::Ref<Valdi::IDispatchQueue> worker)
    : AssetLoader({STRING_LITERAL("valdi-rawfile")}), _resources(std::move(resources)), _worker(std::move(worker)) {}

snap::valdi_core::AssetOutputType HarmonyRawfileAssetLoader::getOutputType() const {
    return snap::valdi_core::AssetOutputType::Bytes;
}

Valdi::Result<Valdi::Value> HarmonyRawfileAssetLoader::requestPayloadFromURL(const Valdi::StringBox& url) {
    return Valdi::Value(url);
}

Valdi::Shared<snap::valdi_core::Cancelable> HarmonyRawfileAssetLoader::loadAsset(
    const Valdi::Value& payload, int32_t, int32_t, const Valdi::Value&,
    const Valdi::Ref<Valdi::AssetLoaderCompletion>& completion) {
    auto cancel = Valdi::makeShared<Valdi::SimpleAtomicCancelable>();
    _worker->async([resources = _resources, url = payload.toStringBox(), completion, cancel] {
        if (cancel->wasCanceled()) return;
        const auto bytes = resources->loadRawAsset(url);
        if (cancel->wasCanceled()) return;
        if (!bytes) {
            completion->onLoadComplete(bytes.error());
        } else {
            completion->onLoadComplete(Valdi::Ref<Valdi::LoadedAsset>(Valdi::makeShared<Valdi::BytesAsset>(bytes.value())));
        }
    });
    return cancel.toShared();
}

} // namespace ValdiHarmony
