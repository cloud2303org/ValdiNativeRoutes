#include "HarmonyNativeAppUIPresenter.hpp"

#include <arkui/native_dialog.h>
#include <arkui/native_interface.h>
#include <arkui/native_node.h>
#include <arkui/node_attributes/picker.h>

#include <algorithm>
#include <cstdio>
#include <ctime>
#include <deque>
#include <exception>
#include <stdexcept>
#include <thread>
#include <utility>

namespace ValdiHarmony {
namespace {
using Kind = HarmonyNativeAppUIKind;
void check(int32_t status) {
    if (status != ARKUI_ERROR_CODE_NO_ERROR) throw std::runtime_error("E_APP_UI:ArkUI operation failed");
}

int daysInMonth(int year, int month) {
    const int days[] = {31, 28 + (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)),
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    return days[std::clamp(month, 1, 12) - 1];
}

struct Calendar {
    int year = 2000, month = 1, day = 1, hour = 0, minute = 0;

    explicit Calendar(const HarmonyNativeAppUIRequest& request) {
        if (request.kind != Kind::DatePicker) return;
        const auto now = std::time(nullptr);
        std::tm local{};
        if (localtime_r(&now, &local)) {
            year = local.tm_year + 1900; month = local.tm_mon + 1; day = local.tm_mday;
            hour = local.tm_hour; minute = local.tm_min;
        }
        if (!request.value.empty()) {
            const auto& value = request.value;
            if (request.mode != "time") {
                year = std::stoi(value.substr(0, 4));
                month = request.mode == "year" ? 1 : std::stoi(value.substr(5, 2));
                day = request.mode == "year" || request.mode == "year-month" ? 1 : std::stoi(value.substr(8, 2));
            }
            if (request.mode == "time" || request.mode == "datetime") {
                const auto offset = request.mode == "time" ? 0 : 11;
                hour = std::stoi(value.substr(offset, 2)); minute = std::stoi(value.substr(offset + 3, 2));
            }
        }
        if (request.mode != "time") year = std::clamp(year, request.minYear, request.maxYear);
        day = std::min(day, daysInMonth(year, month));
    }

    std::string date() const {
        char output[32];
        std::snprintf(output, sizeof(output), "%04d-%02d-%02d", year, month, day);
        return output;
    }
    std::string time() const {
        char output[24];
        std::snprintf(output, sizeof(output), "%02d:%02d", hour, minute);
        return output;
    }
    std::string value(const std::string& mode) const {
        if (mode == "time") return time();
        if (mode == "datetime") return date() + " " + time();
        if (mode == "year") return date().substr(0, 4);
        if (mode == "year-month") return date().substr(0, 7);
        return date();
    }
};

// Numeric wheel ranges have no separator ambiguity. Arbitrary business labels
// use SDK-owned TextPickerRangeContentArray objects, never delimited strings.
std::string numberRange(int first, int last) {
    std::string output;
    for (int n = first; n <= last; ++n) {
        if (n != first) output += ';';
        output += std::to_string(n);
    }
    return output;
}
}

struct HarmonyNativeAppUIPresenter::State : std::enable_shared_from_this<State> {
    enum Target : int32_t { Confirm = 1, Cancel, Edit, Selection, Date, Time, Year, Month, Day, Image, Action = 1000 };
    struct Session {
        explicit Session(HarmonyNativeAppUIRequest value) : request(std::move(value)), calendar(request) {
            text = request.defaultText;
            if (request.kind == Kind::Picker) {
                for (size_t i = 0; i < request.options.size(); ++i)
                    if (request.options[i].value == request.value) index = static_cast<int>(i);
            } else if (request.kind == Kind::ImagePreview) {
                for (size_t i = 0; i < request.urls.size(); ++i)
                    if (request.urls[i] == request.current) index = static_cast<int>(i);
            }
        }
        HarmonyNativeAppUIRequest request;
        std::string ownerPage; // Bound when shown, not when queued or previewed.
        Calendar calendar;
        std::string text;
        int index = 0;
        bool closed = false, closing = false, delivered = false, finishQueued = false, updatingPicker = false;
        std::optional<HarmonyNativeAppUIResult> chosen;
        std::string error;
        std::weak_ptr<State> owner;
        ArkUI_NativeDialogHandle dialog = nullptr;
        ArkUI_NodeHandle dayPicker = nullptr;
        std::vector<ArkUI_NodeHandle> nodes;
        std::vector<std::pair<ArkUI_NodeHandle, ArkUI_NodeHandle>> edges;
        std::vector<std::pair<ArkUI_NodeHandle, ArkUI_NodeEventType>> events;
        std::vector<ArkUI_NodeHandle> receivers;
        ArkUI_TextPickerRangeContentArray* labels = nullptr;

