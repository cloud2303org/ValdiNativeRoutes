// Pending native fixture: compile ONLY after the parent grants its native slot.
// Links the actual HarmonySheetSurface.cpp against a fake SDK dispatch table;
// includes real SDK26 declarations, never replacement framework headers.
#include "../../../harmony/entry/src/main/cpp/host/HarmonySheetSurface.hpp"
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

int main() {
    configure();
    ArkUI_Context context;
    ArkUI_NodeContent content;
    // Call the real C++ geometry helper, not a duplicate navigation/layout model.
    for (bool compact : {false, true}) {
        for (float resize : {0.0f, 80.0f, 160.0f, 240.0f, 320.0f}) {
            auto g = computeHarmonySheetGeometry({400, 800, 800 - resize, 320, 32, 8, 12, 24, compact});
            assert(g.panelTop == (compact ? 116 : 200));
            assert(g.contentHeight == (compact ? 340 : 256));
            assert(g.keyboardCoveredRemainder == 320 - resize);
            assert(g.contentInsetTop == 0 && g.contentInsetBottom == 0);
            assert(g.contentInsetLeft == 8 && g.contentInsetRight == 12);
        }
    }
    auto compact = computeHarmonySheetGeometry({400, 800, 800, 0, 32, 8, 12, 24, true});
    assert(compact.panelHeight == 388 && compact.contentHeight == 364 && compact.contentInsetBottom == 24);
    auto cap = computeHarmonySheetGeometry({400, 500, 300, 350, 40, 0, 0, 24, true});
    assert(cap.panelTop == 40 && cap.contentHeight == 86);
    bool invalidRejected = false;
    try { geometry(std::numeric_limits<float>::quiet_NaN(), 0); }
    catch (const std::invalid_argument&) { invalidRejected = true; }
    assert(invalidRejected);
    {
        auto s = surface(content, context);
        assert(liveNodes == 6 && content.root);
        auto panel = content.root->children.at(1);
        auto scrim = content.root->children.at(0);
        assert(panel->children.at(1) == s->viewport());
        assert(panel->children.at(0)->children.size() == 1); // Real handle area/bar.
        s->layout(geometry(), 600);
        s->setActive(true);
        int completed = 0;
        s->animateTo(0, 0, [&](bool settled) { assert(settled); ++completed; });
        auto animation = animators.back();
        sample(animation, 0.5f);
        assert(f(panel, NODE_TRANSLATE, 1) > 0 && f(panel, NODE_TRANSLATE, 1) < 600);
        assert(s->currentOffset() == f(panel, NODE_TRANSLATE, 1));
        assert(std::abs(f(scrim, NODE_OPACITY) - (1 - s->currentOffset() / 600)) < 0.0001f);
        finish(animation);
        assert(completed == 1 && s->currentOffset() == 0);
        finish(animation); // Duplicate SDK terminal before deferred disposal.
        assert(completed == 1);
        assert(!animators.empty()); // Disposed only after native stack unwinds.
        drain();
        assert(animators.empty());
        // Real page ownership is external to the surface.
        auto page = nodeAPI.createNode(ARKUI_NODE_STACK);
        nodeAPI.addChild(s->viewport(), page);
        s->animateTo(600, 900, [&](bool) { ++completed; });
        animation = animators.back();
        sample(animation, 0.3f);
        float fraction = s->currentOffset() / 600;
        s->layout(geometry(600, 200), 0); // Caller zero must not snap settle open.
        assert(std::abs(s->currentOffset() / 400 - fraction) < 0.0001f);
        auto retargeted = animators.back();
        finish(animation); // A canceled generation cannot complete or move UI.
        assert(completed == 1);
        finish(retargeted);
        assert(completed == 2 && s->currentOffset() == 400);
        assert(f(s->viewport(), NODE_HEIGHT) == 376); // 600vp viewport, 200vp observed keyboard resize.
        nodeAPI.removeChild(s->viewport(), page);
        nodeAPI.disposeNode(page);
        s->retire();
        assert(!content.root && liveNodes == 6 && !s->viewport());
        s.reset();
        drain();
        assert(liveNodes == 0 && animators.empty() && liveOptions == 0);
    }
    {
        // External root mount admission failed: surface retirement disposes
        // only owned carrier nodes; page cleanup remains the Navigator's job.
        auto s = surface(content, context);
        auto page = nodeAPI.createNode(ARKUI_NODE_STACK);
        edgesUntilFailure = 0;
        assert(nodeAPI.addChild(s->viewport(), page) != 0);
        edgesUntilFailure = -1;
        s->retire();
        s.reset();
        drain();
        assert(liveNodes == 1 && page->children.empty());
        nodeAPI.disposeNode(page);
        assert(liveNodes == 0);
    }
    {
        std::shared_ptr<HarmonySheetSurface> s;
        std::weak_ptr<HarmonySheetSurface> weak;
        s = surface(content, context, [&] {
            s->retire();
            assert(!content.root); // Synchronous removal INSIDE native callback.
            s.reset();
            assert(!weak.expired() && liveNodes == 6);
        });
        weak = s;
        s->layout(geometry(), 0);
        s->setActive(true);
        click(content.root->children.at(0));
        assert(!weak.expired() && liveNodes == 6);
        drain();
        assert(weak.expired() && liveNodes == 0);
    }
    {
        std::shared_ptr<HarmonySheetSurface> s = surface(content, context);
        std::weak_ptr<HarmonySheetSurface> weak = s;
        s->layout(geometry(), 0);
        s->setActive(true);
        int completed = 0;
        s->animateTo(600, 0, [&](bool settled) {
            assert(settled);
            ++completed;
            s->retire();
            s.reset();
            assert(!content.root && !weak.expired());
        });
        auto animation = animators.back();
        finish(animation);
        finish(animation);
        assert(completed == 1 && liveNodes == 6 && !weak.expired());
        drain();
        assert(weak.expired() && liveNodes == 0 && liveOptions == 0);
    }
    {
        auto s = surface(content, context);
        s->layout(geometry(), 0);
        s->setActive(true);
        int completed = 0;
        s->animateTo(600, 0, [&](bool) { ++completed; });
        auto animation = animators.back();
        sample(animation, 0.3f);
        float current = s->cancelAnimation();
        finish(animation);
        assert(completed == 0 && current == s->currentOffset());
        s->animateTo(0, 0, [&](bool) { ++completed; });
        animation = animators.back();
        s->setActive(false);
        finish(animation);
        assert(completed == 0);
        assert(content.root->attributes.at(NODE_HIT_TEST_BEHAVIOR)[0].i32 == ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS);
        assert(content.root->attributes.at(NODE_VISIBILITY)[0].i32 == ARKUI_VISIBILITY_HIDDEN);
        // Background layout remains writable without re-enabling input.
        s->layout(geometry(480, 320), s->currentOffset());
        assert(f(s->viewport(), NODE_HEIGHT) == 256);
        assert(content.root->attributes.at(NODE_ENABLED)[0].i32 == 0);
        s->setActive(true);
        assert(content.root->attributes.at(NODE_ENABLED)[0].i32 == 1);
        s->retire();
        s.reset();
        drain();
        assert(liveNodes == 0 && liveOptions == 0);
    }
    {
        auto s = surface(content, context);
        s->layout(geometry(), 600);
        s->setActive(true);
        int failures = 0;
        s->animateTo(0, 0, [&](bool settled) {
            assert(!settled);
            ++failures;
            s->retire();
            s.reset();
        });
        failAttribute = true;
        sample(animators.back(), 0.5f);
        assert(failures == 1 && !content.root && liveNodes == 6);
        drain();
        assert(liveNodes == 0 && liveOptions == 0);
    }
    for (int allocation = 0; allocation != 6; ++allocation) {
        allocationsUntilFailure = allocation;
        bool rejected = false;
        try { surface(content, context); } catch (const std::runtime_error&) { rejected = true; }
        assert(rejected && !content.root && liveNodes == 0);
    }
    allocationsUntilFailure = -1;
    for (int edge = 0; edge != 5; ++edge) {
        edgesUntilFailure = edge;
        bool rejected = false;
        try { surface(content, context); } catch (const std::runtime_error&) { rejected = true; }
        assert(rejected && !content.root && liveNodes == 0);
    }
    edgesUntilFailure = -1;
    failAttribute = true;
    try { surface(content, context); assert(false); } catch (const std::runtime_error&) {}
    assert(liveNodes == 0);
    failAttach = true;
    try { surface(content, context); assert(false); } catch (const std::runtime_error&) {}
    assert(liveNodes == 0 && !content.root);
    failAttach = false;
    for (bool createFailure : {true, false}) {
        auto s = surface(content, context);
        s->layout(geometry(), 0);
        s->setActive(true);
        failAnimator = createFailure;
        failPlay = !createFailure;
        bool rejected = false;
        try { s->animateTo(600, 0, {}); } catch (const std::runtime_error&) { rejected = true; }
        assert(rejected);
        failAnimator = failPlay = false;
        s->retire();
        s.reset();
        drain();
        assert(!content.root && liveNodes == 0 && liveOptions == 0 && animators.empty());
    }
}
