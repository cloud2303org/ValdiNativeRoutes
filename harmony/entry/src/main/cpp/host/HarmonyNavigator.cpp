#include "HarmonyNavigator.hpp"
#include "HarmonyNativeAppUIPresenter.hpp"
#include "HarmonyHostLifecycle.hpp"

#include "valdi/runtime/Context/Context.hpp"
#include "valdi/runtime/Context/ViewManagerContext.hpp"
#include "valdi/runtime/Context/ViewNodeTree.hpp"
#include "valdi/runtime/JavaScript/JavaScriptRuntime.hpp"
#include "valdi_core/Animator.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include "valdi_core/cpp/Utils/LazyValueConvertible.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"

#include <hilog/log.h>
#include <arkui/native_interface.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <exception>
#include <iterator>
#include <set>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace ValdiHarmony {
namespace {

using Valdi::Value;
namespace Routes = snap::valdi_modules::app_pages;

Value object() { return Value(Valdi::makeShared<Valdi::ValueMap>()); }

// Copy data while still on the emitting JS call. Only owned native containers
// cross to UI; functions, opaque objects/proxies and JS handles never do.
Value detached(const Value& value, size_t depth, size_t& remaining) {
    if (depth > 64 || remaining == 0) {
        throw std::runtime_error("Navigation data exceeds depth/size limit");
    }
    --remaining;
    if (value.isMap() || value.isTypedObject()) {
        auto copy = object();
        if (value.isMap()) {
            for (const auto& [key, item] : *value.getMap()) {
                copy.setMapValue(key, detached(item, depth + 1, remaining));
            }
        } else {
            for (const auto& property : *value.getTypedObject()) {
                copy.setMapValue(property.name, detached(property.value, depth + 1, remaining));
            }
        }
        return copy;
    }
    if (value.isArray()) {
        const auto* array = value.getArray();
        if (array->size() > remaining) throw std::runtime_error("Navigation array exceeds size limit");
        auto copy = Valdi::ValueArray::make(array->size());
        for (size_t i = 0; i < array->size(); ++i) {
            copy->emplace(i, detached((*array)[i], depth + 1, remaining));
        }
        return Value(copy);
    }
    if (value.isString()) return Value(value.toString());
    if (value.isNullOrUndefined() || value.isBool()) return value;
    if (value.isNumber() && std::isfinite(value.toDouble())) return value;
    throw std::runtime_error("Navigation data must contain only finite structured values");
}

Value detached(const Value& value) {
    size_t remaining = 100000;
    return detached(value, 0, remaining);
}

Value dictionary(const Value& value) {
    auto copy = detached(value);
    if (!copy.isMap()) {
        throw std::runtime_error("Route params/results must be non-null dictionaries");
    }
    return copy;
}

template<typename T>
T model(const Value& value) {
    // Normalization also removes heap/schema-backed typed object references.
    const auto copy = detached(value);
    Valdi::SimpleExceptionTracker tracker;
    T result;
    Valdi::CppMarshaller::unmarshall(tracker, copy, result);
    if (!tracker) throw std::runtime_error(tracker.extractError().toString());
    return result;
}

template<typename T>
Value marshalled(const T& value) {
    Valdi::SimpleExceptionTracker tracker;
    Value result;
    Valdi::CppMarshaller::marshall(tracker, value, result);
    if (!tracker) throw std::runtime_error(tracker.extractError().toString());
    return result;
}

// The generated function bridge decodes arguments and catches Valdi::Exception.
// Translate native validation failures here, while preserving the emitting JS
// Context::current and keeping only a weak owner in the installed host.
template<typename Owner, typename Callable>
auto navigationEntry(std::weak_ptr<Owner> weak, Callable callable) {
    return [weak, callable = std::move(callable)](auto... arguments) {
        try {
            auto self = weak.lock();
            if (!self) throw Valdi::Exception("Harmony navigation host is disposed");
            callable(*self, std::move(arguments)...);
        } catch (const Valdi::Exception&) {
            throw;
        } catch (const std::exception& error) {
            throw Valdi::Exception(error.what());
        }
    };
}

struct RouteAnimation {
    std::string name = "slideRight";
    int durationMs = 300;
};

RouteAnimation validateOptions(const std::string& presentation, const Routes::ResolvedNavigation& options) {
    if (presentation != "push" && presentation != "sheet" && presentation != "compactSheet") {
        throw std::runtime_error("Unknown Harmony presentation '" + presentation + "'");
    }
    const auto animation = options.getAnimation().slowToString();
    if (animation != "default" && animation != "none" && animation != "slideRight" &&
        animation != "slideUp" && animation != "fade" && animation != "zoom") {
        throw std::runtime_error("Unknown Harmony animation; use default, none, slideRight, slideUp, fade or zoom");
    }
    if (options.getPresentation() != STRING_LITERAL("push")) {
        throw std::runtime_error("Harmony routing does not support fullscreen covers");
    }
    const auto duration = options.getDurationMs();
    if (!std::isfinite(duration) || duration < 0 || duration > 2000 || std::floor(duration) != duration) {
        throw std::runtime_error("durationMs must be an integer from 0 to 2000");
    }
    RouteAnimation result;
    if (animation != "default") result.name = animation;
    result.durationMs = static_cast<int>(duration);
    if (result.name == "none") result.durationMs = 0;
    return result;
}

} // namespace

struct HarmonyNavigator::Result {
    Valdi::Ref<Valdi::ValueFunction> callback;
    std::atomic<bool> completed{false};
    bool pages = false;
    bool attached = false; // UI-only; admitted but not yet bound requests stay tracked.
    // Captured on emitting JS, never inferred from foreground UI. Ancestors are
    // snapshotted there too: UI must not walk a mutable JS context parent chain.
    // Keep the creation context alive until its callback is actually delivered
    // on JS; a weak expiration is not an "unowned native" result.
    bool callerCaptured = false;
    std::vector<Valdi::Ref<Valdi::Context>> callerLineage;
};

struct HarmonyNavigator::Page {
    std::string id;
    std::string route;
    Value params;
    std::string component;
    std::string presentation;
    std::string selectedTab;
    std::string shellId;
    std::map<std::string, PagePtr> tabPages;
    PagePtr tabBar;
    std::shared_ptr<Result> result;
    Valdi::SharedViewNodeTree tree;
    Valdi::Ref<Valdi::View> root;
    std::shared_ptr<HarmonyNativeRouteSurface> native;
    std::shared_ptr<HarmonyNativeRouteIdentity> nativeIdentity;
    ArkUI_NodeContentHandle mountedContent = nullptr;
    bool tabs = false;
    bool isTabBar = false;
    bool removed = false;
    bool retired = false;
    bool sheetPage = false;
    bool visible = false;
    std::string reason;
    std::string animation = "slideRight";
    int durationMs = 300;
};

struct HarmonyNavigator::Transition {
    uint64_t id;
    PagePtr outgoing;
    PagePtr incoming;
    // A popped stack entry stays alive (including tab children and result)
    // until its exit completes. It is already absent from currentPages().
    PagePtr retiring;
    Value value;
    bool canceled;
    Valdi::NativeAnimator animator;
    // Interactive preview owns both mounted roots but does not own the stack
    // mutation or result until release commits it.
    bool interactive = false;
    bool committed = true;
    bool settling = false;
    float progress = 0;
    float width = 0;
    float maxProgress = 0;
    float releaseVelocityX = 0;
    float reportedVelocityX = 0;
    float lastMovementDx = 0;
    int64_t releaseIdleMs = 0;
    uint64_t inputEvents = 0;
    const char* endReason = "interrupted";
    bool nativeCanceled = false;
    std::chrono::steady_clock::time_point startedAt;
    std::chrono::steady_clock::time_point lastMovementAt;
    struct InputSample {
        float dx;
        float dy;
        float progress;
        int64_t elapsedMs;
    };
    std::vector<InputSample> inputSamples; // bounded to 8 actual native events
};

HarmonyNavigator::HarmonyNavigator(Valdi::SharedRuntime runtime,
                                 Valdi::Ref<Valdi::ViewManagerContext> viewManagerContext,
                                 Valdi::Harmony::ArkUIViewManager& viewManager,
                                 ArkUI_NodeContentHandle content,
                                 Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,
                                 Valdi::Size size, HarmonyNativeAppUI nativeAppUI, float nativeScale,
                                 ArkUI_ContextHandle uiContext)
    : _runtime(std::move(runtime)), _viewManagerContext(std::move(viewManagerContext)),
      _viewManager(viewManager), _content(content), _dispatcher(std::move(dispatcher)), _size(size),
      _nativeAppUI(std::move(nativeAppUI)), _nativeScale(nativeScale), _uiContext(uiContext),
      _fullWindowHeight(size.height), _sheetViewportHeight(size.height) {}

void HarmonyNavigator::requireUI() const {
    if (!_dispatcher->isUIThread()) {
        throw std::runtime_error("Harmony navigation must run on UI");
    }
}

void HarmonyNavigator::complete(const std::shared_ptr<Result>& result, Value value, bool canceled) {
    if (!result) return;
    std::unique_lock guard(_admissionMutex);
    if (result->completed.exchange(true)) {
        return;
    }
    _pendingResults.erase(result.get());
    // Result callbacks and their final references are handled on JS, before the
    // teardown fence. Never synchronously call JS from an ArkUI mutation.
    auto deliver = [result, value = std::move(value), canceled]() mutable {
            auto callerLineage = std::move(result->callerLineage);
            auto callback = std::move(result->callback);
            if (callback != nullptr) {
                if (result->pages) {
                    (*callback)(Valdi::ValueFunctionFlagsNeverCallSync,
                                {value.isArray() ? value : Value(Valdi::ValueArray::make(0))});
                } else {
                    (*callback)(Valdi::ValueFunctionFlagsNeverCallSync,
                                {canceled || !value.isMap() ? object() : value, Value(canceled)});
                }
            }
        };
    auto* js = _runtime->getJavaScriptRuntime();
    if (js->isInJsThread()) {
        // A JS call racing close may already be on the queue, behind the worker
        // fence. Cancel there without introducing another task after that fence.
        guard.unlock();
        deliver();
    } else {
        // Keep admission locked until delivery is on JS. Otherwise close could
        // miss this retired request and place its worker fence ahead of it.
        js->getJsDispatchQueue()->async(std::move(deliver));
    }
}

