// UI-only private binding. Included after the existing native controls. The
// panel and viewport belong to the host; only our recognizer and receiver
// registrations are owned here.
struct SheetInteraction : std::enable_shared_from_this<SheetInteraction> {
    struct ScrollEntry {
        std::weak_ptr<Node> node;
        std::shared_ptr<NativeScroll> scroll;
        uint64_t mountEpoch = 0;
        ArkUI_NodeHandle handle = nullptr;
    };
    std::weak_ptr<Node> root;
    std::shared_ptr<Backend> backend;
    std::shared_ptr<SheetInteractionBinding> binding;
    std::shared_ptr<SheetInteractionLifetime> lifetime;
    ArkUI_NodeHandle panel = nullptr, mountParent = nullptr, rootHandle = nullptr;
    ArkUI_ContextHandle context = nullptr;
    ArkUI_GestureRecognizer* pan = nullptr;
    uint64_t generation = 0, mountEpoch = 0, scrollGeneration = 0;
    int32_t rootId = 0, panelId = 0, parentId = 0;
    bool live = true, receiver = false, touchRegistered = false, interrupter = false, attached = false;
    SheetTouchSession session;
    ScrollMotion touchMotion; // timestamps measure velocity ONLY, never event identity
    std::vector<ScrollEntry> chain; // deepest first; ONE budget for this chain
    std::weak_ptr<NativeScroll> publishingScroll;
    std::function<bool()> publishingCurrent;

    SheetInteraction(const std::shared_ptr<Node>& owner, std::shared_ptr<SheetInteractionBinding> value)
        : root(owner), backend(owner->backend), binding(std::move(value)), lifetime(binding->lifetime),
          panel(binding->panel), mountParent(binding->rootMountParent), context(binding->context),
          generation(lifetime->generation), mountEpoch(owner->sheetMountEpoch) {}

