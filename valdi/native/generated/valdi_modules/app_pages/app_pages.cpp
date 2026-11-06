//
// AndroidSplashScreenHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class AndroidSplashScreenHostProxy: public AndroidSplashScreenHost {
    public:
    using PreventAutoHideFn = Valdi::Function<bool()>;
    using HideFn = Valdi::Function<void()>;

    AndroidSplashScreenHostProxy() = default;
    ~AndroidSplashScreenHostProxy() override = default;

    bool preventAutoHide() final {
      return _preventAutoHide();
    }

    void hide() final {
      _hide();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AndroidSplashScreenHostProxy> &out) {
      out = Valdi::makeShared<AndroidSplashScreenHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._preventAutoHide, self._hide);
    }

    private:
    PreventAutoHideFn _preventAutoHide;
    HideFn _hide;
  };

  AndroidSplashScreenHost::AndroidSplashScreenHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AndroidSplashScreenHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AndroidSplashScreenHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AndroidSplashScreenHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AndroidSplashScreenHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AndroidSplashScreenHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AndroidSplashScreenHost, &AndroidSplashScreenHost::preventAutoHide>(value), Valdi::CppMarshaller::methodToFunction<AndroidSplashScreenHost, &AndroidSplashScreenHost::hide>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AndroidSplashScreenHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::AndroidSplashScreenHost'{'preventAutoHide':f|m|(): b, 'hide':f|m|()}");

    return kRegisteredClass;
  }

}

//
// AppContextHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class AppContextHostProxy: public AppContextHost {
    public:
    using GetNavigationHostFn = Valdi::Function<NavigationHost()>;
    using GetTokenStoreFn = Valdi::Function<TokenStore()>;

    AppContextHostProxy() = default;
    ~AppContextHostProxy() override = default;

    NavigationHost getNavigationHost() final {
      return _getNavigationHost();
    }

    TokenStore getTokenStore() final {
      return _getTokenStore();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextHostProxy> &out) {
      out = Valdi::makeShared<AppContextHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getNavigationHost, self._getTokenStore);
    }

    private:
    GetNavigationHostFn _getNavigationHost;
    GetTokenStoreFn _getTokenStore;
  };

  AppContextHost::AppContextHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AppContextHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AppContextHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AppContextHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AppContextHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AppContextHost, &AppContextHost::getNavigationHost>(value), Valdi::CppMarshaller::methodToFunction<AppContextHost, &AppContextHost::getTokenStore>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AppContextHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::AppContextHost'{'getNavigationHost':f|m|(): r:'[0]', 'getTokenStore':f|m|(): r:'[1]'}", []() -> Valdi::TypeReferencesVec {
      return {NavigationHost::getRegisteredClass(), TokenStore::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppContextModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class AppContextModuleProxy: public AppContextModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<AppContextHost>()>;

    AppContextModuleProxy() = default;
    ~AppContextModuleProxy() override = default;

    Valdi::Ref<AppContextHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextModuleProxy> &out) {
      out = Valdi::makeShared<AppContextModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  AppContextModule::AppContextModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AppContextModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AppContextModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AppContextModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AppContextModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AppContextModule, &AppContextModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AppContextModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::AppContextModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {AppContextHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppContextModuleFactory.cpp
//

#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  AppContextModuleFactory::AppContextModuleFactory() = default;
  AppContextModuleFactory::~AppContextModuleFactory() = default;

  Valdi::StringBox AppContextModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_pages/src/AppContext");
  }
}

//
// ColumnWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ColumnWheelConfig::ColumnWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ColumnWheelConfig::ColumnWheelConfig(const std::vector<app_ui::PickerOption> &options, const Valdi::StringBox &value): Valdi::CppGeneratedModel(getRegisteredClass()),
  _options(std::move(options)),
  _value(std::move(value)) {
  }

  const std::vector<app_ui::PickerOption> &ColumnWheelConfig::getOptions() const {
    return _options;
  }

  void ColumnWheelConfig::setOptions(const std::vector<app_ui::PickerOption> &value) {
    _options = value;
  }

  void ColumnWheelConfig::setOptions(std::vector<app_ui::PickerOption> &&value) {
    _options = std::move(value);
  }

  const Valdi::StringBox &ColumnWheelConfig::getValue() const {
    return _value;
  }

  void ColumnWheelConfig::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void ColumnWheelConfig::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  void ColumnWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ColumnWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._options, self._value);
  }

  void ColumnWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const ColumnWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._options, self._value);
  }

  Valdi::RegisteredCppGeneratedClass *ColumnWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ColumnWheelConfig'{'options':a<r:'[0]'>, 'value':s}", []() -> Valdi::TypeReferencesVec {
      return {app_ui::PickerOption::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// CppModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class CppModuleProxy: public CppModule {
    public:
    using Sha256Fn = Valdi::Function<Valdi::StringBox(Valdi::StringBox)>;
    using StatsFn = Valdi::Function<CppStats(std::vector<double>)>;

    CppModuleProxy() = default;
    ~CppModuleProxy() override = default;

    Valdi::StringBox BUILD_INFO() final {
      return _BUILD_INFO;
    }

    Valdi::StringBox sha256(Valdi::StringBox text) final {
      return _sha256(text);
    }

    CppStats stats(std::vector<double> values) final {
      return _stats(values);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<CppModuleProxy> &out) {
      out = Valdi::makeShared<CppModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._BUILD_INFO, self._sha256, self._stats);
    }

    private:
    Valdi::StringBox _BUILD_INFO;
    Sha256Fn _sha256;
    StatsFn _stats;
  };

  CppModule::CppModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void CppModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<CppModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<CppModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void CppModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<CppModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, value->BUILD_INFO(), Valdi::CppMarshaller::methodToFunction<CppModule, &CppModule::sha256>(value), Valdi::CppMarshaller::methodToFunction<CppModule, &CppModule::stats>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *CppModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::CppModule'{'BUILD_INFO':s, 'sha256':f|m|(s): s, 'stats':f|m|(a<d@>): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {CppStats::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// CppModuleFactory.cpp
//

#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  CppModuleFactory::CppModuleFactory() = default;
  CppModuleFactory::~CppModuleFactory() = default;

  Valdi::StringBox CppModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_pages/src/cpp/Cpp");
  }
}