void HarmonyNavigator::enqueue(Command command, const std::shared_ptr<Result>& failureResult,
                               bool routePublication) {
    std::unique_lock guard(_admissionMutex);
    for (auto it = _retiringContexts.begin(); it != _retiringContexts.end();) {
        if (it->second.expired()) it = _retiringContexts.erase(it);
        else ++it;
    }
    bool retiringCaller = false;
    if (failureResult && failureResult->callerCaptured) {
        for (const auto& context : failureResult->callerLineage)
            if (context->isDestroyed() || _retiringContexts.count(context.get())) retiringCaller = true;
    }
    if (_closed || retiringCaller) {
        guard.unlock();
        complete(failureResult);
        return;
    }
    if (failureResult) _pendingResults.emplace(failureResult.get(), failureResult);
    const auto publication = routePublication ? ++_routePublications : 0;
    // All producer calls enqueue even when already on UI. This keeps JS command
    // ordering independent of whether Valdi emitted a native callback inline.
    _dispatcher->dispatch(new Valdi::DispatchFunction(
        [weak = weak_from_this(), command = std::move(command), failureResult, publication] {
            if (auto self = weak.lock()) {
                if (self->_closed) {
                    self->complete(failureResult);
                    return;
                }
                // A caller retirement can cancel a request still in a local
                // dispatcher batch. Do not create a destination for that call.
                if (failureResult && failureResult->completed.load()) return;
                try {
                    self->_error.clear();
                    command(*self);
                    self->changed();
                    if (publication == 1) {
                        std::function<void()> accepted;
                        {
                            // Linearize acceptance with route admission, after
                            // changed() and its synchronous observers returned.
                            std::lock_guard guard(self->_admissionMutex);
                            accepted = std::exchange(self->_initialRoutesAccepted, {});
                            if (self->_closed || self->_routePublications != publication || !self->_error.empty())
                                accepted = {};
                        }
                        if (accepted) accepted();
                    }
                } catch (const std::exception& error) {
                    if (publication == 1) self->_initialRoutesAccepted = {};
                    self->complete(failureResult);
                    self->reportError(error.what());
                }
            }
        }), false);
}

void HarmonyNavigator::setInitialRoutesAccepted(std::function<void()> accepted) {
    requireUI();
    std::lock_guard guard(_admissionMutex);
    if (_closed || _routePublications != 0 || _initialRoutesAccepted)
        throw std::runtime_error("Initial route acceptance must be bound before startup publication");
    _initialRoutesAccepted = std::move(accepted);
}

void HarmonyNavigator::perform(const Command& command) {
    requireUI();
    if (_closed) {
        return;
    }
    try {
        _error.clear();
        command(*this);
        changed();
    } catch (const std::exception& error) {
        reportError(error.what());
    }
}

void HarmonyNavigator::changed() {
    requireUI();
    if (_closed) return;
    syncNativeActions();
    notifyForegroundPage();
    if (_closed) return; // Foreground callback may synchronously close the host.
    reconcileTabBar();
    updateRootDragObserver();
    // A synchronous observer may change registration or initiate host teardown.
    auto observer = _observer;
    if (observer) {
        observer(navigationState());
    }
}

std::string HarmonyNavigator::foregroundPageIdentity() const {
    if (!_closed && _sheet) {
        // The closing sheet keeps its committed foreground identity through
        // detach. Looking up a selected child must never create a page.
        auto page = _sheet;
        while (page && !page->removed && page->tabs) {
            auto child = page->tabPages.find(page->selectedTab);
            page = child == page->tabPages.end() ? nullptr : child->second;
        }
        return page && !page->removed ? page->id : std::string();
    }
    return appUIForegroundPageIdentity(_stack, _closed);
}

void HarmonyNavigator::notifyForegroundPage() {
    const auto identity = foregroundPageIdentity();
    if (_foregroundPageId == identity) return;
    _foregroundPageId = identity; // Commit before observer reentrancy.
    auto observer = _foregroundPageObserver;
    if (observer) observer(identity);
}

void HarmonyNavigator::reportError(const std::string& message) {
    _error = message;
    logNativeError(message.c_str());
    changed();
}

void HarmonyNavigator::reportRuntimeError(std::string message) {
    enqueue([message = std::move(message)](auto&) { throw std::runtime_error(message); });
}

Value HarmonyNavigator::makeNavigationHost() {
    auto weak = weak_from_this();
    Routes::NavigationHost host;
    // Generated callbacks own argument decoding. Detach all mutable data on JS
    // before admission; the queued command must never retain caller containers.
    host.setPush(navigationEntry(weak, [](auto& self, Valdi::StringBox routeName,
        Valdi::Ref<Valdi::ValueMap> data, Valdi::StringBox presentationName,
        Routes::ResolvedNavigation navigation) {
        auto route = routeName.slowToString();
        auto params = dictionary(Value(data));
        auto presentation = presentationName.slowToString();
        auto options = model<Routes::ResolvedNavigation>(marshalled(navigation));
        self.enqueue([=](auto& nav) { nav.push(route, params, presentation, options, nullptr); });
    }));
    host.setPushForResult(navigationEntry(weak, [](auto& self, Valdi::StringBox routeName,
        Valdi::Ref<Valdi::ValueMap> data, Valdi::StringBox presentationName,
        Routes::ResolvedNavigation navigation, Routes::NavigationHost::PushForResultOnResultFn onResult) {
        auto route = routeName.slowToString();
        auto params = dictionary(Value(data));
        auto presentation = presentationName.slowToString();
        auto options = model<Routes::ResolvedNavigation>(marshalled(navigation));
        auto result = std::make_shared<Result>();
        // Adapt the generated callback to the existing JS-only delivery owner.
        // This wrapper retains its original JS function until complete() moves
        // and releases it on JS, together with the captured caller lineage.
        result->callback = marshalled(onResult).getFunctionRef();
        captureResultCaller(*result);
        self.enqueue([=](auto& nav) { nav.push(route, params, presentation, options, result); }, result);
    }));
    host.setReplace(navigationEntry(weak, [](auto& self, Valdi::StringBox routeName,
        Valdi::Ref<Valdi::ValueMap> data, Routes::ResolvedNavigation navigation) {
        auto route = routeName.slowToString();
        auto params = dictionary(Value(data));
        auto options = model<Routes::ResolvedNavigation>(marshalled(navigation));
        self.enqueue([=](auto& nav) { nav.replace(route, params, options); });
    }));
    host.setBack(navigationEntry(weak, [](auto& self, double delta) {
        self.enqueue([delta](auto& nav) {
            if (!std::isfinite(delta) || delta < 0 || std::floor(delta) != delta) {
                throw std::runtime_error("back(delta) requires a nonnegative integer");
            }
            nav.goBack(static_cast<size_t>(std::min(delta, static_cast<double>(nav._stack.size()))));
        });
    }));
    host.setPopToRoot(navigationEntry(weak, [](auto& self) {
        self.enqueue([](auto& nav) {
            if (nav.afterSheet([](auto& current) { current.keep(1); current.reconcile(); })) return;
            nav.keep(1); nav.reconcile();
        });
    }));
    host.setReset(navigationEntry(weak, [](auto& self, Valdi::StringBox routeName,
        Valdi::Ref<Valdi::ValueMap> data) {
        auto route = routeName.slowToString();
        auto params = dictionary(Value(data));
        self.enqueue([=](auto& nav) { nav.reset(route, params); });
    }));
    host.setSwitchTab(navigationEntry(weak, [](auto& self, Valdi::StringBox routeName) {
        auto route = routeName.slowToString();
        self.enqueue([=](auto& nav) { nav.switchTab(route); });
    }));
    host.setSetStatusBarStyle(navigationEntry(weak, [](auto& self, Valdi::StringBox styleName) {
        auto style = styleName.slowToString();
        self.enqueue([=](auto& nav) {
            if (style != "auto" && style != "light" && style != "dark") {
                throw std::runtime_error("Unknown status bar style: " + style);
            }
            nav._statusBarStyle = style;
        });
    }));
    host.setCurrentPages(navigationEntry(weak, [](auto& self, Routes::NavigationHost::CurrentPagesDoneFn done) {
        self.currentPages(marshalled(done).getFunctionRef());
    }));
    host.setUpdateRoutes(navigationEntry(weak, [](auto& self, Routes::RouteDeclaration table) {
        auto declaration = model<Routes::RouteDeclaration>(marshalled(table));
        self.enqueue([=](auto& nav) { nav.updateRoutes(declaration); }, nullptr, true);
    }));
    _host = marshalled(host);
    return _host;
}

const Routes::RouteEntry* HarmonyNavigator::routeDefinition(const std::string& route) const {
    const auto& routes = _declaration.getRoutes();
    auto found = std::find_if(routes.begin(), routes.end(),
                              [&](const auto& item) { return item.getRoute().toStringView() == route; });
    return found == routes.end() ? nullptr : &*found;
}

void HarmonyNavigator::validateRoute(const std::string& route) const {
    const auto* definition = routeDefinition(route);
    if (!definition) {
        throw std::runtime_error("Unknown route: " + route);
    }
    const auto kind = definition->getKind().slowToString();
    if (kind == "native") {
        if (!definition->getNativeName() ||
            !_nativeScreens.contains(definition->getNativeName()->slowToString())) {
            throw std::runtime_error("Harmony native route '" + route + "' is not registered");
        }
        return;
    }
    if (kind != "valdi" && kind != "tabs") {
        throw std::runtime_error("Unsupported route kind: " + kind);
    }
}

void HarmonyNavigator::validateTab(const std::string& route) const {
    const auto& bar = _declaration.getTabBar();
    if (bar != nullptr) {
        for (const auto& tab : bar->getTabs()) {
            if (tab.getRoute().toStringView() == route) {
                validateRoute(route);
                return;
            }
        }
    }
    throw std::runtime_error("Unknown or undeclared tab: " + route);
}

HarmonyNavigator::PagePtr HarmonyNavigator::entry(const std::string& route, const Value& params,
                                                const std::string& presentation,
                                                const std::shared_ptr<Result>& result,
                                                const std::string& shellId, bool sheetPage) {
    validateRoute(route);
    if (!params.isMap()) throw std::runtime_error("Route params must be a dictionary");
    const auto* definition = routeDefinition(route);
    auto page = std::make_shared<Page>();
    page->id = "page-" + std::to_string(_nextId++);
    page->route = route;
    page->params = params;
    page->presentation = presentation;
    page->result = result;
    page->sheetPage = sheetPage;
    if (result) result->attached = true;
    page->shellId = shellId; // Must precede initial view-model/tree creation.
    page->tabs = definition->getKind() == STRING_LITERAL("tabs");
    if (page->tabs) {
        const auto requested = params.getMapValue("tab");
        if (!requested.isNullOrUndefined() && !requested.isString()) {
            throw std::runtime_error("Tab route must be a string");
        }
        page->selectedTab = requested.isNullOrUndefined()
                                ? _declaration.getTabBar()->getInitial().slowToString()
                                : requested.toString();
        validateTab(page->selectedTab);
        // Prepare both contexts before the shell changes the existing stack.
        try {
            front(page);
            if (customTabBar()) {
                auto bar = std::make_shared<Page>();
                bar->id = page->id + "-tab-bar";
                bar->shellId = page->id;
                bar->selectedTab = page->selectedTab;
                bar->isTabBar = true;
                bar->component = _declaration.getTabBar()->getComponent()->slowToString();
                page->tabBar = bar;
                createTree(bar);
            }
        } catch (...) {
            remove(page);
            throw;
        }
    } else if (definition->getKind() == STRING_LITERAL("native")) {
        createNative(page, *definition);
    } else {
        page->component = definition->getComponent()->slowToString();
        createTree(page);
    }
    return page;
}

HarmonyNavigator::PagePtr HarmonyNavigator::front(const PagePtr& page) {
    if (!page || !page->tabs) return page;
    auto found = page->tabPages.find(page->selectedTab);
    if (found != page->tabPages.end()) return found->second;
    auto child = entry(page->selectedTab, object(), "tab", nullptr, page->id, page->sheetPage);
    page->tabPages.emplace(page->selectedTab, child);
    return child;
}