    bool cleanupMemoryCurrent() const {
        auto owner = root.lock();
        return live && lifetime && lifetime->live.load() && lifetime->generation == generation &&
            binding->lifetime == lifetime && binding->panel == panel &&
            binding->rootMountParent == mountParent && binding->context == context &&
            owner && !owner->disposing && owner->handle == rootHandle &&
            !backend->stopped && !backend->shuttingDown &&
            owner->backend == backend && owner->sheetInteraction.get() == this &&
            owner->sheetMountEpoch == mountEpoch && owner->hostParent == mountParent &&
            owner->parent.expired() &&
            context && backend->configuration.uiContext == context;
    }
    bool memoryCurrent() const {
        auto owner = root.lock();
        return cleanupMemoryCurrent() && owner && inputEnabled(*owner);
    }
    bool current() const {
        // Check the revocation token before EVERY borrowed-node access. The
        // host must revoke/unbind before detaching or replacing its panel.
        if (!memoryCurrent()) return false;
        auto owner = root.lock();
        int32_t actualRoot = 0, actualPanel = 0, actualParent = 0;
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(owner->handle, &actualRoot), "read sheet root identity");
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(panel, &actualPanel), "read sheet panel identity");
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(mountParent, &actualParent), "read sheet viewport identity");
        return actualRoot == rootId && actualPanel == panelId && actualParent == parentId &&
            backend->api->getParent(owner->handle) == mountParent &&
            sheetNativeWithin(*backend, mountParent, panel);
    }
    bool chainCurrent() const {
        if (!current() || chain.empty()) return false;
        auto owner = root.lock();
        for (const auto& entry : chain) {
            auto value = entry.node.lock();
            if (!value || value->backend != backend || value->sheetMountEpoch != entry.mountEpoch ||
                value->disposing || value->scroll != entry.scroll || !inputEnabled(*value) ||
                entry.scroll->retired || !entry.handle || entry.scroll->handle != entry.handle ||
                !entry.scroll->enabled || entry.scroll->pending ||
                entry.scroll->geometry.horizontal || !interactionWithin(*value, *owner)) return false;
        }
        return !session.accepted || chain.front().scroll->sequence.current(scrollGeneration);
    }
    bool owns(NativeScroll& value) const {
        return session.source == SheetMotionSource::ScrollBudget && session.accepted &&
            !session.terminal && session.touching &&
            std::any_of(chain.begin(), chain.end(), [&](const auto& item) { return item.scroll.get() == &value; });
    }

    void initialize() {
        auto owner = root.lock();
        if (!owner || !lifetime || !lifetime->live.load() || !panel || !mountParent || !context ||
            context != backend->configuration.uiContext || !owner->parent.expired() ||
            owner->hostParent != mountParent || backend->api->getParent(owner->handle) != mountParent ||
            !sheetNativeWithin(*backend, mountParent, panel)) fail("sheet binding requires its exact mounted root/panel/context");
        rootHandle = owner->handle;
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(owner->handle, &rootId), "capture sheet root identity");
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(panel, &panelId), "capture sheet panel identity");
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(mountParent, &parentId), "capture sheet viewport identity");
        check(backend->api->addNodeEventReceiver(panel, touch), "add sheet panel touch receiver");
        receiver = true;
        check(backend->api->registerNodeEvent(panel, NODE_TOUCH_EVENT, 0, this), "register sheet panel touch");
        touchRegistered = true;
        pan = backend->gestures->createPanGesture(1, GESTURE_DIRECTION_VERTICAL,
                                                 8 * backend->configuration.displayScale);
        if (!pan) fail("cannot create sheet panel pan");
        check(backend->gestures->setGestureEventTarget(pan,
            GESTURE_EVENT_ACTION_ACCEPT | GESTURE_EVENT_ACTION_UPDATE |
            GESTURE_EVENT_ACTION_END | GESTURE_EVENT_ACTION_CANCEL, this, gesture), "set sheet panel pan target");
        check(backend->gestures2->setGestureInterrupterToNode(panel, this, interrupt), "register sheet panel admission");
        interrupter = true;
        check(backend->gestures->addGestureToNode(panel, pan, NORMAL, NORMAL_GESTURE_MASK), "attach sheet panel pan");
        attached = true;
    }

    void finish(float velocity, SheetInteractionEndReason reason, bool nativeCleanup = false) {
        const auto ticket = session.id;
        // A failed post-callback fence must not initiate further native work.
        // Explicit teardown owns restoration of its own still-live scroll
        // handles before calling end, even after revoking the borrowed panel.
        const bool restore = nativeCleanup || cleanupMemoryCurrent();
        const bool notify = session.consumeEnd(); // consume BEFORE properties or a callback can reenter
        auto previous = std::move(chain);
        chain.clear();
        publishingScroll.reset();
        publishingCurrent = {};
        // Restore only the scrolls participating in this exact session.
        // Unrelated, wrong-start, Refresh and horizontal scrolls never changed.
        for (const auto& entry : previous) {
            auto owner = entry.node.lock();
            auto page = root.lock();
            if (restore && owner && !owner->disposing && owner->scroll == entry.scroll &&
                !entry.scroll->retired && entry.handle && entry.scroll->handle == entry.handle &&
                (nativeCleanup || owner->sheetMountEpoch == entry.mountEpoch) &&
                page && !page->disposing && page->handle == rootHandle &&
                page->backend == backend && (nativeCleanup || page->sheetMountEpoch == mountEpoch) &&
                page->hostParent == mountParent &&
                backend->configuration.uiContext == context &&
                (!page->sheetInteraction || page->sheetInteraction.get() == this) &&
                !backend->stopped && !backend->shuttingDown) entry.scroll->properties();
        }
        auto callback = binding->end;
        if (notify && callback) callback(ticket, std::isfinite(velocity) ? velocity : 0, reason);
        // No native access here after end: it may have closed the whole runtime.
    }
    void retire() {
        if (!std::exchange(live, false)) return;
        lifetime->revoke();
        // The unbind contract retains these borrowed handles until this call
        // returns. Unregister BEFORE notifying the host. Never dispose nodes.
        if (touchRegistered) backend->api->unregisterNodeEvent(panel, NODE_TOUCH_EVENT);
        touchRegistered = false;
        if (receiver) check(backend->api->removeNodeEventReceiver(panel, touch), "remove sheet panel receiver");
        receiver = false;
        if (interrupter) check(backend->gestures2->setGestureInterrupterToNode(panel, nullptr, nullptr), "remove sheet panel admission");
        interrupter = false;
        if (attached) check(backend->gestures->removeGestureFromNode(panel, pan), "remove sheet panel pan");
        attached = false;
        auto self = shared_from_this();
        // Keep userdata and SDK recognizer alive beyond ANY currently running
        // touch/gesture/scroll/host callback, using the shared later UI queue.
        backend->configuration.dispatchUI([self] {
            if (self->pan) self->backend->gestures->dispose(self->pan);
            self->pan = nullptr;
        }, false);
        finish(0, SheetInteractionEndReason::LifecycleCanceled, true);
    }
    bool start() {
        if (!current() || !session.begin(backend->nextSheetSession++)) return false;
        const auto ticket = session.id;
        auto callback = binding->begin;
        bool accepted = false;
        try { accepted = callback && callback(ticket); }
        catch (...) {
            session.admitted(false);
            session.consumeEnd();
            throw;
        }
        // Even if begin synchronously unbound us, a true return accepted this
        // ticket. Deliver its single cancellation using owned data only.
        session.admitted(accepted);
        if (!accepted) return false;
        if (!current() || session.id != ticket || session.terminal || !session.touching ||
            (session.source == SheetMotionSource::ScrollBudget && !chainCurrent())) {
            finish(0, SheetInteractionEndReason::LifecycleCanceled);
            return false;
        }
        if (session.source == SheetMotionSource::ScrollBudget) {
            scrollGeneration = chain.front().scroll->sequence.generation;
            auto selected = chain;
            for (const auto& entry : selected) {
                if (!chainCurrent() || !session.owns(ticket)) return false;
                entry.scroll->properties();
            }
        }
        return current() && session.owns(ticket);
    }

    static bool isTouch(const ArkUI_UIInputEvent* input) {
        return input && OH_ArkUI_UIInputEvent_GetType(input) == ARKUI_UIINPUTEVENT_TYPE_TOUCH &&
            OH_ArkUI_UIInputEvent_GetSourceType(input) == UI_INPUT_EVENT_SOURCE_TYPE_TOUCH_SCREEN;
    }
    static bool touchesHandle(const ArkUI_TouchRecognizerHandleArray touches, int32_t count,
                              ArkUI_NodeHandle handle) {
        if (!handle) return false;
        int32_t id = 0;
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(handle, &id), "read sheet hit identity");
        for (int32_t i = 0; i < count; ++i) {
            if (OH_ArkUI_TouchRecognizer_GetNodeHandle(touches[i]) == handle ||
                OH_ArkUI_TouchRecognizer_IsHostBelongsTo(touches[i], id)) return true;
        }
        return false;
    }
    static bool exclusiveNativeType(int32_t type) {
        return type == ARKUI_NODE_TEXT_INPUT || type == ARKUI_NODE_TEXT_AREA ||
            type == ARKUI_NODE_TEXT_PICKER || type == ARKUI_NODE_DATE_PICKER ||
            type == ARKUI_NODE_TIME_PICKER || type == ARKUI_NODE_REFRESH;
    }
    void select(ArkUI_GestureInterruptInfo* info) {
        if (!current() || !session.touching || session.terminal ||
            session.source != SheetMotionSource::None) return;
        auto* event = OH_ArkUI_GestureInterruptInfo_GetGestureEvent(info);
        auto* input = event ? OH_ArkUI_GestureEvent_GetRawInputEvent(event) : nullptr;
        if (!isTouch(input) || OH_ArkUI_PointerEvent_GetPointerCount(input) != 1) return;
        ArkUI_TouchRecognizerHandleArray touches = nullptr;
        int32_t count = 0;
        check(OH_ArkUI_GestureInterruptInfo_GetTouchRecognizers(info, &touches, &count), "read sheet touch-test path");
        if (!touches || count <= 0) return; // No hit-test evidence, no admission.
        auto owner = root.lock();
        if (wheelOwnsMountedTouch(*owner, info)) {
            session.select(SheetMotionSource::Exclusive);
            return;
        }
        // Use native touch-test identities, which already incorporate native
        // transforms, root-local coordinates, and the hostParent mount. Do not
        // compare panel/window rectangles or guess a panel from an ancestor.
        bool panelHit = touchesHandle(touches, count, panel);
        std::shared_ptr<Node> deepest;
        for (auto* candidate : backend->nodes) {
            if (candidate->disposing || !candidate->handle || !interactionWithin(*candidate, *owner)) continue;
            if ((candidate->input && touchesHandle(touches, count, candidate->input->handle)) ||
                (candidate->refresh && touchesHandle(touches, count, candidate->refresh->handle))) {
                session.select(SheetMotionSource::Exclusive);
                return; // Refresh has first refusal for its entire touch path.
            }
            auto scroll = candidate->scroll;
            if (!scroll || scroll->retired || !scroll->enabled || scroll->geometry.horizontal ||
                scroll->pending || !inputEnabled(*candidate) || !touchesHandle(touches, count, scroll->handle)) continue;
            auto retained = candidate->weak_from_this().lock();
            if (retained && (!deepest || interactionWithin(*retained, *deepest))) deepest = std::move(retained);
        }
        // Native-route controls do not necessarily have logical backend Nodes.
        // Preserve their real built-ins too, including picker boundary rows.
        for (int32_t i = 0; i < count; ++i) {
            auto handle = OH_ArkUI_TouchRecognizer_GetNodeHandle(touches[i]);
            if (!handle || !sheetNativeWithin(*backend, handle, panel)) continue;
            panelHit = true;
            for (auto currentHandle = handle; currentHandle && currentHandle != panel;
                 currentHandle = backend->api->getParent(currentHandle)) {
                const auto type = OH_ArkUI_NodeUtils_GetNodeType(currentHandle);
                bool foreignScroll = type == ARKUI_NODE_SCROLL &&
                    std::none_of(backend->nodes.begin(), backend->nodes.end(), [&](auto* node) {
                        return node->scroll && node->scroll->handle == currentHandle;
                    });
                if (exclusiveNativeType(type) || foreignScroll) {
                    session.select(SheetMotionSource::Exclusive);
                    return;
                }
            }
        }
        if (!panelHit) return;
        if (!deepest) {
            session.select(SheetMotionSource::PanelPan); // includes handle + empty panel
            return;
        }
        for (auto candidate = deepest; candidate; candidate = interactionParent(*candidate)) {
            if (candidate->refresh) {
                chain.clear();
                session.select(SheetMotionSource::Exclusive);
                return;
            }
            if (auto scroll = candidate->scroll; scroll && scroll->enabled && !scroll->retired &&
                !scroll->geometry.horizontal && !scroll->pending) {
                chain.push_back({candidate, scroll, candidate->sheetMountEpoch, scroll->handle});
            }
            if (candidate == owner) break;
        }
        session.select(SheetMotionSource::ScrollBudget);
    }
    bool offer(float input, float& remainder) {
        const auto ticket = session.id;
        if (!session.owns(ticket) || !current() || !std::isfinite(input)) return false;
        auto callback = binding->offer;
        remainder = callback ? callback(ticket, input) : input;
        // This fence precedes native offset reads AND event return writes.
        if (!session.owns(ticket) || !current()) {
            if (session.id == ticket) finish(0, SheetInteractionEndReason::LifecycleCanceled);
            return false;
        }
        if (!sheetRemainderValid(input, remainder)) {
            finish(0, SheetInteractionEndReason::LifecycleCanceled);
            return false;
        }
        return true;
    }

    bool frame(const std::shared_ptr<NativeScroll>& scroll, ArkUI_NodeEvent* event) {
        if (!owns(*scroll)) return false;
        if (!chainCurrent()) { finish(0, SheetInteractionEndReason::LifecycleCanceled); return true; }
        const auto ticket = session.id;
        auto cancelPlan = [&] {
            // A callback can admit a new touch on this same binding. Cleanup
            // belongs to the old ticket, never to the independent new session.
            if (session.id == ticket) finish(0, SheetInteractionEndReason::LifecycleCanceled);
        };
        auto* component = OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);
        if (!component || component->data[1].i32 != ARKUI_SCROLL_STATE_SCROLL) return true;
        const float input = component->data[0].f32; // SDK26: one VP budget, then int32 state
        if (!std::isfinite(input)) { cancelPlan(); return true; }
        if (chain.front().scroll != scroll) {
            // Selected ancestors never independently reuse the touch budget.
            // Only the deepest source computes/commits the shared chain.
            if (session.owns(ticket) && current()) {
                ArkUI_NumberValue value {};
                check(OH_ArkUI_NodeEvent_SetReturnNumberValue(event, &value, 1), "suppress duplicate sheet ancestor budget");
            }
            return true;
        }
        float budget = input;
        if (budget > 0 && !offer(budget, budget)) return true; // restore sheet FIRST
        if (!session.owns(ticket) || !chainCurrent()) { cancelPlan(); return true; }
        struct Allocation {
            ScrollEntry entry;
            Point offset;
            float amount = 0;
            uint64_t geometry = 0, sequence = 0;
        };
        std::vector<Allocation> plan;
        const float contentBudget = budget;
        float trackedTravel = 0;
        for (const auto& entry : chain) {
            entry.scroll->sample();
            const float maxOffset = std::max(0.0f, entry.scroll->geometry.contentHeight -
                                                     entry.scroll->geometry.viewportHeight);
            const auto offset = entry.scroll->offset;
            // One authoritative native-source displacement is offered to
            // EACH selected coordinate, as simultaneous native pans do. Do
            // not subtract one scroll's travel from the next scroll's input.
            const float amount = sheetScrollConsumption(contentBudget, offset.y, maxOffset);
            plan.push_back({entry, offset, amount, entry.scroll->geometryRevision, entry.scroll->sequence.generation});
            trackedTravel = std::max(trackedTravel, std::abs(amount));
        }
        // Pin each coordinate at its own edge. The maximum tracked distance
        // consumes the single finger-travel budget, not the sum of nested
        // content offsets. For monotone down steps this derives exactly
        // max(0, cumulativeDown - max(initial distances)), without comparing
        // unrelated callbacks/events or retaining a stale initial threshold
        // across reversals. Up first restores the sheet, then uses the same
        // remaining content travel for each coordinate independently.
        budget = std::copysign(std::max(0.0f, std::abs(contentBudget) - trackedTravel), contentBudget);
        if (input < 0 && budget != 0 && !offer(budget, budget)) return true;
        if (!session.owns(ticket) || !chainCurrent()) { cancelPlan(); return true; }
        for (const auto& item : plan) {
            if (item.entry.scroll->geometryRevision != item.geometry ||
                !item.entry.scroll->sequence.current(item.sequence)) {
                cancelPlan();
                return true;
            }
        }
        auto planCurrent = [&] {
            if (!session.owns(ticket) || !chainCurrent()) return false;
            return std::all_of(plan.begin(), plan.end(), [](const auto& item) {
                return item.entry.scroll->geometryRevision == item.geometry &&
                    item.entry.scroll->sequence.current(item.sequence);
            });
        };
        struct Revision {
            std::weak_ptr<NativeScroll> scroll;
            uint64_t geometry, generation;
        };
        std::vector<Revision> revisions;
        for (const auto& item : plan)
            revisions.push_back({item.entry.scroll, item.geometry, item.sequence});
        for (size_t i = 1; i < plan.size(); ++i) {
            const auto& item = plan[i];
            if (!planCurrent()) { cancelPlan(); return true; }
            if (item.amount != 0) item.entry.scroll->writeOffset(Point(item.offset.x, item.offset.y + item.amount), false);
            if (!planCurrent()) { cancelPlan(); return true; }
            // Controller writes suppress synchronous native feedback. Publish
            // through the existing runtime journal, not a second JS protocol.
            if (item.amount != 0) {
                item.entry.scroll->sample(true);
                publishingScroll = item.entry.scroll;
                publishingCurrent = [weak = weak_from_this(), ticket, revisions] {
                    auto binding = weak.lock();
                    // Pure owned checks precede any borrowed-node validation.
                    if (!binding || !binding->session.owns(ticket)) return false;
                    for (const auto& revision : revisions) {
                        auto control = revision.scroll.lock();
                        if (!control || control->retired || control->geometryRevision != revision.geometry ||
                            !control->sequence.current(revision.generation)) return false;
                    }
                    return binding->chainCurrent();
                };
                item.entry.scroll->enqueue(NativeScroll::NoticeType::Scroll);
                publishingScroll.reset();
                publishingCurrent = {};
                if (!planCurrent()) { cancelPlan(); return true; }
            }
        }
        ArkUI_NumberValue value {};
        value.f32 = plan.front().amount;
        // A runtime onScroll callback above can unbind/close/detach us.
        if (planCurrent())
            check(OH_ArkUI_NodeEvent_SetReturnNumberValue(event, &value, 1), "return sheet deepest scroll budget");
        return true;
    }

    static void touch(ArkUI_NodeEvent* event) noexcept {
        auto* raw = static_cast<SheetInteraction*>(OH_ArkUI_NodeEvent_GetUserData(event));
        auto self = raw ? raw->shared_from_this() : nullptr;
        if (!self) return;
        try {
            if (!self->current() || OH_ArkUI_NodeEvent_GetEventType(event) != NODE_TOUCH_EVENT) return;
            auto* input = OH_ArkUI_NodeEvent_GetInputEvent(event);
            if (!isTouch(input)) return;
            const auto action = OH_ArkUI_UIInputEvent_GetAction(input);
            if (action == UI_TOUCH_EVENT_ACTION_DOWN) {
                // A second pointer interrupts this single-finger gesture;
                // its centroid is not the old finger's release velocity.
                if (OH_ArkUI_PointerEvent_GetPointerCount(input) != 1) {
                    self->finish(0, SheetInteractionEndReason::GestureCanceled);
                    return;
                }
                self->finish(0, SheetInteractionEndReason::LifecycleCanceled);
                if (!self->current()) return;
                if (OH_ArkUI_PointerEvent_GetPointerCount(input) == 1) {
                    self->session.down();
                    self->touchMotion.reset({0, OH_ArkUI_PointerEvent_GetWindowY(input) /
                        self->backend->configuration.displayScale},
                        static_cast<double>(OH_ArkUI_UIInputEvent_GetEventTime(input)) / 1e9);
                }
            } else if (action == UI_TOUCH_EVENT_ACTION_MOVE) {
                if (OH_ArkUI_PointerEvent_GetPointerCount(input) != 1) {
                    self->finish(0, SheetInteractionEndReason::GestureCanceled);
                    return;
                }
                self->touchMotion.sample({0, OH_ArkUI_PointerEvent_GetWindowY(input) /
                    self->backend->configuration.displayScale},
                    static_cast<double>(OH_ArkUI_UIInputEvent_GetEventTime(input)) / 1e9);
                if (std::isfinite(self->touchMotion.velocity.y))
                    self->session.closedwardVelocity = self->touchMotion.velocity.y;
            } else if (action == UI_TOUCH_EVENT_ACTION_UP || action == UI_TOUCH_EVENT_ACTION_CANCEL ||
                       OH_ArkUI_PointerEvent_GetPointerCount(input) != 1) {
                // Raw UP order vs WILL_STOP differs among SDK recognizers.
                // Pan supplies measured release velocity; scroll may supply it
                // first. Consume whichever terminal arrives first only once.
                // CANCEL has no documented pan-velocity payload. Use ONLY the
                // last finite velocity from this admitted touch/pan session.
                if (action == UI_TOUCH_EVENT_ACTION_UP) {
                    self->finish(self->session.closedwardVelocity, SheetInteractionEndReason::Ended);
                } else if (action == UI_TOUCH_EVENT_ACTION_CANCEL) {
                    self->finish(self->session.closedwardVelocity, SheetInteractionEndReason::GestureCanceled);
                } else {
                    self->finish(0, SheetInteractionEndReason::GestureCanceled);
                }
            }
        } catch (const std::exception& error) { self->backend->report(error.what()); }
    }
    static ArkUI_GestureInterruptResult interrupt(ArkUI_GestureInterruptInfo* info) noexcept {
        auto* raw = static_cast<SheetInteraction*>(OH_ArkUI_GestureInterrupter_GetUserData(info));
        auto self = raw ? raw->shared_from_this() : nullptr;
        if (!self) return GESTURE_INTERRUPT_RESULT_REJECT;
        try {
            // Never reject/disable a child's or a built-in wheel recognizer.
            if (OH_ArkUI_GestureInterruptInfo_GetRecognizer(info) != self->pan)
                return GESTURE_INTERRUPT_RESULT_CONTINUE;
            self->select(info);
            return self->current() && self->session.touching &&
                self->session.source == SheetMotionSource::PanelPan ?
                GESTURE_INTERRUPT_RESULT_CONTINUE : GESTURE_INTERRUPT_RESULT_REJECT;
        } catch (const std::exception& error) {
            self->backend->report(error.what());
            return GESTURE_INTERRUPT_RESULT_REJECT;
        }
    }
    static void gesture(ArkUI_GestureEvent* event, void* data) noexcept {
        auto* raw = static_cast<SheetInteraction*>(data);
        auto self = raw ? raw->shared_from_this() : nullptr;
        if (!self) return;
        try {
            if (!self->current() || self->session.source != SheetMotionSource::PanelPan) return;
            const auto action = OH_ArkUI_GestureEvent_GetActionType(event);
            if (action == GESTURE_EVENT_ACTION_CANCEL) {
                self->finish(self->session.closedwardVelocity, SheetInteractionEndReason::GestureCanceled);
                return;
            }
            auto* input = OH_ArkUI_GestureEvent_GetRawInputEvent(event);
            if (!isTouch(input)) return;
            const float scale = self->backend->configuration.displayScale;
            const float offset = OH_ArkUI_PanGesture_GetOffsetY(event) / scale;
            const float velocity = OH_ArkUI_PanGesture_GetVelocityY(event) / scale;
            if (!std::isfinite(offset) || !std::isfinite(velocity)) { self->finish(0, SheetInteractionEndReason::LifecycleCanceled); return; }
            if (action == GESTURE_EVENT_ACTION_ACCEPT && !self->start()) return;
            if (!self->current() || !self->session.accepted) return;
            const float delta = -(offset - self->session.lastPan);
            self->session.lastPan = offset;
            self->session.closedwardVelocity = velocity;
            float remainder = delta;
            if (delta != 0 && !self->offer(delta, remainder)) return;
            if (action == GESTURE_EVENT_ACTION_END && self->current() && self->session.accepted)
                self->finish(velocity, SheetInteractionEndReason::Ended);
        } catch (const std::exception& error) { self->backend->report(error.what()); }
    }
};

