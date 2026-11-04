//
// MMKVModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/mmkv/mmkv.hpp"

namespace snap::valdi_modules::mmkv {

  class MMKVModuleProxy: public MMKVModule {
    public:
    using GetHostFn = Valdi::Function<StorageHost()>;

    MMKVModuleProxy() = default;
    ~MMKVModuleProxy() override = default;

    StorageHost getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<MMKVModuleProxy> &out) {
      out = Valdi::makeShared<MMKVModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  MMKVModule::MMKVModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void MMKVModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<MMKVModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<MMKVModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void MMKVModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<MMKVModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<MMKVModule, &MMKVModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *MMKVModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::mmkv::MMKVModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {StorageHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// MMKVModuleFactory.cpp
//

#include "valdi_modules/mmkv/mmkv.hpp"

namespace snap::valdi_modules::mmkv {

  MMKVModuleFactory::MMKVModuleFactory() = default;
  MMKVModuleFactory::~MMKVModuleFactory() = default;

  Valdi::StringBox MMKVModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("mmkv/src/MMKV");
  }
}

//
// StorageHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/mmkv/mmkv.hpp"

namespace snap::valdi_modules::mmkv {

  StorageHost::StorageHost(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageHost::StorageHost(const StorageHost::GetFn &get, const StorageHost::SetFn &set, const StorageHost::RemoveFn &remove, const StorageHost::ClearFn &clear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _get(std::move(get)),
  _set(std::move(set)),
  _remove(std::move(remove)),
  _clear(std::move(clear)) {
  }

  const StorageHost::GetFn &StorageHost::getGet() const {
    return _get;
  }

  void StorageHost::setGet(const StorageHost::GetFn &value) {
    _get = value;
  }

  void StorageHost::setGet(StorageHost::GetFn &&value) {
    _get = std::move(value);
  }

  const StorageHost::SetFn &StorageHost::getSet() const {
    return _set;
  }

  void StorageHost::setSet(const StorageHost::SetFn &value) {
    _set = value;
  }

  void StorageHost::setSet(StorageHost::SetFn &&value) {
    _set = std::move(value);
  }

  const StorageHost::RemoveFn &StorageHost::getRemove() const {
    return _remove;
  }

  void StorageHost::setRemove(const StorageHost::RemoveFn &value) {
    _remove = value;
  }

  void StorageHost::setRemove(StorageHost::RemoveFn &&value) {
    _remove = std::move(value);
  }

  const StorageHost::ClearFn &StorageHost::getClear() const {
    return _clear;
  }

  void StorageHost::setClear(const StorageHost::ClearFn &value) {
    _clear = value;
  }

  void StorageHost::setClear(StorageHost::ClearFn &&value) {
    _clear = std::move(value);
  }

  void StorageHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._get, self._set, self._remove, self._clear);
  }

  void StorageHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._get, self._set, self._remove, self._clear);
  }

  Valdi::RegisteredCppGeneratedClass *StorageHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::mmkv::StorageHost'{'get':f(s): r:'[0]', 'set':f(r:'[1]'): b, 'remove':f(s), 'clear':f()}", []() -> Valdi::TypeReferencesVec {
      return {StorageReadReply::getRegisteredClass(), StorageWriteRequest::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// StorageReadReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/mmkv/mmkv.hpp"

namespace snap::valdi_modules::mmkv {

  StorageReadReply::StorageReadReply(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageReadReply::StorageReadReply(bool found, const Valdi::Ref<Valdi::ValueMap> &payload, const Valdi::StringBox &error): Valdi::CppGeneratedModel(getRegisteredClass()),
  _found(found),
  _payload(std::move(payload)),
  _error(std::move(error)) {
  }

  bool StorageReadReply::getFound() const {
    return _found;
  }

  void StorageReadReply::setFound(bool value) {
    _found = value;
  }

  const Valdi::Ref<Valdi::ValueMap> &StorageReadReply::getPayload() const {
    return _payload;
  }

  void StorageReadReply::setPayload(const Valdi::Ref<Valdi::ValueMap> &value) {
    _payload = value;
  }

  void StorageReadReply::setPayload(Valdi::Ref<Valdi::ValueMap> &&value) {
    _payload = std::move(value);
  }

  const Valdi::StringBox &StorageReadReply::getError() const {
    return _error;
  }

  void StorageReadReply::setError(const Valdi::StringBox &value) {
    _error = value;
  }

  void StorageReadReply::setError(Valdi::StringBox &&value) {
    _error = std::move(value);
  }

  void StorageReadReply::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageReadReply &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._found, self._payload, self._error);
  }

  void StorageReadReply::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageReadReply &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._found, self._payload, self._error);
  }

  Valdi::RegisteredCppGeneratedClass *StorageReadReply::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::mmkv::StorageReadReply'{'found':b, 'payload':m<s,u>, 'error':s}");

    return kRegisteredClass;
  }

}

//
// StorageWriteRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/mmkv/mmkv.hpp"

namespace snap::valdi_modules::mmkv {

  StorageWriteRequest::StorageWriteRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageWriteRequest::StorageWriteRequest(const Valdi::StringBox &key, const Valdi::Ref<Valdi::ValueMap> &payload): Valdi::CppGeneratedModel(getRegisteredClass()),
  _key(std::move(key)),
  _payload(std::move(payload)) {
  }

  const Valdi::StringBox &StorageWriteRequest::getKey() const {
    return _key;
  }

  void StorageWriteRequest::setKey(const Valdi::StringBox &value) {
    _key = value;
  }

  void StorageWriteRequest::setKey(Valdi::StringBox &&value) {
    _key = std::move(value);
  }

  const Valdi::Ref<Valdi::ValueMap> &StorageWriteRequest::getPayload() const {
    return _payload;
  }

  void StorageWriteRequest::setPayload(const Valdi::Ref<Valdi::ValueMap> &value) {
    _payload = value;
  }

  void StorageWriteRequest::setPayload(Valdi::Ref<Valdi::ValueMap> &&value) {
    _payload = std::move(value);
  }

  void StorageWriteRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageWriteRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._key, self._payload);
  }

  void StorageWriteRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageWriteRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._key, self._payload);
  }

  Valdi::RegisteredCppGeneratedClass *StorageWriteRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::mmkv::StorageWriteRequest'{'key':s, 'payload':m<s,u>}");

    return kRegisteredClass;
  }

}

