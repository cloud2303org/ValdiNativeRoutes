// Included after Node and gesture helpers. All state and ArkUI calls are UI-only.
enum InputAction : size_t { InputChange, InputBegin, InputEnd, InputReturn,
                           InputWillDelete, InputSelectionChange, InputWillChange };
static constexpr std::array<const char*, 7> inputActionNames {
    "onChange", "onEditBegin", "onEditEnd", "onReturn",
    "onWillDelete", "onSelectionChange", "onWillChange"
};

NativeTextInput::NativeTextInput(const std::shared_ptr<Node>& owner, bool multiline)
    : node(owner), backend(owner->backend), area(multiline), closes(!multiline),
      enterKey(multiline ? ARKUI_ENTER_KEY_TYPE_NEW_LINE : ARKUI_ENTER_KEY_TYPE_DONE) {}

bool NativeTextInput::valid() const {
    const auto owner = node.lock();
    return owner && handle && !retired && !owner->disposing && inputEnabled(*owner) &&
           owner->input.get() == this;
}

void NativeTextInput::initialize() {
    auto owner = node.lock();
    if (!owner) fail("editor requires an owner");
    handle = backend->api->createNode(area ? ARKUI_NODE_TEXT_AREA : ARKUI_NODE_TEXT_INPUT);
    if (!handle) fail("cannot allocate native text editor");
    owner->textHandle = handle;
    check(backend->api->setLengthMetricUnit(handle, ARKUI_LENGTH_METRIC_UNIT_PX), "set editor pixel units");
    check(backend->api->addChild(owner->handle, handle), "attach text editor");
    owner->textAttached = true;
    owner->color(handle, NODE_FONT_COLOR, 0xff000000);
    // Eliminate the native theme's visual padding/background; Valdi owns these.
    owner->number(handle, NODE_PADDING, 0);
    owner->color(handle, NODE_BACKGROUND_COLOR, 0);
    if (!area) {
        owner->integer(handle, NODE_TEXT_INPUT_SHOW_UNDERLINE, 0);
        owner->integer(handle, NODE_TEXT_INPUT_SHOW_PASSWORD_ICON, 0);
    }
    style();
    configuration();
}

void NativeTextInput::activate() {
    if (!valid()) return;
    if (!epoch.active) {
        epoch.replace();
        epoch.active = true;
        check(backend->api->addNodeEventReceiver(handle, event), "attach editor receiver");
        receiver = true;
        for (auto type : {
            area ? NODE_TEXT_AREA_ON_CHANGE_WITH_PREVIEW_TEXT : NODE_TEXT_INPUT_ON_CHANGE_WITH_PREVIEW_TEXT,
            area ? NODE_TEXT_AREA_ON_TEXT_SELECTION_CHANGE : NODE_TEXT_INPUT_ON_TEXT_SELECTION_CHANGE,
            area ? NODE_TEXT_AREA_ON_EDIT_CHANGE : NODE_TEXT_INPUT_ON_EDIT_CHANGE,
            area ? NODE_TEXT_AREA_ON_SUBMIT : NODE_TEXT_INPUT_ON_SUBMIT,
            area ? NODE_TEXT_AREA_ON_WILL_DELETE : NODE_TEXT_INPUT_ON_WILL_DELETE,
            area ? NODE_TEXT_AREA_ON_PASTE : NODE_TEXT_INPUT_ON_PASTE,
            area ? NODE_TEXT_AREA_ON_CUT : NODE_TEXT_INPUT_ON_CUT,
            area ? NODE_TEXT_AREA_ON_DID_INSERT : NODE_TEXT_INPUT_ON_DID_INSERT,
            area ? NODE_TEXT_AREA_ON_DID_DELETE : NODE_TEXT_INPUT_ON_DID_DELETE,
            NODE_TOUCH_EVENT, NODE_ON_KEY_EVENT}) {
            check(backend->api->registerNodeEvent(handle, type, 0, this), "register editor event");
            registered.push_back(type);
        }
    }
    // Request only after layout: initial attributes often arrive before mount.
    if (pendingFocus) {
        if (auto owner = node.lock()) owner->invalidate();
    }
}