Value HarmonyNavigator::viewModel(const PagePtr& page) const {
    if (page->isTabBar) {
        const auto shell = tabShell(page->shellId);
        // During initial context creation the new shell is not in _stack yet.
        return marshalled(Routes::TabBarViewModel(
            _declaration.getTabBar()->getTabs(),
            Valdi::StringBox::fromString(shell ? shell->selectedTab : page->selectedTab),
            _insets.bottom));
    }
    const auto sheetInsets = page->sheetPage ? sheetGeometry() : HarmonySheetGeometry{};
    Routes::PageInsets insets(page->sheetPage ? 0 : _insets.top,
        page->sheetPage ? sheetGeometry().contentInsetBottom :
        _insets.bottom + (page->shellId.empty() || customTabBar() ? 0 : _insets.tabBarHeight),
        page->sheetPage ? sheetInsets.contentInsetLeft : _insets.left,
        page->sheetPage ? sheetInsets.contentInsetRight : _insets.right);
    return marshalled(Routes::PageViewModel(
        Valdi::StringBox::fromString(page->id), Valdi::StringBox::fromString(page->route),
        page->params.getMapRef(), Valdi::StringBox::fromString(page->presentation),
        insets, page->visible, Valdi::StringBox::fromString(page->reason)));
}

void HarmonyNavigator::createTree(const PagePtr& page) {
    auto weak = weak_from_this();
    const Routes::PageContext context(
        [weak, id = page->id](Valdi::Ref<Valdi::ValueMap> value) {
            // Generated callbacks propagate Valdi::Exception to the JS caller.
            try {
                auto copy = dictionary(Value(value));
                if (auto self = weak.lock()) {
                    self->enqueue([=](auto& nav) { nav.finish(id, copy, false); });
                }
            } catch (const std::exception& error) {
                throw Valdi::Exception(error.what());
            }
        },
        [weak, id = page->id] {
            if (auto self = weak.lock()) {
                self->enqueue([=](auto& nav) { nav.finish(id, {}, true); });
            }
        });
    auto componentContext = marshalled(context);
    if (page->isTabBar) {
        componentContext = marshalled(Routes::TabBarContext(
            [weak, shellId = page->shellId](Valdi::StringBox route) {
                if (auto self = weak.lock()) {
                    self->enqueue([shellId, route = route.slowToString()](auto& nav) {
                        nav.selectShellTab(shellId, route);
                    });
                }
            }));
    }
    try {
        page->tree = _runtime->createViewNodeTreeAndContext(
            _viewManagerContext, Valdi::StringBox::fromString(page->component),
            Valdi::LazyValueConvertible::fromValue(viewModel(page)),
            Valdi::LazyValueConvertible::fromValue(componentContext));
        if (page->tree == nullptr) throw std::runtime_error("Could not create page tree: " + page->route);
        page->tree->setRetainsLayoutSpecsOnInvalidateLayout(true);
        page->tree->setRootViewWithDefaultViewClass();
        page->root = page->tree->getRootView();
        if (page->root == nullptr) throw std::runtime_error("Page has no native root: " + page->route);
        sizePage(page);
        if (page->isTabBar) {
            _viewManager.setRootHitTestPassthrough(page->root, true);
        }
    } catch (...) {
        if (page->tree != nullptr) {
            _runtime->destroyContext(page->tree->getContext());
            page->tree = nullptr;
        }
        page->root = nullptr;
        throw;
    }
}

void HarmonyNavigator::updateViewModel(const PagePtr& page) {
    if (page->nativeIdentity) page->nativeIdentity->setEligible(nativeActionAllowed(page));
    if (page->native && !page->removed) {
        const auto sheetInsets = page->sheetPage ? sheetGeometry() : HarmonySheetGeometry{};
        page->native->setInsets(page->sheetPage ? 0 : _insets.top,
            page->sheetPage ? sheetGeometry().contentInsetBottom :
            _insets.bottom + (page->shellId.empty() || customTabBar() ? 0 : _insets.tabBarHeight),
            page->sheetPage ? sheetInsets.contentInsetLeft : _insets.left,
            page->sheetPage ? sheetInsets.contentInsetRight : _insets.right);
    }
    if (page->tree != nullptr && !page->removed) {
        page->tree->getContext()->setViewModel(Valdi::LazyValueConvertible::fromValue(viewModel(page)));
    }
}

void HarmonyNavigator::sizePage(const PagePtr& page) {
    if (!page || page->removed || page->root == nullptr) return;
    auto size = _size;
    if (page->sheetPage) {
        auto geometry = sheetGeometry();
        size = Valdi::Size(geometry.rootWidth, geometry.contentHeight);
    }
    _viewManager.setRootSize(page->root, size);
    if (page->native) page->native->setSizePixels(
        static_cast<int32_t>(std::round(size.width * _nativeScale)),
        static_cast<int32_t>(std::round(size.height * _nativeScale)));
    if (page->tree != nullptr) page->tree->setLayoutSpecs(size, Valdi::LayoutDirectionLTR);
}

bool HarmonyNavigator::nativeActionAllowed(const PagePtr& page) const {
    if (_closed || !_active || !page || page->removed || !page->visible ||
        !page->nativeIdentity || page->nativeIdentity->retired) return false;
    if (_sheet) return !_sheetClosing && page == _sheetMounted;
    if (_transition || page != _mounted || _stack.empty()) return false;
    // Use committed ownership, never create a tab page to validate a callback.
    auto current = _stack.back();
    if (current->tabs) {
        auto child = current->tabPages.find(current->selectedTab);
        current = child == current->tabPages.end() ? nullptr : child->second;
    }
    return current == page;
}

void HarmonyNavigator::syncNativeActions() {
    std::set<const Page*> seen;
    std::function<void(const PagePtr&)> update = [&](const PagePtr& page) {
        if (!page || !seen.insert(page.get()).second) return;
        if (page->nativeIdentity) page->nativeIdentity->setEligible(nativeActionAllowed(page));
        for (const auto& [name, child] : page->tabPages) update(child);
    };
    for (const auto& page : _stack) update(page);
    update(_sheet);
    if (_transition) {
        update(_transition->incoming);
        update(_transition->outgoing);
        update(_transition->retiring);
    }
}

