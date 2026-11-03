// Production process owner/core/ResourceLoader; only rawfile and transport boundaries are simulated.
#include "../HarmonyOTAProcess.hpp"
#include "../HarmonyOTALaunch.hpp"
#include "../HarmonyResourceLoader.hpp"

#include <json/json.h>
#include <rawfile/raw_file.h>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <stdexcept>
#include <thread>

using namespace ValdiHarmony;
namespace fs = std::filesystem;
using namespace std::chrono_literals;
namespace {
void check(bool condition, const char* why) { if (!condition) throw std::runtime_error(why); }
OTABytes load(const fs::path& file) {
    std::ifstream input(file, std::ios::binary);
    check(bool(input), "Missing fixture");
    return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}
std::string text(const fs::path& file) {
    const auto bytes = load(file);
    return {bytes.begin(), bytes.end()};
}
void write(const fs::path& file, const std::string& value) { std::ofstream(file, std::ios::binary) << value; }
fs::path fixtures;
int releases = 0, factories = 0, shutdowns = 0;
std::map<std::string, size_t> rawOpens;
struct Transport final : HarmonyOTATransport {
    std::atomic<bool> block{false}, entered{false}, inFlight{false};
    OTABytes get(const std::string& url, size_t limit, const std::atomic<bool>& cancelled) override {
        inFlight = true; entered = true;
        while (block && !cancelled) std::this_thread::sleep_for(1ms);
        inFlight = false;
        if (cancelled) throw std::runtime_error("cancelled");
        const std::string prefix = "https://ota.invalid/";
        check(url.starts_with(prefix), "Unexpected endpoint");
        auto bytes = load(fixtures / "valid-v1" / url.substr(prefix.size()));
        check(bytes.size() <= limit, "Fixture size exceeds limit");
        return bytes;
    }
};
std::shared_ptr<Transport> transport;
struct ProcessHTTP final : HarmonyOTAProcessHTTP {
    ProcessHTTP() { ++factories; ::transport = std::make_shared<Transport>(); }
    std::shared_ptr<HarmonyOTATransport> transport() const override { return ::transport; }
    void shutdown() override {
        check(!::transport->inFlight, "Native HTTP was closed before OTA cancellation/join");
        ++shutdowns;
    }
};
}
struct NativeResourceManager {
    std::map<std::string, OTABytes> files;
};
struct RawFile {
    OTABytes data;
    mutable size_t position = 0;
};
extern "C" {
void OH_ResourceManager_ReleaseNativeResourceManager(NativeResourceManager* manager) { ++releases; delete manager; }
RawFile* OH_ResourceManager_OpenRawFile(const NativeResourceManager* manager, const char* name) {
    ++rawOpens[name];
    const auto it = manager->files.find(name);
    if (it == manager->files.end()) return nullptr;
    return new RawFile{it->second};
}
int OH_ResourceManager_ReadRawFile(const RawFile* file, void* buffer, size_t length) {
    const auto count = std::min(length, file->data.size() - file->position);
    std::copy_n(file->data.data() + file->position, count, static_cast<uint8_t*>(buffer));
    file->position += count;
    return static_cast<int>(count);
}
long OH_ResourceManager_GetRawFileSize(RawFile* file) { return static_cast<long>(file->data.size()); }
void OH_ResourceManager_CloseRawFile(RawFile* file) { delete file; }
}
namespace ValdiHarmony {
std::unique_ptr<HarmonyOTAProcessHTTP> makeHarmonyOTAProcessHTTP() { return std::make_unique<ProcessHTTP>(); }
void logNativeError(const char*) {}
}