void NativeTextInput::store(const char* key, const Value& value) {
    if (auto owner = node.lock()) {
        if (auto view = owner->viewNode.lock()) {
            view->valueChanged(view->getAttributeIds().getIdForName(std::string_view(key)), value);
        }
    }
}

void NativeTextInput::stop(bool clear) {
    backend->requireUI();
    auto keepAlive = shared_from_this();
    const auto terminal = eventValue(committed, true);
    const auto callback = actions[InputEnd];
    epoch.replace();
    setterEchoes.cancel();
    ++focusGeneration;
    const bool wasActive = std::exchange(epoch.active, false);
    inputEndSession(focused, callback, [&](bool ended) {
        if (clear) for (auto& action : actions) action = nullptr;
        requestedFocus = pendingFocus = false;
        composing = pasted = false;
        endReason = 0;
        if (!handle) return;
        for (auto type : registered) backend->api->unregisterNodeEvent(handle, type);
        registered.clear();
        if (receiver) check(backend->api->removeNodeEventReceiver(handle, event), "remove editor receiver");
        receiver = false;
        if (!wasActive && !ended) return;
        InputWriteGuard guard(epoch);
        ArkUI_NumberValue zero {};
        ArkUI_AttributeItem item {&zero, 1, nullptr, nullptr};
        // EDITING has no reset contract. Explicitly stop before releasing userdata.
        check(backend->api->setAttribute(handle, attr(NODE_TEXT_INPUT_EDITING, NODE_TEXT_AREA_EDITING), &item),
              "stop editor");
        // Avoid clearing another editor's focus when this editor was already idle.
        if (ended) check(backend->api->setAttribute(handle, NODE_FOCUS_STATUS, &item), "clear editor focus");
    }, [&] { store("focused", Value(false)); },
    [&](const auto& action) { deliver(action, terminal); });
}

void NativeTextInput::retire() {
    stop(true);
    retired = true;
    handle = nullptr; // Node owns and disposes its textHandle after receiver teardown.
}

void NativeTextInput::requestPendingFocus() {
    if (!pendingFocus || !valid() || !epoch.active || !enabled) return;
    pendingFocus = false;
    check(OH_ArkUI_FocusRequest(handle), "request editor focus");
    // Only EDIT_CHANGE may set focused or send begin/end.
}

void NativeTextInput::focus(bool value) {
    epoch.replace();
    const auto focusTicket = ++focusGeneration;
    requestedFocus = value;
    pendingFocus = value;
    if (value) {
        activate();
        return;
    }
    if (!handle) return;
    auto keepAlive = shared_from_this();
    auto owner = node.lock();
    if (!owner || owner->disposing) return;
    owner->integer(handle, attr(NODE_TEXT_INPUT_EDITING, NODE_TEXT_AREA_EDITING), 0);
    // Stopping editing may synchronously run an event and remove/rebind this node.
    if (focusTicket != focusGeneration || !valid() || requestedFocus) return;
    owner->integer(handle, NODE_FOCUS_STATUS, 0);
}

void NativeTextInput::style() {
    const auto owner = node.lock();
    if (!owner) return;
    auto keepAlive = shared_from_this();
    std::lock_guard fontLock(fontRegistry().mutex);
    applyResolvedFont(owner->fontEpoch, owner->textStyle,
        [&](const std::string& family) { return resolveFontFamily(*backend, family); },
        [&] { return handle && owner->handle && !retired && !owner->disposing &&
                     !backend->stopped && !backend->shuttingDown; },
        [&](const TextStyle& style, const std::string& family) {
            owner->number(handle, NODE_FONT_SIZE, style.size * backend->configuration.displayScale);
            owner->integer(handle, NODE_FONT_WEIGHT, style.weight / 100 - 1);
            owner->integer(handle, NODE_TEXT_ALIGN, style.alignment);
            if (family.empty()) check(backend->api->resetAttribute(handle, NODE_FONT_FAMILY), "reset editor font family");
            else owner->string(handle, NODE_FONT_FAMILY, family);
            owner->invalidate();
        });
}