//
// CppStats.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  CppStats::CppStats(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  CppStats::CppStats(double count, double mean, double min, double max): Valdi::CppGeneratedModel(getRegisteredClass()),
  _count(count),
  _mean(mean),
  _min(min),
  _max(max) {
  }

  double CppStats::getCount() const {
    return _count;
  }

  void CppStats::setCount(double value) {
    _count = value;
  }

  double CppStats::getMean() const {
    return _mean;
  }

  void CppStats::setMean(double value) {
    _mean = value;
  }

  double CppStats::getMin() const {
    return _min;
  }

  void CppStats::setMin(double value) {
    _min = value;
  }

  double CppStats::getMax() const {
    return _max;
  }

  void CppStats::setMax(double value) {
    _max = value;
  }

  void CppStats::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, CppStats &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._count, self._mean, self._min, self._max);
  }

  void CppStats::marshall(Valdi::ExceptionTracker &exceptionTracker, const CppStats &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._count, self._mean, self._min, self._max);
  }

  Valdi::RegisteredCppGeneratedClass *CppStats::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::CppStats'{'count':d, 'mean':d, 'min':d, 'max':d}");

    return kRegisteredClass;
  }

}

//
// NavigationHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NavigationHost::NavigationHost(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NavigationHost::NavigationHost(const NavigationHost::PushFn &push, const NavigationHost::PushForResultFn &pushForResult, const NavigationHost::ReplaceFn &replace, const NavigationHost::BackFn &back, const NavigationHost::PopToRootFn &popToRoot, const NavigationHost::ResetFn &reset, const NavigationHost::SwitchTabFn &switchTab, const NavigationHost::SetStatusBarStyleFn &setStatusBarStyle, const NavigationHost::CurrentPagesFn &currentPages, const NavigationHost::UpdateRoutesFn &updateRoutes): Valdi::CppGeneratedModel(getRegisteredClass()),
  _push(std::move(push)),
  _pushForResult(std::move(pushForResult)),
  _replace(std::move(replace)),
  _back(std::move(back)),
  _popToRoot(std::move(popToRoot)),
  _reset(std::move(reset)),
  _switchTab(std::move(switchTab)),
  _setStatusBarStyle(std::move(setStatusBarStyle)),
  _currentPages(std::move(currentPages)),
  _updateRoutes(std::move(updateRoutes)) {
  }

  const NavigationHost::PushFn &NavigationHost::getPush() const {
    return _push;
  }

  void NavigationHost::setPush(const NavigationHost::PushFn &value) {
    _push = value;
  }

  void NavigationHost::setPush(NavigationHost::PushFn &&value) {
    _push = std::move(value);
  }

  const NavigationHost::PushForResultFn &NavigationHost::getPushForResult() const {
    return _pushForResult;
  }

  void NavigationHost::setPushForResult(const NavigationHost::PushForResultFn &value) {
    _pushForResult = value;
  }

  void NavigationHost::setPushForResult(NavigationHost::PushForResultFn &&value) {
    _pushForResult = std::move(value);
  }

  const NavigationHost::ReplaceFn &NavigationHost::getReplace() const {
    return _replace;
  }

  void NavigationHost::setReplace(const NavigationHost::ReplaceFn &value) {
    _replace = value;
  }

  void NavigationHost::setReplace(NavigationHost::ReplaceFn &&value) {
    _replace = std::move(value);
  }

  const NavigationHost::BackFn &NavigationHost::getBack() const {
    return _back;
  }

  void NavigationHost::setBack(const NavigationHost::BackFn &value) {
    _back = value;
  }

  void NavigationHost::setBack(NavigationHost::BackFn &&value) {
    _back = std::move(value);
  }

  const NavigationHost::PopToRootFn &NavigationHost::getPopToRoot() const {
    return _popToRoot;
  }

  void NavigationHost::setPopToRoot(const NavigationHost::PopToRootFn &value) {
    _popToRoot = value;
  }

  void NavigationHost::setPopToRoot(NavigationHost::PopToRootFn &&value) {
    _popToRoot = std::move(value);
  }

  const NavigationHost::ResetFn &NavigationHost::getReset() const {
    return _reset;
  }

  void NavigationHost::setReset(const NavigationHost::ResetFn &value) {
    _reset = value;
  }

  void NavigationHost::setReset(NavigationHost::ResetFn &&value) {
    _reset = std::move(value);
  }

  const NavigationHost::SwitchTabFn &NavigationHost::getSwitchTab() const {
    return _switchTab;
  }

  void NavigationHost::setSwitchTab(const NavigationHost::SwitchTabFn &value) {
    _switchTab = value;
  }

  void NavigationHost::setSwitchTab(NavigationHost::SwitchTabFn &&value) {
    _switchTab = std::move(value);
  }

  const NavigationHost::SetStatusBarStyleFn &NavigationHost::getSetStatusBarStyle() const {
    return _setStatusBarStyle;
  }

  void NavigationHost::setSetStatusBarStyle(const NavigationHost::SetStatusBarStyleFn &value) {
    _setStatusBarStyle = value;
  }

  void NavigationHost::setSetStatusBarStyle(NavigationHost::SetStatusBarStyleFn &&value) {
    _setStatusBarStyle = std::move(value);
  }

  const NavigationHost::CurrentPagesFn &NavigationHost::getCurrentPages() const {
    return _currentPages;
  }

  void NavigationHost::setCurrentPages(const NavigationHost::CurrentPagesFn &value) {
    _currentPages = value;
  }

  void NavigationHost::setCurrentPages(NavigationHost::CurrentPagesFn &&value) {
    _currentPages = std::move(value);
  }

  const NavigationHost::UpdateRoutesFn &NavigationHost::getUpdateRoutes() const {
    return _updateRoutes;
  }

  void NavigationHost::setUpdateRoutes(const NavigationHost::UpdateRoutesFn &value) {
    _updateRoutes = value;
  }

  void NavigationHost::setUpdateRoutes(NavigationHost::UpdateRoutesFn &&value) {
    _updateRoutes = std::move(value);
  }

  void NavigationHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NavigationHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages, self._updateRoutes);
  }

  void NavigationHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const NavigationHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages, self._updateRoutes);
  }

  Valdi::RegisteredCppGeneratedClass *NavigationHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NavigationHost'{'push':f(s, m<s,u>, r:'[0]'), 'pushForResult':f(s, m<s,u>, r:'[0]', f(m<s,u>, b)), 'replace':f(s, m<s,u>, r:'[0]'), 'back':f(d), 'popToRoot':f(), 'reset':f(s, m<s,u>), 'switchTab':f(s), 'setStatusBarStyle':f(s), 'currentPages':f(f(a<r:'[1]'>)), 'updateRoutes':f(r:'[2]')}", []() -> Valdi::TypeReferencesVec {
      return {ResolvedNavigation::getRegisteredClass(), StackPage::getRegisteredClass(), RouteDeclaration::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PageContext.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageContext::PageContext(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageContext::PageContext(const PageContext::FinishFn &finish, const PageContext::BackFn &back): Valdi::CppGeneratedModel(getRegisteredClass()),
  _finish(std::move(finish)),
  _back(std::move(back)) {
  }

  const PageContext::FinishFn &PageContext::getFinish() const {
    return _finish;
  }

  void PageContext::setFinish(const PageContext::FinishFn &value) {
    _finish = value;
  }

  void PageContext::setFinish(PageContext::FinishFn &&value) {
    _finish = std::move(value);
  }

  const PageContext::BackFn &PageContext::getBack() const {
    return _back;
  }

  void PageContext::setBack(const PageContext::BackFn &value) {
    _back = value;
  }

  void PageContext::setBack(PageContext::BackFn &&value) {
    _back = std::move(value);
  }

  void PageContext::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageContext &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._finish, self._back);
  }

  void PageContext::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageContext &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._finish, self._back);
  }

  Valdi::RegisteredCppGeneratedClass *PageContext::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageContext'{'finish':f(m<s,u>), 'back':f()}");

    return kRegisteredClass;
  }

}

