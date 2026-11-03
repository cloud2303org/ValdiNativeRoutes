#pragma once

#include "../platform/PlatformServicePort.hpp"
#include "../host/HarmonyMainThreadDispatcher.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include "valdi_core/ModuleFactory.hpp"
#include <napi/native_api.h>

namespace ValdiHarmony {

// One per RuntimeHost. Create on UI before mount, supplying the UIAbility-owned
// PlatformServices object. No module globals, request registry or JSON bridge.
class HarmonySystemServiceHosts final {
public:
    static std::shared_ptr<HarmonySystemServiceHosts> create(
        napi_env env, napi_value services,
        Valdi::Ref<HarmonyMainThreadDispatcher> ui, Valdi::Ref<Valdi::DispatchQueue> js);
    Valdi::Value bluetoothHostValue(); // JS only
    Valdi::Value permissionHostValue();
    Valdi::Value wifiHostValue();
    Valdi::Value nfcHostValue();
    std::shared_ptr<snap::valdi_core::ModuleFactory> bluetoothFactory(); // JS only
    void setActive(bool); // UI
    void closeOnUI(); // BEFORE navigator/context disposal is queued.
    void shutdownOnJS(); // Before contexts are disposed; idempotent cancellation.
    void releaseOnUI(); // After shutdown fence; while NAPI env and dispatcher live.
private:
    explicit HarmonySystemServiceHosts(std::shared_ptr<Platform::ServicePort> port) : _port(std::move(port)) {}
    std::shared_ptr<Platform::ServicePort> _port;
};
} // namespace ValdiHarmony
