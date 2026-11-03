// Included after NativeGestures.inc. All state and native calls are UI-only.
// Valdi owns frames/content extents; the SDK Scroll owns the viewport offset.

NativeScroll::NativeScroll(const std::shared_ptr<Node>& owner) : node(owner), backend(owner->backend) {}

void NativeScroll::post(DispatchFunction work) {
    auto backend = this->backend;
    backend->configuration.dispatchUI([backend, work = std::move(work)] {
        try { work(); }
        catch (const std::exception& error) { backend->report(error.what()); }
    }, false);
}

void NativeScroll::initialize() {
    auto owner = node.lock();
    if (!owner) fail("Scroll requires an owner");
    auto* api = backend->api;
    handle = api->createNode(ARKUI_NODE_SCROLL);
    content = api->createNode(ARKUI_NODE_CUSTOM);
    if (!handle || !content) fail("cannot allocate native Scroll/content");
    installGestureSource(*backend, *owner, handle, GestureSourceKind::Scroll, mountedGestureSourcePolicies());
    // Scroll offsets/events use the SDK's default VP units (Valdi points).
    // Custom content measurement/layout alone uses physical PX.
    check(api->setLengthMetricUnit(content, ARKUI_LENGTH_METRIC_UNIT_PX), "set scroll content pixel units");
    owner->integer(handle, NODE_DIRECTION, ARKUI_DIRECTION_LTR);
    owner->integer(content, NODE_DIRECTION, ARKUI_DIRECTION_LTR);
    owner->integer(handle, NODE_CLIP, 1);
    owner->integer(handle, NODE_ALIGNMENT, ARKUI_ALIGNMENT_TOP_START);
    check(api->addNodeEventReceiver(handle, event), "add scroll event receiver");
    receiver = true;
    for (auto type : {NODE_SCROLL_EVENT_ON_DID_SCROLL, NODE_SCROLL_EVENT_ON_SCROLL_START,
                      NODE_SCROLL_EVENT_ON_SCROLL_STOP, NODE_SCROLL_EVENT_ON_SCROLL_FRAME_BEGIN,
                      NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING,
                      NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING,
                      NODE_SCROLL_EVENT_ON_DID_STOP_DRAGGING}) {
        check(api->registerNodeEvent(handle, type, 0, this), "register native scroll event");
        registered.push_back(type);
    }
    check(api->addNodeCustomEventReceiver(content, customEvent), "add scroll content receiver");
    customReceiver = true;
    check(api->registerNodeCustomEvent(content, ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE, 0, this),
          "register scroll content measure");
    measureRegistered = true;
    check(api->registerNodeCustomEvent(content, ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT, 0, this),
          "register scroll content layout");
    layoutRegistered = true;
    check(api->addChild(handle, content), "attach scroll content");
    contentAttached = true;
    check(api->addChild(owner->handle, handle), "attach native Scroll");
    attached = true;
    properties();
}

void NativeScroll::retire(ArkUI_NodeHandle parent) {
    if (retired) return;
    retired = true;
    // Disposal owns the remaining unregister work; cancellation was consumed
    // by Node before it marked the native scroll retired.
    sequence.replace();
    sequence.notices.clear();
    sheetPublications.clear();
    sequence.dragTarget.reset();
    auto* api = backend->api;
    if (handle) if (auto owner = node.lock()) retireGestureSources(*owner, handle);
    for (auto type : registered) api->unregisterNodeEvent(handle, type);
    registered.clear();
    if (receiver) check(api->removeNodeEventReceiver(handle, event), "remove scroll receiver");
    receiver = false;
    if (measureRegistered) api->unregisterNodeCustomEvent(content, ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE);
    if (layoutRegistered) api->unregisterNodeCustomEvent(content, ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT);
    if (customReceiver) check(api->removeNodeCustomEventReceiver(content, customEvent), "remove scroll content receiver");
    measureRegistered = layoutRegistered = customReceiver = false;
    if (attached && parent) check(api->removeChild(parent, handle), "detach native Scroll");
    attached = false;
    if (contentAttached) check(api->removeChild(handle, content), "detach scroll content");
    contentAttached = false;
    // A runtime callback can synchronously shut down/release the tree while
    // ArkUI is dispatching this very event. Retain userdata and C handles until
    // that native callback stack has unwound, as with native gestures/animators.
    auto self = shared_from_this();
    post([self] {
        if (self->content) self->backend->api->disposeNode(self->content);
        if (self->handle) {
            self->backend->api->disposeNode(self->handle);
            gestureNativeSourceDisposed(*self->backend, self->handle);
        }
        self->content = self->handle = nullptr;
    });
}

