//
// WifiConnectParamsModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiConnectParamsModel::WifiConnectParamsModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiConnectParamsModel::WifiConnectParamsModel(const Valdi::StringBox &SSID, const Valdi::StringBox &BSSID, const Valdi::StringBox &password, bool maunal, bool partialInfo): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _password(std::move(password)),
  _maunal(maunal),
  _partialInfo(partialInfo) {
  }

  const Valdi::StringBox &WifiConnectParamsModel::getSSID() const {
    return _SSID;
  }

  void WifiConnectParamsModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiConnectParamsModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const Valdi::StringBox &WifiConnectParamsModel::getBSSID() const {
    return _BSSID;
  }

  void WifiConnectParamsModel::setBSSID(const Valdi::StringBox &value) {
    _BSSID = value;
  }

  void WifiConnectParamsModel::setBSSID(Valdi::StringBox &&value) {
    _BSSID = std::move(value);
  }

  const Valdi::StringBox &WifiConnectParamsModel::getPassword() const {
    return _password;
  }

  void WifiConnectParamsModel::setPassword(const Valdi::StringBox &value) {
    _password = value;
  }

  void WifiConnectParamsModel::setPassword(Valdi::StringBox &&value) {
    _password = std::move(value);
  }

  bool WifiConnectParamsModel::getMaunal() const {
    return _maunal;
  }

  void WifiConnectParamsModel::setMaunal(bool value) {
    _maunal = value;
  }

  bool WifiConnectParamsModel::getPartialInfo() const {
    return _partialInfo;
  }

  void WifiConnectParamsModel::setPartialInfo(bool value) {
    _partialInfo = value;
  }

  void WifiConnectParamsModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiConnectParamsModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._password, self._maunal, self._partialInfo);
  }

  void WifiConnectParamsModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiConnectParamsModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._password, self._maunal, self._partialInfo);
  }

  Valdi::RegisteredCppGeneratedClass *WifiConnectParamsModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::wifi::WifiConnectParamsModel'{'SSID':s, 'BSSID':s, 'password':s, 'maunal':b, 'partialInfo':b}");

    return kRegisteredClass;
  }

}

//
// WifiCredentialModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiCredentialModel::WifiCredentialModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiCredentialModel::WifiCredentialModel(const Valdi::StringBox &SSID, const std::optional<Valdi::StringBox> &BSSID, const Valdi::StringBox &password): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _password(std::move(password)) {
  }

  const Valdi::StringBox &WifiCredentialModel::getSSID() const {
    return _SSID;
  }

  void WifiCredentialModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiCredentialModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const std::optional<Valdi::StringBox> &WifiCredentialModel::getBSSID() const {
    return _BSSID;
  }

  void WifiCredentialModel::setBSSID(const std::optional<Valdi::StringBox> &value) {
    _BSSID = value;
  }

  void WifiCredentialModel::setBSSID(std::optional<Valdi::StringBox> &&value) {
    _BSSID = std::move(value);
  }

  const Valdi::StringBox &WifiCredentialModel::getPassword() const {
    return _password;
  }

  void WifiCredentialModel::setPassword(const Valdi::StringBox &value) {
    _password = value;
  }

  void WifiCredentialModel::setPassword(Valdi::StringBox &&value) {
    _password = std::move(value);
  }

  void WifiCredentialModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiCredentialModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._password);
  }

  void WifiCredentialModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiCredentialModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._password);
  }

  Valdi::RegisteredCppGeneratedClass *WifiCredentialModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::wifi::WifiCredentialModel'{'SSID':s, 'BSSID':s?, 'password':s}");

    return kRegisteredClass;
  }

}

