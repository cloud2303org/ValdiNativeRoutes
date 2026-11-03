#pragma once

#include <mutex>
#include <stdexcept>

namespace ValdiHarmony {

// Process resource admission only: RuntimeManagers share a Hermes bridge and
// debugger transport. This authority retains no host and runs no callbacks.
class HarmonyDevelopmentHostLease final {
public:
    HarmonyDevelopmentHostLease() {
        auto& authority = state();
        std::lock_guard guard(authority.mutex);
        if (authority.occupied) {
            throw std::runtime_error(
                "Full-development Harmony permits only one live or destroying runtime host");
        }
        authority.occupied = true;
    }

    ~HarmonyDevelopmentHostLease() noexcept {
        auto& authority = state();
        std::lock_guard guard(authority.mutex);
        authority.occupied = false;
    }

    HarmonyDevelopmentHostLease(const HarmonyDevelopmentHostLease&) = delete;
    HarmonyDevelopmentHostLease& operator=(const HarmonyDevelopmentHostLease&) = delete;
    HarmonyDevelopmentHostLease(HarmonyDevelopmentHostLease&&) = delete;
    HarmonyDevelopmentHostLease& operator=(HarmonyDevelopmentHostLease&&) = delete;

private:
    struct Authority {
        std::mutex mutex;
        bool occupied = false;
    };

    static Authority& state() {
        // Function-local static in an inline function is shared by every TU.
        static Authority authority;
        return authority;
    }
};

} // namespace ValdiHarmony