static bool scrollOwnedInputEnabled(const Node& node) {
    // Controller cleanup may run after the host revoked its borrowed panel.
    // Consult only owned logical nodes; do not walk native hostParent handles.
    if (!node.handle || node.disposing || !node.touchEnabled || node.backend->suspended ||
        node.backend->stopped || node.backend->shuttingDown) return false;
    const Node* root = &node;
    auto parent = node.parent.lock();
    while (parent) {
        if (parent->backend != node.backend || parent->disposing || !parent->touchEnabled) return false;
        root = parent.get();
        parent = parent->parent.lock();
    }
    return root->content || root->hostParent;
}

void NativeScroll::properties() {
    auto owner = node.lock();
    if (!owner || retired || owner->disposing) return;
    validateNativeScrollAxis(*owner, geometry.horizontal);
    owner->integer(handle, NODE_SCROLL_SCROLL_DIRECTION, geometry.horizontal ?
                   ARKUI_SCROLL_DIRECTION_HORIZONTAL : ARKUI_SCROLL_DIRECTION_VERTICAL);
    owner->integer(handle, NODE_SCROLL_ENABLE_SCROLL_INTERACTION,
                   enabled && scrollOwnedInputEnabled(*owner));
    owner->integer(handle, NODE_SCROLL_ENABLE_PAGING, paging);
    owner->integer(handle, NODE_SCROLL_BAR_DISPLAY_MODE,
                   (geometry.horizontal ? horizontalIndicator : verticalIndicator) ?
                   ARKUI_SCROLL_BAR_DISPLAY_MODE_AUTO : ARKUI_SCROLL_BAR_DISPLAY_MODE_OFF);
    std::array<ArkUI_NumberValue, 3> edge {};
    edge[0].i32 = bounces && (bounceStart || bounceEnd) ? ARKUI_EDGE_EFFECT_SPRING : ARKUI_EDGE_EFFECT_NONE;
    edge[1].i32 = geometry.horizontal ? smallHorizontal : smallVertical;
    edge[2].i32 = (bounceStart ? ARKUI_EFFECT_EDGE_START : 0) | (bounceEnd ? ARKUI_EFFECT_EDGE_END : 0);
    ArkUI_AttributeItem item {edge.data(), static_cast<int32_t>(edge.size()), nullptr, nullptr};
    owner->set(handle, NODE_SCROLL_EDGE_EFFECT, item);
    // Explicit NeedParent modes disable Refresh parent discovery in ArkUI.
    // A direct Refresh child uses the SDK default; Refresh negotiates linkage
    // across the intermediate custom wrapper. Other scrolls retain SELF_FIRST.
    std::array<ArkUI_NumberValue, 2> nested {};
    nested[0].i32 = nested[1].i32 = nativeScrollNestedMode(*owner);
    item = {nested.data(), static_cast<int32_t>(nested.size()), nullptr, nullptr};
    owner->set(handle, NODE_SCROLL_NESTED_SCROLL, item);
    sheetScrollProperties(*this);
}

void NativeScroll::specs(const Point& point, const Size& size, bool animated) {
    auto keepAlive = shared_from_this();
    auto owner = node.lock();
    if (!owner || retired) return;
    const float scale = backend->configuration.displayScale;
    for (auto value : {point.x, point.y, size.width, size.height}) pixels(value, scale);
    if (size.width < 0 || size.height < 0) fail("negative scroll content size");
    const bool geometryChanged = geometry.contentWidth != size.width || geometry.contentHeight != size.height;
    const bool command = sequence.specs(point, geometryChanged, animated, {offset, rawOffset, velocity});
    if (command) {
        const auto ticket = sequence.generation;
        if (!sheetScrollEnd(keepAlive, 0, true) || retired || owner->disposing || !sequence.current(ticket)) return;
    }
    geometry.contentWidth = size.width;
    geometry.contentHeight = size.height;
    ++geometryRevision;
    if (command) {
        requestedOffset = point;
        pending = true;
        pendingAnimated = animated;
        silentPending = false;
        // setScrollSpecsOnView() sets isUpdatingScrollSpecs until this native
        // transaction returns. Deliver superseded lifecycle callbacks afterward,
        // when ViewNode will accept them.
        if (!sequence.notices.empty()) {
            auto self = shared_from_this();
            post([self] { self->drain(); });
        }
    }
    // The worker can synchronously dispatch this transaction after dropping
    // tracked locks. Never wait on its tree lock from native measure/layout.
    if (auto tree = owner->viewNodeTree.lock()) {
        tree->tryWithLock([&] {
            if (auto view = owner->viewNode.lock(); view && view->getViewNodeTree() == tree.get()) {
                validateNativeScrollAxis(*owner, view->isHorizontal());
                geometry.horizontal = view->isHorizontal();
            }
        }, std::chrono::steady_clock::now());
    }
    properties();
    owner->invalidate();
}