//
// WifiHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  class WifiHostProxy: public WifiHost {
    public:
    using SetEventsFn = Valdi::Function<void(WifiHostEvents)>;
    using StartWifiFn = Valdi::Function<Valdi::Future<void>()>;
    using StopWifiFn = Valdi::Function<Valdi::Future<void>()>;
    using ConnectWifiFn = Valdi::Function<Valdi::Future<WifiInfoModel>(WifiConnectParamsModel)>;
    using GetWifiListFn = Valdi::Function<Valdi::Future<void>()>;
    using GetConnectedWifiFn = Valdi::Function<Valdi::Future<WifiInfoModel>(bool)>;
    using SetWifiListFn = Valdi::Function<Valdi::Future<void>(std::vector<WifiCredentialModel>)>;
    using GetLocationPermissionStateFn = Valdi::Function<Valdi::Future<WifiPermissionStateModel>()>;
    using RequestLocationPermissionFn = Valdi::Function<Valdi::Future<WifiPermissionStateModel>()>;

    WifiHostProxy() = default;
    ~WifiHostProxy() override = default;

    void setEvents(WifiHostEvents events) final {
      _setEvents(events);
    }

    Valdi::Future<void> startWifi() final {
      return _startWifi();
    }

    Valdi::Future<void> stopWifi() final {
      return _stopWifi();
    }

    Valdi::Future<WifiInfoModel> connectWifi(WifiConnectParamsModel params) final {
      return _connectWifi(params);
    }

    Valdi::Future<void> getWifiList() final {
      return _getWifiList();
    }

    Valdi::Future<WifiInfoModel> getConnectedWifi(bool partialInfo) final {
      return _getConnectedWifi(partialInfo);
    }

    Valdi::Future<void> setWifiList(std::vector<WifiCredentialModel> wifiList) final {
      return _setWifiList(wifiList);
    }

    Valdi::Future<WifiPermissionStateModel> getLocationPermissionState() final {
      return _getLocationPermissionState();
    }

    Valdi::Future<WifiPermissionStateModel> requestLocationPermission() final {
      return _requestLocationPermission();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiHostProxy> &out) {
      out = Valdi::makeShared<WifiHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._setEvents, self._startWifi, self._stopWifi, self._connectWifi, self._getWifiList, self._getConnectedWifi, self._setWifiList, self._getLocationPermissionState, self._requestLocationPermission);
    }

    private:
    SetEventsFn _setEvents;
    StartWifiFn _startWifi;
    StopWifiFn _stopWifi;
    ConnectWifiFn _connectWifi;
    GetWifiListFn _getWifiList;
    GetConnectedWifiFn _getConnectedWifi;
    SetWifiListFn _setWifiList;
    GetLocationPermissionStateFn _getLocationPermissionState;
    RequestLocationPermissionFn _requestLocationPermission;
  };

  WifiHost::WifiHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void WifiHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<WifiHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void WifiHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<WifiHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::setEvents>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::startWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::stopWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::connectWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getWifiList>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getConnectedWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::setWifiList>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getLocationPermissionState>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::requestLocationPermission>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *WifiHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::wifi::WifiHost'{'setEvents':f|m|(r:'[0]'), 'startWifi':f|m|(): p<v>, 'stopWifi':f|m|(): p<v>, 'connectWifi':f|m|(r:'[2]'): p<r:'[1]'>, 'getWifiList':f|m|(): p<v>, 'getConnectedWifi':f|m|(b): p<r:'[1]'>, 'setWifiList':f|m|(a<r:'[3]'>): p<v>, 'getLocationPermissionState':f|m|(): p<r:'[4]'>, 'requestLocationPermission':f|m|(): p<r:'[4]'>}", []() -> Valdi::TypeReferencesVec {
      return {WifiHostEvents::getRegisteredClass(), WifiInfoModel::getRegisteredClass(), WifiConnectParamsModel::getRegisteredClass(), WifiCredentialModel::getRegisteredClass(), WifiPermissionStateModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// WifiHostEvents.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiHostEvents::WifiHostEvents(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiHostEvents::WifiHostEvents(const WifiHostEvents::WifiConnectedFn &wifiConnected, const WifiHostEvents::WifiListFn &wifiList): Valdi::CppGeneratedModel(getRegisteredClass()),
  _wifiConnected(std::move(wifiConnected)),
  _wifiList(std::move(wifiList)) {
  }

  const WifiHostEvents::WifiConnectedFn &WifiHostEvents::getWifiConnected() const {
    return _wifiConnected;
  }

  void WifiHostEvents::setWifiConnected(const WifiHostEvents::WifiConnectedFn &value) {
    _wifiConnected = value;
  }

  void WifiHostEvents::setWifiConnected(WifiHostEvents::WifiConnectedFn &&value) {
    _wifiConnected = std::move(value);
  }

  const WifiHostEvents::WifiListFn &WifiHostEvents::getWifiList() const {
    return _wifiList;
  }

  void WifiHostEvents::setWifiList(const WifiHostEvents::WifiListFn &value) {
    _wifiList = value;
  }

  void WifiHostEvents::setWifiList(WifiHostEvents::WifiListFn &&value) {
    _wifiList = std::move(value);
  }

  void WifiHostEvents::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiHostEvents &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._wifiConnected, self._wifiList);
  }

  void WifiHostEvents::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiHostEvents &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._wifiConnected, self._wifiList);
  }

  Valdi::RegisteredCppGeneratedClass *WifiHostEvents::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::wifi::WifiHostEvents'{'wifiConnected':f(r:'[0]'), 'wifiList':f(a<r:'[0]'>)}", []() -> Valdi::TypeReferencesVec {
      return {WifiInfoModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// WifiInfoModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiInfoModel::WifiInfoModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiInfoModel::WifiInfoModel(const Valdi::StringBox &SSID, const std::optional<Valdi::StringBox> &BSSID, std::optional<bool> secure, std::optional<double> signalStrength, std::optional<double> frequency): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _secure(secure),
  _signalStrength(signalStrength),
  _frequency(frequency) {
  }

  const Valdi::StringBox &WifiInfoModel::getSSID() const {
    return _SSID;
  }

  void WifiInfoModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiInfoModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const std::optional<Valdi::StringBox> &WifiInfoModel::getBSSID() const {
    return _BSSID;
  }

  void WifiInfoModel::setBSSID(const std::optional<Valdi::StringBox> &value) {
    _BSSID = value;
  }

  void WifiInfoModel::setBSSID(std::optional<Valdi::StringBox> &&value) {
    _BSSID = std::move(value);
  }

  std::optional<bool> WifiInfoModel::getSecure() const {
    return _secure;
  }

  void WifiInfoModel::setSecure(std::optional<bool> value) {
    _secure = value;
  }

  std::optional<double> WifiInfoModel::getSignalStrength() const {
    return _signalStrength;
  }

  void WifiInfoModel::setSignalStrength(std::optional<double> value) {
    _signalStrength = value;
  }

  std::optional<double> WifiInfoModel::getFrequency() const {
    return _frequency;
  }

  void WifiInfoModel::setFrequency(std::optional<double> value) {
    _frequency = value;
  }

  void WifiInfoModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiInfoModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._secure, self._signalStrength, self._frequency);
  }

  void WifiInfoModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiInfoModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._secure, self._signalStrength, self._frequency);
  }

  Valdi::RegisteredCppGeneratedClass *WifiInfoModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::wifi::WifiInfoModel'{'SSID':s, 'BSSID':s?, 'secure':b@?, 'signalStrength':d@?, 'frequency':d@?}");

    return kRegisteredClass;
  }

}

