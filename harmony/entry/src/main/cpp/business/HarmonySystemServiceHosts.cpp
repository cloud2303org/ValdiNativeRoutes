#include "HarmonySystemServiceHosts.hpp"
#include "../platform/NapiPlatformServiceTransport.hpp"
#include "../platform/PlatformBluetoothModule.hpp"
#include "../platform/PlatformServiceAdapters.hpp"

namespace ValdiHarmony {
std::shared_ptr<HarmonySystemServiceHosts> HarmonySystemServiceHosts::create(
    napi_env env, napi_value services, Valdi::Ref<HarmonyMainThreadDispatcher> ui,
    Valdi::Ref<Valdi::DispatchQueue> js) {
    auto transport = Platform::NapiServiceTransport::create(env, services);
    auto port = Platform::ServicePort::create(transport,
        [ui = std::move(ui)](std::function<void()> work) {
            ui->dispatch(new Valdi::DispatchFunction(std::move(work)), false);
        },
        [js = std::move(js)](std::function<void()> work) {
            js->async([work = std::move(work)] { work(); });
        });
    return std::shared_ptr<HarmonySystemServiceHosts>(new HarmonySystemServiceHosts(std::move(port)));
}
Valdi::Value HarmonySystemServiceHosts::bluetoothHostValue() { return _port->interfaces().bleValue(); }
Valdi::Value HarmonySystemServiceHosts::permissionHostValue() { return _port->interfaces().permissionsValue(); }
Valdi::Value HarmonySystemServiceHosts::wifiHostValue() { return _port->interfaces().wifiValue(); }
Valdi::Value HarmonySystemServiceHosts::nfcHostValue() { return _port->interfaces().nfcValue(); }
std::shared_ptr<snap::valdi_core::ModuleFactory> HarmonySystemServiceHosts::bluetoothFactory() {
    return std::make_shared<Platform::BluetoothFactory>(_port);
}
void HarmonySystemServiceHosts::setActive(bool active) { _port->setActive(active); }
void HarmonySystemServiceHosts::closeOnUI() { _port->closeOnUI(); }
void HarmonySystemServiceHosts::shutdownOnJS() { _port->shutdownOnJS(); }
void HarmonySystemServiceHosts::releaseOnUI() { _port->releaseOnUI(); }
} // namespace ValdiHarmony
