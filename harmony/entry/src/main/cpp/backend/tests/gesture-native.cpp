// Links the independently compiled production gesture.cpp and current Valdi
// Value/Function/clock implementations. Only the SDK and host port are doubled.
// Injected ACCEPT/UPDATE/etc do NOT prove the SDK recognizes physical input.
#include "gesture.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/TimePoint.hpp"
#include <condition_variable>
#include <limits>
#include <cstdio>
#include <deque>
#include <map>
#include <mutex>
#include <stdexcept>
#include <string>

using namespace Valdi;
using namespace Valdi::Harmony;
using namespace Valdi::Harmony::detail;

static void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(std::string("REGRESSION: ") + message);
}
static double number(const Value& event, const char* key) {
    return event.getMapValue(StringBox::fromCString(key)).toDouble();
}
static bool near(double a, double b) { return std::abs(a - b) < .0001; }

struct Input {
    int action = UI_TOUCH_EVENT_ACTION_DOWN;
    uint32_t changed = 0;
    struct Pointer { int32_t id; float x, y; };
    std::vector<Pointer> pointers {{17, 20, 30}};
    int64_t timestamp = 1234567890;
    int32_t source = 2, device = 7;
};
struct Event {
    ArkUI_GestureEventActionType action = GESTURE_EVENT_ACTION_ACCEPT;
    Input* input = nullptr;
    float dx = 0, dy = 0, vx = 0, vy = 0, scale = 1, angle = 0;
};
struct Recognizer {
    GestureKind kind = GestureKind::Tap;
    int taps = 0, fingers = 0, duration = 0;
    bool group = false, disposed = false, enabled = true, prevented = false;
    bool system = false;
    int32_t bindId = 0;
    ArkUI_GestureRecognizerState state = ARKUI_GESTURE_RECOGNIZER_STATE_DETECTING;
    ArkUI_GesturePriority priority = NORMAL;
    double threshold = -1;
    ArkUI_GestureMask mask = NORMAL_GESTURE_MASK;
    double allowableMovement = 15; // recorded SDK default px, not a UIKit claim
    ArkUI_GroupGestureMode mode = EXCLUSIVE_GROUP;
    void* data = nullptr;
    void (*callback)(ArkUI_GestureEvent*, void*) = nullptr;
    std::vector<ArkUI_GestureRecognizer*> children;
};
struct BoundGesture {
    ArkUI_GestureRecognizer* description = nullptr;
    std::vector<BoundGesture> children;
};
struct Surface {
    int32_t uniqueId = 0;
    void* touchTestData = nullptr;
    void (*touchTestDone)(ArkUI_GestureEvent*, ArkUI_GestureRecognizerHandleArray, int32_t, void*) = nullptr;
    void* interrupterData = nullptr;
    ArkUI_GestureInterruptResult (*interrupter)(ArkUI_GestureInterruptInfo*) = nullptr;
    std::vector<ArkUI_GestureRecognizer*> attached;
    std::vector<BoundGesture> bound;
    unsigned attachmentCount = 0;
    std::vector<ArkUI_NumberValue> response;
    std::vector<ArkUI_GestureRecognizer*> foreign;
};
struct BorrowedNativeScope {
    static inline thread_local unsigned depth = 0;
    static inline unsigned foreignQueries = 0;
    BorrowedNativeScope() { ++depth; }
    ~BorrowedNativeScope() { --depth; }
};
struct Interrupt {
    void* data; ArkUI_GestureRecognizer* recognizer; Event* event;
    std::vector<ArkUI_GestureRecognizer*> chain;
};
struct NodeEvent { ArkUI_NodeEventType type = NODE_TOUCH_EVENT; Input* input; void* data = nullptr; };
static Recognizer& record(ArkUI_GestureRecognizer* r) { return *reinterpret_cast<Recognizer*>(r); }
static Surface& surface(ArkUI_NodeHandle h) { return *reinterpret_cast<Surface*>(h); }
static const Input& input(const ArkUI_UIInputEvent* i) { return *reinterpret_cast<const Input*>(i); }
static const Event& event(const ArkUI_GestureEvent* e) { return *reinterpret_cast<const Event*>(e); }

extern "C" {
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* e) { return reinterpret_cast<NodeEvent*>(e)->data; }
int32_t OH_ArkUI_NodeUtils_GetNodeUniqueId(ArkUI_NodeHandle h, int32_t* id) {
    *id = surface(h).uniqueId; return 0;
}
ArkUI_ErrorCode OH_ArkUI_GetGestureBindNodeUniqueId(const ArkUI_GestureRecognizer* r, int32_t* id) {
    *id = record(const_cast<ArkUI_GestureRecognizer*>(r)).bindId; return ARKUI_ERROR_CODE_NO_ERROR;
}
int32_t OH_ArkUI_UIInputEvent_GetSourceType(const ArkUI_UIInputEvent* i) { return input(i).source; }
int32_t OH_ArkUI_UIInputEvent_GetDeviceId(const ArkUI_UIInputEvent* i) { return input(i).device; }

ArkUI_ErrorCode OH_ArkUI_SetTouchTestDoneCallback(ArkUI_NodeHandle h, void* data,
    void (*callback)(ArkUI_GestureEvent*, ArkUI_GestureRecognizerHandleArray, int32_t, void*)) {
    surface(h).touchTestData = data; surface(h).touchTestDone = callback;
    return ARKUI_ERROR_CODE_NO_ERROR;
}
int32_t OH_ArkUI_GetGestureRecognizerState(ArkUI_GestureRecognizer* r, ArkUI_GestureRecognizerState* state) {
    require(!record(r).disposed, "state query after SDK disposal");
    if (record(r).system) {
        require(BorrowedNativeScope::depth != 0, "borrowed foreign state queried after native callback returned");
        ++BorrowedNativeScope::foreignQueries;
    }
    *state = record(r).state; return 0;
}
ArkUI_ErrorCode OH_ArkUI_LongPressGesture_GetAllowableMovement(ArkUI_GestureRecognizer* r, double* movement) {
    require(!record(r).disposed, "movement query after SDK disposal");
    *movement = record(r).allowableMovement; return ARKUI_ERROR_CODE_NO_ERROR;
}
bool OH_ArkUI_IsBuiltInGesture(ArkUI_GestureRecognizer* r) { return record(r).system; }
bool OH_ArkUI_GestureInterruptInfo_GetSystemFlag(const ArkUI_GestureInterruptInfo* info) {
    return record(reinterpret_cast<const Interrupt*>(info)->recognizer).system;
}
int32_t OH_ArkUI_GetResponseRecognizersFromInterruptInfo(const ArkUI_GestureInterruptInfo* info,
        ArkUI_GestureRecognizerHandleArray* chain, int32_t* count) {
    auto* value = const_cast<Interrupt*>(reinterpret_cast<const Interrupt*>(info));
    *chain = value->chain.data(); *count = static_cast<int32_t>(value->chain.size()); return 0;
}

