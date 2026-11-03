// Included after NativeGestures/NativeScroll; no host or NAPI dependencies.
// All nodes, receivers and range arrays here are backend-owned and UI-only.

static std::string wheelString(const Value& value) {
    if (!value.isString()) fail("wheel configuration requires a string");
    auto result = value.toStringBox().slowToString();
    if (result.find('\0') != std::string::npos) fail("wheel strings cannot contain NUL");
    return result;
}

static int wheelInteger(const Value& value, int minimum, int maximum) {
    const auto number = value.toDouble();
    if (!value.isNumber() || value.isBool() || !std::isfinite(number) || number != std::floor(number) ||
        number < minimum || number > maximum) fail("wheel integer out of range");
    return static_cast<int>(number);
}

static std::vector<WheelOption> wheelOptions(const Value& value, bool tree, size_t depth = 0) {
    const auto* items = value.getArray();
    if (!items || items->size() > size_t(std::numeric_limits<int32_t>::max()) || depth > 256)
        fail("invalid wheel option array");
    std::vector<WheelOption> result;
    result.reserve(items->size());
    for (const auto& item : *items) {
        if (!item.isMap()) fail("wheel option requires an object");
        WheelOption option;
        option.value = wheelString(item.getMapValue("value"));
        option.label = wheelString(item.getMapValue("label"));
        if (option.value.empty() || option.label.empty()) fail("empty wheel option");
        const auto children = item.getMapValue("children");
        if (tree && !children.isUndefined()) option.children = wheelOptions(children, true, depth + 1);
        result.push_back(std::move(option));
    }
    return result;
}

static WheelConfig parseWheelConfig(const Value& object, WheelKind kind) {
    if (!object.isMap()) fail("wheel configuration requires an object");
    WheelConfig result;
    result.kind = kind;
    if (kind == WheelKind::Column || kind == WheelKind::Tree) {
        result.options = wheelOptions(object.getMapValue(kind == WheelKind::Column ? "options" : "data"),
                                      kind == WheelKind::Tree);
        if (result.options.empty()) fail("wheel data must not be empty");
        if (kind == WheelKind::Column) result.value = wheelString(object.getMapValue("value"));
        else {
            result.columns = wheelInteger(object.getMapValue("columns"), 1, std::numeric_limits<int32_t>::max());
            const auto values = object.getMapValue("value");
            const auto* path = values.getArray();
            if (!path) fail("tree value requires an array");
            for (const auto& value : *path) result.path.push_back(wheelString(value));
        }
    } else {
        result.mode = wheelString(object.getMapValue("mode"));
        result.value = wheelString(object.getMapValue("value"));
        result.minYear = wheelInteger(object.getMapValue("minYear"), 1000, 9999);
        result.maxYear = wheelInteger(object.getMapValue("maxYear"), result.minYear, 9999);
        const auto& mode = result.mode;
        const auto& value = result.value;
        const size_t length = mode == "year" ? 4 : mode == "year-month" ? 7 :
                              mode == "date" ? 10 : mode == "time" ? 5 : mode == "datetime" ? 16 : 0;
        if (!length || value.size() != length) fail("invalid wheel time format");
        for (size_t i = 0; i < value.size(); ++i) {
            const char separator = mode == "time" ? (i == 2 ? ':' : 0) :
                i == 4 || i == 7 ? '-' : i == 10 ? ' ' : i == 13 ? ':' : 0;
            if (separator ? value[i] != separator : value[i] < '0' || value[i] > '9')
                fail("invalid wheel time format");
        }
        // Numeric clamping, including Gregorian day limits, is done without
        // creating a local-time Date or interpreting a timezone.
    }
    return result;
}

struct NativeWheel::Control : std::enable_shared_from_this<NativeWheel::Control> {
    std::weak_ptr<NativeWheel> wheel;
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr;
    ArkUI_TextPickerRangeContentArray* range = nullptr;
    WheelColumn column;
    const uint64_t generation;
    const size_t index;
    const int segment; // -1 = wheel column, 0/1 = date/time segment button
    bool receiver = false, attached = false, retired = false;
    uint32_t frames = 0;
    std::vector<ArkUI_NodeEventType> registered;
    WheelInteraction interaction;
    int32_t x = 0, y = 0;