        HarmonyNativeAppUIResult reply(bool confirm) const {
            if (request.kind == Kind::Modal)
                return HarmonyNativeModalReply{confirm, !confirm, request.editable ? text : ""};
            HarmonyNativePresentationReply result;
            result.confirm = confirm; result.cancel = !confirm;
            if (confirm || request.kind == Kind::ImagePreview) {
                if (request.kind == Kind::DatePicker) result.value = calendar.value(request.mode);
                else if (request.kind == Kind::Picker) {
                    result.index = index; result.value = request.options.at(index).value;
                } else if (request.kind == Kind::ActionSheet) {
                    result.index = index; result.value = request.items.at(index);
                } else if (request.kind == Kind::ImagePreview) {
                    result.index = index; result.value = request.urls.at(index);
                }
            }
            return result;
        }
    };

    ArkUI_ContextHandle context;
    PostUI post;
    Completion complete;
    std::thread::id uiThread = std::this_thread::get_id();
    ArkUI_NativeNodeAPI_1* node = nullptr;
    ArkUI_NativeDialogAPI_3* dialogs = nullptr;
    std::deque<std::shared_ptr<Session>> waiting;
    std::shared_ptr<Session> active;
    std::string foregroundPage;
    bool stopped = false;
    int completing = 0;

    State(ArkUI_ContextHandle ui, PostUI task, Completion callback)
        : context(ui), post(std::move(task)), complete(std::move(callback)) {}

    void requireUI() const {
        if (std::this_thread::get_id() != uiThread) throw std::logic_error("E_APP_UI_THREAD:requires owning UI thread");
    }

    template<typename F> void scope(F&& fn) {
        // RunTaskInScope is synchronous. Catch inside the C callback so no C++
        // exception crosses SDK frames. UI dispatch is handled by our caller.
        struct Call { F& function; std::exception_ptr error; bool ran = false; } call{fn, nullptr, false};
        check(OH_ArkUI_RunTaskInScope(context, &call, [](void* data) {
            auto& work = *static_cast<Call*>(data);
            work.ran = true;
            try { work.function(); } catch (...) { work.error = std::current_exception(); }
        }));
        if (!call.ran) throw std::runtime_error("E_APP_UI_CONTEXT:context scope did not execute");
        if (call.error) std::rethrow_exception(call.error);
    }

    void emit(const std::shared_ptr<Session>& session, HarmonyNativeAppUIResult result) {
        if (session->delivered) return;
        session->delivered = true;
        try { complete(session->request.id, std::move(result)); } catch (...) {}
    }

    void present(HarmonyNativeAppUIRequest request) {
        requireUI();
        if (active && active->request.id == request.id) return;
        for (const auto& entry : waiting) if (entry->request.id == request.id) return;
        auto session = std::make_shared<Session>(std::move(request));
        if (stopped) { emit(session, HarmonyNativeAppUIError{"E_APP_UI_CLOSED:presenter was destroyed"}); return; }
        if (waiting.size() + (active ? 1 : 0) >= 64) {
            emit(session, HarmonyNativeAppUIError{"E_APP_UI_CAPACITY:too many presentations"}); return;
        }
        session->owner = shared_from_this();
        waiting.push_back(std::move(session));
        pump();
    }

    void pump() {
        if (stopped || completing || active || waiting.empty() || foregroundPage.empty()) return;
        auto session = active = std::move(waiting.front());
        waiting.pop_front();
        session->ownerPage = foregroundPage;
        if (!context) {
            session->error = "E_APP_UI_CONTEXT:owning UIContext is required";
            finish(session); return;
        }
        try {
            scope([&] {
                if (!node) node = static_cast<ArkUI_NativeNodeAPI_1*>(
                    OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
                if (!dialogs) dialogs = static_cast<ArkUI_NativeDialogAPI_3*>(
                    OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_DIALOG, "ArkUI_NativeDialogAPI_3"));
                if (!node || !dialogs || !dialogs->registerOnDidDisappear) {
                    session->error = "E_APP_UI_UNSUPPORTED:native dialog API 3 is required";
                    throw std::runtime_error("E_APP_UI_UNSUPPORTED:native dialog API 3 is required");
                }
                build(*session);
                check(dialogs->nativeDialogAPI1.show(session->dialog, false));
            });
        } catch (...) {
            if (session->error.empty()) session->error = "E_APP_UI:native dialog creation or show failed";
            deferFinish(session); // Partially constructed nodes are still owned.
        }
    }