ArkUI_NodeEventType OH_ArkUI_NodeEvent_GetEventType(ArkUI_NodeEvent* e) {
    return reinterpret_cast<NodeEvent*>(e)->type;
}
ArkUI_UIInputEvent* OH_ArkUI_NodeEvent_GetInputEvent(ArkUI_NodeEvent* e) {
    return reinterpret_cast<ArkUI_UIInputEvent*>(reinterpret_cast<NodeEvent*>(e)->input);
}
int32_t OH_ArkUI_UIInputEvent_GetAction(const ArkUI_UIInputEvent* i) { return input(i).action; }
int64_t OH_ArkUI_UIInputEvent_GetEventTime(const ArkUI_UIInputEvent* i) { return input(i).timestamp; }
uint32_t OH_ArkUI_PointerEvent_GetPointerCount(const ArkUI_UIInputEvent* i) { return input(i).pointers.size(); }
int32_t OH_ArkUI_PointerEvent_GetPointerId(const ArkUI_UIInputEvent* i, uint32_t n) { return input(i).pointers.at(n).id; }
int32_t OH_ArkUI_PointerEvent_GetChangedPointerId(const ArkUI_UIInputEvent* i, uint32_t* n) {
    *n = input(i).changed; return 0;
}
float OH_ArkUI_PointerEvent_GetCurrentLocalX(const ArkUI_UIInputEvent* i) {
    return input(i).pointers.empty() ? 0 : input(i).pointers.at(input(i).changed).x;
}
float OH_ArkUI_PointerEvent_GetCurrentLocalY(const ArkUI_UIInputEvent* i) {
    return input(i).pointers.empty() ? 0 : input(i).pointers.at(input(i).changed).y;
}
float OH_ArkUI_PointerEvent_GetWindowXByIndex(const ArkUI_UIInputEvent* i, uint32_t n) { return input(i).pointers.at(n).x; }
float OH_ArkUI_PointerEvent_GetWindowYByIndex(const ArkUI_UIInputEvent* i, uint32_t n) { return input(i).pointers.at(n).y; }
float OH_ArkUI_PointerEvent_GetCurrentLocalXByIndex(const ArkUI_UIInputEvent* i, uint32_t n) { return input(i).pointers.at(n).x; }
float OH_ArkUI_PointerEvent_GetCurrentLocalYByIndex(const ArkUI_UIInputEvent* i, uint32_t n) { return input(i).pointers.at(n).y; }
ArkUI_GestureEventActionType OH_ArkUI_GestureEvent_GetActionType(const ArkUI_GestureEvent* e) { return event(e).action; }
const ArkUI_UIInputEvent* OH_ArkUI_GestureEvent_GetRawInputEvent(const ArkUI_GestureEvent* e) {
    return reinterpret_cast<ArkUI_UIInputEvent*>(event(e).input);
}
float OH_ArkUI_PanGesture_GetOffsetX(const ArkUI_GestureEvent* e) { return event(e).dx; }
float OH_ArkUI_PanGesture_GetOffsetY(const ArkUI_GestureEvent* e) { return event(e).dy; }
float OH_ArkUI_PanGesture_GetVelocityX(const ArkUI_GestureEvent* e) { return event(e).vx; }
float OH_ArkUI_PanGesture_GetVelocityY(const ArkUI_GestureEvent* e) { return event(e).vy; }
float OH_ArkUI_PinchGesture_GetScale(const ArkUI_GestureEvent* e) { return event(e).scale; }
float OH_ArkUI_RotationGesture_GetAngle(const ArkUI_GestureEvent* e) { return event(e).angle; }
void* OH_ArkUI_GestureInterrupter_GetUserData(ArkUI_GestureInterruptInfo* e) { return reinterpret_cast<Interrupt*>(e)->data; }
ArkUI_GestureRecognizer* OH_ArkUI_GestureInterruptInfo_GetRecognizer(const ArkUI_GestureInterruptInfo* e) {
    return reinterpret_cast<const Interrupt*>(e)->recognizer;
}
ArkUI_GestureEvent* OH_ArkUI_GestureInterruptInfo_GetGestureEvent(const ArkUI_GestureInterruptInfo* e) {
    return reinterpret_cast<ArkUI_GestureEvent*>(reinterpret_cast<const Interrupt*>(e)->event);
}
int32_t OH_ArkUI_SetGestureRecognizerLimitFingerCount(ArkUI_GestureRecognizer* r, bool) {
    require(!record(r).disposed, "finger policy on disposed recognizer"); return 0;
}
int32_t OH_ArkUI_SetGestureRecognizerEnabled(ArkUI_GestureRecognizer* r, bool enabled) {
    require(!record(r).disposed, "enabled policy on disposed recognizer"); record(r).enabled = enabled; return 0;
}
bool OH_ArkUI_IsGestureRecognizerValid(ArkUI_GestureRecognizer* r) { return !record(r).disposed; }
ArkUI_ErrorCode OH_ArkUI_PreventGestureRecognizerBegin(ArkUI_GestureRecognizer* r) {
    require(!record(r).disposed, "prevent-begin on disposed recognizer"); record(r).prevented = true; return ARKUI_ERROR_CODE_NO_ERROR;
}
}

struct PlainNode : GestureNode, std::enable_shared_from_this<PlainNode> {
    std::shared_ptr<GesturePlatform> platform;
    Surface native;
    std::function<void(PlainNode&)> onFinalRelease;
    std::weak_ptr<PlainNode> parent;
    uint64_t mountEpoch = 0;
    std::string mountedRootName;
    std::shared_ptr<GestureNode> gestureParent() const noexcept override { return parent.lock(); }
    uint64_t gestureMountEpoch() const noexcept override { return mountEpoch; }
    bool mounted = true, wheelOwns = false, admitted = true, unregistered = false;
    explicit PlainNode(std::shared_ptr<GesturePlatform> p) : platform(std::move(p)) {
        handle = reinterpret_cast<ArkUI_NodeHandle>(&native);
        frame.width = 100; frame.height = 80;
    }
    ~PlainNode() override { if (onFinalRelease) onFinalRelease(*this); }
    // The verifier copies this exact method from the selected production
    // manager. The teardown regression must exercise the production port.
#include "gesture-retain-port.hpp"
    std::shared_ptr<GesturePlatform> gesturePlatform() const override { return platform; }
    bool gestureInputEnabled() const override {
        if (!mounted || !handle || disposing || !touchEnabled || platform->stopped ||
            platform->suspended || platform->shuttingDown) return false;
        auto owner = parent.lock();
        return !owner || owner->gestureInputEnabled();
    }
    GestureLocation convertGestureLocation(GesturePoint physical) const override {
        auto logical = logicalPoint(physical, frame.width, rtl);
        auto absolute = logical;
        if (auto owner = parent.lock())
            absolute = addLogicalFrame(logical, frame.x, frame.y, frame.width, owner->frame.width, owner->rtl);
        return {logical, absolute};
    }
    bool gestureWheelOwns(const ArkUI_GestureInterruptInfo*) override { return wheelOwns; }
    void gestureIntercept(const ArkUI_UIInputEvent*, bool value) override { admitted = value; }
    void gestureTouchDown() override {}
    void setGestureTouchEnabled(bool value) override {
        touchEnabled = value; cancelGestures(*this); refreshGestures(*this);
    }
    void unregisterGestureInput() override { unregistered = true; }
};

#include "gesture-input-port.hpp"

struct Scene {
    static Scene* current;
    ArkUI_NativeNodeAPI_1 api {};
    ArkUI_NativeGestureAPI_1 gestures {};
    ArkUI_NativeGestureAPI_2 gestures2 {};
    std::shared_ptr<GesturePlatform> platform;
    std::vector<std::shared_ptr<PlainNode>> nodes;
    std::vector<std::unique_ptr<Recognizer>> recognizers;
    std::vector<std::string> errors;
    int failedClearsRemaining = 0;
    ArkUI_GestureRecognizer* reuseNext = nullptr;
    std::function<void(ArkUI_GestureRecognizer*)> afterDispose;
    std::shared_ptr<bool> callbacksActive = std::make_shared<bool>(true);
    std::mutex mutex;
    std::condition_variable condition;
    std::deque<DispatchFunction> queued;

