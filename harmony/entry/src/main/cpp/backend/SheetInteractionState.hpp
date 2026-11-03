#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>

namespace Valdi::Harmony::detail {

// Shared by the production receiver and source-only host fixtures. A session
// identifies an accepted touch, never an SDK frame or an inferred event ID.
enum class SheetMotionSource { None, PanelPan, ScrollBudget, Exclusive };

struct SheetTouchSession {
    SheetMotionSource source = SheetMotionSource::None;
    uint64_t id = 0;
    bool touching = false, beginning = false, accepted = false, terminal = false;
    float lastPan = 0, closedwardVelocity = 0;

    void down() {
        source = SheetMotionSource::None;
        touching = true;
        beginning = accepted = terminal = false;
        id = 0;
        lastPan = closedwardVelocity = 0;
    }
    bool select(SheetMotionSource selected) {
        if (!touching || terminal) return false;
        if (source == SheetMotionSource::None) source = selected;
        return source == selected;
    }
    bool begin(uint64_t next) {
        if (!touching || terminal || accepted || beginning ||
            source == SheetMotionSource::None || source == SheetMotionSource::Exclusive) return false;
        id = next;
        beginning = true;
        return true;
    }
    void admitted(bool result) {
        beginning = false;
        accepted = result;
        if (!result) terminal = true;
    }
    bool consumeEnd() {
        touching = false;
        terminal = true;
        return std::exchange(accepted, false);
    }
    bool owns(uint64_t ticket) const {
        return id == ticket && accepted && !terminal && touching;
    }
};

inline bool sheetRemainderValid(float input, float remainder) {
    return std::isfinite(input) && std::isfinite(remainder) &&
        (input > 0 ? remainder >= 0 && remainder <= input :
         input < 0 ? remainder <= 0 && remainder >= input : remainder == 0);
}

inline float sheetScrollConsumption(float budget, float offset, float maximum) {
    if (!std::isfinite(budget) || !std::isfinite(offset) || !std::isfinite(maximum)) return 0;
    const float bounded = std::clamp(offset, 0.0f, std::max(0.0f, maximum));
    return budget < 0 ? -std::min(-budget, bounded) :
                        std::min(budget, std::max(0.0f, maximum - bounded));
}

} // namespace Valdi::Harmony::detail
