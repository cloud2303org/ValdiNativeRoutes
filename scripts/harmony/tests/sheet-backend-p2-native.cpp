// Identical RED/GREEN regression source. Select ALL production bodies/headers
// with the extractor's explicit --backend-root and the generated -I directory.
// NativeScroll setter/cancel/properties/drain/controller bodies are real.
#include "sheet-backend-p2-boundary.hpp"

namespace {
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(std::string("REGRESSION: ") + message);
}
void unbind(Rig& r) {
    r.binding->lifetime->revoke();
    auto owner = std::move(r.root->sheetInteraction);
    if (owner) owner->retire();
}

void disabledCleanup() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 10);
    parent->scroll->sequence.beginDrag({{}, {}, {}});
    r.startScroll(deepest);
    require(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY &&
            record(deepest->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY,
            "setup must isolate both accepted nested controls");
    // This is the extracted ACTUAL NativeGestures touchEnabled setter, which
    // calls the extracted ACTUAL cancelSubtreeScroll, NativeScroll::cancel,
    // NativeScroll::drain, and NativeScroll::properties.
    require(actualTouchEnabled(*r.root, TestBool{false}), "actual setter handled touchEnabled");
    require(!r.root->touchEnabled, "setter must keep input disabled");
    require(!parent->scroll->sequence.active && !parent->scroll->sequence.dragging &&
            !deepest->scroll->sequence.active && !deepest->scroll->sequence.dragging,
            "touch disable must consume every relevant scroll sequence");
    require(parent->scroll->sequence.notices.empty() && deepest->scroll->sequence.notices.empty(),
            "touch disable must drain old lifecycle notices");
    require(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST &&
            record(deepest->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
            "touch disable must restore every isolated ancestor mode");
    require(!record(parent->scroll->handle).interactionEnabled &&
            !record(deepest->scroll->handle).interactionEnabled,
            "restoration must not reenable input beneath a disabled root");
    require(r.ends == 1 && r.lastCanceled, "one canceled sheet terminal on disable");
    require(parent->runtimeView->dragEnds == 1 && deepest->runtimeView->dragEnds == 1,
            "actual drain must deliver cancellation once per old native drag");
    require(actualTouchEnabled(*r.root, TestBool{false}), "duplicate disable handled");
    require(r.ends == 1, "duplicate disable must not repeat sheet terminal");
}

void disabledEndUnbind() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 10);
    parent->scroll->sequence.beginDrag({{}, {}, {}});
    r.startScroll(deepest);
    r.binding->end = [&](uint64_t, float, auto reason) {
        ++r.ends; r.lastReason = endReason(reason);
        r.lastCanceled = r.lastReason != TestEndReason::Ended;
        // Revocation/unbind happens inside the end callback while the real
        // root remains mounted. All later cleanup must use owned handles.
        unbind(r);
        forbiddenBorrowed = {r.binding->panel, r.binding->rootMountParent};
    };
    actualTouchEnabled(*r.root, TestBool{false});
    require(!parent->scroll->sequence.active && !parent->scroll->sequence.dragging &&
            !deepest->scroll->sequence.active && !deepest->scroll->sequence.dragging,
            "end unbind must not suppress owned sequence cleanup");
    require(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST &&
            record(deepest->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
            "end unbind must preserve restored nested modes");
    require(r.ends == 1 && r.lastCanceled, "end unbind terminal once");
    forbiddenBorrowed.clear();
}

