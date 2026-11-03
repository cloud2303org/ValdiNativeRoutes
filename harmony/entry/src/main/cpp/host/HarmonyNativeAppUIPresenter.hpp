#pragma once

#include <arkui/native_type.h>

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
#include <variant>

namespace ValdiHarmony {

struct HarmonyNativeModalReply {
    bool confirm = false;
    bool cancel = false;
    std::string content;
};
struct HarmonyNativePresentationReply {
    bool confirm = false;
    bool cancel = false;
    std::string value;
    int32_t index = -1;
};
struct HarmonyNativeAppUIError { std::string message; };
struct HarmonyNativeScanReply { std::string result, scanType; };
struct HarmonyNativeAttachmentAsset {
    std::string id, uri, name, mimeType;
    double size = 0;
};
struct HarmonyNativeAttachmentSelection {
    bool canceled = false;
    std::vector<HarmonyNativeAttachmentAsset> assets;
};
using HarmonyNativeAppUIResult = std::variant<std::monostate, HarmonyNativeModalReply,
    HarmonyNativePresentationReply, HarmonyNativeAppUIError,
    HarmonyNativeScanReply, HarmonyNativeAttachmentSelection>;
enum class HarmonyNativeAppUIKind { Modal, ActionSheet, Picker, DatePicker, BottomSheet, ImagePreview };

// Plain owned data only. No Valdi Context, JS function, NAPI value, JSON, or
// mutable JS-owned map crosses into the native UI queue.
struct HarmonyNativeAppUIRequest {
    struct Option { std::string value; std::string label; };
    uint64_t id = 0;
    HarmonyNativeAppUIKind kind = HarmonyNativeAppUIKind::Modal;
    std::string title, content, confirmText, cancelText, placeholderText, defaultText;
    bool showCancel = false;
    bool editable = false;
    bool dismissible = true;
    std::vector<std::string> items, urls;
    std::vector<Option> options;
    std::string value, mode, current;
    int minYear = 1000;
    int maxYear = 9999;
};

// Read the committed logical page, never the mounted/preview root. Selected
// tab children must already exist; observing identity must not create a tree.
template<typename PagePtr>
std::string appUIForegroundPageIdentity(const std::vector<PagePtr>& stack, bool closed = false) {
    if (closed || stack.empty()) return {};
    auto page = stack.back();
    while (page && !page->removed && page->tabs) {
        const auto child = page->tabPages.find(page->selectedTab);
        if (child == page->tabPages.end()) return {};
        page = child->second;
    }
    return page && !page->removed ? page->id : std::string();
}

// All methods, destruction, SDK calls and callbacks run on the owning UI thread.
// uiContext is borrowed: the caller retains its NAPI/UIContext owner until
// shutdown() returns. PostUI MUST enqueue asynchronously (never call inline).
// Native custom content in a system-managed dialog; not AlertDialog styling.
class HarmonyNativeAppUIPresenter final {
public:
    using PostUI = std::function<void(std::function<void()>)>;
    using Completion = std::function<void(uint64_t, HarmonyNativeAppUIResult)>;

    HarmonyNativeAppUIPresenter(ArkUI_ContextHandle uiContext, PostUI postUI, Completion completion);
    ~HarmonyNativeAppUIPresenter();
    HarmonyNativeAppUIPresenter(const HarmonyNativeAppUIPresenter&) = delete;
    HarmonyNativeAppUIPresenter& operator=(const HarmonyNativeAppUIPresenter&) = delete;

    // Requests are owned snapshots adapted from generated, business-validated DTOs.
    void present(HarmonyNativeAppUIRequest request);
    void setForegroundPage(std::string pageId); // Logical committed page identity.
    void cancelPending(); // Owner/page removed. Completes with cancel after close.
    void shutdown();      // Cancels once, unregisters/disposes before context release.

private:
    struct State;
    std::shared_ptr<State> _state;
};

} // namespace ValdiHarmony