    static BoundGesture bindDescription(ArkUI_GestureRecognizer* r) {
        BoundGesture bound {r, {}};
        for (auto* child : record(r).children) bound.children.push_back(bindDescription(child));
        return bound;
    }
    ArkUI_GestureRecognizer* create(GestureKind kind) {
        // Address-reuse regressions deliberately target leaf wrappers. A
        // populated-group rebuild may allocate its group descriptions first.
        if (reuseNext && kind != GestureKind::Count) {
            auto* reused = std::exchange(reuseNext, nullptr);
            require(record(reused).disposed, "SDK wrapper address is reusable only after disposal");
            record(reused) = Recognizer {};
            record(reused).kind = kind;
            return reused;
        }
        auto r = std::make_unique<Recognizer>(); r->kind = kind;
        auto* result = reinterpret_cast<ArkUI_GestureRecognizer*>(r.get());
        recognizers.push_back(std::move(r)); return result;
    }
    Scene() {
        current = this;
        ArkUIConfiguration configuration;
        configuration.displayScale = 2;
        configuration.isUIThread = [] { return true; };
        configuration.reportError = [this](const std::string& message) { errors.push_back(message); };
        configuration.dispatchUI = [this](DispatchFunction fn, bool sync) {
            if (sync) { fn(); return; }
            { std::lock_guard lock(mutex); queued.push_back(std::move(fn)); }
            condition.notify_one();
        };
        platform = std::make_shared<GesturePlatform>(std::move(configuration));
        platform->api = &api; platform->gestures = &gestures; platform->gestures2 = &gestures2;
        gestures2.gestureApi1 = &gestures;
        api.resetAttribute = [](ArkUI_NodeHandle h, ArkUI_NodeAttributeType type) -> int32_t {
            require(type == NODE_RESPONSE_REGION, "unexpected reset attribute");
            surface(h).response.clear(); return 0;
        };
        api.setAttribute = [](ArkUI_NodeHandle h, ArkUI_NodeAttributeType type, const ArkUI_AttributeItem* item) -> int32_t {
            require(type == NODE_RESPONSE_REGION, "unexpected native attribute");
            surface(h).response = {item->value, item->value + item->size}; return 0;
        };
        gestures.createTapGesture = [](int32_t taps, int32_t fingers) {
            auto* r = current->create(taps == 2 ? GestureKind::DoubleTap : GestureKind::Tap);
            record(r).taps = taps; record(r).fingers = fingers; return r;
        };
        gestures.createTapGestureWithDistanceThreshold = [](int32_t taps, int32_t fingers, double) {
            auto* r = current->create(taps == 2 ? GestureKind::DoubleTap : GestureKind::Tap);
            record(r).taps = taps; record(r).fingers = fingers; return r;
        };
        gestures.getGestureType = [](ArkUI_GestureRecognizer* r) -> ArkUI_GestureRecognizerType {
            switch (record(r).kind) {
                case GestureKind::Tap: case GestureKind::DoubleTap: return TAP_GESTURE;
                case GestureKind::LongPress: return LONG_PRESS_GESTURE;
                case GestureKind::Drag: case GestureKind::RootPan: return PAN_GESTURE;
                case GestureKind::Pinch: return PINCH_GESTURE;
                case GestureKind::Rotate: return ROTATION_GESTURE;
                default: return GROUP_GESTURE;
            }
        };
        gestures.createLongPressGesture = [](int32_t fingers, bool repeat, int32_t duration) {
            require(!repeat, "long press must not repeat");
            auto* r = current->create(GestureKind::LongPress);
            record(r).duration = duration; record(r).fingers = fingers; return r;
        };
        gestures.createPanGesture = [](int32_t fingers, ArkUI_GestureDirectionMask directions, double distance) {
            auto* r = current->create(directions == GESTURE_DIRECTION_HORIZONTAL ? GestureKind::RootPan : GestureKind::Drag);
            record(r).fingers = fingers; record(r).threshold = distance; return r;
        };
        gestures.createPinchGesture = [](int32_t fingers, double distance) {
            auto* r = current->create(GestureKind::Pinch); record(r).fingers = fingers; record(r).threshold = distance; return r;
        };
        gestures.createRotationGesture = [](int32_t fingers, double angle) {
            auto* r = current->create(GestureKind::Rotate); record(r).fingers = fingers; record(r).threshold = angle; return r;
        };
        gestures.createGroupGesture = [](ArkUI_GroupGestureMode mode) {
            auto* r = current->create(GestureKind::Count); record(r).group = true; record(r).mode = mode; return r;
        };
        gestures.addChildGesture = [](ArkUI_GestureRecognizer* group, ArkUI_GestureRecognizer* child) -> int32_t {
            record(group).children.push_back(child); return 0;
        };
        gestures.removeChildGesture = [](ArkUI_GestureRecognizer* group, ArkUI_GestureRecognizer* child) -> int32_t {
            auto& children = record(group).children; std::erase(children, child); return 0;
        };
        gestures.dispose = [](ArkUI_GestureRecognizer* r) {
            require(!record(r).disposed, "native recognizer disposed twice"); record(r).disposed = true;
            auto callback = current->afterDispose;
            if (callback) callback(r);
        };
        gestures.setGestureEventTarget = [](ArkUI_GestureRecognizer* r, ArkUI_GestureEventActionTypeMask mask,
                                            void* data, void (*fn)(ArkUI_GestureEvent*, void*)) -> int32_t {
            require(mask == 15, "all native event boundaries must be observed");
            record(r).data = data; record(r).callback = fn; return 0;
        };
        gestures.addGestureToNode = [](ArkUI_NodeHandle h, ArkUI_GestureRecognizer* r,
                                       ArkUI_GesturePriority priority, ArkUI_GestureMask mask) -> int32_t {
            record(r).priority = priority; record(r).mask = mask; record(r).bindId = surface(h).uniqueId;
            surface(h).attached.push_back(r);
            // Source-backed structural boundary: AttachGesture immediately
            // calls UpdateModifierGestureHierarchy/CreateRecognizer. Later
            // AddChildGesture mutates the description, not this bound tree.
            surface(h).bound.push_back(bindDescription(r));
            ++surface(h).attachmentCount;
            return 0;
        };
        gestures.removeGestureFromNode = [](ArkUI_NodeHandle h, ArkUI_GestureRecognizer* r) -> int32_t {
            std::erase(surface(h).attached, r);
            std::erase_if(surface(h).bound, [r](const auto& item) { return item.description == r; });
            return 0;
        };
        gestures2.setGestureInterrupterToNode = [](ArkUI_NodeHandle h, void* data,
                        ArkUI_GestureInterruptResult (*fn)(ArkUI_GestureInterruptInfo*)) -> int32_t {
            if (!fn && current->failedClearsRemaining > 0) {
                --current->failedClearsRemaining; return 401;
            }
            surface(h).interrupterData = data; surface(h).interrupter = fn; return 0;
        };
    }
    std::shared_ptr<PlainNode> node() {
        auto result = std::make_shared<PlainNode>(platform);
        result->native.uniqueId = 100 + int(nodes.size());
        nodes.push_back(result); return result;
    }
    Ref<ValueFunction> callback(std::function<Value(const ValueFunctionCallContext&)> fn) {
        return makeShared<ValueFunctionWithCallable>(
            [alive = callbacksActive, fn = std::move(fn)](const ValueFunctionCallContext& c) {
                return *alive ? fn(c) : Value();
            });
    }
    void action(PlainNode& n, const char* name, Ref<ValueFunction> fn) {
        require(gestureAttribute(n, StringBox::fromCString(name), Value(fn)), "public gesture attribute must be handled");
    }
    ArkUI_GestureRecognizer* leaf(PlainNode& n, GestureKind kind) {
        std::vector<ArkUI_GestureRecognizer*> pending = n.native.attached;
        for (size_t i = 0; i < pending.size(); ++i) {
            auto& r = record(pending[i]);
            if (!r.group && r.kind == kind) return pending[i];
            pending.insert(pending.end(), r.children.begin(), r.children.end());
        }
        throw std::runtime_error("REGRESSION: recognizer not attached");
    }
    ArkUI_GestureRecognizer* boundLeaf(PlainNode& n, GestureKind kind) {
        std::vector<BoundGesture> pending = n.native.bound;
        for (size_t i = 0; i < pending.size(); ++i) {
            const auto& bound = pending[i];
            if (!record(bound.description).group && record(bound.description).kind == kind)
                return bound.description;
            auto children = bound.children;
            pending.insert(pending.end(), children.begin(), children.end());
        }
        return nullptr;
    }
    std::vector<ArkUI_GestureRecognizer*> responsePath(PlainNode& n) {
        // Supply a declared SDK boundary trace, not a physical recognizer.
        // Child paths include ancestor leaves; separate roots remain separate.
        std::vector<ArkUI_GestureRecognizer*> result;
        for (auto owner = n.shared_from_this(); owner; owner = owner->parent.lock()) {
            result.insert(result.end(), owner->native.foreign.begin(), owner->native.foreign.end());
            std::vector<ArkUI_GestureRecognizer*> pending = owner->native.attached;
            for (size_t i = 0; i < pending.size(); ++i) {
                auto& r = record(pending[i]);
                if (!r.group) result.push_back(pending[i]);
                pending.insert(pending.end(), r.children.begin(), r.children.end());
            }
        }
        return result;
    }
    void raw(PlainNode& n, Input& input, ArkUI_NodeEventType type = NODE_TOUCH_EVENT) {
        if (input.action == UI_TOUCH_EVENT_ACTION_DOWN && type == NODE_TOUCH_EVENT && n.native.touchTestDone &&
            !n.weak_from_this().expired()) {
            auto chain = responsePath(n);
            Event e {GESTURE_EVENT_ACTION_ACCEPT, &input};
            BorrowedNativeScope nativeScope;
            n.native.touchTestDone(reinterpret_cast<ArkUI_GestureEvent*>(&e), chain.data(),
                                   static_cast<int32_t>(chain.size()), n.native.touchTestData);
        }
        NodeEvent e {type, &input}; gestureInputEvent(n, reinterpret_cast<ArkUI_NodeEvent*>(&e));
    }
    void emit(ArkUI_GestureRecognizer* r, Event e) {
        require(!record(r).disposed && record(r).callback, "SDK event userdata must remain alive");
        record(r).callback(reinterpret_cast<ArkUI_GestureEvent*>(&e), record(r).data);
    }
    ArkUI_GestureInterruptResult admit(PlainNode& n, ArkUI_GestureRecognizer* r, Event& e,
                                      std::vector<ArkUI_GestureRecognizer*> chain = {}) {
        if (chain.empty()) chain = responsePath(n);
        Interrupt i {n.native.interrupterData, r, &e, std::move(chain)};
        BorrowedNativeScope nativeScope;
        return n.native.interrupter(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&i));
    }
    bool drain(bool wait = false) {
        std::deque<DispatchFunction> work;
        {
            std::unique_lock lock(mutex);
            if (wait) condition.wait_for(lock, std::chrono::seconds(2), [&] { return !queued.empty(); });
            work.swap(queued);
        }
        for (auto& fn : work) fn();
        return !work.empty();
    }
    ~Scene() {
        // Local test observations have already left scope during exception
        // unwinding. Suppress only fixture teardown observers in that phase.
        *callbacksActive = false;
        for (auto& n : nodes) cancelGestures(*n, true);
        while (drain()) {}
        for (auto& r : recognizers) require(r->disposed, "allocated recognizer leaked");
        nodes.clear(); current = nullptr;
    }
};
Scene* Scene::current = nullptr;

