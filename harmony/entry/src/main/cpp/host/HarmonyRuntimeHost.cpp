#include "HarmonyRuntimeHost.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "HarmonyHostLifecycle.hpp"
#include "HarmonyRawfileAssetLoader.hpp"
#include "HarmonyOTAProcess.hpp"
#if VALDI_HARMONY_USE_FORK_UI_ASSETS
#include <HarmonyImageAssetLoader.hpp>
#else
#include "../assets/HarmonyImageAssetLoader.hpp"
#endif

#include "valdi/jsbridge/JavaScriptBridge.hpp"
#include "valdi/runtime/Context/ViewManagerContext.hpp"
#include "valdi/runtime/Context/ViewNodeTree.hpp"
#include "valdi/runtime/Interfaces/IDiskCache.hpp"
#include "valdi/runtime/JavaScript/JavaScriptRuntime.hpp"
#include "valdi/runtime/Resources/AssetLoaderManager.hpp"
#include "valdi/runtime/Resources/DiskCacheImpl.hpp"
#include "valdi/runtime/Resources/Bundle.hpp"
#include "valdi/runtime/Resources/ResourceManager.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"

#include <hilog/log.h>
#include <filesystem>
#include <sstream>
#include <mutex>
#include <stdexcept>
#include <utility>

namespace ValdiHarmony {
namespace {

class HilogLogger final : public Valdi::ILogger {
public:
    void setErrorObserver(std::function<void(std::string)> observer) {
        std::lock_guard guard(_mutex);
        _errorObserver = std::move(observer);
    }

