#include "HarmonyNativeRouteSurface.hpp"

#include <arkui/native_interface.h>
#include <stdexcept>
#include <utility>

namespace ValdiHarmony {
namespace {
void check(int32_t status) {
    if (status != ARKUI_ERROR_CODE_NO_ERROR) throw std::runtime_error("Native route ArkUI operation failed");
}
ArkUI_NativeNodeAPI_1* nodeAPI() {
    return static_cast<ArkUI_NativeNodeAPI_1*>(
        OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
}
}

struct HarmonyNativeRouteSurface::Click {
    std::weak_ptr<HarmonyNativeRouteSurface> owner;
    std::function<void()> action;
    ArkUI_NodeHandle node;
    bool receiver = false;
    bool registered = false;
};

HarmonyNativeRouteSurface::HarmonyNativeRouteSurface(
    ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle root, std::shared_ptr<void> rootOwner,
    Defer defer, Error error)
    : _api(api), _root(root), _rootOwner(std::move(rootOwner)),
      _defer(std::move(defer)), _error(std::move(error)) {}

std::shared_ptr<HarmonyNativeRouteSurface> HarmonyNativeRouteSurface::create(
    ArkUI_NativeNodeAPI_1& api, ArkUI_NodeHandle root, std::shared_ptr<void> rootOwner,
    Defer defer, Error error) {
    if (!root || !rootOwner || !defer) throw std::runtime_error("Native route needs an owned backend root");
    // Checked in both actual backends: Node uses registerNodeCustomEvent
    // userdata, never setUserData. Fail closed if that contract ever changes.
    if (api.getUserData(root)) throw std::runtime_error("Native route root userdata is already owned");
    auto surface = std::shared_ptr<HarmonyNativeRouteSurface>(
        new HarmonyNativeRouteSurface(api, root, std::move(rootOwner), std::move(defer), std::move(error)));
    check(api.setUserData(root, surface.get()));
    try {
        check(api.addNodeCustomEventReceiver(root, customEvent));
        surface->_receiver = true;
    } catch (...) {
        api.setUserData(root, nullptr);
        throw;
    }
    return surface;
}

HarmonyNativeRouteSurface::~HarmonyNativeRouteSurface() {
    // Owners explicitly retire while the backend and UI dispatcher are alive.
    // Also covers construction failures before publication.
    dispose();
}

ArkUI_NodeHandle HarmonyNativeRouteSurface::node(ArkUI_NodeType type) {
    auto result = _api.createNode(type);
    if (!result) throw std::runtime_error("Could not allocate native route control");
    _nodes.push_back(result);
    return result;
}

void HarmonyNativeRouteSurface::append(ArkUI_NodeHandle parent, ArkUI_NodeHandle child) {
    check(_api.addChild(parent, child));
    _edges.emplace_back(parent, child);
}

void HarmonyNativeRouteSurface::content(ArkUI_NodeHandle node) {
    if (_content) throw std::runtime_error("Native route content already attached");
    append(_root, node);
    _content = node;
    _attached = true;
    _api.markDirty(_root, NODE_NEED_MEASURE);
}

void HarmonyNativeRouteSurface::onClick(ArkUI_NodeHandle node, std::function<void()> action) {
    auto click = std::make_unique<Click>();
    click->owner = weak_from_this();
    click->node = node;
    click->action = std::move(action);
    auto* pointer = click.get();
    _clicks.push_back(std::move(click));
    check(_api.addNodeEventReceiver(node, clickEvent));
    pointer->receiver = true;
    check(_api.registerNodeEvent(node, NODE_ON_CLICK, 0, pointer));
    pointer->registered = true;
}

void HarmonyNativeRouteSurface::setInsets(float top, float bottom, float left, float right) {
    if (!_content || _retired) return;
    ArkUI_NumberValue values[] = {{.f32 = top}, {.f32 = right}, {.f32 = bottom}, {.f32 = left}};
    ArkUI_AttributeItem item{values, 4};
    check(_api.setAttribute(_content, NODE_PADDING, &item));
    _api.markDirty(_root, NODE_NEED_MEASURE);
}

void HarmonyNativeRouteSurface::setSizePixels(int32_t width, int32_t height) {
    if (width < 0 || height < 0) throw std::runtime_error("Invalid native route pixel size");
    _width = width;
    _height = height;
    if (!_retired) _api.markDirty(_root, NODE_NEED_MEASURE);
}

void HarmonyNativeRouteSurface::clickEvent(ArkUI_NodeEvent* event) noexcept {
    auto* click = static_cast<Click*>(OH_ArkUI_NodeEvent_GetUserData(event));
    if (!click) return;
    auto owner = click->owner.lock();
    if (!owner || owner->_retired) return;
    ++owner->_callbacks;
    try {
        // Copy callable: reentrant close may retire the registrations below.
        auto action = click->action;
        if (action) action();
    } catch (const std::exception& error) {
        if (owner->_error) owner->_error(error.what());
    }
    --owner->_callbacks;
}

void HarmonyNativeRouteSurface::customEvent(ArkUI_NodeCustomEvent* event) noexcept {
    auto* api = nodeAPI();
    if (!api) return;
    auto root = OH_ArkUI_NodeCustomEvent_GetNodeHandle(event);
    auto* raw = static_cast<HarmonyNativeRouteSurface*>(api->getUserData(root));
    if (!raw) return;
    auto owner = raw->shared_from_this();
    if (owner->_retired || !owner->_content) return;
    ++owner->_callbacks;
    try {
        const auto type = OH_ArkUI_NodeCustomEvent_GetEventType(event);
        if (type == ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE) {
            auto* incoming = OH_ArkUI_NodeCustomEvent_GetLayoutConstraintInMeasure(event);
            if (!incoming) throw std::runtime_error("Native route measure has no constraints");
            // Root Frame is backend-owned and can be smaller than its native
            // parent. Measure our subtree against that exact physical viewport,
            // independently of receiver order and a previous root measurement.
            auto* copy = OH_ArkUI_LayoutConstraint_Copy(incoming);
            if (!copy) throw std::runtime_error("Could not allocate native route constraints");
            std::unique_ptr<ArkUI_LayoutConstraint, decltype(&OH_ArkUI_LayoutConstraint_Dispose)>
                constraint(copy, OH_ArkUI_LayoutConstraint_Dispose);
            if (owner->_width >= 0 && owner->_height >= 0) {
                OH_ArkUI_LayoutConstraint_SetMinWidth(copy, owner->_width);
                OH_ArkUI_LayoutConstraint_SetMaxWidth(copy, owner->_width);
                OH_ArkUI_LayoutConstraint_SetPercentReferenceWidth(copy, owner->_width);
                OH_ArkUI_LayoutConstraint_SetMinHeight(copy, owner->_height);
                OH_ArkUI_LayoutConstraint_SetMaxHeight(copy, owner->_height);
                OH_ArkUI_LayoutConstraint_SetPercentReferenceHeight(copy, owner->_height);
            }
            check(api->measureNode(owner->_content, copy));
        } else if (type == ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT) {
            check(api->layoutNode(owner->_content, 0, 0));
        }
    } catch (const std::exception& error) {
        if (owner->_error) owner->_error(error.what());
    }
    --owner->_callbacks;
}

void HarmonyNativeRouteSurface::retire() noexcept {
    if (std::exchange(_retired, true)) return;
    // Revoke userdata and callbacks before any detach/dispose can reenter.
    for (auto& click : _clicks) click->action = {};
    for (auto& click : _clicks) {
        if (click->registered) _api.unregisterNodeEvent(click->node, NODE_ON_CLICK);
        if (click->receiver) _api.removeNodeEventReceiver(click->node, clickEvent);
        click->registered = click->receiver = false;
    }
    if (_receiver) {
        _api.removeNodeCustomEventReceiver(_root, customEvent);
        _receiver = false;
        _api.setUserData(_root, nullptr);
    }
    if (_attached) {
        _api.removeChild(_root, _content);
        _attached = false;
    }
    // SDK receiver/event userdata and the backend root must survive the current
    // SDK callback stack, including callbacks that close the entire host.
    deferDisposal();
}

void HarmonyNativeRouteSurface::deferDisposal() {
    _defer([owner = shared_from_this()] {
        if (owner->_callbacks) owner->deferDisposal();
        else owner->dispose();
    });
}

void HarmonyNativeRouteSurface::dispose() noexcept {
    for (auto& click : _clicks) {
        if (click->registered) _api.unregisterNodeEvent(click->node, NODE_ON_CLICK);
        if (click->receiver) _api.removeNodeEventReceiver(click->node, clickEvent);
    }
    _clicks.clear();
    if (_receiver) {
        _api.removeNodeCustomEventReceiver(_root, customEvent);
        _api.setUserData(_root, nullptr);
        _receiver = false;
    }
    // Children/controls are disposed before releasing the backend presentation
    // owner. Reverse edge order also handles partial allocation/mount failures.
    for (auto it = _edges.rbegin(); it != _edges.rend(); ++it) {
        if (it->first != _root || _attached) _api.removeChild(it->first, it->second);
    }
    _edges.clear();
    _attached = false;
    for (auto it = _nodes.rbegin(); it != _nodes.rend(); ++it) _api.disposeNode(*it);
    _nodes.clear();
    _content = nullptr;
    _rootOwner.reset();
}
} // namespace ValdiHarmony