void HarmonyNavigator::createNative(const PagePtr& page, const Routes::RouteEntry& definition) {
    auto* api = static_cast<ArkUI_NativeNodeAPI_1*>(
        OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
    if (!api) throw std::runtime_error("ArkUI node API unavailable");
    page->nativeIdentity = std::make_shared<HarmonyNativeRouteIdentity>();
    auto weak = weak_from_this();
    auto action = [weak, owner = std::weak_ptr<Page>(page)](Command command) {
        if (auto self = weak.lock()) {
            auto page = owner.lock();
            if (!self->nativeActionAllowed(page)) return;
            const auto epoch = page->nativeIdentity->epoch.load();
            self->enqueue([owner, epoch, command = std::move(command)](auto& nav) {
                auto current = owner.lock();
                if (!nav.nativeActionAllowed(current) || !current->nativeIdentity->accepts(epoch)) return;
                command(nav);
            });
        }
    };
    HarmonyNativeScreenActions actions;
    actions.finishFruit = [action, id = page->id](const std::string& fruit) {
        action([id, fruit](auto& nav) {
            auto value = object();
            value.setMapValue("value", Value(fruit));
            nav.finish(id, value, false);
        });
    };
    actions.back = [action, id = page->id] {
        action([id](auto& nav) { nav.finish(id, {}, true); });
    };
    actions.pushDetail = [action] {
        action([](auto& nav) {
            auto params = object();
            params.setMapValue("id", Value(100.0));
            params.setMapValue("from", Value("原生页"));
            Routes::ResolvedNavigation options;
            options.setAnimation(STRING_LITERAL("default"));
            options.setPresentation(STRING_LITERAL("push"));
            options.setDurationMs(300);
            nav.push("detail", params, "push", options, nullptr);
        });
    };
    actions.switchWheels = [action] {
        action([](auto& nav) { nav.switchTab("wheels"); });
    };
    actions.modal = [action, owner = std::weak_ptr<Page>(page)] {
        action([owner](auto& nav) {
            auto page = owner.lock();
            if (page && nav._nativeAppUI)
                nav._nativeAppUI(page->nativeIdentity, page->nativeIdentity->epoch.load());
        });
    };
    try {
        page->root = _viewManager.createRootView();
        if (page->root == nullptr) throw std::runtime_error("Could not allocate native page root");
        sizePage(page);
        page->native = HarmonyNativeRouteSurface::create(*api, _viewManager.nativeNode(page->root),
            std::make_shared<Valdi::Ref<Valdi::View>>(page->root),
            [dispatcher = _dispatcher](std::function<void()> cleanup) {
                dispatcher->dispatch(new Valdi::DispatchFunction(std::move(cleanup)), false);
            }, [](const char* error) { logNativeError(error); });
        sizePage(page);
        _nativeScreens.build(definition.getNativeName()->slowToString(), page->native,
                             definition.getTitle().slowToString(), actions);
        updateViewModel(page);
    } catch (...) {
        page->nativeIdentity->retire();
        if (page->native) page->native->retire();
        page->native = nullptr;
        page->root = nullptr;
        throw;
    }
}

bool HarmonyNavigator::customTabBar() const {
    const auto& bar = _declaration.getTabBar();
    return bar != nullptr && bar->getMode() && *bar->getMode() == STRING_LITERAL("custom");
}

HarmonyNavigator::PagePtr HarmonyNavigator::tabShell(const std::string& id) const {
    for (const auto& page : _stack) {
        if (page->tabs && page->id == id) return page;
    }
    if (_transition && _transition->retiring && _transition->retiring->tabs &&
        _transition->retiring->id == id) return _transition->retiring;
    return nullptr;
}

HarmonyNavigator::PagePtr HarmonyNavigator::presentedTabShell() const {
    if (_transition && !_transition->outgoing->shellId.empty()) {
        if (auto shell = tabShell(_transition->outgoing->shellId)) return shell;
    }
    const auto shell = std::find_if(_stack.rbegin(), _stack.rend(), [](const auto& page) { return page->tabs; });
    return shell == _stack.rend() ? nullptr : *shell;
}

ArkUI_NodeContentHandle HarmonyNavigator::tabSurface(const PagePtr& page) const {
    if (!page || page->shellId.empty() || page->isTabBar || customTabBar()) return nullptr;
    const auto shell = _tabSurfaces.find(page->shellId);
    if (shell == _tabSurfaces.end()) return nullptr;
    const auto surface = shell->second.find(page->route);
    return surface == shell->second.end() ? nullptr : surface->second;
}

void HarmonyNavigator::mountPage(const PagePtr& page, ArkUI_NodeContentHandle content, int index) {
    if (page->mountedContent == content && index < 0) return;
    if (index < 0) _viewManager.mountRoot(page->root, content);
    else _viewManager.mountRoot(page->root, content, index);
    page->mountedContent = content;
}

void HarmonyNavigator::parkPage(const PagePtr& page) {
    if (!page || page->removed || page->root == nullptr) return;
    if (auto surface = tabSurface(page)) {
        mountPage(page, surface);
    } else if (page->mountedContent != nullptr) {
        _viewManager.unmountRoot(page->root);
        page->mountedContent = nullptr;
    }
}

void HarmonyNavigator::reconcileTabBar() {
    const auto shell = presentedTabShell();
    // Preserve outgoing shell visibility until a transition settles.
    const bool visible = !_closed && (_transition ? !_transition->outgoing->shellId.empty()
                                                  : !_stack.empty() && _stack.back()->tabs);
    auto next = visible && shell ? shell->tabBar : nullptr;
    if (_mountedTabBar != next) {
        parkPage(_mountedTabBar);
        _mountedTabBar = next;
    }
    if (next) {
        next->selectedTab = shell->selectedTab;
        updateViewModel(next);
        if (_tabBarContent != nullptr) mountPage(next, _tabBarContent);
    }
}

void HarmonyNavigator::registerTabSurface(const std::string& shellId, const std::string& route,
                                         ArkUI_NodeContentHandle content) {
    requireUI();
    if (_closed) return;
    auto shell = tabShell(shellId);
    if (!shell || customTabBar()) return; // Late ArkTS work from a retired declaration.
    validateTab(route);
    if (content == _tabBarContent || content == _content || content == _sheetContent) {
        throw std::invalid_argument("A tab page needs a distinct NodeContent");
    }
    for (const auto& [ownerId, surfaces] : _tabSurfaces) {
        for (const auto& [ownerRoute, surface] : surfaces) {
            if (surface == content && (ownerId != shellId || ownerRoute != route)) {
                throw std::invalid_argument("NodeContent is already registered to another tab page");
            }
        }
    }
    _tabSurfaces[shellId][route] = content;
    perform([&](auto&) {
        const auto child = shell->tabPages.find(route);
        if (child != shell->tabPages.end() &&
            (!_transition || (child->second != _transition->outgoing && child->second != _transition->incoming))) {
            mountPage(child->second, content);
        }
        reconcile();
    });
}

void HarmonyNavigator::registerTabBarSurface(ArkUI_NodeContentHandle content) {
    requireUI();
    if (_closed) return;
    if (content == _content || content == _sheetContent)
        throw std::invalid_argument("Tab bar needs a distinct NodeContent");
    for (const auto& [shellId, surfaces] : _tabSurfaces) {
        for (const auto& [route, surface] : surfaces) {
            if (surface == content) throw std::invalid_argument("Tab bar cannot reuse a tab page surface");
        }
    }
    _tabBarContent = content;
    perform([](auto&) {});
}

void HarmonyNavigator::registerSheetSurface(ArkUI_NodeContentHandle content) {
    requireUI();
    if (_closed) return;
    if (!content || content == _content || content == _tabBarContent)
        throw std::invalid_argument("Sheet needs a distinct NodeContent");
    if (_sheetContent && _sheetContent != content)
        throw std::invalid_argument("Sheet NodeContent is already registered");
    for (const auto& [shellId, surfaces] : _tabSurfaces) {
        for (const auto& [route, surface] : surfaces)
            if (surface == content) throw std::invalid_argument("Sheet cannot reuse a tab surface");
    }
    _sheetContent = content;
}

HarmonySheetGeometry HarmonyNavigator::sheetGeometry() const {
    return computeHarmonySheetGeometry({_size.width,
        _fullWindowHeight > 0 ? _fullWindowHeight : _size.height,
        _sheetViewportHeight, _keyboardOverlap,
        static_cast<float>(_insets.top), static_cast<float>(_insets.left),
        static_cast<float>(_insets.right), _sheetSystemBottom, _sheetCompact});
}

void HarmonyNavigator::setSheetWindowMetrics(float fullWindowHeight, float availableViewportHeight,
                                            float keyboardOverlap, float systemBottom) {
    requireUI();
    for (auto value : {fullWindowHeight, availableViewportHeight, keyboardOverlap, systemBottom}) {
        if (!std::isfinite(value) || value < 0 || value > 1000000)
            throw std::invalid_argument("Invalid sheet window/keyboard metrics");
    }
    if (availableViewportHeight > fullWindowHeight)
        throw std::invalid_argument("Sheet viewport exceeds the observed window");
    if (_closed) return;
    perform([&](auto&) {
        _fullWindowHeight = fullWindowHeight;
        _sheetViewportHeight = availableViewportHeight;
        _keyboardOverlap = keyboardOverlap;
        _sheetSystemBottom = systemBottom;
        layoutSheet();
    });
}

void HarmonyNavigator::showSheet(const PagePtr& page) {
    requireUI();
    if (_sheet || !_sheetContent || !_uiContext)
        throw std::runtime_error("Sheet surface is unavailable or already owned");
    _sheet = page;
    const auto generation = ++_sheetGeneration;
    _sheetClosing = false;
    _sheetResult = {};
    _sheetCanceled = true;
    auto weak = weak_from_this();
    try {
        auto surface = HarmonySheetSurface::create(_sheetContent, _uiContext,
            [dispatcher = _dispatcher](std::function<void()> cleanup) {
                dispatcher->dispatch(new Valdi::DispatchFunction(std::move(cleanup)), false);
            }, [weak, generation] {
                if (auto self = weak.lock(); self && !self->_closed &&
                    self->_sheet && self->_sheetGeneration == generation && !self->_sheetClosing)
                    self->perform([](auto& nav) { nav.closeSheet(); });
            });
        _sheetSurface = surface;
        auto child = front(page); // Native pages have a root but no Valdi tree.
        _sheetMounted = child;
        const auto geometry = sheetGeometry();
        surface->layout(geometry, geometry.panelHeight);
        sizePage(child);
        if (_closed || _sheet != page || _sheetGeneration != generation) return;
        // Publish mount intent before backend callbacks may synchronously close
        // us. Unmount of an as-yet unattached root is safe on allocation failure.
        child->mountedContent = _sheetContent;
        _viewManager.mountRootInParent(child->root, surface->viewport());
        if (_closed || _sheet != page || _sheetGeneration != generation) return;
        surface->setActive(_active);
        reconcileSheet("navigation");
        if (_closed || _sheet != page || _sheetGeneration != generation) return;
        updateRootDragObserver();
        if (_active && !_sheetTouchSession) surface->animateTo(0, 0, [weak, generation](bool settled) {
            if (auto self = weak.lock(); self && !self->_closed && self->_sheet &&
                self->_sheetGeneration == generation && !self->_sheetClosing && !settled)
                self->perform([](auto& nav) { nav.closeSheet(); });
        });
        else if (!_active) surface->layout(geometry, 0);
    } catch (...) {
        // The partially published shell/page still belongs to this generation.
        // finishSheet synchronously unmounts and detaches before result delivery.
        if (_sheet == page) finishSheet(_sheetGeneration, true);
        throw;
    }
}

void HarmonyNavigator::layoutSheet() {
    if (!_sheet || !_sheetSurface) return;
    auto surface = _sheetSurface;
    const auto generation = _sheetGeneration;
    const auto geometry = sheetGeometry();
    try { surface->layout(geometry, surface->currentOffset()); }
    catch (...) {
        if (_sheet && _sheetGeneration == generation) {
            if (_sheetClosing) finishSheet(generation);
            else {
                try { closeSheet(); }
                catch (...) {} // closeSheet itself drains a failed terminal.
            }
        }
        throw;
    }
    if (_closed || _sheetGeneration != generation || _sheetSurface != surface) return;
    // Native picker sizing never assumes a Valdi tree.
    sizePage(_sheetMounted);
    if (_sheetMounted) updateViewModel(_sheetMounted);
}

void HarmonyNavigator::reconcileSheet(const std::string& reason) {
    auto page = _sheetMounted;
    if (!page || page->removed) return;
    if (page->visible != _active) {
        page->visible = _active;
        page->reason = _active ? reason : "background";
        updateViewModel(page);
    }
    if (_active && !_sheetClosing) bindSheetInput();
    else unbindSheetInput();
    if (_sheetSurface) {
        // Closing keeps the carrier visible through its native settle. Input
        // admission is independent, and is revoked before disabling controls.
        _sheetSurface->setInputEnabled(!_sheetClosing);
        _sheetSurface->setActive(_active);
    }
}

bool HarmonyNavigator::sheetInputCurrent(const PagePtr& page,
    const std::shared_ptr<Valdi::Harmony::SheetInteractionLifetime>& token) const {
    return !_closed && _active && !_sheetClosing && _sheet && page && !page->removed &&
        page == _sheetMounted && _sheetSurface && _sheetInteraction &&
        _sheetInteraction->lifetime == token && token && token->live.load() &&
        token->generation == _sheetGeneration && page->root == _sheetInputRoot;
}

void HarmonyNavigator::unbindSheetInput() {
    auto binding = std::exchange(_sheetInteraction, {});
    auto root = std::exchange(_sheetInputRoot, {});
    _sheetTouchSession = 0;
    // Revoke before the backend's end/cancel can reenter. Both event userdata
    // disposal and the later surface-node disposal use the same UI dispatcher.
    if (binding && binding->lifetime) binding->lifetime->revoke();
    if (root != nullptr) {
        try { Valdi::Harmony::bindSheetInteraction(_viewManager, root, {}); }
        catch (const std::exception& error) {
            // Revoked callbacks are inert. Root unmount/shutdown still owns
            // backend disposal; a cleanup error cannot skip native detach.
            logNativeError(error.what());
        }
    }
}

void HarmonyNavigator::bindSheetInput() {
    if (!_sheetMounted || !_sheetSurface || _sheetClosing || !_active || _closed) return;
    if (_sheetInteraction && sheetInputCurrent(_sheetMounted, _sheetInteraction->lifetime)) return;
    unbindSheetInput();
    using namespace Valdi::Harmony;
    auto binding = std::make_shared<SheetInteractionBinding>();
    binding->lifetime = std::make_shared<SheetInteractionLifetime>(_sheetGeneration);
    binding->panel = _sheetSurface->interactionNode();
    binding->rootMountParent = _sheetSurface->viewport();
    binding->context = _uiContext;
    auto weak = weak_from_this();
    auto owner = std::weak_ptr<Page>(_sheetMounted);
    auto lifetime = std::weak_ptr<SheetInteractionLifetime>(binding->lifetime);
    binding->begin = [weak, owner, lifetime](uint64_t session) {
        auto self = weak.lock();
        auto token = lifetime.lock();
        auto page = owner.lock();
        if (!self || !session || !self->sheetInputCurrent(page, token) || self->_sheetTouchSession) return false;
        auto surface = self->_sheetSurface;
        surface->cancelAnimation();
        if (!self->sheetInputCurrent(page, token) || self->_sheetSurface != surface) return false;
        self->_sheetTouchSession = session;
        return true;
    };
    binding->offer = [weak, owner, lifetime](uint64_t session, float input) {
        auto self = weak.lock();
        auto token = lifetime.lock();
        auto page = owner.lock();
        if (!self || !std::isfinite(input) || !self->sheetInputCurrent(page, token) ||
            self->_sheetTouchSession != session) return input;
        auto surface = self->_sheetSurface;
        const auto geometry = self->sheetGeometry();
        const float from = surface->currentOffset();
        const float to = std::clamp(from - input, 0.0f, geometry.panelHeight);
        try {
            surface->layout(geometry, to);
            if (!self->sheetInputCurrent(page, token) || self->_sheetSurface != surface ||
                self->_sheetTouchSession != session) return input;
            // Signed budget: closedward sheetDelta = remainder - input.
            return std::clamp(input + (surface->currentOffset() - from),
                              std::min(input, 0.0f), std::max(input, 0.0f));
        } catch (const std::exception& error) {
            token->revoke(); // Backend must recheck before any native write.
            self->perform([message = std::string(error.what())](auto& nav) {
                nav.closeSheet();
                nav.reportError(message);
            });
            return input;
        }
    };
    binding->end = [weak, owner, lifetime](uint64_t session, float velocity, SheetInteractionEndReason reason) {
        auto self = weak.lock();
        auto token = lifetime.lock();
        auto page = owner.lock();
        if (!self || !std::isfinite(velocity) || !self->sheetInputCurrent(page, token) ||
            self->_sheetTouchSession != session) return;
        self->_sheetTouchSession = 0; // Claim before animation/native callbacks.
        auto surface = self->_sheetSurface;
        const auto geometry = self->sheetGeometry();
        // The route iOS host snaps both ordinary ended/canceled gestures.
        // Lifecycle invalidation must not commit a dismiss using stale motion.
        const bool lifecycleCanceled = reason == SheetInteractionEndReason::LifecycleCanceled;
        const bool close = !lifecycleCanceled && (velocity > 600 ||
            (velocity >= -600 && surface->currentOffset() >= geometry.panelHeight / 2));
        self->perform([=](auto& nav) {
            if (!nav.sheetInputCurrent(page, token) || nav._sheetSurface != surface) return;
            if (close) nav.closeSheet({}, true, velocity);
            else {
                try {
                    surface->animateTo(0, lifecycleCanceled ? 0 : velocity, [weak, owner, lifetime](bool settled) {
                        auto self = weak.lock();
                        auto token = lifetime.lock();
                        if (!settled && self && self->sheetInputCurrent(owner.lock(), token))
                            self->perform([](auto& current) { current.closeSheet(); });
                    });
                } catch (...) {
                    nav.closeSheet();
                    throw;
                }
            }
        });
    };
    _sheetInputRoot = _sheetMounted->root;
    _sheetInteraction = binding;
    try { Valdi::Harmony::bindSheetInteraction(_viewManager, _sheetInputRoot, binding); }
    catch (...) {
        unbindSheetInput();
        throw;
    }
}

void HarmonyNavigator::closeSheet(const Value& value, bool canceled, float velocity) {
    requireUI();
    if (!_sheet || _sheetClosing) return;
    // One terminal claim. Invalidate callbacks BEFORE cancelAnimation/retire can
    // synchronously reenter. The original page/result/parent remain owned.
    _sheetClosing = true;
    _sheetResult = value;
    _sheetCanceled = canceled;
    const auto generation = ++_sheetGeneration;
    unbindSheetInput();
    syncNativeActions();
    auto surface = _sheetSurface;
    if (!surface || !_active || _closed) {
        finishSheet(generation, _closed);
        return;
    }
    try {
        surface->cancelAnimation();
        if (!_sheet || _sheetGeneration != generation || _sheetSurface != surface) return;
        surface->setInputEnabled(false);
        surface->setActive(_active);
        surface->animateTo(sheetGeometry().panelHeight, velocity, [weak = weak_from_this(), generation](bool) {
            if (auto self = weak.lock(); self && !self->_closed && self->_sheetClosing &&
                self->_sheetGeneration == generation)
                self->perform([generation](auto& nav) { nav.finishSheet(generation); });
        });
    } catch (...) {
        if (_sheet && _sheetGeneration == generation) finishSheet(generation);
        throw;
    }
}

bool HarmonyNavigator::afterSheet(Command command) {
    if (!_sheet) return false;
    _afterSheet.push_back(std::move(command));
    closeSheet();
    return true;
}

void HarmonyNavigator::finishSheet(uint64_t generation, bool teardown) {
    requireUI();
    if (!_sheet || generation != _sheetGeneration) return;
    // Keep ownership through unmount+panel detach, even during cancellation
    // callbacks. A stale terminal can never consume a replacement sheet.
    ++_sheetGeneration;
    auto page = _sheet;
    auto surface = _sheetSurface;
    auto value = _sheetResult;
    const bool canceled = _sheetCanceled;
    _sheetClosing = true;
    TeardownErrors errors;
    errors.run([&] { unbindSheetInput(); });
    errors.run([&] { if (surface) surface->cancelAnimation(); });
    errors.run([&] { detachPage(page); });
    errors.run([&] { if (surface) surface->retire(); });
    // Reconciliation may synchronously close the runtime. Keep the detached
    // terminal claim discoverable so close preserves an already accepted value
    // before canceling the admitted-result registry.
    _detachedSheet = page;
    _detachedSheetResult = value;
    _detachedSheetCanceled = canceled;
    _sheetMounted = nullptr;
    _sheetSurface = nullptr;
    _sheet = nullptr;
    _sheetClosing = false;
    _sheetResult = {};
    // Reconcile after detach, then result, then the JS context destruction fence.
    if (!_closed && !teardown) errors.run([&] { reconcile(); });
    errors.run([&] { retirePage(page, value, canceled); });
    if (_detachedSheet == page) {
        _detachedSheet = nullptr;
        _detachedSheetResult = {};
    }
    auto commands = std::exchange(_afterSheet, {});
    if (!_closed && !teardown) {
        for (const auto& command : commands) errors.run([&] { perform(command); });
    }
    errors.throwIfAny();
}

void HarmonyNavigator::reconcile(const std::string& reason) {
    auto next = _stack.empty() ? nullptr : front(_stack.back());
    auto previous = _mounted;
    const bool tabChange = previous != next && previous && next &&
                           !previous->shellId.empty() && previous->shellId == next->shellId;
    if (previous != next) {
        if (previous) {
            parkPage(previous);
            if (!previous->removed && previous->visible) {
                previous->visible = false;
                previous->reason = tabChange ? "tab" : "covered";
                updateViewModel(previous);
            }
        }
        _mounted = nullptr;
        if (next) {
            sizePage(next);
            mountPage(next, tabSurface(next) ? tabSurface(next) : _content);
            _mounted = next;
        }
    } else if (next && !_transition) {
        mountPage(next, tabSurface(next) ? tabSurface(next) : _content);
    }
    if (next && next->visible != _active) {
        next->visible = _active;
        next->reason = _active ? (tabChange ? "tab" : reason) : "background";
        updateViewModel(next);
    }
    reconcileSheet(reason);
}

void HarmonyNavigator::transitionTo(const PagePtr& page, const PagePtr& retiring,
                                    const Value& value, bool canceled) {
    requireUI();
    auto next = front(page);
    auto previous = _mounted;
    const auto& style = retiring ? retiring : page;
    if (!_active || !previous || !next || previous == next || style->durationMs == 0 ||
        _size.width <= 0 || _size.height <= 0) {
        remove(retiring, value, canceled);
        reconcile();
        return;
    }

    auto transition = std::make_shared<Transition>();
    transition->id = _nextTransitionId++;
    transition->outgoing = previous;
    transition->incoming = next;
    transition->retiring = retiring;
    transition->value = value;
    transition->canceled = canceled;
    _transition = transition;
    syncNativeActions();
    // The stack already identifies the logical destination. Only Transition
    // retains the outgoing root after a pop.
    try {
        // The real TabContent owns normal tab pages. Reparent its root only
        // while the existing native transition needs the two-root overlay.
        mountPage(previous, _content);
        sizePage(next);
        mountPage(next, _content);
        _mounted = next;
        if (retiring) {
            // NodeContent appends roots. Back reveals the incoming page below
            // the departing page, so reinsert the outgoing root last.
            mountPage(previous, _content, 1);
        }

        using Valdi::Harmony::RootVisualState;
        RootVisualState outgoingFrom, outgoingTo, incomingFrom, incomingTo;
        const bool back = retiring != nullptr;
        if (style->animation == "slideRight") {
            outgoingTo.translationX = back ? _size.width : -_size.width / 4;
            incomingFrom.translationX = back ? -_size.width / 4 : _size.width;
        } else if (style->animation == "slideUp") {
            if (back) outgoingTo.translationY = _size.height;
            else incomingFrom.translationY = _size.height;
        } else if (style->animation == "fade") {
            outgoingTo.opacity = 0;
            incomingFrom.opacity = 0;
        } else if (style->animation == "zoom") {
            auto& state = back ? outgoingTo : incomingFrom;
            state.scaleX = state.scaleY = 0.92f;
            state.opacity = 0;
        }
        // Install the entry pose before making the page visible to JS.
        _viewManager.setRootVisualState(previous->root, outgoingFrom);
        _viewManager.setRootVisualState(next->root, incomingFrom);
        next->visible = true;
        next->reason = "navigation";
        updateViewModel(next);

        Valdi::Harmony::NativeTweenOptions options;
        options.duration = static_cast<double>(style->durationMs) / 1000.0;
        auto animator = _viewManager.tweenRoots(
            {{previous->root, outgoingFrom, outgoingTo}, {next->root, incomingFrom, incomingTo}}, options,
            [weak = weak_from_this(), id = transition->id](bool) {
                if (auto self = weak.lock()) {
                    // Cancel/unmount can synchronously invoke this callback.
                    // An already settled/closed generation must do nothing,
                    // including emitting another observer snapshot.
                    if (!self->_closed && self->_transition && self->_transition->id == id) {
                        self->perform([id](auto& nav) { nav.finishTransition(id); });
                    }
                }
            });
        // Completion is allowed to run before tweenRoots returns.
        if (_transition == transition) transition->animator = std::move(animator);
    } catch (...) {
        finishTransition(transition->id);
        throw;
    }
}

void HarmonyNavigator::settleTransition() {
    requireUI();
    if (_transition) finishTransition(_transition->id);
}

bool HarmonyNavigator::interactiveBackEnabled() const {
    return !_closed && !_sheet && _active && _mounted && _size.width > 0 && _size.height > 0 &&
           (_stack.size() > 1 || _transition != nullptr);
}

void HarmonyNavigator::updateRootDragObserver() {
    requireUI();
    PagePtr desired;
    if (interactiveBackEnabled()) {
        // Keep the active recognizer throughout preview and its release tween.
        // Replacing it on every progress snapshot would cancel the pointer.
        if (_transition && _transition->interactive) desired = _transition->outgoing;
        else if (!_transition) desired = _mounted;
    }
    if (desired == _dragRoot) return;
    auto previous = std::exchange(_dragRoot, nullptr);
    if (previous && previous->root != nullptr) _viewManager.setRootDragObserver(previous->root, {});
    if (!desired || _closed) return;
    _dragRoot = desired;
    Valdi::Harmony::RootDragObserver observer;
    auto weak = weak_from_this();
    std::weak_ptr<Page> weakPage = desired;
    observer.admit = [weak, weakPage](float x, float y, float dx, float dy) {
        auto self = weak.lock();
        auto page = weakPage.lock();
        return self && page && self->interactiveBackEnabled() && !self->_transition &&
               self->_stack.size() > 1 && self->_mounted == page && self->_dragRoot == page &&
               std::isfinite(x) && std::isfinite(y) && std::isfinite(dx) && std::isfinite(dy) &&
               x >= 0 && x <= 24 && y >= 0 && y <= self->_size.height &&
               dx > 0 && dx > std::abs(dy);
    };
    observer.onEvent = [weak, weakPage](const Valdi::Harmony::RootDragEvent& event) {
        if (auto self = weak.lock()) {
            if (auto page = weakPage.lock()) self->rootDrag(page, event);
        }
    };
    try {
        _viewManager.setRootDragObserver(desired->root, std::move(observer));
    } catch (...) {
        _dragRoot = nullptr;
        throw;
    }
}

void HarmonyNavigator::rootDrag(const PagePtr& page, const Valdi::Harmony::RootDragEvent& event) {
    requireUI();
    if (_closed || _dragRoot != page) return;
    using Valdi::Harmony::RootGesturePhase;
    // Unmount/disposal can synchronously emit cancellation after this
    // generation was already retired. Do not notify/reenter during cleanup.
    if (event.phase != RootGesturePhase::Started &&
        (!_transition || !_transition->interactive || _transition->settling ||
         _transition->outgoing != page)) return;
    perform([&](auto& nav) {
        try {
            if (event.phase == RootGesturePhase::Started) {
                if (!nav.interactiveBackEnabled() || nav._transition || nav._mounted != page) return;
                nav.beginInteractiveBack();
            }
            auto transition = nav._transition;
            if (!transition || !transition->interactive || transition->settling || transition->outgoing != page) return;
            if (event.phase != RootGesturePhase::Cancelled) nav.progressInteractiveBack(event.dx);
            ++transition->inputEvents;
            const bool terminal = event.phase == RootGesturePhase::Ended || event.phase == RootGesturePhase::Cancelled;
            if (std::isfinite(event.dx) && std::isfinite(event.dy) &&
                (transition->inputSamples.empty() || terminal ||
                 std::abs(transition->inputSamples.back().progress - transition->progress) >= 0.1f)) {
                Transition::InputSample sample{
                    event.dx, event.dy, transition->progress,
                    std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::steady_clock::now() - transition->startedAt).count()};
                if (transition->inputSamples.size() < 8) transition->inputSamples.push_back(sample);
                else transition->inputSamples.back() = sample;
            }
            if (event.phase == RootGesturePhase::Started) nav.logInteractiveBack(transition, "start");
            if (terminal) {
                nav.endInteractiveBack(event.velocityX, event.phase == RootGesturePhase::Cancelled);
            }
        } catch (...) {
            if (nav._transition && nav._transition->interactive) nav.settleTransition();
            throw;
        }
    });
}

