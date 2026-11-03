#pragma once
// P2 SDK/renderer/runtime boundary. Production scroll declarations, bodies,
// and touchEnabled setter are extracted from an explicit backend root.
// The SAME fixture source selects prefix or fixed inputs through -I only.
// No NativeScroll cancellation, properties, journal, or drain logic is faked.
#include <arkui/native_node.h>
#include <arkui/native_gesture.h>
#include <arkui/ui_input_event.h>
#include "SheetInteraction.hpp"
#include "SheetInteractionState.hpp"
#include "ScrollState.hpp"
#include <algorithm>
#include <chrono>
#include <iostream>
#include <optional>
#include <string_view>
#include <utility>
#include <type_traits>
#include <array>
#include <cassert>
#include <deque>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

struct ArkUI_Node {
    ArkUI_NodeType type = ARKUI_NODE_CUSTOM;
    ArkUI_NodeHandle parent = nullptr;
    int32_t id = 0;
    float offset = 0;
    bool alive = true;
    bool interactionEnabled = true;
    int propertyWrites = 0;
    int nested = ARKUI_SCROLL_NESTED_MODE_SELF_FIRST;
    std::map<ArkUI_NodeAttributeType, std::vector<ArkUI_NumberValue>> attributes;
    void* data = nullptr;
    void (*receiver)(ArkUI_NodeEvent*) = nullptr;
    ArkUI_GestureInterruptResult (*interrupter)(ArkUI_GestureInterruptInfo*) = nullptr;
};
struct ArkUI_GestureRecognizer {
    ArkUI_NodeHandle node = nullptr;
    void* data = nullptr;
    void (*receive)(ArkUI_GestureEvent*, void*) = nullptr;
    bool disposed = false;
};
struct ArkUI_UIInputEvent {
    int32_t type = ARKUI_UIINPUTEVENT_TYPE_TOUCH, source = UI_INPUT_EVENT_SOURCE_TYPE_TOUCH_SCREEN;
    int32_t action = UI_TOUCH_EVENT_ACTION_DOWN;
    uint32_t pointers = 1;
    int64_t time = 1;
    float windowY = 0;
};
struct ArkUI_GestureEvent {
    ArkUI_UIInputEvent input;
    ArkUI_GestureEventActionType action = GESTURE_EVENT_ACTION_ACCEPT;
    float y = 0, velocity = 0;
};
struct ArkUI_NodeEvent {
    void* data = nullptr;
    ArkUI_NodeEventType type = NODE_TOUCH_EVENT;
    ArkUI_NodeComponentEvent component {};
    ArkUI_UIInputEvent input;
    bool returned = false;
    float actual = 0;
};
struct ArkUI_GestureInterruptInfo {
    void* data = nullptr;
    ArkUI_GestureRecognizer* candidate = nullptr;
    ArkUI_GestureEvent event;
    std::vector<ArkUI_TouchRecognizerHandle> touches;
};

namespace {
// Same fixture source accepts historical bool and the current private enum.
// Old bool cancellation conflated gestures and lifecycle; retain that meaning
// for RED runs rather than translating it into the new gesture policy.
enum class TestEndReason { Ended, GestureCanceled, LifecycleCanceled };
template<class Reason> TestEndReason endReason(Reason reason) {
    if constexpr (std::is_same_v<Reason, bool>)
        return reason ? TestEndReason::LifecycleCanceled : TestEndReason::Ended;
    else
        return static_cast<TestEndReason>(reason);
}
int nativeReads = 0, nativeWrites = 0, nextId = 1, callbackDepth = 0;
int cancelVelocityReads = 0;
bool failPan = false;
std::vector<std::pair<ArkUI_NodeHandle, float>> offsetWrites;
std::vector<ArkUI_NodeHandle> forbiddenBorrowed;
std::vector<std::unique_ptr<ArkUI_Node>> handles;
std::vector<std::unique_ptr<ArkUI_GestureRecognizer>> recognizers;
std::deque<std::function<void()>> deferred;
ArkUI_NativeNodeAPI_1 nodes {};
ArkUI_NativeGestureAPI_1 gestures {};
ArkUI_NativeGestureAPI_2 gestures2 {};
ArkUI_Node& record(ArkUI_NodeHandle node) {
    assert(node && node->alive);
    assert(std::find(forbiddenBorrowed.begin(), forbiddenBorrowed.end(), node) == forbiddenBorrowed.end() &&
           "revoked/detached borrowed panel accessed");
    return *node;
}
ArkUI_NodeHandle makeHandle(ArkUI_NodeType type = ARKUI_NODE_CUSTOM, ArkUI_NodeHandle parent = nullptr) {
    auto value = std::make_unique<ArkUI_Node>();
    value->type = type;
    value->id = nextId++;
    value->parent = parent;
    auto result = value.get();
    handles.push_back(std::move(value));
    return result;
}
void drainDeferred() {
    assert(callbackDepth == 0);
    while (!deferred.empty()) {
        auto fn = std::move(deferred.front());
        deferred.pop_front();
        fn();
    }
}
struct CallbackScope {
    CallbackScope() { ++callbackDepth; }
    ~CallbackScope() { --callbackDepth; }
};
} // namespace