    Control(const std::shared_ptr<NativeWheel>& owner, uint64_t generation, size_t index,
            WheelColumn column, int segment = -1)
        : wheel(owner), backend(owner->backend), column(std::move(column)),
          generation(generation), index(index), segment(segment) {}
    bool current() const {
        auto owner = wheel.lock();
        return !retired && owner && owner->generation == generation && owner->active();
    }
    void dispose() {
        if (handle) backend->api->disposeNode(handle);
        handle = nullptr;
        if (range) OH_ArkUI_TextPickerRangeContentArray_Destroy(range);
        range = nullptr;
        // column.labels stays alive until the SDK node and array are released.
    }
    void deferDispose() {
        auto self = shared_from_this();
        backend->configuration.dispatchUI([self] {
            if (self->frames) self->deferDispose();
            else self->dispose();
        }, false);
    }
    struct Frame {
        std::shared_ptr<Control> control;
        explicit Frame(std::shared_ptr<Control> control) : control(std::move(control)) { ++this->control->frames; }
        ~Frame() { --control->frames; }
    };
    void retire(ArkUI_NodeHandle parent) {
        if (retired) return;
        retired = true;
        interaction.cancel();
        for (auto type : registered) backend->api->unregisterNodeEvent(handle, type);
        registered.clear();
        if (receiver) check(backend->api->removeNodeEventReceiver(handle, NativeWheel::event), "remove wheel receiver");
        receiver = false;
        if (attached && parent) check(backend->api->removeChild(parent, handle), "unlink wheel control");
        attached = false;
        // dispatchUI(false) is contractually queued. Retain userdata, label
        // buffers and arrays past reentrant native event/measure/layout frames.
        deferDispose();
    }
};

NativeWheel::NativeWheel(const std::shared_ptr<Node>& owner, WheelKind kind)
    : node(owner), backend(owner->backend), kind(kind) {}

bool NativeWheel::active() const {
    auto owner = node.lock();
    return !retired && !replacing && owner && owner->wheel.get() == this && owner->imageAttachmentEnabled && inputEnabled(*owner);
}

void NativeWheel::replace(WheelState next) {
    auto self = shared_from_this();
    auto owner = node.lock();
    if (!owner || retired || owner->disposing) return;
    if (replacing) fail("reentrant wheel configuration");
    struct Replacing {
        bool& value;
        explicit Replacing(bool& value) : value(value) { value = true; }
        ~Replacing() { value = false; }
    } replacingScope(replacing);
    const auto ticket = generation + 1;
    std::vector<std::shared_ptr<Control>> fresh;
    // Allocate/configure/register all new controls before changing committed
    // model or unlinking old controls. Failed config/mount preserves last state.
    auto append = [&](WheelColumn column, size_t index, int segment) {
        auto control = std::make_shared<Control>(self, ticket, index, std::move(column), segment);
        fresh.push_back(control); // owns partial allocations on every throw
        auto* api = backend->api;
        control->handle = api->createNode(segment < 0 ? ARKUI_NODE_TEXT_PICKER : ARKUI_NODE_BUTTON);
        if (!control->handle) fail("cannot allocate wheel control");
        owner->integer(control->handle, NODE_DIRECTION, ARKUI_DIRECTION_LTR);
        if (segment < 0) {
            control->range = OH_ArkUI_TextPickerRangeContentArray_Create(static_cast<int32_t>(control->column.labels.size()));
            if (!control->range) fail("cannot allocate wheel range");
            for (size_t i = 0; i < control->column.labels.size(); ++i) {
                OH_ArkUI_TextPickerRangeContentArray_SetTextAtIndex(control->range, control->column.labels[i].data(),
                                                                 static_cast<int32_t>(i));
            }
            ArkUI_NumberValue type {};
            type.i32 = ARKUI_TEXTPICKER_RANGETYPE_RANGE_CONTENT;
            ArkUI_AttributeItem item {&type, 1, nullptr, control->range};
            owner->set(control->handle, NODE_TEXT_PICKER_OPTION_RANGE, item);
            owner->integer(control->handle, NODE_TEXT_PICKER_CAN_LOOP, 0);
            owner->number(control->handle, NODE_TEXT_PICKER_DEFAULT_PICKER_ITEM_HEIGHT, 40);
            ArkUI_NumberValue selected {};
            selected.u32 = static_cast<uint32_t>(control->column.selected);
            item = {&selected, 1, nullptr, nullptr};
            owner->set(control->handle, NODE_TEXT_PICKER_OPTION_SELECTED, item);
        } else {
            owner->string(control->handle, NODE_BUTTON_LABEL, segment ? "时间" : "日期");
            owner->integer(control->handle, NODE_BACKGROUND_COLOR,
                           next.timeSegment == bool(segment) ? 0xffe0e7ff : 0xfff3f4f6);
        }
        // Programmatic setters run before receiver registration. Later queued
        // setter notices still need a new DOWN and a changed tentative index.
        check(api->addNodeEventReceiver(control->handle, event), "add wheel receiver");
        control->receiver = true;
        const std::vector<ArkUI_NodeEventType> types = segment < 0
            ? std::vector<ArkUI_NodeEventType>{NODE_TOUCH_EVENT, NODE_TEXT_PICKER_EVENT_ON_CHANGE,
                                             NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP}
            : std::vector<ArkUI_NodeEventType>{NODE_ON_CLICK};
        for (auto type : types) {
            check(api->registerNodeEvent(control->handle, type, 0, control.get()), "register wheel event");
            control->registered.push_back(type);
        }
        check(api->addChild(owner->handle, control->handle), "mount wheel control");
        control->attached = true;
    };
    try {
        if (next.config) {
            for (size_t i = 0; i < next.visible.size(); ++i) append(next.visible[i], i, -1);
            if (next.config->kind == WheelKind::Time && next.config->mode == "datetime") {
                append({}, 0, 0); append({}, 0, 1);
            }
        }
    } catch (...) {
        for (auto& control : fresh) control->retire(owner->handle);
        throw;
    }
    auto previous = std::move(controls);
    ++generation; // invalidate old/delayed branch/day events before any unlink
    controls = std::move(fresh);
    state = std::move(next);
    for (auto& control : previous) control->retire(owner->handle);
    owner->invalidate();
}

