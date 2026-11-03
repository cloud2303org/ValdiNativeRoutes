#pragma once

#include "HarmonyMainThreadDispatcher.hpp"
#include "HarmonyNativeScreens.hpp"
#include "HarmonySheetSurface.hpp"
#if VALDI_HARMONY_USE_FORK_UI_ASSETS
#include <ArkUIViewManager.hpp>
#include <SheetInteraction.hpp>
#else
#include "../backend/ArkUIViewManager.hpp"
#include "../backend/SheetInteraction.hpp"
#endif
#include "valdi/runtime/Runtime.hpp"
#include "valdi_core/cpp/Utils/ValueFunction.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

#include <atomic>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <vector>

namespace ValdiHarmony {

struct NavigationInsets {
    double top = 0;
    double bottom = 0;
    double left = 0;
    double right = 0;
    double tabBarHeight = 0;
};

// Navigation state and views are confined to UI. Only enqueue() and callback
// delivery cross queues; JS functions never synchronously wait on UI.
class HarmonyNavigator : public std::enable_shared_from_this<HarmonyNavigator> {
public:
    HarmonyNavigator(Valdi::SharedRuntime runtime,
                     Valdi::Ref<Valdi::ViewManagerContext> viewManagerContext,
                     Valdi::Harmony::ArkUIViewManager& viewManager,
                     ArkUI_NodeContentHandle content,
                     Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,
                     Valdi::Size size,
                     HarmonyNativeAppUI nativeAppUI = {},
                     float nativeScale = 1,
                     ArkUI_ContextHandle uiContext = nullptr);
    Valdi::Value makeNavigationHost();
    void resize(Valdi::Size size);
    void setInsets(NavigationInsets insets);
    void setActive(bool active);
    bool back();
    void selectTab(const std::string& route);
    // Shell IDs reject stale ArkTS callbacks after route reload/reset.
    void registerTabSurface(const std::string& shellId, const std::string& route,
                            ArkUI_NodeContentHandle content);
    void registerTabBarSurface(ArkUI_NodeContentHandle content);
    void registerSheetSurface(ArkUI_NodeContentHandle content);
    void setSheetWindowMetrics(float fullWindowHeight, float availableViewportHeight,
                               float keyboardOverlap, float systemBottom);
    Valdi::Value navigationState() const;
    void setObserver(std::function<void(const Valdi::Value&)> observer);
    // UI-only native hook. Runs once after successful FIRST admitted updateRoutes
    // + changed(), provided no newer publication was admitted during reentry.
    void setInitialRoutesAccepted(std::function<void()> accepted);
    // UI-only committed logical foreground identity; does not create tab pages
    // and does not follow interactive preview/mounted roots.
    void setForegroundPageObserver(std::function<void(const std::string&)> observer);
    // May be called by the runtime logger from any thread.
    void reportRuntimeError(std::string message);
    void close(bool bestEffort);

private:
    struct Result;
    struct Page;
    struct Transition;
    using PagePtr = std::shared_ptr<Page>;
    using Command = std::function<void(HarmonyNavigator&)>;

    Valdi::SharedRuntime _runtime;
    Valdi::Ref<Valdi::ViewManagerContext> _viewManagerContext;
    Valdi::Harmony::ArkUIViewManager& _viewManager;
    ArkUI_NodeContentHandle _content;
    Valdi::Ref<HarmonyMainThreadDispatcher> _dispatcher;
    Valdi::Size _size;
    HarmonyNativeScreens _nativeScreens;
    HarmonyNativeAppUI _nativeAppUI;
    float _nativeScale;
    ArkUI_ContextHandle _uiContext;
    NavigationInsets _insets;
    Valdi::Value _host;
    snap::valdi_modules::app_pages::RouteDeclaration _declaration;
    std::vector<PagePtr> _stack;
    PagePtr _mounted;
    // The sheet is not a stack entry. Ownership remains until native detach,
    // including during terminal animation and while base navigation changes.
    PagePtr _sheet;
    PagePtr _sheetMounted;
    ArkUI_NodeContentHandle _sheetContent = nullptr;
    std::shared_ptr<HarmonySheetSurface> _sheetSurface;
    std::shared_ptr<Valdi::Harmony::SheetInteractionBinding> _sheetInteraction;
    Valdi::Ref<Valdi::View> _sheetInputRoot;
    uint64_t _sheetTouchSession = 0;
    uint64_t _sheetGeneration = 0;
    bool _sheetClosing = false;
    bool _sheetCompact = false;
    Valdi::Value _sheetResult;
    bool _sheetCanceled = true;
    PagePtr _detachedSheet;
    Valdi::Value _detachedSheetResult;
    bool _detachedSheetCanceled = true;
    float _fullWindowHeight = 0;
    float _sheetViewportHeight = 0;
    float _keyboardOverlap = 0;
    float _sheetSystemBottom = 0;
    std::vector<Command> _afterSheet;
    // Admission gate while caller contexts await the JS retirement fence.
    std::map<const Valdi::Context*, Valdi::Weak<Valdi::Context>> _retiringContexts; // admission mutex
    std::shared_ptr<Transition> _transition;
    PagePtr _dragRoot;
    uint64_t _nextId = 1;
    uint64_t _nextTransitionId = 1;
    bool _active = true;
    std::atomic<bool> _closed{false};
    std::mutex _admissionMutex;
    // Independent of the dispatcher's current drain batch: close must deliver
    // every admitted result before RuntimeHost can enqueue its teardown fence.
    std::map<const Result*, std::shared_ptr<Result>> _pendingResults;
    uint64_t _routePublications = 0; // Protected by _admissionMutex, including JS admission.
    std::function<void()> _initialRoutesAccepted; // UI; no JS owners.
    std::function<void(const Valdi::Value&)> _observer;
    std::function<void(const std::string&)> _foregroundPageObserver;
    std::string _foregroundPageId;
    std::string _statusBarStyle = "auto";
    std::string _error;
    std::map<std::string, std::map<std::string, ArkUI_NodeContentHandle>> _tabSurfaces;
    ArkUI_NodeContentHandle _tabBarContent = nullptr;
    PagePtr _mountedTabBar;