extern "C" {
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* e) { return e->data; }
ArkUI_NodeEventType OH_ArkUI_NodeEvent_GetEventType(ArkUI_NodeEvent* e) { return e->type; }
ArkUI_NodeComponentEvent* OH_ArkUI_NodeEvent_GetNodeComponentEvent(ArkUI_NodeEvent* e) { ++nativeReads; return &e->component; }
ArkUI_UIInputEvent* OH_ArkUI_NodeEvent_GetInputEvent(ArkUI_NodeEvent* e) { return &e->input; }
int32_t OH_ArkUI_NodeEvent_SetReturnNumberValue(ArkUI_NodeEvent* e, ArkUI_NumberValue* v, int32_t size) {
    assert(size == 1); ++nativeWrites; e->returned = true; e->actual = v[0].f32; return 0;
}
int32_t OH_ArkUI_NodeUtils_GetNodeUniqueId(ArkUI_NodeHandle n, int32_t* id) {
    ++nativeReads; *id = record(n).id; return 0;
}
int32_t OH_ArkUI_NodeUtils_GetNodeType(ArkUI_NodeHandle n) { ++nativeReads; return record(n).type; }
void* OH_ArkUI_GestureInterrupter_GetUserData(ArkUI_GestureInterruptInfo* i) { return i->data; }
ArkUI_GestureRecognizer* OH_ArkUI_GestureInterruptInfo_GetRecognizer(const ArkUI_GestureInterruptInfo* i) { return i->candidate; }
ArkUI_GestureEvent* OH_ArkUI_GestureInterruptInfo_GetGestureEvent(const ArkUI_GestureInterruptInfo* i) {
    return const_cast<ArkUI_GestureEvent*>(&i->event);
}
int32_t OH_ArkUI_GestureInterruptInfo_GetTouchRecognizers(const ArkUI_GestureInterruptInfo* i,
        ArkUI_TouchRecognizerHandleArray* touches, int32_t* count) {
    *touches = const_cast<ArkUI_TouchRecognizerHandle*>(i->touches.data());
    *count = int32_t(i->touches.size()); return 0;
}
ArkUI_NodeHandle OH_ArkUI_TouchRecognizer_GetNodeHandle(const ArkUI_TouchRecognizerHandle t) {
    return reinterpret_cast<ArkUI_NodeHandle>(t);
}
bool OH_ArkUI_TouchRecognizer_IsHostBelongsTo(const ArkUI_TouchRecognizerHandle t, int32_t id) {
    for (auto n = reinterpret_cast<ArkUI_NodeHandle>(t); n; n = record(n).parent)
        if (record(n).id == id) return true;
    return false;
}
ArkUI_ErrorCode OH_ArkUI_GetGestureBindNodeUniqueId(const ArkUI_GestureRecognizer* g, int32_t* id) {
    *id = record(g->node).id; return ARKUI_ERROR_CODE_NO_ERROR;
}
const ArkUI_UIInputEvent* OH_ArkUI_GestureEvent_GetRawInputEvent(const ArkUI_GestureEvent* e) { return &e->input; }
ArkUI_GestureEventActionType OH_ArkUI_GestureEvent_GetActionType(const ArkUI_GestureEvent* e) { return e->action; }
float OH_ArkUI_PanGesture_GetOffsetY(const ArkUI_GestureEvent* e) { return e->y; }
float OH_ArkUI_PanGesture_GetVelocityY(const ArkUI_GestureEvent* e) {
    if (e->action == GESTURE_EVENT_ACTION_CANCEL) ++cancelVelocityReads;
    return e->velocity;
}
int32_t OH_ArkUI_UIInputEvent_GetType(const ArkUI_UIInputEvent* e) { return e->type; }
int32_t OH_ArkUI_UIInputEvent_GetSourceType(const ArkUI_UIInputEvent* e) { return e->source; }
int32_t OH_ArkUI_UIInputEvent_GetAction(const ArkUI_UIInputEvent* e) { return e->action; }
uint32_t OH_ArkUI_PointerEvent_GetPointerCount(const ArkUI_UIInputEvent* e) { return e->pointers; }
int64_t OH_ArkUI_UIInputEvent_GetEventTime(const ArkUI_UIInputEvent* e) { return e->time; }
float OH_ArkUI_PointerEvent_GetWindowY(const ArkUI_UIInputEvent* e) { return e->windowY; }
}