    void log(Valdi::LogType type, std::string message) override {
        static constexpr LogLevel levels[] = {LOG_DEBUG, LOG_INFO, LOG_WARN, LOG_ERROR};
        const auto index = type >= Valdi::LogTypeDebug && type <= Valdi::LogTypeError
                               ? static_cast<size_t>(type) : static_cast<size_t>(Valdi::LogTypeError);
        OH_LOG_Print(LOG_APP, levels[index], 0xFF00, "ValdiHarmony", "%{public}s", message.c_str());
        if (type == Valdi::LogTypeError) {
            std::function<void(std::string)> observer;
            {
                std::lock_guard guard(_mutex);
                observer = _errorObserver;
            }
            if (observer) observer(std::move(message));
        }
    }

private:
    std::mutex _mutex;
    std::function<void(std::string)> _errorObserver;
};

void requireNapi(napi_status status, const char* message) {
    if (status != napi_ok) {
        throw std::runtime_error(message);
    }
}

} // namespace

HarmonyRuntimeHost::HarmonyRuntimeHost(napi_env env,
                                     napi_value content,
                                     napi_value resourceManager,
                                     napi_value uiContext,
                                     ArkUI_NodeContentHandle nativeContent,
                                     ArkUI_ContextHandle nativeUIContext,
                                     Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,
                                     HostConfiguration configuration,
                                     napi_value appUIFeedback,
                                     napi_value systemServices,
                                     bool active)
    : _env(env), _content(nativeContent), _uiContext(nativeUIContext), _dispatcher(std::move(dispatcher)),
      _logger(Valdi::makeShared<HilogLogger>()),
      _bridgeState(std::make_shared<HarmonyBridgeState>(configuration)),
      _configuration(std::move(configuration)), _active(active) {
    requireNapi(napi_create_reference(env, content, 1, &_contentRef), "Cannot retain NodeContent");
    if (napi_create_reference(env, resourceManager, 1, &_resourceManagerRef) != napi_ok) {
        napi_delete_reference(env, _contentRef);
        _contentRef = nullptr;
        throw std::runtime_error("Cannot retain ResourceManager");
    }
    if (napi_create_reference(env, uiContext, 1, &_uiContextRef) != napi_ok) {
        napi_delete_reference(env, _resourceManagerRef);
        napi_delete_reference(env, _contentRef);
        _resourceManagerRef = nullptr;
        _contentRef = nullptr;
        throw std::runtime_error("Cannot retain UIContext");
    }
    if (appUIFeedback != nullptr &&
        napi_create_reference(env, appUIFeedback, 1, &_appUIFeedbackRef) != napi_ok) {
        napi_delete_reference(env, _uiContextRef);
        napi_delete_reference(env, _resourceManagerRef);
        napi_delete_reference(env, _contentRef);
        _uiContextRef = _resourceManagerRef = _contentRef = nullptr;
        throw std::runtime_error("Cannot retain AppUI feedback host");
    }
    if (systemServices != nullptr &&
        napi_create_reference(env, systemServices, 1, &_systemServicesRef) != napi_ok) {
        if (_appUIFeedbackRef != nullptr) napi_delete_reference(env, _appUIFeedbackRef);
        napi_delete_reference(env, _uiContextRef);
        napi_delete_reference(env, _resourceManagerRef);
        napi_delete_reference(env, _contentRef);
        _appUIFeedbackRef = _uiContextRef = _resourceManagerRef = _contentRef = nullptr;
        throw std::runtime_error("Cannot retain system services");
    }
}

HarmonyRuntimeHost::~HarmonyRuntimeHost() {
    for (const auto& [content, reference] : _tabSurfaceRefs) napi_delete_reference(_env, reference);
    if (_sheetSurfaceRef != nullptr) napi_delete_reference(_env, _sheetSurfaceRef);
    if (_appUIFeedbackRef != nullptr) napi_delete_reference(_env, _appUIFeedbackRef);
    if (_systemServicesRef != nullptr) napi_delete_reference(_env, _systemServicesRef);
    if (_contentRef != nullptr) {
        napi_delete_reference(_env, _contentRef);
    }
    if (_resourceManagerRef != nullptr) {
        napi_delete_reference(_env, _resourceManagerRef);
    }
    if (_uiContextRef != nullptr) {
        napi_delete_reference(_env, _uiContextRef);
    }
}

napi_value HarmonyRuntimeHost::resourceManager() const {
    napi_value value = nullptr;
    requireNapi(napi_get_reference_value(_env, _resourceManagerRef, &value), "Cannot retrieve ResourceManager");
    return value;
}

void HarmonyRuntimeHost::mount() {
    const auto otaGeneration = _otaLaunch->begin();
    if (_configuration.storageRoot.empty()) {
        throw std::runtime_error("Valdi requires an app-owned persistent storage root");
    }
    std::filesystem::create_directories(_configuration.storageRoot);
    auto* nativeResources = OH_ResourceManager_InitNativeResourceManager(_env, resourceManager());
    if (nativeResources == nullptr) {
        throw std::runtime_error("ResourceManager could not be converted to NativeResourceManager");
    }
    _resourceLoader = std::make_shared<HarmonyResourceLoader>(nativeResources, _configuration.storageRoot);
    _otaProcess = _resourceLoader->otaProcess();
    if (!_otaProcess->selection()) _logger->log(Valdi::LogTypeInfo, _otaProcess->disabledReason());
    const auto profile = _resourceLoader->bootstrapProfile();
    // Fail synchronously for absent deployment artifacts; JS/render errors are
    // asynchronous and reported by the runtime's Hilog logger.
    for (const auto* name : {"valdi_core.valdimodule", "app_pages.valdimodule",
                            profile == BootstrapProfile::Business ? "harmony_business.valdimodule"
                                                                  : "harmony_smoke.valdimodule"}) {
        auto archive = _resourceLoader->loadModuleContent(Valdi::StringBox::fromCString(name));
        if (!archive) {
            throw std::runtime_error(archive.error().toString());
        }
    }
    auto fontRuntime = std::make_shared<Valdi::Weak<Valdi::Runtime>>();
    Valdi::Harmony::ArkUIConfiguration backendConfiguration;
    backendConfiguration.displayScale = static_cast<float>(_configuration.scale);
    backendConfiguration.uiContext = _uiContext;
    backendConfiguration.isUIThread = [dispatcher = _dispatcher] { return dispatcher->isUIThread(); };
    backendConfiguration.dispatchUI = [dispatcher = _dispatcher](Valdi::DispatchFunction function, bool sync) {
        dispatcher->dispatch(new Valdi::DispatchFunction(std::move(function)), sync);
    };
    backendConfiguration.reportError = [logger = _logger](const std::string& message) {
        logger->log(Valdi::LogTypeError, message);
    };
    backendConfiguration.loadFontData = [fontRuntime](const Valdi::StringBox& module,
                                                     const Valdi::StringBox& name) -> Valdi::Result<Valdi::BytesView> {
        auto valid = [](const Valdi::StringBox& value) {
            const auto text = value.toStringView();
            return !text.empty() && text != "." && text != ".." &&
                text.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-") ==
                    std::string_view::npos;
        };
        if (!valid(module) || !valid(name)) return Valdi::Error("Invalid module font identifier");
        auto runtime = fontRuntime->lock();
        if (runtime == nullptr) return Valdi::Error("Font runtime is unavailable");
        auto bundle = runtime->getResourceManager().getBundle(module);
        return bundle->getEntry(Valdi::StringBox::fromString("res/" + name.slowToString() + ".ttf"));
    };
    backendConfiguration.dispatchWorker =
        [fontRuntime, admission = _workerAdmission](Valdi::DispatchFunction function) {
            if (!admission->load(std::memory_order_acquire)) return false;
            auto runtime = fontRuntime->lock();
            if (runtime == nullptr) return false;
            try {
                runtime->getWorkerQueue()->async(std::move(function));
                return true;
            } catch (...) {
                return false;
            }
        };
    backendConfiguration.animationDiagnostics = [logger = _logger](const Valdi::Harmony::AnimationDiagnostics& value) {
        std::ostringstream message;
        message << "HARMONY_ANIMATION={\"id\":" << value.id
                << ",\"frameCount\":" << value.frameCount
                << ",\"cancelled\":" << (value.cancelled ? "true" : "false") << ",\"samples\":[";
        for (size_t i = 0; i < value.progressSamples.size(); ++i) {
            if (i != 0) message << ',';
            message << value.progressSamples[i];
        }
        message << "]}";
        logger->log(Valdi::LogTypeInfo, message.str());
    };
    _viewManager = std::make_unique<Valdi::Harmony::ArkUIViewManager>(std::move(backendConfiguration));
    if (!_viewManager || _viewManager->getPlatformType() != Valdi::PlatformTypeHarmony) {
        throw std::runtime_error("ArkUI backend must report PlatformTypeHarmony");
    }
    if (!Valdi::JavaScriptBridge::isAvailable(snap::valdi_core::JavaScriptEngineType::Auto)) {
        throw std::runtime_error("No Valdi JavaScript engine is linked");
    }
    auto diskCache = Valdi::makeShared<Valdi::DiskCacheImpl>(
        Valdi::StringBox::fromString(_configuration.storageRoot));
    _manager = Valdi::makeShared<Valdi::RuntimeManager>(
        _dispatcher, Valdi::JavaScriptBridge::get(), diskCache, nullptr, nullptr,
        Valdi::PlatformTypeHarmony, Valdi::ThreadQoSClassMax, _logger,
#if VALDI_HARMONY_FULL_DEVELOPMENT
        true, false, false, std::nullopt);
    // The maintained runtime owns both debugger services and their lifecycle.
    // Identify this app before applicationDidResume() opens the transports.
    if (!_manager->debuggerServiceEnabled()) {
        throw std::runtime_error("Full development requires the Harmony debugger service");
    }
    _manager->setApplicationId(Valdi::StringBox::fromCString(VALDI_HARMONY_APPLICATION_ID));
#else
        false, true, false, std::nullopt);
#endif
    _manager->postInit();
    _manager->getMainThreadManager().markCurrentThreadIsMainThread();
    _httpManager = std::make_shared<HarmonyHTTPRequestManager>();
    _manager->setRequestManager(_httpManager);
    _manager->registerBytesAssetLoader(diskCache);
    _viewManagerContext = _manager->createViewManagerContext(*_viewManager, false);
    _runtime = _manager->createRuntime(_resourceLoader, _configuration.scale);
#if VALDI_HARMONY_FULL_DEVELOPMENT
    _manager->attachHotReloader(_runtime);
#endif
    *fontRuntime = _runtime;
    _workerAdmission->store(true, std::memory_order_release);
    _manager->getAssetLoaderManager()->registerAssetLoader(
        Valdi::makeShared<HarmonyRawfileAssetLoader>(_resourceLoader, _runtime->getWorkerQueue()));
    _manager->getAssetLoaderManager()->registerAssetLoaderFactory(
        Valdi::makeShared<HarmonyImageAssetLoaderFactory>(_runtime->getWorkerQueue()));
    _runtime->registerNativeModuleFactory(_bridgeState->deviceFactory());
    _runtime->registerNativeModuleFactory(_bridgeState->applicationFactory());
    auto* js = _runtime->getJavaScriptRuntime();
    if (js == nullptr) {
        throw std::runtime_error("Valdi runtime did not create a JavaScript runtime");
    }
    if (_systemServicesRef != nullptr) {
        napi_value services = nullptr;
        requireNapi(napi_get_reference_value(_env, _systemServicesRef, &services),
                    "Cannot retrieve system services");
        // NAPI ownership stays on UI; the port receives the runtime's actual JS
        // queue before any business module can import a system host.
        _systemServices = HarmonySystemServiceHosts::create(
            _env, services, _dispatcher, js->getJsDispatchQueue());
        // Composed ArkTS services begin inactive. Publish the actual initial
        // foreground state on UI even when the activity drain defaults match.
        _systemServicesActive = _active;
        _systemServices->setActive(_active);
    }
    if (profile == BootstrapProfile::Business) {
        if (_systemServices == nullptr) {
            throw std::invalid_argument("Business mount requires owning UIAbility system services");
        }
        napi_value feedback = nullptr;
        if (_appUIFeedbackRef != nullptr) {
            requireNapi(napi_get_reference_value(_env, _appUIFeedbackRef, &feedback),
                        "Cannot retrieve business AppUI feedback host");
        }
        _appUI = std::make_shared<HarmonyAppUIHost>(
            _env, feedback, _dispatcher, js->getJsDispatchQueue(), _uiContext);
        _appUI->setPresentationActiveOnUI(_active);
        _storage = std::make_shared<HarmonyStorageHost>(_configuration.storageRoot);
        _business = HarmonyBusinessModules::create();
    }
    js->setDefaultViewManagerContext(_viewManagerContext);
    _manager->applicationDidResume();
    _navigator = std::make_shared<HarmonyNavigator>(
        _runtime, _viewManagerContext, *_viewManager, _content, _dispatcher,
        Valdi::Size(static_cast<float>(_configuration.width), static_cast<float>(_configuration.height)),
        makeHarmonyNativeAppUI(
            [queue = js->getJsDispatchQueue()](std::function<void()> action) {
                queue->async(std::move(action));
            },
            [weak = std::weak_ptr<HarmonyAppUIHost>(_appUI)] {
                Valdi::Ref<snap::valdi_modules::app_pages::AppUIHost> result;
                if (auto owner = weak.lock()) {
                    Valdi::SimpleExceptionTracker tracker;
                    Valdi::CppMarshaller::unmarshall(tracker, owner->hostValue(), result);
                    if (!tracker) throw std::runtime_error(tracker.extractError().toString());
                }
                return result;
            }), static_cast<float>(_configuration.scale), _uiContext);
    if (profile == BootstrapProfile::Business) {
        _navigator->setInitialRoutesAccepted(
            [weak = std::weak_ptr<HarmonyOTALaunch>(_otaLaunch), generation = otaGeneration, ota = _otaProcess] {
                if (auto launch = weak.lock()) {
                    launch->accept(generation, [ota] { ota->acceptInitialRoutes(); });
                }
            });
    }
    _navigator->setForegroundPageObserver([appUI = std::weak_ptr<HarmonyAppUIHost>(_appUI)](
                                             const std::string& pageId) {
        if (auto owner = appUI.lock()) owner->setForegroundPageOnUI(pageId);
    });
    static_cast<HilogLogger*>(_logger.get())->setErrorObserver(
        [weak = std::weak_ptr<HarmonyNavigator>(_navigator),
         launch = std::weak_ptr<HarmonyOTALaunch>(_otaLaunch)](std::string message) {
            if (auto owner = launch.lock()) owner->fail();
            if (auto navigator = weak.lock()) {
                navigator->reportRuntimeError(std::move(message));
            }
        });
    // A page may mount while hidden. Align the runtime/backend/navigation state
    // before queuing startup, as well as initializing the system port above.
    if (!_active) setActive(false, _configuration);
    if (profile == BootstrapProfile::Business) {
        Valdi::Value boot;
        boot.setMapValue("debug", Valdi::Value(static_cast<bool>(VALDI_HARMONY_APPLICATION_DEBUG)));
        boot.setMapValue("navigation", _navigator->makeNavigationHost());
        boot.setMapValue("tokens", _business->tokenStoreValue());
        boot.setMapValue("appUI", _appUI->hostValue());
        // Do not install __valdiRoutesNavigationHost before routes import:
        // startApp chooses the auth root, then bootstrap publishes its typed declaration.
        js->getJsDispatchQueue()->async(
            [runtime = _runtime, services = _systemServices, logger = _logger,
             storage = _storage->hostValue(), boot = std::move(boot),
             launch = std::weak_ptr<HarmonyOTALaunch>(_otaLaunch)]() mutable {
                try {
                    // Generated system Values and the sole Bluetooth factory
                    // are constructed on JS, with no borrowed NAPI values.
                    runtime->registerNativeModuleFactory(services->bluetoothFactory());
                    boot.setMapValue("permissions", services->permissionHostValue());
                    boot.setMapValue("wifi", services->wifiHostValue());
                    boot.setMapValue("nfc", services->nfcHostValue());
                    auto* js = runtime->getJavaScriptRuntime();
                    js->setValueToGlobalObject(STRING_LITERAL("__valdiRoutesStorageHost"), storage);
                    js->setValueToGlobalObject(STRING_LITERAL("__harmonyBusinessBootstrap"), boot);
                    js->callModuleFunction(STRING_LITERAL("harmony_business/src/app"), STRING_LITERAL("start"), nullptr);
                } catch (...) {
                    if (auto owner = launch.lock()) owner->fail();
                    logger->log(Valdi::LogTypeError, "Cannot initialize Harmony business system services");
                }
            });
    } else {
        // Preserve the smoke path and its import-time route publication.
        js->setValueToGlobalObject(STRING_LITERAL("__valdiRoutesNavigationHost"), _navigator->makeNavigationHost());
        js->callModuleFunction(STRING_LITERAL("harmony_smoke/src/app"), STRING_LITERAL("start"), nullptr);
    }
}