void HarmonyNavigator::beginInteractiveBack() {
    requireUI();
    if (!interactiveBackEnabled() || _transition || _stack.size() < 2) return;
    auto transition = std::make_shared<Transition>();
    transition->id = _nextTransitionId++;
    transition->outgoing = _mounted;
    transition->incoming = front(_stack[_stack.size() - 2]);
    transition->canceled = true;
    transition->interactive = true;
    transition->committed = false;
    transition->width = _size.width;
    transition->startedAt = std::chrono::steady_clock::now();
    transition->lastMovementAt = transition->startedAt;
    _transition = transition;
    syncNativeActions();
    try {
        auto next = transition->incoming;
        sizePage(next);
        // Inserting below leaves the active outgoing root and pointer intact.
        mountPage(next, _content, 0);
        progressInteractiveBack(0);
        // Deliberately defer incoming visible/onShow until commit. Cancel
        // leaves all contexts, result requests and lifecycle effects unchanged.
    } catch (...) {
        finishTransition(transition->id);
        throw;
    }
}

void HarmonyNavigator::progressInteractiveBack(float dx) {
    requireUI();
    auto transition = _transition;
    if (!transition || !transition->interactive || transition->settling || !std::isfinite(dx)) return;
    if (std::abs(dx - transition->lastMovementDx) >= 0.5f) {
        transition->lastMovementDx = dx;
        transition->lastMovementAt = std::chrono::steady_clock::now();
    }
    transition->progress = std::clamp(dx / transition->width, 0.0f, 1.0f);
    transition->maxProgress = std::max(transition->maxProgress, transition->progress);
    Valdi::Harmony::RootVisualState outgoing, incoming;
    outgoing.translationX = transition->width * transition->progress;
    incoming.translationX = -transition->width / 4 * (1 - transition->progress);
    _viewManager.setRootVisualState(transition->outgoing->root, outgoing);
    _viewManager.setRootVisualState(transition->incoming->root, incoming);
}