namespace Valdi::Harmony::detail {
struct Backend;
struct Node;
struct SheetInteraction;
struct NativeScroll;
static bool inputEnabled(const Node&);
static void sheetScrollProperties(NativeScroll&);
static void sheetScrollAdmission(Node&, ArkUI_GestureInterruptInfo*);
static bool sheetScrollEnd(const std::shared_ptr<NativeScroll>&, float, bool);
static bool sheetScrollStart(const std::shared_ptr<NativeScroll>&);
static bool sheetScrollFrame(const std::shared_ptr<NativeScroll>&, ArkUI_NodeEvent*);
static std::function<bool()> takeSheetScrollPublication(NativeScroll&);
static bool hasSheetScrollSession(NativeScroll&);
using DispatchFunction = std::function<void()>;
struct Size { float width = 0, height = 0; };

struct Point {
    float x = 0, y = 0;
    Point() = default;
    Point(float x, float y) : x(x), y(y) {}
};
struct Configuration {
    float displayScale = 2;
    ArkUI_ContextHandle uiContext = reinterpret_cast<ArkUI_ContextHandle>(uintptr_t(71));
    std::function<void(std::function<void()>, bool)> dispatchUI = [](auto fn, bool sync) {
        assert(!sync); deferred.push_back(std::move(fn));
    };
};
struct Backend {
    Configuration configuration;
    ArkUI_NativeNodeAPI_1* api = &::nodes;
    ArkUI_NativeGestureAPI_1* gestures = &::gestures;
    ArkUI_NativeGestureAPI_2* gestures2 = &::gestures2;
    std::vector<Node*> nodes;
    uint64_t nextSheetSession = 1;
    bool suspended = false, stopped = false, shuttingDown = false;
    void report(const std::string&) const { assert(false && "unexpected native callback error"); }
};
struct NativeWheel {
    bool enabled = true;
    bool active() const { return enabled; }
    void activate() { enabled = true; }
    void stop() { enabled = false; }
};
struct NativeInput { ArkUI_NodeHandle handle = nullptr; };
struct NativeRefresh { ArkUI_NodeHandle handle = nullptr; void properties() {} };
struct TestTree {
    bool available = true;
    template<class Function, class Time> bool tryWithLock(Function fn, Time) {
        if (!available) return false;
        fn(); return true;
    }
};
struct TestCallback {
    bool ownerIsTearingDown() const { return false; }
    void operator()(int, std::initializer_list<int>) {}
};
struct TestValue { std::shared_ptr<TestCallback> getFunctionRef() const { return {}; } };
constexpr int ValueFunctionFlagsBoundedMainThreadSync = 1;
struct TouchEvents { static int makeScrollEvent(float, float, float, float, float, float) { return 0; } };
struct TestViewNode {
    TestTree* tree = nullptr;
    std::function<std::optional<Point>()> scroll;
    int scrolls = 0, dragEnds = 0, ends = 0;
    bool isHorizontal() const { return false; }
    TestTree* getViewNodeTree() const { return tree; }
    std::optional<Point> onScroll(Point, Point, Point) { ++scrolls; return scroll ? scroll() : std::nullopt; }
    void onDragStart(Point, Point, Point) {}
    std::optional<Point> onDragEnding(Point, Point, Point) { ++dragEnds; return std::nullopt; }
    void onScrollEnd(Point, Point) { ++ends; }
    struct Ids { int getIdForName(std::string_view) const { return 0; } };
    Ids getAttributeIds() const { return {}; }
    struct Applier { TestValue getResolvedAttributeValue(int) const { return {}; } };
    Applier getAttributesApplier() const { return {}; }
    float getRtlScrollOffsetX() const { return 0; }
};
struct TestBool { bool enabled; bool toBool() const { return enabled; } };
struct Node : std::enable_shared_from_this<Node> {
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr, hostParent = nullptr;
    ArkUI_NodeContentHandle content = nullptr;
    std::weak_ptr<Node> parent;
    std::vector<std::shared_ptr<Node>> children;
    std::shared_ptr<NativeScroll> scroll;
    std::shared_ptr<NativeRefresh> refresh;
    std::shared_ptr<NativeInput> input;
    std::shared_ptr<NativeWheel> wheel;
    std::shared_ptr<SheetInteraction> sheetInteraction;
    uint64_t sheetMountEpoch = 1, touchEnabledRevision = 0;
    std::shared_ptr<TestTree> runtimeTree = std::make_shared<TestTree>();
    std::shared_ptr<TestViewNode> runtimeView = std::make_shared<TestViewNode>();
    std::weak_ptr<TestTree> viewNodeTree;
    std::weak_ptr<TestViewNode> viewNode;
    bool disposing = false, touchEnabled = true;
    int lastTouch = 0; // raw-event collaborator is excluded explicitly below
    int invalidations = 0;
    void invalidate() { ++invalidations; }
    void integer(ArkUI_NodeHandle n, ArkUI_NodeAttributeType attr, int32_t value) {
        ArkUI_NumberValue v {}; v.i32 = value;
        ArkUI_AttributeItem item {&v, 1, nullptr, nullptr}; set(n, attr, item);
    }
    void set(ArkUI_NodeHandle n, ArkUI_NodeAttributeType attr, const ArkUI_AttributeItem& item) {
        ++nativeWrites;
        ++record(n).propertyWrites;
        record(n).attributes[attr] = std::vector<ArkUI_NumberValue>(item.value, item.value + item.size);
        if (attr == NODE_SCROLL_NESTED_SCROLL) record(n).nested = item.value[0].i32;
        if (attr == NODE_SCROLL_ENABLE_SCROLL_INTERACTION) record(n).interactionEnabled = item.value[0].i32 != 0;
        if (attr == NODE_SCROLL_OFFSET) {
            record(n).offset = item.value[1].f32;
            offsetWrites.emplace_back(n, item.value[1].f32);
        }
    }
};
#include "sheet-backend-p2-scroll-declarations.inc"
static void check(int32_t result, const char* operation) { if (result) throw std::runtime_error(operation); }
[[noreturn]] static void fail(const std::string& message) { throw std::runtime_error(message); }
#include "SheetInteractionInput.inc"
#include "WheelArbitration.inc"
#include "SheetInteractionMount.inc"
static int32_t pixels(float value, float scale) {
    if (!std::isfinite(value)) throw std::runtime_error("nonfinite fixture coordinate");
    return static_cast<int32_t>(std::round(value * scale));
}
// NativeScroll.event itself, its input root and drag-current guards are real.
// These unrelated collaborators are explicitly excluded, not simulated.
// Rig controls forbid keyboard blur and descendant raw cancellation; entering
// either seam fails the fixture rather than silently modeling its behavior.
struct RawTerminal {};
static RawTerminal consumeRawTerminal(Node&, int) { fail("raw cancellation collaborator is outside this fixture"); }
static void deliverRawTerminal(Node&, RawTerminal) { fail("raw terminal collaborator is outside this fixture"); }
static void dismissScrollKeyboard(const std::shared_ptr<NativeScroll>&, const std::shared_ptr<Node>&,
                                  const std::shared_ptr<Node>&, uint64_t) {
    fail("editor blur collaborator is outside this fixture");
}
#include "sheet-backend-p2-scroll-bodies.inc"
#include "SheetInteraction.inc"
static void cancelSubtreeGestures(Node& node) { cancelSheetInteractions(node, false); }
#include "sheet-backend-p2-setter.inc"
} // namespace Valdi::Harmony::detail

