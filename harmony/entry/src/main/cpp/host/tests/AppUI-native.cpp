// Executes production presenter against an in-process SDK boundary simulator.
// All function tables, signatures, enums and event payloads come from the actual
// installed SDK headers. This proves lifecycle logic, not device rendering.
#include "../HarmonyNativeAppUIPresenter.hpp"
#include <arkui/native_dialog.h>
#include <arkui/native_interface.h>
#include <arkui/native_node.h>
#include <arkui/node_attributes/picker.h>

#include <algorithm>
#include <cassert>
#include <deque>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <set>
#include <thread>
#include <tuple>

struct ArkUI_Context {};
struct ArkUI_Node {
    struct Event { int32_t target; void* data; };
    ArkUI_NodeType type;
    ArkUI_Node* parent = nullptr;
    std::vector<ArkUI_Node*> children;
    std::map<ArkUI_NodeAttributeType, std::string> text;
    std::map<ArkUI_NodeAttributeType, ArkUI_NumberValue> number;
    std::vector<std::string> labels;
    std::map<ArkUI_NodeEventType, Event> events;
    void (*receiver)(ArkUI_NodeEvent*) = nullptr;
};
struct ArkUI_NativeDialog {
    ArkUI_NodeHandle root = nullptr;
    bool shown = false, autoCancel = true;
    int32_t alignment = 0;
    void* dismissData = nullptr;
    void (*dismiss)(ArkUI_DialogDismissEvent*) = nullptr;
    void* disappearData = nullptr;
    void (*disappear)(void*) = nullptr;
};
struct ArkUI_NodeEvent {
    int32_t target;
    void* data;
    ArkUI_NodeComponentEvent numbers{};
    ArkUI_StringAsyncEvent text{};
};
struct ArkUI_DialogDismissEvent { void* data; bool blocked = false; };
struct ArkUI_TextPickerRangeContentArray { std::vector<std::string> labels; };

namespace {
using namespace ValdiHarmony;
struct TestReply { bool confirm=false,cancel=false;std::string content,value;int32_t index=-1; };
using HarmonyAppUIReply = TestReply; // Test assertion view only; production uses typed variants.
struct Boundary;
Boundary* current = nullptr;
struct Boundary {
    ArkUI_NativeNodeAPI_1 nodes{};
    ArkUI_NativeDialogAPI_3 dialogs{};
    ArkUI_Context context;
    ArkUI_ContextHandle scoped = nullptr;
    std::set<ArkUI_Node*> allocated;
    std::set<ArkUI_NativeDialog*> controllers;
    std::deque<std::function<void()>> tasks;
    std::vector<std::tuple<uint64_t, std::string, std::optional<HarmonyAppUIReply>>> replies;
    std::function<void(uint64_t)> onReply;
    int created = 0, failCreate = 0, shown = 0, closed = 0, disposed = 0, ranges = 0, depth = 0;
    bool failShow = false, failClose = false, failScope = false, missingDialogAPI = false;
    bool disappearInClose = false, selectionDuringRangeUpdate = false;
    bool dismissDuringClose = false;