void staleCircularCorrection(bool rebind) {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 0);
    r.startScroll(deepest);
    std::shared_ptr<SheetInteraction> replacement;
    size_t writesAtReturn = 0;
    parent->runtimeView->scroll = [&]() -> std::optional<Point> {
        unbind(r);
        if (rebind) {
            auto next = std::make_shared<SheetInteractionBinding>(*r.binding);
            next->lifetime = std::make_shared<SheetInteractionLifetime>(18);
            replacement = std::make_shared<SheetInteraction>(r.root, next);
            r.root->sheetInteraction = replacement;
            replacement->initialize();
        }
        writesAtReturn = offsetWrites.size();
        forbiddenBorrowed = {r.binding->panel, r.binding->rootMountParent};
        return Point(0, 77); // ACTUAL drain must fence this circular correction
    };
    const auto native = r.frame(deepest, -10);
    require(parent->runtimeView->scrolls == 1, "manual publication must enter actual NativeScroll::drain");
    require(offsetWrites.size() == writesAtReturn && record(parent->scroll->handle).offset == 20,
            "onScroll unbind/rebind must fence stale circular offset inside actual drain");
    require(!native.returned, "old frame return must also be fenced after reentry");
    require(r.root->hostParent == r.binding->rootMountParent && r.ends == 1,
            "root stays mounted and old sheet ends exactly once");
    forbiddenBorrowed.clear();
    if (replacement) {
        r.root->sheetInteraction.reset();
        replacement->retire();
    }
}

void independentCommand() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 0);
    r.startScroll(deepest);
    int publications = 0;
    parent->runtimeView->scroll = [&]() -> std::optional<Point> {
        if (++publications != 1) return Point(0, 95);
        unbind(r);
        // ACTUAL NativeScroll::specs starts a new independent controller
        // generation. Its publication is queued reentrantly while drain is
        // processing the older manual notice. It must not inherit that guard.
        parent->scroll->specs(Point(0, 90), Size{100, 400}, false);
        parent->scroll->enqueue(NativeScroll::NoticeType::Scroll);
        parent->scroll->didLayout(); // ACTUAL controller is queued for later UI
        return Point(0, 77);
    };
    const auto native = r.frame(deepest, -10);
    require(!native.returned && publications == 2, "independent reentrant notice must drain");
    require(record(parent->scroll->handle).offset == 95,
            "ordinary independent correction must survive old sheet guard");
    drainDeferred();
    require(record(parent->scroll->handle).offset == 90,
            "independent ACTUAL controller command must still commit after unbind");
}

void delayedPublication() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 0);
    r.startScroll(deepest);
    parent->runtimeTree->available = false;
    parent->runtimeView->scroll = [] { return std::optional<Point>(Point(0, 77)); };
    r.frame(deepest, -10);
    require(parent->runtimeView->scrolls == 0, "runtime lock denial must defer actual drain");
    unbind(r);
    parent->runtimeTree->available = true;
    const auto writes = offsetWrites.size();
    forbiddenBorrowed = {r.binding->panel, r.binding->rootMountParent};
    drainDeferred();
    require(parent->runtimeView->scrolls == 1 && offsetWrites.size() == writes &&
            record(parent->scroll->handle).offset == 20,
            "queued notice must retain its exact manual publication guard");
    forbiddenBorrowed.clear();
}

void ordinaryUnboundScroll() {
    Rig r;
    auto scroll = r.scroll(r.root, 30);
    unbind(r);
    scroll->runtimeView->scroll = [] { return std::optional<Point>(Point(0, 45)); };
    scroll->scroll->enqueue(NativeScroll::NoticeType::Scroll);
    require(record(scroll->scroll->handle).offset == 45,
            "ordinary unsheeted scroll correction remains enabled");
}

void endCallbackCommand() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 10);
    parent->scroll->sequence.beginDrag({{}, {}, {}});
    r.startScroll(deepest);
    r.binding->end = [&](uint64_t, float, auto reason) {
        ++r.ends; r.lastReason = endReason(reason);
        r.lastCanceled = r.lastReason != TestEndReason::Ended;
        // A newer independent command owns this same control before the old
        // cancel resumes. The real specs/controller path must survive it.
        parent->scroll->specs(Point(0, 90), Size{100, 400}, false);
        parent->scroll->didLayout();
    };
    actualTouchEnabled(*r.root, TestBool{false});
    require(parent->scroll->pending, "old cancellation must not clear newer command admission");
    require(!record(parent->scroll->handle).interactionEnabled,
            "new controller command does not reopen disabled native input");
    drainDeferred();
    require(record(parent->scroll->handle).offset == 90 && !parent->scroll->pending &&
            !parent->scroll->sequence.active && !parent->scroll->sequence.dragging,
            "new command generation must survive old cancel and execute");
    require(r.ends == 1 && r.lastCanceled, "new command must not duplicate sheet end");
}