namespace {
using namespace Valdi::Harmony;
using namespace Valdi::Harmony::detail;
void configure() {
    nodes.getParent = [](ArkUI_NodeHandle n) { ++nativeReads; return record(n).parent; };
    nodes.getAttribute = [](ArkUI_NodeHandle n, ArkUI_NodeAttributeType attr) -> const ArkUI_AttributeItem* {
        assert(attr == NODE_SCROLL_OFFSET); ++nativeReads;
        static std::array<ArkUI_NumberValue, 2> values {};
        values[0].f32 = 0; values[1].f32 = record(n).offset;
        static ArkUI_AttributeItem result {values.data(), 2, nullptr, nullptr};
        return &result;
    };
    nodes.addNodeEventReceiver = [](ArkUI_NodeHandle n, void (*fn)(ArkUI_NodeEvent*)) -> int32_t {
        ++nativeWrites; record(n).receiver = fn; return 0;
    };
    nodes.removeNodeEventReceiver = [](ArkUI_NodeHandle n, void (*)(ArkUI_NodeEvent*)) -> int32_t {
        ++nativeWrites; record(n).receiver = nullptr; return 0;
    };
    nodes.registerNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType, int32_t, void* data) -> int32_t {
        ++nativeWrites; record(n).data = data; return 0;
    };
    nodes.unregisterNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType) {
        ++nativeWrites; record(n).data = nullptr;
    };
    gestures.createPanGesture = [](int32_t fingers, ArkUI_GestureDirectionMask dir, double) -> ArkUI_GestureRecognizer* {
        assert(fingers == 1 && dir == GESTURE_DIRECTION_VERTICAL);
        if (failPan) return nullptr;
        auto g = std::make_unique<ArkUI_GestureRecognizer>();
        auto result = g.get(); recognizers.push_back(std::move(g)); return result;
    };
    gestures.setGestureEventTarget = [](ArkUI_GestureRecognizer* g, ArkUI_GestureEventActionTypeMask,
        void* data, void (*fn)(ArkUI_GestureEvent*, void*)) -> int32_t { g->data = data; g->receive = fn; return 0; };
    gestures.addGestureToNode = [](ArkUI_NodeHandle n, ArkUI_GestureRecognizer* g, ArkUI_GesturePriority,
        ArkUI_GestureMask) -> int32_t { ++nativeWrites; g->node = n; return 0; };
    gestures.removeGestureFromNode = [](ArkUI_NodeHandle n, ArkUI_GestureRecognizer* g) -> int32_t {
        ++nativeWrites; assert(g->node == n); g->node = nullptr; return 0;
    };
    gestures.dispose = [](ArkUI_GestureRecognizer* g) { assert(callbackDepth == 0); assert(!g->disposed); g->disposed = true; };
    gestures2.setGestureInterrupterToNode = [](ArkUI_NodeHandle n, void*, auto fn) -> int32_t {
        ++nativeWrites; record(n).interrupter = fn; return 0;
    };
}