void NativeScroll::writeOffset(const Point& point, bool animated) {
    auto owner = node.lock();
    if (!owner || retired || owner->disposing) return;
    pixels(point.x, backend->configuration.displayScale);
    pixels(point.y, backend->configuration.displayScale);
    std::array<ArkUI_NumberValue, 5> values {};
    values[0].f32 = point.x;
    values[1].f32 = point.y;
    values[2].i32 = animated ? 300 : 0;
    values[3].i32 = ARKUI_CURVE_EASE_IN_OUT;
    values[4].i32 = 0;
    ArkUI_AttributeItem item {values.data(), static_cast<int32_t>(values.size()), nullptr, nullptr};
    // Immediate runtime specs already notify JS and clear animation state.
    // Suppress synchronous native feedback during all controller writes.
    bool previous = std::exchange(suppress, true);
    try {
        owner->set(handle, NODE_SCROLL_OFFSET, item);
    } catch (...) {
        suppress = previous;
        throw;
    }
    suppress = previous;
}

void NativeScroll::didLayout() {
    laidOutRevision = geometryRevision;
    queueCommand();
    queueDragTarget();
}

void NativeScroll::queueDragTarget() {
    if (retired || dragTargetQueued || !sequence.hasDragTarget(sequence.generation)) return;
    dragTargetQueued = true;
    auto self = shared_from_this();
    post([self, token = sequence.generation] {
        self->dragTargetQueued = false;
        auto owner = self->node.lock();
        if (!owner || self->retired || owner->disposing) return;
        auto requested = self->sequence.takeDragTarget(token, self->geometryRevision, self->laidOutRevision);
        if (!requested) {
            // A stale task may have occupied the queue slot when a newer
            // release arrived. Schedule that generation without consuming it.
            if (!self->sequence.current(token)) self->queueDragTarget();
            return; // an unmatched geometry revision resumes from didLayout()
        }
        pixels(requested->x, self->backend->configuration.displayScale);
        pixels(requested->y, self->backend->configuration.displayScale);
        auto clamped = self->geometry.clamp({requested->x, requested->y});
        Point target(clamped.x, clamped.y);
        self->sequence.active = true;
        self->writeOffset(target, true);
        // The SDK doesn't start an animation for an identical target.
        self->sample();
        if (std::abs(self->rawOffset.x - target.x) < .01f &&
            std::abs(self->rawOffset.y - target.y) < .01f) {
            self->sequence.finish();
            self->enqueue({NoticeType::Scroll, NoticeType::End});
        }
    });
}

void NativeScroll::queueCommand() {
    if (!pending || retired || commandQueued) return;
    commandQueued = true;
    auto self = shared_from_this();
    post([self] {
        self->commandQueued = false;
        auto owner = self->node.lock();
        if (!owner || self->retired || !self->pending || owner->disposing) return;
        // A newer spec/frame can arrive after this layout and before this UI
        // task. Applying against stale native extents would clamp the target.
        if (self->laidOutRevision != self->geometryRevision) return;
        auto tree = owner->viewNodeTree.lock();
        if (!tree) return;
        bool horizontal = self->geometry.horizontal;
        bool locked = tree->tryWithLock([&] {
            if (auto view = owner->viewNode.lock(); view && view->getViewNodeTree() == tree.get()) {
                horizontal = view->isHorizontal();
            }
        }, std::chrono::steady_clock::now());
        if (!locked) {
            self->queueCommand();
            return;
        }
        validateNativeScrollAxis(*owner, horizontal);
        if (self->geometry.horizontal != horizontal) {
            self->geometry.horizontal = horizontal;
            ++self->geometryRevision;
            self->properties();
            owner->invalidate();
            return; // wait for a new layout with the correct content axis
        }
        const auto target = self->requestedOffset;
        const bool requestedAnimation = self->pendingAnimated;
        const bool animated = self->pendingAnimated && !self->backend->suspended;
        self->pending = false;
        self->sample();
        const auto clamped = self->geometry.clamp({target.x, target.y});
        const bool moving = std::abs(self->rawOffset.x - clamped.x) > .01f ||
                            std::abs(self->rawOffset.y - clamped.y) > .01f;
        self->motion.reset({self->rawOffset.x, self->rawOffset.y},
                           std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count());
        self->silentPending = !requestedAnimation;
        self->writeOffset(Point(clamped.x, clamped.y), animated && moving);
        if (requestedAnimation && (!moving || !animated)) {
            self->sequence.finish();
            self->sample();
            self->enqueue({NoticeType::Scroll, NoticeType::End}); // release runtime flag even for a no-op
        } else if (!requestedAnimation && !moving &&
                   (std::abs(target.x - clamped.x) > .01f || std::abs(target.y - clamped.y) > .01f)) {
            // The runtime accepts arbitrary ref offsets; native bounds may
            // clamp them. Reconcile even when the native controller needn't move.
            self->silentPending = false;
            self->enqueue({NoticeType::Scroll, NoticeType::End});
        }
        // Nonanimated state is already published by ViewNode. A layout-only
        // native notification must not duplicate its onScrollEnd.
    });
}