void NativeTextInput::configuration() {
    auto owner = node.lock();
    if (!owner) return;
    const bool available = enabled;
    const auto generation = epoch.generation;
    const auto current = [&] {
        return generation == epoch.generation && handle && owner->handle && !owner->disposing &&
               !retired && !backend->stopped && !backend->shuttingDown;
    };
    // SDK has no read-only editor attribute here: disabled semantics also
    // disable native selection. Do not confuse EDITING with read-only state.
    owner->integer(handle, attr(NODE_TEXT_INPUT_BLUR_ON_SUBMIT, NODE_TEXT_AREA_BLUR_ON_SUBMIT), closes);
    if (!current()) return;
    owner->integer(handle, attr(NODE_TEXT_INPUT_ENTER_KEY_TYPE, NODE_TEXT_AREA_ENTER_KEY_TYPE), enterKey);
    if (!current()) return;
    const int32_t type = keyboard;
    if (area && (type == ARKUI_TEXTINPUT_TYPE_PASSWORD || type == ARKUI_TEXTINPUT_TYPE_NUMBER_PASSWORD ||
                 type == ARKUI_TEXTINPUT_TYPE_NUMBER_DECIMAL)) {
        fail("SDK TextArea has no password/decimal keyboard type");
    }
    owner->integer(handle, attr(NODE_TEXT_INPUT_TYPE, NODE_TEXT_AREA_TYPE), type);
    if (!current()) return;
    owner->integer(handle, attr(NODE_TEXT_INPUT_ENABLE_KEYBOARD_ON_FOCUS, NODE_TEXT_AREA_ENABLE_KEYBOARD_ON_FOCUS),
                   available);
    if (!current()) return;
    owner->integer(handle, NODE_ENABLED, available);
    if (!current()) return;
    owner->integer(handle, NODE_FOCUSABLE, available);
    if (!current()) return;
    // Enforce the official UTF-16 limit in committed processing. SDK MAX_LENGTH
    // counting policy differs for supplementary scalars; do not pre-truncate IME.
    if (!available) focus(false);
}

InputSelection NativeTextInput::selection(const std::string& text) const {
    const auto* item = backend->api->getAttribute(handle, attr(NODE_TEXT_INPUT_TEXT_SELECTION, NODE_TEXT_AREA_TEXT_SELECTION));
    if (item && item->value && item->size >= 2) return inputClamp({item->value[0].i32, item->value[1].i32}, text);
    // No invented byte-length offsets if SDK has no current selection.
    return inputClamp(committed.selection, text);
}

void NativeTextInput::write(const InputEdit& edit, bool text, bool selectionChanged) {
    auto owner = node.lock();
    if (!owner || !handle || retired || (!text && !selectionChanged)) return;
    auto keepAlive = shared_from_this();
    InputWriteGuard guard(epoch);
    // Keep registrations stable. Unregister/set/register cannot suppress the
    // SDK's deferred layout notification, which uses the restored listener.
    // Record before either setter so synchronous echoes can acknowledge too.
    const auto generation = epoch.generation;
    const auto ticket = setterEchoes.remember(edit, text, selectionChanged);
    try {
        if (text) owner->string(handle, attr(NODE_TEXT_INPUT_TEXT, NODE_TEXT_AREA_TEXT), edit.text);
        if (selectionChanged && generation == epoch.generation && handle && !retired && !owner->disposing) {
            ArkUI_NumberValue numbers[2] {};
            numbers[0].i32 = edit.selection.start;
            numbers[1].i32 = edit.selection.end;
            ArkUI_AttributeItem item {numbers, 2, nullptr, nullptr};
            owner->set(handle, attr(NODE_TEXT_INPUT_TEXT_SELECTION, NODE_TEXT_AREA_TEXT_SELECTION), item);
        }
    } catch (...) {
        setterEchoes.cancel(ticket);
        throw;
    }
    setterEchoes.complete(ticket, generation == epoch.generation && !retired && handle && !owner->disposing);
}

