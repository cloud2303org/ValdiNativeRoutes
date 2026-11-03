#pragma once

#include "valdi/runtime/Resources/AssetLoaderFactory.hpp"
#include "valdi_core/cpp/Threading/IDispatchQueue.hpp"

namespace ValdiHarmony {

class HarmonyImageAssetLoaderFactory final : public Valdi::AssetLoaderFactory {
public:
    explicit HarmonyImageAssetLoaderFactory(Valdi::Ref<Valdi::IDispatchQueue> worker,
                                            bool retainEncodedBytes = false);
    ~HarmonyImageAssetLoaderFactory() override;
    snap::valdi_core::AssetOutputType getOutputType() const override;
    Valdi::Ref<Valdi::AssetLoader> createAssetLoader(
        const std::vector<Valdi::StringBox>& urlSchemes,
        const Valdi::Ref<Valdi::IRemoteDownloader>& downloader) override;

private:
    Valdi::Ref<Valdi::IDispatchQueue> _worker;
    bool _retainEncodedBytes;
};

} // namespace ValdiHarmony
