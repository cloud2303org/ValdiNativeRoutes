#include "HarmonyBusinessModules.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include <stdexcept>
#include <utility>

namespace ValdiHarmony {
namespace {

// Official generated trampolines catch Valdi::Exception, not std::exception.
template<typename F> decltype(auto) nativeCall(F&& operation) {
    try { return operation(); }
    catch (const Valdi::Exception&) { throw; }
    catch (const std::exception& error) {
        throw Valdi::Exception(Valdi::Error(std::string_view(error.what())));
    } catch (...) {
        throw Valdi::Exception(Valdi::Error("E_BUSINESS_HOST:unexpected native failure"));
    }
}

template<typename T> Valdi::Value marshal(const T& object) {
    Valdi::SimpleExceptionTracker error;
    Valdi::Value value;
    Valdi::CppMarshaller::marshall(error, object, value);
    if (!error) throw Valdi::Exception(error.extractError());
    return value;
}

std::shared_ptr<HarmonyBusinessModules> owner(const std::weak_ptr<HarmonyBusinessModules>& weak) {
    auto self = weak.lock();
    if (!self) throw std::runtime_error("E_BUSINESS_HOST_CLOSED:application owner was released");
    return self;
}

class BluetoothFactory final : public snap::valdi_core::ModuleFactory {
public:
    explicit BluetoothFactory(Valdi::Value module) : _module(std::move(module)) {}
    Valdi::StringBox getModulePath() override {
        return Valdi::StringBox::fromCString("bluetooth/src/Bluetooth");
    }
    Valdi::Value loadModule() override { return _module; }

private:
    Valdi::Value _module;
};

} // namespace

class HarmonyBusinessModules::UnsupportedBleHost final : public snap::valdi_modules::bluetooth::BleHost {
public:
    explicit UnsupportedBleHost(std::weak_ptr<HarmonyBusinessModules> weak) : _owner(std::move(weak)) {}
    void setEvents(snap::valdi_modules::bluetooth::BleHostEvents events) final {
        nativeCall([&] { owner(_owner)->setBluetoothEvents(std::move(events)); });
    }
    Valdi::Future<void> openBluetoothAdapter(std::optional<Valdi::StringBox>) final {
        return reject<void>("openBluetoothAdapter");
    }
    Valdi::Future<void> closeBluetoothAdapter() final {
        return reject<void>("closeBluetoothAdapter");
    }
    Valdi::Future<snap::valdi_modules::bluetooth::BleAdapterState> getBluetoothAdapterState() final {
        return reject<snap::valdi_modules::bluetooth::BleAdapterState>("getBluetoothAdapterState");
    }
    Valdi::Future<void> startBluetoothDevicesDiscovery(snap::valdi_modules::bluetooth::BleScanParams) final {
        return reject<void>("startBluetoothDevicesDiscovery");
    }
    Valdi::Future<void> startBluetoothDevicesDiscoveryWithNames(std::vector<Valdi::StringBox>) final {
        return reject<void>("startBluetoothDevicesDiscoveryWithNames");
    }
    Valdi::Future<void> startBluetoothDevicesDiscoveryWithAddresses(std::vector<Valdi::StringBox>) final {
        return reject<void>("startBluetoothDevicesDiscoveryWithAddresses");
    }
    Valdi::Future<void> stopBluetoothDevicesDiscovery() final {
        return reject<void>("stopBluetoothDevicesDiscovery");
    }
    Valdi::Future<std::vector<snap::valdi_modules::bluetooth::BleDevice>> getBluetoothDevices() final {
        return reject<std::vector<snap::valdi_modules::bluetooth::BleDevice>>("getBluetoothDevices");
    }
    Valdi::Future<void> createBLEConnection(Valdi::StringBox, std::optional<double>) final {
        return reject<void>("createBLEConnection");
    }
    Valdi::Future<void> closeBLEConnection(Valdi::StringBox) final {
        return reject<void>("closeBLEConnection");
    }
    Valdi::Future<void> makeBluetoothPair(snap::valdi_modules::bluetooth::BlePairParams) final {
        return reject<void>("makeBluetoothPair");
    }
    Valdi::Future<void> isBluetoothDevicePaired(Valdi::StringBox) final {
        return reject<void>("isBluetoothDevicePaired");
    }
    Valdi::Future<std::vector<snap::valdi_modules::bluetooth::BleService>> getBLEDeviceServices(Valdi::StringBox) final {
        return reject<std::vector<snap::valdi_modules::bluetooth::BleService>>("getBLEDeviceServices");
    }
    Valdi::Future<double> getBLEDeviceRSSI(Valdi::StringBox) final {
        return reject<double>("getBLEDeviceRSSI");
    }
    Valdi::Future<std::vector<snap::valdi_modules::bluetooth::BleCharacteristic>> getBLEDeviceCharacteristics(Valdi::StringBox, Valdi::StringBox) final {
        return reject<std::vector<snap::valdi_modules::bluetooth::BleCharacteristic>>("getBLEDeviceCharacteristics");
    }
    Valdi::Future<void> notifyBLECharacteristicValueChange(snap::valdi_modules::bluetooth::BleNotifyParams) final {
        return reject<void>("notifyBLECharacteristicValueChange");
    }
    Valdi::Future<void> writeBLECharacteristicValue(snap::valdi_modules::bluetooth::BleWriteParams) final {
        return reject<void>("writeBLECharacteristicValue");
    }
    Valdi::Future<void> readBLECharacteristicValue(snap::valdi_modules::bluetooth::BleReadParams) final {
        return reject<void>("readBLECharacteristicValue");
    }
    Valdi::Future<double> setBLEMTU(Valdi::StringBox, double) final {
        return reject<double>("setBLEMTU");
    }
    Valdi::Future<double> getBLEMTU(Valdi::StringBox, std::optional<Valdi::StringBox>) final {
        return reject<double>("getBLEMTU");
    }
    Valdi::Future<std::vector<snap::valdi_modules::bluetooth::BleConnectedDevice>> getConnectedBluetoothDevices(std::vector<Valdi::StringBox>) final {
        return reject<std::vector<snap::valdi_modules::bluetooth::BleConnectedDevice>>("getConnectedBluetoothDevices");
    }
    Valdi::Future<Valdi::StringBox> createBLEPeripheralServer() final {
        return reject<Valdi::StringBox>("createBLEPeripheralServer");
    }
    Valdi::Future<void> addPeripheralService(Valdi::StringBox, snap::valdi_modules::bluetooth::BlePeripheralService) final {
        return reject<void>("addPeripheralService");
    }
    Valdi::Future<void> removePeripheralService(Valdi::StringBox, Valdi::StringBox) final {
        return reject<void>("removePeripheralService");
    }
    Valdi::Future<void> startPeripheralAdvertising(snap::valdi_modules::bluetooth::BlePeripheralAdvertisingParams) final {
        return reject<void>("startPeripheralAdvertising");
    }
    Valdi::Future<void> stopPeripheralAdvertising(Valdi::StringBox) final {
        return reject<void>("stopPeripheralAdvertising");
    }
    Valdi::Future<void> writePeripheralCharacteristicValue(snap::valdi_modules::bluetooth::BlePeripheralWriteParams) final {
        return reject<void>("writePeripheralCharacteristicValue");
    }
    Valdi::Future<void> closeBLEPeripheralServer(Valdi::StringBox) final {
        return reject<void>("closeBLEPeripheralServer");
    }
private:
    template<typename T> Valdi::Future<T> reject(const char* method) {
        return nativeCall([&] {
            auto self = _owner.lock();
            std::string message;
            if (!self) message = "E_BLE_NOT_INITIALIZED:application owner was released";
            else {
                std::lock_guard lock(self->_mutex);
                if (self->_closed) message = "E_BLE_NOT_INITIALIZED:application host is closed";
            }
            if (message.empty()) message = std::string("E_BLE_SYSTEM_NOT_SUPPORTED:Harmony radio operation ") +
                method + " is not implemented";
            Valdi::TypedPromise<T> promise;
            promise.setError(Valdi::Error(std::string_view(message)));
            return promise.getFuture();
        });
    }
    std::weak_ptr<HarmonyBusinessModules> _owner;
};

class HarmonyBusinessModules::UnsupportedPermissionHost final : public snap::valdi_modules::app_pages::PermissionHost {
public:
    explicit UnsupportedPermissionHost(std::weak_ptr<HarmonyBusinessModules> weak) : _owner(std::move(weak)) {}
    Valdi::Future<bool> check(Valdi::StringBox) final {
        return reject<bool>("check");
    }
    Valdi::Future<std::vector<snap::valdi_modules::app_pages::PermissionGrant>> requestMultiple(std::vector<Valdi::StringBox>) final {
        return reject<std::vector<snap::valdi_modules::app_pages::PermissionGrant>>("requestMultiple");
    }
    Valdi::Future<void> openSettings() final {
        return reject<void>("openSettings");
    }
private:
    template<typename T> Valdi::Future<T> reject(const char* method) {
        return nativeCall([&] {
            auto self = _owner.lock();
            std::string message;
            if (!self) message = "E_BUSINESS_HOST_CLOSED:application owner was released";
            else {
                std::lock_guard lock(self->_mutex);
                if (self->_closed) message = "E_BUSINESS_HOST_CLOSED:application host is closed";
            }
            if (message.empty()) message = std::string("E_PERMISSION_SYSTEM_NOT_SUPPORTED:") + method + " is not implemented for Harmony";
            Valdi::TypedPromise<T> promise;
            promise.setError(Valdi::Error(std::string_view(message)));
            return promise.getFuture();
        });
    }
    std::weak_ptr<HarmonyBusinessModules> _owner;
};

std::shared_ptr<HarmonyBusinessModules> HarmonyBusinessModules::create() {
    auto result = std::shared_ptr<HarmonyBusinessModules>(new HarmonyBusinessModules());
    result->initialize();
    return result;
}

void HarmonyBusinessModules::initialize() {
    const auto weak = weak_from_this();
    _bluetoothHost = Valdi::makeShared<UnsupportedBleHost>(weak);
    Valdi::Ref<snap::valdi_modules::app_pages::PermissionHost> permissions =
        Valdi::makeShared<UnsupportedPermissionHost>(weak);
    _permissionHost = marshal(permissions);
    snap::valdi_modules::app_pages::TokenStore tokens;
    tokens.setHas([weak] { return nativeCall([&] { return owner(weak)->hasToken(); }); });
    tokens.setRead([weak] { return nativeCall([&] { return owner(weak)->readToken(); }); });
    tokens.setWrite([weak](Valdi::StringBox token) {
        nativeCall([&] { owner(weak)->writeToken(std::move(token)); });
    });
    tokens.setClear([weak] { nativeCall([&] { owner(weak)->clearToken(); }); });
    _tokenStore = marshal(tokens);
}

std::shared_ptr<snap::valdi_core::ModuleFactory> HarmonyBusinessModules::bluetoothFactory() {
    Valdi::Function<Valdi::Ref<snap::valdi_modules::bluetooth::BleHost>()> getHost = [weak = weak_from_this()] {
        return nativeCall([&] {
            auto self = owner(weak);
            self->requireOpen();
            return self->_bluetoothHost;
        });
    };
    Valdi::Value module;
    module.setMapValue("getHost", marshal(getHost));
    return std::make_shared<BluetoothFactory>(std::move(module));
}

Valdi::Value HarmonyBusinessModules::tokenStoreValue() { return _tokenStore; }
Valdi::Value HarmonyBusinessModules::permissionHostValue() { return _permissionHost; }

void HarmonyBusinessModules::requireOpen() const {
    std::lock_guard lock(_mutex);
    if (_closed) throw std::runtime_error("E_BUSINESS_HOST_CLOSED:application host is closed");
}
bool HarmonyBusinessModules::hasToken() { requireOpen(); return _tokens.has(); }
Valdi::StringBox HarmonyBusinessModules::readToken() {
    requireOpen();
    auto token = _tokens.read();
    // Wipe the temporary even if StringBox allocation throws.
    struct Wipe {
        std::string& token;
        ~Wipe() {
            volatile char* bytes = token.data();
            for (size_t i = 0; i < token.size(); ++i) bytes[i] = 0;
        }
    } wipe{token};
    return Valdi::StringBox::fromString(token);
}
void HarmonyBusinessModules::writeToken(Valdi::StringBox token) { requireOpen(); _tokens.write(token.toStringView()); }
void HarmonyBusinessModules::clearToken() { requireOpen(); _tokens.clear(); }

void HarmonyBusinessModules::setBluetoothEvents(snap::valdi_modules::bluetooth::BleHostEvents events) {
    std::optional<snap::valdi_modules::bluetooth::BleHostEvents> retired;
    {
        std::lock_guard lock(_mutex);
        if (_closed) throw std::runtime_error("E_BUSINESS_HOST_CLOSED:application host is closed");
        retired.swap(_events);
        _events.emplace(std::move(events));
    }
    // Typed unmarshalling validates and snapshots all functions before entry.
    // Retired JS functions may reenter; release them outside the state mutex.
}

void HarmonyBusinessModules::shutdown() {
    std::optional<snap::valdi_modules::bluetooth::BleHostEvents> retired;
    {
        std::lock_guard lock(_mutex);
        if (_closed) return;
        _closed = true;
        retired.swap(_events);
    }
}

bool HarmonyBusinessModules::hasBluetoothEvents() const {
    std::lock_guard lock(_mutex);
    return _events.has_value();
}

} // namespace ValdiHarmony