Value NativeTextInput::eventValue(const InputEdit& edit, bool reason) const {
    Value event;
    event.setMapValue("text", Value(StringBox::fromString(edit.text)));
    // Value(int64_t) is an opaque bigint-like value in this bridge. JS event
    // numbers must explicitly use double, including reason and UTF-16 offsets.
    event.setMapValue("selectionStart", Value(double(edit.selection.start)));
    event.setMapValue("selectionEnd", Value(double(edit.selection.end)));
    if (reason) event.setMapValue("reason", Value(double(endReason)));
    return event;
}

void NativeTextInput::deliver(const Ref<ValueFunction>& callback, const Value& event) {
    if (callback == nullptr || callback->ownerIsTearingDown()) return;
    auto result = callback->call(ValueFunctionFlagsNone, {event});
    if (!result) backend->report(result.error().toString());
}

void NativeTextInput::emit(const Ref<ValueFunction>& callback, const InputEdit& edit, bool reason) {
    if (epoch.active && valid()) deliver(callback, eventValue(edit, reason));
}

void NativeTextInput::emit(size_t action, const InputEdit& edit, bool reason) {
    const auto callback = actions[action];
    emit(callback, edit, reason);
}

static Value inputSelectionValue(InputSelection selection) {
    auto array = ValueArray::make(2);
    (*array)[0] = Value(double(selection.start));
    (*array)[1] = Value(double(selection.end));
    return Value(array);
}

bool NativeTextInput::storeEdit(uint64_t generation) {
    store("value", Value(StringBox::fromString(committed.text)));
    if (!epoch.current(generation) || !valid()) return false;
    store("selection", inputSelectionValue(committed.selection));
    return epoch.current(generation) && valid();
}

static int32_t inputOffset(const Value& value) {
    if (!value.isNumber()) fail("input selection must contain finite numbers");
    const double number = value.toDouble();
    if (!std::isfinite(number) || std::trunc(number) != number) fail("input selection must contain finite integers");
    return static_cast<int32_t>(std::clamp(number, double(std::numeric_limits<int32_t>::min()),
                                        double(std::numeric_limits<int32_t>::max())));
}

void NativeTextInput::change(ArkUI_TextChangeEvent& event) {
    const bool wasComposing = composing;
    // SDK preview offset is -1 for no marked range (including empty preedit).
    composing = event.number >= 0 || (event.pExtendStr && *event.pExtendStr);
    if (setterEchoes.text(event.pStr ? event.pStr : "", composing)) return;
    if (composing) return;
    const auto before = committed;
    InputEdit candidate {event.pStr ? event.pStr : "", {}};
    candidate.selection = selection(candidate.text);
    const bool newline = area && enterKey == ARKUI_ENTER_KEY_TYPE_NEW_LINE &&
                         inputSingleNewline(before, candidate, wasComposing, pasted);
    pasted = false;
    const auto callbacks = actions;
    auto result = inputProcess(epoch, candidate, limit, [&](const InputEdit& edit) -> std::optional<InputEdit> {
        auto callback = callbacks[InputWillChange];
        if (callback == nullptr || callback->ownerIsTearingDown()) return std::nullopt;
        DropAllTrackedLocks dropLocks;
        auto response = callback->call(ValueFunctionFlagsCallSync, {eventValue(edit)});
        if (!response) { backend->report(response.error().toString()); return std::nullopt; }
        if (response.value().isUndefined()) return std::nullopt; // accept, never veto
        if (!response.value().isMap()) { backend->report("onWillChange must return an EditTextEvent or undefined"); return std::nullopt; }
        const auto text = response.value().getMapValue("text");
        if (!text.isString()) { backend->report("onWillChange.text must be a string"); return std::nullopt; }
        try {
            InputEdit replacement {text.toStringBox().slowToString(),
                {inputOffset(response.value().getMapValue("selectionStart")),
                 inputOffset(response.value().getMapValue("selectionEnd"))}};
            inputLength(replacement.text);
            return replacement;
        } catch (const std::exception& error) {
            backend->report(error.what());
            return std::nullopt;
        }
    }, [&] { return valid(); });
    if (!result) return;
    // Preserve same-text IME commits: no native text setter unless correction
    // actually changed text. Selection correction is independent.
    if (!inputCommit(epoch, committed, notifiedSelection, std::move(*result),
        [&](const InputEdit& accepted) {
            write(accepted, accepted.text != candidate.text,
                  accepted.text != candidate.text || accepted.selection != candidate.selection);
        }, [&](uint64_t generation) { return storeEdit(generation); },
        [&](const InputEdit& accepted) { emit(callbacks[InputChange], accepted); },
        [&](const InputEdit& accepted) { emit(callbacks[InputSelectionChange], accepted); },
        [&] { return valid(); })) return;
    if (newline) submit();
}