//
// PageInsets.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageInsets::PageInsets(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageInsets::PageInsets(double top, double bottom, double left, double right): Valdi::CppGeneratedModel(getRegisteredClass()),
  _top(top),
  _bottom(bottom),
  _left(left),
  _right(right) {
  }

  double PageInsets::getTop() const {
    return _top;
  }

  void PageInsets::setTop(double value) {
    _top = value;
  }

  double PageInsets::getBottom() const {
    return _bottom;
  }

  void PageInsets::setBottom(double value) {
    _bottom = value;
  }

  double PageInsets::getLeft() const {
    return _left;
  }

  void PageInsets::setLeft(double value) {
    _left = value;
  }

  double PageInsets::getRight() const {
    return _right;
  }

  void PageInsets::setRight(double value) {
    _right = value;
  }

  void PageInsets::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageInsets &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._top, self._bottom, self._left, self._right);
  }

  void PageInsets::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageInsets &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._top, self._bottom, self._left, self._right);
  }

  Valdi::RegisteredCppGeneratedClass *PageInsets::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageInsets'{'top':d, 'bottom':d, 'left':d, 'right':d}");

    return kRegisteredClass;
  }

}

//
// PageViewModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageViewModel::PageViewModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageViewModel::PageViewModel(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::Ref<Valdi::ValueMap> &params, const Valdi::StringBox &presentation, const PageInsets &insets, bool visible, const Valdi::StringBox &visibilityReason): Valdi::CppGeneratedModel(getRegisteredClass()),
  _pageId(std::move(pageId)),
  _route(std::move(route)),
  _params(std::move(params)),
  _presentation(std::move(presentation)),
  _insets(std::move(insets)),
  _visible(visible),
  _visibilityReason(std::move(visibilityReason)) {
  }

  const Valdi::StringBox &PageViewModel::getPageId() const {
    return _pageId;
  }

  void PageViewModel::setPageId(const Valdi::StringBox &value) {
    _pageId = value;
  }

  void PageViewModel::setPageId(Valdi::StringBox &&value) {
    _pageId = std::move(value);
  }

  const Valdi::StringBox &PageViewModel::getRoute() const {
    return _route;
  }

  void PageViewModel::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void PageViewModel::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::Ref<Valdi::ValueMap> &PageViewModel::getParams() const {
    return _params;
  }

  void PageViewModel::setParams(const Valdi::Ref<Valdi::ValueMap> &value) {
    _params = value;
  }

  void PageViewModel::setParams(Valdi::Ref<Valdi::ValueMap> &&value) {
    _params = std::move(value);
  }

  const Valdi::StringBox &PageViewModel::getPresentation() const {
    return _presentation;
  }

  void PageViewModel::setPresentation(const Valdi::StringBox &value) {
    _presentation = value;
  }

  void PageViewModel::setPresentation(Valdi::StringBox &&value) {
    _presentation = std::move(value);
  }

  const PageInsets &PageViewModel::getInsets() const {
    return _insets;
  }

  void PageViewModel::setInsets(const PageInsets &value) {
    _insets = value;
  }

  void PageViewModel::setInsets(PageInsets &&value) {
    _insets = std::move(value);
  }

  bool PageViewModel::getVisible() const {
    return _visible;
  }

  void PageViewModel::setVisible(bool value) {
    _visible = value;
  }

  const Valdi::StringBox &PageViewModel::getVisibilityReason() const {
    return _visibilityReason;
  }

  void PageViewModel::setVisibilityReason(const Valdi::StringBox &value) {
    _visibilityReason = value;
  }

  void PageViewModel::setVisibilityReason(Valdi::StringBox &&value) {
    _visibilityReason = std::move(value);
  }

  void PageViewModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageViewModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._pageId, self._route, self._params, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  void PageViewModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageViewModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._pageId, self._route, self._params, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  Valdi::RegisteredCppGeneratedClass *PageViewModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageViewModel'{'pageId':s, 'route':s, 'params':m<s,u>, 'presentation':s, 'insets':r:'[0]', 'visible':b, 'visibilityReason':s}", []() -> Valdi::TypeReferencesVec {
      return {PageInsets::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// RequestInitialContentDraw.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& RequestInitialContentDraw::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'RequestInitialContentDraw'{'requestInitialContentDraw':f(s, f()): b}");
    return *kSchema;
  }

  Valdi::Result<RequestInitialContentDraw> RequestInitialContentDraw::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<RequestInitialContentDraw>(jsRuntime, nativeObjectsManager, "app_pages/src/splash/InitialContentDraw", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> RequestInitialContentDraw::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/splash/InitialContentDraw", registeredSchema());
  }
}