static std::vector<std::shared_ptr<SheetInteraction>> sheetBindings(Backend& backend) {
    std::vector<std::shared_ptr<SheetInteraction>> result;
    for (auto* owner : backend.nodes) if (owner->sheetInteraction) result.push_back(owner->sheetInteraction);
    return result;
}

static std::function<bool()> takeSheetScrollPublication(NativeScroll& scroll) {
    for (const auto& binding : sheetBindings(*scroll.backend)) {
        if (binding->publishingScroll.lock().get() != &scroll) continue;
        binding->publishingScroll.reset();
        // Consume before drain invokes runtime: independent reentrant commands
        // on this same control must not inherit the outer publication guard.
        return std::exchange(binding->publishingCurrent, {});
    }
    return {};
}

static bool hasSheetScrollSession(NativeScroll& scroll) {
    for (const auto& binding : sheetBindings(*scroll.backend)) {
        if (binding->owns(scroll)) return true;
    }
    return false;
}

static void cancelSheetInteractions(Node& node, bool retire) {
    // Include a Node being destroyed whose weak_from_this() has expired.
    auto bindings = sheetBindings(*node.backend);
    if (node.sheetInteraction && std::find(bindings.begin(), bindings.end(), node.sheetInteraction) == bindings.end())
        bindings.push_back(node.sheetInteraction);
    for (const auto& binding : bindings) {
        auto root = binding->root.lock();
        const bool ownsRoot = root.get() == &node || node.sheetInteraction == binding;
        bool removesRoot = ownsRoot;
        bool affected = ownsRoot || std::any_of(binding->chain.begin(), binding->chain.end(),
            [&](const auto& entry) { return entry.node.lock().get() == &node; });
        if (root && !affected && !node.disposing) {
            removesRoot = interactionWithin(*root, node);
            affected = removesRoot || interactionWithin(node, *root);
        }
        if (!affected) continue;
        if (retire && removesRoot) {
            // Invalidate root ownership before callbacks can install a new one.
            if (root && root->sheetInteraction == binding) root->sheetInteraction.reset();
            else if (node.sheetInteraction == binding) node.sheetInteraction.reset();
            binding->retire();
        } else {
            binding->finish(0, SheetInteractionEndReason::LifecycleCanceled, true);
        }
    }
}

