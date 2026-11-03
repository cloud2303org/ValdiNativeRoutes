#include "../HarmonyOTA.hpp"
#include "valdi_core/Cancelable.hpp"
#include "valdi_core/HTTPRequest.hpp"
#include "valdi_core/HTTPRequestManager.hpp"
#include "valdi_core/HTTPRequestManagerCompletion.hpp"
#include "valdi_core/HTTPResponse.hpp"
#include "valdi_core/cpp/Utils/Bytes.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>

using namespace ValdiHarmony;
namespace fs = std::filesystem;
using namespace std::chrono_literals;

static void check(bool value, const char* reason) { if (!value) throw std::runtime_error(reason); }
template<typename F> static void throws(F body) {
    try { body(); } catch (const std::exception&) { return; }
    throw std::runtime_error("Expected failure");
}
static OTABytes load(const fs::path& file) {
    std::ifstream in(file, std::ios::binary);
    check(bool(in), "Fixture missing");
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}
static void write(const fs::path& file, const std::string& text) {
    std::ofstream out(file, std::ios::binary);
    out << text;
    check(bool(out), "Fixture write failed");
}
struct FixtureTransport final : HarmonyOTATransport {
    fs::path fixtures;
    std::string selected = "valid-v1";
    std::atomic<int> calls{0};
    std::atomic<bool> block{false}, entered{false};
    OTABytes get(const std::string& url, size_t limit, const std::atomic<bool>& cancelled) override {
        ++calls; entered = true;
        while (block && !cancelled) std::this_thread::sleep_for(1ms);
        if (cancelled) throw std::runtime_error("cancelled");
        const std::string prefix = "https://ota.invalid/";
        check(url.starts_with(prefix), "Unexpected network endpoint");
        auto bytes = load(fixtures / selected / url.substr(prefix.size()));
        if (bytes.size() > limit) throw std::runtime_error("Fixture body exceeds limit");
        return bytes;
    }
};
struct NativeCancel final : snap::valdi_core::Cancelable {
    std::atomic<bool> cancelled{false};
    void cancel() override { cancelled = true; }
};
struct NativeManager final : snap::valdi_core::HTTPRequestManager {
    std::shared_ptr<NativeCancel> handle = std::make_shared<NativeCancel>();
    std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion> saved;
    int status = 200;
    std::string body = "native-bytes";
    bool respond = true, fail = false;
    std::atomic<bool> entered{false};
    std::shared_ptr<snap::valdi_core::Cancelable> performRequest(
        const snap::valdi_core::HTTPRequest& request,
        const std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion>& completion) override {
        check(request.method.slowToString() == "GET" && !request.body && request.headers.isNullOrUndefined(),
              "OTA must use anonymous GET");
        saved = completion;
        entered = true;
        if (respond) {
            if (fail) completion->onFail("must never expose https://secret.invalid/token");
            else complete();
        }
        return handle;
    }
    void complete() {
        auto owner = Valdi::makeShared<Valdi::Bytes>();
        owner->insert(owner->end(), body.begin(), body.end());
        saved->onComplete(snap::valdi_core::HTTPResponse(status, Valdi::Value(), Valdi::BytesView(owner)));
    }
};

