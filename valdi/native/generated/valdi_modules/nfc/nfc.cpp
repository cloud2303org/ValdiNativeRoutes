//
// NfcAvailabilityModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcAvailabilityModel::NfcAvailabilityModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcAvailabilityModel::NfcAvailabilityModel(bool supported, bool enabled, bool foreground, bool permissionGranted): Valdi::CppGeneratedModel(getRegisteredClass()),
  _supported(supported),
  _enabled(enabled),
  _foreground(foreground),
  _permissionGranted(permissionGranted) {
  }

  bool NfcAvailabilityModel::getSupported() const {
    return _supported;
  }

  void NfcAvailabilityModel::setSupported(bool value) {
    _supported = value;
  }

  bool NfcAvailabilityModel::getEnabled() const {
    return _enabled;
  }

  void NfcAvailabilityModel::setEnabled(bool value) {
    _enabled = value;
  }

  bool NfcAvailabilityModel::getForeground() const {
    return _foreground;
  }

  void NfcAvailabilityModel::setForeground(bool value) {
    _foreground = value;
  }

  bool NfcAvailabilityModel::getPermissionGranted() const {
    return _permissionGranted;
  }

  void NfcAvailabilityModel::setPermissionGranted(bool value) {
    _permissionGranted = value;
  }

  void NfcAvailabilityModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcAvailabilityModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._supported, self._enabled, self._foreground, self._permissionGranted);
  }

  void NfcAvailabilityModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcAvailabilityModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._supported, self._enabled, self._foreground, self._permissionGranted);
  }

  Valdi::RegisteredCppGeneratedClass *NfcAvailabilityModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::nfc::NfcAvailabilityModel'{'supported':b, 'enabled':b, 'foreground':b, 'permissionGranted':b}");

    return kRegisteredClass;
  }

}

//
// NfcHandleModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcHandleModel::NfcHandleModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcHandleModel::NfcHandleModel(const Valdi::StringBox &tagHandle, const Valdi::StringBox &tech): Valdi::CppGeneratedModel(getRegisteredClass()),
  _tagHandle(std::move(tagHandle)),
  _tech(std::move(tech)) {
  }

  const Valdi::StringBox &NfcHandleModel::getTagHandle() const {
    return _tagHandle;
  }

  void NfcHandleModel::setTagHandle(const Valdi::StringBox &value) {
    _tagHandle = value;
  }

  void NfcHandleModel::setTagHandle(Valdi::StringBox &&value) {
    _tagHandle = std::move(value);
  }

  const Valdi::StringBox &NfcHandleModel::getTech() const {
    return _tech;
  }

  void NfcHandleModel::setTech(const Valdi::StringBox &value) {
    _tech = value;
  }

  void NfcHandleModel::setTech(Valdi::StringBox &&value) {
    _tech = std::move(value);
  }

  void NfcHandleModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcHandleModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._tagHandle, self._tech);
  }

  void NfcHandleModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcHandleModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._tagHandle, self._tech);
  }

  Valdi::RegisteredCppGeneratedClass *NfcHandleModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::nfc::NfcHandleModel'{'tagHandle':s, 'tech':s}");

    return kRegisteredClass;
  }

}