//
// ResolvedNavigation.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ResolvedNavigation::ResolvedNavigation(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ResolvedNavigation::ResolvedNavigation(const Valdi::StringBox &animation, double durationMs, const Valdi::StringBox &presentation): Valdi::CppGeneratedModel(getRegisteredClass()),
  _animation(std::move(animation)),
  _durationMs(durationMs),
  _presentation(std::move(presentation)) {
  }

  const Valdi::StringBox &ResolvedNavigation::getAnimation() const {
    return _animation;
  }

  void ResolvedNavigation::setAnimation(const Valdi::StringBox &value) {
    _animation = value;
  }

  void ResolvedNavigation::setAnimation(Valdi::StringBox &&value) {
    _animation = std::move(value);
  }

  double ResolvedNavigation::getDurationMs() const {
    return _durationMs;
  }

  void ResolvedNavigation::setDurationMs(double value) {
    _durationMs = value;
  }

  const Valdi::StringBox &ResolvedNavigation::getPresentation() const {
    return _presentation;
  }

  void ResolvedNavigation::setPresentation(const Valdi::StringBox &value) {
    _presentation = value;
  }

  void ResolvedNavigation::setPresentation(Valdi::StringBox &&value) {
    _presentation = std::move(value);
  }

  void ResolvedNavigation::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ResolvedNavigation &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._animation, self._durationMs, self._presentation);
  }

  void ResolvedNavigation::marshall(Valdi::ExceptionTracker &exceptionTracker, const ResolvedNavigation &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._animation, self._durationMs, self._presentation);
  }

  Valdi::RegisteredCppGeneratedClass *ResolvedNavigation::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ResolvedNavigation'{'animation':s, 'durationMs':d, 'presentation':s}");

    return kRegisteredClass;
  }

}

