#pragma once

#include "HarmonyBridgeModules.hpp"
#include "HarmonyMainThreadDispatcher.hpp"
#include "HarmonyResourceLoader.hpp"
#include "HarmonyNavigator.hpp"
#include "HarmonyHTTPRequestManager.hpp"
#include "HarmonyAppUIHost.hpp"
#include "HarmonyStorageHost.hpp"
#include "HarmonyOTALaunch.hpp"
#include "../business/HarmonyBusinessModules.hpp"
#include "../business/HarmonySystemServiceHosts.hpp"
#if VALDI_HARMONY_USE_FORK_UI_ASSETS
#include <ArkUIViewManager.hpp>
#else
#include "../backend/ArkUIViewManager.hpp"
#endif

#if VALDI_HARMONY_FULL_DEVELOPMENT
#include "HarmonyDevelopmentHostLease.hpp"
#endif

#include "valdi/runtime/RuntimeManager.hpp"

#include <arkui/native_node.h>
#include <napi/native_api.h>
#include <atomic>

namespace ValdiHarmony {

class HarmonyRuntimeHost {
public:
    HarmonyRuntimeHost(napi_env env,
                       napi_value content,
                       napi_value resourceManager,
                       napi_value uiContext,
                       ArkUI_NodeContentHandle nativeContent,
                       ArkUI_ContextHandle nativeUIContext,
                       Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,
                       HostConfiguration configuration,
                       napi_value appUIFeedback = nullptr,
                       napi_value systemServices = nullptr,
                       bool active = true);
    ~HarmonyRuntimeHost();

    void mount();
    void resize(HostConfiguration configuration);
    void setInsets(NavigationInsets insets);
    void setActive(bool active, HostConfiguration configuration);
    void setKeyboardHeight(double height);
    // UI only. ArkTS overlays the tab bar over a full viewport.
    bool back();
    void selectTab(const std::string& route);
    void registerTabSurface(const std::string& shellId, const std::string& route,
                            napi_value content, ArkUI_NodeContentHandle nativeContent);
    void registerTabBarSurface(napi_value content, ArkUI_NodeContentHandle nativeContent);
    void registerSheetSurface(napi_value content, ArkUI_NodeContentHandle nativeContent);
    void setSheetWindowMetrics(float fullWindowHeight, float availableViewportHeight,
                               float keyboardOverlap, float systemBottom);
    bool ownsContent(ArkUI_NodeContentHandle content) const;
    std::vector<ArkUI_NodeContentHandle> contents() const;
    Valdi::Value navigationState() const;
    void setNavigationObserver(std::function<void(const Valdi::Value&)> observer);
    // UI thread before worker teardown. Idempotent, also supports partial mount failures.
    void unmount(bool bestEffort = false);
    // Worker thread only. UI must continue pumping the dispatcher until this returns.
    void fullTeardown();
    // UI thread after fullTeardown, while the dispatcher/backend are still alive.
    void releaseOnUI();

    napi_value resourceManager() const;
    const HostConfiguration& configuration() const { return _configuration; }
    bool closing() const { return _closing; }
    ArkUI_NodeContentHandle content() const { return _content; }

private:
#if VALDI_HARMONY_FULL_DEVELOPMENT
    // Acquire before all other members; release after their final destruction.
    // Keep admission even after UI release while DestroyJob still owns us.
    HarmonyDevelopmentHostLease _developmentLease;
#endif
    napi_env _env;
    napi_ref _contentRef = nullptr;
    napi_ref _resourceManagerRef = nullptr;
    napi_ref _uiContextRef = nullptr;
    napi_ref _appUIFeedbackRef = nullptr;
    napi_ref _systemServicesRef = nullptr;
    // These surfaces can outlive their ArkTS shell after reload/reset. Keep
    // their JS owners through worker teardown, just like the primary content.
    std::map<ArkUI_NodeContentHandle, napi_ref> _tabSurfaceRefs;
    napi_ref _sheetSurfaceRef = nullptr;
    ArkUI_NodeContentHandle _sheetContent = nullptr;
    ArkUI_NodeContentHandle _content;
    ArkUI_ContextHandle _uiContext;
    Valdi::Ref<HarmonyMainThreadDispatcher> _dispatcher;
    Valdi::Ref<Valdi::ILogger> _logger;
    std::unique_ptr<Valdi::Harmony::ArkUIViewManager> _viewManager;
    Valdi::Shared<HarmonyResourceLoader> _resourceLoader;
    std::shared_ptr<HarmonyOTAProcess> _otaProcess;
    std::shared_ptr<HarmonyOTALaunch> _otaLaunch = std::make_shared<HarmonyOTALaunch>();
    std::shared_ptr<HarmonyBridgeState> _bridgeState;
    std::shared_ptr<HarmonyHTTPRequestManager> _httpManager;
    std::shared_ptr<HarmonyBusinessModules> _business;
    std::shared_ptr<HarmonySystemServiceHosts> _systemServices;
    std::shared_ptr<HarmonyAppUIHost> _appUI;
    std::shared_ptr<HarmonyStorageHost> _storage;
    Valdi::Ref<Valdi::RuntimeManager> _manager;
    Valdi::Ref<Valdi::ViewManagerContext> _viewManagerContext;
    Valdi::SharedRuntime _runtime;
    std::shared_ptr<HarmonyNavigator> _navigator;
    HostConfiguration _configuration;
    bool _active = true;
    bool _closing = false;
    std::shared_ptr<std::atomic<bool>> _workerAdmission = std::make_shared<std::atomic<bool>>(false);
    // UI only. Reentrant shell calls commit intent but never nest backend or
    // RuntimeManager lifecycle operations inside their synchronous callbacks.
    uint64_t _activityGeneration = 0;
    bool _applyingActivity = false;
    bool _backendActive = true;
    bool _managerActive = true;
    bool _navigatorActive = true;
    bool _systemServicesActive = true;

    bool activityCurrent(uint64_t generation) const;
    void applyActivity();
    void retainTabSurface(napi_value content, ArkUI_NodeContentHandle nativeContent);
};

} // namespace ValdiHarmony
