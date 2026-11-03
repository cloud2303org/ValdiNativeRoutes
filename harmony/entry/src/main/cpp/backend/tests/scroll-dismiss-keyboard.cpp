// Behavioral seam: the runner extracts the actual production bodies and struct
// defaults. The SDK is real; only platform calls and Valdi callback/lock types
// are adapted. This cannot prove IME/device behavior.
#include <arkui/native_node.h>
#include <arkui/native_interface_focus.h>
#include "../ScrollState.hpp"
#include "../InputState.hpp"
#include <cassert>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Valdi::Harmony {
template<typename T> using Ref = std::shared_ptr<T>;
using DispatchFunction = std::function<void()>;
struct Point {
    float x = 0, y = 0;
    Point() = default;
    Point(float x, float y) : x(x), y(y) {}
};
struct Size { float width = 0, height = 0; };
struct ValueFunction {
    std::function<void()> fn;
    bool ownerIsTearingDown() const { return false; }
    void operator()(int, std::initializer_list<int>) { if (fn) fn(); }
};
struct Value {
    bool boolean = false;
    Ref<ValueFunction> callback;
    Value() = default;
    explicit Value(bool value) : boolean(value) {}
    bool toBool() const { return boolean; }
    Ref<ValueFunction> getFunctionRef() const { return callback; }
};
struct StringBox : std::string {
    using std::string::string;
    static StringBox fromCString(const char* value) { return StringBox(value); }
    std::string_view toStringView() const { return *this; }
};
struct ViewAttributeHandlerDelegate {};
struct AttributesBindingContext {
    bool scroll = false;
    std::map<std::string, bool> booleans;
    void bindScrollAttributes() { scroll = true; }
    void bindBooleanAttribute(const StringBox& name, bool option, const Ref<ViewAttributeHandlerDelegate>&) {
        booleans[name] = option;
    }
};
constexpr int ValueFunctionFlagsBoundedMainThreadSync = 1;
struct TouchEvents {
    static int makeScrollEvent(float, float, float, float, float, float) { return 0; }
};
namespace detail {
struct Node;
struct Backend {
    ArkUI_NativeNodeAPI_1* api = nullptr;
    bool suspended = false, stopped = false, shuttingDown = false;
    struct {
        float displayScale = 1;
        std::function<void(DispatchFunction, bool)> dispatchUI;
    } configuration;
    std::vector<Node*> nodes;
    std::vector<std::string> errors;
    void live() const { if (stopped || shuttingDown) throw std::runtime_error("backend shut down"); }
    void report(const std::string& value) { errors.push_back(value); }
};
[[noreturn]] static void fail(const std::string& message) { throw std::runtime_error(message); }
static void check(int32_t code, const char* operation) { if (code) fail(operation); }
static int32_t pixels(float value, float scale) {
    if (!std::isfinite(value)) fail("nonfinite test pixels");
    return static_cast<int32_t>(value * scale);
}
#include "scroll-input-declarations.inc"
struct TestTree {
    template<typename Function, typename Deadline> bool tryWithLock(Function fn, Deadline) { fn(); return true; }
};
struct TestViewNode {
    TestTree* tree = nullptr;
    std::function<void()> start, end;
    int starts = 0;
    TestTree* getViewNodeTree() const { return tree; }
    void onDragStart(Point, Point, Point) { ++starts; if (start) start(); }
    std::optional<Point> onScroll(Point, Point, Point) { return std::nullopt; }
    std::optional<Point> onDragEnding(Point, Point, Point) { return std::nullopt; }
    void onScrollEnd(Point, Point) { if (end) end(); }
    struct Ids { int getIdForName(std::string_view) const { return 0; } };
    Ids getAttributeIds() const { return {}; }
    struct Applier { Value getResolvedAttributeValue(int) const { return {}; } };
    Applier getAttributesApplier() const { return {}; }
    float getRtlScrollOffsetX() const { return 0; }
};
struct Node : std::enable_shared_from_this<Node> {
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr;
    ArkUI_NodeContentHandle content = nullptr;
    ArkUI_NodeHandle hostParent = nullptr;
    bool disposing = false, touchEnabled = true;
    std::weak_ptr<Node> parent;
    std::vector<std::shared_ptr<Node>> children;
    std::shared_ptr<NativeScroll> scroll;
    std::shared_ptr<NativeTextInput> input;
    struct RefreshBoundary { ArkUI_NodeHandle handle = nullptr; };
    std::shared_ptr<RefreshBoundary> refresh;
    std::weak_ptr<TestTree> viewNodeTree;
    std::weak_ptr<TestViewNode> viewNode;
    Value lastTouch;
#include "scroll-node-fields.inc"
    void live() const;
    void set(ArkUI_NodeHandle, ArkUI_NodeAttributeType, const ArkUI_AttributeItem&);
    void integer(ArkUI_NodeHandle, ArkUI_NodeAttributeType, int32_t);
    void invalidate() {}
};
struct RawTerminal { bool active = true; };
// Editors are already active in this seam; EDIT_CHANGE delivery is the
// explicit platform boundary in Scene::setAttribute, never this receiver.
void NativeTextInput::event(ArkUI_NodeEvent*) noexcept { std::abort(); }
static std::vector<std::string> trace;
static std::function<void()> rawCallback;
static RawTerminal consumeRawTerminal(Node&, const Value&) { trace.push_back("consume-raw"); return {}; }
static void deliverRawTerminal(Node&, RawTerminal) {
    trace.push_back("raw");
    if (rawCallback) rawCallback();
}
}
}