//
// RouteDeclaration.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteDeclaration::RouteDeclaration(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteDeclaration::RouteDeclaration(const std::vector<RouteEntry> &routes, const Valdi::Ref<RouteTabBar> &tabBar, const Valdi::StringBox &root): Valdi::CppGeneratedModel(getRegisteredClass()),
  _routes(std::move(routes)),
  _tabBar(std::move(tabBar)),
  _root(std::move(root)) {
  }

  const std::vector<RouteEntry> &RouteDeclaration::getRoutes() const {
    return _routes;
  }

  void RouteDeclaration::setRoutes(const std::vector<RouteEntry> &value) {
    _routes = value;
  }

  void RouteDeclaration::setRoutes(std::vector<RouteEntry> &&value) {
    _routes = std::move(value);
  }

  const Valdi::Ref<RouteTabBar> &RouteDeclaration::getTabBar() const {
    return _tabBar;
  }

  void RouteDeclaration::setTabBar(const Valdi::Ref<RouteTabBar> &value) {
    _tabBar = value;
  }

  void RouteDeclaration::setTabBar(Valdi::Ref<RouteTabBar> &&value) {
    _tabBar = std::move(value);
  }

  const Valdi::StringBox &RouteDeclaration::getRoot() const {
    return _root;
  }

  void RouteDeclaration::setRoot(const Valdi::StringBox &value) {
    _root = value;
  }

  void RouteDeclaration::setRoot(Valdi::StringBox &&value) {
    _root = std::move(value);
  }

  void RouteDeclaration::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteDeclaration &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._routes, self._tabBar, self._root);
  }

  void RouteDeclaration::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteDeclaration &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._routes, self._tabBar, self._root);
  }

  Valdi::RegisteredCppGeneratedClass *RouteDeclaration::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteDeclaration'{'routes':a<r:'[0]'>, 'tabBar':r?:'[1]', 'root':s}", []() -> Valdi::TypeReferencesVec {
      return {RouteEntry::getRegisteredClass(), RouteTabBar::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// RouteEntry.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteEntry::RouteEntry(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteEntry::RouteEntry(const Valdi::StringBox &route, const Valdi::StringBox &kind, const Valdi::StringBox &title, const std::optional<Valdi::StringBox> &component, const std::optional<Valdi::StringBox> &nativeName): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _kind(std::move(kind)),
  _title(std::move(title)),
  _component(std::move(component)),
  _nativeName(std::move(nativeName)) {
  }

  const Valdi::StringBox &RouteEntry::getRoute() const {
    return _route;
  }

  void RouteEntry::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteEntry::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteEntry::getKind() const {
    return _kind;
  }

  void RouteEntry::setKind(const Valdi::StringBox &value) {
    _kind = value;
  }

  void RouteEntry::setKind(Valdi::StringBox &&value) {
    _kind = std::move(value);
  }

  const Valdi::StringBox &RouteEntry::getTitle() const {
    return _title;
  }

  void RouteEntry::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void RouteEntry::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteEntry::getComponent() const {
    return _component;
  }

  void RouteEntry::setComponent(const std::optional<Valdi::StringBox> &value) {
    _component = value;
  }

  void RouteEntry::setComponent(std::optional<Valdi::StringBox> &&value) {
    _component = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteEntry::getNativeName() const {
    return _nativeName;
  }

  void RouteEntry::setNativeName(const std::optional<Valdi::StringBox> &value) {
    _nativeName = value;
  }

  void RouteEntry::setNativeName(std::optional<Valdi::StringBox> &&value) {
    _nativeName = std::move(value);
  }

  void RouteEntry::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteEntry &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._kind, self._title, self._component, self._nativeName);
  }

  void RouteEntry::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteEntry &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._kind, self._title, self._component, self._nativeName);
  }

  Valdi::RegisteredCppGeneratedClass *RouteEntry::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteEntry'{'route':s, 'kind':s, 'title':s, 'component':s?, 'nativeName':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTab.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteTab::RouteTab(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteTab::RouteTab(const Valdi::StringBox &route, const Valdi::StringBox &text, const Valdi::StringBox &icon, const Valdi::StringBox &selectedIcon, const std::optional<Valdi::StringBox> &iconData, const std::optional<Valdi::StringBox> &selectedIconData): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _text(std::move(text)),
  _icon(std::move(icon)),
  _selectedIcon(std::move(selectedIcon)),
  _iconData(std::move(iconData)),
  _selectedIconData(std::move(selectedIconData)) {
  }

  const Valdi::StringBox &RouteTab::getRoute() const {
    return _route;
  }

  void RouteTab::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteTab::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getText() const {
    return _text;
  }

  void RouteTab::setText(const Valdi::StringBox &value) {
    _text = value;
  }

  void RouteTab::setText(Valdi::StringBox &&value) {
    _text = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getIcon() const {
    return _icon;
  }

  void RouteTab::setIcon(const Valdi::StringBox &value) {
    _icon = value;
  }

  void RouteTab::setIcon(Valdi::StringBox &&value) {
    _icon = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getSelectedIcon() const {
    return _selectedIcon;
  }

  void RouteTab::setSelectedIcon(const Valdi::StringBox &value) {
    _selectedIcon = value;
  }

  void RouteTab::setSelectedIcon(Valdi::StringBox &&value) {
    _selectedIcon = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTab::getIconData() const {
    return _iconData;
  }

  void RouteTab::setIconData(const std::optional<Valdi::StringBox> &value) {
    _iconData = value;
  }

  void RouteTab::setIconData(std::optional<Valdi::StringBox> &&value) {
    _iconData = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTab::getSelectedIconData() const {
    return _selectedIconData;
  }

  void RouteTab::setSelectedIconData(const std::optional<Valdi::StringBox> &value) {
    _selectedIconData = value;
  }

  void RouteTab::setSelectedIconData(std::optional<Valdi::StringBox> &&value) {
    _selectedIconData = std::move(value);
  }

  void RouteTab::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteTab &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._text, self._icon, self._selectedIcon, self._iconData, self._selectedIconData);
  }

  void RouteTab::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteTab &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._text, self._icon, self._selectedIcon, self._iconData, self._selectedIconData);
  }

  Valdi::RegisteredCppGeneratedClass *RouteTab::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteTab'{'route':s, 'text':s, 'icon':s, 'selectedIcon':s, 'iconData':s?, 'selectedIconData':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTabBar.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteTabBar::RouteTabBar(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteTabBar::RouteTabBar(const Valdi::StringBox &route, const Valdi::StringBox &initial, const std::vector<RouteTab> &tabs, const std::optional<Valdi::StringBox> &mode, const std::optional<Valdi::StringBox> &component): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _initial(std::move(initial)),
  _tabs(std::move(tabs)),
  _mode(std::move(mode)),
  _component(std::move(component)) {
  }

  const Valdi::StringBox &RouteTabBar::getRoute() const {
    return _route;
  }

  void RouteTabBar::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteTabBar::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteTabBar::getInitial() const {
    return _initial;
  }

  void RouteTabBar::setInitial(const Valdi::StringBox &value) {
    _initial = value;
  }

  void RouteTabBar::setInitial(Valdi::StringBox &&value) {
    _initial = std::move(value);
  }

  const std::vector<RouteTab> &RouteTabBar::getTabs() const {
    return _tabs;
  }

  void RouteTabBar::setTabs(const std::vector<RouteTab> &value) {
    _tabs = value;
  }

  void RouteTabBar::setTabs(std::vector<RouteTab> &&value) {
    _tabs = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTabBar::getMode() const {
    return _mode;
  }

  void RouteTabBar::setMode(const std::optional<Valdi::StringBox> &value) {
    _mode = value;
  }

  void RouteTabBar::setMode(std::optional<Valdi::StringBox> &&value) {
    _mode = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTabBar::getComponent() const {
    return _component;
  }

  void RouteTabBar::setComponent(const std::optional<Valdi::StringBox> &value) {
    _component = value;
  }

  void RouteTabBar::setComponent(std::optional<Valdi::StringBox> &&value) {
    _component = std::move(value);
  }

  void RouteTabBar::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteTabBar &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._initial, self._tabs, self._mode, self._component);
  }

  void RouteTabBar::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteTabBar &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._initial, self._tabs, self._mode, self._component);
  }

  Valdi::RegisteredCppGeneratedClass *RouteTabBar::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteTabBar'{'route':s, 'initial':s, 'tabs':a<r:'[0]'>, 'mode':s?, 'component':s?}", []() -> Valdi::TypeReferencesVec {
      return {RouteTab::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// SplashScreenNativeModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class SplashScreenNativeModuleProxy: public SplashScreenNativeModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<AndroidSplashScreenHost>()>;

    SplashScreenNativeModuleProxy() = default;
    ~SplashScreenNativeModuleProxy() override = default;

    Valdi::Ref<AndroidSplashScreenHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<SplashScreenNativeModuleProxy> &out) {
      out = Valdi::makeShared<SplashScreenNativeModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  SplashScreenNativeModule::SplashScreenNativeModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void SplashScreenNativeModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<SplashScreenNativeModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<SplashScreenNativeModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void SplashScreenNativeModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<SplashScreenNativeModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<SplashScreenNativeModule, &SplashScreenNativeModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *SplashScreenNativeModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::SplashScreenNativeModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {AndroidSplashScreenHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// SplashScreenNativeModuleFactory.cpp
//

#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  SplashScreenNativeModuleFactory::SplashScreenNativeModuleFactory() = default;
  SplashScreenNativeModuleFactory::~SplashScreenNativeModuleFactory() = default;

  Valdi::StringBox SplashScreenNativeModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_pages/src/splash/SplashScreenNative");
  }
}

//
// StackPage.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  StackPage::StackPage(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StackPage::StackPage(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::Ref<Valdi::ValueMap> &params): Valdi::CppGeneratedModel(getRegisteredClass()),
  _pageId(std::move(pageId)),
  _route(std::move(route)),
  _params(std::move(params)) {
  }

  const Valdi::StringBox &StackPage::getPageId() const {
    return _pageId;
  }

  void StackPage::setPageId(const Valdi::StringBox &value) {
    _pageId = value;
  }

  void StackPage::setPageId(Valdi::StringBox &&value) {
    _pageId = std::move(value);
  }

  const Valdi::StringBox &StackPage::getRoute() const {
    return _route;
  }

  void StackPage::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void StackPage::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::Ref<Valdi::ValueMap> &StackPage::getParams() const {
    return _params;
  }

  void StackPage::setParams(const Valdi::Ref<Valdi::ValueMap> &value) {
    _params = value;
  }

  void StackPage::setParams(Valdi::Ref<Valdi::ValueMap> &&value) {
    _params = std::move(value);
  }

  void StackPage::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StackPage &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._pageId, self._route, self._params);
  }

  void StackPage::marshall(Valdi::ExceptionTracker &exceptionTracker, const StackPage &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._pageId, self._route, self._params);
  }

  Valdi::RegisteredCppGeneratedClass *StackPage::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StackPage'{'pageId':s, 'route':s, 'params':m<s,u>}");

    return kRegisteredClass;
  }

}