    Boundary() {
        assert(!current); current = this;
        nodes.createNode = [](ArkUI_NodeType type) -> ArkUI_NodeHandle {
            assert(current->scoped == &current->context);
            if (++current->created == current->failCreate) return nullptr;
            auto* n = new ArkUI_Node{};
            n->type = type; current->allocated.insert(n); return n;
        };
        nodes.disposeNode = [](ArkUI_NodeHandle n) {
            assert(current->depth == 0 && n->events.empty() && !n->receiver);
            assert(!n->parent && n->children.empty());
            assert(current->allocated.erase(n) == 1); delete n;
        };
        nodes.addChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
            assert(!child->parent); child->parent = parent; parent->children.push_back(child); return 0;
        };
        nodes.removeChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle child) -> int32_t {
            assert(child->parent == parent); child->parent = nullptr;
            auto& items = parent->children;
            items.erase(std::find(items.begin(), items.end(), child)); return 0;
        };
        nodes.setAttribute = [](ArkUI_NodeHandle n, ArkUI_NodeAttributeType type,
                                const ArkUI_AttributeItem* value) -> int32_t {
            assert(current->scoped == &current->context);
            if (value->string) n->text[type] = value->string;
            if (value->value && value->size) n->number[type] = value->value[0];
            if (type == NODE_LAYOUT_WEIGHT) assert(value->value[0].u32 == 1);
            if (type == NODE_TEXT_PICKER_OPTION_RANGE && value->object) {
                assert(value->value[0].i32 == ARKUI_TEXTPICKER_RANGETYPE_RANGE_CONTENT);
                n->labels = static_cast<ArkUI_TextPickerRangeContentArray*>(value->object)->labels;
            }
            if (type == NODE_TEXT_PICKER_OPTION_RANGE && n->events.count(NODE_TEXT_PICKER_EVENT_ON_CHANGE) &&
                current->selectionDuringRangeUpdate) current->event(n, NODE_TEXT_PICKER_EVENT_ON_CHANGE, {0});
            return 0;
        };
        nodes.addNodeEventReceiver = [](ArkUI_NodeHandle n, void (*callback)(ArkUI_NodeEvent*)) -> int32_t {
            assert(!n->receiver); n->receiver = callback; return 0;
        };
        nodes.removeNodeEventReceiver = [](ArkUI_NodeHandle n, void (*callback)(ArkUI_NodeEvent*)) -> int32_t {
            assert(n->receiver == callback); n->receiver = nullptr; return 0;
        };
        nodes.registerNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType event,
                                     int32_t target, void* data) -> int32_t {
            n->events.emplace(event, ArkUI_Node::Event{target, data}); return 0;
        };
        nodes.unregisterNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType event) { n->events.erase(event); };
        auto& api = dialogs.nativeDialogAPI1;
        api.create = []() -> ArkUI_NativeDialogHandle {
            assert(current->scoped == &current->context);
            auto* d = new ArkUI_NativeDialog{}; current->controllers.insert(d); return d;
        };
        api.dispose = [](ArkUI_NativeDialogHandle d) {
            assert(current->depth == 0 && !d->disappearData && !d->dismissData);
            assert(current->controllers.erase(d) == 1);
            ++current->disposed; delete d;
        };
        api.setContent = [](ArkUI_NativeDialogHandle d, ArkUI_NodeHandle node) -> int32_t {
            d->root = node; return 0;
        };
        api.setContentAlignment = [](ArkUI_NativeDialogHandle d, int32_t alignment, float, float) -> int32_t {
            d->alignment = alignment; return 0;
        };
        api.setModalMode = [](ArkUI_NativeDialogHandle, bool modal) -> int32_t { assert(modal); return 0; };
        api.setAutoCancel = [](ArkUI_NativeDialogHandle d, bool value) -> int32_t { d->autoCancel = value; return 0; };
        api.setBackgroundColor = [](ArkUI_NativeDialogHandle, uint32_t) -> int32_t { return 0; };
        api.setCornerRadius = [](ArkUI_NativeDialogHandle, float, float, float, float) -> int32_t { return 0; };
        api.registerOnWillDismissWithUserData =
            [](ArkUI_NativeDialogHandle d, void* data, void (*fn)(ArkUI_DialogDismissEvent*)) -> int32_t {
                d->dismissData = data; d->dismiss = fn; return 0;
            };
        dialogs.registerOnDidDisappear =
            [](ArkUI_NativeDialogHandle d, void* data, void (*fn)(void*)) -> int32_t {
                d->disappearData = data; d->disappear = fn; return 0;
            };
        api.show = [](ArkUI_NativeDialogHandle d, bool subwindow) -> int32_t {
            assert(!subwindow && current->scoped == &current->context);
            ++current->shown; d->shown = !current->failShow;
            return current->failShow ? 401 : 0;
        };
        api.close = [](ArkUI_NativeDialogHandle d) -> int32_t {
            assert(current->scoped == &current->context);
            ++current->closed;
            if (current->failClose) return 401;
            if (current->dismissDuringClose) {
                ArkUI_DialogDismissEvent event{d->dismissData};
                ++current->depth; d->dismiss(&event); --current->depth;
                assert(!event.blocked); // Explicit buttons can close a non-dismissible sheet.
            }
            if (current->disappearInClose) current->disappear(d);
            return 0;
        };
    }
    ~Boundary() {
        assert(allocated.empty() && controllers.empty() && ranges == 0);
        assert(tasks.empty()); current = nullptr;
    }
    std::unique_ptr<HarmonyNativeAppUIPresenter> presenter(bool withContext = true) {
        auto result = std::make_unique<HarmonyNativeAppUIPresenter>(withContext ? &context : nullptr,
            [this](std::function<void()> fn) { tasks.push_back(std::move(fn)); },
            [this](uint64_t id, HarmonyNativeAppUIResult result) {
                std::string error; std::optional<TestReply> reply;
                if (const auto* failure=std::get_if<HarmonyNativeAppUIError>(&result)) error=failure->message;
                if (const auto* modal=std::get_if<HarmonyNativeModalReply>(&result))
                    reply=TestReply{modal->confirm,modal->cancel,modal->content,{},-1};
                if (const auto* selection=std::get_if<HarmonyNativePresentationReply>(&result))
                    reply=TestReply{selection->confirm,selection->cancel,{},selection->value,selection->index};
                replies.emplace_back(id,std::move(error),std::move(reply));
                if(onReply)onReply(id);
            });
        result->setForegroundPage("root");
        return result;
    }
    void drain() {
        int count = 0;
        while (!tasks.empty()) {
            assert(++count < 1000);
            auto fn = std::move(tasks.front()); tasks.pop_front(); fn();
        }
    }
    ArkUI_NativeDialog* dialog() { assert(controllers.size() == 1); return *controllers.begin(); }
    std::vector<ArkUI_Node*> find(ArkUI_NodeType type) {
        std::vector<ArkUI_Node*> found;
        // Traverse in content order, rather than heap-address order.
        std::function<void(ArkUI_Node*)> walk = [&](ArkUI_Node* n) {
            if (n->type == type) found.push_back(n);
            for (auto* child : n->children) walk(child);
        };
        walk(dialog()->root); return found;
    }
    ArkUI_Node* button(const std::string& label) {
        for (auto* n : find(ARKUI_NODE_BUTTON)) if (n->text[NODE_BUTTON_LABEL] == label) return n;
        assert(false); return nullptr;
    }
    void event(ArkUI_Node* n, ArkUI_NodeEventType type, std::initializer_list<int32_t> numbers = {},
               const char* text = nullptr) {
        const auto registration = n->events.at(type);
        ArkUI_NodeEvent event{registration.target, registration.data};
        event.text.pStr = text;
        int index = 0; for (auto number : numbers) event.numbers.data[index++].i32 = number;
        ++depth; n->receiver(&event); --depth;
    }
    void click(const std::string& label) { event(button(label), NODE_ON_CLICK); }
    void disappear(ArkUI_NativeDialog* d = nullptr) {
        if (!d) d = dialog();
        ++depth; d->shown = false; d->disappear(d->disappearData); --depth;
    }
    bool dismiss() {
        auto* d = dialog();
        ArkUI_DialogDismissEvent event{d->dismissData};
        ++depth; d->dismiss(&event); --depth;
        if (!event.blocked) disappear(d);
        return !event.blocked;
    }
    const HarmonyAppUIReply& reply(size_t index = 0) {
        assert(std::get<1>(replies.at(index)).empty());
        return *std::get<2>(replies.at(index));
    }
};