void NativeScroll::sample(bool movement) {
    const auto* item = backend->api->getAttribute(handle, NODE_SCROLL_OFFSET);
    if (!item || item->size < 2 || !item->value) fail("native Scroll offset unavailable");
    Point next(item->value[0].f32, item->value[1].f32);
    if (!std::isfinite(next.x) || !std::isfinite(next.y)) fail("nonfinite native scroll offset");
    if (movement) {
        motion.sample({next.x, next.y},
                      std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count());
        velocity = Point(motion.velocity.x, motion.velocity.y);
    }
    rawOffset = next;
    auto clamped = geometry.clamp({next.x, next.y});
    offset = Point(clamped.x, clamped.y);
}

void NativeScroll::enqueue(NoticeType type) {
    enqueue({type});
}

void NativeScroll::enqueue(std::initializer_list<NoticeType> types) {
    // Snapshot the entire batch before invoking JS. A replacement spec in
    // onScroll/onDragEnding must not retag an old terminal as a new sequence.
    auto publication = takeSheetScrollPublication(*this);
    sequence.enqueue(types, {offset, rawOffset, velocity});
    if (!sequence.notices.empty()) {
        auto* queued = &sequence.notices.back();
        // enqueue may coalesce an adjacent sample in place. The replacement
        // sample owns its own guard (or no guard for ordinary native/command
        // work), rather than inheriting the superseded publication's scope.
        sheetPublications.erase(std::remove_if(sheetPublications.begin(), sheetPublications.end(),
            [queued](const auto& item) { return item.first == queued; }), sheetPublications.end());
        if (publication && queued->type == NoticeType::Scroll)
            sheetPublications.emplace_back(queued, std::move(publication));
    }
    drain();
}

void NativeScroll::drain() {
    if (draining || retired) return;
    auto owner = node.lock();
    if (!owner) return;
    auto tree = owner->viewNodeTree.lock();
    auto view = owner->viewNode.lock();
    if (!tree || !view) { sequence.notices.clear(); sheetPublications.clear(); return; }
    draining = true;
    bool locked = tree->tryWithLock([&] {
        while (!sequence.notices.empty() && !retired && !owner->disposing &&
               owner->viewNode.lock() == view && view->getViewNodeTree() == tree.get()) {
            // nextNotice skips stale Scroll samples internally. Remove their
            // matching guards before deque storage can be reused.
            while (!sequence.notices.empty() && sequence.notices.front().type == NoticeType::Scroll &&
                   !sequence.current(sequence.notices.front().generation)) {
                auto* stale = &sequence.notices.front();
                sheetPublications.erase(std::remove_if(sheetPublications.begin(), sheetPublications.end(),
                    [stale](const auto& item) { return item.first == stale; }), sheetPublications.end());
                sequence.notices.pop_front();
            }
            if (sequence.notices.empty()) break;
            auto* queued = &sequence.notices.front();
            std::function<bool()> correctionCurrent;
            auto publication = std::find_if(sheetPublications.begin(), sheetPublications.end(),
                [queued](const auto& item) { return item.first == queued; });
            if (publication != sheetPublications.end()) {
                correctionCurrent = std::move(publication->second);
                sheetPublications.erase(publication);
            }
            auto next = sequence.nextNotice();
            if (!next) break;
            auto notice = *next;
            std::optional<Point> adjusted;
            switch (notice.type) {
                case NoticeType::Scroll:
                    adjusted = view->onScroll(notice.offset, notice.raw, notice.velocity);
                    break;
                case NoticeType::StartDrag:
                    view->onDragStart(notice.offset, notice.raw, notice.velocity);
                    break;
                case NoticeType::EndDrag:
                case NoticeType::CancelDrag:
                    // This method also emits onDragEnd with the pinned flags.
                    adjusted = view->onDragEnding(notice.offset, notice.raw, notice.velocity);
                    break;
                case NoticeType::End:
                    sequence.deliverEnd(notice, [&] {
                        view->onScrollEnd(notice.offset, notice.raw);
                    }, [&] {
                        // The public ViewNode API has no animation-state setter.
                        // Read the same resolved callback used by ScrollAttributes
                        // and emit the official payload/flags without mutating the
                        // newer runtime animation (including during JS reentry).
                        auto id = view->getAttributeIds().getIdForName(std::string_view("onScrollEnd"));
                        auto callback = view->getAttributesApplier().getResolvedAttributeValue(id).getFunctionRef();
                        if (callback == nullptr || callback->ownerIsTearingDown()) return;
                        auto resolve = [&](Point point) {
                            const auto rtlOffset = view->getRtlScrollOffsetX();
                            if (rtlOffset != 0) point.x = rtlOffset - point.x;
                            return point;
                        };
                        auto point = resolve(notice.offset);
                        auto raw = resolve(notice.raw);
                        auto event = TouchEvents::makeScrollEvent(point.x, point.y, raw.x, raw.y, 0, 0);
                        (*callback)(ValueFunctionFlagsBoundedMainThreadSync, {std::move(event)});
                    });
                    break;
            }
            // A sync JS callback can flush removal, new specs, or shutdown.
            if (!adjusted || retired || owner->disposing || !sequence.current(notice.generation) ||
                owner->viewNode.lock() != view || view->getViewNodeTree() != tree.get()) continue;
            // The runtime callback above can unbind/rebind a still-mounted
            // sheet without changing the ordinary scroll generation/tree.
            // Fence this exact manual notice INSIDE the correction path.
            // Independent reentrant commands/notices carry their own scope.
            if (correctionCurrent && !correctionCurrent()) continue;
            if (notice.type == NoticeType::EndDrag) {
                if (!sequence.acceptDragTarget(notice, *adjusted)) continue;
                queueDragTarget();
            } else if (notice.type == NoticeType::Scroll &&
                       (std::abs(adjusted->x - notice.offset.x) > .01f ||
                        std::abs(adjusted->y - notice.offset.y) > .01f)) {
                sequence.runtimeOffset = *adjusted;
                writeOffset(*adjusted, false); // circular/runtime correction; do not publish twice
            }
        }
    }, std::chrono::steady_clock::now());
    draining = false;
    if (!locked && !retryQueued) {
        retryQueued = true;
        auto self = shared_from_this();
        post([self] {
            self->retryQueued = false;
            self->drain();
        });
    }
}

