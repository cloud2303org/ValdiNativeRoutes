//
// AppContextHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  class AppContextHostProxy: public AppContextHost {
    public:
    using GetNavigationHostFn = Valdi::Function<NavigationHost()>;

    AppContextHostProxy() = default;
    ~AppContextHostProxy() override = default;

    NavigationHost getNavigationHost() final {
      return _getNavigationHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextHostProxy> &out) {
      out = Valdi::makeShared<AppContextHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getNavigationHost);
    }

    private:
    GetNavigationHostFn _getNavigationHost;
  };

  AppContextHost::AppContextHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AppContextHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppContextHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AppContextHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AppContextHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AppContextHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AppContextHost, &AppContextHost::getNavigationHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AppContextHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_foundation::AppContextHost'{'getNavigationHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {NavigationHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppContextModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_foundation::AppContextModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {AppContextHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppContextModuleFactory.cpp
//

#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  AppContextModuleFactory::AppContextModuleFactory() = default;
  AppContextModuleFactory::~AppContextModuleFactory() = default;

  Valdi::StringBox AppContextModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_foundation/src/host/AppContext");
  }
}

//
// NavigationHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::NavigationHost'{'push':f(s, m<s,u>, r:'[0]'), 'pushForResult':f(s, m<s,u>, r:'[0]', f(m<s,u>, b)), 'replace':f(s, m<s,u>, r:'[0]'), 'back':f(d), 'popToRoot':f(), 'reset':f(s, m<s,u>), 'switchTab':f(s), 'setStatusBarStyle':f(s), 'currentPages':f(f(a<r:'[1]'>)), 'updateRoutes':f(r:'[2]')}", []() -> Valdi::TypeReferencesVec {
      return {ResolvedNavigation::getRegisteredClass(), StackPage::getRegisteredClass(), RouteDeclaration::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PageContext.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::PageContext'{'finish':f(m<s,u>), 'back':f()}");

    return kRegisteredClass;
  }

}

//
// PageInsets.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::PageInsets'{'top':d, 'bottom':d, 'left':d, 'right':d}");

    return kRegisteredClass;
  }

}

//
// PageViewModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::PageViewModel'{'pageId':s, 'route':s, 'params':m<s,u>, 'presentation':s, 'insets':r:'[0]', 'visible':b, 'visibilityReason':s}", []() -> Valdi::TypeReferencesVec {
      return {PageInsets::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// RequestInitialContentDraw.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  Valdi::RegisteredCppGeneratedClass& RequestInitialContentDraw::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'RequestInitialContentDraw'{'requestInitialContentDraw':f(s, f()): b}");
    return *kSchema;
  }

  Valdi::Result<RequestInitialContentDraw> RequestInitialContentDraw::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<RequestInitialContentDraw>(jsRuntime, nativeObjectsManager, "app_foundation/src/splash/InitialContentDraw", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> RequestInitialContentDraw::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_foundation/src/splash/InitialContentDraw", registeredSchema());
  }
}

//
// ResolvedNavigation.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::ResolvedNavigation'{'animation':s, 'durationMs':d, 'presentation':s}");

    return kRegisteredClass;
  }

}

//
// RouteDeclaration.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::RouteDeclaration'{'routes':a<r:'[0]'>, 'tabBar':r?:'[1]', 'root':s}", []() -> Valdi::TypeReferencesVec {
      return {RouteEntry::getRegisteredClass(), RouteTabBar::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// RouteEntry.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::RouteEntry'{'route':s, 'kind':s, 'title':s, 'component':s?, 'nativeName':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTab.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::RouteTab'{'route':s, 'text':s, 'icon':s, 'selectedIcon':s, 'iconData':s?, 'selectedIconData':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTabBar.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::RouteTabBar'{'route':s, 'initial':s, 'tabs':a<r:'[0]'>, 'mode':s?, 'component':s?}", []() -> Valdi::TypeReferencesVec {
      return {RouteTab::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// SplashScreenHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  class SplashScreenHostProxy: public SplashScreenHost {
    public:
    using PreventAutoHideFn = Valdi::Function<bool()>;
    using HideFn = Valdi::Function<void()>;

    SplashScreenHostProxy() = default;
    ~SplashScreenHostProxy() override = default;

    bool preventAutoHide() final {
      return _preventAutoHide();
    }

    void hide() final {
      _hide();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<SplashScreenHostProxy> &out) {
      out = Valdi::makeShared<SplashScreenHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._preventAutoHide, self._hide);
    }

    private:
    PreventAutoHideFn _preventAutoHide;
    HideFn _hide;
  };

  SplashScreenHost::SplashScreenHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void SplashScreenHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<SplashScreenHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<SplashScreenHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void SplashScreenHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<SplashScreenHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<SplashScreenHost, &SplashScreenHost::preventAutoHide>(value), Valdi::CppMarshaller::methodToFunction<SplashScreenHost, &SplashScreenHost::hide>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *SplashScreenHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_foundation::SplashScreenHost'{'preventAutoHide':f|m|(): b, 'hide':f|m|()}");

    return kRegisteredClass;
  }

}

//
// SplashScreenNativeModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  class SplashScreenNativeModuleProxy: public SplashScreenNativeModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<SplashScreenHost>()>;

    SplashScreenNativeModuleProxy() = default;
    ~SplashScreenNativeModuleProxy() override = default;

    Valdi::Ref<SplashScreenHost> getHost() final {
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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_foundation::SplashScreenNativeModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {SplashScreenHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// SplashScreenNativeModuleFactory.cpp
//

#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

  SplashScreenNativeModuleFactory::SplashScreenNativeModuleFactory() = default;
  SplashScreenNativeModuleFactory::~SplashScreenNativeModuleFactory() = default;

  Valdi::StringBox SplashScreenNativeModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_foundation/src/splash/SplashScreenNative");
  }
}

//
// StackPage.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_foundation/app_foundation.hpp"

namespace snap::valdi_modules::app_foundation {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_foundation::StackPage'{'pageId':s, 'route':s, 'params':m<s,u>}");

    return kRegisteredClass;
  }

}