//
// WifiModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  class WifiModuleProxy: public WifiModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<WifiHost>()>;

    WifiModuleProxy() = default;
    ~WifiModuleProxy() override = default;

    Valdi::Ref<WifiHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiModuleProxy> &out) {
      out = Valdi::makeShared<WifiModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  WifiModule::WifiModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void WifiModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<WifiModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void WifiModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<WifiModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<WifiModule, &WifiModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *WifiModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::wifi::WifiModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {WifiHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// WifiModuleFactory.cpp
//

#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiModuleFactory::WifiModuleFactory() = default;
  WifiModuleFactory::~WifiModuleFactory() = default;

  Valdi::StringBox WifiModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("wifi/src/Wifi");
  }
}

//
// WifiPermissionStateModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/wifi/wifi.hpp"

namespace snap::valdi_modules::wifi {

  WifiPermissionStateModel::WifiPermissionStateModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiPermissionStateModel::WifiPermissionStateModel(const Valdi::StringBox &status, bool canAskAgain): Valdi::CppGeneratedModel(getRegisteredClass()),
  _status(std::move(status)),
  _canAskAgain(canAskAgain) {
  }

  const Valdi::StringBox &WifiPermissionStateModel::getStatus() const {
    return _status;
  }

  void WifiPermissionStateModel::setStatus(const Valdi::StringBox &value) {
    _status = value;
  }

  void WifiPermissionStateModel::setStatus(Valdi::StringBox &&value) {
    _status = std::move(value);
  }

  bool WifiPermissionStateModel::getCanAskAgain() const {
    return _canAskAgain;
  }

  void WifiPermissionStateModel::setCanAskAgain(bool value) {
    _canAskAgain = value;
  }

  void WifiPermissionStateModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiPermissionStateModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._status, self._canAskAgain);
  }

  void WifiPermissionStateModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiPermissionStateModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._status, self._canAskAgain);
  }

  Valdi::RegisteredCppGeneratedClass *WifiPermissionStateModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::wifi::WifiPermissionStateModel'{'status':s, 'canAskAgain':b}");

    return kRegisteredClass;
  }

}

