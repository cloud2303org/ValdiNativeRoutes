//
// PermissionGrant.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/permissions/permissions.hpp"

namespace snap::valdi_modules::permissions {

  PermissionGrant::PermissionGrant(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PermissionGrant::PermissionGrant(const Valdi::StringBox &permission, const Valdi::StringBox &result): Valdi::CppGeneratedModel(getRegisteredClass()),
  _permission(std::move(permission)),
  _result(std::move(result)) {
  }

  const Valdi::StringBox &PermissionGrant::getPermission() const {
    return _permission;
  }

  void PermissionGrant::setPermission(const Valdi::StringBox &value) {
    _permission = value;
  }

  void PermissionGrant::setPermission(Valdi::StringBox &&value) {
    _permission = std::move(value);
  }

  const Valdi::StringBox &PermissionGrant::getResult() const {
    return _result;
  }

  void PermissionGrant::setResult(const Valdi::StringBox &value) {
    _result = value;
  }

  void PermissionGrant::setResult(Valdi::StringBox &&value) {
    _result = std::move(value);
  }

  void PermissionGrant::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PermissionGrant &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._permission, self._result);
  }

  void PermissionGrant::marshall(Valdi::ExceptionTracker &exceptionTracker, const PermissionGrant &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._permission, self._result);
  }

  Valdi::RegisteredCppGeneratedClass *PermissionGrant::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::permissions::PermissionGrant'{'permission':s, 'result':s}");

    return kRegisteredClass;
  }

}

//
// PermissionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/permissions/permissions.hpp"

namespace snap::valdi_modules::permissions {

  class PermissionHostProxy: public PermissionHost {
    public:
    using CheckFn = Valdi::Function<Valdi::Future<bool>(Valdi::StringBox)>;
    using RequestMultipleFn = Valdi::Function<Valdi::Future<std::vector<PermissionGrant>>(std::vector<Valdi::StringBox>)>;
    using OpenSettingsFn = Valdi::Function<Valdi::Future<void>()>;

    PermissionHostProxy() = default;
    ~PermissionHostProxy() override = default;

    Valdi::Future<bool> check(Valdi::StringBox permission) final {
      return _check(permission);
    }

    Valdi::Future<std::vector<PermissionGrant>> requestMultiple(std::vector<Valdi::StringBox> permissions) final {
      return _requestMultiple(permissions);
    }

    Valdi::Future<void> openSettings() final {
      return _openSettings();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionHostProxy> &out) {
      out = Valdi::makeShared<PermissionHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._check, self._requestMultiple, self._openSettings);
    }

    private:
    CheckFn _check;
    RequestMultipleFn _requestMultiple;
    OpenSettingsFn _openSettings;
  };

  PermissionHost::PermissionHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void PermissionHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<PermissionHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void PermissionHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<PermissionHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::check>(value), Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::requestMultiple>(value), Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::openSettings>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *PermissionHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::permissions::PermissionHost'{'check':f|m|(s): p<b@>, 'requestMultiple':f|m|(a<s>): p<a<r:'[0]'>>, 'openSettings':f|m|(): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {PermissionGrant::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PermissionsModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/permissions/permissions.hpp"

namespace snap::valdi_modules::permissions {

  class PermissionsModuleProxy: public PermissionsModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<PermissionHost>()>;
    using GetAndroidSdkFn = Valdi::Function<double()>;

    PermissionsModuleProxy() = default;
    ~PermissionsModuleProxy() override = default;

    Valdi::Ref<PermissionHost> getHost() final {
      return _getHost();
    }

    double getAndroidSdk() final {
      return _getAndroidSdk();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionsModuleProxy> &out) {
      out = Valdi::makeShared<PermissionsModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost, self._getAndroidSdk);
    }

    private:
    GetHostFn _getHost;
    GetAndroidSdkFn _getAndroidSdk;
  };

  PermissionsModule::PermissionsModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void PermissionsModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionsModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<PermissionsModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void PermissionsModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<PermissionsModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<PermissionsModule, &PermissionsModule::getHost>(value), Valdi::CppMarshaller::methodToFunction<PermissionsModule, &PermissionsModule::getAndroidSdk>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *PermissionsModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::permissions::PermissionsModule'{'getHost':f|m|(): r:'[0]', 'getAndroidSdk':f|m|(): d}", []() -> Valdi::TypeReferencesVec {
      return {PermissionHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PermissionsModuleFactory.cpp
//

#include "valdi_modules/permissions/permissions.hpp"

namespace snap::valdi_modules::permissions {

  PermissionsModuleFactory::PermissionsModuleFactory() = default;
  PermissionsModuleFactory::~PermissionsModuleFactory() = default;

  Valdi::StringBox PermissionsModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("permissions/src/Permissions");
  }
}