int main(int argc, char** argv) {
    try {
        check(argc == 4, "Expected scenario, fixtures, filesDir");
        const std::string mode(argv[1]);
        fixtures = argv[2];
        const fs::path root(argv[3]);
        fs::create_directories(root);
        const auto configText = mode == "missing" ? std::string() : text(fixtures / (mode == "seed" || mode == "enabled"
            ? "valid.json" : mode + ".json"));
        if (mode == "seed") {
            HarmonyOTAConfig config{"1.0", "0123456789abcdef0123456789abcdef", "https://ota.invalid",
                text(fixtures / "public.pem"), root.string(), std::string(64, 'd'), false};
            auto source = std::make_shared<Transport>();
            HarmonyOTA core(config, source);
            check(core.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "Seed staging failed");
            std::cout << "PASS seeded signed pending package using actual core\n";
            return 0;
        }
        auto loader = [&](const std::string& config, const fs::path& storage) {
            auto* manager = new NativeResourceManager();
            if (!config.empty()) manager->files["valdi_ota.json"] = OTABytes(config.begin(), config.end());
            manager->files["modules/app_pages.valdimodule"] = OTABytes{'h','a','p'};
            manager->files["modules/packaged.valdimodule"] = OTABytes{'r','a','w'};
            manager->files["assets/app_pages/tab_home.png"] = OTABytes{'h','a','p'};
            manager->files["assets/app_pages/packaged.png"] = OTABytes{'r','a','w'};
            return std::make_shared<HarmonyResourceLoader>(manager, storage.string());
        };
        HarmonyOTAProcess::retainEnvironment();
        HarmonyOTAProcess::retainEnvironment();
        auto first = loader(configText, root);
        auto process = first->otaProcess();
        if (mode != "enabled") {
            check(!process->selection() && !process->disabledReason().empty(), "Invalid config enabled OTA");
            auto bytes = first->loadModuleContent(Valdi::StringBox::fromCString("app_pages.valdimodule"));
            check(bytes && bytes.value().size() == 3 && bytes.value().data()[0] == 'h', "Disabled loader did not use HAP");
            check(!fs::exists(root / "valdi-ota"), "Disabled config mutated OTA storage");
            first.reset();
            auto remounted = loader(configText, root);
            check(remounted->otaProcess() == process && !process->selection(), "Disabled process selection changed");
            HarmonyOTAProcess::releaseEnvironment();
            HarmonyOTAProcess::releaseEnvironment();
            std::cout << "PASS " << mode << ": explicitly disabled, packaged fallback and frozen remount\n";
            return 0;
        }
        check(process->selection() && process->selection()->activeVersion() == "v1", "Pending startup not selected");
        auto second = loader(configText, root);
        check(second->otaProcess() == process && process->selection()->activeVersion() == "v1",
              "Second host reran pending startup/rollback");
        auto bytes = first->loadModuleContent(Valdi::StringBox::fromCString("app_pages.valdimodule"));
        check(bytes && bytes.value().size() == 3 && bytes.value().data()[0] == 'o', "Wrong OTA module");
        check(rawOpens["modules/app_pages.valdimodule"] == 0, "Listed module fell back");
        first.reset(); second.reset();
        check(bytes.value().data()[0] == 'o', "Loader returned borrowed BytesView storage");
        auto remounted = loader(configText, root);
        check(remounted->otaProcess() == process && process->selection()->activeVersion() == "v1",
              "Remount lost frozen process selection");
        auto packaged = remounted->loadModuleContent(Valdi::StringBox::fromCString("packaged.valdimodule"));
        check(packaged && packaged.value().data()[0] == 'r', "Unlisted module fallback failed");
        auto asset = remounted->loadRawAsset(Valdi::StringBox::fromCString("valdi-rawfile://app_pages/tab_home"));
        check(asset && asset.value().data()[0] == 's', "OTA asset handoff failed");
        auto rawAsset = remounted->loadRawAsset(Valdi::StringBox::fromCString("valdi-rawfile://app_pages/packaged"));
        check(rawAsset && rawAsset.value().data()[0] == 'r', "Unlisted asset fallback failed");
        const auto package = root / "valdi-ota/packages/v1";
        write(package / "modules/app_pages.valdimodule", "tampered");
        check(!remounted->loadModuleContent(Valdi::StringBox::fromCString("app_pages.valdimodule")),
              "Listed damaged module silently fell back");
        check(rawOpens["modules/app_pages.valdimodule"] == 0, "Damaged listed module touched raw fallback");
        write(package / "modules/app_pages.valdimodule", "one");
        write(package / "res/assets/app_pages/tab_home.png", "tampered");
        check(!remounted->loadRawAsset(Valdi::StringBox::fromCString("valdi-rawfile://app_pages/tab_home")),
              "Listed damaged asset silently fell back");
        check(rawOpens["assets/app_pages/tab_home.png"] == 0, "Damaged listed asset touched raw fallback");
        write(package / "res/assets/app_pages/tab_home.png", "signed-image-fixture");
        const auto beforeRelease = releases;
        bool mismatchRejected = false;
        try { loader(configText + " ", root); }
        catch (const std::runtime_error&) { mismatchRejected = true; }
        check(mismatchRejected, "Mismatched process configuration accepted");
        check(releases == beforeRelease + 1, "Failed loader construction leaked ResourceManager");
        auto launch = std::make_shared<HarmonyOTALaunch>();
        const auto generation = launch->begin();
        transport->block = true;
        launch->accept(generation, [process] { process->acceptInitialRoutes(); });
        launch->accept(generation, [] { check(false, "Duplicate launch acknowledgement"); });
        const auto until = std::chrono::steady_clock::now() + 2s;
        while (!transport->entered && std::chrono::steady_clock::now() < until) std::this_thread::yield();
        check(transport->entered, "Accepted startup did not schedule update check");
        const auto state = text(root / "valdi-ota/state.json");
        Json::Value stateValue; Json::Reader reader; check(reader.parse(state, stateValue), "State invalid");
        check(stateValue["current"].asString() == "v1" && stateValue["pending"].isNull(),
              "Initial route acknowledgement did not confirm actual core");
        check(factories == 1, "More than one native OTA transport created");
        HarmonyOTAProcess::releaseEnvironment();
        check(shutdowns == 0, "One environment closed another environment's native OTA owner");
        HarmonyOTAProcess::releaseEnvironment();
        check(shutdowns == 1 && !transport->inFlight, "Final environment failed cancellation/join before HTTP shutdown");
        auto afterClose = remounted->loadModuleContent(Valdi::StringBox::fromCString("app_pages.valdimodule"));
        check(afterClose && afterClose.value().data()[0] == 'o', "Process shutdown invalidated retained readers");
        HarmonyOTAProcess::retainEnvironment();
        auto laterEnvironment = loader(configText, root);
        check(laterEnvironment->otaProcess() == process && factories == 1 &&
              process->selection()->activeVersion() == "v1", "A later environment reran process selection");
        HarmonyOTAProcess::releaseEnvironment();
        process->shutdown();
        check(shutdowns == 1, "Duplicate process shutdown");
        std::cout << "PASS enabled: multi-host frozen selection, remount, owned bytes, errors/fallback, actual confirm, cancel/join and readers\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL " << error.what() << "\n";
        return 1;
    }
}