//
// StartApp.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& StartApp::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'StartApp'{'startApp':f(b): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {RouteDeclaration::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<StartApp> StartApp::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<StartApp>(jsRuntime, nativeObjectsManager, "app_pages/src/app", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> StartApp::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/app", registeredSchema());
  }
}

//
// TabBarContext.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TabBarContext::TabBarContext(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TabBarContext::TabBarContext(const TabBarContext::SelectTabFn &selectTab): Valdi::CppGeneratedModel(getRegisteredClass()),
  _selectTab(std::move(selectTab)) {
  }

  const TabBarContext::SelectTabFn &TabBarContext::getSelectTab() const {
    return _selectTab;
  }

  void TabBarContext::setSelectTab(const TabBarContext::SelectTabFn &value) {
    _selectTab = value;
  }

  void TabBarContext::setSelectTab(TabBarContext::SelectTabFn &&value) {
    _selectTab = std::move(value);
  }

  void TabBarContext::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TabBarContext &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._selectTab);
  }

  void TabBarContext::marshall(Valdi::ExceptionTracker &exceptionTracker, const TabBarContext &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._selectTab);
  }

  Valdi::RegisteredCppGeneratedClass *TabBarContext::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TabBarContext'{'selectTab':f(s)}");

    return kRegisteredClass;
  }

}

//
// TabBarViewModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TabBarViewModel::TabBarViewModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TabBarViewModel::TabBarViewModel(const std::vector<RouteTab> &items, const Valdi::StringBox &selectedRoute, double safeAreaBottom): Valdi::CppGeneratedModel(getRegisteredClass()),
  _items(std::move(items)),
  _selectedRoute(std::move(selectedRoute)),
  _safeAreaBottom(safeAreaBottom) {
  }

  const std::vector<RouteTab> &TabBarViewModel::getItems() const {
    return _items;
  }

  void TabBarViewModel::setItems(const std::vector<RouteTab> &value) {
    _items = value;
  }

  void TabBarViewModel::setItems(std::vector<RouteTab> &&value) {
    _items = std::move(value);
  }

  const Valdi::StringBox &TabBarViewModel::getSelectedRoute() const {
    return _selectedRoute;
  }

  void TabBarViewModel::setSelectedRoute(const Valdi::StringBox &value) {
    _selectedRoute = value;
  }

  void TabBarViewModel::setSelectedRoute(Valdi::StringBox &&value) {
    _selectedRoute = std::move(value);
  }

  double TabBarViewModel::getSafeAreaBottom() const {
    return _safeAreaBottom;
  }

  void TabBarViewModel::setSafeAreaBottom(double value) {
    _safeAreaBottom = value;
  }

  void TabBarViewModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TabBarViewModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._items, self._selectedRoute, self._safeAreaBottom);
  }

  void TabBarViewModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const TabBarViewModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._items, self._selectedRoute, self._safeAreaBottom);
  }

  Valdi::RegisteredCppGeneratedClass *TabBarViewModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TabBarViewModel'{'items':a<r:'[0]'>, 'selectedRoute':s, 'safeAreaBottom':d}", []() -> Valdi::TypeReferencesVec {
      return {RouteTab::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// TimeWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TimeWheelConfig::TimeWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TimeWheelConfig::TimeWheelConfig(const Valdi::StringBox &mode, const Valdi::StringBox &value, double minYear, double maxYear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _mode(std::move(mode)),
  _value(std::move(value)),
  _minYear(minYear),
  _maxYear(maxYear) {
  }

  const Valdi::StringBox &TimeWheelConfig::getMode() const {
    return _mode;
  }

  void TimeWheelConfig::setMode(const Valdi::StringBox &value) {
    _mode = value;
  }

  void TimeWheelConfig::setMode(Valdi::StringBox &&value) {
    _mode = std::move(value);
  }

  const Valdi::StringBox &TimeWheelConfig::getValue() const {
    return _value;
  }

  void TimeWheelConfig::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void TimeWheelConfig::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  double TimeWheelConfig::getMinYear() const {
    return _minYear;
  }

  void TimeWheelConfig::setMinYear(double value) {
    _minYear = value;
  }

  double TimeWheelConfig::getMaxYear() const {
    return _maxYear;
  }

  void TimeWheelConfig::setMaxYear(double value) {
    _maxYear = value;
  }

  void TimeWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TimeWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._mode, self._value, self._minYear, self._maxYear);
  }

  void TimeWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const TimeWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._mode, self._value, self._minYear, self._maxYear);
  }

  Valdi::RegisteredCppGeneratedClass *TimeWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TimeWheelConfig'{'mode':s, 'value':s, 'minYear':d, 'maxYear':d}");

    return kRegisteredClass;
  }

}

//
// TokenStore.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TokenStore::TokenStore(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TokenStore::TokenStore(const TokenStore::HasFn &has, const TokenStore::ReadFn &read, const TokenStore::WriteFn &write, const TokenStore::ClearFn &clear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _has(std::move(has)),
  _read(std::move(read)),
  _write(std::move(write)),
  _clear(std::move(clear)) {
  }

  const TokenStore::HasFn &TokenStore::getHas() const {
    return _has;
  }

  void TokenStore::setHas(const TokenStore::HasFn &value) {
    _has = value;
  }

  void TokenStore::setHas(TokenStore::HasFn &&value) {
    _has = std::move(value);
  }

  const TokenStore::ReadFn &TokenStore::getRead() const {
    return _read;
  }

  void TokenStore::setRead(const TokenStore::ReadFn &value) {
    _read = value;
  }

  void TokenStore::setRead(TokenStore::ReadFn &&value) {
    _read = std::move(value);
  }

  const TokenStore::WriteFn &TokenStore::getWrite() const {
    return _write;
  }

  void TokenStore::setWrite(const TokenStore::WriteFn &value) {
    _write = value;
  }

  void TokenStore::setWrite(TokenStore::WriteFn &&value) {
    _write = std::move(value);
  }

  const TokenStore::ClearFn &TokenStore::getClear() const {
    return _clear;
  }

  void TokenStore::setClear(const TokenStore::ClearFn &value) {
    _clear = value;
  }

  void TokenStore::setClear(TokenStore::ClearFn &&value) {
    _clear = std::move(value);
  }

  void TokenStore::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TokenStore &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._has, self._read, self._write, self._clear);
  }

  void TokenStore::marshall(Valdi::ExceptionTracker &exceptionTracker, const TokenStore &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._has, self._read, self._write, self._clear);
  }

  Valdi::RegisteredCppGeneratedClass *TokenStore::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TokenStore'{'has':f(): b, 'read':f(): s, 'write':f(s), 'clear':f()}");

    return kRegisteredClass;
  }

}