void NativeWheel::configure(const Value& object) {
    const auto config = parseWheelConfig(object, kind);
    auto next = state;
    if (next.configure(config)) replace(std::move(next));
    else state = std::move(next); // acknowledge echoes without rebuilding
}

void NativeWheel::activate() {
    if (active() && controls.empty() && state.config) replace(state);
}

void NativeWheel::stop(bool clear) {
    auto owner = node.lock();
    ++generation;
    auto previous = std::move(controls);
    controls.clear();
    if (clear) { onChange = nullptr; state.echo.clear(); }
    for (auto& control : previous) control->retire(owner ? owner->handle : nullptr);
}

void NativeWheel::retire() {
    if (retired) return;
    retired = true;
    stop(true);
}

void NativeWheel::measure(int32_t width, int32_t height) {
    // Snapshot controls: a native callback may synchronously remove this owner.
    const auto current = controls;
    const auto count = state.visible.size();
    const bool segmented = state.config && state.config->kind == WheelKind::Time && state.config->mode == "datetime";
    const int32_t top = segmented ? std::min(height, pixels(44, backend->configuration.displayScale)) : 0;
    for (const auto& control : current) {
        if (control->retired) continue;
        Control::Frame frame(control);
        const auto n = control->segment < 0 ? count : 2;
        const auto i = control->segment < 0 ? control->index : size_t(control->segment);
        const auto left = int32_t(int64_t(width) * int64_t(i) / int64_t(n));
        const auto right = int32_t(int64_t(width) * int64_t(i + 1) / int64_t(n));
        control->x = left; control->y = control->segment < 0 ? top : 0;
        Constraint constraint(right - left, control->segment < 0 ? std::max(0, height - top) : top);
        check(backend->api->measureNode(control->handle, constraint.value), "measure wheel control");
    }
}

void NativeWheel::layout() {
    const auto current = controls;
    for (const auto& control : current) {
        if (!control->retired) {
            Control::Frame frame(control);
            check(backend->api->layoutNode(control->handle, control->x, control->y), "layout wheel control");
        }
    }
}

void NativeWheel::settled(const std::shared_ptr<Control>& control, size_t selected) {
    if (!control->current()) return;
    auto next = state;
    if (!next.select(control->index, selected)) {
        // A duplicate public value resolves to the first matching row/branch.
        // Reconcile that native row silently without discarding its suffix.
        if (selected != next.visible[control->index].selected) replace(std::move(next));
        return;
    }
    auto callback = onChange; // retain before a replacement or synchronous JS
    const bool deliver = callback != nullptr && !callback->ownerIsTearingDown();
    const auto value = next.publicValue();
    if (deliver) next.echo.pending.push_back(value);
    replace(std::move(next)); // commit model + echo BEFORE invoking user code
    if (deliver && active()) {
        Value argument;
        if (const auto* path = std::get_if<std::vector<std::string>>(&value)) {
            auto array = ValueArray::make(path->size());
            for (size_t i = 0; i < path->size(); ++i) (*array)[i] = Value((*path)[i]);
            argument = Value(array);
        } else argument = Value(std::get<std::string>(value));
        auto result = callback->call(ValueFunctionFlagsBoundedMainThreadSync, {argument});
        if (!result) backend->report(result.error().toString());
    }
    // No native/control access after callback; it can remove/rebind/close us.
}

