#pragma once

#include <cstdint>

namespace Valdi::Harmony::detail {

// UI-only controlled state. Native Refresh owns gesture recognition/translation.
struct RefreshState {
    bool refreshing = false;
    bool enabled = true;
    bool notified = false;
    bool armed = false;
    uint64_t generation = 0;

    void cancel() {
        ++generation;
        notified = armed = false;
    }
    void setRefreshing(bool value) {
        cancel();
        refreshing = value;
    }
    void reset() {
        cancel();
        refreshing = false;
        enabled = true;
    }
    void nativeState(int32_t value) {
        if (value == 0 || value == 4) {
            notified = armed = false;
        } else if ((value == 1 || value == 2) && !refreshing) {
            armed = true;
        }
    }
    bool request(bool eligible) {
        if (!eligible || !enabled || refreshing || notified || !armed) return false;
        armed = false;
        notified = true;
        return true;
    }
};

} // namespace Valdi::Harmony::detail
