// SOURCE ONLY fixture, intentionally not compiled/run by the delegated child.
// Includes the actual production binding/mount/input bodies with real SDK26
// declarations. Only renderer/native dispatch and runtime delivery are faked.
// This is neither a navigator model nor native-device ordering evidence.
#include <arkui/native_node.h>
#include <arkui/native_gesture.h>
#include <arkui/ui_input_event.h>
#include "SheetInteraction.hpp"
#include "SheetInteractionState.hpp"
#include "ScrollState.hpp"
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
    int nested = ARKUI_SCROLL_NESTED_MODE_SELF_FIRST;
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
int nativeReads = 0, nativeWrites = 0, nextId = 1, callbackDepth = 0;
bool failPan = false;
std::vector<std::unique_ptr<ArkUI_Node>> handles;
std::vector<std::unique_ptr<ArkUI_GestureRecognizer>> recognizers;
std::deque<std::function<void()>> deferred;
ArkUI_NativeNodeAPI_1 nodes {};
ArkUI_NativeGestureAPI_1 gestures {};
ArkUI_NativeGestureAPI_2 gestures2 {};
ArkUI_Node& record(ArkUI_NodeHandle node) {
    assert(node && node->alive);
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
float OH_ArkUI_PanGesture_GetVelocityY(const ArkUI_GestureEvent* e) { return e->velocity; }
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
struct NativeRefresh { ArkUI_NodeHandle handle = nullptr; };
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
    uint64_t sheetMountEpoch = 1;
    bool disposing = false, touchEnabled = true;
    void set(ArkUI_NodeHandle n, ArkUI_NodeAttributeType attr, const ArkUI_AttributeItem& item) {
        ++nativeWrites;
        assert(attr == NODE_SCROLL_NESTED_SCROLL && item.size == 2);
        record(n).nested = item.value[0].i32;
    }
};
struct NativeScroll : std::enable_shared_from_this<NativeScroll> {
    using NoticeType = ScrollNoticeType;
    std::weak_ptr<Node> node;
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr, content = nullptr;
    ScrollGeometry geometry;
    ScrollState<Point> sequence;
    Point offset, rawOffset, velocity;
    uint64_t geometryRevision = 1;
    bool retired = false, enabled = true, pending = false;
    std::function<void()> runtimeScroll;
    void properties() {
        if (auto n = node.lock(); n && !n->disposing && !retired) {
            ++nativeWrites; record(handle).nested = ARKUI_SCROLL_NESTED_MODE_SELF_FIRST;
            sheetScrollProperties(*this);
        }
    }
    void sample(bool = false) { ++nativeReads; offset.y = rawOffset.y = record(handle).offset; }
    void writeOffset(Point p, bool) { ++nativeWrites; record(handle).offset = p.y; }
    void enqueue(NoticeType) { if (runtimeScroll) runtimeScroll(); }
};
static void check(int32_t result, const char* operation) { if (result) throw std::runtime_error(operation); }
[[noreturn]] static void fail(const std::string& message) { throw std::runtime_error(message); }
#include "SheetInteractionInput.inc"
#include "WheelArbitration.inc"
#include "SheetInteractionMount.inc"
#include "SheetInteraction.inc"
} // namespace Valdi::Harmony::detail