//
// NfcHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  class NfcHostProxy: public NfcHost {
    public:
    using SetEventsFn = Valdi::Function<void(NfcHostEvents)>;
    using GetAvailabilityFn = Valdi::Function<Valdi::Future<NfcAvailabilityModel>()>;
    using StartDiscoveryFn = Valdi::Function<Valdi::Future<void>()>;
    using StopDiscoveryFn = Valdi::Function<Valdi::Future<void>()>;
    using ConnectFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel)>;
    using CloseFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel)>;
    using IsConnectedFn = Valdi::Function<Valdi::Future<bool>(NfcHandleModel)>;
    using TransceiveFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel, Valdi::BytesView)>;
    using GetMaxTransceiveLengthFn = Valdi::Function<Valdi::Future<double>(NfcHandleModel)>;
    using SetTimeoutFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel, double)>;
    using GetAtqaFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel)>;
    using GetSakFn = Valdi::Function<Valdi::Future<double>(NfcHandleModel)>;
    using GetHistoricalBytesFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel)>;
    using WriteNdefMessageFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel, std::vector<NfcRecordModel>, std::vector<Valdi::StringBox>, std::vector<Valdi::StringBox>)>;

    NfcHostProxy() = default;
    ~NfcHostProxy() override = default;

    void setEvents(NfcHostEvents events) final {
      _setEvents(events);
    }

    Valdi::Future<NfcAvailabilityModel> getAvailability() final {
      return _getAvailability();
    }

    Valdi::Future<void> startDiscovery() final {
      return _startDiscovery();
    }

    Valdi::Future<void> stopDiscovery() final {
      return _stopDiscovery();
    }

    Valdi::Future<void> connect(NfcHandleModel handle) final {
      return _connect(handle);
    }

    Valdi::Future<void> close(NfcHandleModel handle) final {
      return _close(handle);
    }

    Valdi::Future<bool> isConnected(NfcHandleModel handle) final {
      return _isConnected(handle);
    }

    Valdi::Future<Valdi::BytesView> transceive(NfcHandleModel handle, Valdi::BytesView data) final {
      return _transceive(handle, data);
    }

    Valdi::Future<double> getMaxTransceiveLength(NfcHandleModel handle) final {
      return _getMaxTransceiveLength(handle);
    }

    Valdi::Future<void> setTimeout(NfcHandleModel handle, double timeout) final {
      return _setTimeout(handle, timeout);
    }

    Valdi::Future<Valdi::BytesView> getAtqa(NfcHandleModel handle) final {
      return _getAtqa(handle);
    }

    Valdi::Future<double> getSak(NfcHandleModel handle) final {
      return _getSak(handle);
    }

    Valdi::Future<Valdi::BytesView> getHistoricalBytes(NfcHandleModel handle) final {
      return _getHistoricalBytes(handle);
    }

    Valdi::Future<void> writeNdefMessage(NfcHandleModel handle, std::vector<NfcRecordModel> records, std::vector<Valdi::StringBox> uris, std::vector<Valdi::StringBox> texts) final {
      return _writeNdefMessage(handle, records, uris, texts);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcHostProxy> &out) {
      out = Valdi::makeShared<NfcHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._setEvents, self._getAvailability, self._startDiscovery, self._stopDiscovery, self._connect, self._close, self._isConnected, self._transceive, self._getMaxTransceiveLength, self._setTimeout, self._getAtqa, self._getSak, self._getHistoricalBytes, self._writeNdefMessage);
    }

    private:
    SetEventsFn _setEvents;
    GetAvailabilityFn _getAvailability;
    StartDiscoveryFn _startDiscovery;
    StopDiscoveryFn _stopDiscovery;
    ConnectFn _connect;
    CloseFn _close;
    IsConnectedFn _isConnected;
    TransceiveFn _transceive;
    GetMaxTransceiveLengthFn _getMaxTransceiveLength;
    SetTimeoutFn _setTimeout;
    GetAtqaFn _getAtqa;
    GetSakFn _getSak;
    GetHistoricalBytesFn _getHistoricalBytes;
    WriteNdefMessageFn _writeNdefMessage;
  };

  NfcHost::NfcHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void NfcHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<NfcHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void NfcHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<NfcHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::setEvents>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getAvailability>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::startDiscovery>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::stopDiscovery>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::connect>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::close>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::isConnected>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::transceive>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getMaxTransceiveLength>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::setTimeout>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getAtqa>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getSak>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getHistoricalBytes>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::writeNdefMessage>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *NfcHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::nfc::NfcHost'{'setEvents':f|m|(r:'[0]'), 'getAvailability':f|m|(): p<r:'[1]'>, 'startDiscovery':f|m|(): p<v>, 'stopDiscovery':f|m|(): p<v>, 'connect':f|m|(r:'[2]'): p<v>, 'close':f|m|(r:'[2]'): p<v>, 'isConnected':f|m|(r:'[2]'): p<b@>, 'transceive':f|m|(r:'[2]', t): p<t>, 'getMaxTransceiveLength':f|m|(r:'[2]'): p<d@>, 'setTimeout':f|m|(r:'[2]', d): p<v>, 'getAtqa':f|m|(r:'[2]'): p<t>, 'getSak':f|m|(r:'[2]'): p<d@>, 'getHistoricalBytes':f|m|(r:'[2]'): p<t>, 'writeNdefMessage':f|m|(r:'[2]', a<r:'[3]'>, a<s>, a<s>): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {NfcHostEvents::getRegisteredClass(), NfcAvailabilityModel::getRegisteredClass(), NfcHandleModel::getRegisteredClass(), NfcRecordModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// NfcHostEvents.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcHostEvents::NfcHostEvents(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcHostEvents::NfcHostEvents(const NfcHostEvents::DiscoveredFn &discovered, const NfcHostEvents::DiscoveryStateChangeFn &discoveryStateChange): Valdi::CppGeneratedModel(getRegisteredClass()),
  _discovered(std::move(discovered)),
  _discoveryStateChange(std::move(discoveryStateChange)) {
  }

  const NfcHostEvents::DiscoveredFn &NfcHostEvents::getDiscovered() const {
    return _discovered;
  }

  void NfcHostEvents::setDiscovered(const NfcHostEvents::DiscoveredFn &value) {
    _discovered = value;
  }

  void NfcHostEvents::setDiscovered(NfcHostEvents::DiscoveredFn &&value) {
    _discovered = std::move(value);
  }

  const NfcHostEvents::DiscoveryStateChangeFn &NfcHostEvents::getDiscoveryStateChange() const {
    return _discoveryStateChange;
  }

  void NfcHostEvents::setDiscoveryStateChange(const NfcHostEvents::DiscoveryStateChangeFn &value) {
    _discoveryStateChange = value;
  }

  void NfcHostEvents::setDiscoveryStateChange(NfcHostEvents::DiscoveryStateChangeFn &&value) {
    _discoveryStateChange = std::move(value);
  }

  void NfcHostEvents::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcHostEvents &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._discovered, self._discoveryStateChange);
  }

  void NfcHostEvents::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcHostEvents &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._discovered, self._discoveryStateChange);
  }

  Valdi::RegisteredCppGeneratedClass *NfcHostEvents::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::nfc::NfcHostEvents'{'discovered':f(r:'[0]'), 'discoveryStateChange':f(b)}", []() -> Valdi::TypeReferencesVec {
      return {NfcTagModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// NfcModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  class NfcModuleProxy: public NfcModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<NfcHost>()>;

    NfcModuleProxy() = default;
    ~NfcModuleProxy() override = default;

    Valdi::Ref<NfcHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcModuleProxy> &out) {
      out = Valdi::makeShared<NfcModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  NfcModule::NfcModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void NfcModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<NfcModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void NfcModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<NfcModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<NfcModule, &NfcModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *NfcModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::nfc::NfcModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {NfcHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// NfcModuleFactory.cpp
//

#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcModuleFactory::NfcModuleFactory() = default;
  NfcModuleFactory::~NfcModuleFactory() = default;

  Valdi::StringBox NfcModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("nfc/src/Nfc");
  }
}

