#pragma once

#include "HarmonyResourceLoader.hpp"
#include "valdi/runtime/Resources/AssetLoader.hpp"
#include "valdi_core/cpp/Threading/IDispatchQueue.hpp"

namespace ValdiHarmony {

class HarmonyRawfileAssetLoader final : public Valdi::AssetLoader {
public:
    HarmonyRawfileAssetLoader(std::shared_ptr<HarmonyResourceLoader> resources,
                             Valdi::Ref<Valdi::IDispatchQueue> worker);
    snap::valdi_core::AssetOutputType getOutputType() const override;
    Valdi::Result<Valdi::Value> requestPayloadFromURL(const Valdi::StringBox& url) override;
    Valdi::Shared<snap::valdi_core::Cancelable> loadAsset(
        const Valdi::Value& payload, int32_t width, int32_t height,
        const Valdi::Value& associatedData,
        const Valdi::Ref<Valdi::AssetLoaderCompletion>& completion) override;

private:
    std::shared_ptr<HarmonyResourceLoader> _resources;
    Valdi::Ref<Valdi::IDispatchQueue> _worker;
};

} // namespace ValdiHarmony
