#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <future>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace snap::valdi_core { class HTTPRequestManager; }

namespace ValdiHarmony {

using OTABytes = std::vector<uint8_t>;

// Blocking transport seam. Implementations must honor cancellation and the body limit.
// HarmonyOTAHTTP.cpp supplies the real Valdi native HTTPRequestManager adapter.
class HarmonyOTATransport {
public:
    virtual ~HarmonyOTATransport() = default;
    virtual OTABytes get(const std::string& url, size_t limit,
                         const std::atomic<bool>& cancelled) = 0;
};

std::shared_ptr<HarmonyOTATransport> makeHarmonyOTATransport(
    std::shared_ptr<snap::valdi_core::HTTPRequestManager> manager,
    std::chrono::milliseconds deadline = std::chrono::seconds(45));

struct HarmonyOTAConfig {
    std::string appVersion;
    std::string fingerprint;
    std::string url;
    std::string publicKey;
    // Existing, canonical app-private filesDir (not cacheDir). Owns ONLY its valdi-ota child.
    std::string persistentRoot;
    // App versionCode + install/update identity. Must change on each native reinstall.
    std::string binaryIdentity;
    // Explicit development opt-in. Never enables HTTP merely because the build is debug.
    bool allowInsecureHTTP = false;
};

enum class HarmonyOTAStatus { Disabled, Installed, Known, PendingLaunch, Cancelled, Failed };

struct HarmonyOTAResult {
    HarmonyOTAStatus status;
    std::string version;
    std::string error; // Does not contain response bodies, credentials or endpoint URLs.
};

class HarmonyOTA final {
public:
    // Does no network I/O. Selects and verifies ONE immutable startup package,
    // persisting pendingLaunched before handing any module to the runtime.
    // Invalid/absent configuration disables OTA without touching persistent storage.
    // Storage/lock failures throw: parent may log and explicitly choose packaged-only.
    HarmonyOTA(HarmonyOTAConfig config, std::shared_ptr<HarmonyOTATransport> transport);
    ~HarmonyOTA();
    HarmonyOTA(const HarmonyOTA&) = delete;
    HarmonyOTA& operator=(const HarmonyOTA&) = delete;

    bool enabled() const;
    std::string activeVersion() const;
    // nullopt means unlisted: use rawfile fallback. Listed but damaged throws.
    // Never append ".valdimodule": ResourceManager passes the complete filename.
    std::optional<std::string> resolveModulePath(const std::string& filename) const;
    std::optional<std::string> resolveAssetPath(const std::string& module,
                                                 const std::string& logicalName) const;
    // Prefer reads to reopening a path: no-follow opens + signed hash on every read.
    std::optional<OTABytes> readModule(const std::string& filename) const;
    std::optional<OTABytes> readAsset(const std::string& module,
                                        const std::string& logicalName) const;
    // Called only after startApp/bootstrap succeeds, never just after mount begins.
    void confirmLaunch();
    // Own worker; concurrent calls share the same in-flight result. No UI callbacks.
    // Installed means staged for NEXT cold start, not applied to this runtime.
    std::shared_future<HarmonyOTAResult> checkForUpdate();
    // Idempotent cancellation + worker join, before native HTTP manager shutdown.
    // Joins outside internal state locks; must not be invoked from the worker.
    void shutdown();

private:
    struct Impl;
    std::shared_ptr<Impl> _impl;
};

} // namespace ValdiHarmony
