#pragma once

#include "valdi_core/HTTPRequestManager.hpp"

#include <cstdint>
#include <memory>

namespace ValdiHarmony {

// Native RemoteCommunicationKit C HTTP (API 12+). Completions run on a manager worker.
class HarmonyHTTPRequestManager final : public snap::valdi_core::HTTPRequestManager {
public:
    // RCP transferMs is an overall transfer timeout, in milliseconds, not an idle timeout.
    explicit HarmonyHTTPRequestManager(uint32_t connectTimeoutMs = 60000,
                                       uint32_t requestTimeoutMs = 60000);
    ~HarmonyHTTPRequestManager() override;

    std::shared_ptr<snap::valdi_core::Cancelable> performRequest(
        const snap::valdi_core::HTTPRequest& request,
        const std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion>& completion) override;

    // Idempotent. Suppresses outstanding completions and schedules native cancellation.
    // Does not wait for RCP: retained native callback contexts drain asynchronously.
    // Safe inside a completion; previously returned Cancelables remain safe after destruction.
    void shutdown();

private:
    struct State;
    std::shared_ptr<State> _state;
};

} // namespace ValdiHarmony