    void enqueue(Command command, const std::shared_ptr<Result>& failureResult = nullptr,
                 bool routePublication = false);
    void perform(const Command& command);
    void changed();
    std::string foregroundPageIdentity() const;
    void notifyForegroundPage();
    void reportError(const std::string& message);
    void complete(const std::shared_ptr<Result>& result, Valdi::Value value = {}, bool canceled = true);
    void currentPages(Valdi::Ref<Valdi::ValueFunction> callback);
    void updateRoutes(const snap::valdi_modules::app_pages::RouteDeclaration& declaration);
    const snap::valdi_modules::app_pages::RouteEntry* routeDefinition(const std::string& route) const;
    void validateRoute(const std::string& route) const;
    void validateTab(const std::string& route) const;
    PagePtr entry(const std::string& route, const Valdi::Value& params,
                  const std::string& presentation = "push",
                  const std::shared_ptr<Result>& result = nullptr,
                  const std::string& shellId = "", bool sheetPage = false);
    PagePtr front(const PagePtr& page);
    void createTree(const PagePtr& page);
    void createNative(const PagePtr& page, const snap::valdi_modules::app_pages::RouteEntry& definition);
    void sizePage(const PagePtr& page);
    bool nativeActionAllowed(const PagePtr& page) const;
    void syncNativeActions();
    Valdi::Value viewModel(const PagePtr& page) const;
    void updateViewModel(const PagePtr& page);
    bool customTabBar() const;
    PagePtr tabShell(const std::string& id) const;
    PagePtr presentedTabShell() const;
    ArkUI_NodeContentHandle tabSurface(const PagePtr& page) const;
    void mountPage(const PagePtr& page, ArkUI_NodeContentHandle content, int index = -1);
    void parkPage(const PagePtr& page);
    void reconcileTabBar();
    void selectShellTab(const std::string& shellId, const std::string& route);
    void reconcile(const std::string& reason = "navigation");
    void transitionTo(const PagePtr& page, const PagePtr& retiring = nullptr,
                      const Valdi::Value& value = {}, bool canceled = true);
    void settleTransition();
    void finishTransition(uint64_t id);
    bool interactiveBackEnabled() const;
    void updateRootDragObserver();
    void rootDrag(const PagePtr& page, const Valdi::Harmony::RootDragEvent& event);
    void beginInteractiveBack();
    void progressInteractiveBack(float dx);
    void endInteractiveBack(float velocityX, bool canceled);
    void logInteractiveBack(const std::shared_ptr<Transition>& transition, const char* phase) const;
    HarmonySheetGeometry sheetGeometry() const;
    void showSheet(const PagePtr& page);
    void layoutSheet();
    void reconcileSheet(const std::string& reason);
    void closeSheet(const Valdi::Value& value = {}, bool canceled = true, float velocity = 0);
    void finishSheet(uint64_t generation, bool teardown = false);
    bool afterSheet(Command command);
    void detachPage(const PagePtr& page);
    void retirePage(const PagePtr& page, const Valdi::Value& value, bool canceled);
    void cancelCallerResults(const Valdi::Ref<Valdi::Context>& context);
    static void captureResultCaller(Result& result);
    void bindSheetInput();
    void unbindSheetInput();
    bool sheetInputCurrent(const PagePtr& page,
        const std::shared_ptr<Valdi::Harmony::SheetInteractionLifetime>& token) const;
    void remove(const PagePtr& page, const Valdi::Value& value = {}, bool canceled = true);
    void keep(size_t count);
    void reset(const std::string& route, const Valdi::Value& params);
    void push(const std::string& route, const Valdi::Value& params, const std::string& presentation,
              const snap::valdi_modules::app_pages::ResolvedNavigation& options,
              const std::shared_ptr<Result>& result);
    void replace(const std::string& route, const Valdi::Value& params,
                 const snap::valdi_modules::app_pages::ResolvedNavigation& options);
    void goBack(size_t delta);
    void switchTab(const std::string& route);
    void finish(const std::string& id, const Valdi::Value& value, bool canceled);
    Valdi::Value pagesValue() const;
    void requireUI() const;
};

} // namespace ValdiHarmony
