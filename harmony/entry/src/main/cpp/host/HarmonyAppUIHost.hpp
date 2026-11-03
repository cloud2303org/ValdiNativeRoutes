#pragma once

#include "HarmonyMainThreadDispatcher.hpp"
#include "HarmonyNativeAppUIPresenter.hpp"
#include "HarmonyPendingAppUIRequest.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include <napi/native_api.h>
#include <atomic>
#include <functional>
#include <map>
#include <memory>
#include <stdexcept>

namespace ValdiHarmony {
class HarmonyGeneratedAppUIProxy;

// Per runtime. Official generated c+ methods return Futures. NAPI work is UI-only;
// Promise state and Context pins live on JS through terminal/shutdown delivery.
class HarmonyAppUIHost final : public std::enable_shared_from_this<HarmonyAppUIHost> {
public:
    HarmonyAppUIHost(napi_env env, napi_value feedback,
                     Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,
                     Valdi::Ref<Valdi::DispatchQueue> jsQueue,
                     ArkUI_ContextHandle uiContext = nullptr);
    ~HarmonyAppUIHost();
    Valdi::Value hostValue();
    void closeOnUI();
    void shutdownOnJS();
    void cancelPresentationsOnUI();
    void setForegroundPageOnUI(std::string pageId);
    void setPresentationActiveOnUI(bool active);

private:
    friend class HarmonyGeneratedAppUIProxy;
    struct ShowLoading {
        std::string title;
        bool mask;
    };
    struct HideLoading {};
    struct ShowToast {
        std::string title, icon;
        double duration;
        bool mask;
    };
    struct HideToast {};
    struct ScanCode {};
    struct PickAttachments {
        std::string source;
        double limit;
        std::vector<std::string> mimeTypes;
    };
    struct ClearAttachmentCache {};
    // Describes only the reply parser, never selects an SDK method.
    enum class MediaResultKind { Scan, Selection, Void };
    template<typename T, typename Prepare>
    Valdi::Future<T> submit(Prepare prepare) {
        Valdi::TypedPromise<T> promise;
        auto future = promise.getFuture();
        if (_closed) { promise.setError(Valdi::Error("E_APP_UI_CLOSED:host is closing")); return future; }
        if (_pending.size() >= 64 || _nextId == UINT64_MAX) {
            promise.setError(Valdi::Error("E_APP_UI_CAPACITY:too many pending requests")); return future;
        }
        const auto id = _nextId++;
        try {
            auto call = prepare(); // Explicit DTO adapter; no map/schema validation.
            _pending.emplace(id, HarmonyPendingAppUIRequest(promise));
            _dispatcher->dispatch(new Valdi::DispatchFunction(
                [weak = weak_from_this(), id, call = std::move(call)]() mutable {
                    if (auto self = weak.lock(); self && !self->_closed) self->performOnUI(id, std::move(call));
                }), false);
        } catch (...) {
            auto entry = _pending.find(id);
            if (entry != _pending.end()) {
                auto pending = std::move(entry->second); _pending.erase(entry);
                pending.finish(HarmonyNativeAppUIError{"E_APP_UI_NATIVE:request exceeds native resource bounds"});
            } else promise.setError(Valdi::Error("E_APP_UI_NATIVE:request exceeds native resource bounds"));
        }
        return future;
    }
    void performOnUI(uint64_t id, HarmonyNativeAppUIRequest request);
    void performOnUI(uint64_t id, ShowLoading call);
    void performOnUI(uint64_t id, HideLoading call);
    void performOnUI(uint64_t id, ShowToast call);
    void performOnUI(uint64_t id, HideToast call);
    void performOnUI(uint64_t id, ScanCode call);
    void performOnUI(uint64_t id, PickAttachments call);
    void performOnUI(uint64_t id, ClearAttachmentCache call);
    using PrepareArguments = std::function<std::vector<napi_value>()>;
    void feedbackOnUI(uint64_t id, const char* method, bool requiresForeground, const PrepareArguments& prepare);
    void mediaOnUI(uint64_t id, const char* method, MediaResultKind resultKind, const PrepareArguments& prepare);
    void updateMediaOwnerOnUI();
    void closeMediaOnUI();
    struct MediaCallback;
    static napi_value mediaResult(napi_env env, napi_callback_info info);
    napi_value mediaFunction(uint64_t id, MediaResultKind kind, bool reject, const std::shared_ptr<bool>& settled);
    void completeOnUI(uint64_t id, HarmonyNativeAppUIResult result);
    void finishOnJS(uint64_t id, const HarmonyNativeAppUIResult& result);
    struct FeedbackCallback;
    static napi_value feedbackResult(napi_env env, napi_callback_info info);
    napi_value feedbackFunction(uint64_t id, bool reject, const std::shared_ptr<bool>& settled);

    napi_env _env;
    napi_ref _feedback = nullptr;
    napi_ref _media = nullptr; // UI only, per RuntimeHost; no process-wide host.
    Valdi::Ref<HarmonyMainThreadDispatcher> _dispatcher;
    Valdi::Ref<Valdi::DispatchQueue> _jsQueue;
    ArkUI_ContextHandle _uiContext = nullptr;
    std::unique_ptr<HarmonyNativeAppUIPresenter> _nativePresenter;
    bool _presentationActive = true;
    std::string _foregroundPageId;
    std::atomic<bool> _closed{false};
    uint64_t _nextId = 1;
    std::map<uint64_t, HarmonyPendingAppUIRequest> _pending; // JS only.
};
} // namespace ValdiHarmony