namespace {
using namespace Valdi::Harmony;
using namespace Valdi::Harmony::detail;
void configure() {
    nodes.getParent = [](ArkUI_NodeHandle n) { ++nativeReads; return record(n).parent; };
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
    float lastVelocity = 0;
    Rig() {
        root->backend = backend;
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
        binding->end = [this](uint64_t, float velocity, bool canceled) {
            ++ends; lastVelocity = velocity; lastCanceled = canceled;
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
    std::shared_ptr<Node> scroll(const std::shared_ptr<Node>& parent, float offset) {
        auto n = std::make_shared<Node>();
        n->backend = backend;
        n->handle = makeHandle(ARKUI_NODE_CUSTOM, parent->scroll ? parent->scroll->content : parent->handle);
        n->parent = parent;
        parent->children.push_back(n);
        n->scroll = std::make_shared<NativeScroll>();
        auto s = n->scroll;
        s->backend = backend; s->node = n;
        s->handle = makeHandle(ARKUI_NODE_SCROLL, n->handle);
        s->content = makeHandle(ARKUI_NODE_CUSTOM, s->handle);
        s->geometry.viewportHeight = 100; s->geometry.contentHeight = 400;
        record(s->handle).offset = offset;
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
        n->scroll->sequence.beginDrag({{}, {}, {}});
        assert(sheetScrollStart(n->scroll));
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

int main() {
    configure();
    {
        Rig r;
        auto parent = r.scroll(r.root, 25);
        auto deepest = r.scroll(parent, 15);
        r.startScroll(deepest);
        assert(r.begins == 1 && record(deepest->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY);
        auto down = r.frame(deepest, -60);
        assert(down.returned && down.actual == -15 && record(parent->scroll->handle).offset == 0 && r.sheetOffset == 20);
        const int offers = r.offers;
        auto ancestor = r.frame(parent, -60);
        assert(ancestor.returned && ancestor.actual == 0 && r.offers == offers);
        auto up = r.frame(deepest, 35);
        assert(up.returned && up.actual == 15 && r.sheetOffset == 0);
        // Identical floats/timestamps are TWO budgets, never an invented ID.
        r.frame(deepest, -7);
        r.frame(deepest, -7);
        assert(record(deepest->scroll->handle).offset == 1 && r.sheetOffset == 0);
        r.raw(UI_TOUCH_EVENT_ACTION_MOVE, 40, 100000001);
        r.raw(UI_TOUCH_EVENT_ACTION_UP, 40, 100000001);
        sheetScrollEnd(deepest->scroll, 800, false);
        assert(r.ends == 1 && !r.lastCanceled && r.lastVelocity > 0);
        assert(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST);
        const auto late = r.frame(deepest, -30);
        assert(!late.returned); // no sheet continuation into inertia
    }
    {
        Rig r;
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        auto handle = makeHandle(ARKUI_NODE_STACK, r.binding->panel);
        r.select(handle);
        assert(r.owner->session.source == SheetMotionSource::PanelPan);
        ArkUI_GestureEvent e;
        e.y = 24; e.velocity = 200; // physical PX, scale=2
        { CallbackScope scope; SheetInteraction::gesture(&e, r.owner.get()); }
        assert(r.sheetOffset == 12 && r.begins == 1);
        e.action = GESTURE_EVENT_ACTION_END;
        { CallbackScope scope; SheetInteraction::gesture(&e, r.owner.get()); }
        r.raw(UI_TOUCH_EVENT_ACTION_UP);
        assert(r.ends == 1 && r.lastVelocity == 100);
    }
    {
        Rig r;
        auto n = r.scroll(r.root, 0);
        // Generic SDK frames/start alone never admit touch.
        assert(!r.frame(n, -20).returned && r.begins == 0);
        assert(sheetScrollStart(n->scroll) && r.begins == 0);
        r.binding->begin = [&](uint64_t) { ++r.begins; return false; };
        r.startScroll(n);
        assert(!r.frame(n, -20).returned && r.ends == 0);
    }
    {
        Rig r;
        auto n = r.scroll(r.root, 0);
        r.startScroll(n);
        int readsAfterCallback = -1, writesAfterCallback = -1;
        r.binding->offer = [&](uint64_t, float x) {
            r.binding->lifetime->revoke();
            readsAfterCallback = nativeReads; writesAfterCallback = nativeWrites;
            return x;
        };
        const auto e = r.frame(n, -20);
        assert(!e.returned && nativeReads == readsAfterCallback && nativeWrites == writesAfterCallback);
        assert(r.ends == 1 && r.lastCanceled);
    }
    {
        Rig r;
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        r.select(r.binding->panel);
        int readsAfterCallback = -1, writesAfterCallback = -1;
        r.binding->begin = [&](uint64_t) {
            r.root->sheetInteraction.reset();
            r.owner->retire();
            readsAfterCallback = nativeReads; writesAfterCallback = nativeWrites;
            assert(!r.owner->pan->disposed);
            return true;
        };
        { CallbackScope scope; assert(!r.owner->start()); }
        assert(r.ends == 1 && r.lastCanceled);
        assert(nativeReads == readsAfterCallback && nativeWrites == writesAfterCallback);
        assert(!r.owner->pan->disposed);
        drainDeferred();
        assert(r.owner->pan == nullptr);
    }
    {
        Rig r;
        auto n = r.scroll(r.root, 0);
        r.startScroll(n);
        r.binding->offer = [](uint64_t, float) { return std::numeric_limits<float>::quiet_NaN(); };
        assert(!r.frame(n, -20).returned && r.ends == 1 && r.lastCanceled);
        assert(!sheetRemainderValid(-1, 1) && !sheetRemainderValid(1, 2));
    }
    {
        Rig r;
        auto n = r.scroll(r.root, 0);
        r.startScroll(n);
        cancelSheetInteractions(*n, true); // control replacement cancels, keeps binding
        assert(r.root->sheetInteraction == r.owner && r.ends == 1 && r.lastCanceled);
        r.startScroll(n);
        assert(r.begins == 2);
        r.backend->suspended = true;
        r.owner->finish(0, true, true);
        assert(r.ends == 2 && !r.owner->current());
    }
    {
        Rig r;
        for (auto type : {ARKUI_NODE_TEXT_PICKER, ARKUI_NODE_DATE_PICKER, ARKUI_NODE_TIME_PICKER,
                          ARKUI_NODE_TEXT_INPUT, ARKUI_NODE_TEXT_AREA, ARKUI_NODE_REFRESH}) {
            r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
            auto native = makeHandle(type, r.root->handle);
            r.select(native);
            assert(r.owner->session.source == SheetMotionSource::Exclusive && !r.owner->start());
        }
        assert(r.begins == 0);
    }
    {
        Rig r;
        auto host = r.scroll(r.root, 0);
        auto mounted = std::make_shared<Node>();
        mounted->backend = r.backend;
        mounted->hostParent = makeHandle(ARKUI_NODE_STACK, host->scroll->content);
        mounted->handle = makeHandle(ARKUI_NODE_CUSTOM, mounted->hostParent);
        mounted->wheel = std::make_shared<NativeWheel>();
        r.backend->nodes.push_back(mounted.get());
        ArkUI_GestureInterruptInfo info;
        info.touches.push_back(reinterpret_cast<ArkUI_TouchRecognizerHandle>(mounted->handle));
        assert(!wheelOwnsTouch(*host, &info) && wheelOwnsMountedTouch(*host, &info));
        assert(interactionParent(*mounted) == host);
        host->touchEnabled = false;
        assert(!inputEnabled(*mounted));
        r.backend->nodes.pop_back();
    }
    {
        Rig r;
        auto n = r.scroll(r.root, 0);
        r.startScroll(n);
        int readsAfterCallback = -1, writesAfterCallback = -1;
        r.binding->offer = [&](uint64_t, float x) {
            ++r.root->sheetMountEpoch; // same pointer, different mounted identity
            readsAfterCallback = nativeReads; writesAfterCallback = nativeWrites;
            return x;
        };
        assert(!r.frame(n, -10).returned);
        assert(nativeReads == readsAfterCallback && nativeWrites == writesAfterCallback && r.ends == 1);
    }
    assert(deferred.empty());
}