static void sheetScrollProperties(NativeScroll& scroll) {
    for (const auto& binding : sheetBindings(*scroll.backend)) {
        if (!binding->owns(scroll) || !binding->current()) continue;
        auto owner = scroll.node.lock();
        if (!owner || owner->disposing || scroll.retired) return;
        std::array<ArkUI_NumberValue, 2> values {};
        // Only an ACCEPTED touch's exact deepest+ancestor chain is isolated.
        // The deepest frame manually allocates to each ancestor once. Restore
        // ordinary SELF_FIRST immediately on terminal/cancel/unbind.
        values[0].i32 = values[1].i32 = ARKUI_SCROLL_NESTED_MODE_SELF_ONLY;
        ArkUI_AttributeItem item {values.data(), 2, nullptr, nullptr};
        owner->set(scroll.handle, NODE_SCROLL_NESTED_SCROLL, item);
        return;
    }
}

static void sheetScrollAdmission(Node& node, ArkUI_GestureInterruptInfo* info) {
    for (const auto& binding : sheetBindings(*node.backend)) {
        auto root = binding->root.lock();
        if (binding->current() && root && interactionWithin(node, *root)) binding->select(info);
    }
}

static bool sheetScrollStart(const std::shared_ptr<NativeScroll>& scroll) {
    for (const auto& binding : sheetBindings(*scroll->backend)) {
        if (binding->session.source != SheetMotionSource::ScrollBudget ||
            binding->chain.empty() || binding->chain.front().scroll != scroll) continue;
        if (!binding->chainCurrent()) return true;
        binding->scrollGeneration = scroll->sequence.generation;
        if (binding->session.accepted) return binding->current();
        binding->start(); // only WILL_START_DRAGGING + admitted raw TOUCH
        return binding->current();
    }
    return true;
}