static void rawOrder() {
    Scene s; auto n = s.node(); Input i;
    std::vector<std::string> order; std::vector<Value> events; std::vector<int> flags;
    s.action(*n, "onTouchStart", s.callback([&](const auto&) { order.push_back("begin"); return Value(); }));
    s.action(*n, "onTouch", s.callback([&](const auto& c) {
        order.push_back("all"); events.push_back(c.getParameters()[0]); flags.push_back(c.getFlags()); return Value();
    }));
    s.action(*n, "onTouchEnd", s.callback([&](const auto&) { order.push_back("end"); return Value(); }));
    double before = TimePoint::now().getTime();
    s.raw(*n, i); i.action = UI_TOUCH_EVENT_ACTION_MOVE; s.raw(*n, i);
    i.action = UI_TOUCH_EVENT_ACTION_UP; s.raw(*n, i); s.raw(*n, i);
    require(order == std::vector<std::string>{"begin", "all", "all", "all", "end"}, "raw begin/all and all/end order, one terminal");
    require(number(events.back(), "pointerCount") == 0, "lifted last raw pointer must be excluded");
    require(number(events.front(), "eventTime") >= before, "timestamps must use the Valdi runtime clock");
    require(flags == std::vector<int>{ValueFunctionFlagsBoundedMainThreadSync, ValueFunctionFlagsAllowThrottling,
                                     ValueFunctionFlagsBoundedMainThreadSync}, "only Changed may be throttled");
}

static void multiPointer() {
    Scene s; auto n = s.node(); Input i;
    n->rtl = true; std::vector<Value> events;
    s.action(*n, "onTouch", s.callback([&](const auto& c) { events.push_back(c.getParameters()[0]); return Value(); }));
    s.raw(*n, i); i.pointers.push_back({25, 80, 50}); i.changed = 1; s.raw(*n, i);
    i.action = UI_TOUCH_EVENT_ACTION_UP; i.changed = 0; s.raw(*n, i);
    require(number(events.back(), "state") == 1 && number(events.back(), "pointerCount") == 1,
            "partial UP continues raw touch with only remaining pointer");
    auto* pointers = events.back().getMapValue(STRING_LITERAL("pointerLocations")).getArray();
    require(pointers && pointers->size() == 1 && number((*pointers)[0], "pointerId") == 25, "remaining pointer identity");
    require(number((*pointers)[0], "x") == 40, "pointerLocations retain physical local x while event x is logical");
    i.pointers.erase(i.pointers.begin()); i.changed = 0; s.raw(*n, i);
    require(number(events.back(), "state") == 2 && number(events.back(), "pointerCount") == 0, "final remaining finger ends");
}

static void continuousLifetime() {
    Scene s; auto n = s.node(); Input i; std::vector<Value> events;
    n->rtl = true;
    s.action(*n, "onDrag", s.callback([&](const auto& c) { events.push_back(c.getParameters()[0]); return Value(); }));
    auto* drag = s.leaf(*n, GestureKind::Drag);
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i, 20, 30, 100, 200};
    require(s.admit(*n, drag, e) == GESTURE_INTERRUPT_RESULT_CONTINUE, "plain node accepts native drag");
    s.emit(drag, e); e.action = GESTURE_EVENT_ACTION_UPDATE; s.emit(drag, e);
    require(number(events[0], "deltaX") == -10 && number(events[0], "velocityX") == -50, "logical drag delta/velocity in points");
    // Replacing another handler must preserve this recognizer and its sequence.
    s.action(*n, "onTap", s.callback([](const auto&) { return Value(); }));
    require(s.leaf(*n, GestureKind::Drag) == drag, "unrelated recognizer changes must not recreate/cancel accepted drag");
    require(events.size() == 2, "unrelated attributes must not synthesize drag Ended");
    e.action = GESTURE_EVENT_ACTION_CANCEL; e.input = nullptr; s.emit(drag, e); s.emit(drag, e);
    require(events.size() == 3 && number(events.back(), "state") == 2, "one native Cancel terminal mapped to Ended");
    require(number(events.back(), "deltaX") == -10, "Cancel retains last real measurement");
    cancelGestures(*n);
    e.action = GESTURE_EVENT_ACTION_ACCEPT; e.input = &i;
    s.emit(drag, e);
    require(events.size() == 3, "retired SDK ACCEPT cannot resurrect a sequence");
}

static void reentry() {
    Scene s; auto n = s.node(); Input i; int begins = 0, all = 0, ends = 0;
    s.action(*n, "onTouchStart", s.callback([&](const auto&) { ++begins; cancelGestures(*n); return Value(); }));
    s.action(*n, "onTouch", s.callback([&](const auto& c) {
        if (number(c.getParameters()[0], "state") == 2) { ++all; cancelGestures(*n); }
        return Value();
    }));
    s.action(*n, "onTouchEnd", s.callback([&](const auto&) { ++ends; return Value(); }));
    s.raw(*n, i);
    require(begins == 1 && all == 1 && ends == 1, "nested cancellation snapshots both terminals without duplicate end");
    s.action(*n, "onDrag", s.callback([](const auto&) { return Value(); }));
    s.action(*n, "onDragPredicate", s.callback([&](const auto&) {
        n->mounted = false; cancelGestures(*n); return Value(true);
    }));
    auto* drag = s.leaf(*n, GestureKind::Drag); Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    require(s.admit(*n, drag, e) == GESTURE_INTERRUPT_RESULT_REJECT, "predicate unmount invalidates true result");
}

static void delayed() {
    Scene s; auto n = s.node(); Input i; std::vector<Value> events;
    s.action(*n, "onTouch", s.callback([&](const auto& c) { events.push_back(c.getParameters()[0]); return Value(); }));
    gestureAttribute(*n, STRING_LITERAL("onTouchDelayDuration"), Value(.01));
    s.raw(*n, i); i.action = UI_TOUCH_EVENT_ACTION_MOVE; i.pointers[0].x = 90; s.raw(*n, i);
    require(events.empty(), "delayed raw touch ignores movement before activation");
    require(s.drain(true), "delayed native deadline must enqueue on UI");
    require(events.size() == 1 && number(events[0], "state") == 0 && number(events[0], "x") == 10,
            "delayed Started uses last admitted DOWN, ignoring preactivation moves");
    i.action = UI_TOUCH_EVENT_ACTION_CANCEL; s.raw(*n, i);
    require(events.size() == 2 && number(events.back(), "state") == 2, "delayed active cancellation ends");
}

static void liveHandlers() {
    Scene s; auto n = s.node(); Input i;
    int oldDrag = 0, newDrag = 0, oldRaw = 0, newRaw = 0, newEnd = 0;
    s.action(*n, "onDrag", s.callback([&](const auto&) { ++oldDrag; return Value(); }));
    auto* drag = s.leaf(*n, GestureKind::Drag);
    s.emit(drag, {GESTURE_EVENT_ACTION_ACCEPT, &i});
    s.action(*n, "onDrag", s.callback([&](const auto&) { ++newDrag; return Value(); }));
    s.emit(drag, {GESTURE_EVENT_ACTION_UPDATE, &i});
    s.emit(drag, {GESTURE_EVENT_ACTION_END, &i});
    require(oldDrag == 1 && newDrag == 2, "accepted continuous sequence reads current handler on Changed/Ended");
    s.action(*n, "onTouch", s.callback([&](const auto&) { ++oldRaw; return Value(); }));
    s.raw(*n, i);
    s.action(*n, "onTouch", s.callback([&](const auto&) { ++newRaw; return Value(); }));
    s.action(*n, "onTouchEnd", s.callback([&](const auto&) { ++newEnd; return Value(); }));
    i.action = UI_TOUCH_EVENT_ACTION_MOVE; s.raw(*n, i);
    i.action = UI_TOUCH_EVENT_ACTION_UP; s.raw(*n, i);
    require(oldRaw == 1 && newRaw == 2 && newEnd == 1, "raw touch reads current all/end handlers after replacement");
}

