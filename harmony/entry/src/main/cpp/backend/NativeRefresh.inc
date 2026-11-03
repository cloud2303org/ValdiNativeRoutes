// Included after NativeScroll.inc; uses the existing wrapper/child hierarchy.
NativeRefresh::NativeRefresh(const std::shared_ptr<Node>& owner) : node(owner), backend(owner->backend) {}

bool NativeRefresh::active() const {
    auto owner = node.lock();
    return owner && !retired && owner->imageAttachmentEnabled && owner->imageCallbacksActive() &&
        owner->children.size() == 1 && !owner->children.front()->disposing && owner->children.front()->handle &&
        owner->children.front()->scroll &&
        !owner->children.front()->scroll->geometry.horizontal;
}

void NativeRefresh::initialize() {
    auto owner = node.lock();
    if (!owner) fail("Refresh requires an owner");
    auto* api = backend->api;
    handle = api->createNode(ARKUI_NODE_REFRESH);
    if (!handle) fail("cannot allocate native Refresh");
    installGestureSource(*backend, *owner, handle, GestureSourceKind::Refresh, mountedGestureSourcePolicies());
    // Keep SDK VP defaults, including the 64vp refresh offset.
    owner->integer(handle, NODE_DIRECTION, ARKUI_DIRECTION_LTR);
    owner->integer(handle, NODE_CLIP, 1);
    check(api->addNodeEventReceiver(handle, event), "add refresh receiver");
    receiver = true;
    for (auto type : {NODE_REFRESH_STATE_CHANGE, NODE_REFRESH_ON_REFRESH}) {
        check(api->registerNodeEvent(handle, type, 0, this), "register native refresh event");
        registered.push_back(type);
    }
    check(api->addChild(owner->handle, handle), "attach native Refresh");
    attached = true;
    properties();
}

void NativeRefresh::properties() {
    auto owner = node.lock();
    if (!owner || retired || owner->disposing || backend->stopped || backend->shuttingDown) return;
    const bool eligible = active();
    const bool previous = std::exchange(writing, true);
    try {
        owner->integer(handle, NODE_REFRESH_PULL_TO_REFRESH,
            eligible && state.enabled && !state.refreshing && onRefresh != nullptr && inputEnabled(*owner));
        owner->integer(handle, NODE_REFRESH_REFRESHING, eligible && state.refreshing);
    } catch (...) {
        writing = previous;
        throw;
    }
    writing = previous;
}

void NativeRefresh::cancel(bool clear) {
    if (clear) {
        state.reset();
        onRefresh = nullptr;
    } else state.cancel();
    properties();
}

void NativeRefresh::reconcile(uint64_t generation) {
    auto self = shared_from_this();
    backend->configuration.dispatchUI([self, generation] {
        try {
            if (self->retired || self->state.generation != generation) return;
            self->properties();
        } catch (const std::exception& error) {
            self->backend->report(error.what());
        }
    }, false);
}

void NativeRefresh::retire(ArkUI_NodeHandle parent) {
    if (retired) return;
    retired = true;
    state.cancel();
    onRefresh = nullptr;
    auto* api = backend->api;
    if (handle) if (auto owner = node.lock()) retireGestureSources(*owner, handle);
    for (auto type : registered) api->unregisterNodeEvent(handle, type);
    registered.clear();
    if (receiver) check(api->removeNodeEventReceiver(handle, event), "remove refresh receiver");
    receiver = false;
    if (attached && parent) check(api->removeChild(parent, handle), "detach native Refresh");
    attached = false;
    // A refresh callback can synchronously destroy its context. Retain native
    // userdata/handle until that native event stack has unwound.
    auto self = shared_from_this();
    backend->configuration.dispatchUI([self] {
        if (self->handle) {
            self->backend->api->disposeNode(self->handle);
            gestureNativeSourceDisposed(*self->backend, self->handle);
        }
        self->handle = nullptr;
    }, false);
}

void NativeRefresh::event(ArkUI_NodeEvent* native) noexcept {
    auto* raw = static_cast<NativeRefresh*>(OH_ArkUI_NodeEvent_GetUserData(native));
    if (!raw) return;
    auto self = raw->shared_from_this();
    try {
        auto owner = self->node.lock();
        if (!owner || self->retired || self->writing || owner->disposing) return;
        const auto type = OH_ArkUI_NodeEvent_GetEventType(native);
        if (type == NODE_REFRESH_STATE_CHANGE) {
            if (auto* component = OH_ArkUI_NodeEvent_GetNodeComponentEvent(native);
                component && self->active() && inputEnabled(*owner) && self->state.enabled)
                self->state.nativeState(component->data[0].i32);
            return;
        }
        if (type != NODE_REFRESH_ON_REFRESH) return;
        auto callback = self->onRefresh;
        const bool notify = self->state.request(self->active() && inputEnabled(*owner) &&
            callback != nullptr && !callback->ownerIsTearingDown());
        // A controlled true can itself emit native ON_REFRESH. Never echo it
        // into business requests. Native drag states arm pull requests only.
        self->reconcile(self->state.generation);
        if (!notify) return;
        auto result = callback->call(ValueFunctionFlagsBoundedMainThreadSync, {});
        if (!result) self->backend->report(result.error().toString());
        // No native access after a callback; it may detach/shut down the tree.
    } catch (const std::exception& error) {
        self->backend->report(error.what());
    }
}

static void validateRefreshChild(const Node& owner, const Node& child, size_t otherChildren) {
    if (!owner.refresh) return;
    if (otherChildren || !child.scroll || child.scroll->geometry.horizontal)
        fail("ArkUIRefreshView requires exactly one direct vertical scroll child");
}

static bool refreshAttribute(Node& node, const StringBox& name, const Value& value) {
    if (!node.refresh) return false;
    auto self = node.refresh;
    const auto key = name.toStringView();
    if (key == "refreshing") {
        if (!value.isBool()) fail("refreshing must be Boolean");
        self->state.setRefreshing(value.toBool());
    } else if (key == "enabled") {
        if (!value.isBool()) fail("enabled must be Boolean");
        self->state.cancel();
        self->state.enabled = value.toBool();
    } else if (key == "onRefresh") {
        if (!value.isNullOrUndefined() && !value.isFunction()) fail("onRefresh must be a function");
        self->state.cancel();
        self->onRefresh = value.isFunction() ? value.getFunctionRef() : nullptr;
    } else return false;
    self->properties();
    return true;
}

static bool resetRefreshAttribute(Node& node, const StringBox& name) {
    if (name == "refreshing") return refreshAttribute(node, name, Value(false));
    if (name == "enabled") return refreshAttribute(node, name, Value(true));
    if (name == "onRefresh") return refreshAttribute(node, name, Value());
    return false;
}

static void bindRefreshAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate) {
    binder.bindBooleanAttribute(STRING_LITERAL("refreshing"), false, delegate);
    binder.bindBooleanAttribute(STRING_LITERAL("enabled"), false, delegate);
    binder.bindUntypedAttribute(STRING_LITERAL("onRefresh"), false, delegate);
}