void NativeScroll::cancel(bool notify) {
    auto keepAlive = shared_from_this();
    if (retired) return;
    if (hasSheetScrollSession(*this)) {
        auto owner = node.lock();
        if (!owner || owner->scroll != keepAlive || owner->disposing || !handle) return;
        const auto control = handle;
        const auto generation = sequence.generation;
        struct OwnedAncestor {
            std::shared_ptr<Node> node;
            uint64_t mountEpoch;
            ArkUI_NodeHandle handle, hostParent;
            ArkUI_NodeContentHandle content;
        };
        std::vector<OwnedAncestor> ancestry;
        // Capture only owned logical ancestry. Even preparing a second control's
        // cancellation can happen after the first control's end callback revoked
        // the native panel; traversing hostParent here would already be too late.
        for (auto ancestor = owner; ancestor; ancestor = ancestor->parent.lock()) {
            if (std::any_of(ancestry.begin(), ancestry.end(),
                [&](const auto& item) { return item.node == ancestor; })) return;
            ancestry.push_back({ancestor, ancestor->sheetMountEpoch, ancestor->handle,
                                ancestor->hostParent, ancestor->content});
        }
        sheetScrollEnd(keepAlive, 0, true);
        // Cancellation is owned-control cleanup, not new input admission. A
        // touch-disabled root must still consume its old sequence. After end
        // reentry, validate only the captured owned controls/ancestry/generation;
        // never read a revoked or detached borrowed panel to authorize cleanup.
        if (retired || !handle || handle != control || node.lock() != owner || owner->scroll != keepAlive ||
            !sequence.current(generation) || backend->stopped || backend->shuttingDown) return;
        for (const auto& item : ancestry) {
            if (item.node->backend != backend || item.node->disposing || item.node->handle != item.handle ||
                item.node->sheetMountEpoch != item.mountEpoch || item.node->hostParent != item.hostParent ||
                item.node->content != item.content) return;
        }
    }
    auto terminal = sequence.cancel({offset, rawOffset, velocity}, notify);
    pending = false;
    silentPending = false;
    if (handle && (terminal.active || terminal.dragging)) {
        // Controller jump to current position stops native momentum.
        writeOffset(offset, false);
    }
    drain();
}

void NativeScroll::touchDown() {
    auto keepAlive = shared_from_this();
    if (retired || !sequence.stopOnDown(stopOnTouch, pending && pendingAnimated)) return;
    sample(); // Freeze the actual native position, not the last notified offset.
    cancel(); // Existing journal consumes terminals before any runtime callback.
}

static std::shared_ptr<Node> scrollInputRoot(Node& node) {
    if (!inputEnabled(node)) return nullptr;
    auto root = node.shared_from_this();
    while (auto parent = root->parent.lock()) {
        if (parent->backend != node.backend) return nullptr;
        root = std::move(parent);
    }
    return root;
}

static bool scrollDragCurrent(const std::shared_ptr<NativeScroll>& scroll,
                              const std::shared_ptr<Node>& owner,
                              const std::shared_ptr<Node>& root, uint64_t token) {
    return root && !scroll->retired && !scroll->suppress && !scroll->pending && scroll->enabled &&
           owner->scroll == scroll && owner->backend == scroll->backend &&
           scroll->node.lock() == owner && scroll->sequence.current(token) &&
           scroll->sequence.dragging && scrollInputRoot(*owner) == root;
}