void HarmonyNavigator::endInteractiveBack(float velocityX, bool canceled) {
    requireUI();
    auto transition = _transition;
    if (!transition || !transition->interactive || transition->settling) return;
    if (!std::isfinite(velocityX)) velocityX = 0;
    transition->reportedVelocityX = velocityX;
    transition->releaseIdleMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - transition->lastMovementAt).count();
    // Some recognizers retain their last move's velocity during a held pointer.
    // A deliberate hold releases by distance; only recent motion is a flick.
    if (transition->releaseIdleMs > 120) velocityX = 0;
    // Distance admits a deliberate slow swipe. Fast forward flicks can commit
    // earlier; a decisive reverse flick cancels even beyond the distance gate.
    const bool commit = !canceled && velocityX > -700 &&
                        (transition->progress >= 0.35f ||
                         (velocityX >= 700 && transition->progress >= 0.04f));
    transition->releaseVelocityX = velocityX;
    transition->nativeCanceled = canceled;
    transition->endReason = canceled ? "nativeCancel" : velocityX <= -700 ? "reverse" :
                            commit ? (transition->progress >= 0.35f ? "distance" : "velocity") : "short";
    transition->settling = true;
    transition->committed = commit;
    if (commit) {
        transition->retiring = _stack.back();
        _stack.pop_back();
        _mounted = transition->incoming;
    }
    try {
        if (commit) {
            transition->incoming->visible = true;
            transition->incoming->reason = "navigation";
            updateViewModel(transition->incoming);
        }
        using Valdi::Harmony::RootVisualState;
        RootVisualState outgoingFrom, outgoingTo, incomingFrom, incomingTo;
        outgoingFrom.translationX = transition->width * transition->progress;
        incomingFrom.translationX = -transition->width / 4 * (1 - transition->progress);
        if (commit) outgoingTo.translationX = transition->width;
        else incomingTo.translationX = -transition->width / 4;
        const auto remaining = commit ? 1 - transition->progress : transition->progress;
        if (remaining <= 0.001f) {
            finishTransition(transition->id);
            return;
        }
        Valdi::Harmony::NativeTweenOptions options;
        options.duration = std::clamp(0.24 * remaining, 0.08, 0.24);
        auto animator = _viewManager.tweenRoots(
            {{transition->outgoing->root, outgoingFrom, outgoingTo},
             {transition->incoming->root, incomingFrom, incomingTo}}, options,
            [weak = weak_from_this(), id = transition->id](bool) {
                if (auto self = weak.lock()) {
                    if (!self->_closed && self->_transition && self->_transition->id == id) {
                        self->perform([id](auto& nav) { nav.finishTransition(id); });
                    }
                }
            });
        if (_transition == transition) transition->animator = std::move(animator);
    } catch (...) {
        finishTransition(transition->id);
        throw;
    }
}

void HarmonyNavigator::logInteractiveBack(const std::shared_ptr<Transition>& transition, const char* phase) const {
    if (!transition->interactive) return;
    std::ostringstream message;
    message << "HARMONY_INTERACTIVE_BACK={\"id\":" << transition->id
            << ",\"phase\":\"" << phase << "\",\"inputEvents\":" << transition->inputEvents
            << ",\"progress\":" << transition->progress << ",\"maxProgress\":" << transition->maxProgress
            << ",\"width\":" << transition->width;
    if (phase[0] == 'e') {
        message << ",\"committed\":" << (transition->committed ? "true" : "false")
                << ",\"canceled\":" << (transition->committed ? "false" : "true")
                << ",\"nativeCanceled\":" << (transition->nativeCanceled ? "true" : "false")
                << ",\"reason\":\"" << transition->endReason << "\",\"velocityX\":" << transition->releaseVelocityX
                << ",\"reportedVelocityX\":" << transition->reportedVelocityX
                << ",\"releaseIdleMs\":" << transition->releaseIdleMs;
    }
    message << ",\"elapsedMs\":" << std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::steady_clock::now() - transition->startedAt).count()
            << ",\"nativeSamples\":[";
    for (size_t i = 0; i < transition->inputSamples.size(); ++i) {
        if (i) message << ',';
        const auto& sample = transition->inputSamples[i];
        message << "{\"dx\":" << sample.dx << ",\"dy\":" << sample.dy << ",\"progress\":" << sample.progress
                << ",\"outgoingX\":" << transition->width * sample.progress
                << ",\"incomingX\":" << -transition->width / 4 * (1 - sample.progress)
                << ",\"elapsedMs\":" << sample.elapsedMs << '}';
    }
    message << "]}";
    OH_LOG_Print(LOG_APP, LOG_INFO, 0xFF00, "ValdiHarmony", "%{public}s", message.str().c_str());
}

void HarmonyNavigator::finishTransition(uint64_t id) {
    requireUI();
    if (!_transition || _transition->id != id) return;
    // Invalidate before cancellation: backend cancellation is synchronous and
    // calls our completion. Uncommitted previews return to the unchanged stack.
    auto transition = std::exchange(_transition, nullptr);
    std::exception_ptr error;
    const auto cleanup = [&](auto action) {
        try {
            action();
        } catch (...) {
            if (!error) error = std::current_exception();
        }
    };
    // A native failure must not prevent the remaining cancellation, result
    // completion and context retirement from running.
    cleanup([&] { if (transition->animator) transition->animator->cancel(); });
    cleanup([&] { _viewManager.cancelRootAnimations(transition->outgoing->root); });
    cleanup([&] { _viewManager.cancelRootAnimations(transition->incoming->root); });
    cleanup([&] { _viewManager.setRootVisualState(transition->outgoing->root, {}); });
    cleanup([&] { _viewManager.setRootVisualState(transition->incoming->root, {}); });
    if (transition->interactive && !transition->committed) {
        cleanup([&] { parkPage(transition->incoming); });
        _mounted = transition->outgoing;
        if (!_closed) cleanup([&] { reconcile(); });
        cleanup([&] { logInteractiveBack(transition, "end"); });
        if (error) std::rethrow_exception(error);
        return;
    }
    cleanup([&] { parkPage(transition->outgoing); });
    if (_mounted == transition->outgoing) _mounted = nullptr;
    if (!transition->retiring && !_closed && transition->outgoing->visible) {
        transition->outgoing->visible = false;
        transition->outgoing->reason = "covered";
        cleanup([&] { updateViewModel(transition->outgoing); });
    }
    cleanup([&] { remove(transition->retiring, transition->value, transition->canceled); });
    if (!_closed) cleanup([&] { reconcile(); });
    cleanup([&] { logInteractiveBack(transition, "end"); });
    if (error) std::rethrow_exception(error);
}

void HarmonyNavigator::detachPage(const PagePtr& page) {
    if (!page || page->removed) return;
    page->removed = true;
    if (_sheetMounted == page) unbindSheetInput();
    // Revoke native delivery before unmount/recognizer disposal can reenter.
    if (page->nativeIdentity) page->nativeIdentity->retire();
    if (_dragRoot == page) {
        _dragRoot = nullptr;
        try {
            _viewManager.setRootDragObserver(page->root, {});
        } catch (const std::exception& error) {
            // The weak observer is inert after _dragRoot is cleared; native
            // disposal failure must not suppress result/context retirement.
            logNativeError(error.what());
        }
    }
    TeardownErrors errors;
    if (page->native) {
        page->native->retire();
        page->native = nullptr;
    }
    if (page->root != nullptr && page->mountedContent != nullptr) {
        errors.run([&] { _viewManager.unmountRoot(page->root); });
        page->mountedContent = nullptr;
    }
    if (_mounted == page) _mounted = nullptr;
    if (_mountedTabBar == page) _mountedTabBar = nullptr;
    for (const auto& child : page->tabPages)
        errors.run([&] { detachPage(child.second); });
    errors.run([&] { detachPage(page->tabBar); });
    errors.throwIfAny();
}

