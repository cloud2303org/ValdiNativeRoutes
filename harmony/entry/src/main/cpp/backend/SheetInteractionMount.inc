// Exact native identities bridge a separately mounted root's hostParent to
// the existing logical subtree. No rectangles, cross-backend search, or
// relationship mutation is involved. Included after WheelArbitration.inc.
static bool sheetNativeWithin(Backend& backend, ArkUI_NodeHandle child, ArkUI_NodeHandle ancestor) {
    std::vector<ArkUI_NodeHandle> visited;
    for (auto current = child; current; current = backend.api->getParent(current)) {
        if (current == ancestor) return true;
        if (std::find(visited.begin(), visited.end(), current) != visited.end()) return false;
        visited.push_back(current);
    }
    return false;
}

static std::shared_ptr<Node> interactionParent(const Node& node) {
    if (auto parent = node.parent.lock()) return parent->backend == node.backend ? parent : nullptr;
    if (!node.hostParent || !node.handle || node.disposing ||
        node.backend->api->getParent(node.handle) != node.hostParent) return nullptr;
    std::vector<ArkUI_NodeHandle> visited;
    for (auto handle = node.hostParent; handle; handle = node.backend->api->getParent(handle)) {
        if (std::find(visited.begin(), visited.end(), handle) != visited.end()) return nullptr;
        visited.push_back(handle);
        for (auto* candidate : node.backend->nodes) {
            if (candidate == &node || candidate->disposing || !candidate->handle) continue;
            if (candidate->handle == handle ||
                (candidate->scroll && (candidate->scroll->handle == handle || candidate->scroll->content == handle)) ||
                (candidate->refresh && candidate->refresh->handle == handle)) {
                return candidate->weak_from_this().lock();
            }
        }
    }
    return nullptr;
}

static bool interactionWithin(Node& child, Node& ancestor) {
    if (child.backend != ancestor.backend) return false;
    auto current = child.weak_from_this().lock();
    std::vector<Node*> visited;
    while (current) {
        if (current.get() == &ancestor) return true;
        if (std::find(visited.begin(), visited.end(), current.get()) != visited.end()) return false;
        visited.push_back(current.get());
        current = interactionParent(*current);
    }
    return false;
}

static bool wheelOwnsMountedTouch(Node& scope, const ArkUI_GestureInterruptInfo* info) {
    if (wheelOwnsTouch(scope, info)) return true;
    // Only otherwise separate roots need the extension. Preserve the frozen
    // wheel's recognition and active-generation checks verbatim.
    for (auto* candidate : scope.backend->nodes) {
        if (candidate == &scope || candidate->disposing || !candidate->hostParent ||
            !interactionWithin(*candidate, scope)) continue;
        if (wheelOwnsTouch(*candidate, info)) return true;
    }
    return false;
}

static bool mountedWheelAllows(Node& owner, const ArkUI_GestureInterruptInfo* info) {
    if (!inputEnabled(owner)) return false;
    if (wheelOwnsMountedTouch(owner, info)) {
        auto* candidate = OH_ArkUI_GestureInterruptInfo_GetRecognizer(info);
        int32_t candidateId = 0, parentId = 0;
        check(OH_ArkUI_GetGestureBindNodeUniqueId(candidate, &candidateId), "read mounted ancestor identity");
        const auto parent = owner.scroll ? owner.scroll->handle :
                            owner.refresh ? owner.refresh->handle : nullptr;
        if (!parent) return false;
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(parent, &parentId), "read mounted ancestor node");
        if (candidateId == parentId) return false;
    }
    return true;
}

static GestureSourcePolicies mountedGestureSourcePolicies() {
    return {
        [](GestureNode& owner, const ArkUI_GestureInterruptInfo* info) {
            return mountedWheelAllows(static_cast<Node&>(owner), info);
        },
        [](GestureNode& owner, ArkUI_GestureInterruptInfo* info) {
            sheetScrollAdmission(static_cast<Node&>(owner), info);
        }
    };
}

static ArkUI_GestureInterruptResult interruptMountedWheelAncestor(ArkUI_GestureInterruptInfo* info) noexcept {
    auto* raw = static_cast<Node*>(OH_ArkUI_GestureInterrupter_GetUserData(info));
    auto owner = raw ? raw->weak_from_this().lock() : nullptr;
    if (!owner) return GESTURE_INTERRUPT_RESULT_REJECT;
    try {
        if (!mountedWheelAllows(*owner, info)) return GESTURE_INTERRUPT_RESULT_REJECT;
        sheetScrollAdmission(*owner, info);
        if (!inputEnabled(*owner)) return GESTURE_INTERRUPT_RESULT_REJECT;
        return GESTURE_INTERRUPT_RESULT_CONTINUE;
    } catch (const std::exception& error) {
        owner->backend->report(error.what());
        return GESTURE_INTERRUPT_RESULT_REJECT;
    }
}
