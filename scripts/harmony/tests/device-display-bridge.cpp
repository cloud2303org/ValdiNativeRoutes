// Production HarmonyBridgeModules.cpp is a separate translation unit.
// Use real SDK and Valdi headers; replace only the three OS query functions.
#include "HarmonyBridgeModules.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include <window_manager/oh_display_manager.h>

#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <limits>
#include <thread>
#include <vector>

namespace {
int32_t widthPixels = 1440, heightPixels = 2560;
float density = 3.0F;
NativeDisplayManager_ErrorCode widthError = DISPLAY_MANAGER_OK;
NativeDisplayManager_ErrorCode heightError = DISPLAY_MANAGER_OK;
NativeDisplayManager_ErrorCode densityError = DISPLAY_MANAGER_OK;
std::vector<char> queries;
std::thread::id queryThread;

Valdi::Value invoke(const Valdi::Value& module, const char* name, Valdi::SimpleExceptionTracker& error,
                    const Valdi::Value* parameters = nullptr, size_t count = 0) {
    auto function = module.getMapValue(name);
    assert(function.isFunction());
    Valdi::ValueFunctionCallContext context(Valdi::ValueFunctionFlagsCallSync, parameters, count, error);
    return (*function.getFunction())(context);
}

double number(const Valdi::Value& module, const char* name) {
    Valdi::SimpleExceptionTracker error;
    auto value = invoke(module, name, error);
    assert(error && value.isNumber());
    return value.toDouble();
}

void fails(const Valdi::Value& module, const char* name, const std::string& message,
           const std::vector<char>& expectedQueries) {
    queries.clear();
    Valdi::SimpleExceptionTracker error;
    auto value = invoke(module, name, error);
    assert(!error);
    assert(value.isUndefined()); // Exception must not accompany a fabricated numeric fallback.
    assert(error.getError().toString().find(message) != std::string::npos);
    assert(queries == expectedQueries);
    error.clearError();
}

void reset() {
    widthPixels = 1440;
    heightPixels = 2560;
    density = 3.0F;
    widthError = heightError = densityError = DISPLAY_MANAGER_OK;
    queries.clear();
}
} // namespace

extern "C" NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayWidth(int32_t* pixels) {
    assert(pixels);
    queries.push_back('w');
    queryThread = std::this_thread::get_id();
    if (widthError == DISPLAY_MANAGER_OK) *pixels = widthPixels;
    return widthError;
}

extern "C" NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayHeight(int32_t* pixels) {
    assert(pixels);
    queries.push_back('h');
    queryThread = std::this_thread::get_id();
    if (heightError == DISPLAY_MANAGER_OK) *pixels = heightPixels;
    return heightError;
}

extern "C" NativeDisplayManager_ErrorCode OH_NativeDisplayManager_GetDefaultDisplayDensityPixels(float* value) {
    assert(value);
    queries.push_back('d');
    queryThread = std::this_thread::get_id();
    if (densityError == DISPLAY_MANAGER_OK) *value = density;
    return densityError;
}

