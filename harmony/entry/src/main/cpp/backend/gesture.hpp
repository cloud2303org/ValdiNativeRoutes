#pragma once

#include "ArkUIViewManager.hpp"
#include "GestureState.hpp"
#include "NativeDeadline.hpp"
#include "valdi_core/cpp/Utils/ValueFunction.hpp"
#include "valdi_core/cpp/Views/Frame.hpp"
#include <arkui/native_gesture.h>
#include <arkui/ui_input_event.h>

namespace Valdi {
class AttributesBindingContext;
class ViewAttributeHandlerDelegate;
}

namespace Valdi::Harmony::detail {

struct GestureSlot;
class GestureRegistration;
class GestureInputRegistration;
struct GestureNode;
enum class GestureSourceKind { View, Scroll, Refresh };
struct GestureSourcePolicies {
    std::function<bool(GestureNode&, const ArkUI_GestureInterruptInfo*)> wheelAllows;
    std::function<void(GestureNode&, ArkUI_GestureInterruptInfo*)> sheetAdmission;
};
// Per-backend platform lifetime. The manager extends this with its unrelated
// rendering state; the gesture module cannot access that state.
struct GesturePlatform {
    using SourceKind = GestureSourceKind;
    using SourcePolicies = GestureSourcePolicies;
    ArkUIConfiguration configuration;
    ArkUI_NativeNodeAPI_1* api = nullptr;
    ArkUI_NativeGestureAPI_1* gestures = nullptr;
    ArkUI_NativeGestureAPI_2* gestures2 = nullptr;
    bool stopped = false, suspended = false, shuttingDown = false;
    // Routing/lifetime only. ArkUI owns recognition and competition.
    std::vector<std::weak_ptr<GestureSlot>> nativeSlots;
    std::vector<std::shared_ptr<GestureSlot>> retiredSlots;
    std::vector<std::shared_ptr<GestureRegistration>> registrations;
    std::vector<std::shared_ptr<GestureInputRegistration>> inputRegistrations;
    uint64_t nextRegistrationOwner = 1;

    explicit GesturePlatform(ArkUIConfiguration config);
    ~GesturePlatform();
    void report(const std::string& message) const noexcept;
};

struct GestureSet;
struct GestureConfig {
    Ref<ValueFunction> action;
    Ref<ValueFunction> predicate;
    bool disabled = false;
};

struct GestureLocation {
    GesturePoint relative;
    GesturePoint absolute;
};

// This is the canonical gesture state, including the four shared view fields
// read by input. Node inherits it: there is no shadow tree or duplicated frame.
// The host port deliberately exposes no Node, Backend, Scroll or Sheet type.
struct GestureNode {
    virtual ~GestureNode() = default;
    ArkUI_NodeHandle handle = nullptr;
    Frame frame;
    bool disposing = false;
    bool rtl = false;
    std::array<GestureConfig, 6> gestureConfig;
    std::shared_ptr<GestureSet> gestureSet;
    Ref<ValueFunction> onTouch, onTouchStart, onTouchEnd, hitTest;
    RootDragObserver rootDragObserver;
    bool touchEnabled = true;
    bool touchActive = false, touchPending = false, touchRejected = false;
    // Zero delegates to ArkUI's platform default (SDK26: 500ms).
    double longPressDuration = 0;
    double touchDelay = 0;
    uint64_t touchGeneration = 0, gestureGeneration = 0;
    uint64_t gestureAttributeRevision = 0;
    Value lastTouch;
    std::unique_ptr<NativeDeadline> touchDeadline;
    std::array<std::optional<double>, 5> touchInsets;
    uint64_t gestureSourceOwner = 0;

    // Fallible, nonthrowing retention: final-owner destruction returns null.
    // Cancellation still retires native state using the live destructor object;
    // input and admission callbacks must reject null without resurrecting it.
    virtual std::shared_ptr<GestureNode> retainGestureNode() noexcept = 0;
    virtual std::shared_ptr<GestureNode> gestureParent() const = 0;
    virtual uint64_t gestureMountEpoch() const noexcept = 0;
    virtual std::shared_ptr<GesturePlatform> gesturePlatform() const = 0;
    virtual bool gestureInputEnabled() const = 0;
    virtual GestureLocation convertGestureLocation(GesturePoint physical) const = 0;
    virtual bool gestureWheelOwns(const ArkUI_GestureInterruptInfo* info) = 0;
    virtual void gestureIntercept(const ArkUI_UIInputEvent* input, bool admitted) = 0;
    virtual void gestureTouchDown() = 0;
    virtual void setGestureTouchEnabled(bool enabled) = 0;
    virtual void unregisterGestureInput() = 0;
};

void installGestureSource(GesturePlatform& platform, GestureNode& node, ArkUI_NodeHandle handle,
                          GestureSourceKind kind, GestureSourcePolicies policies = {});
bool retireGestureSources(GestureNode& node, ArkUI_NodeHandle handle = nullptr) noexcept;
void gestureNativeSourceDisposed(GesturePlatform& platform, ArkUI_NodeHandle handle) noexcept;
void refreshGestures(GestureNode& node);
void cancelGestures(GestureNode& node, bool clearCallbacks = false);
// Scroll consumes the old sequence before its own callbacks. Keep this atomic
// snapshot seam without importing scroll ownership into the gesture module.
struct RawTerminal {
    bool valid = false;
    Value event;
};
RawTerminal consumeRawTerminal(GestureNode& node, const Value& event);
void deliverRawTerminal(GestureNode& node, const RawTerminal& terminal);
void updateTouchRegion(GestureNode& node);
void* gestureInputUserData(GestureNode& node);
void gestureInputEvent(ArkUI_NodeEvent* event) noexcept;
void gestureInputEvent(GestureNode& node, ArkUI_NodeEvent* event) noexcept;
bool gestureAttribute(GestureNode& node, const StringBox& name, const Value& value);
bool resetGestureAttribute(GestureNode& node, const StringBox& name);
void bindGestureAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate);

} // namespace Valdi::Harmony::detail