HarmonyNativeAppUIRequest request(uint64_t id = 1, std::string method = "showModal") {
    HarmonyNativeAppUIRequest value;
    value.id = id;
    if(method=="showModal")value.kind=HarmonyNativeAppUIKind::Modal;
    else if(method=="showActionSheet")value.kind=HarmonyNativeAppUIKind::ActionSheet;
    else if(method=="showPicker")value.kind=HarmonyNativeAppUIKind::Picker;
    else if(method=="showDatePicker")value.kind=HarmonyNativeAppUIKind::DatePicker;
    else if(method=="showBottomSheet")value.kind=HarmonyNativeAppUIKind::BottomSheet;
    else if(method=="previewImage")value.kind=HarmonyNativeAppUIKind::ImagePreview;
    else assert(false);
    value.title = "Native title"; value.confirmText = "Yes"; value.cancelText = "No"; value.showCancel = true;
    value.minYear = 1901; value.maxYear = 2100; value.mode = "date";
    return value;
}
}

extern "C" {
void* OH_ArkUI_QueryModuleInterfaceByName(ArkUI_NativeAPIVariantKind kind, const char* name) {
    if (kind == ARKUI_NATIVE_NODE) {
        assert(std::string(name) == "ArkUI_NativeNodeAPI_1"); return &current->nodes;
    }
    assert(kind == ARKUI_NATIVE_DIALOG && std::string(name) == "ArkUI_NativeDialogAPI_3");
    return current->missingDialogAPI ? nullptr : &current->dialogs;
}
int32_t OH_ArkUI_RunTaskInScope(ArkUI_ContextHandle context, void* data, void (*fn)(void*)) {
    if (!context || current->failScope) return 401;
    assert(context == &current->context);
    auto previous = current->scoped; current->scoped = context; fn(data); current->scoped = previous; return 0;
}
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) { return event->data; }
int32_t OH_ArkUI_NodeEvent_GetTargetId(ArkUI_NodeEvent* event) { return event->target; }
ArkUI_NodeComponentEvent* OH_ArkUI_NodeEvent_GetNodeComponentEvent(ArkUI_NodeEvent* event) { return &event->numbers; }
ArkUI_StringAsyncEvent* OH_ArkUI_NodeEvent_GetStringAsyncEvent(ArkUI_NodeEvent* event) { return &event->text; }
void* OH_ArkUI_DialogDismissEvent_GetUserData(ArkUI_DialogDismissEvent* event) { return event->data; }
void OH_ArkUI_DialogDismissEvent_SetShouldBlockDismiss(ArkUI_DialogDismissEvent* event, bool value) {
    event->blocked = value;
}
ArkUI_TextPickerRangeContentArray* OH_ArkUI_TextPickerRangeContentArray_Create(int32_t length) {
    ++current->ranges;
    auto* range = new ArkUI_TextPickerRangeContentArray; range->labels.resize(length); return range;
}
void OH_ArkUI_TextPickerRangeContentArray_SetTextAtIndex(ArkUI_TextPickerRangeContentArray* range,
                                                       char* text, int32_t index) { range->labels.at(index) = text; }