void HarmonyRuntimeHost::resize(HostConfiguration configuration) {
    if (_closing || _navigator == nullptr) {
        throw std::runtime_error("Cannot resize a host being destroyed");
    }
    configuration.storageRoot = _configuration.storageRoot;
    _configuration = std::move(configuration);
    // Queue the committed configuration before resize can synchronously notify
    // ArkTS, reenter resize/activity, or initiate worker teardown.
    const auto size = Valdi::Size(static_cast<float>(_configuration.width),
                                  static_cast<float>(_configuration.height));
    _runtime->getJavaScriptRuntime()->getJsDispatchQueue()->async(
        [state = _bridgeState, configuration = _configuration]() mutable {
            state->updateConfiguration(std::move(configuration));
        });
    _navigator->resize(size); // No host/runtime continuation after notification.
}

void HarmonyRuntimeHost::setInsets(NavigationInsets insets) {
    if (_closing || _navigator == nullptr) {
        throw std::runtime_error("Cannot update insets of a host being destroyed");
    }
    _navigator->setInsets(insets);
}

void HarmonyRuntimeHost::setActive(bool active, HostConfiguration configuration) {
    if (_closing) {
        throw std::runtime_error("Cannot update activity of a host being destroyed");
    }
    configuration.storageRoot = _configuration.storageRoot;
    _configuration = std::move(configuration);
    // Publish intent before any backend/manager/navigation call can run a
    // synchronous callback. A nested request supersedes this generation.
    _active = active;
    ++_activityGeneration;
    if (_applyingActivity) return;
    _applyingActivity = true;
    try {
        applyActivity();
    } catch (...) {
        _applyingActivity = false;
        throw;
    }
    _applyingActivity = false;
}