//
// TreeWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TreeWheelConfig::TreeWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TreeWheelConfig::TreeWheelConfig(const std::vector<WheelTreeNode> &data, const std::vector<Valdi::StringBox> &value, double columns): Valdi::CppGeneratedModel(getRegisteredClass()),
  _data(std::move(data)),
  _value(std::move(value)),
  _columns(columns) {
  }

  const std::vector<WheelTreeNode> &TreeWheelConfig::getData() const {
    return _data;
  }

  void TreeWheelConfig::setData(const std::vector<WheelTreeNode> &value) {
    _data = value;
  }

  void TreeWheelConfig::setData(std::vector<WheelTreeNode> &&value) {
    _data = std::move(value);
  }

  const std::vector<Valdi::StringBox> &TreeWheelConfig::getValue() const {
    return _value;
  }

  void TreeWheelConfig::setValue(const std::vector<Valdi::StringBox> &value) {
    _value = value;
  }

  void TreeWheelConfig::setValue(std::vector<Valdi::StringBox> &&value) {
    _value = std::move(value);
  }

  double TreeWheelConfig::getColumns() const {
    return _columns;
  }

  void TreeWheelConfig::setColumns(double value) {
    _columns = value;
  }

  void TreeWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TreeWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._data, self._value, self._columns);
  }

  void TreeWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const TreeWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._data, self._value, self._columns);
  }

  Valdi::RegisteredCppGeneratedClass *TreeWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TreeWheelConfig'{'data':a<r:'[0]'>, 'value':a<s>, 'columns':d}", []() -> Valdi::TypeReferencesVec {
      return {WheelTreeNode::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionDemoResult.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  VisionDemoResult::VisionDemoResult(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  VisionDemoResult::VisionDemoResult(const Valdi::StringBox &opencvVersion, const Valdi::StringBox &ncnnVersion, const Valdi::StringBox &modelName, const Valdi::StringBox &modelDescription, double processingMs, double inferenceMs, double width, double height, double inferenceWidth, double inferenceHeight, double edgePixelCount, const Valdi::StringBox &inputImageUrl, const Valdi::StringBox &edgeImageUrl, const std::vector<VisionPrediction> &predictions): Valdi::CppGeneratedModel(getRegisteredClass()),
  _opencvVersion(std::move(opencvVersion)),
  _ncnnVersion(std::move(ncnnVersion)),
  _modelName(std::move(modelName)),
  _modelDescription(std::move(modelDescription)),
  _processingMs(processingMs),
  _inferenceMs(inferenceMs),
  _width(width),
  _height(height),
  _inferenceWidth(inferenceWidth),
  _inferenceHeight(inferenceHeight),
  _edgePixelCount(edgePixelCount),
  _inputImageUrl(std::move(inputImageUrl)),
  _edgeImageUrl(std::move(edgeImageUrl)),
  _predictions(std::move(predictions)) {
  }

  const Valdi::StringBox &VisionDemoResult::getOpencvVersion() const {
    return _opencvVersion;
  }

  void VisionDemoResult::setOpencvVersion(const Valdi::StringBox &value) {
    _opencvVersion = value;
  }

  void VisionDemoResult::setOpencvVersion(Valdi::StringBox &&value) {
    _opencvVersion = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getNcnnVersion() const {
    return _ncnnVersion;
  }

  void VisionDemoResult::setNcnnVersion(const Valdi::StringBox &value) {
    _ncnnVersion = value;
  }

  void VisionDemoResult::setNcnnVersion(Valdi::StringBox &&value) {
    _ncnnVersion = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getModelName() const {
    return _modelName;
  }

  void VisionDemoResult::setModelName(const Valdi::StringBox &value) {
    _modelName = value;
  }

  void VisionDemoResult::setModelName(Valdi::StringBox &&value) {
    _modelName = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getModelDescription() const {
    return _modelDescription;
  }

  void VisionDemoResult::setModelDescription(const Valdi::StringBox &value) {
    _modelDescription = value;
  }

  void VisionDemoResult::setModelDescription(Valdi::StringBox &&value) {
    _modelDescription = std::move(value);
  }

  double VisionDemoResult::getProcessingMs() const {
    return _processingMs;
  }

  void VisionDemoResult::setProcessingMs(double value) {
    _processingMs = value;
  }

  double VisionDemoResult::getInferenceMs() const {
    return _inferenceMs;
  }

  void VisionDemoResult::setInferenceMs(double value) {
    _inferenceMs = value;
  }

  double VisionDemoResult::getWidth() const {
    return _width;
  }

  void VisionDemoResult::setWidth(double value) {
    _width = value;
  }

  double VisionDemoResult::getHeight() const {
    return _height;
  }

  void VisionDemoResult::setHeight(double value) {
    _height = value;
  }

  double VisionDemoResult::getInferenceWidth() const {
    return _inferenceWidth;
  }

  void VisionDemoResult::setInferenceWidth(double value) {
    _inferenceWidth = value;
  }

  double VisionDemoResult::getInferenceHeight() const {
    return _inferenceHeight;
  }

  void VisionDemoResult::setInferenceHeight(double value) {
    _inferenceHeight = value;
  }

  double VisionDemoResult::getEdgePixelCount() const {
    return _edgePixelCount;
  }

  void VisionDemoResult::setEdgePixelCount(double value) {
    _edgePixelCount = value;
  }

  const Valdi::StringBox &VisionDemoResult::getInputImageUrl() const {
    return _inputImageUrl;
  }

  void VisionDemoResult::setInputImageUrl(const Valdi::StringBox &value) {
    _inputImageUrl = value;
  }

  void VisionDemoResult::setInputImageUrl(Valdi::StringBox &&value) {
    _inputImageUrl = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getEdgeImageUrl() const {
    return _edgeImageUrl;
  }

  void VisionDemoResult::setEdgeImageUrl(const Valdi::StringBox &value) {
    _edgeImageUrl = value;
  }

  void VisionDemoResult::setEdgeImageUrl(Valdi::StringBox &&value) {
    _edgeImageUrl = std::move(value);
  }

  const std::vector<VisionPrediction> &VisionDemoResult::getPredictions() const {
    return _predictions;
  }

  void VisionDemoResult::setPredictions(const std::vector<VisionPrediction> &value) {
    _predictions = value;
  }

  void VisionDemoResult::setPredictions(std::vector<VisionPrediction> &&value) {
    _predictions = std::move(value);
  }

  void VisionDemoResult::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, VisionDemoResult &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._opencvVersion, self._ncnnVersion, self._modelName, self._modelDescription, self._processingMs, self._inferenceMs, self._width, self._height, self._inferenceWidth, self._inferenceHeight, self._edgePixelCount, self._inputImageUrl, self._edgeImageUrl, self._predictions);
  }

  void VisionDemoResult::marshall(Valdi::ExceptionTracker &exceptionTracker, const VisionDemoResult &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._opencvVersion, self._ncnnVersion, self._modelName, self._modelDescription, self._processingMs, self._inferenceMs, self._width, self._height, self._inferenceWidth, self._inferenceHeight, self._edgePixelCount, self._inputImageUrl, self._edgeImageUrl, self._predictions);
  }

  Valdi::RegisteredCppGeneratedClass *VisionDemoResult::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::VisionDemoResult'{'opencvVersion':s, 'ncnnVersion':s, 'modelName':s, 'modelDescription':s, 'processingMs':d, 'inferenceMs':d, 'width':d, 'height':d, 'inferenceWidth':d, 'inferenceHeight':d, 'edgePixelCount':d, 'inputImageUrl':s, 'edgeImageUrl':s, 'predictions':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {VisionPrediction::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class VisionHostProxy: public VisionHost {
    public:
    using RunDemoFn = Valdi::Function<void(RunDemoDoneFn)>;

    VisionHostProxy() = default;
    ~VisionHostProxy() override = default;

    void runDemo(RunDemoDoneFn done) final {
      _runDemo(done);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionHostProxy> &out) {
      out = Valdi::makeShared<VisionHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._runDemo);
    }

    private:
    RunDemoFn _runDemo;
  };

  VisionHost::VisionHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VisionHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VisionHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VisionHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VisionHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VisionHost, &VisionHost::runDemo>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VisionHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::VisionHost'{'runDemo':f|m|(f(s, r?:'[0]'))}", []() -> Valdi::TypeReferencesVec {
      return {VisionDemoResult::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class VisionModuleProxy: public VisionModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<VisionHost>()>;

    VisionModuleProxy() = default;
    ~VisionModuleProxy() override = default;

    Valdi::Ref<VisionHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionModuleProxy> &out) {
      out = Valdi::makeShared<VisionModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  VisionModule::VisionModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VisionModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VisionModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VisionModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VisionModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VisionModule, &VisionModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VisionModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::VisionModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {VisionHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionModuleFactory.cpp
//

#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  VisionModuleFactory::VisionModuleFactory() = default;
  VisionModuleFactory::~VisionModuleFactory() = default;

  Valdi::StringBox VisionModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_pages/src/vision/Vision");
  }
}

//
// VisionPrediction.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  VisionPrediction::VisionPrediction(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  VisionPrediction::VisionPrediction(const Valdi::StringBox &label, double score): Valdi::CppGeneratedModel(getRegisteredClass()),
  _label(std::move(label)),
  _score(score) {
  }

  const Valdi::StringBox &VisionPrediction::getLabel() const {
    return _label;
  }

  void VisionPrediction::setLabel(const Valdi::StringBox &value) {
    _label = value;
  }

  void VisionPrediction::setLabel(Valdi::StringBox &&value) {
    _label = std::move(value);
  }

  double VisionPrediction::getScore() const {
    return _score;
  }

  void VisionPrediction::setScore(double value) {
    _score = value;
  }

  void VisionPrediction::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, VisionPrediction &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._label, self._score);
  }

  void VisionPrediction::marshall(Valdi::ExceptionTracker &exceptionTracker, const VisionPrediction &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._label, self._score);
  }

  Valdi::RegisteredCppGeneratedClass *VisionPrediction::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::VisionPrediction'{'label':s, 'score':d}");

    return kRegisteredClass;
  }

}