static void dismissScrollKeyboard(const std::shared_ptr<NativeScroll>& scroll,
                                  const std::shared_ptr<Node>& owner,
                                  const std::shared_ptr<Node>& root, uint64_t token) {
    if (!scrollDragCurrent(scroll, owner, root, token)) return;
    // Snapshot one editor from this mounted page, including siblings of the
    // scroll. Never consult a process-wide focus pointer or another root.
    std::shared_ptr<Node> editorNode;
    std::shared_ptr<NativeTextInput> editor;
    std::vector<std::shared_ptr<Node>> pending {root};
    while (!pending.empty()) {
        auto candidate = std::move(pending.back());
        pending.pop_back();
        if (candidate->backend != scroll->backend || candidate->disposing || !candidate->handle) continue;
        auto input = candidate->input;
        if (input && input->backend == scroll->backend && input->focused &&
            input->enabled && input->epoch.active && input->valid()) {
            const auto* status = scroll->backend->api->getAttribute(input->handle, NODE_FOCUS_STATUS);
            if (status && status->value && status->size > 0 && status->value[0].i32 == 1) {
                editorNode = candidate;
                editor = std::move(input);
                break;
            }
        }
        pending.insert(pending.end(), candidate->children.begin(), candidate->children.end());
    }
    if (!editor) return;
    const auto handle = editor->handle;
    const auto focusTicket = editor->focusGeneration;
    if (!scrollDragCurrent(scroll, owner, root, token) || editorNode->input != editor ||
        !editor->focused || editor->focusGeneration != focusTicket ||
        !editor->enabled || !editor->epoch.active || !editor->valid() ||
        scrollInputRoot(*editorNode) != root) return;

    // focus(false) first stops editing, which may destroy/reparent either tree
    // or focus a replacement. Fence its subsequent page-wide clear without
    // changing the input lifecycle or the protected editor implementation.
    auto previous = std::move(editorNode->scrollBlurCurrent);
    editorNode->scrollBlurCurrent = [=] {
        // Only this scroll's focus(false) advances the captured ticket once.
        // Later explicit focus operations and rebound inputs own their writes.
        if (editorNode->input != editor || editor->focusGeneration != focusTicket + 1) return true;
        if (!scrollDragCurrent(scroll, owner, root, token) || editorNode->input != editor ||
            editor->handle != handle || !editor->enabled || !editor->epoch.active ||
            !editor->valid() || scrollInputRoot(*editorNode) != root) return false;
        const auto* status = scroll->backend->api->getAttribute(handle, NODE_FOCUS_STATUS);
        return status && status->value && status->size > 0 && status->value[0].i32 == 1;
    };
    try {
        editor->focus(false);
    } catch (...) {
        editorNode->scrollBlurCurrent = std::move(previous);
        throw;
    }
    editorNode->scrollBlurCurrent = std::move(previous);
}