bool HarmonyRuntimeHost::activityCurrent(uint64_t generation) const {
    return !_closing && generation == _activityGeneration &&
           _runtime != nullptr && _manager != nullptr && _viewManager != nullptr &&
           _navigator != nullptr && _bridgeState != nullptr;
}

void HarmonyRuntimeHost::applyActivity() {
    while (!_closing) {
        const auto generation = _activityGeneration;
        const auto active = _active;
        if (!activityCurrent(generation)) return;
        // Queue the accepted generation before any callbacks can enqueue a
        // newer generation or the teardown fence. Tasks own their captured
        // state; they never dereference the host on the JS queue.
        _runtime->getJavaScriptRuntime()->getJsDispatchQueue()->async(
            [state = _bridgeState, configuration = _configuration, active]() mutable {
                state->updateConfiguration(std::move(configuration));
                state->setActive(active);
            });
        if (!activityCurrent(generation)) continue;
        if (_appUI != nullptr) {
            _appUI->setPresentationActiveOnUI(active);
            if (!activityCurrent(generation)) continue;
        }
        if (_systemServices != nullptr && _systemServicesActive != active) {
            _systemServicesActive = active;
            _systemServices->setActive(active);
            if (!activityCurrent(generation)) continue;
        }
        if (!active && _navigatorActive) {
            _navigatorActive = false;
            // Settle/hide page trees before suspending their backend. An
            // observer may request foreground or destroy the host here.
            _navigator->setActive(false);
            if (!activityCurrent(generation)) continue;
        }
        if (_backendActive != active) {
            _backendActive = active;
            // Suspension can cancel native animation/gesture callbacks. Nested
            // activity intent is applied only after this operation unwinds.
            _viewManager->setSuspended(!active);
            if (!activityCurrent(generation)) continue;
        }
        if (_managerActive != active) {
            _managerActive = active;
            if (active) _manager->applicationDidResume();
            else _manager->applicationWillPause();
            if (!activityCurrent(generation)) continue;
        }
        if (active && !_navigatorActive) {
            _navigatorActive = active;
            _navigator->setActive(active);
            if (!activityCurrent(generation)) continue;
        }
        return;
    }
}

