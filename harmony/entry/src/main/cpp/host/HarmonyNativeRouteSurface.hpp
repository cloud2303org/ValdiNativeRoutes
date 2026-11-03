#pragma once

#include <arkui/native_node.h>
#include <functional>
#include <memory>
#include <vector>

namespace ValdiHarmony {

// A backend CUSTOM root keeps its own measure/layout registrations. This
// adapter uses only the separate node userdata slot and an additional receiver.
// It never changes the backend's event userdata, frame or measured root size.
class HarmonyNativeRouteSurface final : public std::enable_shared_from_this<HarmonyNativeRouteSurface> {
public:
    using Defer = std::function<void(std::function<void()>)>;
    using Error = std::function<void(const char*)>;
    static std::shared_ptr<HarmonyNativeRouteSurface> create(
        ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle root,
        std::shared_ptr<void> rootOwner, Defer defer, Error error);
    ~HarmonyNativeRouteSurface();
    ArkUI_NodeHandle node(ArkUI_NodeType type);
    void append(ArkUI_NodeHandle parent, ArkUI_NodeHandle child);
    void content(ArkUI_NodeHandle node);
    void onClick(ArkUI_NodeHandle node, std::function<void()> action);
    void setInsets(float top, float bottom, float left, float right);
    void setSizePixels(int32_t width, int32_t height);
    void retire() noexcept;

private:
    struct Click;
    HarmonyNativeRouteSurface(ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle root,
                             std::shared_ptr<void> rootOwner, Defer defer, Error error);
    static void customEvent(ArkUI_NodeCustomEvent* event) noexcept;
    static void clickEvent(ArkUI_NodeEvent* event) noexcept;
    void dispose() noexcept;
    ArkUI_NativeNodeAPI_1& _api;
    ArkUI_NodeHandle _root;
    ArkUI_NodeHandle _content = nullptr;
    std::shared_ptr<void> _rootOwner;
    Defer _defer;
    Error _error;
    std::vector<ArkUI_NodeHandle> _nodes;
    std::vector<std::pair<ArkUI_NodeHandle, ArkUI_NodeHandle>> _edges;
    std::vector<std::unique_ptr<Click>> _clicks;
    bool _attached = false;
    bool _receiver = false;
    bool _retired = false;
    unsigned _callbacks = 0;
    int32_t _width = -1, _height = -1;
    void deferDisposal();
};

} // namespace ValdiHarmony