using namespace Valdi::Harmony;
using namespace Valdi::Harmony::detail;
struct NativeEvent {
    NativeScroll* scroll;
    ArkUI_NodeEventType type;
    ArkUI_NodeComponentEvent component {};
};
extern "C" void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) {
    return reinterpret_cast<NativeEvent*>(event)->scroll;
}
extern "C" ArkUI_NodeEventType OH_ArkUI_NodeEvent_GetEventType(ArkUI_NodeEvent* event) {
    return reinterpret_cast<NativeEvent*>(event)->type;
}
extern "C" ArkUI_NodeComponentEvent* OH_ArkUI_NodeEvent_GetNodeComponentEvent(ArkUI_NodeEvent* event) {
    return &reinterpret_cast<NativeEvent*>(event)->component;
}
static std::function<void(ArkUI_NodeHandle)> nativeFocus;
extern "C" ArkUI_ErrorCode OH_ArkUI_FocusRequest(ArkUI_NodeHandle handle) {
    nativeFocus(handle);
    return ARKUI_ERROR_CODE_NO_ERROR;
}

#include "scroll-dismiss-production.inc"

static void require(bool value, const char* message) {
    if (!value) {
        std::cerr << "REGRESSION: " << message << '\n';
        std::exit(75);
    }
}
template<typename T> static void requireGuardReleased(const T& node) {
    if constexpr (requires { node.scrollBlurCurrent; }) {
        require(!node.scrollBlurCurrent, "temporary blur guard retained tree after return/exception");
    }
}
struct Scene {
    static Scene* current;
    ArkUI_NativeNodeAPI_1 api {};
    std::shared_ptr<Backend> backend = std::make_shared<Backend>();
    std::shared_ptr<Node> root, owner, field, sibling, otherRoot;
    std::shared_ptr<NativeScroll> scroll;
    std::shared_ptr<NativeTextInput> editor;
    std::shared_ptr<TestTree> tree = std::make_shared<TestTree>();
    std::shared_ptr<TestViewNode> view = std::make_shared<TestViewNode>();
    std::vector<std::unique_ptr<int>> handles;
    std::map<ArkUI_NodeHandle, std::shared_ptr<NativeTextInput>> inputs;
    ArkUI_NodeHandle focused = nullptr;
    std::function<void()> editingStopped;
    std::vector<DispatchFunction> queued;
    int editingWrites = 0, focusWrites = 0, samples = 0;
    std::shared_ptr<Node> node(std::shared_ptr<Node> parent = nullptr) {
        auto value = std::make_shared<Node>();
        value->backend = backend;
        handles.push_back(std::make_unique<int>(0));
        value->handle = reinterpret_cast<ArkUI_NodeHandle>(handles.back().get());
        if (parent) { value->parent = parent; parent->children.push_back(value); }
        return value;
    }
    std::shared_ptr<NativeTextInput> input(const std::shared_ptr<Node>& node, bool area = false) {
        auto value = std::make_shared<NativeTextInput>(node, area);
        handles.push_back(std::make_unique<int>(0));
        value->handle = reinterpret_cast<ArkUI_NodeHandle>(handles.back().get());
        value->epoch.active = true;
        node->input = value;
        inputs[value->handle] = value;
        return value;
    }
    void focus(const std::shared_ptr<NativeTextInput>& value) {
        value->focus(true);
        value->requestPendingFocus();
    }
    void property(bool value = true) { (void)scrollAttribute(*owner, "dismissKeyboardOnDrag", Value(value)); }
    void emit(ArkUI_NodeEventType type = NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING) {
        NativeEvent event {scroll.get(), type, {}};
        NativeScroll::event(reinterpret_cast<ArkUI_NodeEvent*>(&event));
    }
    void reparent(const std::shared_ptr<Node>& child, const std::shared_ptr<Node>& parent) {
        if (auto previous = child->parent.lock()) std::erase(previous->children, child);
        child->parent = parent;
        parent->children.push_back(child);
    }
    Scene() {
        current = this;
        trace.clear();
        rawCallback = {};
        backend->api = &api;
        backend->configuration.dispatchUI = [this](DispatchFunction fn, bool sync) {
            if (sync) fn(); else queued.push_back(std::move(fn));
        };
        root = node();
        root->content = reinterpret_cast<ArkUI_NodeContentHandle>(root->handle);
        otherRoot = node();
        otherRoot->content = reinterpret_cast<ArkUI_NodeContentHandle>(otherRoot->handle);
        owner = node(root);
        field = node(owner);
        sibling = node(root);
        scroll = std::make_shared<NativeScroll>(owner);
        scroll->handle = owner->handle;
        owner->scroll = scroll;
        editor = input(field);
        view->tree = tree.get();
        owner->viewNodeTree = tree;
        owner->viewNode = view;
        view->start = [] { trace.push_back("drag"); };
        api.getAttribute = [](ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type) -> const ArkUI_AttributeItem* {
            static ArkUI_NumberValue values[2] {};
            static ArkUI_AttributeItem item {values, 2, nullptr, nullptr};
            if (type == NODE_FOCUS_STATUS) {
                values[0].i32 = current->focused == handle;
                item.size = 1;
            } else {
                assert(type == NODE_SCROLL_OFFSET);
                ++current->samples;
                values[0].f32 = values[1].f32 = 0;
                item.size = 2;
            }
            return &item;
        };
        api.setAttribute = [](ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type,
                              const ArkUI_AttributeItem* item) -> int32_t {
            assert(handle && item && item->value && item->size > 0);
            if (type == NODE_TEXT_INPUT_EDITING || type == NODE_TEXT_AREA_EDITING) {
                assert(item->value[0].i32 == 0);
                ++current->editingWrites;
                trace.push_back("editing");
                // The EDIT_CHANGE notification boundary is adapted. Executed
                // blur/Node writes and subsequent scroll callbacks are real.
                if (current->editingStopped) current->editingStopped();
            } else if (type == NODE_FOCUS_STATUS) {
                assert(item->value[0].i32 == 0);
                ++current->focusWrites;
                trace.push_back("focus");
                // SDK26 docs: zero clears CURRENT page-level focus, even when
                // the supplied handle belongs to an editor replaced in JS.
                current->focused = nullptr;
            }
            return 0;
        };
        nativeFocus = [this](ArkUI_NodeHandle handle) {
            if (auto it = inputs.find(focused); it != inputs.end()) it->second->focused = false;
            focused = handle;
            auto value = inputs.at(handle);
            value->focused = value->requestedFocus = true;
            value->pendingFocus = false;
        };
        focus(editor);
    }
    ~Scene() { nativeFocus = {}; rawCallback = {}; }
    void assertBlur() {
        require(editingWrites == 1 && focusWrites == 1 && focused == nullptr, "accepted drag did not blur intended editor");
        auto drag = std::find(trace.begin(), trace.end(), "drag");
        auto focus = std::find(trace.begin(), trace.end(), "focus");
        require(focus < drag && drag != trace.end(), "blur must precede actual ViewNode drag callback");
    }
    void assertNoBlur() {
        require(editingWrites == 0 && focusWrites == 0, "ineligible/non-drag path blurred an editor");
    }
};
Scene* Scene::current = nullptr;

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    const std::string scenario = argv[1];
    Scene s;
    if (scenario == "binding") {
        AttributesBindingContext binder;
        bindScrollAttributes(binder, nullptr);
        require(binder.scroll && binder.booleans.contains("dismissKeyboardOnDrag") &&
                !binder.booleans.at("dismissKeyboardOnDrag"), "existing Boolean scroll prop is not bound");
        require(scrollAttribute(*s.owner, "dismissKeyboardOnDrag", Value(true)), "Boolean attr was rejected");
    } else if (scenario == "default" || scenario == "false" || scenario == "reset") {
        if (scenario == "false") s.property(false);
        if (scenario == "reset") {
            s.property();
            resetScrollAttribute(*s.owner, "dismissKeyboardOnDrag");
        }
        s.emit();
        s.assertNoBlur();
        require(s.view->starts == 1, "default/false/reset blocked drag callback");
    } else if (scenario == "drag" || scenario == "area" || scenario == "sibling") {
        s.property();
        if (scenario == "area") { s.editor = s.input(s.field, true); s.focus(s.editor); }
        if (scenario == "sibling") { s.reparent(s.field, s.sibling); }
        s.emit();
        s.assertBlur();
        require(trace == std::vector<std::string>({"editing", "focus", "consume-raw", "raw", "drag"}) ||
                (scenario == "sibling" && trace == std::vector<std::string>({"editing", "focus", "drag"})),
                "blur/raw/drag production callback ordering changed");
    } else if (scenario == "duplicate" || scenario == "next-drag") {
        s.property(); s.emit(); s.emit();
        s.assertBlur();
        require(s.view->starts == 1, "duplicate drag admitted twice");
        if (scenario == "next-drag") {
            s.emit(NODE_SCROLL_EVENT_ON_DID_STOP_DRAGGING);
            s.focus(s.editor); s.emit();
            require(s.editingWrites == 2 && s.focusWrites == 2 && s.view->starts == 2, "next independent drag not admitted");
        }
    } else if (scenario.starts_with("independent-blur-") || scenario.starts_with("replacement-focus-")) {
        s.property();
        // Removing the scroll must leave the sibling editor mounted and valid.
        s.reparent(s.field, s.sibling);
        const auto focusGeneration = s.editor->focusGeneration;
        std::shared_ptr<NativeTextInput> replacement;
        int editEnds = 0;
        int startsDuringInvalidation = 0;
        s.editingStopped = [&] {
            if (++editEnds != 1) return; // The nested blur also stops editing.
            trace.push_back("edit-end");
            if (scenario.ends_with("-disabled")) {
                require(scrollAttribute(*s.owner, "scrollEnabled", Value(false)), "scroll disable rejected");
            } else if (scenario.ends_with("-removed")) {
                std::erase(s.root->children, s.owner);
                s.owner->parent.reset();
                s.owner->scroll.reset();
                s.owner->disposing = true;
                s.owner->handle = nullptr;
                s.scroll->retired = true;
            }
            // Disabling may synchronously drain the existing cancellation
            // journal. The original drag must deliver nothing after reentry.
            startsDuringInvalidation = s.view->starts;
            require(s.editor->epoch.active && s.editor->valid(),
                    "scroll invalidation must leave sibling editor active and mounted");
            if (scenario.starts_with("replacement-focus-")) {
                replacement = s.input(s.node(s.root));
                s.focus(replacement);
            } else if (scenario == "independent-blur-rebound") {
                replacement = s.input(s.field);
                s.focus(replacement);
                replacement->focus(false);
            } else {
                require(scenario == "independent-blur-disabled" || scenario == "independent-blur-removed" ||
                        scenario == "independent-blur-active", "unknown independent blur case");
                s.editor->focus(false);
            }
        };
        s.emit();
        require(s.backend->errors.empty(), "independent focus callback failed");
        if (scenario.starts_with("replacement-focus-")) {
            require(s.editingWrites == 1 && s.focusWrites == 0 && replacement &&
                    s.focused == replacement->handle, "stale scroll blur cleared replacement-node focus");
        } else {
            require(s.editingWrites == 2 && s.focusWrites == 1 && s.focused == nullptr,
                    "scroll blur guard suppressed later independent editor blur");
            if (!replacement) require(s.editor->focusGeneration == focusGeneration + 2,
                                      "independent blur did not supersede original focus operation");
            require(s.editor->epoch.active, "scroll blur retired editor lifecycle");
        }
        const bool scrollSurvives = scenario.ends_with("-active") || scenario.ends_with("-rebound");
        require(s.view->starts == startsDuringInvalidation + (scrollSurvives ? 1 : 0),
                "invalidated scroll reached drag callback after reentry");
        require(std::count(trace.begin(), trace.end(), "raw") == 0 &&
                std::count(trace.begin(), trace.end(), "consume-raw") == 0,
                "sibling editor or invalidated scroll received raw terminals");
    } else if (scenario.starts_with("reenter-")) {
        s.property();
        std::shared_ptr<NativeTextInput> replacement;
        auto secondChild = s.node(s.owner);
        s.editingStopped = [&] {
            trace.push_back("reentry");
            if (scenario == "reenter-retire") s.scroll->retired = true;
            else if (scenario == "reenter-dispose") { s.owner->disposing = true; s.owner->handle = nullptr; }
            else if (scenario == "reenter-reparent-scroll") s.reparent(s.owner, s.otherRoot);
            else if (scenario == "reenter-reparent-input") s.reparent(s.field, s.otherRoot);
            else if (scenario == "reenter-unmount") s.root->content = nullptr;
            else if (scenario == "reenter-replace-drag") { s.scroll->sequence.replace(); s.scroll->sequence.startDrag(); }
            else if (scenario == "reenter-disable") s.scroll->enabled = false;
            else if (scenario == "reenter-suspend") s.backend->suspended = true;
            else if (scenario == "reenter-shutdown") s.backend->shuttingDown = true;
            else if (scenario == "reenter-input-retire") { s.editor->retired = true; s.editor->handle = nullptr; }
            else if (scenario == "reenter-input-rebind") { replacement = s.input(s.field); s.focus(replacement); }
            else if (scenario == "reenter-refocus") s.focus(s.editor);
            else if (scenario == "reenter-replacement") { replacement = s.input(s.sibling); s.focus(replacement); }
            else if (scenario == "reenter-throw") throw std::runtime_error("edit callback failed");
            else if (scenario == "reenter-release") s.scroll->sequence.release({});
            else require(false, "unknown reentry case");
        };
        s.emit();
        require(s.editingWrites == 1 && s.focusWrites == 0, "blur made stale page-wide focus write after reentry");
        bool scrollSurvives = scenario == "reenter-reparent-input" || scenario == "reenter-input-retire" ||
                              scenario == "reenter-input-rebind" || scenario == "reenter-refocus" ||
                              scenario == "reenter-replacement";
        require(s.view->starts == (scrollSurvives ? 1 : 0), "stale drag reached runtime after blur reentry");
        const auto rawCount = scrollSurvives ? (scenario == "reenter-reparent-input" ? 1 : 2) : 0;
        require(std::count(trace.begin(), trace.end(), "raw") == rawCount &&
                std::count(trace.begin(), trace.end(), "consume-raw") == rawCount,
                "raw touch callback ran for invalidated drag");
        if (replacement) require(s.focused == replacement->handle, "replacement editor lost focus");
        if (scenario == "reenter-refocus") require(s.focused == s.editor->handle, "reentrant same-editor focus lost");
        if (scenario == "reenter-throw") require(s.backend->errors.size() == 1, "callback exception was not reported");
    } else if (scenario == "raw-reentry") {
        s.property();
        auto second = s.node(s.owner);
        rawCallback = [&] { s.scroll->sequence.replace(); s.scroll->sequence.startDrag(); };
        s.emit();
        require(s.editingWrites == 1 && s.focusWrites == 1 &&
                std::count(trace.begin(), trace.end(), "raw") == 1 && s.view->starts == 0,
                "raw callback continued old epoch after reentry");
    } else {
        s.property();
        auto type = NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING;
        if (scenario == "absent") { s.field->input.reset(); s.focused = nullptr; }
        else if (scenario == "other-root") s.reparent(s.field, s.otherRoot);
        else if (scenario == "other-backend") s.editor->backend = std::make_shared<Backend>();
        else if (scenario == "stale-focus") s.focused = nullptr;
        else if (scenario == "inactive-input") s.editor->epoch.active = false;
        else if (scenario == "disabled-input") s.editor->enabled = false;
        else if (scenario == "retired-input") s.editor->retired = true;
        else if (scenario == "detached-input") { s.reparent(s.field, s.otherRoot); s.otherRoot->content = nullptr; }
        else if (scenario == "scroll-start") type = NODE_SCROLL_EVENT_ON_SCROLL_START;
        else if (scenario == "did-scroll") type = NODE_SCROLL_EVENT_ON_DID_SCROLL;
        else if (scenario == "pending") s.scroll->pending = true;
        else if (scenario == "suppressed") s.scroll->suppress = true;
        else if (scenario == "disabled") scrollAttribute(*s.owner, "scrollEnabled", Value(false));
        else if (scenario == "suspended") s.backend->suspended = true;
        else if (scenario == "stopped") s.backend->stopped = true;
        else if (scenario == "shutting-down") s.backend->shuttingDown = true;
        else if (scenario == "retired") s.scroll->retired = true;
        else if (scenario == "detached") s.root->content = nullptr;
        else if (scenario == "touch-disabled") s.owner->touchEnabled = false;
        else if (scenario == "ancestor-disabled") s.root->touchEnabled = false;
        else return 2;
        s.emit(type);
        s.assertNoBlur();
    }
    requireGuardReleased(*s.field);
    std::cout << "production dismissKeyboardOnDrag passed: " << scenario << '\n';
}
