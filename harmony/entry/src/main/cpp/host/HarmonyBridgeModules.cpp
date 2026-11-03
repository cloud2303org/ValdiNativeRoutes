#include "HarmonyBridgeModules.hpp"

#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"

#include <window_manager/oh_display_manager.h>

#include <algorithm>
#include <cmath>
#include <ctime>
#include <functional>
#include <utility>

namespace ValdiHarmony {
namespace {

class Factory final : public snap::valdi_core::ModuleFactory {
public:
    Factory(const char* path, std::function<Valdi::Value()> load) : _path(path), _load(std::move(load)) {}
    Valdi::StringBox getModulePath() override { return Valdi::StringBox::fromCString(_path); }
    Valdi::Value loadModule() override { return _load(); }

private:
    const char* _path;
    std::function<Valdi::Value()> _load;
};

using Callable = Valdi::ValueFunctionCallable;

void bind(Valdi::Value& module, const char* name, Callable callable) {
    module.setMapValue(name, Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(std::move(callable))));
}

void unsupported(Valdi::Value& module, const char* name) {
    bind(module, name, [name](const Valdi::ValueFunctionCallContext& context) {
        context.getExceptionTracker().onError(
            Valdi::Error(std::string("Harmony host does not support ") + name));
        return Valdi::Value::undefined();
    });
}

Valdi::Value getDefaultDisplayDimension(bool width, const Valdi::ValueFunctionCallContext& context) {
    const auto* operation = width ? "OH_NativeDisplayManager_GetDefaultDisplayWidth"
                                  : "OH_NativeDisplayManager_GetDefaultDisplayHeight";
    int32_t pixels = 0;
    const auto dimensionError = width ? OH_NativeDisplayManager_GetDefaultDisplayWidth(&pixels)
                                      : OH_NativeDisplayManager_GetDefaultDisplayHeight(&pixels);
    if (dimensionError != DISPLAY_MANAGER_OK) {
        context.getExceptionTracker().onError(
            Valdi::Error(std::string(operation) + " failed (code " + std::to_string(dimensionError) + ")"));
        return Valdi::Value::undefined();
    }
    if (pixels <= 0) {
        context.getExceptionTracker().onError(
            Valdi::Error(std::string(operation) + " returned a non-positive display dimension"));
        return Valdi::Value::undefined();
    }

    // DisplayManager's synchronous C API returns physical px and px/logical-px.
    // Like Android Device's real display metrics and iOS points, Valdi expects
    // logical dimensions. Do not substitute the host's content-window VP size.
    // Unlike ArkUI node APIs, these queries need no UI node/context or main-thread dispatch.
    float density = 0;
    const auto densityError = OH_NativeDisplayManager_GetDefaultDisplayDensityPixels(&density);
    if (densityError != DISPLAY_MANAGER_OK) {
        context.getExceptionTracker().onError(
            Valdi::Error("OH_NativeDisplayManager_GetDefaultDisplayDensityPixels failed (code " +
                         std::to_string(densityError) + ")"));
        return Valdi::Value::undefined();
    }
    if (!std::isfinite(density) || density <= 0) {
        context.getExceptionTracker().onError(
            Valdi::Error("OH_NativeDisplayManager_GetDefaultDisplayDensityPixels returned an invalid density"));
        return Valdi::Value::undefined();
    }
    return Valdi::Value(static_cast<double>(pixels) / static_cast<double>(density));
}

} // namespace

HarmonyBridgeState::HarmonyBridgeState(HostConfiguration configuration) : _configuration(std::move(configuration)) {}

std::shared_ptr<snap::valdi_core::ModuleFactory> HarmonyBridgeState::deviceFactory() {
    return std::make_shared<Factory>("valdi_core/src/DeviceBridge",
                                     [self = shared_from_this()] { return self->loadDevice(); });
}

std::shared_ptr<snap::valdi_core::ModuleFactory> HarmonyBridgeState::applicationFactory() {
    return std::make_shared<Factory>("valdi_core/src/ApplicationBridge",
                                     [self = shared_from_this()] { return self->loadApplication(); });
}

Valdi::Value HarmonyBridgeState::observe(Event event, const Valdi::ValueFunctionCallContext& context) {
    auto observer = context.getParameterAsFunction(0);
    if (!context.getExceptionTracker()) {
        return {};
    }
    std::lock_guard lock(_mutex);
    if (_closed) {
        context.getExceptionTracker().onError(Valdi::Error("Harmony host is being destroyed"));
        return {};
    }
    const auto id = _nextObserver++;
    _observers.emplace(id, Observer{event, observer});
    if (event == Event::Dark) {
        (*observer)(Valdi::ValueFunctionFlagsNeverCallSync, {Valdi::Value(_configuration.dark)});
    } else if (event == Event::Keyboard) {
        (*observer)(Valdi::ValueFunctionFlagsNeverCallSync, {Valdi::Value(_keyboardHeight)});
    }
    Valdi::Value result;
    bind(result, "cancel", [weak = weak_from_this(), id](const Valdi::ValueFunctionCallContext&) {
        if (auto self = weak.lock()) {
            std::lock_guard guard(self->_mutex);
            self->_observers.erase(id);
        }
        return Valdi::Value::undefined();
    });
    return result;
}

void HarmonyBridgeState::notify(Event event) {
    std::lock_guard lock(_mutex);
    const auto observers = _observers;
    for (const auto& [id, observer] : observers) {
        if (observer.event != event || _observers.find(id) == _observers.end()) {
            continue;
        }
        if (event == Event::Dark) {
            (*observer.callback)(Valdi::ValueFunctionFlagsNeverCallSync, {Valdi::Value(_configuration.dark)});
        } else if (event == Event::Keyboard) {
            (*observer.callback)(Valdi::ValueFunctionFlagsNeverCallSync, {Valdi::Value(_keyboardHeight)});
        } else {
            (*observer.callback)(Valdi::ValueFunctionFlagsNeverCallSync, {});
        }
    }
}