void NativeScroll::event(ArkUI_NodeEvent* native) noexcept {
    auto* raw = static_cast<NativeScroll*>(OH_ArkUI_NodeEvent_GetUserData(native));
    if (!raw) return;
    auto self = raw->shared_from_this();
    auto owner = self->node.lock();
    if (!owner || self->retired || self->suppress || owner->disposing || self->pending) return;
    try {
        if (!inputEnabled(*owner) && !self->sequence.active && !self->silentPending) return;
        auto token = self->sequence.generation;
        const auto type = OH_ArkUI_NodeEvent_GetEventType(native);
        if (type == NODE_SCROLL_EVENT_ON_SCROLL_FRAME_BEGIN) {
            sheetScrollFrame(self, native);
            return; // Generic frames NEVER admit a touch session.
        }
        self->sample(type == NODE_SCROLL_EVENT_ON_DID_SCROLL);
        if (type == NODE_SCROLL_EVENT_ON_WILL_START_DRAGGING) {
            if (!self->enabled || !inputEnabled(*owner) ||
                !self->sequence.beginDrag({self->offset, self->rawOffset, Point()})) return;
            self->silentPending = false;
            self->velocity = Point();
            self->motion.reset({self->rawOffset.x, self->rawOffset.y},
                               std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count());
            token = self->sequence.generation;
            const auto root = scrollInputRoot(*owner);
            if (self->dismissKeyboardOnDrag) dismissScrollKeyboard(self, owner, root, token);
            // Blur is a synchronous reentry boundary. Do not retag an older
            // drag or touch native/raw/runtime state after it was replaced.
            if (!scrollDragCurrent(self, owner, root, token)) return;
            if (self->cancelsTouches) {
                // Cancel raw observation only; removing/reinstalling child
                // recognizers here would corrupt the native arbitration arena.
                std::vector<std::shared_ptr<Node>> descendants = owner->children;
                for (size_t i = 0; i < descendants.size(); ++i) {
                    auto children = descendants[i]->children;
                    descendants.insert(descendants.end(), children.begin(), children.end());
                }
                std::vector<RawTerminal> terminals;
                for (const auto& child : descendants) terminals.push_back(consumeRawTerminal(*child, child->lastTouch));
                for (size_t i = 0; i < descendants.size(); ++i) {
                    if (!scrollDragCurrent(self, owner, root, token)) return;
                    deliverRawTerminal(*descendants[i], terminals[i]);
                }
            }
            if (scrollDragCurrent(self, owner, root, token)) {
                if (!sheetScrollStart(self) || !scrollDragCurrent(self, owner, root, token)) return;
                self->drain();
            }
        } else if (type == NODE_SCROLL_EVENT_ON_SCROLL_START) {
            self->sequence.active = true; // includes wheel, keyboard, and scrollbar input
        } else if (type == NODE_SCROLL_EVENT_ON_DID_SCROLL) {
            bool correctedImmediate = std::exchange(self->silentPending, false) &&
                (std::abs(self->offset.x - self->requestedOffset.x) > .01f ||
                 std::abs(self->offset.y - self->requestedOffset.y) > .01f);
            // ViewNode suppresses unchanged immediate specs itself. Always
            // reconcile the actual native offset, including bounds/rounding.
            if (correctedImmediate) self->enqueue({NoticeType::Scroll, NoticeType::End});
            else self->enqueue(NoticeType::Scroll);
        } else if (type == NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING ||
                   type == NODE_SCROLL_EVENT_ON_DID_STOP_DRAGGING) {
            const auto root = scrollInputRoot(*owner);
            float release = 0;
            if (auto* component = OH_ArkUI_NodeEvent_GetNodeComponentEvent(native);
                component && type == NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING) release = component->data[0].f32;
            if (!sheetScrollEnd(self, release, false) || self->retired || owner->disposing ||
                !self->sequence.current(token) || scrollInputRoot(*owner) != root) return;
            if (type == NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING) {
                if (auto* component = OH_ArkUI_NodeEvent_GetNodeComponentEvent(native)) {
                    self->motion.release(component->data[0].f32, self->geometry.horizontal);
                    self->velocity = Point(self->motion.velocity.x, self->motion.velocity.y);
                }
            }
            self->sequence.release({self->offset, self->rawOffset, self->velocity});
            self->drain();
        } else if (type == NODE_SCROLL_EVENT_ON_SCROLL_STOP) {
            if ((self->sequence.active || self->sequence.dragging) &&
                !self->sequence.hasDragTarget(self->sequence.generation) && !self->sequence.notices.empty()) {
                // stop() publishes a fresh ordinary native sample, potentially
                // coalescing the guarded manual sample at the deque back.
                auto* replaced = &self->sequence.notices.back();
                self->sheetPublications.erase(std::remove_if(self->sheetPublications.begin(), self->sheetPublications.end(),
                    [replaced](const auto& item) { return item.first == replaced; }), self->sheetPublications.end());
            }
            self->sequence.stop({self->offset, self->rawOffset, self->velocity});
            self->drain();
        }
    } catch (const std::exception& error) {
        self->backend->report(error.what());
    }
}

void NativeScroll::customEvent(ArkUI_NodeCustomEvent* native) noexcept {
    auto* raw = static_cast<NativeScroll*>(OH_ArkUI_NodeCustomEvent_GetUserData(native));
    if (!raw) return;
    auto self = raw->shared_from_this();
    auto owner = self->node.lock();
    if (!owner || self->retired || owner->disposing) return;
    try {
        auto* api = self->backend->api;
        const float scale = self->backend->configuration.displayScale;
        const auto type = OH_ArkUI_NodeCustomEvent_GetEventType(native);
        if (type == ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE) {
            auto extent = self->geometry.contentExtent();
            for (const auto& child : owner->children) {
                Constraint constraint(pixels(child->frame.width, scale), pixels(child->frame.height, scale));
                check(api->measureNode(child->handle, constraint.value), "measure scroll child");
            }
            check(api->setMeasuredSize(self->content, pixels(extent.x, scale), pixels(extent.y, scale)),
                  "set scroll content size");
        } else if (type == ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT) {
            const auto position = OH_ArkUI_NodeCustomEvent_GetPositionInLayout(native);
            check(api->setLayoutPosition(self->content, position.x, position.y), "layout scroll content");
            for (const auto& child : owner->children) {
                check(api->layoutNode(child->handle, pixels(child->frame.x, scale), pixels(child->frame.y, scale)),
                      "layout scroll child");
            }
        }
    } catch (const std::exception& error) {
        self->backend->report(error.what());
    }
}

static void cancelSubtreeScroll(Node& node) {
    std::vector<std::shared_ptr<Node>> nodes {node.shared_from_this()};
    for (size_t i = 0; i < nodes.size(); ++i) {
        const auto children = nodes[i]->children;
        nodes.insert(nodes.end(), children.begin(), children.end());
    }
    for (const auto& value : nodes) if (value->scroll) value->scroll->cancel();
}