    ArkUI_NodeHandle make(Session& s, ArkUI_NodeType type, ArkUI_NodeHandle parent = nullptr) {
        auto handle = node->createNode(type);
        if (!handle) throw std::runtime_error("E_APP_UI:cannot create node");
        s.nodes.push_back(handle);
        if (parent) {
            check(node->addChild(parent, handle));
            s.edges.emplace_back(parent, handle);
        }
        return handle;
    }
    void integer(ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type, int32_t value) {
        ArkUI_NumberValue number{}; number.i32 = value;
        ArkUI_AttributeItem item{&number, 1, nullptr, nullptr};
        check(node->setAttribute(handle, type, &item));
    }
    void real(ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type, float value) {
        ArkUI_NumberValue number{}; number.f32 = value;
        ArkUI_AttributeItem item{&number, 1, nullptr, nullptr};
        check(node->setAttribute(handle, type, &item));
    }
    void string(ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type, const std::string& value) {
        ArkUI_AttributeItem item{nullptr, 0, value.c_str(), nullptr};
        check(node->setAttribute(handle, type, &item));
    }
    void listen(Session& s, ArkUI_NodeHandle handle, ArkUI_NodeEventType event, int32_t target) {
        if (std::find(s.receivers.begin(), s.receivers.end(), handle) == s.receivers.end()) {
            check(node->addNodeEventReceiver(handle, receive));
            s.receivers.push_back(handle);
        }
        check(node->registerNodeEvent(handle, event, target, &s));
        s.events.emplace_back(handle, event);
    }
    void button(Session& s, ArkUI_NodeHandle parent, const std::string& label, int32_t target) {
        auto handle = make(s, ARKUI_NODE_BUTTON, parent);
        string(handle, NODE_BUTTON_LABEL, label);
        real(handle, NODE_HEIGHT, 44);
        real(handle, NODE_WIDTH_PERCENT, 1);
        listen(s, handle, NODE_ON_CLICK, target);
    }
    void text(Session& s, ArkUI_NodeHandle parent, const std::string& value, float fontSize) {
        if (value.empty()) return;
        auto handle = make(s, ARKUI_NODE_TEXT, parent);
        string(handle, NODE_TEXT_CONTENT, value);
        real(handle, NODE_FONT_SIZE, fontSize);
        real(handle, NODE_WIDTH_PERCENT, 1);
        real(handle, NODE_PADDING, 8);
    }
    ArkUI_NodeHandle numberPicker(Session& s, ArkUI_NodeHandle parent, int first, int last,
                                 int selected, Target target) {
        auto handle = make(s, ARKUI_NODE_TEXT_PICKER, parent);
        setNumberRange(handle, first, last);
        integer(handle, NODE_TEXT_PICKER_OPTION_SELECTED, selected - first);
        integer(handle, NODE_TEXT_PICKER_CAN_LOOP, false);
        integer(handle, NODE_LAYOUT_WEIGHT, 1);
        real(handle, NODE_HEIGHT, 200);
        listen(s, handle, NODE_TEXT_PICKER_EVENT_ON_CHANGE, target);
        return handle;
    }
    void setNumberRange(ArkUI_NodeHandle handle, int first, int last) {
        auto values = numberRange(first, last);
        ArkUI_NumberValue kind{}; kind.i32 = ARKUI_TEXTPICKER_RANGETYPE_SINGLE;
        ArkUI_AttributeItem item{&kind, 1, values.c_str(), nullptr};
        check(node->setAttribute(handle, NODE_TEXT_PICKER_OPTION_RANGE, &item));
    }