void NativeTextInput::submit() {
    const auto generation = epoch.generation;
    endReason = closes ? 1 : 0;
    emit(InputReturn, committed);
    if (!epoch.current(generation) || !valid()) return;
    if (closes) focus(false);
}

void NativeTextInput::event(ArkUI_NodeEvent* event) noexcept {
    auto* raw = static_cast<NativeTextInput*>(OH_ArkUI_NodeEvent_GetUserData(event));
    if (!raw) return;
    auto self = raw->shared_from_this();
    auto owner = self->node.lock(); // Retain both through synchronous JS removal.
    try {
        self->backend->requireUI();
        if (!owner || !self->valid() || !self->epoch.active) return;
        const auto type = OH_ArkUI_NodeEvent_GetEventType(event);
        const bool editingEvent = type == NODE_TEXT_INPUT_ON_EDIT_CHANGE || type == NODE_TEXT_AREA_ON_EDIT_CHANGE;
        if (!self->enabled && !editingEvent) return;
        if (self->epoch.suppression && !editingEvent) {
            // A synchronous setter acknowledgement must consume its ticket as
            // well, so it cannot swallow a later same-text user commit.
            if (type == NODE_TEXT_INPUT_ON_CHANGE_WITH_PREVIEW_TEXT || type == NODE_TEXT_AREA_ON_CHANGE_WITH_PREVIEW_TEXT) {
                if (auto* change = OH_ArkUI_NodeEvent_GetTextChangeEvent(event)) {
                    self->setterEchoes.text(change->pStr ? change->pStr : "",
                        change->number >= 0 || (change->pExtendStr && *change->pExtendStr));
                }
            } else if (type == NODE_TEXT_INPUT_ON_TEXT_SELECTION_CHANGE || type == NODE_TEXT_AREA_ON_TEXT_SELECTION_CHANGE) {
                if (auto* data = OH_ArkUI_NodeEvent_GetNodeComponentEvent(event)) {
                    self->setterEchoes.selection({data->data[0].i32, data->data[1].i32});
                }
            }
            return;
        }
        if (type == NODE_TEXT_INPUT_ON_CHANGE_WITH_PREVIEW_TEXT || type == NODE_TEXT_AREA_ON_CHANGE_WITH_PREVIEW_TEXT) {
            auto* change = OH_ArkUI_NodeEvent_GetTextChangeEvent(event);
            if (change) self->change(*change);
        } else if (type == NODE_TEXT_INPUT_ON_TEXT_SELECTION_CHANGE || type == NODE_TEXT_AREA_ON_TEXT_SELECTION_CHANGE) {
            if (self->composing) return;
            auto* data = OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);
            if (!data) return;
            if (self->setterEchoes.selection({data->data[0].i32, data->data[1].i32})) return;
            const auto selection = inputClamp({data->data[0].i32, data->data[1].i32}, self->committed.text);
            if (selection == self->committed.selection && selection == self->notifiedSelection) return;
            self->epoch.replace();
            const auto generation = self->epoch.generation;
            self->committed.selection = selection;
            self->notifiedSelection = selection;
            self->store("selection", inputSelectionValue(selection));
            if (self->epoch.current(generation) && self->valid()) self->emit(InputSelectionChange, self->committed);
        } else if (type == NODE_TEXT_INPUT_ON_EDIT_CHANGE || type == NODE_TEXT_AREA_ON_EDIT_CHANGE) {
            auto* data = OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);
            if (!data) return;
            const bool focused = data->data[0].i32 != 0;
            if (focused == self->focused) return;
            if (!focused) {
                const auto terminal = self->eventValue(self->committed, true);
                inputEndSession(self->focused, self->actions[InputEnd], [&](bool) {
                    self->epoch.replace();
                    self->requestedFocus = self->pendingFocus = false;
                    self->composing = self->pasted = false;
                }, [&] { self->store("focused", Value(false)); },
                [&](const auto& action) { self->deliver(action, terminal); });
                return;
            }
            self->epoch.replace();
            const auto generation = self->epoch.generation;
            self->focused = focused;
            self->requestedFocus = focused;
            self->pendingFocus = false;
            self->store("focused", Value(focused));
            if (!self->epoch.current(generation) || !self->valid()) return;
            if (focused) {
                self->endReason = 0;
                if (self->selectOnFocus) {
                    self->committed.selection = {0, inputLength(self->committed.text)};
                    self->write(self->committed, false, true);
                    if (!self->epoch.current(generation) || !self->valid()) return;
                    self->store("selection", inputSelectionValue(self->committed.selection));
                    if (!self->epoch.current(generation) || !self->valid()) return;
                }
            } else self->composing = self->pasted = false;
            self->emit(focused ? InputBegin : InputEnd, self->committed, !focused);
        } else if (type == NODE_TEXT_INPUT_ON_SUBMIT || type == NODE_TEXT_AREA_ON_SUBMIT) {
            self->submit();
        } else if (type == NODE_TEXT_INPUT_ON_PASTE || type == NODE_TEXT_AREA_ON_PASTE) {
            self->setterEchoes.cancel();
            self->pasted = true;
        } else if (type == NODE_TEXT_INPUT_ON_WILL_DELETE || type == NODE_TEXT_AREA_ON_WILL_DELETE) {
            self->setterEchoes.cancel();
            if (!self->composing) self->emit(InputWillDelete, self->committed);
            // Notification only. No C veto return: Valdi's action returns void.
        } else if (type == NODE_TEXT_INPUT_ON_DID_INSERT || type == NODE_TEXT_AREA_ON_DID_INSERT ||
                   type == NODE_TEXT_INPUT_ON_DID_DELETE || type == NODE_TEXT_AREA_ON_DID_DELETE ||
                   type == NODE_TEXT_INPUT_ON_CUT || type == NODE_TEXT_AREA_ON_CUT) {
            self->setterEchoes.cancel(); // Observation only; no pre-edit veto hook.
        } else if (type == NODE_TOUCH_EVENT || type == NODE_ON_KEY_EVENT) {
            auto* input = OH_ArkUI_NodeEvent_GetInputEvent(event);
            // UP belongs to the same user operation and must not cancel a
            // processor correction written while handling that operation.
            if (input && (type == NODE_ON_KEY_EVENT
                ? OH_ArkUI_KeyEvent_GetType(input) == ARKUI_KEY_EVENT_DOWN
                : OH_ArkUI_UIInputEvent_GetAction(input) == UI_TOUCH_EVENT_ACTION_DOWN)) {
                self->setterEchoes.cancel();
            }
        }
    } catch (const std::exception& error) {
        self->backend->report(error.what());
    }
}

