#pragma once

#include "HarmonyBootstrap.hpp"
#include "valdi/runtime/Interfaces/IResourceLoader.hpp"

#include <rawfile/raw_file_manager.h>
#include <memory>
#include <mutex>
#include <string>

namespace ValdiHarmony {

class HarmonyOTAProcess;

class HarmonyResourceLoader final : public Valdi::IResourceLoader {
public:
    // Takes ownership. Keep the ArkTS ResourceManager strongly referenced until destruction.
    explicit HarmonyResourceLoader(NativeResourceManager* manager, const std::string& persistentRoot = {});
    ~HarmonyResourceLoader() override;

    Valdi::Result<Valdi::BytesView> loadModuleContent(const Valdi::StringBox& module) override;
    Valdi::StringBox resolveLocalAssetURL(const Valdi::StringBox& module,
                                         const Valdi::StringBox& resource) override;
    Valdi::Result<Valdi::BytesView> loadRawAsset(const Valdi::StringBox& url);
    BootstrapProfile bootstrapProfile();
    const std::shared_ptr<HarmonyOTAProcess>& otaProcess() const { return _ota; }

private:
    NativeResourceManager* _manager;
    std::shared_ptr<HarmonyOTAProcess> _ota;
    std::mutex _mutex;
    std::string packagedOTAConfiguration();
    Valdi::Result<Valdi::BytesView> readRawFile(const std::string& path, size_t limit);
};

} // namespace ValdiHarmony
