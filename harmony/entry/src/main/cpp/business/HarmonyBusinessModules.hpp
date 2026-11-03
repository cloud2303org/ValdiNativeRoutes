#pragma once

#include "AssetTokenStore.hpp"
#include "valdi_core/ModuleFactory.hpp"
#include "valdi_modules/bluetooth/bluetooth.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <optional>

#include <memory>
#include <mutex>

namespace ValdiHarmony {

// One retained instance per application Runtime. Factories/native functions use
// weak references: their presence in JS never keeps an abandoned owner alive.
class HarmonyBusinessModules final : public std::enable_shared_from_this<HarmonyBusinessModules> {
public:
    static std::shared_ptr<HarmonyBusinessModules> create();
    std::shared_ptr<snap::valdi_core::ModuleFactory> bluetoothFactory();
    Valdi::Value tokenStoreValue();
    Valdi::Value permissionHostValue();

    // Valdi JS queue, before Runtime teardown, after stopping native admission.
    // Idempotent. Releases all JS event functions before the app scope dies.
    void shutdown();
    bool hasBluetoothEvents() const;

private:
    HarmonyBusinessModules() = default;
    void initialize();
    class UnsupportedBleHost;
    class UnsupportedPermissionHost;
    void requireOpen() const;
    void setBluetoothEvents(snap::valdi_modules::bluetooth::BleHostEvents events);
    bool hasToken();
    Valdi::StringBox readToken();
    void writeToken(Valdi::StringBox token);
    void clearToken();

    mutable std::mutex _mutex;
    bool _closed = false;
    Valdi::Ref<snap::valdi_modules::bluetooth::BleHost> _bluetoothHost;
    Valdi::Value _tokenStore;
    Valdi::Value _permissionHost;
    std::optional<snap::valdi_modules::bluetooth::BleHostEvents> _events;
    AssetTokenStore _tokens;
};

} // namespace ValdiHarmony