static void cancelSubtreeInput(Node& node) {
    node.fontEpoch.invalidate();
    auto input = node.input;
    if (input) input->stop();
    // Retain children because valueChanged can flush a batch.
    const auto children = node.children;
    for (const auto& child : children) cancelSubtreeInput(*child);
}

static int32_t inputKeyboard(std::string_view name, bool area) {
    if (name == "default" || name == "url" || name == "noSuggestions" ||
        name == "passwordVisible") return ARKUI_TEXTINPUT_TYPE_NORMAL;
    if (name == "number") return ARKUI_TEXTINPUT_TYPE_NUMBER;
    if (name == "phoneNumber") return ARKUI_TEXTINPUT_TYPE_PHONE_NUMBER;
    if (name == "email") return ARKUI_TEXTINPUT_TYPE_EMAIL;
    if (!area) {
        if (name == "password") return ARKUI_TEXTINPUT_TYPE_PASSWORD;
        if (name == "passwordNumber") return ARKUI_TEXTINPUT_TYPE_NUMBER_PASSWORD;
        if (name == "numberDecimal") return ARKUI_TEXTINPUT_TYPE_NUMBER_DECIMAL;
    }
    fail("unsupported keyboard/contentType for this SDK editor: " + std::string(name));
}

static int32_t inputReturnKey(std::string_view name, bool area) {
    if (name == "done") return ARKUI_ENTER_KEY_TYPE_DONE;
    if (name == "go") return ARKUI_ENTER_KEY_TYPE_GO;
    if (name == "next" || name == "continue") return ARKUI_ENTER_KEY_TYPE_NEXT;
    if (name == "search") return ARKUI_ENTER_KEY_TYPE_SEARCH;
    if (name == "send" || name == "join") return ARKUI_ENTER_KEY_TYPE_SEND;
    if (area && name == "linereturn") return ARKUI_ENTER_KEY_TYPE_NEW_LINE;
    fail("unsupported return key: " + std::string(name));
}

