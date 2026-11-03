#pragma once

#include "valdi_core/ModuleFactory.hpp"
#include "valdi_core/cpp/Utils/ValueFunction.hpp"

#include <map>
#include <memory>
#include <mutex>
#include <string>

namespace ValdiHarmony {

// Metadata is a snapshot from ResourceManager.getConfigurationSync(), refreshed
// when ArkTS forwards resize/foreground changes.
struct HostConfiguration {
    double width = 0;
    double height = 0;
    double scale = 1;
    bool dark = false;
    std::string locale;
    std::string storageRoot;
};

class HarmonyBridgeState : public std::enable_shared_from_this<HarmonyBridgeState> {
public:
    explicit HarmonyBridgeState(HostConfiguration configuration);
    std::shared_ptr<snap::valdi_core::ModuleFactory> deviceFactory();
    std::shared_ptr<snap::valdi_core::ModuleFactory> applicationFactory();

    // Call on the Valdi JS queue, including notifications.
    void updateConfiguration(HostConfiguration configuration);
    void setActive(bool active);
    void setKeyboardHeight(double height);
    void clearObservers();

private:
    enum class Event { Size, Insets, Dark, Keyboard, Background, Foreground };
    struct Observer {
        Event event;
        Valdi::Ref<Valdi::ValueFunction> callback;
    };

    std::recursive_mutex _mutex;
    HostConfiguration _configuration;
    bool _active = true;
    bool _closed = false;
    double _keyboardHeight = 0;
    uint64_t _nextObserver = 1;
    std::map<uint64_t, Observer> _observers;

    Valdi::Value loadDevice();
    Valdi::Value loadApplication();
    Valdi::Value observe(Event event, const Valdi::ValueFunctionCallContext& context);
    void notify(Event event);
};

} // namespace ValdiHarmony
