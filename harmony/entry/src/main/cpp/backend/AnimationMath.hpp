#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>

namespace Valdi::Harmony::detail {

using AnimationNumbers = std::array<double, 5>;

inline AnimationNumbers interpolate(const AnimationNumbers& from, const AnimationNumbers& to, double progress) {
    AnimationNumbers result {};
    for (size_t i = 0; i < result.size(); ++i) result[i] = from[i] + (to[i] - from[i]) * progress;
    return result;
}

// Unit-mass spring, initial displacement -1, initial velocity 0.
// Driven exclusively by ArkUI's native onFrame clock, not a separate timer.
inline double springProgress(double seconds, double stiffness, double damping) {
    const double alpha = damping / 2;
    const double discriminant = alpha * alpha - stiffness;
    if (std::abs(discriminant) < 1e-8 * std::max(1.0, stiffness)) {
        return 1 - std::exp(-alpha * seconds) * (1 + alpha * seconds);
    }
    if (discriminant < 0) {
        const double omega = std::sqrt(-discriminant);
        return 1 - std::exp(-alpha * seconds) *
            (std::cos(omega * seconds) + alpha / omega * std::sin(omega * seconds));
    }
    // Stable overdamped roots (avoid catastrophic cancellation in alpha-root).
    const double root = std::sqrt(discriminant);
    const double fast = -alpha - root;
    const double slow = stiffness / fast;
    return 1 + (fast * std::exp(slow * seconds) - slow * std::exp(fast * seconds)) / (slow - fast);
}

inline double springSettlingDuration(double stiffness, double damping) {
    const double alpha = damping / 2;
    const double discriminant = alpha * alpha - stiffness;
    const double decay = discriminant > 0 ?
        stiffness / (alpha + std::sqrt(discriminant)) : alpha;
    return 12 / decay;
}

inline int32_t animationMilliseconds(double seconds, double speed) {
    const double ms = seconds / speed * 1000;
    if (!std::isfinite(seconds) || seconds < 0 || !std::isfinite(speed) || speed <= 0 ||
        !std::isfinite(ms) || ms > std::numeric_limits<int32_t>::max()) {
        throw std::invalid_argument("invalid/overflowing native animation duration, delay, or speed");
    }
    // Preserve an actual native clock for any positive, representable duration.
    return ms == 0 ? 0 : static_cast<int32_t>(std::max(1.0, std::round(ms)));
}

} // namespace Valdi::Harmony::detail