void NativeWheel::segment(const std::shared_ptr<Control>& control) {
    if (!control->current() || state.timeSegment == bool(control->segment)) return;
    auto next = state;
    next.timeSegment = bool(control->segment);
    next.rebuild();
    replace(std::move(next)); // presentation only, never selection delivery
}

void NativeWheel::event(ArkUI_NodeEvent* native) noexcept {
    auto* raw = static_cast<Control*>(OH_ArkUI_NodeEvent_GetUserData(native));
    auto control = raw ? raw->weak_from_this().lock() : nullptr;
    if (!control || !control->current()) return;
    auto self = control->wheel.lock();
    if (!self) return;
    Control::Frame frame(control);
    try {
        const auto type = OH_ArkUI_NodeEvent_GetEventType(native);
        if (type == NODE_ON_CLICK && control->segment >= 0) { self->segment(control); return; }
        if (type == NODE_TOUCH_EVENT) {
            auto* input = OH_ArkUI_NodeEvent_GetInputEvent(native);
            if (!input) return;
            const auto action = OH_ArkUI_UIInputEvent_GetAction(input);
            if (action == UI_TOUCH_EVENT_ACTION_DOWN) control->interaction.begin();
            else if (action == UI_TOUCH_EVENT_ACTION_CANCEL) control->interaction.cancel();
            return; // UP is not a substitute for native scroll settlement
        }
        if (!control->interaction.armed) return;
        const auto* getter = self->backend->api->getAttribute(control->handle, NODE_TEXT_PICKER_OPTION_SELECTED);
        auto* payload = OH_ArkUI_NodeEvent_GetNodeComponentEvent(native);
        if (!getter || !getter->value || getter->size != 1 || !payload || payload->data[0].i32 < 0) return;
        const auto index = size_t(getter->value[0].u32);
        const auto notice = size_t(payload->data[0].i32);
        if (index >= control->column.values.size() || notice != index) return;
        if (type == NODE_TEXT_PICKER_EVENT_ON_CHANGE) {
            control->interaction.tentative = index;
        } else if (type == NODE_TEXT_PICKER_EVENT_ON_SCROLL_STOP && control->interaction.stop(index, notice)) {
            self->settled(control, index);
        }
    } catch (const std::exception& error) { self->backend->report(error.what()); }
}

static void applyWheelAttribute(Node& node, const StringBox& name, const Value& value) {
    node.live();
    auto wheel = node.wheel;
    if (!wheel) fail("wheel delegate requires a wheel");
    if (name == "config") wheel->configure(value);
    else if (name == "onChange") {
        if (!value.isFunction()) fail("wheel onChange requires a function");
        wheel->onChange = value.getFunctionRef();
    }
    else fail("unsupported wheel attribute: " + name.slowToString());
}

static void resetWheelAttribute(Node& node, const StringBox& name) {
    node.live();
    if (name == "onChange") node.wheel->onChange = nullptr;
    else if (name == "config") node.wheel->replace(WheelState{});
    else fail("unsupported wheel reset: " + name.slowToString());
    // Empty replacement invalidates the old generation and clears selection,
    // config and echoes. onChange has its own reset/binding lifetime.
}

static void bindWheelAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate) {
    binder.bindUntypedAttribute(STRING_LITERAL("config"), false, delegate);
    binder.bindUntypedAttribute(STRING_LITERAL("onChange"), false, delegate);
}

class WheelAttributeDelegate final : public ViewAttributeHandlerDelegate {
public:
    Result<Void> onViewApply(const Ref<View>& view, const StringBox& name, const Value& value,
                             const Ref<Animator>&) override {
        try {
            auto* native = dynamic_cast<ArkUIView*>(view.get());
            if (!native) fail("wheel delegate requires an ArkUIView");
            auto node = native->backendNode();
            applyWheelAttribute(*node, name, value);
            return Void();
        } catch (const std::exception& error) { return Error(error.what()); }
    }
    void onViewReset(const Ref<View>& view, const StringBox& name, const Ref<Animator>&) override {
        auto* native = dynamic_cast<ArkUIView*>(view.get());
        if (!native) return;
        auto node = native->backendNode();
        try { resetWheelAttribute(*node, name); }
        catch (const std::exception& error) { node->backend->report(error.what()); }
    }
};