struct Rig {
    std::shared_ptr<Backend> backend = std::make_shared<Backend>();
    std::shared_ptr<Node> root = std::make_shared<Node>();
    std::shared_ptr<SheetInteractionBinding> binding = std::make_shared<SheetInteractionBinding>();
    std::shared_ptr<SheetInteraction> owner;
    float sheetOffset = 0;
    int begins = 0, offers = 0, ends = 0;
    bool lastCanceled = false;
    TestEndReason lastReason = TestEndReason::Ended;
    float lastVelocity = 0;
    Rig() {
        root->backend = backend;
        root->runtimeView->tree = root->runtimeTree.get();
        root->viewNodeTree = root->runtimeTree;
        root->viewNode = root->runtimeView;
        binding->panel = makeHandle(ARKUI_NODE_STACK);
        binding->rootMountParent = makeHandle(ARKUI_NODE_STACK, binding->panel);
        binding->context = backend->configuration.uiContext;
        binding->lifetime = std::make_shared<SheetInteractionLifetime>(17);
        root->handle = makeHandle(ARKUI_NODE_CUSTOM, binding->rootMountParent);
        root->hostParent = binding->rootMountParent;
        backend->nodes.push_back(root.get());
        binding->begin = [this](uint64_t id) { assert(id != 0); ++begins; return true; };
        binding->offer = [this](uint64_t, float delta) {
            ++offers;
            const float next = std::clamp(sheetOffset - delta, 0.0f, 100.0f);
            const float remainder = delta + next - sheetOffset;
            sheetOffset = next;
            return remainder;
        };
        binding->end = [this](uint64_t, float velocity, auto reason) {
            ++ends; lastVelocity = velocity; lastReason = endReason(reason);
            lastCanceled = lastReason != TestEndReason::Ended;
        };
        owner = std::make_shared<SheetInteraction>(root, binding);
        root->sheetInteraction = owner;
        owner->initialize();
    }
    ~Rig() {
        root->sheetInteraction.reset();
        owner->retire();
        drainDeferred();
        assert(record(binding->panel).alive && record(binding->rootMountParent).alive);
    }
    std::shared_ptr<Node> group(const std::shared_ptr<Node>& parent) {
        auto n = std::make_shared<Node>();
        n->backend = backend;
        n->runtimeTree = root->runtimeTree;
        n->runtimeView->tree = n->runtimeTree.get();
        n->viewNodeTree = n->runtimeTree;
        n->viewNode = n->runtimeView;
        n->handle = makeHandle(ARKUI_NODE_CUSTOM, parent->scroll ? parent->scroll->content : parent->handle);
        n->parent = parent;
        parent->children.push_back(n);
        backend->nodes.push_back(n.get());
        return n;
    }
    std::shared_ptr<Node> scroll(const std::shared_ptr<Node>& parent, float offset) {
        auto n = std::make_shared<Node>();
        n->backend = backend;
        n->runtimeTree = root->runtimeTree;
        n->runtimeView->tree = n->runtimeTree.get();
        n->viewNodeTree = n->runtimeTree;
        n->viewNode = n->runtimeView;
        n->handle = makeHandle(ARKUI_NODE_CUSTOM, parent->scroll ? parent->scroll->content : parent->handle);
        n->parent = parent;
        parent->children.push_back(n);
        n->scroll = std::make_shared<NativeScroll>(n);
        auto s = n->scroll;
        s->backend = backend; s->node = n;
        s->cancelsTouches = false; // unrelated raw cancellation is a guarded seam
        s->dismissKeyboardOnDrag = false;
        s->handle = makeHandle(ARKUI_NODE_SCROLL, n->handle);
        s->content = makeHandle(ARKUI_NODE_CUSTOM, s->handle);
        s->geometry.viewportHeight = 100; s->geometry.contentHeight = 400;
        record(s->handle).offset = offset;
        s->geometryRevision = s->laidOutRevision = 1;
        s->sample();
        backend->nodes.push_back(n.get());
        return n;
    }
    void raw(int action, float y = 0, int64_t time = 1) {
        ArkUI_NodeEvent e;
        e.data = owner.get(); e.input.action = action; e.input.windowY = y; e.input.time = time;
        CallbackScope scope; SheetInteraction::touch(&e);
    }
    void select(ArkUI_NodeHandle touched) {
        ArkUI_GestureInterruptInfo info;
        info.data = owner.get(); info.candidate = owner->pan;
        info.touches.push_back(reinterpret_cast<ArkUI_TouchRecognizerHandle>(touched));
        owner->select(&info);
    }
    void startScroll(const std::shared_ptr<Node>& n) {
        raw(UI_TOUCH_EVENT_ACTION_DOWN);
        select(n->scroll->handle);
        notify(n, NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING);
    }
    void notify(const std::shared_ptr<Node>& n, ArkUI_NodeEventType type, float release = 0) {
        assert(!n->scroll->cancelsTouches && !n->scroll->dismissKeyboardOnDrag);
        ArkUI_NodeEvent e;
        e.data = n->scroll.get(); e.type = type; e.component.data[0].f32 = release;
        CallbackScope scope;
        NativeScroll::event(&e);
    }
    ArkUI_NodeEvent frame(const std::shared_ptr<Node>& n, float amount) {
        ArkUI_NodeEvent e;
        e.type = NODE_SCROLL_EVENT_ON_SCROLL_FRAME_BEGIN;
        e.component.data[0].f32 = amount; e.component.data[1].i32 = ARKUI_SCROLL_STATE_SCROLL;
        CallbackScope scope;
        sheetScrollFrame(n->scroll, &e);
        if (e.returned) record(n->scroll->handle).offset += e.actual; // SDK leaf commit
        return e;
    }
};
} // namespace

