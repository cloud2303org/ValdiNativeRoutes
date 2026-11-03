// Real production wheel bodies and Valdi values; only the ArkUI/UI dispatcher
// boundary is supplied here. This is host execution, not rendered device proof.
#include <arkui/native_node.h>
#include <arkui/native_gesture.h>
#include <arkui/node_attributes/picker.h>
#include <arkui/ui_input_event.h>
#include "valdi_core/cpp/Utils/Value.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunction.hpp"
#include "valdi_core/cpp/Utils/ValueUtils.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include "valdi_core/cpp/Context/PlatformType.hpp"
#include "WheelState.hpp"
#include <cmath>
#include <functional>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <utility>

struct FakeNode {
    bool alive = true;
    ArkUI_NodeType type;
    uint32_t selected = 0;
    bool loop = true;
    float itemHeight = 0;
    ArkUI_NodeHandle parent = nullptr;
    void* range = nullptr;
    std::vector<std::string> labels;
    std::map<ArkUI_NodeEventType, void*> events;
    void (*receiver)(ArkUI_NodeEvent*) = nullptr;
    int measuredWidth = -1, measuredHeight = -1, x = -1, y = -1;
};
struct ArkUI_TextPickerRangeContentArray { std::vector<std::string> labels; };
struct ArkUI_LayoutConstraint { int32_t width = 0, height = 0; };
struct FakeEvent { void* data; ArkUI_NodeEventType type; ArkUI_NodeComponentEvent component {}; int action = -1; };
struct FakeInterrupt { void* data; ArkUI_NodeHandle candidate; ArkUI_NodeHandle touch; };
static std::vector<std::unique_ptr<FakeNode>> nodes;
static int failAllocation = -1, liveRanges = 0, writes = 0;
static bool failMount = false;
static FakeNode& record(ArkUI_NodeHandle node) {
    if (!node) throw std::runtime_error("REGRESSION: disposed native handle observed before deferred retirement");
    return *reinterpret_cast<FakeNode*>(node);
}
static void require(bool value, const char* text) {
    if (!value) throw std::runtime_error(std::string("REGRESSION: ") + text);
}
extern "C" {
ArkUI_TextPickerRangeContentArray* OH_ArkUI_TextPickerRangeContentArray_Create(int32_t count) {
    if (failAllocation == 0) return nullptr;
    if (failAllocation > 0) --failAllocation;
    ++liveRanges;
    return new ArkUI_TextPickerRangeContentArray {std::vector<std::string>(size_t(count))};
}
void OH_ArkUI_TextPickerRangeContentArray_SetTextAtIndex(ArkUI_TextPickerRangeContentArray* array, char* text, int32_t i) {
    array->labels.at(size_t(i)) = text;
}
void OH_ArkUI_TextPickerRangeContentArray_Destroy(ArkUI_TextPickerRangeContentArray* array) { --liveRanges; delete array; }
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) { return reinterpret_cast<FakeEvent*>(event)->data; }
ArkUI_NodeEventType OH_ArkUI_NodeEvent_GetEventType(ArkUI_NodeEvent* event) { return reinterpret_cast<FakeEvent*>(event)->type; }
ArkUI_NodeComponentEvent* OH_ArkUI_NodeEvent_GetNodeComponentEvent(ArkUI_NodeEvent* event) {
    return &reinterpret_cast<FakeEvent*>(event)->component;
}
ArkUI_UIInputEvent* OH_ArkUI_NodeEvent_GetInputEvent(ArkUI_NodeEvent* event) {
    return reinterpret_cast<ArkUI_UIInputEvent*>(event);
}
int32_t OH_ArkUI_UIInputEvent_GetAction(const ArkUI_UIInputEvent* event) {
    return reinterpret_cast<const FakeEvent*>(event)->action;
}
ArkUI_LayoutConstraint* OH_ArkUI_LayoutConstraint_Create() { return new ArkUI_LayoutConstraint; }
void* OH_ArkUI_LayoutConstraint_Dispose(ArkUI_LayoutConstraint* value) { delete value; return nullptr; }
void OH_ArkUI_LayoutConstraint_SetMinWidth(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetMinHeight(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetMaxWidth(ArkUI_LayoutConstraint* value, int32_t width) { value->width = width; }
void OH_ArkUI_LayoutConstraint_SetMaxHeight(ArkUI_LayoutConstraint* value, int32_t height) { value->height = height; }
void OH_ArkUI_LayoutConstraint_SetPercentReferenceWidth(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetPercentReferenceHeight(ArkUI_LayoutConstraint*, int32_t) {}
void* OH_ArkUI_GestureInterrupter_GetUserData(ArkUI_GestureInterruptInfo* info) { return reinterpret_cast<FakeInterrupt*>(info)->data; }
ArkUI_GestureRecognizer* OH_ArkUI_GestureInterruptInfo_GetRecognizer(const ArkUI_GestureInterruptInfo* info) {
    return reinterpret_cast<ArkUI_GestureRecognizer*>(reinterpret_cast<const FakeInterrupt*>(info)->candidate);
}
int32_t OH_ArkUI_GestureInterruptInfo_GetTouchRecognizers(const ArkUI_GestureInterruptInfo* info,
        ArkUI_TouchRecognizerHandleArray* result, int32_t* count) {
    static ArkUI_TouchRecognizerHandle touch;
    touch = reinterpret_cast<ArkUI_TouchRecognizerHandle>(reinterpret_cast<const FakeInterrupt*>(info)->touch);
    *result = &touch; *count = touch ? 1 : 0; return 0;
}
ArkUI_NodeHandle OH_ArkUI_TouchRecognizer_GetNodeHandle(const ArkUI_TouchRecognizerHandle touch) {
    return reinterpret_cast<ArkUI_NodeHandle>(touch);
}
bool OH_ArkUI_TouchRecognizer_IsHostBelongsTo(const ArkUI_TouchRecognizerHandle touch, int32_t id) {
    auto handle = reinterpret_cast<ArkUI_NodeHandle>(touch);
    while (handle) {
        if (int32_t(reinterpret_cast<uintptr_t>(handle) & 0x7fffffff) == id) return true;
        handle = record(handle).parent;
    }
    return false;
}
int32_t OH_ArkUI_NodeUtils_GetNodeUniqueId(ArkUI_NodeHandle node, int32_t* id) {
    *id = int32_t(reinterpret_cast<uintptr_t>(node) & 0x7fffffff); return 0;
}
ArkUI_ErrorCode OH_ArkUI_GetGestureBindNodeUniqueId(const ArkUI_GestureRecognizer* recognizer, int32_t* id) {
    OH_ArkUI_NodeUtils_GetNodeUniqueId(reinterpret_cast<ArkUI_NodeHandle>(const_cast<ArkUI_GestureRecognizer*>(recognizer)), id);
    return ARKUI_ERROR_CODE_NO_ERROR;
}
}

namespace Valdi::Harmony::detail {
using DispatchFunction = std::function<void()>;
struct Node;
struct Backend {
    struct {
        float displayScale = 2;
        std::function<void(DispatchFunction, bool)> dispatchUI;
    } configuration;
    ArkUI_NativeNodeAPI_1* api = nullptr;
    bool suspended = false, stopped = false, shuttingDown = false;
    std::vector<Node*> nodes;
    std::vector<std::string> errors;
    void live() const { if (stopped) throw std::runtime_error("stopped"); }
    void report(const std::string& error) { errors.push_back(error); }
};
[[noreturn]] static void fail(const std::string& text) { throw std::runtime_error(text); }
static void check(int32_t code, const char* text) { if (code) fail(text); }
#include "wheel-declaration.inc"
struct Inactive { ArkUI_NodeHandle handle = nullptr, content = nullptr; };
struct Node : std::enable_shared_from_this<Node> {
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr, content = nullptr, hostParent = nullptr;
    bool disposing = false, imageAttachmentEnabled = true, touchEnabled = true;
    std::weak_ptr<Node> parent;
    std::vector<std::shared_ptr<Node>> children;
    std::shared_ptr<NativeWheel> wheel;
    std::shared_ptr<Inactive> input, scroll, refresh;
    std::function<bool()> scrollBlurCurrent;
    int invalidations = 0;
    void invalidate() { ++invalidations; }
    void live() const;
    void set(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, const ArkUI_AttributeItem& item);
    void number(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, float value);
    void integer(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, int32_t value);
    void string(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, const std::string& value);
};
#include "wheel-node-production.inc"
#include "wheel-arbitration-production.inc"
#include "wheel-production.inc"
}
using namespace Valdi;
using namespace Valdi::Harmony::detail;
struct Callback : ValueFunction {
    std::function<void(const std::string&)> fn;
    std::function<void(const Value&)> objectFn;
    bool tearingDown = false;
    Value operator()(const ValueFunctionCallContext& context) noexcept override {
        try {
            if (objectFn) objectFn(context.getParameter(0));
            else fn(context.getParameterAsString(0).slowToString());
        }
        catch (const std::exception& error) { context.getExceptionTracker().onError(Error(error.what())); }
        return Value::undefined();
    }
    std::string_view getFunctionType() const override { return "wheel-host-test"; }
    bool ownerIsTearingDown() const override { return tearingDown; }
};
struct Scene {
    ArkUI_NativeNodeAPI_1 api {};
    std::shared_ptr<Backend> backend = std::make_shared<Backend>();
    std::shared_ptr<Node> root = std::make_shared<Node>();
    std::vector<DispatchFunction> queue;
    std::vector<std::string> calls;
    std::vector<std::vector<std::string>> treeCalls;
    Ref<Callback> callback = makeShared<Callback>();
    Scene(WheelKind kind = WheelKind::Column) {
        backend->api = &api;
        backend->configuration.dispatchUI = [this](DispatchFunction fn, bool sync) {
            require(!sync, "wheel unexpectedly waits for dispatcher"); queue.push_back(std::move(fn));
        };
        api.createNode = [](ArkUI_NodeType type) -> ArkUI_NodeHandle {
            if (failAllocation == 0) return nullptr;
            if (failAllocation > 0) --failAllocation;
            auto next = std::make_unique<FakeNode>(); next->type = type;
            auto handle = reinterpret_cast<ArkUI_NodeHandle>(next.get()); nodes.push_back(std::move(next)); return handle;
        };
        api.disposeNode = [](ArkUI_NodeHandle node) {
            auto& r = record(node);
            require(r.alive && r.events.empty() && !r.receiver && !r.parent, "disposal before unregister/unlink");
            if (r.range) require(r.labels == static_cast<ArkUI_TextPickerRangeContentArray*>(r.range)->labels,
                                 "range lifetime ended before native node");
            r.alive = false;
        };
        api.setAttribute = [](ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, const ArkUI_AttributeItem* item) -> int32_t {
            auto& r = record(node); require(r.alive, "setter on dead node"); ++writes;
            if (attribute == NODE_TEXT_PICKER_OPTION_RANGE) {
                require(item->value[0].i32 == ARKUI_TEXTPICKER_RANGETYPE_RANGE_CONTENT && !item->string, "delimiter range used");
                r.range = item->object; r.labels = static_cast<ArkUI_TextPickerRangeContentArray*>(item->object)->labels;
            }
            if (attribute == NODE_TEXT_PICKER_OPTION_SELECTED) r.selected = item->value[0].u32;
            if (attribute == NODE_TEXT_PICKER_CAN_LOOP) r.loop = item->value[0].i32;
            if (attribute == NODE_TEXT_PICKER_DEFAULT_PICKER_ITEM_HEIGHT) r.itemHeight = item->value[0].f32;
            return 0;
        };
        api.getAttribute = [](ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute) -> const ArkUI_AttributeItem* {
            require(attribute == NODE_TEXT_PICKER_OPTION_SELECTED, "unexpected getter");
            static ArkUI_NumberValue number; number.u32 = record(node).selected;
            static ArkUI_AttributeItem result {&number, 1, nullptr, nullptr}; return &result;
        };
        api.addChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
            if (failMount) return 401;
            record(child).parent = parent; return 0;
        };
        api.removeChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
            require(record(child).parent == parent, "unlink wrong parent"); record(child).parent = nullptr; return 0;
        };
        api.addNodeEventReceiver = [](ArkUI_NodeHandle node, void (*fn)(ArkUI_NodeEvent*)) -> int32_t { record(node).receiver = fn; return 0; };
        api.removeNodeEventReceiver = [](ArkUI_NodeHandle node, void (*)(ArkUI_NodeEvent*)) -> int32_t { record(node).receiver = nullptr; return 0; };
        api.registerNodeEvent = [](ArkUI_NodeHandle node, ArkUI_NodeEventType type, int32_t, void* data) -> int32_t {
            record(node).events[type] = data; return 0;
        };
        api.unregisterNodeEvent = [](ArkUI_NodeHandle node, ArkUI_NodeEventType type) { record(node).events.erase(type); };
        api.measureNode = [](ArkUI_NodeHandle node, ArkUI_LayoutConstraint* c) -> int32_t {
            record(node).measuredWidth = c->width; record(node).measuredHeight = c->height; return 0;
        };
        api.layoutNode = [](ArkUI_NodeHandle node, int32_t x, int32_t y) -> int32_t { record(node).x = x; record(node).y = y; return 0; };
        root->backend = backend; root->handle = api.createNode(ARKUI_NODE_CUSTOM);
        root->content = root->handle; root->wheel = std::make_shared<NativeWheel>(root, kind);
        callback->fn = [this](const std::string& value) { calls.push_back(value); };
        if (kind == WheelKind::Tree) callback->objectFn = [this](const Value& value) {
            require(value.isArray(), "tree callback must be a direct array");
            std::vector<std::string> path;
            for (const auto& part : *value.getArray()) {
                require(part.isString(), "tree callback item must be a string");
                path.push_back(part.toStringBox().slowToString());
            }
            treeCalls.push_back(std::move(path));
        };
        applyWheelAttribute(*root, STRING_LITERAL("onChange"), Value(callback));
    }
    auto wheel() { return root->wheel; }
    void configureValue(const Value& object) { applyWheelAttribute(*root, STRING_LITERAL("config"), object); }
    // JSON is fixture notation only: the actual attribute receives a Value map.
    void configure(const std::string& json) {
        auto parsed = correctJsonToValue(json);
        require(bool(parsed), "invalid test fixture JSON");
        configureValue(parsed.value());
    }
    void drain() {
        for (int i = 0; !queue.empty() && i < 10; ++i) {
            auto work = std::move(queue); queue.clear(); for (auto& fn : work) fn();
        }
        require(queue.empty(), "deferred disposal never drained");
    }
    void emit(const std::shared_ptr<NativeWheel::Control>& c, ArkUI_NodeEventType type, int32_t selected = 0, int action = -1) {
        FakeEvent e {c.get(), type, {}, action}; e.component.data[0].i32 = selected;
        NativeWheel::event(reinterpret_cast<ArkUI_NodeEvent*>(&e));
    }
    void change(size_t column, size_t index, bool settled = true) {
        auto c = wheel()->controls.at(column);
        emit(c, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(c->handle).selected = uint32_t(index);
        emit(c, NODE_TEXT_PICKER_EVENT_ON_CHANGE, int32_t(index));
        require(calls.empty() || settled, "tentative change emitted");
        if (settled) emit(c, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, int32_t(index));
    }
    ~Scene() { if (root->wheel) root->wheel->retire(); drain(); }
};
// Construct object/array fixtures without any JSON transport or parser.
static Value wheelObject(std::initializer_list<std::pair<const char*, Value>> fields) {
    auto map = makeShared<ValueMap>();
    for (const auto& [name, value] : fields) (*map)[StringBox::fromCString(name)] = value;
    return Value(map);
}
static Value treeConfig(const Value& data, const std::vector<std::string>& path, int columns) {
    auto values = ValueArray::make(path.size());
    for (size_t i = 0; i < path.size(); ++i) (*values)[i] = Value(path[i]);
    return wheelObject({{"data", data}, {"value", Value(values)}, {"columns", Value(columns)}});
}

static const std::string columnConfig = R"({"options":[{"value":"a","label":"A;,"},{"value":"b","label":"B"},{"value":"c","label":"C"}],"value":"a"})";
static std::string selectedConfig(char value) {
    auto config = columnConfig; config.replace(config.size() - 3, 1, 1, value); return config;
}

static void checkRetouchSettlement(const std::string& only = "") {
    require(only.empty() || only == "retouch" || only == "cancel" ||
            only == "generation" || only == "successive", "unknown retouch fixture case");
    if (only.empty() || only == "retouch") {
        Scene s; s.configure(columnConfig);
        auto control = s.wheel()->controls[0];
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(control->handle).selected = 1;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_UP);
        require(s.calls.empty() && s.wheel()->state.value == "a", "retouch emitted before settlement");
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        // There is deliberately no second ON_CHANGE: the getter is still b.
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls == std::vector<std::string>{"b"} && s.wheel()->state.value == "b" &&
                s.wheel()->state.echo.pending == std::deque<WheelValue>{std::string("b")},
                "second DOWN discarded the pending stopped selection");
        auto committed = s.wheel()->controls[0];
        s.configure(selectedConfig('b'));
        require(s.wheel()->controls[0] == committed && s.wheel()->state.echo.pending.empty() &&
                s.wheel()->state.echo.acknowledged == WheelValue(std::string("b")), "retouch settlement echo rebuilt or moved the wheel");
        s.drain();
        std::cout << "wheel retouch: pending selection survives second DOWN PASS\n";
    }
    if (only.empty() || only == "cancel") {
        Scene s; s.configure(columnConfig);
        auto control = s.wheel()->controls[0];
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(control->handle).selected = 1;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_UP);
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_CANCEL);
        require(!control->interaction.armed && !control->interaction.tentative,
                "CANCEL retained an armed pending selection");
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls.empty() && s.wheel()->state.value == "a" && s.wheel()->state.echo.pending.empty(),
                "canceled tentative selection crossed the next DOWN");
        record(control->handle).selected = 2;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 2);
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
        require(s.calls == std::vector<std::string>{"c"} && s.wheel()->state.value == "c",
                "fresh change after CANCEL could not settle");
        s.drain();
        std::cout << "wheel retouch: CANCEL clears pending selection PASS\n";
    }
    if (only.empty() || only == "generation") {
        Scene s; s.configure(columnConfig);
        auto previous = s.wheel()->controls[0];
        s.emit(previous, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(previous->handle).selected = 1;
        s.emit(previous, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(previous, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_UP);
        s.configure(selectedConfig('c'));
        auto current = s.wheel()->controls[0];
        require(current != previous && previous->retired && !previous->interaction.armed &&
                !previous->interaction.tentative, "replacement retained old control interaction");
        s.emit(previous, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        s.emit(previous, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(previous, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls.empty() && s.wheel()->state.value == "c", "retired generation delivered pending selection");
        record(current->handle).selected = 1;
        s.emit(current, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        s.emit(current, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls.empty() && s.wheel()->state.value == "c", "new generation inherited a pending index");
        s.emit(current, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(current, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls == std::vector<std::string>{"b"} && s.wheel()->state.value == "b",
                "new generation could not settle its own change");
        s.drain();
        std::cout << "wheel retouch: control generation isolates pending selection PASS\n";
    }
    if (only.empty() || only == "successive") {
        Scene s; s.configure(columnConfig);
        s.change(0, 1);
        auto control = s.wheel()->controls[0];
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(control->handle).selected = 2;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 2);
        record(control->handle).selected = 1;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1);
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_UP);
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
        require(s.calls == std::vector<std::string>{"b"} && s.wheel()->state.value == "b" &&
                s.wheel()->controls[0] == control && !control->interaction.armed && !control->interaction.tentative,
                "return to committed value emitted or retained interaction");
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
        record(control->handle).selected = 2;
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
        require(s.calls == std::vector<std::string>{"b"} && s.wheel()->state.value == "b",
                "completed gesture permanently authorized a later stop");
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 2);
        s.emit(control, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_UP);
        s.emit(control, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
        require(s.calls == std::vector<std::string>({"b", "c"}) && s.wheel()->state.value == "c" &&
                s.wheel()->state.echo.pending == std::deque<WheelValue>({std::string("b"), std::string("c")}),
                "successive completed gestures lost or duplicated settlement");
        s.drain();
        std::cout << "wheel retouch: completed gestures and return to committed value PASS\n";
    }
}

#include "wheel-deferred.inc"

int main(int argc, char** argv) {
    try {
        if (argc > 1 && std::string(argv[1]).rfind("--retouch=", 0) == 0) {
            checkRetouchSettlement(std::string(argv[1]).substr(10));
            return 0;
        }
        checkRetouchSettlement();
        {
            Scene s; s.configure(columnConfig);
            auto c = s.wheel()->controls[0];
            require(record(c->handle).labels[0] == "A;," && !record(c->handle).loop && record(c->handle).itemHeight == 40, "range/loop/row contract");
            record(c->handle).selected = 1;
            s.emit(c, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 1); s.emit(c, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
            require(s.calls.empty(), "programmatic notice emitted");
            record(c->handle).selected = 0;
            s.change(0, 1, false); require(s.calls.empty(), "ON_CHANGE is not settlement");
            s.emit(c, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
            require(s.calls == std::vector<std::string>{"b"}, "settled selection missing");
            s.emit(c, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
            record(c->handle).selected = 2;
            s.emit(c, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 2);
            s.emit(c, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
            require(s.calls.size() == 1, "stale immutable control delivered");
            auto newControl = s.wheel()->controls[0];
            s.change(0, 2);
            s.configure(selectedConfig('b'));
            require(s.wheel()->state.value == "c" && s.wheel()->controls[0] != newControl, "late pending echo moved back");
            s.configure(selectedConfig('b'));
            require(s.wheel()->state.value == "c", "last acknowledged echo moved back");
            s.configure(selectedConfig('c'));
            auto same = s.wheel()->controls[0];
            applyWheelAttribute(*s.root, STRING_LITERAL("onChange"), Value(s.callback));
            s.configure(selectedConfig('c'));
            require(s.wheel()->controls[0] == same, "callback/unchanged config rebuilt");
            resetWheelAttribute(*s.root, STRING_LITERAL("onChange"));
            s.change(0, 0); require(s.calls.size() == 2, "callback reset delivered");
            s.drain();
        }
        // Reset ends the old selection lifetime even if onChange has already
        // been rebound. Exercise callback-before/after-reset and both orders
        // of callback/config application for the next selection lifetime.
        for (bool bindBeforeReset : {false, true}) for (bool callbackFirst : {false, true}) {
            Scene s; s.configure(columnConfig);
            s.change(0, 1); // Leave an unacknowledged echo in the old lifetime.
            auto old = s.wheel()->controls[0];
            s.emit(old, NODE_TOUCH_EVENT, 0, UI_TOUCH_EVENT_ACTION_DOWN);
            record(old->handle).selected = 2;
            s.emit(old, NODE_TEXT_PICKER_EVENT_ON_CHANGE, 2);
            const auto generation = s.wheel()->generation;
            auto replacement = makeShared<Callback>();
            std::vector<std::string> delivered;
            replacement->fn = [&](const std::string& value) { delivered.push_back(value); };
            auto bind = [&] { applyWheelAttribute(*s.root, STRING_LITERAL("onChange"), Value(replacement)); };
            if (bindBeforeReset) bind();
            resetWheelAttribute(*s.root, STRING_LITERAL("config"));
            if (!bindBeforeReset) bind();
            s.emit(old, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
            require(delivered.empty() && s.calls == std::vector<std::string>{"b"}, "config reset delivered old selection to new callback");
            require(s.wheel()->generation > generation && old->retired && !old->interaction.armed &&
                    s.wheel()->controls.empty() && !s.wheel()->state.config && s.wheel()->state.visible.empty() &&
                    s.wheel()->state.path.empty() && s.wheel()->state.value.empty() &&
                    s.wheel()->state.echo.pending.empty() && !s.wheel()->state.echo.acknowledged,
                    "config reset retained controls, selection or echoes");
            require(s.wheel()->onChange.get() == replacement.get(), "config reset cleared independently bound callback");
            s.wheel()->activate();
            require(s.wheel()->controls.empty(), "activation restored reset config");
            if (callbackFirst) bind();
            s.configure(columnConfig);
            if (!callbackFirst) bind();
            s.emit(old, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 2);
            require(delivered.empty(), "new config admitted old generation");
            s.change(0, 1);
            require(delivered == std::vector<std::string>{"b"}, "reset lost callback/config application order");
            s.drain();
        }
        {
            Scene s; s.configure(columnConfig);
            auto c = s.wheel()->controls[0];
            const auto old = s.wheel()->state.publicValue();
            for (const auto& bad : {"null", "[]", "42", R"("old JSON string")", R"({"options":[],"value":"x"})",
                     R"({"options":[{"value":"a","label":"\u0000"}],"value":"a"})"}) {
                bool failed = false; try { s.configure(bad); } catch (...) { failed = true; }
                require(failed && s.wheel()->controls[0] == c && s.wheel()->state.publicValue() == old, "malformed config was not atomic");
            }
            for (int failure = 0; failure < 2; ++failure) {
                failAllocation = failure; bool failed = false;
                try { s.configure(selectedConfig('b')); } catch (...) { failed = true; }
                failAllocation = -1; s.drain();
                require(failed && s.wheel()->controls[0] == c && s.wheel()->state.publicValue() == old, "allocation failure lost committed state");
            }
            failMount = true; bool mountFailed = false;
            try { s.configure(selectedConfig('b')); } catch (...) { mountFailed = true; }
            failMount = false; s.drain();
            require(mountFailed && s.wheel()->controls[0] == c, "mount failure lost old controls");
            const auto cHandle = c->handle;
            s.callback->fn = [&](const std::string& v) {
                require(v == "b" && s.wheel()->state.value == "b" && s.wheel()->state.echo.pending.back() == WheelValue(std::string("b")), "callback before commit/echo");
                s.configure(selectedConfig('b')); s.wheel()->retire(); s.root->disposing = true;
                // Simulate a nested UI loop while the SDK callback is active.
                auto pending = std::move(s.queue); s.queue.clear(); for (auto& fn : pending) fn();
                require(record(cHandle).alive, "control disposed inside active SDK callback");
            };
            s.change(0, 1); s.drain();
            require(s.backend->errors.empty(), "callback reentry failed");
            require(!record(cHandle).alive, "retired control leaked");
        }
        {
            Scene s;
            s.configure(columnConfig); auto c = s.wheel()->controls[0];
            s.change(0, 1, false);
            s.backend->suspended = true; stopSubtreeWheels(*s.root);
            s.emit(c, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
            require(s.calls.empty() && s.wheel()->state.value == "a", "background fabricated selection");
            s.backend->suspended = false; s.wheel()->activate();
            require(s.wheel()->controls[0] != c && s.calls.empty(), "resume reused old motion");
            s.root->content = nullptr; stopSubtreeWheels(*s.root); s.root->content = s.root->handle; s.wheel()->activate();
            s.wheel()->state.echo.pending.push_back(std::string("b")); s.wheel()->stop(true); s.wheel()->activate();
            require(s.wheel()->onChange == nullptr && s.wheel()->state.echo.pending.empty(), "rebind retained callback/history");
            s.drain();
        }
        {
            Scene s; s.configure(columnConfig);
            s.change(0, 1); s.change(0, 2);
            auto structural = columnConfig;
            structural.replace(structural.find("A;,"), 3, "changed");
            s.configure(structural);
            require(s.wheel()->state.echo.pending.empty() && s.wheel()->state.value == "a", "structural change retained echo scope");
            s.callback->tearingDown = true;
            s.change(0, 1);
            require(s.calls.size() == 2 && s.wheel()->state.echo.pending.empty(), "tearing-down callback delivered or retained echo");
            s.drain();
        }
        {
            Scene s(WheelKind::Time);
            auto config = [](const char* mode, const char* value) {
                return std::string("{\"mode\":\"") + mode + "\",\"value\":\"" + value + "\",\"minYear\":1000,\"maxYear\":9999}";
            };
            for (const auto& [mode, value] : std::vector<std::pair<const char*, const char*>>{
                    {"year","1000"}, {"year-month","9999-12"}, {"date","2000-02-29"}, {"time","23:59"}, {"datetime","2000-02-29 23:59"}}) {
                s.configure(config(mode, value)); require(s.wheel()->state.value == value, "five-format roundtrip");
            }
            auto segment = s.wheel()->controls.back();
            s.emit(segment, NODE_ON_CLICK);
            require(s.wheel()->state.timeSegment && s.calls.empty(), "segment change emitted selection");
            s.wheel()->measure(601, 488); s.wheel()->layout();
            require(record(s.wheel()->controls[0]->handle).measuredHeight == 400 &&
                    record(s.wheel()->controls[0]->handle).y == 88, "datetime 44+200 geometry");
            for (int year : {1900, 2000, 2100}) {
                s.configure(config("date", (std::to_string(year) + "-02-29").c_str()));
                require(s.wheel()->state.calendar[2] == (year == 2000 ? 29 : 28), "Gregorian leap century");
            }
            auto previous = s.wheel()->controls[0];
            for (const auto& malformed : {
                    wheelObject({{"mode", Value("date")}, {"value", Value("2000-02-29")}, {"minYear", Value(true)}, {"maxYear", Value(9999)}}),
                    wheelObject({{"mode", Value("date")}, {"value", Value("2000-02-29")}, {"minYear", Value(2000.5)}, {"maxYear", Value(9999)}}),
                    wheelObject({{"mode", Value("date")}, {"value", Value("2000/02/29")}, {"minYear", Value(1000)}, {"maxYear", Value(9999)}})}) {
                bool failed = false;
                try { s.configureValue(malformed); } catch (...) { failed = true; }
                require(failed && s.wheel()->controls[0] == previous, "invalid direct time config replaced controls");
            }
            s.configure(config("date", "2000-01-31")); s.change(1, 1);
            require(s.wheel()->state.value == "2000-02-29" && s.calls.size() == 1, "month/day clamp not atomic");
            s.drain();
        }
        {
            Scene s(WheelKind::Tree);
            s.configure(R"({"data":[{"value":"a","label":"A","children":[{"value":"same","label":"1"},{"value":"other","label":"2"}]},{"value":"a","label":"duplicate","children":[{"value":"wrong","label":"wrong"}]},{"value":"b","label":"B","children":[{"value":"new","label":"3"}]}],"value":["a","other"],"columns":3})");
            require(s.wheel()->state.path == std::vector<std::string>({"a","other"}), "duplicate must choose first match");
            s.change(0, 1);
            require(s.treeCalls.empty() && s.wheel()->state.path == std::vector<std::string>({"a","other"}) &&
                    s.wheel()->state.visible[0].selected == 0, "duplicate parent changed value/suffix");
            auto child = s.wheel()->controls[1];
            s.change(0, 2);
            require(s.treeCalls == std::vector<std::vector<std::string>>{{"b", "new"}}, "changed tree parent did not normalize suffix once");
            s.emit(child, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 1);
            require(s.treeCalls.size() == 1, "retired branch event delivered");
            s.drain();
        }
        {
            Scene s(WheelKind::Tree);
            // More than three levels, punctuation/UTF-8 and control characters
            // survive as literal strings in the returned array and echo key.
            const std::string special = "quote\"\\\n逗,分;";
            auto leaf = wheelObject({{"value", Value(special)}, {"label", Value("leaf")}});
            Value data(ValueArray::make({leaf}));
            std::vector<std::string> path {special};
            for (int depth = 0; depth < 12; ++depth) {
                auto key = "level-" + std::to_string(depth);
                data = Value(ValueArray::make({wheelObject({{"value", Value(key)}, {"label", Value(key)}, {"children", data}})}));
                path.insert(path.begin(), key);
            }
            const auto config = treeConfig(data, path, 20);
            s.configureValue(config);
            require(s.wheel()->state.path == path && s.wheel()->controls.size() == path.size(), "deep tree lost descendants");
            auto current = s.wheel()->controls[0];
            for (const auto& malformed : {
                    Value("legacy JSON config"),
                    treeConfig(data, path, 0),
                    wheelObject({{"data", data}, {"value", Value(ValueArray::make({}))}, {"columns", Value(true)}}),
                    wheelObject({{"data", data}, {"value", Value(ValueArray::make({}))}, {"columns", Value(1.5)}}),
                    wheelObject({{"data", data}, {"value", Value(ValueArray::make({}))}, {"columns", Value(std::numeric_limits<double>::infinity())}}),
                    wheelObject({{"data", data}, {"value", Value("[]")}, {"columns", Value(20)}}),
                    treeConfig(Value(ValueArray::make({wheelObject({{"value", Value("bad")}, {"label", Value("bad")}, {"children", Value()}})})), {}, 3)}) {
                bool failed = false;
                try { s.configureValue(malformed); } catch (...) { failed = true; }
                require(failed && s.wheel()->controls[0] == current && s.wheel()->state.path == path, "malformed direct tree was not atomic");
            }
            Value excessive = data;
            for (int depth = 0; depth < 257; ++depth)
                excessive = Value(ValueArray::make({wheelObject({{"value", Value("x")}, {"label", Value("X")}, {"children", excessive}})}));
            bool rejected = false;
            try { s.configureValue(treeConfig(excessive, {}, 1)); } catch (...) { rejected = true; }
            require(rejected && s.wheel()->controls[0] == current, "excessive tree depth was not rejected atomically");
            s.root->imageAttachmentEnabled = false; s.wheel()->stop();
            s.emit(current, NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP, 0);
            s.root->imageAttachmentEnabled = true; s.wheel()->activate();
            require(s.treeCalls.empty() && s.wheel()->state.path == path && s.wheel()->controls[0] != current, "deep tree detach lost state or delivered stale callback");
            auto boundCallback = s.wheel()->onChange;
            resetWheelAttribute(*s.root, STRING_LITERAL("config"));
            require(s.wheel()->state.path.empty() && !s.wheel()->state.config && s.wheel()->controls.empty() &&
                    s.wheel()->onChange == boundCallback, "tree reset retained path/config or cleared callback");
            // A direct callback can synchronously echo and retire its owner.
            Value choices(ValueArray::make({leaf, wheelObject({{"value", Value("other")}, {"label", Value("Other")}})}));
            s.configureValue(treeConfig(choices, {"other"}, 1));
            s.change(0, 0);
            require(s.treeCalls == std::vector<std::vector<std::string>>{{special}}, "tree callback changed literal characters");
            s.configureValue(treeConfig(choices, {special}, 1));
            s.callback->objectFn = [&](const Value& value) {
                require(value.isArray() && value.getArray()->size() == 1 && (*value.getArray())[0].toStringBox().slowToString() == "other", "tree callback was serialized");
                auto committed = s.wheel()->controls[0];
                s.configureValue(wheelObject({{"data", choices}, {"value", value}, {"columns", Value(1)}}));
                require(s.wheel()->controls[0] == committed && s.wheel()->state.echo.pending.empty(), "direct tree echo rebuilt controls");
                s.wheel()->retire(); s.root->disposing = true;
            };
            s.change(0, 1);
            require(s.backend->errors.empty() && s.wheel()->retired, "tree callback reentry failed");
            s.drain();
        }
        {
            Scene s; s.configure(columnConfig);
            auto parent = std::make_shared<Node>(); parent->backend = s.backend;
            parent->handle = s.api.createNode(ARKUI_NODE_CUSTOM); parent->content = parent->handle;
            parent->scroll = std::make_shared<Inactive>(); parent->scroll->handle = s.api.createNode(ARKUI_NODE_SCROLL);
            s.root->parent = parent; parent->children = {s.root};
            auto touch = s.wheel()->controls[0]->handle;
            FakeInterrupt info {parent.get(), parent->scroll->handle, touch};
            require(interruptWheelAncestor(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&info)) == GESTURE_INTERRUPT_RESULT_REJECT,
                    "Scroll admitted a wheel touch before movement");
            info.candidate = touch;
            require(interruptWheelAncestor(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&info)) == GESTURE_INTERRUPT_RESULT_CONTINUE,
                    "wheel built-in recognizer rejected");
            info.candidate = parent->scroll->handle; info.touch = parent->handle;
            require(interruptWheelAncestor(reinterpret_cast<ArkUI_GestureInterruptInfo*>(&info)) == GESTURE_INTERRUPT_RESULT_CONTINUE,
                    "ordinary Scroll/Refresh priority changed");
            parent->touchEnabled = false; reconcileSubtreeWheels(*parent);
            require(s.wheel()->controls.empty(), "ancestor disable did not invalidate controls");
            parent->touchEnabled = true; reconcileSubtreeWheels(*parent);
            require(!s.wheel()->controls.empty(), "ancestor enable did not recreate controls");
            s.root->parent.reset(); parent->children.clear();
        }
        require(liveRanges == 0, "range arrays leaked");
        if (argc > 1) WheelDeferredProof::replay(argv[1]);
        require(liveRanges == 0, "Deferred wheel ranges leaked");
        std::cout << "wheel native production: settlement, echoes, callback reentry/reset, allocation, lifecycle, calendar, tree, layout, admission PASS\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 75; }
}