static bool sheetScrollFrame(const std::shared_ptr<NativeScroll>& scroll, ArkUI_NodeEvent* event) {
    for (const auto& binding : sheetBindings(*scroll->backend)) {
        if (binding->frame(scroll, event)) return true;
    }
    return false;
}

static bool sheetScrollEnd(const std::shared_ptr<NativeScroll>& scroll, float velocity, bool canceled) {
    for (const auto& binding : sheetBindings(*scroll->backend)) {
        if (!binding->session.accepted || binding->chain.empty() ||
            (canceled ? !binding->owns(*scroll) : binding->chain.front().scroll != scroll)) continue;
        const float captured = binding->session.closedwardVelocity;
        // WILL_STOP provides a scalar speed, not a proven finger direction.
        // As with ScrollMotion::release, only a finite, nonzero current
        // motion sample supplies that sign. In particular +/-0 cannot invent
        // a closedward flick from an otherwise directionless native speed.
        const float closedward = std::isfinite(velocity) && std::abs(velocity) > 0 &&
            std::isfinite(captured) && std::abs(captured) > 0 ?
            std::copysign(std::abs(velocity), captured) : 0;
        binding->finish(canceled ? 0 : closedward, canceled ? SheetInteractionEndReason::LifecycleCanceled :
                        SheetInteractionEndReason::Ended, canceled);
        return binding->current(); // fence host end before original native work
    }
    return true;
}