void runtimeViewReplacement() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 0);
    r.startScroll(deepest);
    size_t writesAtReturn = 0;
    parent->runtimeView->scroll = [&]() -> std::optional<Point> {
        // Boundary injection for moveViewToTree's owned epoch/view change.
        // The setter, scroll journal/drain and cancel helpers remain actual.
        ++parent->sheetMountEpoch;
        cancelSheetInteractions(*parent, true);
        auto replacement = std::make_shared<TestViewNode>();
        replacement->tree = parent->runtimeTree.get();
        parent->runtimeView = replacement;
        parent->viewNode = replacement;
        writesAtReturn = offsetWrites.size();
        return Point(0, 77);
    };
    const auto native = r.frame(deepest, -10);
    require(!native.returned && offsetWrites.size() == writesAtReturn &&
            record(parent->scroll->handle).offset == 20,
            "view replacement must fence the old runtime correction and frame return");
    require(r.ends == 1 && r.lastCanceled, "view replacement cancels old sheet session once");
    require(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
            "logical replacement restores owned unchanged control without modifying a replacement handle");
}

void shutdownFence() {
    Rig r;
    auto parent = r.scroll(r.root, 30);
    auto deepest = r.scroll(parent, 0);
    r.startScroll(deepest);
    size_t writesAtReturn = 0;
    parent->runtimeView->scroll = [&]() -> std::optional<Point> {
        // Simulate the backend's retirement boundary while owned SDK handles
        // remain alive. This is a liveness fence test, not a shutdown model.
        r.backend->shuttingDown = true;
        unbind(r);
        writesAtReturn = offsetWrites.size();
        forbiddenBorrowed = {r.binding->panel, r.binding->rootMountParent};
        return Point(0, 77);
    };
    const auto native = r.frame(deepest, -10);
    require(!native.returned && offsetWrites.size() == writesAtReturn &&
            record(parent->scroll->handle).offset == 20,
            "retirement boundary must fence manual correction without borrowing dead panel");
    require(r.ends == 1 && r.lastCanceled, "shutdown boundary consumes old sheet terminal once");
    forbiddenBorrowed.clear();
}