//
// NfcRecordModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcRecordModel::NfcRecordModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcRecordModel::NfcRecordModel(const Valdi::BytesView &id, const Valdi::BytesView &type, const Valdi::BytesView &payload, double tnf): Valdi::CppGeneratedModel(getRegisteredClass()),
  _id(std::move(id)),
  _type(std::move(type)),
  _payload(std::move(payload)),
  _tnf(tnf) {
  }

  const Valdi::BytesView &NfcRecordModel::getId() const {
    return _id;
  }

  void NfcRecordModel::setId(const Valdi::BytesView &value) {
    _id = value;
  }

  void NfcRecordModel::setId(Valdi::BytesView &&value) {
    _id = std::move(value);
  }

  const Valdi::BytesView &NfcRecordModel::getType() const {
    return _type;
  }

  void NfcRecordModel::setType(const Valdi::BytesView &value) {
    _type = value;
  }

  void NfcRecordModel::setType(Valdi::BytesView &&value) {
    _type = std::move(value);
  }

  const Valdi::BytesView &NfcRecordModel::getPayload() const {
    return _payload;
  }

  void NfcRecordModel::setPayload(const Valdi::BytesView &value) {
    _payload = value;
  }

  void NfcRecordModel::setPayload(Valdi::BytesView &&value) {
    _payload = std::move(value);
  }

  double NfcRecordModel::getTnf() const {
    return _tnf;
  }

  void NfcRecordModel::setTnf(double value) {
    _tnf = value;
  }

  void NfcRecordModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcRecordModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._id, self._type, self._payload, self._tnf);
  }

  void NfcRecordModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcRecordModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._id, self._type, self._payload, self._tnf);
  }

  Valdi::RegisteredCppGeneratedClass *NfcRecordModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::nfc::NfcRecordModel'{'id':t, 'type':t, 'payload':t, 'tnf':d}");

    return kRegisteredClass;
  }

}

