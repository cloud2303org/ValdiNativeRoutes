#pragma once
#include "PlatformServiceAdapters.hpp"
#include "PlatformServiceInterface.hpp"
#include "valdi_core/ModuleFactory.hpp"
namespace ValdiHarmony::Platform {
class BluetoothModuleAdapter final : public snap::valdi_modules::bluetooth::BluetoothModule {
public:
    explicit BluetoothModuleAdapter(const std::shared_ptr<ServicePort>& port)
        : _port(port), _ble(port->interfaces().ble()) {}
    Valdi::Ref<snap::valdi_modules::bluetooth::BleHost> getHost() final {
        auto port = _port.lock();
        if (!port || port->closed()) throw Valdi::Exception("E_PLATFORM_CLOSED:runtime owner released");
        return _ble;
    }
private:
    std::weak_ptr<ServicePort> _port;
    Valdi::Ref<snap::valdi_modules::bluetooth::BleHost> _ble;
};
class BluetoothFactory final : public snap::valdi_core::ModuleFactory {
public:
    explicit BluetoothFactory(const std::shared_ptr<ServicePort>& port)
        : _module(Valdi::makeShared<BluetoothModuleAdapter>(port)) {}
    Valdi::StringBox getModulePath() override {
        return Valdi::StringBox::fromCString("bluetooth/src/Bluetooth");
    }
    Valdi::Value loadModule() override { return interfaceValue(_module); }
private:
    Valdi::Ref<snap::valdi_modules::bluetooth::BluetoothModule> _module;
};
} // namespace ValdiHarmony::Platform