void OH_ArkUI_TextPickerRangeContentArray_Destroy(ArkUI_TextPickerRangeContentArray* range) {
    --current->ranges; delete range;
}
}

namespace {
void fifoAndEdit() {
    Boundary b;
    auto p = b.presenter();
    auto modal = request(); modal.editable = true; modal.defaultText = "default"; modal.placeholderText = "placeholder";
    p->present(modal); p->present(request(2)); p->present(modal);
    assert(b.shown == 1);
    auto input = b.find(ARKUI_NODE_TEXT_INPUT).at(0);
    assert(input->text[NODE_TEXT_INPUT_TEXT] == "default");
    assert(input->text[NODE_TEXT_INPUT_PLACEHOLDER] == "placeholder");
    b.event(input, NODE_TEXT_INPUT_ON_CHANGE, {}, "edited");
    b.click("Yes"); b.click("No");
    assert(b.closed == 1 && b.replies.empty() && b.shown == 1);
    b.disappear(); b.disappear();
    assert(b.replies.empty()); b.drain();
    assert(b.reply().confirm && b.reply().content == "edited" && b.replies.size() == 1 && b.shown == 2);
    assert(b.disposed == 1);
    p->shutdown(); b.drain();
    assert(b.replies.size() == 2 && std::get<1>(b.replies[1]).starts_with("E_APP_UI_CLOSED"));
}

void cancellationAndPreview() {
    Boundary b;
    auto p = b.presenter();
    auto preview = request(1, "previewImage");
    preview.urls = {"https://a", "file://b"}; preview.current = "https://a";
    p->present(preview);
    auto swiper = b.find(ARKUI_NODE_SWIPER).at(0);
    const auto images = b.find(ARKUI_NODE_IMAGE);
    assert(images.size() == 2 && images[1]->text[NODE_IMAGE_SRC] == "file://b");
    b.event(swiper, NODE_SWIPER_EVENT_ON_CHANGE, {1});
    assert(b.dismiss()); b.drain();
    assert(b.reply().confirm && b.reply().index == 1 && b.reply().value == "file://b");
    preview.id = 2; p->present(preview);
    b.event(b.find(ARKUI_NODE_SWIPER).at(0), NODE_SWIPER_EVENT_ON_CHANGE, {1});
    p->cancelPending(); b.disappear(); b.drain();
    assert(b.reply(1).cancel && b.reply(1).index == 1 && b.reply(1).value == "file://b");
    auto modal = request(3); modal.editable = true;
    p->present(modal);
    b.event(b.find(ARKUI_NODE_TEXT_INPUT).at(0), NODE_TEXT_INPUT_ON_CHANGE, {}, "cancel edit");
    assert(b.dismiss()); b.drain();
    assert(b.reply(2).cancel && b.reply(2).content == "cancel edit");
}

void sheetAndPicker() {
    Boundary b;
    auto p = b.presenter();
    auto menu = request(1, "showActionSheet"); menu.items = {"First", "Second"};
    p->present(menu);
    assert(b.dialog()->alignment == ARKUI_ALIGNMENT_BOTTOM);
    b.click("Second"); b.disappear(); b.drain();
    assert(b.reply().confirm && b.reply().index == 1 && b.reply().value == "Second");
    auto picker = request(2, "showPicker");
    picker.options = {{"a", "One; comma, preserved"}, {"b", "Two"}}; picker.value = "b";
    p->present(picker);
    auto nativePicker = b.find(ARKUI_NODE_TEXT_PICKER).at(0);
    assert(nativePicker->labels[0] == "One; comma, preserved");
    assert(nativePicker->number[NODE_TEXT_PICKER_OPTION_SELECTED].u32 == 1);
    b.event(nativePicker, NODE_TEXT_PICKER_EVENT_ON_CHANGE, {0});
    b.click("Yes"); b.disappear(); b.drain();
    assert(b.reply(1).value == "a" && b.reply(1).index == 0 && b.ranges == 0);
    picker.id = 3; p->present(picker); b.click("No"); b.disappear(); b.drain();
    assert(b.reply(2).cancel && b.reply(2).value.empty() && b.reply(2).index == -1);
    auto sheet = request(4, "showBottomSheet"); sheet.dismissible = false;
    p->present(sheet);
    assert(!b.dialog()->autoCancel && !b.dismiss() && b.replies.size() == 3);
    b.dismissDuringClose = true;
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(3).confirm);
}