void HarmonyBridgeState::setKeyboardHeight(double height) {
    std::lock_guard lock(_mutex);
    if (_closed || _keyboardHeight == height) return;
    _keyboardHeight = height;
    notify(Event::Keyboard);
}

void HarmonyBridgeState::updateConfiguration(HostConfiguration configuration) {
    std::lock_guard lock(_mutex);
    const bool sizeChanged = _configuration.width != configuration.width ||
                             _configuration.height != configuration.height ||
                             _configuration.scale != configuration.scale;
    const bool darkChanged = _configuration.dark != configuration.dark;
    _configuration = std::move(configuration);
    if (sizeChanged) {
        notify(Event::Size);
        notify(Event::Insets);
    }
    if (darkChanged) {
        notify(Event::Dark);
    }
}

void HarmonyBridgeState::setActive(bool active) {
    std::lock_guard lock(_mutex);
    if (_active == active) {
        return;
    }
    _active = active;
    if (!active) setKeyboardHeight(0);
    notify(active ? Event::Foreground : Event::Background);
}

void HarmonyBridgeState::clearObservers() {
    std::lock_guard lock(_mutex);
    _closed = true;
    _observers.clear();
}

Valdi::Value HarmonyBridgeState::loadDevice() {
    Valdi::Value module;
    auto self = shared_from_this();
    bind(module, "getSystemType", [](const auto&) { return Valdi::Value("harmony"); });
    bind(module, "isDesktop", [](const auto&) { return Valdi::Value(false); });
    bind(module, "isWeb", [](const auto&) { return Valdi::Value(false); });
    bind(module, "getDisplayWidth", [](const auto& context) {
        return getDefaultDisplayDimension(true, context);
    });
    bind(module, "getDisplayHeight", [](const auto& context) {
        return getDefaultDisplayDimension(false, context);
    });
    for (const auto* name : {"getWindowWidth", "getWindowHeight", "getDisplayScale"}) {
        bind(module, name, [self, name](const auto&) {
            std::lock_guard lock(self->_mutex);
            if (std::string_view(name) == "getWindowWidth") {
                return Valdi::Value(self->_configuration.width);
            }
            if (std::string_view(name) == "getWindowHeight") {
                return Valdi::Value(self->_configuration.height);
            }
            return Valdi::Value(self->_configuration.scale);
        });
    }
    // The initial host renders inside a content-sized viewport, without a
    // window inset overlay or dynamic-type policy.
    bind(module, "getDynamicTypeScale", [](const auto&) { return Valdi::Value(1.0); });
    for (const auto* name : {"getDisplayLeftInset", "getDisplayRightInset",
                             "getDisplayTopInset", "getDisplayBottomInset"}) {
        bind(module, name, [](const auto&) { return Valdi::Value(0.0); });
    }
    bind(module, "getDeviceLocales", [self](const auto&) {
        std::lock_guard lock(self->_mutex);
        auto array = Valdi::ValueArray::make(self->_configuration.locale.empty() ? 0 : 1);
        if (!self->_configuration.locale.empty()) {
            auto locale = self->_configuration.locale;
            std::replace(locale.begin(), locale.end(), '_', '-');
            array->emplace(0, Valdi::Value(Valdi::StringBox::fromString(locale)));
        }
        return Valdi::Value(array);
    });
    bind(module, "getUptimeMs", [](const Valdi::ValueFunctionCallContext& context) {
        timespec time{};
        if (clock_gettime(CLOCK_MONOTONIC, &time) != 0) {
            context.getExceptionTracker().onError(Valdi::Error("clock_gettime(CLOCK_MONOTONIC) failed"));
            return Valdi::Value::undefined();
        }
        return Valdi::Value(static_cast<double>(time.tv_sec) * 1000.0 +
                             static_cast<double>(time.tv_nsec) / 1000000.0);
    });
    bind(module, "observeDisplaySizeChange", [self](const auto& context) {
        return self->observe(Event::Size, context);
    });
    bind(module, "observeDisplayInsetChange", [self](const auto& context) {
        return self->observe(Event::Insets, context);
    });
    bind(module, "observeDarkMode", [self](const auto& context) {
        return self->observe(Event::Dark, context);
    });
    for (const auto* name : {"getSystemVersion", "getModel",
                             "getLocaleUsesMetricSystem", "getTimeZoneName", "getTimeZoneRawSecondsFromGMT",
                             "getTimeZoneDstSecondsFromGMT", "copyToClipBoard", "performHapticFeedback",
                             "setBackButtonObserver"}) {
        unsupported(module, name);
    }
    return module;
}

Valdi::Value HarmonyBridgeState::loadApplication() {
    Valdi::Value module;
    auto self = shared_from_this();
    bind(module, "observeEnteredBackground", [self](const auto& context) {
        return self->observe(Event::Background, context);
    });
    bind(module, "observeEnteredForeground", [self](const auto& context) {
        return self->observe(Event::Foreground, context);
    });
    bind(module, "isForegrounded", [self](const auto&) {
        std::lock_guard lock(self->_mutex);
        return Valdi::Value(self->_active);
    });
    bind(module, "observeKeyboardHeight", [self](const auto& context) {
        return self->observe(Event::Keyboard, context);
    });
    unsupported(module, "getAppVersion");
    unsupported(module, "isIntegrationTestEnvironment");
    return module;
}

} // namespace ValdiHarmony