int main(int argc, char** argv) {
    try {
        check(argc == 4, "Expected fixtures/key/work");
        const fs::path fixtures(argv[1]), work(argv[3]);
        const auto keyBytes = load(argv[2]);
        const std::string key(keyBytes.begin(), keyBytes.end());
        auto config = [&](const std::string& name) {
            auto dir = work / name;
            fs::create_directories(dir);
            fs::permissions(dir, fs::perms::owner_all);
            return HarmonyOTAConfig{"1.0", "0123456789abcdef0123456789abcdef",
                                    "https://ota.invalid", key, dir.string(), "install-1", false};
        };
        auto transport = [&] {
            auto out = std::make_shared<FixtureTransport>();
            out->fixtures = fixtures;
            return out;
        };
        {
            auto cfg = config("disabled");
            auto http = transport();
            auto invalid = cfg; invalid.url = "";
            HarmonyOTA noURL(invalid, http);
            check(!noURL.enabled() && noURL.checkForUpdate().get().status == HarmonyOTAStatus::Disabled,
                  "Empty URL must disable OTA");
            invalid = cfg; invalid.publicKey = "not a public key";
            HarmonyOTA badKey(invalid, http);
            check(!badKey.enabled(), "Invalid public key must disable OTA");
            const auto p384 = load(fixtures / "p384.pem");
            invalid.publicKey.assign(p384.begin(), p384.end());
            HarmonyOTA wrongCurve(invalid, http);
            check(!wrongCurve.enabled(), "P-384 key must not enable P-256 OTA");
            invalid = cfg; invalid.url = "http://ota.invalid";
            HarmonyOTA insecure(invalid, http);
            check(!insecure.enabled(), "HTTP must require explicit development opt-in");
            invalid = cfg; invalid.url = "https://user:secret@ota.invalid";
            HarmonyOTA credentials(invalid, http);
            check(!credentials.enabled(), "Endpoint credentials must be rejected");
            check(!fs::exists(fs::path(cfg.persistentRoot) / "valdi-ota") && http->calls == 0,
                  "Disabled OTA touched persistent storage/network");
        }
        std::cout << "PASS disabled and key/endpoint guards\n";
        {
            auto cfg = config("lifecycle");
            auto http = transport();
            {
                HarmonyOTA ota(cfg, http);
                check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "v1 not staged");
                check(ota.activeVersion().empty() && !ota.readModule("app_pages.valdimodule"), "Applied OTA mid-process");
                throws([&] { HarmonyOTA duplicate(cfg, http); });
            }
            {
                HarmonyOTA ota(cfg, http);
                check(ota.activeVersion() == "v1", "Pending startup not selected");
                check(ota.readModule("app_pages.valdimodule") == std::optional<OTABytes>(OTABytes{'o','n','e'}), "Wrong module bytes");
                check(ota.resolveModulePath("app_pages.valdimodule")->ends_with("/v1/modules/app_pages.valdimodule"),
                      "Module handoff incompatible");
                check(ota.resolveAssetPath("app_pages", "tab_home")->ends_with("/res/assets/app_pages/tab_home.png"),
                      "Asset handoff incompatible");
                check(ota.readAsset("app_pages", "tab_home").has_value() &&
                      !ota.readAsset("../escape", "tab_home") && !ota.readModule("../escape") &&
                      !ota.readModule("unknown.valdimodule"), "Asset/module fallback guard");
                http->selected = "valid-v2";
                check(ota.checkForUpdate().get().status == HarmonyOTAStatus::PendingLaunch, "Replaced unconfirmed active package");
                ota.confirmLaunch();
                ota.confirmLaunch();
                check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "v2 not staged");
                check(ota.activeVersion() == "v1" &&
                      ota.readModule("app_pages.valdimodule")->front() == 'o', "Frozen provider switched mid-process");
            }
            { HarmonyOTA ota(cfg, http); check(ota.activeVersion() == "v2", "v2 not selected"); }
            {
                HarmonyOTA ota(cfg, http);
                check(ota.activeVersion() == "v1", "Unconfirmed v2 failed to roll back to v1");
                check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Known, "Failed version downloaded again");
            }
            cfg.binaryIdentity = "install-2";
            HarmonyOTA reinstalled(cfg, http);
            check(reinstalled.activeVersion().empty(), "Reinstall kept old OTA");
        }
        std::cout << "PASS staged startup, confirmation, frozen provider, rollback and reinstall\n";
        {
            auto cfg = config("rollback-to-packaged");
            auto http = transport();
            { HarmonyOTA ota(cfg, http); check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "stage"); }
            { HarmonyOTA ota(cfg, http); check(ota.activeVersion() == "v1", "Pending v1 missing"); }
            {
                HarmonyOTA ota(cfg, http);
                check(ota.activeVersion().empty() && ota.checkForUpdate().get().status == HarmonyOTAStatus::Known,
                      "Failed first OTA must remain rejected and use packaged code");
            }
        }
        for (const auto* name : {"signature", "payload", "platform", "app", "fingerprint", "version",
                                 "traversal", "encoded", "double-slash", "empty", "hash", "duplicate", "latest"}) {
            auto cfg = config(name);
            auto http = transport();
            http->selected = name;
            HarmonyOTA ota(cfg, http);
            auto result = ota.checkForUpdate().get();
            check(result.status == HarmonyOTAStatus::Failed, name);
            check(http->calls == (std::string(name) == "latest" ? 1 : std::string(name) == "payload" ? 4 : 3),
                  "Payload downloaded before manifest verification/gates");
            check(!fs::exists(fs::path(cfg.persistentRoot) / "valdi-ota/download") &&
                  fs::is_empty(fs::path(cfg.persistentRoot) / "valdi-ota/packages"),
                  "Failed validation published a partial package");
        }
        std::cout << "PASS 13 signature, payload, schema, traversal and compatibility rejection cases\n";
        {
            auto cfg = config("disk-tamper");
            auto http = transport();
            { HarmonyOTA ota(cfg, http); check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "stage"); }
            {
                HarmonyOTA ota(cfg, http);
                ota.confirmLaunch();
                http->selected = "valid-v2";
                check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "stage v2");
            }
            const auto module = fs::path(cfg.persistentRoot) / "valdi-ota/packages/v2/modules/app_pages.valdimodule";
            write(module, "tampered");
            {
                HarmonyOTA ota(cfg, http);
                check(ota.activeVersion() == "v1", "Damaged pending package did not fall back immediately");
                const auto active = ota.resolveModulePath("app_pages.valdimodule").value();
                const auto outside = work / "outside";
                write(outside, "untouched");
                fs::remove(active);
                fs::create_symlink(outside, active);
                throws([&] { ota.readModule("app_pages.valdimodule"); });
                check(load(outside) == OTABytes({'u','n','t','o','u','c','h','e','d'}), "Followed symlink outside cache");
            }
            HarmonyOTA noValid(cfg, http);
            check(noValid.activeVersion().empty(), "Damaged current package was used");
        }
        std::cout << "PASS cached hash revalidation and symlink rejection\n";
        {
            auto cfg = config("symlinks");
            auto http = transport();
            const auto target = work / "outside-root";
            fs::create_directory(target);
            fs::create_directory_symlink(target, fs::path(cfg.persistentRoot) / "valdi-ota");
            throws([&] { HarmonyOTA ota(cfg, http); });
            check(fs::is_empty(target), "Root link caused outside writes");
        }
        {
            auto cfg = config("staging-link");
            auto http = transport();
            HarmonyOTA ota(cfg, http);
            const auto target = work / "outside-staging";
            fs::create_directory(target);
            write(target / "keep", "untouched");
            fs::create_directory_symlink(target, fs::path(cfg.persistentRoot) / "valdi-ota/download");
            check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Installed, "Stale staging link not safely removed");
            check(load(target / "keep").size() == 9, "Staging followed a symlink");
        }
        {
            auto cfg = config("state-write-failure");
            auto http = transport();
            HarmonyOTA ota(cfg, http);
            // rename(temp,state.json) must fail rather than falsely acknowledge install.
            fs::remove(fs::path(cfg.persistentRoot) / "valdi-ota/state.json");
            fs::create_directory(fs::path(cfg.persistentRoot) / "valdi-ota/state.json");
            check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Failed, "False success on state commit failure");
        }
        std::cout << "PASS owned cache paths, safe staging cleanup and commit failure\n";
        {
            auto cfg = config("interrupted-state");
            auto http = transport();
            { HarmonyOTA ota(cfg, http); }
            const auto store = fs::path(cfg.persistentRoot) / "valdi-ota";
            fs::create_directory(store / "download");
            fs::create_directory(store / "packages/orphan");
            write(store / "packages/orphan/incomplete", "partial");
            { HarmonyOTA ota(cfg, http); }
            check(!fs::exists(store / "download") && !fs::exists(store / "packages/orphan"),
                  "Interrupted unreferenced package was not cleaned up");
            write(store / "state.json", "{\"pending\":\"v1\"");
            throws([&] { HarmonyOTA ota(cfg, http); });
        }
        std::cout << "PASS interrupted orphan cleanup and corrupt-state fail-closed behavior\n";
        {
            auto cfg = config("cancel");
            auto http = transport(); http->block = true;
            HarmonyOTA ota(cfg, http);
            auto future = ota.checkForUpdate();
            auto duplicate = ota.checkForUpdate();
            auto until = std::chrono::steady_clock::now() + 1s;
            while (!http->entered && std::chrono::steady_clock::now() < until) std::this_thread::yield();
            check(http->entered, "Worker never started");
            ota.shutdown(); ota.shutdown();
            check(future.get().status == HarmonyOTAStatus::Cancelled &&
                  duplicate.get().status == HarmonyOTAStatus::Cancelled && http->calls == 1,
                  "Shutdown/deduplication failed");
            check(ota.checkForUpdate().get().status == HarmonyOTAStatus::Cancelled, "Restarted after shutdown");
        }
        std::cout << "PASS cancellation, duplicate requests and shutdown lifecycle\n";
        {
            auto manager = std::make_shared<NativeManager>();
            auto http = makeHarmonyOTATransport(manager, 40ms);
            std::atomic<bool> cancelled{false};
            check(http->get("https://ota.invalid/file", 100, cancelled).size() == 12, "Native adapter bytes");
            manager->status = 404; throws([&] { http->get("https://ota.invalid/file", 100, cancelled); });
            manager->status = 200; throws([&] { http->get("https://ota.invalid/file", 1, cancelled); });
            manager->fail = true;
            try { http->get("https://ota.invalid/file", 100, cancelled); check(false, "Expected transport failure"); }
            catch (const std::exception& error) { check(std::string(error.what()).find("secret") == std::string::npos, "Leaked URL"); }
            manager->fail = false; manager->respond = false;
            throws([&] { http->get("https://ota.invalid/file", 100, cancelled); });
            check(manager->handle->cancelled, "Deadline did not cancel native request");
            manager->complete(); // Delayed completion after timeout must be harmless.
            manager->entered = false;
            manager->handle->cancelled = false;
            auto pending = std::async(std::launch::async, [&] {
                throws([&] { http->get("https://ota.invalid/file", 100, cancelled); });
            });
            auto until = std::chrono::steady_clock::now() + 1s;
            while (!manager->entered && std::chrono::steady_clock::now() < until) std::this_thread::yield();
            check(manager->entered, "Native request did not start");
            cancelled = true;
            pending.get();
            check(manager->handle->cancelled, "In-flight cancellation did not cancel native handle");
            manager->complete();
            throws([&] { http->get("https://ota.invalid/file", 100, cancelled); });
        }
        std::cout << "PASS real native HTTP interfaces: status, bytes, limits, cancellation and late callbacks\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL " << error.what() << "\n";
        return 1;
    }
}
