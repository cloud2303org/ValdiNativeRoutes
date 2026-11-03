#include "HarmonyOTAProcess.hpp"

#include <json/json.h>

#include <algorithm>
#include <filesystem>
#include <stdexcept>

namespace ValdiHarmony {
namespace {
bool binaryDigest(const std::string& value) {
    return value.size() == 64 && std::all_of(value.begin(), value.end(), [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    });
}
struct ProcessOwner {
    std::mutex mutex;
    std::shared_ptr<HarmonyOTAProcess> selection;
    size_t environments = 0;
};
ProcessOwner& processOwner() {
    static ProcessOwner owner;
    return owner;
}
}

HarmonyOTAProcess::HarmonyOTAProcess(std::string configuration, std::string persistentRoot)
    : _packagedConfiguration(std::move(configuration)), _persistentRoot(std::move(persistentRoot)) {
    if (_packagedConfiguration.empty()) {
        _disabledReason = "OTA disabled: packaged valdi_ota.json is missing or unreadable";
        return;
    }
    try {
        if (_packagedConfiguration.size() > 32768) throw std::runtime_error("config size");
        Json::CharReaderBuilder builder;
        builder["collectComments"] = false;
        builder["allowComments"] = false;
        builder["allowTrailingCommas"] = false;
        builder["rejectDupKeys"] = true;
        builder["failIfExtra"] = true;
        builder["strictRoot"] = true;
        builder["stackLimit"] = 16;
        std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
        Json::Value value;
        std::string error;
        if (!reader->parse(_packagedConfiguration.data(),
                           _packagedConfiguration.data() + _packagedConfiguration.size(), &value, &error) ||
            !value.isObject()) throw std::runtime_error("config JSON");
        HarmonyOTAConfig config;
        for (auto entry : {std::pair{"appVersion", &config.appVersion}, {"fingerprint", &config.fingerprint},
                           {"url", &config.url}, {"publicKey", &config.publicKey},
                           {"binaryIdentity", &config.binaryIdentity}}) {
            if (!value[entry.first].isString()) throw std::runtime_error("config field");
            *entry.second = value[entry.first].asString();
        }
        // Require the parent's packaged digest of the actual native binary and
        // release identity. Never substitute appVersion, mtime, handle or UUID.
        if (!binaryDigest(config.binaryIdentity)) {
            _disabledReason = "OTA disabled: packaged binaryIdentity SHA-256 is missing or invalid";
            return;
        }
        if (config.url.empty()) {
            _disabledReason = "OTA disabled: packaged update endpoint is empty";
            return;
        }
        if (_persistentRoot.empty() || _persistentRoot.find('\0') != std::string::npos)
            throw std::runtime_error("storage root");
        config.persistentRoot = std::filesystem::canonical(_persistentRoot).string();
        _http = makeHarmonyOTAProcessHTTP();
        auto selection = std::make_shared<HarmonyOTA>(std::move(config), _http->transport());
        if (selection->enabled()) _selection = std::move(selection);
        else _disabledReason = "OTA disabled: packaged signing key, endpoint or compatibility configuration is invalid";
    } catch (const std::exception&) {
        // Never propagate untrusted JSON/key/endpoint strings into logs.
        _disabledReason = "OTA disabled: packaged configuration or persistent storage is invalid";
    }
    if (!_selection && _http) {
        _http->shutdown();
        _http.reset();
    }
}

std::shared_ptr<HarmonyOTAProcess> HarmonyOTAProcess::acquire(
    std::string_view packagedConfiguration, const std::string& persistentRoot) {
    // Function-static ownership survives removal/remount of every RuntimeHost.
    // Destruction cancels/joins OTA BEFORE closing its separate native HTTP owner.
    auto& owner = processOwner();
    std::lock_guard guard(owner.mutex);
    if (!owner.selection) owner.selection = std::shared_ptr<HarmonyOTAProcess>(
        new HarmonyOTAProcess(std::string(packagedConfiguration), persistentRoot));
    const auto& process = owner.selection;
    if (process->_packagedConfiguration != packagedConfiguration || process->_persistentRoot != persistentRoot)
        throw std::runtime_error("OTA loader does not match this process's frozen package/storage binding");
    return process;
}

void HarmonyOTAProcess::retainEnvironment() {
    auto& owner = processOwner();
    std::lock_guard guard(owner.mutex);
    ++owner.environments;
}

void HarmonyOTAProcess::releaseEnvironment() {
    auto& owner = processOwner();
    std::lock_guard guard(owner.mutex);
    if (owner.environments == 0) return;
    if (--owner.environments == 0 && owner.selection) owner.selection->shutdown();
    // Keep the selection, even after the final environment is closed. Starting
    // another environment cannot retry pendingLaunched/rollback in this process.
}

HarmonyOTAProcess::~HarmonyOTAProcess() { shutdown(); }

void HarmonyOTAProcess::acceptInitialRoutes() {
    std::lock_guard guard(_mutex);
    if (_closed || _accepted || !_selection) return;
    _selection->confirmLaunch();
    _accepted = true;
    _selection->checkForUpdate(); // Selection stays frozen; staging is for next process.
}

void HarmonyOTAProcess::shutdown() {
    std::lock_guard guard(_mutex);
    if (_closed) return;
    _closed = true;
    if (_selection) _selection->shutdown();
    if (_http) _http->shutdown();
}
} // namespace ValdiHarmony