int main(int argc, char** argv) {
    ValdiHarmony::HostConfiguration configuration;
    configuration.width = 111;
    configuration.height = 222;
    configuration.scale = 7;
    auto state = std::make_shared<ValdiHarmony::HarmonyBridgeState>(configuration);
    std::weak_ptr<ValdiHarmony::HarmonyBridgeState> weak = state;
    {
        auto factory = state->deviceFactory();
        assert(factory->getModulePath().toStringView() == "valdi_core/src/DeviceBridge");
        auto device = factory->loadModule();
        assert(queries.empty()); // Loading DeviceBridge does not make an SDK query.
        if (argc == 2 && std::strcmp(argv[1], "--expect-unsupported") == 0) {
            fails(device, "getDisplayWidth", "Harmony host does not support getDisplayWidth", {});
            fails(device, "getDisplayHeight", "Harmony host does not support getDisplayHeight", {});
            std::cout << "RED: actual pre-change DeviceBridge rejects both display getters as unsupported\n";
            return 0;
        }

        assert(number(device, "getDisplayWidth") == 480.0);
        assert(number(device, "getDisplayHeight") == static_cast<double>(2560) / 3.0);
        assert((queries == std::vector<char>{'w', 'd', 'h', 'd'}));
        assert(number(device, "getWindowWidth") == 111);
        assert(number(device, "getWindowHeight") == 222);
        assert(number(device, "getDisplayScale") == 7); // Existing metadata policy is untouched.

        // No integer truncation, density double-application, or cached window substitute.
        for (float scale : {0.5F, 1.0F, 2.5F, 3.25F, 4.0F}) {
            density = scale;
            widthPixels = 1001;
            heightPixels = 1777;
            assert(number(device, "getDisplayWidth") == 1001.0 / static_cast<double>(scale));
            assert(number(device, "getDisplayHeight") == 1777.0 / static_cast<double>(scale));
        }

        reset();
        // Calls remain synchronous on the calling (Valdi JS) worker, without a UI dispatch.
        std::thread worker([&] {
            assert(number(device, "getDisplayHeight") == static_cast<double>(2560) / 3.0);
            assert(queryThread == std::this_thread::get_id());
        });
        worker.join();

        // Real JS size-observer path remains usable; subsequent calls read fresh SDK data.
        int sizeChanges = 0;
        Valdi::Value callback(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
            [&](const Valdi::ValueFunctionCallContext&) {
                ++sizeChanges;
                return Valdi::Value::undefined();
            }));
        Valdi::SimpleExceptionTracker error;
        auto subscription = invoke(device, "observeDisplaySizeChange", error, &callback, 1);
        assert(error && sizeChanges == 0);
        configuration.width = 333;
        configuration.height = 444;
        configuration.scale = 5;
        widthPixels = 2560;
        heightPixels = 1440;
        state->updateConfiguration(configuration);
        assert(sizeChanges == 1);
        assert(number(device, "getWindowHeight") == 444);
        assert(number(device, "getDisplayWidth") == static_cast<double>(2560) / 3.0);
        assert(number(device, "getDisplayHeight") == 480.0);
        invoke(subscription, "cancel", error);
        assert(error);

        for (auto code : {DISPLAY_MANAGER_ERROR_INVALID_PARAM, DISPLAY_MANAGER_ERROR_SYSTEM_ABNORMAL,
                          DISPLAY_MANAGER_ERROR_DEVICE_NOT_SUPPORTED}) {
            reset();
            widthError = code;
            fails(device, "getDisplayWidth", "GetDefaultDisplayWidth failed (code " +
                  std::to_string(code) + ")", {'w'});
            reset();
            heightError = code;
            fails(device, "getDisplayHeight", "GetDefaultDisplayHeight failed (code " +
                  std::to_string(code) + ")", {'h'});
            reset();
            densityError = code;
            for (const auto* name : {"getDisplayWidth", "getDisplayHeight"}) {
                fails(device, name, "GetDefaultDisplayDensityPixels failed (code " +
                      std::to_string(code) + ")", {std::strcmp(name, "getDisplayWidth") == 0 ? 'w' : 'h', 'd'});
            }
        }
        for (int32_t pixels : {0, -1}) {
            reset();
            widthPixels = heightPixels = pixels;
            fails(device, "getDisplayWidth", "GetDefaultDisplayWidth returned a non-positive", {'w'});
            fails(device, "getDisplayHeight", "GetDefaultDisplayHeight returned a non-positive", {'h'});
        }
        for (float invalid : {0.0F, -1.0F, std::numeric_limits<float>::quiet_NaN(),
                              std::numeric_limits<float>::infinity(), -std::numeric_limits<float>::infinity()}) {
            reset();
            density = invalid;
            fails(device, "getDisplayWidth", "GetDefaultDisplayDensityPixels returned an invalid density", {'w', 'd'});
            fails(device, "getDisplayHeight", "GetDefaultDisplayDensityPixels returned an invalid density", {'h', 'd'});
        }
        reset();
        assert(number(device, "getDisplayHeight") == static_cast<double>(2560) / 3.0);

        // Remaining DebugConsole calls preserve the existing content-viewport inset behavior.
        assert(number(device, "getDisplayTopInset") == 0);
        assert(number(device, "getDisplayBottomInset") == 0);
        state->clearObservers();
        state.reset();
        assert(!weak.expired()); // Existing factory/module ownership keeps state alive.
    }
    assert(weak.expired()); // No new retained SDK/context singleton or state cycle.
    std::cout << "GREEN: production DeviceBridge logical dimensions, fresh SDK reads, explicit SDK errors, "
                 "invalid-data rejection, worker calls, size observers, and lifetime checks passed\n";
}
