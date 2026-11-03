#include "HarmonyResourceLoader.hpp"
#include "HarmonyMainThreadDispatcher.hpp"
#include "HarmonyOTAProcess.hpp"

#include <rawfile/raw_file.h>

#include <algorithm>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>

namespace ValdiHarmony {
namespace {

bool validName(const std::string& name) {
    return !name.empty() && name != "." && name != ".." &&
        name.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-") ==
            std::string::npos;
}

constexpr std::string_view assetScheme = "valdi-rawfile://";

Valdi::BytesView ownedBytes(const OTABytes& data) {
    auto owner = Valdi::makeShared<Valdi::Bytes>();
    owner->assign(data.begin(), data.end());
    return Valdi::BytesView(owner);
}

} // namespace

HarmonyResourceLoader::HarmonyResourceLoader(NativeResourceManager* manager, const std::string& persistentRoot)
    : _manager(manager) {
    try {
        _ota = HarmonyOTAProcess::acquire(packagedOTAConfiguration(), persistentRoot);
    } catch (...) {
        OH_ResourceManager_ReleaseNativeResourceManager(_manager);
        throw;
    }
}

std::string HarmonyResourceLoader::packagedOTAConfiguration() {
    {
        std::lock_guard guard(_mutex);
        auto* file = OH_ResourceManager_OpenRawFile(_manager, "valdi_ota.json");
        if (file == nullptr) return {};
        OH_ResourceManager_CloseRawFile(file);
    }
    auto bytes = readRawFile("valdi_ota.json", 32768);
    if (!bytes) return {}; // Explicitly disabled; never synthesize release fields.
    return {reinterpret_cast<const char*>(bytes.value().data()), bytes.value().size()};
}

HarmonyResourceLoader::~HarmonyResourceLoader() {
    OH_ResourceManager_ReleaseNativeResourceManager(_manager);
}

BootstrapProfile HarmonyResourceLoader::bootstrapProfile() {
    constexpr auto* path = "valdi/build-info.json";
    {
        std::lock_guard lock(_mutex);
        auto* raw = OH_ResourceManager_OpenRawFile(_manager, path);
        if (raw == nullptr) {
            return BootstrapProfile::Smoke; // Legacy HAPs have no profile marker.
        }
        OH_ResourceManager_CloseRawFile(raw);
    }
    auto bytes = readRawFile(path, 1024 * 1024);
    if (!bytes) throw std::runtime_error(bytes.error().toString());
    return parseBootstrapMetadata(
        std::string_view(reinterpret_cast<const char*>(bytes.value().data()), bytes.value().size()));
}

Valdi::Result<Valdi::BytesView> HarmonyResourceLoader::loadModuleContent(const Valdi::StringBox& module) {
    const auto name = module.slowToString();
    if (!validName(name)) {
        return Valdi::Error("Invalid Valdi module name");
    }
    try {
        if (const auto& ota = _ota->selection()) {
            if (auto bytes = ota->readModule(name)) return ownedBytes(*bytes);
        }
    } catch (const std::exception&) {
        return Valdi::Error("Listed OTA module verification/read failed: " + name);
    }
    // ResourceManager supplies complete filenames, including .valdimodule.
    const auto path = std::string("modules/") + name;
    return readRawFile(path, 256ULL * 1024 * 1024);
}

Valdi::Result<Valdi::BytesView> HarmonyResourceLoader::readRawFile(const std::string& path, size_t limit) {
    std::lock_guard lock(_mutex);
    auto raw = std::unique_ptr<RawFile, decltype(&OH_ResourceManager_CloseRawFile)>(
        OH_ResourceManager_OpenRawFile(_manager, path.c_str()), OH_ResourceManager_CloseRawFile);
    if (!raw) {
        const auto message = std::string("Missing rawfile/") + path;
        logNativeError(message.c_str());
        return Valdi::Error(message);
    }
    const auto length = OH_ResourceManager_GetRawFileSize(raw.get());
    if (length <= 0 || static_cast<uint64_t>(length) > limit) {
        return Valdi::Error("Valdi rawfile is empty or exceeds its size limit: " + path);
    }
    auto bytes = Valdi::makeShared<Valdi::Bytes>();
    bytes->resize(static_cast<size_t>(length));
    size_t offset = 0;
    while (offset != bytes->size()) {
        const auto count = OH_ResourceManager_ReadRawFile(
            raw.get(), bytes->data() + offset,
            std::min(bytes->size() - offset, static_cast<size_t>(std::numeric_limits<int>::max())));
        if (count <= 0) {
            return Valdi::Error("Could not read complete rawfile/" + path);
        }
        offset += static_cast<size_t>(count);
    }
    return Valdi::BytesView(bytes);
}

Valdi::StringBox HarmonyResourceLoader::resolveLocalAssetURL(const Valdi::StringBox& module,
                                                             const Valdi::StringBox& resource) {
    const auto owner = module.slowToString();
    const auto name = resource.slowToString();
    if (!validName(owner) || !validName(name)) return {};
    return Valdi::StringBox::fromString(std::string(assetScheme) + owner + "/" + name);
}

Valdi::Result<Valdi::BytesView> HarmonyResourceLoader::loadRawAsset(const Valdi::StringBox& url) {
    const auto value = url.slowToString();
    if (!value.starts_with(assetScheme)) return Valdi::Error("Unsupported packaged asset URL scheme");
    const auto path = value.substr(assetScheme.size());
    const auto separator = path.find('/');
    if (separator == std::string::npos || !validName(path.substr(0, separator)) ||
        !validName(path.substr(separator + 1))) {
        return Valdi::Error("Invalid packaged asset URL");
    }
    try {
        if (const auto& ota = _ota->selection()) {
            if (auto bytes = ota->readAsset(path.substr(0, separator), path.substr(separator + 1)))
                return ownedBytes(*bytes);
        }
    } catch (const std::exception&) {
        return Valdi::Error("Listed OTA asset verification/read failed: " + path);
    }
    // The catalog uses logical names without scale/extension. The build stages
    // one largest-density file at each canonical name.
    const auto base = std::string("assets/") + path;
    for (const auto* extension : {".png", ".webp"}) {
        const auto candidate = base + extension;
        bool exists = false;
        {
            std::lock_guard lock(_mutex);
            auto* raw = OH_ResourceManager_OpenRawFile(_manager, candidate.c_str());
            if (raw != nullptr) {
                exists = true;
                OH_ResourceManager_CloseRawFile(raw);
            }
        }
        if (exists) return readRawFile(candidate, 32ULL * 1024 * 1024);
    }
    return Valdi::Error("Missing packaged image: " + path);
}

} // namespace ValdiHarmony