void calendarAndTime() {
    Boundary b;
    auto p = b.presenter();
    auto date = request(1, "showDatePicker"); date.mode = "datetime"; date.value = "2000-02-29 23:59";
    p->present(date);
    auto picker = b.find(ARKUI_NODE_DATE_PICKER).at(0);
    assert(picker->text[NODE_DATE_PICKER_SELECTED] == "2000-02-29");
    b.event(picker, NODE_DATE_PICKER_EVENT_ON_DATE_CHANGE, {2024, 0, 31});
    b.event(b.find(ARKUI_NODE_TIME_PICKER).at(0), NODE_TIME_PICKER_EVENT_ON_CHANGE, {1, 2});
    b.click("Yes"); b.disappear(); b.drain();
    assert(b.reply().value == "2024-01-31 01:02");
    date.id = 2; date.mode = "year-month"; date.value = "2024-03";
    p->present(date);
    assert(b.find(ARKUI_NODE_DATE_PICKER).at(0)->number[NODE_DATE_PICKER_MODE].i32 == ARKUI_DATEPICKER_YEAR_AND_MONTH);
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(1).value == "2024-03");
    date.id = 3; date.mode = "time"; date.value = "12:34";
    p->present(date); assert(b.find(ARKUI_NODE_DATE_PICKER).empty());
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(2).value == "12:34");
    // Wider years and year-only are real native TextPicker columns.
    date.id = 4; date.minYear = 1000; date.maxYear = 9999; date.mode = "date"; date.value = "2000-01-31";
    p->present(date);
    auto columns = b.find(ARKUI_NODE_TEXT_PICKER); assert(columns.size() == 3);
    b.selectionDuringRangeUpdate = true;
    b.event(columns[1], NODE_TEXT_PICKER_EVENT_ON_CHANGE, {1});
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(3).value == "2000-02-29");
    date.id = 5; date.mode = "year"; date.value = "1000";
    p->present(date); assert(b.find(ARKUI_NODE_TEXT_PICKER).size() == 1);
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(4).value == "1000");
}