static void reconcileSubtreeScrollProperties(Node& node, const std::function<bool()>& current) {
    struct Entry {
        std::shared_ptr<Node> owner;
        std::shared_ptr<Node> parent;
        std::shared_ptr<NativeScroll> scroll;
        ArkUI_NodeHandle handle, control, hostParent;
        ArkUI_NodeContentHandle content;
        uint64_t mount;
        size_t ancestor;
    };
    const auto backend = node.backend;
    std::vector<Entry> entries;
    auto retain = [&](const std::shared_ptr<Node>& owner, size_t ancestor) {
        if (!owner || owner->backend != backend || owner->disposing ||
            std::any_of(entries.begin(), entries.end(), [&](const auto& entry) { return entry.owner == owner; }))
            return;
        auto scroll = owner->scroll;
        entries.push_back({owner, owner->parent.lock(), scroll, owner->handle,
            scroll ? scroll->handle : nullptr, owner->hostParent, owner->content,
            owner->sheetMountEpoch, ancestor});
    };
    if (!current()) return;
    retain(node.shared_from_this(), 0);
    for (size_t i = 0; i < entries.size(); ++i) {
        const auto children = entries[i].owner->children;
        for (const auto& child : children)
            if (child->parent.lock() == entries[i].owner) retain(child, i);
    }
    auto ownedCurrent = [&](size_t index) {
        for (;;) {
            const auto& entry = entries[index];
            const auto& owner = entry.owner;
            if (owner->backend != backend || owner->disposing || !owner->handle || owner->handle != entry.handle ||
                owner->parent.lock() != entry.parent || owner->sheetMountEpoch != entry.mount ||
                owner->hostParent != entry.hostParent || owner->content != entry.content) return false;
            if (index == 0) return true;
            index = entry.ancestor;
        }
    };
    for (size_t i = 0; i < entries.size(); ++i) {
        if (!current()) return; // a property/native callback can reenter the setter
        const auto& entry = entries[i];
        if (!ownedCurrent(i) || !entry.scroll || entry.owner->scroll != entry.scroll ||
            entry.scroll->retired || entry.scroll->handle != entry.control ||
            entry.scroll->backend != backend || entry.scroll->node.lock() != entry.owner) continue;
        entry.scroll->properties();
    }
}

static bool scrollAttribute(Node& node, const StringBox& name, const Value& value) {
    if (!node.scroll) return false;
    auto self = node.scroll;
    const auto key = name.toStringView();
    if (key == "scrollEnabled") {
        self->enabled = value.toBool();
        if (!self->enabled && self->sequence.dragging) self->cancel();
    }
    else if (key == "pagingEnabled") self->paging = value.toBool();
    else if (key == "showsVerticalScrollIndicator") self->verticalIndicator = value.toBool();
    else if (key == "showsHorizontalScrollIndicator") self->horizontalIndicator = value.toBool();
    else if (key == "bounces") self->bounces = value.toBool();
    else if (key == "bouncesFromDragAtStart") self->bounceStart = value.toBool();
    else if (key == "bouncesFromDragAtEnd") self->bounceEnd = value.toBool();
    else if (key == "bouncesVerticalWithSmallContent") self->smallVertical = value.toBool();
    else if (key == "bouncesHorizontalWithSmallContent") self->smallHorizontal = value.toBool();
    else if (key == "cancelsTouchesOnScroll") self->cancelsTouches = value.toBool();
    else if (key == "stopScrollingOnTouch") self->stopOnTouch = value.toBool();
    else if (key == "dismissKeyboardOnDrag") self->dismissKeyboardOnDrag = value.toBool();
    else return false;
    self->properties();
    return true;
}

static bool resetScrollAttribute(Node& node, const StringBox& name) {
    const auto key = name.toStringView();
    if (key == "pagingEnabled" || key == "bouncesVerticalWithSmallContent" ||
        key == "bouncesHorizontalWithSmallContent" || key == "stopScrollingOnTouch" ||
        key == "dismissKeyboardOnDrag") {
        return scrollAttribute(node, name, Value(false));
    }
    return scrollAttribute(node, name, Value(true));
}

static void bindScrollAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate) {
    binder.bindScrollAttributes();
    for (auto name : {"scrollEnabled", "pagingEnabled", "showsVerticalScrollIndicator",
                      "showsHorizontalScrollIndicator", "bounces", "bouncesFromDragAtStart",
                      "bouncesFromDragAtEnd", "bouncesVerticalWithSmallContent",
                      "bouncesHorizontalWithSmallContent", "cancelsTouchesOnScroll", "stopScrollingOnTouch",
                      "dismissKeyboardOnDrag"}) {
        binder.bindBooleanAttribute(StringBox::fromCString(name), false, delegate);
    }
}