//
// NfcTagModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/nfc/nfc.hpp"

namespace snap::valdi_modules::nfc {

  NfcTagModel::NfcTagModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcTagModel::NfcTagModel(const Valdi::StringBox &tagHandle, const Valdi::BytesView &id, const std::vector<Valdi::StringBox> &techs, const std::vector<NfcRecordModel> &messages): Valdi::CppGeneratedModel(getRegisteredClass()),
  _tagHandle(std::move(tagHandle)),
  _id(std::move(id)),
  _techs(std::move(techs)),
  _messages(std::move(messages)) {
  }

  const Valdi::StringBox &NfcTagModel::getTagHandle() const {
    return _tagHandle;
  }

  void NfcTagModel::setTagHandle(const Valdi::StringBox &value) {
    _tagHandle = value;
  }

  void NfcTagModel::setTagHandle(Valdi::StringBox &&value) {
    _tagHandle = std::move(value);
  }

  const Valdi::BytesView &NfcTagModel::getId() const {
    return _id;
  }

  void NfcTagModel::setId(const Valdi::BytesView &value) {
    _id = value;
  }

  void NfcTagModel::setId(Valdi::BytesView &&value) {
    _id = std::move(value);
  }

  const std::vector<Valdi::StringBox> &NfcTagModel::getTechs() const {
    return _techs;
  }

  void NfcTagModel::setTechs(const std::vector<Valdi::StringBox> &value) {
    _techs = value;
  }

  void NfcTagModel::setTechs(std::vector<Valdi::StringBox> &&value) {
    _techs = std::move(value);
  }

  const std::vector<NfcRecordModel> &NfcTagModel::getMessages() const {
    return _messages;
  }

  void NfcTagModel::setMessages(const std::vector<NfcRecordModel> &value) {
    _messages = value;
  }

  void NfcTagModel::setMessages(std::vector<NfcRecordModel> &&value) {
    _messages = std::move(value);
  }

  void NfcTagModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcTagModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._tagHandle, self._id, self._techs, self._messages);
  }

  void NfcTagModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcTagModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._tagHandle, self._id, self._techs, self._messages);
  }

  Valdi::RegisteredCppGeneratedClass *NfcTagModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::nfc::NfcTagModel'{'tagHandle':s, 'id':t, 'techs':a<s>, 'messages':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {NfcRecordModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