static bool textInputAttribute(Node& node, const StringBox& name, const Value& value) {
    auto input = node.input;
    if (!input) return false;
    const auto key = name.toStringView();
    for (size_t i = 0; i < inputActionNames.size(); ++i) {
        if (key == inputActionNames[i]) {
            if (!value.isNullOrUndefined() && !value.isFunction()) fail("input action must be a function");
            input->actions.bind(i, value.isFunction() ? value.getFunctionRef() : nullptr);
            return true;
        }
    }
    if (key == "value") {
        if (!value.isString()) fail("input value must be plain text");
        auto text = value.toStringBox().slowToString();
        inputLength(text);
        if (text == input->committed.text && !input->epoch.processing) {
            input->epoch.replace();
            return true; // controlled echo preserves IME
        }
        input->composing = false;
        if (inputProgrammaticEdit(input->epoch, input->committed, input->notifiedSelection,
            {std::move(text), input->committed.selection},
            [&](const InputEdit& edit) { input->write(edit, true, true); },
            [&] { return input->handle && !input->retired && !node.disposing && node.input == input; },
            [&](InputSelection selection) { input->store("selection", inputSelectionValue(selection)); })) node.invalidate();
    } else if (key == "selection") {
        auto* array = value.getArray();
        if (!array || array->size() != 2) fail("selection requires [start, end]");
        inputProgrammaticEdit(input->epoch, input->committed, input->notifiedSelection,
            {input->committed.text, {inputOffset((*array)[0]), inputOffset((*array)[1])}},
            [&](const InputEdit& edit) { input->write(edit, false, true); },
            [&] { return input->handle && !input->retired && !node.disposing && node.input == input; },
            [&](InputSelection selection) { input->store("selection", inputSelectionValue(selection)); });
    } else if (key == "focused") {
        input->focus(value.toBool());
    } else if (key == "placeholder") {
        node.string(input->handle, input->attr(NODE_TEXT_INPUT_PLACEHOLDER, NODE_TEXT_AREA_PLACEHOLDER),
                    value.toStringBox().slowToString());
    } else if (key == "color" || key == "placeholderColor") {
        node.color(input->handle, key == "color" ? NODE_FONT_COLOR :
            input->attr(NODE_TEXT_INPUT_PLACEHOLDER_COLOR, NODE_TEXT_AREA_PLACEHOLDER_COLOR), argb(value));
    } else if (key == "font" || key == "textAlign") {
        if (key == "font") applyFont(node.textStyle, value);
        else node.textStyle.alignment = textAlignment(value);
        input->style();
    } else if (key == "characterLimit") {
        input->epoch.replace();
        input->limit = inputOffset(value);
    } else if (key == "selectTextOnFocus") {
        input->epoch.replace();
        input->selectOnFocus = value.toBool();
    } else if (key == "autocapitalization") {
        const auto name = value.toStringBox().slowToString();
        if (name != "none" && name != "sentences" && name != "words" && name != "characters") {
            fail("invalid autocapitalization");
        }
        input->autocapitalization = name;
        // SDK92 C node API has no capitalization policy setter.
    } else if (key == "autocorrection") {
        const auto name = value.toStringBox().slowToString();
        if (name != "none" && name != "default") fail("invalid autocorrection");
        input->autocorrection = name;
        // Do not disable IME composition to pretend autocorrection parity.
    } else if (key == "enabled" || key == "contentType" ||
               key == "returnKeyText" || key == "returnType" || key == "closesWhenReturnKeyPressed") {
        input->epoch.replace();
        if (key == "enabled") input->enabled = value.toBool();
        else if (key == "contentType") {
            input->keyboard = inputKeyboard(value.toStringBox().toStringView(), input->area);
        } else if (key == "returnKeyText" || key == "returnType") {
            input->enterKey = inputReturnKey(value.toStringBox().toStringView(), input->area);
        } else input->closes = value.toBool();
        input->configuration();
    } else fail("unsupported native editor attribute: " + name.slowToString());
    return true;
}

