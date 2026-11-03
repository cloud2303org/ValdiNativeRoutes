#pragma once

#include "HarmonyOTA.hpp"

#include <mutex>
#include <string_view>

namespace ValdiHarmony {

// Native-only transport lifetime. No environment, runtime, JS or service-port owners.
class HarmonyOTAProcessHTTP {
public:
    virtual ~HarmonyOTAProcessHTTP() = default;
    virtual std::shared_ptr<HarmonyOTATransport> transport() const = 0;
    virtual void shutdown() = 0;
};
std::unique_ptr<HarmonyOTAProcessHTTP> makeHarmonyOTAProcessHTTP();

// Internal application owner. The first loader freezes selection for the entire
// native process, including an explicitly disabled selection. Host teardown does
// not re-run startup selection or close another host's OTA transport.
class HarmonyOTAProcess final {
public:
    static std::shared_ptr<HarmonyOTAProcess> acquire(
        std::string_view packagedConfiguration, const std::string& persistentRoot);
    static void retainEnvironment();
    static void releaseEnvironment();
    ~HarmonyOTAProcess();
    const std::shared_ptr<HarmonyOTA>& selection() const { return _selection; }
    const std::string& disabledReason() const { return _disabledReason; }
    // Native UI acknowledgement only. Does not store callbacks or JS owners.
    void acceptInitialRoutes();
    // Process shutdown only; retain frozen selection/readers after stopping work.
    void shutdown();

private:
    HarmonyOTAProcess(std::string packagedConfiguration, std::string persistentRoot);
    std::string _packagedConfiguration, _persistentRoot, _disabledReason;
    std::unique_ptr<HarmonyOTAProcessHTTP> _http;
    std::shared_ptr<HarmonyOTA> _selection;
    std::mutex _mutex;
    bool _accepted = false, _closed = false;
};

} // namespace ValdiHarmony