    void build(Session& s) {
        auto& api = dialogs->nativeDialogAPI1;
        s.dialog = api.create();
        if (!s.dialog) throw std::runtime_error("E_APP_UI:cannot create dialog");
        const auto& request = s.request;
        const bool bottom = request.kind == Kind::ActionSheet || request.kind == Kind::BottomSheet;
        check(api.setContentAlignment(s.dialog, bottom ? ARKUI_ALIGNMENT_BOTTOM : ARKUI_ALIGNMENT_CENTER, 0, 0));
        check(api.setModalMode(s.dialog, true));
        check(api.setAutoCancel(s.dialog, request.kind != Kind::BottomSheet || request.dismissible));
        check(api.setBackgroundColor(s.dialog, 0xffffffff));
        check(api.setCornerRadius(s.dialog, 20, 20, 20, 20));
        check(api.registerOnWillDismissWithUserData(s.dialog, &s, willDismiss));
        check(dialogs->registerOnDidDisappear(s.dialog, &s, didDisappear));
        auto root = make(s, ARKUI_NODE_COLUMN);
        real(root, NODE_WIDTH, 320);
        real(root, NODE_PADDING, 16);
        text(s, root, request.title, 20);
        if (request.kind == Kind::Modal || request.kind == Kind::BottomSheet) {
            if (!request.content.empty()) {
                auto scroll = make(s, ARKUI_NODE_SCROLL, root);
                // Bounded scroll content lets long confirmations retain buttons.
                real(scroll, NODE_HEIGHT, 160);
                real(scroll, NODE_WIDTH_PERCENT, 1);
                text(s, scroll, request.content, 16);
            }
            if (request.kind == Kind::Modal && request.editable) {
                auto input = make(s, ARKUI_NODE_TEXT_INPUT, root);
                string(input, NODE_TEXT_INPUT_PLACEHOLDER, request.placeholderText);
                string(input, NODE_TEXT_INPUT_TEXT, request.defaultText);
                real(input, NODE_WIDTH_PERCENT, 1);
                listen(s, input, NODE_TEXT_INPUT_ON_CHANGE, Edit);
            }
        } else if (request.kind == Kind::ActionSheet) {
            auto scroll = make(s, ARKUI_NODE_SCROLL, root);
            real(scroll, NODE_HEIGHT, std::min(320.0f, static_cast<float>(request.items.size() * 48)));
            real(scroll, NODE_WIDTH_PERCENT, 1);
            auto items = make(s, ARKUI_NODE_COLUMN, scroll);
            real(items, NODE_WIDTH_PERCENT, 1);
            for (size_t i = 0; i < request.items.size(); ++i)
                button(s, items, request.items[i], Action + static_cast<int>(i));
        } else if (request.kind == Kind::Picker) {
            auto picker = make(s, ARKUI_NODE_TEXT_PICKER, root);
            s.labels = OH_ArkUI_TextPickerRangeContentArray_Create(static_cast<int>(request.options.size()));
            if (!s.labels) throw std::runtime_error("E_APP_UI:cannot create picker data");
            for (size_t i = 0; i < request.options.size(); ++i) {
                // The official setter copies into the SDK-owned array.
                auto label = request.options[i].label;
                OH_ArkUI_TextPickerRangeContentArray_SetTextAtIndex(s.labels, label.data(), static_cast<int>(i));
            }
            ArkUI_NumberValue kind{}; kind.i32 = ARKUI_TEXTPICKER_RANGETYPE_RANGE_CONTENT;
            ArkUI_AttributeItem item{&kind, 1, nullptr, s.labels};
            check(node->setAttribute(picker, NODE_TEXT_PICKER_OPTION_RANGE, &item));
            integer(picker, NODE_TEXT_PICKER_OPTION_SELECTED, s.index);
            integer(picker, NODE_TEXT_PICKER_CAN_LOOP, false);
            real(picker, NODE_HEIGHT, 200); real(picker, NODE_WIDTH_PERCENT, 1);
            listen(s, picker, NODE_TEXT_PICKER_EVENT_ON_CHANGE, Selection);
        } else if (request.kind == Kind::DatePicker) {
            if (request.mode != "time") {
                if (request.mode != "year" && request.minYear >= 1901 && request.maxYear <= 2100) {
                    auto picker = make(s, ARKUI_NODE_DATE_PICKER, root);
                    string(picker, NODE_DATE_PICKER_START, std::to_string(request.minYear) + "-01-01");
                    string(picker, NODE_DATE_PICKER_END, std::to_string(request.maxYear) + "-12-31");
                    string(picker, NODE_DATE_PICKER_SELECTED, s.calendar.date());
                    integer(picker, NODE_DATE_PICKER_LUNAR, false);
                    integer(picker, NODE_DATE_PICKER_MODE, request.mode == "year-month" ?
                            ARKUI_DATEPICKER_YEAR_AND_MONTH : ARKUI_DATEPICKER_MODE_DATE);
                    real(picker, NODE_HEIGHT, 200); real(picker, NODE_WIDTH_PERCENT, 1);
                    listen(s, picker, NODE_DATE_PICKER_EVENT_ON_DATE_CHANGE, Date);
                } else {
                    // DatePicker cannot represent all 1000..9999 years. Native
                    // numeric TextPicker columns implement that exact contract.
                    auto row = make(s, ARKUI_NODE_ROW, root);
                    real(row, NODE_WIDTH_PERCENT, 1);
                    numberPicker(s, row, request.minYear, request.maxYear, s.calendar.year, Year);
                    if (request.mode != "year") numberPicker(s, row, 1, 12, s.calendar.month, Month);
                    if (request.mode == "date" || request.mode == "datetime")
                        s.dayPicker = numberPicker(s, row, 1, daysInMonth(s.calendar.year, s.calendar.month),
                                                   s.calendar.day, Day);
                }
            }
            if (request.mode == "time" || request.mode == "datetime") {
                auto picker = make(s, ARKUI_NODE_TIME_PICKER, root);
                string(picker, NODE_TIME_PICKER_SELECTED, s.calendar.time());
                integer(picker, NODE_TIME_PICKER_USE_MILITARY_TIME, true);
                real(picker, NODE_HEIGHT, 200); real(picker, NODE_WIDTH_PERCENT, 1);
                listen(s, picker, NODE_TIME_PICKER_EVENT_ON_CHANGE, Time);
            }
        } else if (request.kind == Kind::ImagePreview) {
            auto swiper = make(s, ARKUI_NODE_SWIPER, root);
            real(swiper, NODE_WIDTH_PERCENT, 1); real(swiper, NODE_HEIGHT, 320);
            integer(swiper, NODE_SWIPER_LOOP, false);
            for (const auto& url : request.urls) {
                auto image = make(s, ARKUI_NODE_IMAGE, swiper);
                real(image, NODE_WIDTH_PERCENT, 1); real(image, NODE_HEIGHT_PERCENT, 1);
                integer(image, NODE_IMAGE_OBJECT_FIT, ARKUI_OBJECT_FIT_CONTAIN);
                string(image, NODE_IMAGE_SRC, url);
            }
            integer(swiper, NODE_SWIPER_INDEX, s.index);
            listen(s, swiper, NODE_SWIPER_EVENT_ON_CHANGE, Image);
        }
        if (request.showCancel || request.kind == Kind::ActionSheet ||
            request.kind == Kind::Picker || request.kind == Kind::DatePicker)
            button(s, root, request.cancelText.empty() ? "取消" : request.cancelText, Cancel);
        if (request.kind != Kind::ActionSheet)
            button(s, root, request.kind == Kind::ImagePreview ? "关闭" : request.confirmText, Confirm);
        check(api.setContent(s.dialog, root));
    }