void shutdownAndReentrancy() {
    Boundary b;
    auto p = b.presenter();
    b.disappearInClose = true;
    p->present(request()); p->present(request(2));
    b.click("Yes"); assert(b.replies.empty() && b.disposed == 0);
    p->shutdown(); p->shutdown(); b.drain();
    assert(b.replies.size() == 2 && b.disposed == 1);
    assert(std::get<1>(b.replies[0]).starts_with("E_APP_UI_CLOSED"));
    p = b.presenter();
    b.onReply = [&](uint64_t id) { if (id == 3) p.reset(); };
    p->present(request(3)); p->present(request(4));
    b.click("Yes"); b.drain();
    assert(!p && b.replies.size() == 4 && b.shown == 2);
}

void ownerCancelBeforeQueuedAdmission() {
    Boundary b;
    auto p = b.presenter();
    p->present(request()); p->present(request(2));
    b.onReply = [&](uint64_t id) { if (id == 2) p->present(request(3)); };
    p->cancelPending();
    assert(b.replies.size() == 1 && b.shown == 1);
    b.disappear(); b.drain();
    assert(b.reply(1).cancel && b.shown == 2);
    b.onReply = nullptr;
    p->shutdown(); b.drain(); assert(b.replies.size() == 3);
}

void failureBoundaries() {
    {
        Boundary b; auto p = b.presenter(false); p->present(request()); b.drain();
        assert(b.shown == 0 && std::get<1>(b.replies[0]).starts_with("E_APP_UI_CONTEXT"));
    }
    {
        Boundary b; auto p = b.presenter(); b.missingDialogAPI = true;
        p->present(request()); b.drain();
        assert(std::get<1>(b.replies[0]).starts_with("E_APP_UI_UNSUPPORTED"));
    }
    {
        Boundary b; auto p = b.presenter(); b.failCreate = 3;
        p->present(request()); p->present(request(2)); b.drain();
        assert(b.replies.size() == 1 && b.shown == 1 && b.disposed == 1);
        p->shutdown(); b.drain();
    }
    {
        Boundary b; auto p = b.presenter(); b.failShow = true;
        p->present(request()); b.drain();
        assert(b.replies.size() == 1 && b.controllers.empty() && b.allocated.empty());
    }
    {
        Boundary b; auto p = b.presenter(); p->present(request()); p->present(request(2));
        b.failClose = true; b.click("Yes"); b.drain();
        assert(b.replies.empty() && b.shown == 1);
        b.failScope = true; // Window lost: handle-based teardown still unregisters.
        p->shutdown(); b.drain();
        assert(b.replies.size() == 2 && b.allocated.empty() && b.controllers.empty());
    }
    {
        Boundary b; auto p = b.presenter(); auto date = request(1, "showDatePicker");
        date.minYear = 1000; date.maxYear = 9999; date.mode = "year"; date.value = "1000";
        p->present(date);
        b.event(b.find(ARKUI_NODE_TEXT_PICKER).at(0), NODE_TEXT_PICKER_EVENT_ON_CHANGE,
                {std::numeric_limits<int32_t>::max()});
        b.disappear(); b.drain();
        assert(std::get<1>(b.replies[0]) == "E_APP_UI:invalid native interaction");
    }
}

void capacityAndThread() {
    Boundary b;
    auto p = b.presenter();
    for (uint64_t id = 1; id <= 65; ++id) p->present(request(id));
    assert(b.shown == 1 && b.replies.size() == 1 && std::get<0>(b.replies[0]) == 65);
    bool rejected = false;
    std::thread wrong([&] {
        try { p->cancelPending(); } catch (const std::logic_error&) { rejected = true; }
    });
    wrong.join(); assert(rejected);
    p->shutdown(); b.drain(); assert(b.replies.size() == 65);
    p->present(request(66)); assert(b.replies.size() == 66);
}

struct LogicalPage {
    std::string id;
    bool tabs = false, removed = false;
    std::string selectedTab;
    std::map<std::string, std::shared_ptr<LogicalPage>> tabPages;
};
std::shared_ptr<LogicalPage> page(const std::string& id) {
    auto result = std::make_shared<LogicalPage>(); result->id = id; return result;
}