void HarmonyNavigator::cancelCallerResults(const Valdi::Ref<Valdi::Context>& context) {
    std::vector<std::shared_ptr<Result>> pending;
    {
        std::lock_guard guard(_admissionMutex);
        for (const auto& [key, result] : _pendingResults) {
            if (result->callerCaptured && std::any_of(result->callerLineage.begin(), result->callerLineage.end(),
                [&](const auto& caller) { return caller.get() == context.get(); })) pending.push_back(result);
        }
    }
    for (const auto& result : pending) complete(result);
}

void HarmonyNavigator::captureResultCaller(Result& result) {
    // JS-only. Ordinary navigation functions preserve Context::current; an
    // owner-propagating wrapper can change it. Capturing the full actual chain
    // handles owned child contexts without treating another page as this caller.
    // Null means explicitly unowned; it never matches a page retirement sweep.
    auto current = Valdi::Context::currentRef();
    result.callerCaptured = current != nullptr;
    std::set<const Valdi::Context*> seen;
    while (current != nullptr) {
        if (!seen.insert(current.get()).second || seen.size() > 1024)
            throw std::runtime_error("Invalid navigation caller context lineage");
        result.callerLineage.push_back(current);
        current = current->getParent();
    }
}

void HarmonyNavigator::retirePage(const PagePtr& page, const Value& value, bool canceled) {
    if (!page || page->retired) return;
    page->retired = true;
    const auto context = page->tree != nullptr ? page->tree->getContext() : nullptr;
    if (context != nullptr) {
        // Close result admission before cancellation callbacks can reenter JS.
        // A request already admitted in another UI batch is completed now and
        // its queued command observes completed=true before creating a page.
        std::lock_guard guard(_admissionMutex);
        _retiringContexts.insert_or_assign(context.get(), Valdi::weakRef(context.get()));
    }
    TeardownErrors errors;
    if (context != nullptr) errors.run([&] { cancelCallerResults(context); });
    // Callback is queued before destruction of its caller below in a multi-pop.
    errors.run([&] { complete(page->result, value, canceled); });
    for (const auto& child : page->tabPages) {
        errors.run([&] { retirePage(child.second, {}, true); });
    }
    page->tabPages.clear();
    errors.run([&] { retirePage(page->tabBar, {}, true); });
    page->tabBar = nullptr;
    if (page->tabs) _tabSurfaces.erase(page->id);
    if (context != nullptr) {
        // A multi-pop can also remove a pushForResult caller. Destroying its
        // Context on UI now would cause Valdi to skip its queued JS callback.
        // Fence destruction through JS after the already queued result calls.
        // Runtime::destroyContext marshals back to its actual main-thread manager.
        errors.run([&] {
            _runtime->getJavaScriptRuntime()->getJsDispatchQueue()->async(
                [runtime = _runtime, context] {
                    try { runtime->destroyContext(context); }
                    catch (const std::exception& error) { logNativeError(error.what()); }
                    // destroyContext called on JS enqueues its actual UI
                    // destruction. Keep the weak admission gate until owner
                    // expiration; removing it here would race that UI task.
                });
        });
        page->tree = nullptr;
    }
    page->root = nullptr;
    errors.throwIfAny();
}

void HarmonyNavigator::remove(const PagePtr& page, const Value& value, bool canceled) {
    TeardownErrors errors;
    errors.run([&] { detachPage(page); });
    errors.run([&] { retirePage(page, value, canceled); });
    errors.throwIfAny();
}

void HarmonyNavigator::keep(size_t count) {
    if (afterSheet([count](auto& nav) { nav.keep(count); nav.reconcile(); })) return;
    settleTransition();
    count = std::max<size_t>(count, 1);
    while (_stack.size() > count) {
        auto page = _stack.back();
        _stack.pop_back();
        remove(page);
    }
}

void HarmonyNavigator::push(const std::string& route, const Value& params, const std::string& presentation,
                            const Routes::ResolvedNavigation& options, const std::shared_ptr<Result>& result) {
    const auto animation = validateOptions(presentation, options);
    settleTransition();
    const bool sheet = presentation != "push" && !_sheet;
    if (sheet) {
        if (!_sheetContent) throw std::runtime_error("Sheet NodeContent is not registered");
        _sheetCompact = presentation == "compactSheet";
    }
    auto page = entry(route, params, presentation, result, "", sheet);
    page->animation = animation.name;
    page->durationMs = animation.durationMs;
    if (sheet) {
        showSheet(page);
        return;
    }
    _stack.push_back(page);
    try {
        transitionTo(page);
    } catch (...) {
        // A native mount failure must not strand an admitted result or retain
        // an unusable destination in the committed stack.
        if (!_closed) {
            const auto found = std::find(_stack.begin(), _stack.end(), page);
            if (found != _stack.end()) _stack.erase(found);
            remove(page);
            reconcile();
        }
        throw;
    }
}

void HarmonyNavigator::replace(const std::string& route, const Value& params,
                               const Routes::ResolvedNavigation& options) {
    const auto animation = validateOptions("push", options);
    validateRoute(route);
    if (afterSheet([=](auto& nav) { nav.replace(route, params, options); })) return;
    settleTransition();
    auto page = entry(route, params);
    page->animation = animation.name;
    page->durationMs = animation.durationMs;
    if (_stack.empty()) {
        _stack.push_back(page);
    } else {
        auto old = _stack.back();
        _stack.back() = page;
        remove(old);
    }
    reconcile();
}

void HarmonyNavigator::reset(const std::string& route, const Value& params) {
    validateRoute(route);
    if (afterSheet([=](auto& nav) { nav.reset(route, params); })) return;
    settleTransition();
    auto page = entry(route, params);
    auto previous = std::move(_stack);
    _stack = {page};
    for (auto it = previous.rbegin(); it != previous.rend(); ++it) remove(*it);
    reconcile();
}

void HarmonyNavigator::goBack(size_t delta) {
    if (delta == 0) return;
    if (_sheet) {
        if (delta > 1) _afterSheet.push_back([delta](auto& nav) { nav.goBack(delta - 1); });
        closeSheet();
        return;
    }
    settleTransition();
    if (delta == 1 && _stack.size() > 1) {
        auto retiring = _stack.back();
        _stack.pop_back();
        transitionTo(_stack.back(), retiring);
    } else {
        keep(delta >= _stack.size() ? 1 : _stack.size() - delta);
        reconcile();
    }
}

void HarmonyNavigator::finish(const std::string& id, const Value& value, bool canceled) {
    if (!canceled && !value.isMap()) throw std::runtime_error("Route result must be a dictionary");
    if (_sheet && (_sheet->id == id || (_sheetMounted && _sheetMounted->id == id))) {
        closeSheet(value, canceled);
        return;
    }
    // The first finish/back already committed this pop. A second callback from
    // its still-mounted exiting page cannot consume another page or its result.
    if (_transition && _transition->retiring && _transition->retiring->id == id) return;
    auto found = std::find_if(_stack.begin(), _stack.end(), [&](const auto& page) { return page->id == id; });
    // Tab pages are retained children, never independent stack entries.
    if (found == _stack.end() || _stack.size() == 1) return;
    if (afterSheet([=](auto& nav) { nav.finish(id, value, canceled); })) return;
    // Ignore stale/retained-tab callbacks before touching an unrelated tween.
    // Settlement does not change the already committed logical stack.
    settleTransition();
    auto page = *found;
    const bool top = std::next(found) == _stack.end();
    _stack.erase(found);
    if (top) {
        transitionTo(_stack.back(), page, value, canceled);
    } else {
        remove(page, value, canceled);
        reconcile();
    }
}

void HarmonyNavigator::switchTab(const std::string& route) {
    validateTab(route);
    if (afterSheet([route](auto& nav) { nav.switchTab(route); })) return;
    settleTransition();
    auto shell = std::find_if(_stack.rbegin(), _stack.rend(), [](const auto& page) { return page->tabs; });
    if (shell == _stack.rend()) {
        auto params = object();
        params.setMapValue("tab", Value(route));
        reset(_declaration.getTabBar()->getRoute().slowToString(), params);
        return;
    }
    selectShellTab((*shell)->id, route);
}

void HarmonyNavigator::selectShellTab(const std::string& shellId, const std::string& route) {
    // A stale business callback is inert, including after a route reload that
    // happens to use the same route names and compiled component.
    const auto shell = std::find_if(_stack.begin(), _stack.end(), [&](const auto& page) {
        return page->tabs && page->id == shellId;
    });
    if (shell == _stack.end()) return;
    validateTab(route);
    if (afterSheet([=](auto& nav) { nav.selectShellTab(shellId, route); })) return;
    settleTransition();
    auto page = *shell;
    const auto previous = page->selectedTab;
    page->selectedTab = route;
    try {
        front(page);
    } catch (...) {
        page->selectedTab = previous;
        throw;
    }
    keep(static_cast<size_t>(std::distance(_stack.begin(), shell)) + 1);
    reconcile();
}

Value HarmonyNavigator::pagesValue() const {
    std::vector<Routes::StackPage> pages;
    pages.reserve(_stack.size() + (_sheet ? 1 : 0));
    for (const auto& page : _stack) {
        pages.emplace_back(Valdi::StringBox::fromString(page->id),
                           Valdi::StringBox::fromString(page->route), page->params.getMapRef());
    }
    if (_sheet) pages.emplace_back(Valdi::StringBox::fromString(_sheet->id),
        Valdi::StringBox::fromString(_sheet->route), _sheet->params.getMapRef());
    return marshalled(pages);
}

void HarmonyNavigator::currentPages(Valdi::Ref<Valdi::ValueFunction> callback) {
    auto result = std::make_shared<Result>();
    result->callback = std::move(callback);
    result->pages = true;
    captureResultCaller(*result);
    enqueue([result](auto& nav) { nav.complete(result, nav.pagesValue(), false); }, result);
}