    static void receive(ArkUI_NodeEvent* event) noexcept {
        auto* session = static_cast<Session*>(OH_ArkUI_NodeEvent_GetUserData(event));
        if (!session) return;
        if (auto state = session->owner.lock()) {
            auto owned = state->active;
            if (!state->stopped && owned.get() == session && !session->closed) {
                try { state->event(owned, event); }
                catch (...) {
                    owned->error = "E_APP_UI:invalid native interaction";
                    state->close(owned);
                }
            }
        }
    }
    static void willDismiss(ArkUI_DialogDismissEvent* event) noexcept {
        auto* session = static_cast<Session*>(OH_ArkUI_DialogDismissEvent_GetUserData(event));
        if (!session) return;
        if (auto state = session->owner.lock()) {
            auto owned = state->active;
            if (state->stopped || owned.get() != session || session->closed) return;
            const bool blocked = session->request.kind == Kind::BottomSheet &&
                                 !session->request.dismissible && !session->closing;
            OH_ArkUI_DialogDismissEvent_SetShouldBlockDismiss(event, blocked);
            if (!blocked && !session->chosen) {
                try { session->chosen = session->reply(session->request.kind == Kind::ImagePreview); }
                catch (...) { session->error = "E_APP_UI:invalid dismissal"; }
            }
        }
    }
    static void didDisappear(void* data) noexcept {
        auto* session = static_cast<Session*>(data);
        if (!session) return;
        if (auto state = session->owner.lock()) {
            auto owned = state->active;
            if (!state->stopped && owned.get() == session) {
                session->closed = true;
                state->deferFinish(owned); // Never free callback data inside SDK frames.
            }
        }
    }