static bool resetTextInputAttribute(Node& node, const StringBox& name) {
    auto input = node.input;
    if (!input) return false;
    const auto key = name.toStringView();
    for (auto* action : inputActionNames) {
        if (key == action) return textInputAttribute(node, name, Value());
    }
    if (key == "value" || key == "placeholder") return textInputAttribute(node, name, Value(STRING_LITERAL("")));
    if (key == "font") return textInputAttribute(node, name, Value(STRING_LITERAL("system 16")));
    if (key == "color" || key == "placeholderColor") {
        check(node.backend->api->resetAttribute(input->handle, key == "color" ? NODE_FONT_COLOR :
            input->attr(NODE_TEXT_INPUT_PLACEHOLDER_COLOR, NODE_TEXT_AREA_PLACEHOLDER_COLOR)), "reset editor color");
        return true;
    }
    if (key == "textAlign") return textInputAttribute(node, name, Value(STRING_LITERAL("left")));
    if (key == "autocapitalization") return textInputAttribute(node, name, Value(STRING_LITERAL("sentences")));
    if (key == "autocorrection") return textInputAttribute(node, name, Value(STRING_LITERAL("default")));
    if (key == "characterLimit") return textInputAttribute(node, name, Value(-1.0));
    if (key == "selection") {
        // SDK reset supports selection, while EDITING and FOCUS_STATUS require
        // explicit commands. Reset caret to end under the programmatic guard.
        auto array = ValueArray::make(2);
        (*array)[0] = (*array)[1] = Value(double(inputLength(input->committed.text)));
        return textInputAttribute(node, name, Value(array));
    }
    if (key == "focused" || key == "selectTextOnFocus") {
        return textInputAttribute(node, name, Value(false));
    }
    if (key == "enabled") return textInputAttribute(node, name, Value(true));
    if (key == "closesWhenReturnKeyPressed") return textInputAttribute(node, name, Value(!input->area));
    if (key == "contentType") {
        return textInputAttribute(node, name, Value(STRING_LITERAL("default")));
    }
    if (key == "returnKeyText" || key == "returnType") {
        return textInputAttribute(node, name, Value(input->area ? STRING_LITERAL("linereturn") : STRING_LITERAL("done")));
    }
    return false;
}

static void bindTextInputAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate) {
    // Plain text only; attributed/rich text is outside the native editor ABI.
    for (const char* name : {"value", "placeholder", "font", "textAlign", "contentType",
                             "returnKeyText", "returnType", "autocapitalization", "autocorrection"}) {
        binder.bindStringAttribute(StringBox::fromCString(name), false, delegate);
    }
    for (const char* name : {"enabled", "focused",
                             "closesWhenReturnKeyPressed", "selectTextOnFocus"}) {
        binder.bindBooleanAttribute(StringBox::fromCString(name), false, delegate);
    }
    for (const char* name : {"color", "placeholderColor"}) {
        binder.bindColorAttribute(StringBox::fromCString(name), false, delegate);
    }
    binder.bindIntAttribute(STRING_LITERAL("characterLimit"), false, delegate);
    binder.bindUntypedAttribute(STRING_LITERAL("selection"), false, delegate);
    for (auto* name : inputActionNames) binder.bindUntypedAttribute(StringBox::fromCString(name), false, delegate);
}