bool HarmonyRuntimeHost::back() {
    return !_closing && _navigator != nullptr && _navigator->back();
}

void HarmonyRuntimeHost::setKeyboardHeight(double height) {
    if (_closing || _runtime == nullptr) return;
    _runtime->getJavaScriptRuntime()->getJsDispatchQueue()->async(
        [state = _bridgeState, height] { state->setKeyboardHeight(height); });
}

void HarmonyRuntimeHost::selectTab(const std::string& route) {
    if (!_closing && _navigator != nullptr) {
        _navigator->selectTab(route);
    }
}

void HarmonyRuntimeHost::retainTabSurface(napi_value content, ArkUI_NodeContentHandle nativeContent) {
    if (_closing || _navigator == nullptr) throw std::runtime_error("Cannot register a surface on a closing host");
    if (nativeContent == _content || nativeContent == _sheetContent)
        throw std::invalid_argument("Tab surface needs a distinct NodeContent");
    if (_tabSurfaceRefs.count(nativeContent)) return;
    napi_ref reference = nullptr;
    requireNapi(napi_create_reference(_env, content, 1, &reference), "Cannot retain tab NodeContent");
    try {
        _tabSurfaceRefs.emplace(nativeContent, reference);
    } catch (...) {
        napi_delete_reference(_env, reference);
        throw;
    }
}