    void event(const std::shared_ptr<Session>& s, ArkUI_NodeEvent* event) {
        if (s->updatingPicker) return;
        const int32_t target = OH_ArkUI_NodeEvent_GetTargetId(event);
        if (target == Edit) {
            const auto* value = OH_ArkUI_NodeEvent_GetStringAsyncEvent(event);
            if (!value || !value->pStr) throw std::runtime_error("missing input");
            // Copy the ephemeral SDK string while its callback is alive.
            s->text = value->pStr;
            return;
        }
        if (target == Confirm || target == Cancel || target >= Action) {
            if (!s->chosen) {
                if (target >= Action) s->index = target - Action;
                s->chosen = s->reply(target != Cancel);
            }
            close(s);
            return;
        }
        if (s->closing) return;
        const auto* data = OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);
        if (!data) throw std::runtime_error("missing selection");
        const int value = data->data[0].i32;
        if (target == Selection || target == Image) {
            const auto count = target == Selection ? s->request.options.size() : s->request.urls.size();
            if (value < 0 || static_cast<size_t>(value) >= count) throw std::runtime_error("invalid selection");
            s->index = value;
        } else if (target == Time) {
            const int minute = data->data[1].i32;
            if (value < 0 || value > 23 || minute < 0 || minute > 59) throw std::runtime_error("invalid time");
            s->calendar.hour = value; s->calendar.minute = minute;
        } else {
            int year = s->calendar.year, month = s->calendar.month, day = s->calendar.day;
            if (target == Date) {
                if (data->data[1].i32 < 0 || data->data[1].i32 > 11)
                    throw std::runtime_error("invalid calendar month");
                year = value; month = data->data[1].i32 + 1; day = data->data[2].i32;
            } else if (target == Year) {
                if (value < 0 || value > s->request.maxYear - s->request.minYear)
                    throw std::runtime_error("invalid calendar year index");
                year = s->request.minYear + value;
            } else if (target == Month) {
                if (value < 0 || value >= 12) throw std::runtime_error("invalid calendar month index");
                month = value + 1;
            } else if (target == Day) {
                if (value < 0 || value >= 31) throw std::runtime_error("invalid calendar day index");
                day = value + 1;
            }
            if (year < s->request.minYear || year > s->request.maxYear ||
                month < 1 || month > 12 || day < 1 || day > 31) throw std::runtime_error("invalid calendar");
            const int clamped = std::min(day, daysInMonth(year, month));
            const bool rangeChanged = year != s->calendar.year || month != s->calendar.month;
            s->calendar.year = year; s->calendar.month = month; s->calendar.day = clamped;
            if (s->dayPicker && rangeChanged) {
                s->updatingPicker = true;
                try {
                    scope([&] {
                        setNumberRange(s->dayPicker, 1, daysInMonth(year, month));
                        integer(s->dayPicker, NODE_TEXT_PICKER_OPTION_SELECTED, clamped - 1);
                    });
                } catch (...) { s->updatingPicker = false; throw; }
                s->updatingPicker = false;
            }
        }
    }

    void close(const std::shared_ptr<Session>& session) noexcept {
        if (session->closing || session->closed || !session->dialog) return;
        session->closing = true;
        try { scope([&] { check(dialogs->nativeDialogAPI1.close(session->dialog)); }); }
        catch (...) {
            session->closing = false;
            session->error = "E_APP_UI:cannot close native dialog";
            // A failed close still owns the UI. Do not show the next dialog
            // until it really disappears or the owner explicitly shuts down.
        }
    }

    void deferFinish(const std::shared_ptr<Session>& session) noexcept {
        if (session->finishQueued) return;
        session->finishQueued = true;
        try {
            post([self = shared_from_this(), session] {
                if (!self->stopped && self->active == session) self->finish(session);
            });
        } catch (...) {
            session->finishQueued = false;
            session->error = "E_APP_UI:cannot dispatch dialog completion";
            // Preserve callback userdata until an explicit shutdown can dispose
            // it off the SDK stack. The host's JS shutdown fence cancels pins.
        }
    }

