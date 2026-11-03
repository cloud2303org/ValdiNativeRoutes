// SDK26 touch-test ownership, not inferred pixel rectangles. This observes
// recognizers only; it never disables/removes a borrowed built-in recognizer.
static bool wheelOwnsTouch(Node& scope, const ArkUI_GestureInterruptInfo* info) {
    ArkUI_TouchRecognizerHandleArray touches = nullptr;
    int32_t count = 0;
    check(OH_ArkUI_GestureInterruptInfo_GetTouchRecognizers(info, &touches, &count), "read wheel touch owners");
    if (!touches || count <= 0) return false;
    std::vector<std::shared_ptr<Node>> pending {scope.shared_from_this()};
    while (!pending.empty()) {
        auto owner = std::move(pending.back());
        pending.pop_back();
        if (owner->disposing || owner->backend != scope.backend) continue;
        if (owner->wheel && owner->wheel->active()) {
            int32_t id = 0;
            check(OH_ArkUI_NodeUtils_GetNodeUniqueId(owner->handle, &id), "read wheel node identity");
            for (int32_t i = 0; i < count; ++i) {
                if (OH_ArkUI_TouchRecognizer_GetNodeHandle(touches[i]) == owner->handle ||
                    OH_ArkUI_TouchRecognizer_IsHostBelongsTo(touches[i], id)) return true;
            }
        }
        pending.insert(pending.end(), owner->children.begin(), owner->children.end());
    }
    return false;
}

// Installed only on backend-owned Scroll/Refresh handles, separately from the
// custom wrapper's existing page gestures. Wheel built-ins always continue.
static ArkUI_GestureInterruptResult interruptWheelAncestor(ArkUI_GestureInterruptInfo* info) noexcept {
    auto* raw = static_cast<Node*>(OH_ArkUI_GestureInterrupter_GetUserData(info));
    auto owner = raw ? raw->weak_from_this().lock() : nullptr;
    if (!owner) return GESTURE_INTERRUPT_RESULT_REJECT;
    try {
        if (!inputEnabled(*owner)) return GESTURE_INTERRUPT_RESULT_REJECT;
        if (!wheelOwnsTouch(*owner, info)) return GESTURE_INTERRUPT_RESULT_CONTINUE;
        auto* candidate = OH_ArkUI_GestureInterruptInfo_GetRecognizer(info);
        int32_t candidateId = 0, parentId = 0;
        check(OH_ArkUI_GetGestureBindNodeUniqueId(candidate, &candidateId), "read ancestor gesture identity");
        const auto parent = owner->scroll ? owner->scroll->handle : owner->refresh ? owner->refresh->handle : nullptr;
        if (!parent) return GESTURE_INTERRUPT_RESULT_REJECT;
        check(OH_ArkUI_NodeUtils_GetNodeUniqueId(parent, &parentId), "read ancestor node identity");
        if (candidateId == parentId && wheelOwnsTouch(*owner, info)) return GESTURE_INTERRUPT_RESULT_REJECT;
        return GESTURE_INTERRUPT_RESULT_CONTINUE;
    } catch (const std::exception& error) {
        owner->backend->report(error.what());
        return GESTURE_INTERRUPT_RESULT_REJECT;
    }
}

static void reconcileSubtreeWheels(Node& scope) {
    std::vector<std::shared_ptr<Node>> pending {scope.shared_from_this()};
    for (size_t i = 0; i < pending.size(); ++i) {
        auto current = pending[i];
        pending.insert(pending.end(), current->children.begin(), current->children.end());
        if (!current->wheel) continue;
        if (inputEnabled(*current)) current->wheel->activate();
        else current->wheel->stop();
    }
}

static void stopSubtreeWheels(Node& scope) {
    std::vector<std::shared_ptr<Node>> pending {scope.shared_from_this()};
    for (size_t i = 0; i < pending.size(); ++i) {
        auto current = pending[i];
        pending.insert(pending.end(), current->children.begin(), current->children.end());
        if (current->wheel) current->wheel->stop();
    }
}