static void delayedFastUpAndChange() {
    Scene s; auto n = s.node(); Input i;
    std::vector<Value> events;
    s.action(*n, "onTouch", s.callback([&](const auto& c) { events.push_back(c.getParameters()[0]); return Value(); }));
    gestureAttribute(*n, STRING_LITERAL("onTouchDelayDuration"), Value(1.0));
    s.raw(*n, i);
    gestureAttribute(*n, STRING_LITERAL("onTouchDelayDuration"), Value(2.0));
    require(events.empty() && n->touchPending, "updating raw delay must not cancel the pending sequence");
    i.action = UI_TOUCH_EVENT_ACTION_UP; s.raw(*n, i);
    require(events.size() == 1 && number(events[0], "state") == 2, "fast UP before delay emits Ended without synthetic Started");
    while (s.drain()) {}
    require(events.size() == 1, "cancelled delay cannot emit a late Started");
}

static void pointerModelsAndPredicates() {
    Scene s; auto n = s.node(); Input i;
    i.pointers.push_back({54, 60, 70}); n->rtl = true;
    std::vector<Value> events; Value predicate;
    s.action(*n, "onPinch", s.callback([&](const auto& c) { events.push_back(c.getParameters()[0]); return Value(); }));
    s.action(*n, "onPinchPredicate", s.callback([&](const auto& c) { predicate = c.getParameters()[0]; return Value(1); }));
    auto* pinch = s.leaf(*n, GestureKind::Pinch);
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i}; e.scale = 1.7;
    require(s.admit(*n, pinch, e) == GESTURE_INTERRUPT_RESULT_CONTINUE, "predicates use official Value::toBool coercion");
    s.emit(pinch, e);
    auto pointerValue = events[0].getMapValue(STRING_LITERAL("pointerLocations"));
    const auto* pointers = pointerValue.getArray();
    require(pointers && pointers->size() == 2 && number((*pointers)[0], "pointerId") == 0 &&
            number((*pointers)[1], "pointerId") == 1, "recognizer-derived pointers use current local indexes");
    require(number(events[0], "x") == 80 && number((*pointers)[0], "x") == 10, "centroid event RTL and physical pointer coordinates");
    require(near(number(events[0], "scale"), 1.7), "native pinch scale unchanged");
    require(number(predicate, "state") == 3, "unaccepted continuous native candidate is Possible");
    s.action(*n, "onTap", s.callback([](const auto&) { return Value(); }));
    s.action(*n, "onTapPredicate", s.callback([&](const auto& c) { predicate = c.getParameters()[0]; return Value(true); }));
    auto* tap = s.leaf(*n, GestureKind::Tap);
    s.admit(*n, tap, e);
    require(number(predicate, "state") == 2, "discrete candidate predicate observes Ended, not hardcoded Possible");
}

static void physicalInsets() {
    Scene s; auto n = s.node(); n->rtl = true;
    gestureAttribute(*n, STRING_LITERAL("touchAreaExtension"), Value(4.0));
    gestureAttribute(*n, STRING_LITERAL("touchAreaExtensionLeft"), Value(12.0));
    require(n->native.response.size() == 4 && n->native.response[0].f32 == -12,
            "physical Left extension must not swap under RTL");
    resetGestureAttribute(*n, STRING_LITERAL("touchAreaExtensionLeft"));
    require(n->native.response[0].f32 == -4, "edge reset exposes shorthand");
    resetGestureAttribute(*n, STRING_LITERAL("touchAreaExtension"));
    require(n->native.response.empty(), "reset all extensions clears native response region");
}

static void predicateReenable() {
    Scene s; auto n = s.node(); Input i; int actions = 0; bool changed = false;
    s.action(*n, "onDrag", s.callback([&](const auto&) { ++actions; return Value(); }));
    s.action(*n, "onDragPredicate", s.callback([&](const auto&) {
        if (!changed) {
            changed = true;
            gestureAttribute(*n, STRING_LITERAL("onDragDisabled"), Value(true));
            resetGestureAttribute(*n, STRING_LITERAL("onDragDisabled"));
        }
        return Value(true);
    }));
    auto* old = s.leaf(*n, GestureKind::Drag);
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    require(s.admit(*n, old, e) == GESTURE_INTERRUPT_RESULT_REJECT,
            "predicate disable/re-enable cannot admit the retired native leaf");
    require(!record(old).enabled, "retiring a current native recognizer must disable it at the SDK boundary");
    s.emit(old, e);
    require(actions == 0, "retired leaf cannot deliver after predicate reentry");
    auto* replacement = s.leaf(*n, GestureKind::Drag);
    require(replacement != old && s.admit(*n, replacement, e) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "replacement leaf has independent admission");
    s.emit(replacement, e);
    require(actions == 1, "replacement starts exactly once");
}

static void expiredRetentionMustNotTerminate() {
    try {
        if (auto error = std::current_exception()) std::rethrow_exception(error);
    } catch (const std::bad_weak_ptr&) {
        std::fputs("REGRESSION: expired production retention threw during final-owner teardown\n", stderr);
        std::_Exit(75);
    } catch (const std::exception& error) {
        std::fprintf(stderr, "REGRESSION: unexpected teardown failure: %s\n", error.what());
    }
    std::_Exit(76);
}

static void finalOwnerRelease(bool active, bool publicClaim = false) {
    Scene s;
    // Deliberately bypass Scene::nodes: reset below releases the final shared
    // owner while the native handle is still live, with no pre-cancellation.
    auto n = std::make_shared<PlainNode>(s.platform);
    std::weak_ptr<PlainNode> weak = n;
    Input i;
    int destroyed = 0, terminals = 0;
    if (active) {
        s.action(*n, "onDrag", s.callback([&](const auto& c) {
            if (number(c.getParameters()[0], "state") == 2) ++terminals;
            return Value();
        }));
        s.emit(s.leaf(*n, GestureKind::Drag), {GESTURE_EVENT_ACTION_ACCEPT, &i});
    }
    if (publicClaim) {
        int calls = 0;
        s.action(*n, "onTap", s.callback([&](const auto&) { ++calls; return Value(); }));
        s.raw(*n, i); i.action = UI_TOUCH_EVENT_ACTION_UP; s.raw(*n, i);
        auto* tap = s.leaf(*n, GestureKind::Tap); Event event {GESTURE_EVENT_ACTION_ACCEPT, &i};
        require(s.admit(*n, tap, event) == GESTURE_INTERRUPT_RESULT_CONTINUE, "public claim tap admits");
        s.emit(tap, event);
        require(calls == 1, "weak-ownership teardown control has a published public claim");
        // Do not leave a fixture callback referring to a block-local counter.
        s.action(*n, "onTap", s.callback([](const auto&) { return Value(); }));
    }
    n->onFinalRelease = [&](PlainNode& dying) {
        require(weak.expired() && dying.handle, "final owner is gone before live-handle teardown");
        dying.disposing = true; // Production Node::dispose sets this first.
        cancelGestures(dying, true);
        require(dying.unregistered && !dying.gestureSet, "null retention must still unregister and retire native state");
        require(!dying.native.interrupter && !dying.native.interrupterData, "teardown clears native raw userdata hook");
        dying.handle = nullptr;
        ++destroyed;
    };
    auto previous = std::set_terminate(expiredRetentionMustNotTerminate);
    n.reset();
    std::set_terminate(previous);
    require(weak.expired() && destroyed == 1, "final-owner release completes without resurrection");
    require(terminals == (active ? 1 : 0), "active teardown consumes one terminal without requiring another shared owner");
    while (s.drain()) {}
    for (const auto& r : s.recognizers) require(r->disposed, "final release drains native recognizer retirement");
}

static void finalOwnerEmpty() { finalOwnerRelease(false); }
static void finalOwnerActive() { finalOwnerRelease(true); }
static void finalOwnerPublishedTap() { finalOwnerRelease(false, true); }