void HarmonyRuntimeHost::registerTabSurface(const std::string& shellId, const std::string& route,
                                           napi_value content, ArkUI_NodeContentHandle nativeContent) {
    retainTabSurface(content, nativeContent);
    _navigator->registerTabSurface(shellId, route, nativeContent);
}

void HarmonyRuntimeHost::registerTabBarSurface(napi_value content, ArkUI_NodeContentHandle nativeContent) {
    retainTabSurface(content, nativeContent);
    _navigator->registerTabBarSurface(nativeContent);
}

void HarmonyRuntimeHost::registerSheetSurface(napi_value content, ArkUI_NodeContentHandle nativeContent) {
    if (_closing || !_navigator) throw std::runtime_error("Cannot register a sheet on a closing host");
    if (!nativeContent || nativeContent == _content || _tabSurfaceRefs.count(nativeContent))
        throw std::invalid_argument("Sheet needs a dedicated NodeContent");
    if (_sheetContent && _sheetContent != nativeContent)
        throw std::invalid_argument("Sheet NodeContent is already registered");
    if (!_sheetSurfaceRef) {
        napi_ref reference = nullptr;
        requireNapi(napi_create_reference(_env, content, 1, &reference), "Cannot retain sheet NodeContent");
        // Publish retention before calling navigation: failures after native
        // mutation still reserve this surface through the DestroyJob fence.
        _sheetSurfaceRef = reference;
        _sheetContent = nativeContent;
    }
    _navigator->registerSheetSurface(nativeContent);
}

