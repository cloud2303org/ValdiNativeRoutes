#include "../AnimationMath.hpp"

#include <cassert>
#include <iostream>

using namespace Valdi::Harmony::detail;

static bool near(double actual, double expected, double epsilon = 1e-8) {
    return std::abs(actual - expected) < epsilon;
}

int main() {
    // The production interpolator drives frame x/y/width/height, colors,
    // radii, opacity, and five transform components.
    const AnimationNumbers frameFrom {10, 20, 100, 50, 0};
    const AnimationNumbers frameTo {50, 80, 200, 90, 0};
    assert(interpolate(frameFrom, frameTo, 0) == frameFrom);
    assert(interpolate(frameFrom, frameTo, 1) == frameTo);
    const auto frame = interpolate(frameFrom, frameTo, .25);
    assert((frame == AnimationNumbers {20, 35, 125, 60, 0}));
    const auto overshoot = interpolate(frameFrom, frameTo, 1.1);
    assert(overshoot[0] > frameTo[0] && overshoot[2] > frameTo[2]);
    const auto reverse = interpolate(frameFrom, frameTo, .75);
    assert(near(reverse[0], 40));

    // Underdamped proof-page spring, critically damped, and overdamped.
    for (const auto& coefficients : {std::array<double, 2>{220, 22}, {100, 20}, {100, 40}}) {
        const auto k = coefficients[0], c = coefficients[1];
        assert(near(springProgress(0, k, c), 0));
        assert(std::abs(springProgress(1e-6, k, c) / 1e-6) < .001); // initial velocity 0
        assert(std::abs(springProgress(10, k, c) - 1) < 1e-8);
        // Check the actual differential equation x'' + c*x' + k*(x-1) = 0.
        const double h = 1e-5;
        for (double t : {.02, .1, .25, .5, 1.0}) {
            const double before = springProgress(t - h, k, c);
            const double at = springProgress(t, k, c);
            const double after = springProgress(t + h, k, c);
            const double velocity = (after - before) / (2 * h);
            const double acceleration = (after - 2 * at + before) / (h * h);
            assert(std::abs(acceleration + c * velocity + k * (at - 1)) < 1e-4);
        }
    }
    assert(springProgress(.35, 220, 22) > 1); // real overshoot, not eased linear
    assert(springProgress(.1, 100, 20) < springProgress(.2, 100, 20));
    // Stable large-damping root calculation.
    assert(std::isfinite(springProgress(.3, 1, 1e6)));
    assert(near(springSettlingDuration(220, 22), 12.0 / 11));
    assert(near(springSettlingDuration(100, 20), 1.2));
    assert(springSettlingDuration(100, 40) > springSettlingDuration(100, 20));
    for (const auto& coefficients : {std::array<double, 2>{220, 22}, {100, 20}, {100, 40}}) {
        const auto k = coefficients[0], c = coefficients[1];
        assert(std::abs(springProgress(springSettlingDuration(k, c), k, c) - 1) < .001);
    }

    assert(animationMilliseconds(1.2, 1) == 1200);
    assert(animationMilliseconds(1.2, 2) == 600);
    assert(animationMilliseconds(.25, .5) == 500);
    assert(animationMilliseconds(0, 1) == 0);
    assert(animationMilliseconds(.00001, 1) == 1);
    for (auto invalid : {std::array<double, 2>{-1, 1}, {1, 0}, {1, -1},
                         {std::numeric_limits<double>::infinity(), 1}, {1e20, 1}}) {
        bool rejected = false;
        try { animationMilliseconds(invalid[0], invalid[1]); }
        catch (const std::invalid_argument&) { rejected = true; }
        assert(rejected);
    }
    std::cout << "Animation production math: interpolation, overshoot, three spring regimes, "
                 "ODE residuals, timing/speed and invalid inputs passed\n";
}