static void expiredRetentionCallbacks() {
    Scene s;
    auto n = std::make_shared<PlainNode>(s.platform);
    Input i;
    int actions = 0, destroyed = 0;
    s.action(*n, "onDrag", s.callback([&](const auto&) { ++actions; return Value(); }));
    auto* leaf = s.leaf(*n, GestureKind::Drag);
    auto interrupt = n->native.interrupter;
    auto* userdata = n->native.interrupterData;
    std::weak_ptr<PlainNode> weak = n;
    n->onFinalRelease = [&](PlainNode& dying) {
        require(weak.expired() && dying.handle, "callback test reaches expired ownership with valid object storage");
        dying.disposing = true;
        Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
        Interrupt info {userdata, leaf, &e};
        // Object storage is valid throughout its destructor. This represents
        // an in-flight callback before unregistration, never a post-free call.
        require(interrupt(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&info)) == GESTURE_INTERRUPT_RESULT_REJECT,
                "noexcept interruption safely rejects expired production retention");
        s.raw(dying, i);
        s.emit(leaf, e);
        require(actions == 0, "expired raw and recognizer callbacks do not deliver or resurrect the node");
        cancelGestures(dying, true);
        dying.handle = nullptr;
        ++destroyed;
    };
    auto previous = std::set_terminate(expiredRetentionMustNotTerminate);
    n.reset();
    std::set_terminate(previous);
    require(weak.expired() && destroyed == 1 && actions == 0, "expired callback path completes final destruction");
    // Slot userdata is still retained by deferred native retirement. Its weak
    // node reference has expired; no raw Node pointer is touched after free.
    s.emit(leaf, {GESTURE_EVENT_ACTION_ACCEPT, &i});
    while (s.drain()) {}
    require(actions == 0, "deferred slot callback after node destruction is ignored");
}

// These cases execute production coordination through public attribute/input/
// callback ports. SDK events are injected; physical recognizer correctness is a
// distinct installed-SDK obligation. No copied production algorithm lives here.
using Deadline = std::chrono::steady_clock;

static void nativeLongPressMapping() {
    Scene s; auto n = s.node();
    s.action(*n, "onLongPress", s.callback([](const auto&) { return Value(); }));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration == 0,
            "unset duration delegates to native default500ms, not an artificial1ms witness");
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(.1234));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration == 124,
            "positive seconds round upward to native integer milliseconds");
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(.0005));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration == 1,
            "positive submillisecond duration explicitly quantizes to1ms");
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(0.0));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration == 0,
            "zero explicitly requests SDK default, never synthetic immediate recognition");
    resetGestureAttribute(*n, STRING_LITERAL("longPressDuration"));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration == 0,
            "reset requests platform default");
}

static void nativeLongPressBounds() {
    Scene s; auto n = s.node();
    for (double invalid : {-1.0, 2147483.648, std::numeric_limits<double>::max(),
                           std::numeric_limits<double>::infinity(),
                           std::numeric_limits<double>::quiet_NaN()}) {
        bool rejected = false;
        try { gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(invalid)); }
        catch (const std::exception&) { rejected = true; }
        require(rejected, "native int32 millisecond bounds are checked without overflow or silent clamp");
    }
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(2147483.646));
    s.action(*n, "onLongPress", s.callback([](const auto&) { return Value(); }));
    require(record(s.leaf(*n, GestureKind::LongPress)).duration >= 2147483646,
            "large representable native durations remain supported");
}

static void nativeLongPressOwnsTiming() {
    Scene s; auto n = s.node(); Input i; int calls = 0; Value received;
    s.action(*n, "onLongPress", s.callback([&](const auto& c) {
        ++calls; received = c.getParameters()[0]; return Value();
    }));
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(1.0));
    s.raw(*n, i); auto* hold = s.leaf(*n, GestureKind::LongPress);
    Input zero = i; zero.timestamp = 0;
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &zero};
    require(s.admit(*n, hold, e) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "native LP admission is not vetoed by an adapter deadline or witness policy");
    s.emit(hold, e);
    require(calls == 1 && number(received, "state") == 0,
            "native LP ACCEPT directly bridges one activation");
    e.action = GESTURE_EVENT_ACTION_END; s.emit(hold, e);
    require(calls == 1, "nonrepeat LongPress activation remains one public callback");
}

static void nativeDurationReplacement() {
    Scene s; auto n = s.node(); Input i; int oldCalls = 0, newCalls = 0;
    s.action(*n, "onLongPress", s.callback([&](const auto&) { ++oldCalls; return Value(); }));
    auto* old = s.leaf(*n, GestureKind::LongPress);
    s.raw(*n, i);
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(.7));
    auto* replacement = s.leaf(*n, GestureKind::LongPress);
    require(replacement != old && !record(old).enabled && record(replacement).duration == 700,
            "duration change replaces only the native LP leaf; no original-DOWN rescheduling");
    s.emit(old, {GESTURE_EVENT_ACTION_ACCEPT, &i});
    require(oldCalls == 0, "retired native duration cannot dispatch after replacement");
    s.action(*n, "onLongPress", s.callback([&](const auto&) { ++newCalls; return Value(); }));
    require(s.leaf(*n, GestureKind::LongPress) == replacement, "handler replacement preserves native recognizer");
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    require(s.admit(*n, replacement, e) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "replacement leaf uses native admission");
    s.emit(replacement, e);
    require(newCalls == 1 && oldCalls == 0, "native activation reads current handler");
}

static void nativeDoubleTapOnly() {
    Scene s; auto n = s.node(); Input i; int calls = 0;
    s.action(*n, "onDoubleTap", s.callback([&](const auto& c) {
        ++calls; require(number(c.getParameters()[0], "state") == 2, "double tap bridges Ended"); return Value();
    }));
    auto* twice = s.leaf(*n, GestureKind::DoubleTap); Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    require(record(twice).taps == 2 &&
            s.admit(*n, twice, e) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "count2 native qualification needs no adapter150ms/raw-UP ledger");
    s.emit(twice, e); require(calls == 1, "qualified SDK double tap directly reaches Valdi");
    size_t taps = 0;
    for (const auto& r : s.recognizers) if (!r->disposed && !r->group &&
        (r->kind == GestureKind::Tap || r->kind == GestureKind::DoubleTap)) ++taps;
    require(taps == 1, "double-tap-only configuration creates no private count1 validity witness");
}

static void nativeGroupMapping() {
    Scene s; auto n = s.node(); auto noop = s.callback([](const auto&) { return Value(); });
    for (const char* name : {"onTap", "onDoubleTap", "onLongPress", "onDrag", "onPinch", "onRotate"})
        s.action(*n, name, noop);
    require(n->native.attached.size() == 1, "public native group attaches once");
    const auto& root = record(n->native.attached[0]);
    require(root.group && root.mode == EXCLUSIVE_GROUP && root.priority == NORMAL &&
            root.mask == NORMAL_GESTURE_MASK,
            "native exclusive group retains ordinary competition with child/built-in gestures");
    require(!root.children.empty() && record(root.children.front()).kind == GestureKind::DoubleTap,
            "native multi-tap candidate is registered before single tap");
    bool parallel = false;
    for (auto* r : root.children) if (record(r).group && record(r).mode == PARALLEL_GROUP) {
        parallel = true; require(record(r).children.size() == 3, "pan/pinch/rotation share native parallel subgroup");
    }
    require(parallel, "continuous compatibility uses native parallel subgroup");
    require(record(s.leaf(*n, GestureKind::Drag)).threshold == 0 &&
            record(s.leaf(*n, GestureKind::Pinch)).threshold == 0,
            "native defaults choose pan/pinch recognition thresholds");
}

static void nativeCallbackAfterDeferredDisposal() {
    Scene s; auto n = s.node(); Input i; int calls = 0;
    s.action(*n, "onTap", s.callback([&](const auto&) { ++calls; return Value(); }));
    auto* tap = s.leaf(*n, GestureKind::Tap);
    auto saved = record(tap).callback; auto* data = record(tap).data;
    cancelGestures(*n, true);
    while (s.drain()) {}
    require(record(tap).disposed, "native wrapper disposal was deferred and completed");
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    saved(reinterpret_cast<ArkUI_GestureEvent*>(&e), data);
    require(calls == 0, "inert userdata remains safe after null-clear/dispose during old event flow");
}

static void nativeRemountRejectsOldArm() {
    Scene s; auto parent = s.node(), n = s.node(); n->parent = parent;
    Input i; int calls = 0;
    s.action(*n, "onTap", s.callback([&](const auto&) { ++calls; return Value(); }));
    auto* old = s.leaf(*n, GestureKind::Tap);
    ++parent->mountEpoch; s.raw(*n, i, NODE_ON_TOUCH_INTERCEPT);
    auto* replacement = s.leaf(*n, GestureKind::Tap);
    require(old != replacement, "fresh native collection gets a current mounted callback arm");
    s.emit(old, {GESTURE_EVENT_ACTION_ACCEPT, &i});
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    require(s.admit(*n, replacement, e) == GESTURE_INTERRUPT_RESULT_CONTINUE, "new arm admits normally");
    s.emit(old, e); s.emit(replacement, e);
    require(calls == 1, "old callbacks before/after new native admission cannot reach rebound context");
}

