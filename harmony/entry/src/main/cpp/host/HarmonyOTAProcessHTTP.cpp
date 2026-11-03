#include "HarmonyOTAProcess.hpp"
#include "HarmonyHTTPRequestManager.hpp"

namespace ValdiHarmony {
namespace {
class NativeOTAHTTP final : public HarmonyOTAProcessHTTP {
public:
    NativeOTAHTTP() : _requests(std::make_shared<HarmonyHTTPRequestManager>()),
                      _transport(makeHarmonyOTATransport(_requests)) {}
    ~NativeOTAHTTP() override { shutdown(); }
    std::shared_ptr<HarmonyOTATransport> transport() const override { return _transport; }
    void shutdown() override { _requests->shutdown(); }
private:
    std::shared_ptr<HarmonyHTTPRequestManager> _requests;
    std::shared_ptr<HarmonyOTATransport> _transport;
};
}
std::unique_ptr<HarmonyOTAProcessHTTP> makeHarmonyOTAProcessHTTP() {
    return std::make_unique<NativeOTAHTTP>();
}
} // namespace ValdiHarmony