    void release(Session& s) noexcept {
        // SDK dispose/unregister ends callback delivery. Shutdown also replaces
        // dialog callbacks before disposing, so node teardown cannot reenter a
        // Session whose lifetime is ending.
        auto cleanup = [&] {
                if (s.dialog && dialogs) {
                    auto& api = dialogs->nativeDialogAPI1;
                    api.registerOnWillDismissWithUserData(s.dialog, nullptr, willDismiss);
                    dialogs->registerOnDidDisappear(s.dialog, nullptr, didDisappear);
                }
                if (node) {
                    for (auto [handle, event] : s.events) node->unregisterNodeEvent(handle, event);
                    for (auto handle : s.receivers) node->removeNodeEventReceiver(handle, receive);
                }
                if (s.dialog && dialogs) dialogs->nativeDialogAPI1.dispose(s.dialog);
                s.dialog = nullptr;
                if (node) {
                    for (auto it = s.edges.rbegin(); it != s.edges.rend(); ++it) node->removeChild(it->first, it->second);
                    for (auto it = s.nodes.rbegin(); it != s.nodes.rend(); ++it) node->disposeNode(*it);
                }
                if (s.labels) OH_ArkUI_TextPickerRangeContentArray_Destroy(s.labels);
                s.labels = nullptr;
                s.nodes.clear(); s.edges.clear(); s.events.clear(); s.receivers.clear();
        };
        try { scope(cleanup); } catch (...) {
            // Destruction uses explicit node/controller handles, so it can
            // unregister/dispose on the owning UI thread even when the window's
            // scope has already become invalid. Never leave freed userdata
            // registered merely because entering the container scope failed.
            cleanup();
        }
    }

    void finish(const std::shared_ptr<Session>& session) {
        if (active != session) return;
        auto outcome = session->chosen.value_or(session->reply(false));
        release(*session);
        active.reset();
        ++completing;
        emit(session, session->error.empty() ? std::move(outcome) :
             HarmonyNativeAppUIResult(HarmonyNativeAppUIError{session->error}));
        --completing;
        pump();
    }

    void cancelPending() {
        requireUI();
        auto pending = std::move(waiting);
        waiting.clear();
        ++completing;
        // Claim the active owner first: queued callbacks may reenter shutdown.
        if (active) {
            active->chosen = active->reply(false);
            close(active);
        }
        for (const auto& session : pending) emit(session, session->reply(false));
        --completing;
        pump();
    }

    void setForegroundPage(std::string pageId) {
        requireUI();
        if (stopped || foregroundPage == pageId) return;
        foregroundPage = std::move(pageId); // Publish before SDK/reentrant calls.
        auto session = active;
        if (session && session->ownerPage != foregroundPage) {
            // Leaving foreground is irreversible even if navigation returns
            // while close animation is still running. Queued work has no owner
            // yet and binds to the page that is foreground when it is shown.
            session->chosen = session->reply(false);
            close(session);
        }
        pump();
    }

    void shutdown() {
        requireUI();
        if (stopped) return;
        stopped = true;
        auto pending = std::move(waiting);
        waiting.clear();
        auto session = std::move(active);
        active.reset();
        if (session) {
            // No SDK callback may free data or acknowledge during teardown.
            close(session);
            release(*session);
            emit(session, HarmonyNativeAppUIError{"E_APP_UI_CLOSED:presenter was destroyed"});
        }
        for (const auto& entry : pending) emit(entry, HarmonyNativeAppUIError{"E_APP_UI_CLOSED:presenter was destroyed"});
        context = nullptr;
    }
};

HarmonyNativeAppUIPresenter::HarmonyNativeAppUIPresenter(ArkUI_ContextHandle context, PostUI post, Completion complete)
    : _state(std::make_shared<State>(context, std::move(post), std::move(complete))) {}
HarmonyNativeAppUIPresenter::~HarmonyNativeAppUIPresenter() { _state->shutdown(); }

void HarmonyNativeAppUIPresenter::present(HarmonyNativeAppUIRequest request) {
    auto state = _state; state->present(std::move(request));
}
void HarmonyNativeAppUIPresenter::cancelPending() { auto state = _state; state->cancelPending(); }
void HarmonyNativeAppUIPresenter::setForegroundPage(std::string pageId) {
    auto state = _state; state->setForegroundPage(std::move(pageId));
}
void HarmonyNativeAppUIPresenter::shutdown() { auto state = _state; state->shutdown(); }

} // namespace ValdiHarmony