static void nativeHandlersAndPredicates() {
    Scene s; auto n = s.node(); Input i; Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    for (auto kind : {GestureKind::Tap, GestureKind::DoubleTap, GestureKind::LongPress,
                      GestureKind::Drag, GestureKind::Pinch, GestureKind::Rotate}) {
        const auto name = std::string(gestureNames[size_t(kind)]);
        int calls = 0, predicates = 0;
        s.action(*n, name.c_str(), s.callback([&](const auto&) { ++calls; return Value(); }));
        s.action(*n, (name + "Predicate").c_str(), s.callback([&](const auto&) { ++predicates; return Value(true); }));
        auto* native = s.leaf(*n, kind);
        require(s.admit(*n, native, e) == GESTURE_INTERRUPT_RESULT_CONTINUE && predicates == 1,
                "all six native should-admit callbacks invoke current Valdi predicate");
        s.emit(native, e);
        require(calls == 1, "all six native action callbacks reach current Valdi handler");
        s.action(*n, (name + "Predicate").c_str(), s.callback([](const auto&) { return Value(false); }));
        require(s.admit(*n, native, e) == GESTURE_INTERRUPT_RESULT_REJECT,
                "replaced predicate rejects without recreating native recognizer");
        require(s.leaf(*n, kind) == native, "predicate updates preserve native identity");
        gestureAttribute(*n, StringBox::fromString(name + "Disabled"), Value(true));
        const int afterTerminal = calls;
        s.emit(native, e);
        require(calls == afterTerminal, "disabled native leaf cannot dispatch deferred action");
        resetGestureAttribute(*n, StringBox::fromString(name + "Disabled"));
        resetGestureAttribute(*n, StringBox::fromString(name + "Predicate"));
        auto* replacement = s.leaf(*n, kind);
        require(replacement != native && s.admit(*n, replacement, e) == GESTURE_INTERRUPT_RESULT_CONTINUE,
                "disabled reset rebinds native leaf and predicate reset removes the veto");
        // End before removing the action so callbacks never reference this
        // iteration's counter after it leaves scope.
        s.emit(replacement, {GESTURE_EVENT_ACTION_END, &i});
        resetGestureAttribute(*n, StringBox::fromString(name));
    }
}

static void nativeTouchFlagsAndEdges() {
    Scene s; auto n = s.node(); Input i; int raw = 0;
    s.action(*n, "onTouch", s.callback([&](const auto&) { ++raw; return Value(); }));
    s.action(*n, "hitTest", s.callback([](const auto&) { return Value(false); }));
    s.raw(*n, i, NODE_ON_TOUCH_INTERCEPT); s.raw(*n, i);
    require(!n->admitted && raw == 0, "hitTest rejection filters native raw capture");
    resetGestureAttribute(*n, STRING_LITERAL("hitTest"));
    s.raw(*n, i, NODE_ON_TOUCH_INTERCEPT); s.raw(*n, i);
    require(n->admitted && raw == 1, "hitTest reset restores native interception policy");
    gestureAttribute(*n, STRING_LITERAL("touchEnabled"), Value(false));
    const auto beforeDisabled = raw; s.raw(*n, i);
    require(!n->gestureInputEnabled() && raw == beforeDisabled, "disabled touch binding suppresses raw callbacks");
    resetGestureAttribute(*n, STRING_LITERAL("touchEnabled"));
    require(n->gestureInputEnabled(), "touchEnabled reset restores host input policy");
    for (const char* edge : {"touchAreaExtensionTop", "touchAreaExtensionRight",
                             "touchAreaExtensionBottom", "touchAreaExtensionLeft"}) {
        require(gestureAttribute(*n, StringBox::fromCString(edge), Value(3.0)), "every edge extension is bound");
        require(!n->native.response.empty(), "edge changes write native response region");
        resetGestureAttribute(*n, StringBox::fromCString(edge));
        require(n->native.response.empty(), "each edge reset clears native response region");
    }
    resetGestureAttribute(*n, STRING_LITERAL("onTouch"));
    resetGestureAttribute(*n, STRING_LITERAL("onTouchDelayDuration"));
}

static void nativeFailedClearExpiredOwner() {
    Scene s; auto n = s.node(); Input i;
    s.action(*n, "onTap", s.callback([](const auto&) { return Value(); }));
    auto saved = n->native.interrupter; auto* data = n->native.interrupterData;
    auto* tap = s.leaf(*n, GestureKind::Tap);
    s.failedClearsRemaining = 1;
    cancelGestures(*n, true);
    while (s.drain()) {}
    std::weak_ptr<PlainNode> weak = n;
    s.nodes.clear(); n.reset();
    require(weak.expired(), "failed clear userdata must not retain Node");
    Event e {GESTURE_EVENT_ACTION_ACCEPT, &i};
    Interrupt info {data, tap, &e, {}};
    require(saved(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&info)) == GESTURE_INTERRUPT_RESULT_REJECT,
            "failed clear and final release leave inert valid callback userdata");
}

template<class Host>
static void* rawUserdata(Host& host) {
    if constexpr (requires { gestureInputUserData(host); }) return gestureInputUserData(host);
    else return &host;
}
static void nativeRawExpiredUserdata() {
    Scene s; auto n = s.node(); Input input; int calls = 0;
    s.action(*n, "onTouch", s.callback([&](const auto&) { ++calls; return Value(); }));
    NodeEvent e {NODE_TOUCH_EVENT, &input, rawUserdata(*n)};
    productionInput(reinterpret_cast<ArkUI_NodeEvent*>(&e));
    require(calls == 1, "actual production raw adapter routes live callback userdata");
    cancelGestures(*n, true);
    std::weak_ptr<PlainNode> weak = n; s.nodes.clear(); n.reset();
    require(weak.expired(), "raw callback userdata must not retain Node");
    weak.reset(); // Release make_shared's allocation too, not only the object.
    productionInput(reinterpret_cast<ArkUI_NodeEvent*>(&e));
    require(calls == 2, "late raw callback does not dispatch after the one cancellation terminal");
}

static void nativeWrapperAddressReuse(bool wholeSet) {
    Scene s; auto n = s.node(); Input input; Event event {GESTURE_EVENT_ACTION_ACCEPT, &input};
    int oldCalls = 0, newCalls = 0;
    s.action(*n, "onTap", s.callback([&](const auto&) { ++oldCalls; return Value(); }));
    auto* old = s.leaf(*n, GestureKind::Tap);
    auto oldCallback = record(old).callback;
    auto* oldData = record(old).data;
    if (wholeSet) refreshGestures(*n);
    else gestureAttribute(*n, STRING_LITERAL("onTapDisabled"), Value(true));
    require(!record(old).disposed &&
            s.admit(*n, old, event) == GESTURE_INTERRUPT_RESULT_REJECT,
            "retired owned candidate remains rejected until deferred SDK disposal");
    oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
    require(oldCalls == 0, "pending retired callback userdata is inert");
    while (s.drain()) {}
    require(record(old).disposed, "retired wrapper was actually disposed before forced address reuse");
    require(s.admit(*n, nullptr, event) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "null current recognizer never matches cleared retired native identities");

    // Reinitialize the existing SDK-boundary storage, not a second object at a
    // different address. The production module must forget its old ownership.
    s.reuseNext = old;
    auto* foreign = s.create(GestureKind::Drag);
    record(foreign).system = true;
    const auto foreignResult = s.admit(*n, foreign, event);
    oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
    s.gestures.dispose(foreign);
    require(foreign == old && foreignResult == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "foreign wrapper reusing disposed owned address follows native competition");
    require(oldCalls == 0, "completed disposal preserves inert old callback userdata");

    if (wholeSet) {
        gestureAttribute(*n, STRING_LITERAL("onTapDisabled"), Value(true));
        while (s.drain()) {}
    }
    s.action(*n, "onTap", s.callback([&](const auto&) { ++newCalls; return Value(); }));
    s.reuseNext = old;
    gestureAttribute(*n, STRING_LITERAL("onTapDisabled"), Value(false));
    auto* replacement = s.leaf(*n, GestureKind::Tap);
    require(replacement == old && s.admit(*n, replacement, event) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "fresh owned wrapper at reused address routes to newest native identity");
    oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
    s.emit(replacement, event);
    require(oldCalls == 0 && newCalls == 1, "only new configuration dispatches after owned address reuse");
}

static void nativeLeafAddressReuse() { nativeWrapperAddressReuse(false); }
static void nativeSetAddressReuse() { nativeWrapperAddressReuse(true); }