void touchReenable(bool rootTarget) {
    Rig r;
    auto target = rootTarget ? r.root : r.group(r.root);
    auto parent = r.scroll(target, 30);
    auto child = r.scroll(parent, 10);
    auto ownTouchDisabled = r.scroll(target, 0);
    auto ownScrollDisabled = r.scroll(target, 0);
    actualTouchEnabled(*ownTouchDisabled, TestBool{false});
    ownScrollDisabled->scroll->enabled = false;
    ownScrollDisabled->scroll->properties();
    // Same-backend sibling subtree is deliberately left with its current
    // native flag; changing target must not reconcile that unrelated subtree.
    std::shared_ptr<Node> unrelated;
    int unrelatedWrites = 0;
    if (!rootTarget) {
        unrelated = r.scroll(r.root, 0);
        record(unrelated->scroll->handle).interactionEnabled = false;
        unrelatedWrites = record(unrelated->scroll->handle).propertyWrites;
    }
    parent->scroll->sequence.beginDrag({{}, {}, {}});
    r.startScroll(child);
    actualTouchEnabled(*target, TestBool{false});
    require(!record(parent->scroll->handle).interactionEnabled &&
            !record(child->scroll->handle).interactionEnabled && r.ends == 1,
            "disable must restore native nesting while keeping descendants disabled");
    actualTouchEnabled(*target, TestBool{true});
    require(record(parent->scroll->handle).interactionEnabled &&
            record(child->scroll->handle).interactionEnabled,
            "root/non-scroll ancestor re-enable must reconcile every eligible descendant native scroll");
    require(!record(ownTouchDisabled->scroll->handle).interactionEnabled &&
            !record(ownScrollDisabled->scroll->handle).interactionEnabled &&
            !ownTouchDisabled->touchEnabled && !ownScrollDisabled->scroll->enabled,
            "subtree reconciliation preserves each intentionally disabled child's own flags");
    require(record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST &&
            record(child->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
            "re-enable keeps the entire old SELF_ONLY chain restored");
    if (unrelated)
        require(record(unrelated->scroll->handle).propertyWrites == unrelatedWrites &&
                !record(unrelated->scroll->handle).interactionEnabled,
                "re-enable must not write an unrelated same-backend subtree");
    require(r.ends == 1, "re-enable cannot duplicate the old sheet terminal");
    // Check native admission prerequisites before asking the production event
    // path to begin another drag.
    r.startScroll(child);
    require(r.begins == 2 && r.owner->session.accepted,
            "fresh native drag starts only after descendant interaction is restored");
}

void touchReenableReentry() {
    for (bool rootTarget : {false, true}) {
        Rig r;
        auto target = rootTarget ? r.root : r.group(r.root);
        auto parent = r.scroll(target, 30);
        auto child = r.scroll(parent, 10);
        auto disabled = r.scroll(target, 0);
        actualTouchEnabled(*disabled, TestBool{false});
        parent->scroll->sequence.beginDrag({{}, {}, {}});
        r.startScroll(child);
        r.binding->end = [&](uint64_t, float, auto reason) {
            ++r.ends; r.lastReason = endReason(reason);
            actualTouchEnabled(*target, TestBool{true});
        };
        actualTouchEnabled(*target, TestBool{false});
        require(target->touchEnabled && r.ends == 1 &&
                record(parent->scroll->handle).interactionEnabled &&
                record(child->scroll->handle).interactionEnabled &&
                !record(disabled->scroll->handle).interactionEnabled,
                "end-callback re-enable wins over stale outer disable and preserves own-disabled descendants");
        require(!parent->scroll->sequence.active && !child->scroll->sequence.active &&
                !parent->scroll->sequence.dragging && !child->scroll->sequence.dragging,
                "reentry leaves old native drag sequences consumed");
    }
}
} // namespace

int main(int argc, char** argv) {
    configure();
    const std::string test = argc > 1 ? argv[1] : "all";
    const std::vector<std::string> cases {"all", "touch-disable", "touch-disable-unbind", "drain-unbind",
        "drain-rebind", "independent-command", "delayed-publication", "ordinary-scroll",
        "end-command", "view-replacement", "shutdown", "touch-reenable-root",
        "touch-reenable-ancestor", "touch-reenable-reentry"};
    require(std::find(cases.begin(), cases.end(), test) != cases.end(), "unknown fixture case");
    if (test == "all" || test == "touch-disable") disabledCleanup();
    if (test == "all" || test == "touch-disable-unbind") disabledEndUnbind();
    if (test == "all" || test == "drain-unbind") staleCircularCorrection(false);
    if (test == "all" || test == "drain-rebind") staleCircularCorrection(true);
    if (test == "all" || test == "independent-command") independentCommand();
    if (test == "all" || test == "delayed-publication") delayedPublication();
    if (test == "all" || test == "ordinary-scroll") ordinaryUnboundScroll();
    if (test == "all" || test == "end-command") endCallbackCommand();
    if (test == "all" || test == "view-replacement") runtimeViewReplacement();
    if (test == "all" || test == "shutdown") shutdownFence();
    if (test == "all" || test == "touch-reenable-root") touchReenable(true);
    if (test == "all" || test == "touch-reenable-ancestor") touchReenable(false);
    if (test == "all" || test == "touch-reenable-reentry") touchReenableReentry();
    require(deferred.empty(), "fixture must drain later UI disposal/controller work");
    std::cout << "sheet-backend-p2: " << test << " PASS\n";
}