void HarmonyRuntimeHost::setSheetWindowMetrics(float fullWindowHeight, float availableViewportHeight,
                                              float keyboardOverlap, float systemBottom) {
    if (_closing || !_navigator) return;
    _navigator->setSheetWindowMetrics(fullWindowHeight, availableViewportHeight, keyboardOverlap, systemBottom);
}

bool HarmonyRuntimeHost::ownsContent(ArkUI_NodeContentHandle content) const {
    return content == _content || content == _sheetContent || _tabSurfaceRefs.count(content) != 0;
}

std::vector<ArkUI_NodeContentHandle> HarmonyRuntimeHost::contents() const {
    std::vector<ArkUI_NodeContentHandle> result{_content};
    for (const auto& [content, reference] : _tabSurfaceRefs) result.push_back(content);
    if (_sheetContent) result.push_back(_sheetContent);
    return result;
}

Valdi::Value HarmonyRuntimeHost::navigationState() const {
    if (_navigator != nullptr) return _navigator->navigationState();
    auto state = Valdi::Value(Valdi::makeShared<Valdi::ValueMap>());
    state.setMapValue("tabs", Valdi::Value(Valdi::ValueArray::make(0)));
    state.setMapValue("selectedTab", Valdi::Value(""));
    state.setMapValue("tabShellId", Valdi::Value(""));
    state.setMapValue("tabBarMode", Valdi::Value("default"));
    state.setMapValue("overlayVisible", Valdi::Value(false));
    for (const auto* key : {"sheetVisible", "tabBarVisible", "canGoBack", "transitioning",
                            "interactiveBackEnabled", "interactive"}) {
        state.setMapValue(key, Valdi::Value(false));
    }
    state.setMapValue("progress", Valdi::Value(0.0));
    state.setMapValue("statusBarStyle", Valdi::Value("auto"));
    return state;
}

void HarmonyRuntimeHost::setNavigationObserver(std::function<void(const Valdi::Value&)> observer) {
    if (!_closing && _navigator != nullptr) {
        _navigator->setObserver(std::move(observer));
    }
}