static void nativeDisposeReentry() {
    for (bool wholeSet : {false, true}) {
        Scene s; auto n = s.node(); Input input; Event event {GESTURE_EVENT_ACTION_ACCEPT, &input};
        int calls = 0;
        s.action(*n, "onTap", s.callback([&](const auto&) { ++calls; return Value(); }));
        auto* old = s.leaf(*n, GestureKind::Tap);
        auto oldCallback = record(old).callback;
        auto* oldData = record(old).data;
        auto duringDispose = GESTURE_INTERRUPT_RESULT_REJECT;
        bool reused = false;
        s.afterDispose = [&](ArkUI_GestureRecognizer* native) {
            if (native != old || reused) return;
            reused = true;
            s.reuseNext = native;
            auto* foreign = s.create(GestureKind::Drag);
            record(foreign).system = true;
            duringDispose = s.admit(*n, foreign, event);
            oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
        };
        if (wholeSet) refreshGestures(*n);
        else gestureAttribute(*n, STRING_LITERAL("onTapDisabled"), Value(true));
        while (s.drain()) {}
        s.afterDispose = {};
        s.gestures.dispose(old);
        require(reused && duringDispose == GESTURE_INTERRUPT_RESULT_CONTINUE && calls == 0,
                "native identity is cleared before SDK dispose can synchronously reenter with reused address");
    }
}

static void nativeInitialBinding() {
    Scene s; auto n = s.node(); Input input; Event event {GESTURE_EVENT_ACTION_ACCEPT, &input};
    int actions = 0, predicates = 0;
    s.action(*n, "onTap", s.callback([&](const auto&) { ++actions; return Value(); }));
    s.action(*n, "onTapPredicate", s.callback([&](const auto&) { ++predicates; return Value(true); }));
    auto* tap = s.boundLeaf(*n, GestureKind::Tap);
    require(tap, "initial native attachment contains configured Tap, not an empty group snapshot");
    require(s.admit(*n, tap, event) == GESTURE_INTERRUPT_RESULT_CONTINUE,
            "bound Tap reaches the real current predicate");
    s.emit(tap, event);
    require(predicates == 1 && actions == 1, "only actually bound native leaf delivers predicate and action");
}

static void nativeUpdatedBinding() {
    Scene s; auto n = s.node(); Input input; Event event {GESTURE_EVENT_ACTION_ACCEPT, &input};
    int current = 0;
    s.action(*n, "onTap", s.callback([](const auto&) { return Value(); }));
    // Establish a valid populated native attachment in both versions so this
    // case isolates later updates from the separate initial-install defect.
    auto* group = n->native.attached.front();
    s.gestures.removeGestureFromNode(n->handle, group);
    s.gestures.addGestureToNode(n->handle, group, NORMAL, NORMAL_GESTURE_MASK);
    auto* tap = s.boundLeaf(*n, GestureKind::Tap);
    require(tap, "update case starts with a populated bound native group");
    const auto attachments = n->native.attachmentCount;
    s.action(*n, "onTap", s.callback([&](const auto&) { ++current; return Value(); }));
    s.action(*n, "onTapPredicate", s.callback([](const auto&) { return Value(true); }));
    require(n->native.attachmentCount == attachments && s.boundLeaf(*n, GestureKind::Tap) == tap,
            "same-availability handler/predicate replacement never reattaches native arena");
    require(s.admit(*n, tap, event) == GESTURE_INTERRUPT_RESULT_CONTINUE, "live handler replacement remains admitted");
    s.emit(tap, event); require(current == 1, "bound native leaf reads current handler");
    s.action(*n, "onDoubleTap", s.callback([](const auto&) { return Value(); }));
    require(s.boundLeaf(*n, GestureKind::DoubleTap), "new availability reaches bound SDK tree after installation");
    gestureAttribute(*n, STRING_LITERAL("onTapDisabled"), Value(true));
    require(!s.boundLeaf(*n, GestureKind::Tap), "disabled leaf is absent from bound SDK tree");
    s.action(*n, "onLongPress", s.callback([](const auto&) { return Value(); }));
    auto* oldHold = s.boundLeaf(*n, GestureKind::LongPress);
    require(oldHold, "new LongPress reaches bound SDK tree");
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(.7));
    auto* hold = s.boundLeaf(*n, GestureKind::LongPress);
    require(hold && hold != oldHold && record(hold).duration == 700,
            "duration replacement commits populated native tree with new duration");
}

static void nativeRebindActiveSequence() {
    Scene s; auto n = s.node(); Input input; Event event {GESTURE_EVENT_ACTION_ACCEPT, &input};
    std::vector<int> states; int raw = 0, roots = 0;
    n->rootDragObserver.admit = [](float, float, float, float) { return true; };
    n->rootDragObserver.onEvent = [&](const auto&) { ++roots; };
    s.action(*n, "onDrag", s.callback([&](const auto& c) {
        states.push_back(int(number(c.getParameters()[0], "state"))); return Value();
    }));
    s.action(*n, "onLongPress", s.callback([](const auto&) { return Value(); }));
    s.action(*n, "onTouch", s.callback([&](const auto&) { ++raw; return Value(); }));
    auto* drag = s.boundLeaf(*n, GestureKind::Drag);
    require(drag, "active update begins from a bound native drag");
    auto oldCallback = record(drag).callback; auto* oldData = record(drag).data;
    auto* root = s.boundLeaf(*n, GestureKind::RootPan);
    require(root, "separate host RootPan remains bound");
    s.raw(*n, input); s.emit(drag, event); s.emit(root, event);
    gestureAttribute(*n, STRING_LITERAL("longPressDuration"), Value(.6));
    require(states == std::vector<int>({0, 2}), "public native rebind consumes old accepted sequence exactly once");
    require(raw == 1 && roots == 1 && s.boundLeaf(*n, GestureKind::RootPan) == root,
            "public rebind does not synthesize raw or host RootPan cancellation");
    oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
    event.action = GESTURE_EVENT_ACTION_UPDATE;
    oldCallback(reinterpret_cast<ArkUI_GestureEvent*>(&event), oldData);
    require(states.size() == 2, "old callback arm cannot revive after public native rebind");
    auto* replacement = s.boundLeaf(*n, GestureKind::Drag);
    require(replacement && replacement != drag, "new public native tree has a fresh callback arm");
    event.action = GESTURE_EVENT_ACTION_ACCEPT; s.emit(replacement, event);
    event.action = GESTURE_EVENT_ACTION_END; s.emit(replacement, event); s.emit(root, event);
    require(states == std::vector<int>({0, 2, 0, 2}) && roots == 2,
            "replacement sequence and retained host observer finish independently");
}

int main(int argc, char** argv) {
 try {
  std::string test = argc > 1 ? argv[1] : "all";
  for (auto [name, fn] : std::vector<std::pair<std::string, void(*)()>>{
    {"native-initial-binding", nativeInitialBinding},
    {"native-updated-binding", nativeUpdatedBinding},
    {"native-rebind-active", nativeRebindActiveSequence},
    {"native-leaf-address-reuse", nativeLeafAddressReuse},
    {"native-set-address-reuse", nativeSetAddressReuse},
    {"native-dispose-reentry", nativeDisposeReentry},
    {"native-raw-expired-userdata", nativeRawExpiredUserdata},
    {"native-all-handlers-predicates", nativeHandlersAndPredicates},
    {"native-touch-flags-edges", nativeTouchFlagsAndEdges},
    {"native-failed-clear-expired-owner", nativeFailedClearExpiredOwner},
    {"native-longpress-mapping", nativeLongPressMapping},
    {"native-longpress-bounds", nativeLongPressBounds},
    {"native-longpress-admission", nativeLongPressOwnsTiming},
    {"native-duration-replace", nativeDurationReplacement},
    {"native-double-only", nativeDoubleTapOnly},
    {"native-groups", nativeGroupMapping},
    {"deferred-callback-fence", nativeCallbackAfterDeferredDisposal},
    {"native-remount-arm", nativeRemountRejectsOldArm},
    {"raw-order", rawOrder},
    {"multi-pointer", multiPointer},
    {"continuous-lifetime", continuousLifetime},
    {"reentry", reentry},
    {"delayed", delayed},
    {"live-handlers", liveHandlers},
    {"delay-fast-up-change", delayedFastUpAndChange},
    {"pointer-models-predicates", pointerModelsAndPredicates},
    {"physical-insets", physicalInsets},
    {"predicate-reenable", predicateReenable},
    {"final-owner-empty", finalOwnerEmpty},
    {"final-owner-active", finalOwnerActive},
    {"final-owner-published-tap", finalOwnerPublishedTap},
    {"expired-retention-callbacks", expiredRetentionCallbacks}
  }) { if (test == "all" || test == name) { fn(); std::printf("PASS %s\n", name.c_str()); } }
 } catch (const std::exception& e) { std::fprintf(stderr, "%s\n", e.what()); return 1; }
}
