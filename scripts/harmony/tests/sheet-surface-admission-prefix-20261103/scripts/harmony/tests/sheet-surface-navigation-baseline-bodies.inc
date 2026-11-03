// Unchanged production definitions; collaborators are declared in
// sheet-surface-navigation-boundary.hpp. No surface substitutions.

HarmonySheetGeometry HarmonyNavigator::sheetGeometry() const {
    return computeHarmonySheetGeometry({_size.width,
        _fullWindowHeight > 0 ? _fullWindowHeight : _size.height,
        _sheetViewportHeight, _keyboardOverlap,
        static_cast<float>(_insets.top), static_cast<float>(_insets.left),
        static_cast<float>(_insets.right), _sheetSystemBottom, _sheetCompact});
}

void HarmonyNavigator::closeSheet(const Value& value, bool canceled, float velocity) {
    requireUI();
    if (!_sheet || _sheetClosing) return;
    // One terminal claim. Invalidate callbacks BEFORE cancelAnimation/retire can
    // synchronously reenter. The original page/result/parent remain owned.
    _sheetClosing = true;
    _sheetResult = value;
    _sheetCanceled = canceled;
    const auto generation = ++_sheetGeneration;
    unbindSheetInput();
    syncNativeActions();
    auto surface = _sheetSurface;
    if (!surface || !_active || _closed) {
        finishSheet(generation, _closed);
        return;
    }
    try {
        surface->cancelAnimation();
        if (!_sheet || _sheetGeneration != generation || _sheetSurface != surface) return;
        surface->setActive(false);
        surface->animateTo(sheetGeometry().panelHeight, velocity, [weak = weak_from_this(), generation](bool) {
            if (auto self = weak.lock(); self && !self->_closed && self->_sheetClosing &&
                self->_sheetGeneration == generation)
                self->perform([generation](auto& nav) { nav.finishSheet(generation); });
        });
    } catch (...) {
        if (_sheet && _sheetGeneration == generation) finishSheet(generation);
        throw;
    }
}

void HarmonyNavigator::reconcileSheet(const std::string& reason) {
    auto page = _sheetMounted;
    if (!page || page->removed) return;
    if (page->visible != _active) {
        page->visible = _active;
        page->reason = _active ? reason : "background";
        updateViewModel(page);
    }
    if (_sheetSurface) _sheetSurface->setActive(_active && !_sheetClosing);
    if (_active && !_sheetClosing) bindSheetInput();
    else unbindSheetInput();
}

void HarmonyNavigator::finishSheet(uint64_t generation, bool teardown) {
    requireUI();
    if (!_sheet || generation != _sheetGeneration) return;
    // Keep ownership through unmount+panel detach, even during cancellation
    // callbacks. A stale terminal can never consume a replacement sheet.
    ++_sheetGeneration;
    auto page = _sheet;
    auto surface = _sheetSurface;
    auto value = _sheetResult;
    const bool canceled = _sheetCanceled;
    _sheetClosing = true;
    TeardownErrors errors;
    errors.run([&] { unbindSheetInput(); });
    errors.run([&] { if (surface) surface->cancelAnimation(); });
    errors.run([&] { detachPage(page); });
    errors.run([&] { if (surface) surface->retire(); });
    // Reconciliation may synchronously close the runtime. Keep the detached
    // terminal claim discoverable so close preserves an already accepted value
    // before canceling the admitted-result registry.
    _detachedSheet = page;
    _detachedSheetResult = value;
    _detachedSheetCanceled = canceled;
    _sheetMounted = nullptr;
    _sheetSurface = nullptr;
    _sheet = nullptr;
    _sheetClosing = false;
    _sheetResult = {};
    // Reconcile after detach, then result, then the JS context destruction fence.
    if (!_closed && !teardown) errors.run([&] { reconcile(); });
    errors.run([&] { retirePage(page, value, canceled); });
    if (_detachedSheet == page) {
        _detachedSheet = nullptr;
        _detachedSheetResult = {};
    }
    auto commands = std::exchange(_afterSheet, {});
    if (!_closed && !teardown) {
        for (const auto& command : commands) errors.run([&] { perform(command); });
    }
    errors.throwIfAny();
}

void HarmonyNavigator::setActive(bool active) {
    perform([=](auto& nav) {
        nav._active = active;
        if (!active) nav.unbindSheetInput();
        if (nav._sheetSurface && !active) {
            auto surface = nav._sheetSurface;
            const auto generation = nav._sheetGeneration;
            surface->cancelAnimation();
            if (nav._closed || nav._sheetGeneration != generation || nav._sheetSurface != surface) return;
            if (nav._sheetClosing) nav.finishSheet(generation);
            else {
                surface->layout(nav.sheetGeometry(), 0);
                surface->setActive(false);
            }
        }
        nav.syncNativeActions();
        nav.settleTransition();
        nav.reconcile(active ? "foreground" : "background");
    });
}

void HarmonyNavigator::layoutSheet() {
    if (!_sheet || !_sheetSurface) return;
    auto surface = _sheetSurface;
    const auto generation = _sheetGeneration;
    const auto geometry = sheetGeometry();
    try { surface->layout(geometry, surface->currentOffset()); }
    catch (...) {
        if (_sheet && _sheetGeneration == generation) {
            if (_sheetClosing) finishSheet(generation);
            else {
                try { closeSheet(); }
                catch (...) {} // closeSheet itself drains a failed terminal.
            }
        }
        throw;
    }
    if (_closed || _sheetGeneration != generation || _sheetSurface != surface) return;
    // Native picker sizing never assumes a Valdi tree.
    sizePage(_sheetMounted);
    if (_sheetMounted) updateViewModel(_sheetMounted);
}