void foregroundOwnership() {
    Boundary b;
    auto p = b.presenter();
    auto root = page("Root"), a = page("A"), other = page("B");
    std::vector<std::shared_ptr<LogicalPage>> stack{root, a, other};
    auto changed = [&] { p->setForegroundPage(appUIForegroundPageIdentity(stack)); };
    changed(); p->present(request());
    // Root -> A -> B: A can finish from under B without stealing B's dialog.
    stack.erase(stack.begin() + 1); a->removed = true; changed();
    assert(b.closed == 0 && b.replies.empty());
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply().confirm);

    stack = {root, a}; a->removed = false; changed(); p->present(request(2));
    stack.push_back(other); changed(); // Push covers A without removing it.
    assert(b.closed == 2); // One earlier confirm close and one owner cancellation.
    p->present(request(3)); // Queued while A closes: no page owner yet.
    b.disappear(); b.drain(); assert(b.reply(1).cancel && b.shown == 3);
    // A returning while B's presentation is active cancels B, even if the B
    // request was originally queued while A's dialog was still closing.
    stack.pop_back(); changed();
    b.disappear(); b.drain(); assert(b.reply(2).cancel);

    // Retained tabs have distinct page identities even within the same shell.
    auto shell = page("Shell"), tabA = page("TabA"), tabB = page("TabB");
    shell->tabs = true; shell->selectedTab = "a";
    shell->tabPages = {{"a", tabA}, {"b", tabB}};
    stack = {shell}; changed(); p->present(request(4));
    shell->selectedTab = "b"; changed();
    b.disappear(); b.drain(); assert(b.reply(3).cancel);
    p->present(request(5));
    // Interactive preview mounts another root, but does not mutate the stack.
    auto previewRoot = tabA;
    (void)previewRoot; changed();
    assert(b.replies.size() == 4);
    changed(); // Gesture cancellation restores visuals only.
    assert(b.replies.size() == 4);
    b.click("Yes"); b.disappear(); b.drain(); assert(b.reply(4).confirm);
}

void foregroundCommitAndReentry() {
    Boundary b;
    auto p = b.presenter();
    auto root = page("Root"), a = page("A");
    std::vector<std::shared_ptr<LogicalPage>> stack{root, a};
    p->setForegroundPage(appUIForegroundPageIdentity(stack));
    p->present(request()); p->present(request(2));
    // Preview and its cancellation do not change identity or close the dialog.
    p->setForegroundPage(appUIForegroundPageIdentity(stack));
    assert(b.closed == 0);
    stack.pop_back(); // Commit is the actual logical foreground change.
    p->setForegroundPage(appUIForegroundPageIdentity(stack));
    assert(b.closed == 1);
    b.onReply = [&](uint64_t id) {
        if (id == 1) {
            p->setForegroundPage("B");
            p->present(request(3));
        }
    };
    b.disappear(); b.drain();
    assert(b.reply().cancel && b.shown == 2);
    // Request 2 binds to B at show time, not to A when enqueued.
    p->setForegroundPage("Root"); b.disappear(); b.drain(); assert(b.reply(1).cancel);
    b.onReply = nullptr;
    p->setForegroundPage(""); // No logical foreground: close but do not advance.
    b.disappear(); b.drain(); assert(b.reply(2).cancel);
    p->present(request(4)); assert(b.shown == 3);
    p->setForegroundPage("Root"); assert(b.shown == 4);
    p->shutdown(); p->setForegroundPage("B"); b.drain();
    assert(b.replies.size() == 4 && b.shown == 4);
}
}

#ifndef APP_UI_BOUNDARY_ONLY
int main() {
    fifoAndEdit(); cancellationAndPreview(); sheetAndPicker(); calendarAndTime();
    shutdownAndReentrancy(); ownerCancelBeforeQueuedAdmission(); failureBoundaries(); capacityAndThread();
    foregroundOwnership(); foregroundCommitAndReentry();
    std::cout << "PASS: native AppUI node construction, SDK-shaped events, FIFO/disappearance, teardown, failures, bounds\n";
}

#endif
