#pragma once

// Exact SDK fake-dispatch boundary extracted before main from the immutable
// original sheet-surface-native.cpp. P2 tests link the actual production helper.
// Pending native fixture: compile ONLY after the parent grants its native slot.
// Links the actual HarmonySheetSurface.cpp against a fake SDK dispatch table;
// includes real SDK26 declarations, never replacement framework headers.
#ifndef SHEET_SURFACE_HEADER
#define SHEET_SURFACE_HEADER "../../../harmony/entry/src/main/cpp/host/HarmonySheetSurface.hpp"
#endif
#include SHEET_SURFACE_HEADER
#include <arkui/native_interface.h>
#include <cassert>
#include <deque>
#include <map>
#include <limits>
#include <stdexcept>
#include <vector>

struct ArkUI_Node {
    std::map<ArkUI_NodeAttributeType, std::vector<ArkUI_NumberValue>> attributes;
    std::vector<ArkUI_NodeHandle> children;
    void* userdata = nullptr;
    void (*receiver)(ArkUI_NodeEvent*) = nullptr;
};
struct ArkUI_NodeContent { ArkUI_NodeHandle root = nullptr; };
struct ArkUI_Context {};
struct ArkUI_NodeEvent { void* userdata; };
struct ArkUI_AnimatorOnFrameEvent { void* userdata; float value; };
struct ArkUI_AnimatorEvent { void* userdata; };
struct ArkUI_AnimatorOption {
    void* frameData = nullptr;
    void* finishData = nullptr;
    void* cancelData = nullptr;
    void (*frame)(ArkUI_AnimatorOnFrameEvent*) = nullptr;
    void (*finish)(ArkUI_AnimatorEvent*) = nullptr;
    void (*cancel)(ArkUI_AnimatorEvent*) = nullptr;
};
struct ArkUI_Animator { ArkUI_AnimatorOption* option; };

namespace {
ArkUI_NativeNodeAPI_1 nodeAPI{};
ArkUI_NativeAnimateAPI_1 animateAPI{};
std::deque<std::function<void()>> deferred;
std::vector<ArkUI_AnimatorHandle> animators;
int callbackDepth = 0, liveNodes = 0, liveOptions = 0;
int allocationsUntilFailure = -1;
int edgesUntilFailure = -1;
bool failAttribute = false, failAttach = false, failAnimator = false, failPlay = false;
ArkUI_ContextHandle scopedContext = nullptr;

struct CallbackScope {
    CallbackScope() { ++callbackDepth; }
    ~CallbackScope() { --callbackDepth; }
};

void drain() {
    assert(callbackDepth == 0);
    while (!deferred.empty()) {
        auto work = std::move(deferred.front());
        deferred.pop_front();
        work();
    }
}

void sample(ArkUI_AnimatorHandle animator, float progress) {
    CallbackScope scope;
    ArkUI_AnimatorOnFrameEvent event{animator->option->frameData, progress};
    animator->option->frame(&event);
}

void finish(ArkUI_AnimatorHandle animator) {
    CallbackScope scope;
    ArkUI_AnimatorEvent event{animator->option->finishData};
    animator->option->finish(&event);
}

void click(ArkUI_NodeHandle node) {
    CallbackScope scope;
    ArkUI_NodeEvent event{node->userdata};
    auto receiver = node->receiver;
    assert(receiver);
    receiver(&event);
}

float f(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, unsigned index = 0) {
    return node->attributes.at(attribute).at(index).f32;
}

void configure() {
    nodeAPI.createNode = [](ArkUI_NodeType type) -> ArkUI_NodeHandle {
        assert(type == ARKUI_NODE_STACK);
        if (allocationsUntilFailure == 0) return nullptr;
        if (allocationsUntilFailure > 0) --allocationsUntilFailure;
        ++liveNodes;
        return new ArkUI_Node();
    };
    nodeAPI.disposeNode = [](ArkUI_NodeHandle node) {
        assert(callbackDepth == 0); // In particular, never in scrim/finish/cancel.
        assert(node->children.empty()); // The page must be unmounted first.
        --liveNodes;
        delete node;
    };
    nodeAPI.setLengthMetricUnit = [](ArkUI_NodeHandle, ArkUI_LengthMetricUnit unit) -> int32_t {
        assert(unit == ARKUI_LENGTH_METRIC_UNIT_VP);
        return 0;
    };
    nodeAPI.setAttribute = [](ArkUI_NodeHandle node, ArkUI_NodeAttributeType type,
                              const ArkUI_AttributeItem* item) -> int32_t {
        if (std::exchange(failAttribute, false)) return ARKUI_ERROR_CODE_PARAM_INVALID;
        node->attributes[type] = std::vector<ArkUI_NumberValue>(item->value, item->value + item->size);
        return 0;
    };
    nodeAPI.addChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
        if (edgesUntilFailure == 0) return ARKUI_ERROR_CODE_PARAM_INVALID;
        if (edgesUntilFailure > 0) --edgesUntilFailure;
        parent->children.push_back(child);
        return 0;
    };
    nodeAPI.removeChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
        auto found = std::find(parent->children.begin(), parent->children.end(), child);
        assert(found != parent->children.end());
        parent->children.erase(found);
        return 0;
    };
    nodeAPI.addNodeEventReceiver = [](ArkUI_NodeHandle node, void (*receiver)(ArkUI_NodeEvent*)) -> int32_t {
        node->receiver = receiver;
        return 0;
    };
    nodeAPI.removeNodeEventReceiver = [](ArkUI_NodeHandle node, void (*)(ArkUI_NodeEvent*)) -> int32_t {
        node->receiver = nullptr;
        return 0;
    };
    nodeAPI.registerNodeEvent = [](ArkUI_NodeHandle node, ArkUI_NodeEventType type, int32_t, void* data) -> int32_t {
        assert(type == NODE_ON_CLICK);
        node->userdata = data;
        return 0;
    };
    nodeAPI.unregisterNodeEvent = [](ArkUI_NodeHandle node, ArkUI_NodeEventType) { node->userdata = nullptr; };
    animateAPI.createAnimator = [](ArkUI_ContextHandle context, ArkUI_AnimatorOption* option) -> ArkUI_AnimatorHandle {
        assert(context);
        if (failAnimator) return nullptr;
        auto animator = new ArkUI_Animator{option};
        animators.push_back(animator);
        return animator;
    };
    animateAPI.disposeAnimator = [](ArkUI_AnimatorHandle animator) {
        assert(callbackDepth == 0);
        auto found = std::find(animators.begin(), animators.end(), animator);
        assert(found != animators.end());
        animators.erase(found);
        delete animator;
    };
}

