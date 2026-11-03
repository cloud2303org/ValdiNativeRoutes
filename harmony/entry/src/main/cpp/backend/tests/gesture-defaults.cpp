// This small RED probe isolates the actual production default initializer.
// Controller coverage is provided separately by gesture-native.cpp.
#include "gesture-defaults-under-test.hpp"
#include <cstdio>
int main() {
    GestureDefaultsUnderTest state;
    if (state.longPressDuration != .25) {
        std::fprintf(stderr, "REGRESSION: iOS long-press default is .25 seconds; got %.3f\n",
                     state.longPressDuration);
        return 1;
    }
}
