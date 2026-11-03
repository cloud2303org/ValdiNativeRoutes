#pragma once

// Real SDK declarations and fake SDK dispatch only. No replacement surface.
// SHEET_SURFACE_HEADER selects the exact matching helper header for the cpp
// compiled by the parent's serial driver.
#include "sheet-surface-p2-boundary.hpp"
#include <exception>
#include <string>
#include <utility>

namespace ValdiHarmony {

// Explicit result payload boundary: an owned test value, not the Valdi DTO/VM.
struct Value {
    int payload = 0;
};

struct TeardownErrors {
    std::exception_ptr error;
    template<typename Function> void run(Function&& function) {
        try { function(); }
        catch (...) { if (!error) error = std::current_exception(); }
    }
    void throwIfAny() { if (error) std::rethrow_exception(error); }
};

// The six tested methods are extracted unchanged below. These collaborators
// model only root ownership, interaction admission, UI command entry, base
// transitions and queued JS delivery. They do not model sheet layout, offset,
// visibility, input properties, animation or terminal ownership.
class HarmonyNavigator : public std::enable_shared_from_this<HarmonyNavigator> {
public:
    struct Page {
        bool removed = false;
        bool retired = false;
        bool visible = true;
        bool mounted = false;
        bool contextAlive = true;
        std::string reason;
        ArkUI_NodeHandle root = nullptr;
        ArkUI_NodeHandle mountParent = nullptr;
    };
    using PagePtr = std::shared_ptr<Page>;
    using Command = std::function<void(HarmonyNavigator&)>;
    struct Size { float width = 400, height = 800; } _size;
    struct Insets { double top = 32, left = 8, right = 12; } _insets;
    float _fullWindowHeight = 800;
    float _sheetViewportHeight = 800;
    float _keyboardOverlap = 0;
    float _sheetSystemBottom = 24;
    bool _sheetCompact = false;
    bool _active = true;
    bool _closed = false;
    bool _sheetClosing = false;
    bool _sheetCanceled = true;
    bool _detachedSheetCanceled = true;
    uint64_t _sheetGeneration = 1;
    PagePtr _sheet, _sheetMounted, _detachedSheet;
    std::shared_ptr<HarmonySheetSurface> _sheetSurface;
    Value _sheetResult, _detachedSheetResult;
    std::vector<Command> _afterSheet;
    ArkUI_NodeContentHandle content = nullptr;
    bool inputBound = false;
    bool inputTokenLive = false;
    unsigned scrimRequests = 0;
    unsigned modelUpdates = 0;
    unsigned unmounts = 0;
    unsigned resultScheduled = 0;
    unsigned resultDelivered = 0;
    unsigned contextRetirements = 0;
    std::vector<std::string> trace;
    std::deque<std::function<void()>> js;
    std::function<void(const Value&, bool)> resultObserver;

    HarmonySheetGeometry sheetGeometry() const;
    void closeSheet(const Value& value = {}, bool canceled = true, float velocity = 0);
    void reconcileSheet(const std::string& reason);
    void finishSheet(uint64_t generation, bool teardown = false);
    void setActive(bool active);
    void layoutSheet();

    // Synchronous UI command entry is explicit. There is no replacement
    // close/reconcile/finish algorithm in this admission collaborator.
    void requireUI() const {}
    void perform(const Command& command) { command(*this); }
    void bindSheetInput() {
        inputBound = inputTokenLive = true;
        trace.push_back("input-bind");
    }
    void unbindSheetInput() {
        inputBound = inputTokenLive = false;
        trace.push_back("input-revoke");
    }
    void syncNativeActions() {
        trace.push_back("native-actions");
        if (_sheetClosing) assert(!inputBound && !inputTokenLive);
    }
    void settleTransition() { trace.push_back("base-transition-settle"); }
    void reconcile(const std::string& reason = "navigation") {
        // Base-stack reconciliation is outside this bounded fixture.
        reconcileSheet(reason);
    }
    void updateViewModel(const PagePtr&) { ++modelUpdates; }
    void sizePage(const PagePtr& page) {
        if (!page || !page->root) return;
        const auto g = sheetGeometry();
        ArkUI_NumberValue width{.f32 = g.rootWidth}, height{.f32 = g.contentHeight};
        ArkUI_AttributeItem w{&width, 1}, h{&height, 1};
        assert(nodeAPI.setAttribute(page->root, NODE_WIDTH, &w) == 0);
        assert(nodeAPI.setAttribute(page->root, NODE_HEIGHT, &h) == 0);
    }
    void detachPage(const PagePtr& page) {
        if (!page || page->removed) return;
        page->removed = true;
        unbindSheetInput();
        if (page->mounted) {
            assert(page->root && page->mountParent);
            assert(nodeAPI.removeChild(page->mountParent, page->root) == 0);
            page->mounted = false;
            page->mountParent = nullptr;
            ++unmounts;
            trace.push_back("page-unmount");
        }
    }
    void retirePage(const PagePtr& page, const Value& value, bool canceled) {
        if (!page || page->retired) return;
        page->retired = true;
        assert(!page->mounted && !page->mountParent && page->contextAlive);
        // Observe actual NodeContent removal by the actual surface.
        assert(content && !content->root);
        trace.push_back("carrier-observed-detached");
        ++resultScheduled;
        trace.push_back("result-scheduled");
        js.push_back([owner = shared_from_this(), page, value, canceled] {
            assert(callbackDepth == 0 && !page->mounted && !owner->content->root);
            assert(page->contextAlive);
            ++owner->resultDelivered;
            owner->trace.push_back("result");
            if (owner->resultObserver) owner->resultObserver(value, canceled);
            // Explicit VM/context-destruction boundary, after result delivery.
            page->contextAlive = false;
            ++owner->contextRetirements;
            owner->trace.push_back("context-retired");
            nodeAPI.disposeNode(page->root);
            page->root = nullptr;
        });
    }
    void drainJS() {
        assert(callbackDepth == 0);
        while (!js.empty()) {
            auto work = std::move(js.front());
            js.pop_front();
            work();
        }
    }
};

// Source selector is independent from SHEET_SURFACE_HEADER. The parent extracts
// old/fixed host definitions into distinct includes using the same extractor.
#ifndef SHEET_SURFACE_NAVIGATOR_BODIES
#define SHEET_SURFACE_NAVIGATOR_BODIES "sheet-surface-navigation-bodies.inc"
#endif
#include SHEET_SURFACE_NAVIGATOR_BODIES

} // namespace ValdiHarmony