void HarmonyNavigator::updateRoutes(const Routes::RouteDeclaration& table) {
    auto root = table.getRoot().slowToString();
    const auto& routes = table.getRoutes();
    std::map<std::string, const Routes::RouteEntry*> definitions;
    for (const auto& route : routes) {
        const auto name = route.getRoute().slowToString();
        if (name.empty() || !definitions.emplace(name, &route).second) {
            throw std::runtime_error("Empty or duplicate route: " + name);
        }
    }
    if (!definitions.count(root)) {
        throw std::runtime_error("Route declaration has no valid root");
    }
    for (const auto& route : routes) {
        auto kind = route.getKind().slowToString();
        if (kind == "valdi") {
            if (!route.getComponent() || route.getComponent()->isEmpty()) {
                throw std::runtime_error("Missing Valdi component");
            }
        } else if (kind == "native") {
            if (!route.getNativeName() || route.getNativeName()->isEmpty()) {
                throw std::runtime_error("Missing native route name");
            }
        } else if (kind != "tabs") {
            throw std::runtime_error("Invalid route kind for " + route.getRoute().slowToString());
        }
    }
    const auto& bar = table.getTabBar();
    if (bar != nullptr) {
        const auto mode = bar->getMode() ? bar->getMode()->slowToString() : "default";
        if (mode != "default" && mode != "custom") throw std::runtime_error("Unknown tab bar mode: " + mode);
        if (mode == "custom" && (!bar->getComponent() || bar->getComponent()->isEmpty())) {
            throw std::runtime_error("Custom tab bar requires a compiled business component");
        }
        if (mode == "default" && bar->getComponent()) {
            throw std::runtime_error("Default tab bar cannot declare a custom component");
        }
        const auto shell = definitions.find(bar->getRoute().slowToString());
        if (shell == definitions.end() || shell->second->getKind() != STRING_LITERAL("tabs") ||
            bar->getTabs().empty()) {
            throw std::runtime_error("Invalid tab bar declaration");
        }
        std::set<std::string> names;
        for (const auto& item : bar->getTabs()) {
            auto route = item.getRoute().slowToString();
            const auto definition = definitions.find(route);
            if (!names.insert(route).second || definition == definitions.end() ||
                definition->second->getKind() == STRING_LITERAL("tabs")) {
                throw std::runtime_error("Invalid or duplicate tab: " + route);
            }
        }
        if (!names.count(bar->getInitial().slowToString())) throw std::runtime_error("Unknown initial tab");
    }
    for (const auto& route : routes) {
        if (route.getKind() == STRING_LITERAL("tabs") &&
            (bar == nullptr || route.getRoute() != bar->getRoute())) {
            throw std::runtime_error("Tabs route requires its matching tab bar");
        }
    }
    settleTransition();
    Value rootParams = object();
    if (!_stack.empty()) {
        auto old = _stack.front();
        if (definitions.count(old->route)) {
            root = old->route;
            rootParams = old->params;
        }
        if (bar != nullptr && root == bar->getRoute().slowToString()) {
            rootParams = object();
            for (const auto& item : bar->getTabs()) {
                if (item.getRoute().toStringView() == old->selectedTab) {
                    rootParams.setMapValue("tab", Value(old->selectedTab));
                }
            }
        }
    }
    auto previous = _declaration;
    _declaration = table;
    try {
        reset(root, rootParams);
    } catch (...) {
        _declaration = previous;
        throw;
    }
}

bool HarmonyNavigator::back() {
    requireUI();
    if (_closed) return false;
    if (_sheet) {
        perform([](auto& nav) { nav.closeSheet(); });
        return true;
    }
    if (_stack.size() < 2) {
        if (!_transition) return false;
        // A repeated native back while the final page is exiting consumes the
        // in-flight exit instead of unexpectedly handing it to the ability.
        perform([](auto& nav) { nav.settleTransition(); });
        return true;
    }
    perform([](auto& nav) { nav.goBack(1); });
    return true;
}

void HarmonyNavigator::selectTab(const std::string& route) {
    perform([&](auto& nav) { nav.switchTab(route); });
}

void HarmonyNavigator::resize(Valdi::Size size) {
    requireUI();
    if (_closed || (_size.width == size.width && _size.height == size.height)) return;
    // Height-only keyboard/window resizes do not invalidate horizontal endpoints.
    // Backend Frame writes cancel only Frame tracks, not RootTransform or
    // RootOpacity. Keep those native timelines running; a slideUp keeps its
    // original offscreen endpoint and still finishes at identity.
    if (_size.width != size.width || (_transition && _transition->interactive)) settleTransition();
    _size = size;
    // Retained covered pages receive the new size too, so their next show never
    // briefly renders a stale orientation or a stale tab-bar viewport.
    std::set<const Page*> updated;
    std::function<void(const PagePtr&)> update = [&](const PagePtr& page) {
        if (!page || !updated.insert(page.get()).second) return;
        sizePage(page);
        for (const auto& [name, child] : page->tabPages) update(child);
        update(page->tabBar);
    };
    perform([&](auto&) {
        for (const auto& page : _stack) update(page);
        update(_sheet);
        layoutSheet();
        if (auto transition = _transition) {
            update(transition->outgoing);
            update(transition->incoming);
            update(transition->retiring);
        }
    });
}

void HarmonyNavigator::setInsets(NavigationInsets insets) {
    requireUI();
    for (double edge : {insets.top, insets.bottom, insets.left, insets.right, insets.tabBarHeight}) {
        if (!std::isfinite(edge) || edge < 0 || edge > 1000000) {
            throw std::invalid_argument("Navigation insets must be finite nonnegative vp in range");
        }
    }
    if (_closed || (_insets.top == insets.top && _insets.bottom == insets.bottom &&
        _insets.left == insets.left && _insets.right == insets.right &&
        _insets.tabBarHeight == insets.tabBarHeight)) return;
    perform([&](auto&) {
        _insets = insets;
        std::set<const Page*> seen;
        std::vector<PagePtr> pages;
        std::function<void(const PagePtr&)> collect = [&](const PagePtr& page) {
            if (!page || !seen.insert(page.get()).second) return;
            pages.push_back(page);
            for (const auto& [route, child] : page->tabPages) collect(child);
            collect(page->tabBar);
        };
        for (const auto& page : _stack) collect(page);
        collect(_sheet);
        if (const auto transition = _transition) {
            collect(transition->outgoing);
            collect(transition->incoming);
            collect(transition->retiring);
        }
        // Retain page/context owners across any reentrant view-model delivery.
        // No root layout/transform changes or transition settlement here.
        for (const auto& page : pages) {
            if (_closed) break;
            updateViewModel(page);
        }
        layoutSheet();
    });
}

void HarmonyNavigator::setActive(bool active) {
    perform([=](auto& nav) {
        nav._active = active;
        if (!active) nav.unbindSheetInput();
        if (nav._sheetSurface && !active) {
            auto surface = nav._sheetSurface;
            const auto generation = nav._sheetGeneration;
            surface->cancelAnimation();
            if (nav._closed || nav._sheetGeneration != generation || nav._sheetSurface != surface) return;
            if (nav._sheetClosing) nav.finishSheet(generation);
            else {
                surface->layout(nav.sheetGeometry(), 0);
                surface->setActive(false);
            }
        }
        nav.syncNativeActions();
        nav.settleTransition();
        nav.reconcile(active ? "foreground" : "background");
    });
}

Value HarmonyNavigator::navigationState() const {
    requireUI();
    auto state = object();
    const auto& bar = _declaration.getTabBar();
    state.setMapValue("tabs", bar != nullptr ? marshalled(bar->getTabs()) : Value(Valdi::ValueArray::make(0)));
    const auto page = _stack.empty() ? nullptr : _stack.back();
    const auto shell = presentedTabShell();
    state.setMapValue("selectedTab", Value(shell ? shell->selectedTab : ""));
    state.setMapValue("tabShellId", Value(shell ? shell->id : ""));
    state.setMapValue("tabBarMode", Value(customTabBar() ? "custom" : "default"));
    state.setMapValue("sheetVisible", Value(_sheet != nullptr && _active && !_closed));
    state.setMapValue("overlayVisible", Value(!_closed && (_transition ||
        (_mounted && _mounted->mountedContent == _content))));
    // The overlay retains outgoing visibility through the transition. Page
    // view models keep their own shell/system obstruction in a full viewport.
    const bool tabBarVisible = _transition ? !_transition->outgoing->shellId.empty() : page && page->tabs;
    state.setMapValue("tabBarVisible", Value(tabBarVisible && !_closed));
    state.setMapValue("canGoBack", Value((_sheet || _stack.size() > 1 || _transition != nullptr) && !_closed));
    state.setMapValue("transitioning", Value((_transition != nullptr || _sheetClosing) && !_closed));
    state.setMapValue("interactiveBackEnabled", Value(interactiveBackEnabled()));
    state.setMapValue("interactive", Value(_transition && _transition->interactive && !_closed));
    state.setMapValue("progress", Value(_transition && _transition->interactive ? _transition->progress : 0.0f));
    state.setMapValue("statusBarStyle", Value(_statusBarStyle));
    if (!_error.empty()) state.setMapValue("error", Value(_error));
    return state;
}

void HarmonyNavigator::setForegroundPageObserver(std::function<void(const std::string&)> observer) {
    requireUI();
    if (_closed) return;
    _foregroundPageObserver = std::move(observer);
    const auto identity = foregroundPageIdentity();
    _foregroundPageId = identity;
    auto callback = _foregroundPageObserver;
    if (callback) callback(identity);
}

void HarmonyNavigator::setObserver(std::function<void(const Value&)> observer) {
    requireUI();
    if (_closed) return;
    _observer = std::move(observer);
    changed();
}

void HarmonyNavigator::close(bool bestEffort) {
    requireUI();
    std::vector<std::shared_ptr<Result>> pendingResults;
    {
        std::lock_guard guard(_admissionMutex);
        if (_closed.exchange(true)) return;
        for (const auto& [key, result] : _pendingResults) pendingResults.push_back(result);
    }
    _observer = {};
    // Close can synchronously drain commands. JS permissions must be gone
    // before any result/presentation callback runs during that drain.
    syncNativeActions();
    auto foregroundObserver = std::exchange(_foregroundPageObserver, {});
    _foregroundPageId.clear();
    auto dragRoot = std::exchange(_dragRoot, nullptr);
    if (dragRoot && dragRoot->root != nullptr) {
        try {
            _viewManager.setRootDragObserver(dragRoot->root, {});
        } catch (const std::exception& error) {
            // Finish the admitted-result and context teardown even when native
            // recognizer disposal fails. The closed weak callback is inert.
            logNativeError(error.what());
        }
    }
    // drain() cannot see the remaining commands of a batch already swapped
    // into the dispatcher's local deque. Retire their requests independently
    // before the host is allowed to enqueue its runtime teardown fence.
    TeardownErrors errors;
    errors.run([&] { if (foregroundObserver) foregroundObserver(""); });
    // Terminal teardown never waits for another animation frame.
    errors.run([&] { if (_sheet) finishSheet(_sheetGeneration, true); });
    errors.run([&] { retirePage(_detachedSheet, _detachedSheetResult, _detachedSheetCanceled); });
    _detachedSheet = nullptr;
    _detachedSheetResult = {};
    _afterSheet.clear();
    errors.run([&] { settleTransition(); });
    // A finish already committed before close keeps its typed result; settling
    // above delivers it first. All remaining requests are now canceled.
    for (const auto& result : pendingResults) {
        errors.run([&] { complete(result); });
    }
    // Admission is closed before draining: no navigation command can enter
    // after this fence. Pending result/getter requests are canceled on JS.
    errors.run([&] { _dispatcher->drain(); });
    for (auto it = _stack.rbegin(); it != _stack.rend(); ++it) {
        errors.run([&] { remove(*it); });
    }
    _stack.clear();
    _mounted = nullptr;
    _mountedTabBar = nullptr;
    _tabSurfaces.clear();
    _tabBarContent = nullptr;
    _sheetContent = nullptr;
    _host = {};
    if (bestEffort) {
        if (!errors.message().empty()) logNativeError(errors.message().c_str());
    } else {
        errors.throwIfAny();
    }
}

} // namespace ValdiHarmony