using ValdiHarmony::HarmonySheetSurface;
using ValdiHarmony::computeHarmonySheetGeometry;

auto geometry(float viewport = 800, float keyboard = 0) {
    return computeHarmonySheetGeometry({400, 800, viewport, keyboard, 32, 8, 12, 24, false});
}

auto surface(ArkUI_NodeContent& content, ArkUI_Context& context, std::function<void()> scrim = {}) {
    return HarmonySheetSurface::create(&content, &context,
        [](std::function<void()> task) { deferred.push_back(std::move(task)); }, std::move(scrim));
}
} // namespace

extern "C" {
int32_t OH_ArkUI_RunTaskInScope(ArkUI_ContextHandle context, void* data, void (*callback)(void*)) {
    auto previous = std::exchange(scopedContext, context);
    callback(data);
    scopedContext = previous;
    return 0;
}
void* OH_ArkUI_QueryModuleInterfaceByName(ArkUI_NativeAPIVariantKind type, const char*) {
    return type == ARKUI_NATIVE_NODE ? static_cast<void*>(&nodeAPI) : static_cast<void*>(&animateAPI);
}
int32_t OH_ArkUI_NodeContent_AddNode(ArkUI_NodeContentHandle content, ArkUI_NodeHandle node) {
    assert(scopedContext);
    if (failAttach) return ARKUI_ERROR_CODE_PARAM_INVALID;
    assert(!content->root);
    content->root = node;
    return 0;
}
int32_t OH_ArkUI_NodeContent_RemoveNode(ArkUI_NodeContentHandle content, ArkUI_NodeHandle node) {
    assert(content->root == node);
    content->root = nullptr;
    return 0;
}
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) { return event->userdata; }
void* OH_ArkUI_AnimatorOnFrameEvent_GetUserData(ArkUI_AnimatorOnFrameEvent* event) { return event->userdata; }
float OH_ArkUI_AnimatorOnFrameEvent_GetValue(ArkUI_AnimatorOnFrameEvent* event) { return event->value; }
void* OH_ArkUI_AnimatorEvent_GetUserData(ArkUI_AnimatorEvent* event) { return event->userdata; }
ArkUI_AnimatorOption* OH_ArkUI_AnimatorOption_Create(int32_t size) {
    assert(size == 0);
    ++liveOptions;
    return new ArkUI_AnimatorOption();
}
void OH_ArkUI_AnimatorOption_Dispose(ArkUI_AnimatorOption* option) {
    assert(callbackDepth == 0);
    --liveOptions;
    delete option;
}
int32_t OH_ArkUI_AnimatorOption_SetDuration(ArkUI_AnimatorOption*, int32_t duration) { assert(duration == 450); return 0; }
int32_t OH_ArkUI_AnimatorOption_SetIterations(ArkUI_AnimatorOption*, int32_t count) { assert(count == 1); return 0; }
int32_t OH_ArkUI_AnimatorOption_SetBegin(ArkUI_AnimatorOption*, float value) { assert(value == 0); return 0; }
int32_t OH_ArkUI_AnimatorOption_SetEnd(ArkUI_AnimatorOption*, float value) { assert(value == 1); return 0; }
int32_t OH_ArkUI_AnimatorOption_SetCurve(ArkUI_AnimatorOption*, ArkUI_CurveHandle curve) { assert(!curve); return 0; }
int32_t OH_ArkUI_AnimatorOption_RegisterOnFrameCallback(
    ArkUI_AnimatorOption* option, void* data, void (*callback)(ArkUI_AnimatorOnFrameEvent*)) {
    option->frameData = data; option->frame = callback; return 0;
}
int32_t OH_ArkUI_AnimatorOption_RegisterOnFinishCallback(
    ArkUI_AnimatorOption* option, void* data, void (*callback)(ArkUI_AnimatorEvent*)) {
    option->finishData = data; option->finish = callback; return 0;
}
int32_t OH_ArkUI_AnimatorOption_RegisterOnCancelCallback(
    ArkUI_AnimatorOption* option, void* data, void (*callback)(ArkUI_AnimatorEvent*)) {
    option->cancelData = data; option->cancel = callback; return 0;
}
int32_t OH_ArkUI_Animator_Play(ArkUI_AnimatorHandle) { return failPlay ? ARKUI_ERROR_CODE_PARAM_INVALID : 0; }
int32_t OH_ArkUI_Animator_Cancel(ArkUI_AnimatorHandle animator) {
    CallbackScope scope;
    ArkUI_AnimatorEvent event{animator->option->cancelData};
    animator->option->cancel(&event); // Deliberately synchronous reentry.
    return 0;
}
}

