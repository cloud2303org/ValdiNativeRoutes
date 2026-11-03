// Actual production MAX+pin/notice/drain/cancellation bodies, selected by -I.
// Identical source also compiles the immutable SUM+bool baseline. Literal
// normalized scroll/panel traces below are assertions, not a second allocator.
#include "sheet-backend-p2-boundary.hpp"

namespace {
void require(bool condition, const char* text) {
    if (!condition) throw std::runtime_error(std::string("REGRESSION: ") + text);
}

void literal(float childStart, float parentStart, float expectedSheet) {
    Rig r;
    auto parent = r.scroll(r.root, parentStart);
    auto child = r.scroll(parent, childStart);
    r.startScroll(child);
    const auto native = r.frame(child, -70);
    require(native.returned && record(child->scroll->handle).offset == 0 &&
            record(parent->scroll->handle).offset == 0 && r.sheetOffset == expectedSheet,
            "same physical down70 tracks each scroll to its edge, then offers residual once");
    const auto offered = r.offers;
    const auto ancestor = r.frame(parent, -70);
    require(ancestor.returned && ancestor.actual == 0 && r.offers == offered,
            "ancestor frame must not reuse the selected native source travel");
}

void multiframe() {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    r.frame(child, -15);
    require(record(child->scroll->handle).offset == 15 && record(parent->scroll->handle).offset == 5 &&
            r.sheetOffset == 0, "first shared down15: child15,parent5,panel0");
    r.frame(child, -15);
    require(record(child->scroll->handle).offset == 0 && record(parent->scroll->handle).offset == 0 &&
            r.sheetOffset == 0, "second shared down15 pins both at top without early sheet motion");
    r.frame(child, -40);
    require(r.sheetOffset == 40, "[-15,-15,-40] has the same panel40 residual as one down70");
}

void equalFrames() {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    for (float input : {-10.0f, -10.0f, -10.0f, -40.0f}) r.frame(child, input);
    require(r.sheetOffset == 40 && record(parent->scroll->handle).offset == 0 &&
            record(child->scroll->handle).offset == 0,
            "equal floats/timestamps are separate authoritative frame budgets");
}

void reversalBeforeEdge() {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    r.frame(child, -25);
    require(record(child->scroll->handle).offset == 5 && record(parent->scroll->handle).offset == 0 &&
            r.sheetOffset == 0, "shorter coordinate pins while deeper scroll still has distance");
    r.frame(child, 10);
    require(record(child->scroll->handle).offset == 15 && record(parent->scroll->handle).offset == 10 &&
            r.sheetOffset == 0, "reversal restores each native coordinate from its own clamp");
    r.frame(child, -55);
    require(r.sheetOffset == 40, "reversal must not sum distances or reuse an unrelated frame threshold");
}

void reversalAfterSheet() {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    r.frame(child, -70);
    require(r.sheetOffset == 40, "initial panel40");
    r.frame(child, 25);
    require(r.sheetOffset == 15 && record(child->scroll->handle).offset == 0 &&
            record(parent->scroll->handle).offset == 0, "up25 restores sheet first, keeping content pinned");
    r.frame(child, 25);
    require(r.sheetOffset == 0 && record(child->scroll->handle).offset == 10 &&
            record(parent->scroll->handle).offset == 10, "remaining up10 tracks both native coordinates");
    r.frame(child, -20);
    require(r.sheetOffset == 10 && record(child->scroll->handle).offset == 0 &&
            record(parent->scroll->handle).offset == 0, "new down20 consumes max10 then moves sheet10");
}

void cancelNewDrag() {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    r.frame(child, -70);
    // Explicit observed-notification chronology for this ordinary terminal
    // case, through the actual NativeScroll.event body. The old failing
    // direct-cancel fixture/log is preserved in the db89 source freeze.
    // This does not establish the SDK's order for lifecycle-before-DID_SCROLL.
    r.notify(child, NODE_SCROLL_EVENT_ON_DID_SCROLL);
    r.raw(UI_TOUCH_EVENT_ACTION_CANCEL);
    require(r.ends == 1 && r.lastReason == TestEndReason::GestureCanceled,
            "ordinary native cancel retains gesture reason");
    // Native terminal notifications sample and release the native sequence.
    // Direct NativeScroll.cancel is a lifecycle path, not this notification.
    r.notify(child, NODE_SCROLL_EVENT_ON_DID_STOP_DRAGGING);
    r.notify(child, NODE_SCROLL_EVENT_ON_SCROLL_STOP);
    require(record(parent->scroll->handle).interactionEnabled &&
            record(child->scroll->handle).interactionEnabled,
            "ordinary terminal restores native interaction before the fresh drag");
    r.sheetOffset = 0;
    r.startScroll(child);
    r.frame(child, -10);
    require(r.begins == 2 && r.sheetOffset == 10,
            "new admitted drag starts from current top offsets without old travel");
    actualTouchEnabled(*r.root, TestBool{false});
    require(r.ends == 2 && r.lastReason == TestEndReason::LifecycleCanceled &&
            record(parent->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST &&
            record(child->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
            "lifecycle cancel restores the entire selected nesting chain once");
    r.sheetOffset = 0;
    actualTouchEnabled(*r.root, TestBool{true});
    require(record(parent->scroll->handle).interactionEnabled &&
            record(child->scroll->handle).interactionEnabled,
            "touch re-enable restores native interaction before the fresh drag");
    r.startScroll(child);
    r.frame(child, -10);
    require(r.begins == 3 && r.sheetOffset == 10, "post-lifecycle drag has a fresh budget");
}

void callbackFence(const std::string& mode) {
    Rig r;
    auto parent = r.scroll(r.root, 20);
    auto child = r.scroll(parent, 30);
    r.startScroll(child);
    size_t writesAtReturn = 0;
    parent->runtimeView->scroll = [&]() -> std::optional<Point> {
        if (mode == "unbind") {
            r.binding->lifetime->revoke();
            auto old = std::move(r.root->sheetInteraction);
            old->retire();
            forbiddenBorrowed = {r.binding->panel, r.binding->rootMountParent};
        } else if (mode == "geometry") {
            parent->scroll->geometry.contentHeight += 50;
            ++parent->scroll->geometryRevision;
        } else if (mode == "primary-geometry") {
            child->scroll->geometry.contentHeight += 50;
            ++child->scroll->geometryRevision;
        } else {
            // Actual independent command path; its later controller write is
            // allowed, while this old publication's adjusted offset is not.
            parent->scroll->specs(Point(0, 90), Size{100, 450}, false);
            parent->scroll->didLayout();
        }
        writesAtReturn = offsetWrites.size();
        return Point(0, 77);
    };
    const auto native = r.frame(child, -70);
    require(!native.returned && offsetWrites.size() == writesAtReturn &&
            record(parent->scroll->handle).offset == 0,
            "ancestor callback must fence old circular correction before any leaf return");
    require(r.ends == 1 && r.lastReason == TestEndReason::LifecycleCanceled,
            "invalidated plan cancels exactly one old session");
    forbiddenBorrowed.clear();
    if (mode == "reconfigure") {
        drainDeferred();
        require(record(parent->scroll->handle).offset == 90,
                "new independent controller command survives old MAX plan invalidation");
    }
}

void terminal(bool cancel, float position, float velocity) {
    Rig r;
    r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
    r.select(r.binding->panel);
    ArkUI_GestureEvent event;
    event.y = position * r.backend->configuration.displayScale;
    event.velocity = velocity * r.backend->configuration.displayScale;
    { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
    require(r.sheetOffset == position && r.begins == 1, "terminal vector must start at literal panel position");
    event.action = cancel ? GESTURE_EVENT_ACTION_CANCEL : GESTURE_EVENT_ACTION_END;
    if (cancel) event.velocity = std::numeric_limits<float>::quiet_NaN();
    const auto queries = cancelVelocityReads;
    { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
    require(r.ends == 1 && r.lastVelocity == velocity &&
            r.lastReason == (cancel ? TestEndReason::GestureCanceled : TestEndReason::Ended),
            "native END/CANCEL at same position must transport the same captured finite velocity");
    require(cancelVelocityReads == queries, "CANCEL velocity field must never be queried");
    r.raw(UI_TOUCH_EVENT_ACTION_CANCEL);
    require(r.ends == 1, "late raw/native terminal cannot repeat end");
}

void terminalVectors() {
    // These are transported to the parent's ACTUAL route host policy test:
    // strict +/-600 flick boundary, nearest detent otherwise, midpoint tie
    // closed. This fixture deliberately contains no duplicate snap oracle.
    for (float position : {49.0f, 50.0f, 51.0f})
        for (float velocity : {-601.0f, -600.0f, -599.0f, 0.0f, 599.0f, 600.0f, 601.0f}) {
            terminal(false, position, velocity);
            terminal(true, position, velocity);
        }
}

void cancelFallbackAndMultitouch() {
    {
        Rig r;
        auto child = r.scroll(r.root, 0);
        r.startScroll(child);
        r.raw(UI_TOUCH_EVENT_ACTION_CANCEL);
        require(r.ends == 1 && r.lastReason == TestEndReason::GestureCanceled && r.lastVelocity == 0,
                "no captured velocity uses explicit zero fallback");
    }
    {
        Rig r;
        auto child = r.scroll(r.root, 0);
        r.startScroll(child);
        r.raw(UI_TOUCH_EVENT_ACTION_MOVE, 60, 100000001);
        r.raw(UI_TOUCH_EVENT_ACTION_CANCEL);
        require(r.lastReason == TestEndReason::GestureCanceled && r.lastVelocity == 300,
                "raw cancel uses finite velocity captured from current touch motion");
    }
    {
        Rig r;
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        r.select(r.binding->panel);
        ArkUI_GestureEvent event;
        event.y = 20; event.velocity = 1400;
        { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
        ArkUI_NodeEvent second;
        second.data = r.owner.get();
        second.input.action = UI_TOUCH_EVENT_ACTION_DOWN;
        second.input.pointers = 2;
        { CallbackScope scope; SheetInteraction::touch(&second); }
        require(r.lastReason == TestEndReason::GestureCanceled && r.lastVelocity == 0 && r.ends == 1,
                "multitouch interrupts single-finger session with explicit gesture/zero contract");
    }
    {
        Rig r;
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        r.select(r.binding->panel);
        ArkUI_GestureEvent event;
        event.y = 120; event.velocity = 1400;
        { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
        r.binding->lifetime->revoke();
        auto old = std::move(r.root->sheetInteraction);
        old->retire();
        require(r.lastReason == TestEndReason::LifecycleCanceled && r.lastVelocity == 0 && r.ends == 1,
                "teardown at partial offset never reuses gesture velocity or gesture reason");
        event.action = GESTURE_EVENT_ACTION_CANCEL;
        { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
        require(r.ends == 1, "stale gesture cancel cannot become a dismissal after teardown");
    }
}

void scalarReleaseDirection() {
    // Exercise actual NativeScroll.event scalar WILL_STOP delivery. Only
    // captured motion proves its direction.
    for (float captured : {0.0f, -0.0f, 300.0f, -300.0f,
                           std::numeric_limits<float>::quiet_NaN()}) {
        Rig r;
        auto child = r.scroll(r.root, 0);
        r.startScroll(child);
        r.owner->session.closedwardVelocity = captured;
        r.notify(child, NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING, 800);
        const float expected = std::isfinite(captured) && captured != 0 ?
            std::copysign(800.0f, captured) : 0;
        require(r.ends == 1 && r.lastReason == TestEndReason::Ended && r.lastVelocity == expected,
                "scalar speed800 requires finite nonzero captured current-motion direction");
    }
    {
        Rig r;
        auto child = r.scroll(r.root, 0);
        r.startScroll(child); // No captured touch/pan movement at all.
        r.notify(child, NODE_SCROLL_EVENT_ON_WILL_STOP_DRAGGING, 800);
        require(r.ends == 1 && r.lastVelocity == 0,
                "native speed800 without any observed direction must not invent a downflick");
    }
}

void admissionControls() {
    // Both the native handle and empty panel hit paths admit the non-scroll
    // source; no viewport-only rectangle is involved.
    for (bool handle : {false, true}) {
        Rig r;
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        const auto hit = handle ? makeHandle(ARKUI_NODE_STACK, r.binding->panel) : r.binding->panel;
        r.select(hit);
        require(r.owner->session.source == SheetMotionSource::PanelPan,
                "handle and empty panel must select whole-panel pan");
        ArkUI_GestureEvent event;
        event.y = 24; event.velocity = 200;
        { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
        require(r.begins == 1 && r.sheetOffset == 12, "panel pan normalizes native PX to logical vp");
    }
    {
        Rig r;
        auto child = r.scroll(r.root, 0);
        require(!r.frame(child, -20).returned && r.begins == 0,
                "generic frames cannot admit a touch session");
        sheetScrollStart(child->scroll);
        require(r.begins == 0, "generic scroll start without admitted touch cannot begin");
        r.startScroll(child);
        ArkUI_GestureEvent event;
        event.y = 80; event.velocity = 1200;
        { CallbackScope scope; SheetInteraction::gesture(&event, r.owner.get()); }
        require(r.sheetOffset == 0 && r.begins == 1, "selected scroll source excludes panel pan");
        r.frame(child, -20);
        require(r.sheetOffset == 20, "only selected native source applies the travel");
    }
    {
        Rig r;
        auto child = r.scroll(r.root, 0);
        r.binding->begin = [&](uint64_t) { ++r.begins; return false; };
        r.startScroll(child);
        require(!r.frame(child, -20).returned && r.ends == 0 &&
                record(child->scroll->handle).nested == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST,
                "rejected begin neither isolates native scroll nor receives a terminal");
    }
}

void exclusiveAndMountedWheel() {
    {
        Rig r;
        for (auto type : {ARKUI_NODE_TEXT_PICKER, ARKUI_NODE_DATE_PICKER, ARKUI_NODE_TIME_PICKER,
                          ARKUI_NODE_TEXT_INPUT, ARKUI_NODE_TEXT_AREA, ARKUI_NODE_REFRESH}) {
            r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
            r.select(makeHandle(type, r.root->handle));
            require(r.owner->session.source == SheetMotionSource::Exclusive && !r.owner->start(),
                    "Refresh/editor/native picker hit path has priority over sheet admission");
        }
        require(r.begins == 0, "exclusive controls cannot start sheet motion");
    }
    {
        Rig r;
        auto host = r.scroll(r.root, 0);
        auto mounted = std::make_shared<Node>();
        mounted->backend = r.backend;
        mounted->hostParent = makeHandle(ARKUI_NODE_STACK, host->scroll->content);
        mounted->handle = makeHandle(ARKUI_NODE_CUSTOM, mounted->hostParent);
        mounted->wheel = std::make_shared<NativeWheel>();
        r.backend->nodes.push_back(mounted.get());
        ArkUI_GestureInterruptInfo info;
        info.touches.push_back(reinterpret_cast<ArkUI_TouchRecognizerHandle>(mounted->handle));
        require(!wheelOwnsTouch(*host, &info) && wheelOwnsMountedTouch(*host, &info) &&
                interactionParent(*mounted) == host,
                "identity-resolved hostParent extension preserves separately mounted wheel ownership");
        r.raw(UI_TOUCH_EVENT_ACTION_DOWN);
        r.select(mounted->handle);
        require(r.owner->session.source == SheetMotionSource::Exclusive,
                "mounted wheel prevents sheet admission without changing its recognizer");
        host->touchEnabled = false;
        require(!inputEnabled(*mounted), "mounted child inherits exact owned ancestor input disable");
        r.backend->nodes.pop_back();
    }
}

void mountContextControls() {
    Rig r;
    const auto context = r.binding->context;
    r.binding->context = nullptr;
    const auto reads = nativeReads;
    require(!r.owner->current() && nativeReads == reads,
            "wrong binding context rejects before any borrowed native read");
    r.binding->context = context;
    ++r.root->sheetMountEpoch;
    require(!r.owner->current() && nativeReads == reads,
            "replaced root mount rejects before borrowed native reads");
    --r.root->sheetMountEpoch;
    auto other = makeHandle(ARKUI_NODE_STACK);
    record(r.root->handle).parent = other;
    require(!r.owner->current(), "same root pointer with wrong real native mount cannot admit");
    record(r.root->handle).parent = r.binding->rootMountParent;
    require(r.owner->current(), "exact root mount and context are admitted");
}
} // namespace

int main(int argc, char** argv) {
    configure();
    const std::string test = argc > 1 ? argv[1] : "all";
    const std::vector<std::string> cases {"all", "literal", "unequal", "equal", "zero", "multiframe",
        "equal-frames", "reverse-before", "reverse-after", "cancel-new-drag", "callback-unbind",
        "callback-geometry", "callback-primary-geometry", "callback-reconfigure", "terminal-vectors", "cancel-reasons",
        "scalar-release", "admission", "exclusive", "mount-context"};
    require(std::find(cases.begin(), cases.end(), test) != cases.end(), "unknown MAX fixture case");
    if (test == "all" || test == "literal") literal(30, 20, 40);
    if (test == "all" || test == "unequal") literal(10, 40, 30);
    if (test == "all" || test == "equal") literal(30, 30, 40);
    if (test == "all" || test == "zero") { literal(0, 0, 70); literal(0, 20, 50); literal(30, 0, 40); }
    if (test == "all" || test == "multiframe") multiframe();
    if (test == "all" || test == "equal-frames") equalFrames();
    if (test == "all" || test == "reverse-before") reversalBeforeEdge();
    if (test == "all" || test == "reverse-after") reversalAfterSheet();
    if (test == "all" || test == "cancel-new-drag") cancelNewDrag();
    if (test == "all" || test == "callback-unbind") callbackFence("unbind");
    if (test == "all" || test == "callback-geometry") callbackFence("geometry");
    if (test == "all" || test == "callback-primary-geometry") callbackFence("primary-geometry");
    if (test == "all" || test == "callback-reconfigure") callbackFence("reconfigure");
    if (test == "all" || test == "terminal-vectors") terminalVectors();
    if (test == "all" || test == "cancel-reasons") cancelFallbackAndMultitouch();
    if (test == "all" || test == "scalar-release") scalarReleaseDirection();
    if (test == "all" || test == "admission") admissionControls();
    if (test == "all" || test == "exclusive") exclusiveAndMountedWheel();
    if (test == "all" || test == "mount-context") mountContextControls();
    require(deferred.empty(), "fixture must retain and drain later UI work");
    std::cout << "sheet-backend-max: " << test << " PASS\n";
}