//
// WheelTreeNode.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WheelTreeNode::WheelTreeNode(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WheelTreeNode::WheelTreeNode(const Valdi::StringBox &value, const Valdi::StringBox &label, const std::optional<std::vector<WheelTreeNode>> &children): Valdi::CppGeneratedModel(getRegisteredClass()),
  _value(std::move(value)),
  _label(std::move(label)),
  _children(std::move(children)) {
  }

  const Valdi::StringBox &WheelTreeNode::getValue() const {
    return _value;
  }

  void WheelTreeNode::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void WheelTreeNode::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  const Valdi::StringBox &WheelTreeNode::getLabel() const {
    return _label;
  }

  void WheelTreeNode::setLabel(const Valdi::StringBox &value) {
    _label = value;
  }

  void WheelTreeNode::setLabel(Valdi::StringBox &&value) {
    _label = std::move(value);
  }

  const std::optional<std::vector<WheelTreeNode>> &WheelTreeNode::getChildren() const {
    return _children;
  }

  void WheelTreeNode::setChildren(const std::optional<std::vector<WheelTreeNode>> &value) {
    _children = value;
  }

  void WheelTreeNode::setChildren(std::optional<std::vector<WheelTreeNode>> &&value) {
    _children = std::move(value);
  }

  void WheelTreeNode::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WheelTreeNode &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._value, self._label, self._children);
  }

  void WheelTreeNode::marshall(Valdi::ExceptionTracker &exceptionTracker, const WheelTreeNode &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._value, self._label, self._children);
  }

  Valdi::RegisteredCppGeneratedClass *WheelTreeNode::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WheelTreeNode'{'value':s, 'label':s, 'children':a?<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {WheelTreeNode::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