void HarmonyRuntimeHost::unmount(bool bestEffort) {
    _otaLaunch->close(); // Invalidate native startup acknowledgement before any reentry.
    _workerAdmission->store(false, std::memory_order_release);
    if (_closing) {
        return;
    }
    _closing = true;
    _active = false;
    ++_activityGeneration; // Invalidate callbacks before UI/worker teardown.
    TeardownErrors errors;
    errors.run([&] { static_cast<HilogLogger*>(_logger.get())->setErrorObserver({}); });
    // Close shell admission before navigation drains UI dispatch and before the
    // worker is allowed to enqueue the JS cleanup fence.
    errors.run([&] { if (_appUI != nullptr) _appUI->closeOnUI(); });
    // The port closes UI admission and queues shutdownOnJS now, ahead of
    // navigator->close() queuing destruction of any retained page contexts.
    // fullTeardown also fences its idempotent JS shutdown before manager teardown.
    errors.run([&] { if (_systemServices != nullptr) _systemServices->closeOnUI(); });
    if (_appUIFeedbackRef != nullptr) {
        napi_delete_reference(_env, _appUIFeedbackRef);
        _appUIFeedbackRef = nullptr;
    }
    errors.run([&] { if (_navigator != nullptr) _navigator->close(bestEffort); });
    errors.run([&] { if (_viewManager != nullptr) _viewManager->setSuspended(true); });
    errors.run([&] { if (_httpManager != nullptr) _httpManager->shutdown(); });
    errors.throwIfAny();
}

void HarmonyRuntimeHost::fullTeardown() {
    TeardownErrors errors;
    if (_runtime != nullptr && _runtime->getJavaScriptRuntime() != nullptr) {
        // Release JS-backed observers on their own queue while its context is
        // still alive. UI dispatch remains available to this synchronous fence.
        errors.run([&] {
            _runtime->getJavaScriptRuntime()->getJsDispatchQueue()->safeSync(
                [&errors, state = _bridgeState, business = _business, appUI = _appUI,
                 storage = _storage, services = _systemServices] {
                    // Do not throw through a JS queue task. safeSync fences
                    // these collected errors before the worker reports them.
                    errors.run([&] { if (appUI != nullptr) appUI->shutdownOnJS(); });
                    errors.run([&] { if (services != nullptr) services->shutdownOnJS(); });
                    errors.run([&] { if (business != nullptr) business->shutdown(); });
                    errors.run([&] { if (storage != nullptr) storage->shutdownOnJS(); });
                    errors.run([&] { state->clearObservers(); });
                });
        });
    }
    errors.run([&] { if (_manager != nullptr) _manager->fullTeardown(); });
    errors.throwIfAny();
}

void HarmonyRuntimeHost::releaseOnUI() {
    _otaLaunch->close();
    _workerAdmission->store(false, std::memory_order_release);
    _closing = true;
    ++_activityGeneration;
    TeardownErrors errors;
    errors.run([&] { _dispatcher->drain(); });
    errors.run([&] { if (_systemServices != nullptr) _systemServices->releaseOnUI(); });
    if (_systemServicesRef != nullptr) {
        napi_delete_reference(_env, _systemServicesRef);
        _systemServicesRef = nullptr;
    }
    _navigator = nullptr;
    _runtime = nullptr;
    _manager = nullptr;
    _viewManagerContext = nullptr;
    if (_viewManager != nullptr) {
        errors.run([&] { _viewManager->shutdown(); });
    }
    _viewManager = nullptr;
    errors.run([&] { _bridgeState->clearObservers(); });
    _bridgeState = nullptr;
    _resourceLoader = nullptr;
    _otaProcess = nullptr; // The process owner retains selection/HTTP across host remounts.
    _httpManager = nullptr;
    _business = nullptr;
    _systemServices = nullptr;
    _appUI = nullptr;
    _storage = nullptr;
    errors.throwIfAny();
}

} // namespace ValdiHarmony
