#include "../ScrollState.hpp"

#include <cassert>
#include <iostream>
#include <vector>

using namespace Valdi::Harmony::detail;

using State = ScrollState<ScrollPoint>;
using Type = ScrollNoticeType;
using Notices = std::vector<State::Notice>;

static State::Sample sample(float y = 166) {
    return {{0, y}, {0, y + 4}, {0, 900}};
}

static Notices drain(State& state) {
    Notices result;
    while (auto notice = state.nextNotice()) result.push_back(*notice);
    return result;
}

static void expect(const Notices& notices, std::initializer_list<Type> types) {
    assert(notices.size() == types.size());
    size_t index = 0;
    for (auto type : types) assert(notices[index++].type == type);
}

static State initialized() {
    State state;
    assert(state.specs({0, 0}, true, false, sample(0)));
    return state;
}

static void geometrySyncDuringDrag() {
    auto state = initialized();
    assert(state.beginDrag(sample(0)));
    const auto generation = state.generation;
    // growOnDrag: synchronous setState from onDragStart changes 24 -> 40
    // rows at the runtime's unchanged offset, before another native event.
    auto start = state.nextNotice();
    assert(start && start->type == Type::StartDrag);
    assert(!state.specs({0, 0}, true, false, sample(0)));
    assert(state.current(generation) && state.dragging && state.active);
    state.enqueue({Type::Scroll}, sample());
    auto movement = state.nextNotice(); // production publishes before callback reentry
    assert(movement && movement->type == Type::Scroll && state.runtimeOffset.y == 166);
    state.enqueue({Type::Scroll}, sample());
    state.release(sample());
    // Also preserve a consumed release already waiting for the tree lock.
    assert(!state.specs({0, 166}, true, false, sample()));
    auto delivered = drain(state);
    expect(delivered, {Type::Scroll, Type::EndDrag});
    assert(delivered[1].generation == generation);
    assert(delivered[1].offset.y == 166 && delivered[1].raw.y == 170 &&
           delivered[1].velocity.y == 900);
    assert(state.acceptDragTarget(delivered[1], {0, 200}));
    assert(!state.specs({0, 166}, true, false, sample()));
    assert(state.takeDragTarget(generation, 3, 3)->y == 200);
    state.stop(sample(200));
    expect(drain(state), {Type::Scroll, Type::End});
    // A pending animated command retains its target/generation on size sync.
    assert(state.specs({0, 800}, false, true, sample(200)));
    const auto animation = state.generation;
    assert(!state.specs({0, 200}, true, false, sample(200)));
    assert(state.current(animation) && state.active);
    std::cout << "scroll-state: geometry sync preserves drag, queued release, correction and animation\n";
}

static void stalePostedCorrection() {
    auto state = initialized();
    state.beginDrag(sample());
    expect(drain(state), {Type::StartDrag});
    state.release(sample());
    auto release = state.nextNotice();
    assert(release && state.acceptDragTarget(*release, {0, 200}));
    auto oldToken = release->generation;
    // Native STOP waits for the posted override, but a new drag wins first.
    state.stop(sample());
    assert(drain(state).empty());
    state.beginDrag(sample(180));
    expect(drain(state), {Type::End, Type::StartDrag});
    assert(!state.takeDragTarget(oldToken, 1, 1)); // old UI task executes now
    state.release(sample(220));
    auto newRelease = state.nextNotice();
    assert(newRelease && state.acceptDragTarget(*newRelease, {0, 300}));
    assert(!state.takeDragTarget(oldToken, 1, 1)); // cannot clear the newer target
    assert(state.hasDragTarget(state.generation));
    assert(state.takeDragTarget(state.generation, 1, 1)->y == 300);
    state.stop(sample(300));
    expect(drain(state), {Type::Scroll, Type::End});
    // Later ordinary ends also work after the obsolete task has returned.
    state.beginDrag(sample(300));
    state.release(sample(340));
    state.stop(sample(340));
    expect(drain(state), {Type::StartDrag, Type::EndDrag, Type::Scroll, Type::End});
    std::cout << "scroll-state: stale posted target cannot suppress new ends or clear new correction\n";
}

static void releaseThenCancelWhileLocked() {
    auto state = initialized();
    state.beginDrag(sample());
    auto generation = state.generation;
    // Do not drain: production's tree try-lock has failed.
    state.enqueue({Type::Scroll}, sample(150));
    state.enqueue({Type::Scroll}, sample());
    state.release(sample());
    state.release(sample()); // WILL_STOP + DID_STOP must consume only once
    state.cancel(sample());
    auto delivered = drain(state);
    expect(delivered, {Type::StartDrag, Type::EndDrag, Type::End});
    for (const auto& notice : delivered) assert(notice.generation == generation);
    assert(delivered[1].raw.y == 170 && delivered[1].velocity.y == 900);
    // The old onDragEnding still runs, but its returned Snap100 target loses
    // ownership to cancellation and cannot drive a controller animation.
    assert(!state.acceptDragTarget(delivered[1], {0, 200}));
    assert(!state.takeDragTarget(generation, 1, 1));
    state.cancel(sample());
    assert(drain(state).empty());
    std::cout << "scroll-state: consumed release survives cancellation/tree contention exactly once\n";
}

static void releaseThenNewDragWhileLocked() {
    auto state = initialized();
    state.beginDrag(sample());
    const auto oldGeneration = state.generation;
    state.release(sample());
    state.beginDrag(sample(180)); // lock still busy
    const auto newGeneration = state.generation;
    state.enqueue({Type::Scroll}, sample(220));
    state.enqueue({Type::Scroll}, sample(240));
    state.release(sample(240));
    state.stop(sample(240));
    auto delivered = drain(state);
    expect(delivered, {Type::StartDrag, Type::EndDrag, Type::End, Type::StartDrag,
                       Type::Scroll, Type::EndDrag, Type::Scroll, Type::End});
    for (size_t i = 0; i < 3; ++i) assert(delivered[i].generation == oldGeneration);
    for (size_t i = 3; i < delivered.size(); ++i) assert(delivered[i].generation == newGeneration);
    assert(delivered[4].offset.y == 240); // adjacent frames still coalesce
    assert(!state.acceptDragTarget(delivered[1], {0, 200}));
    assert(state.acceptDragTarget(delivered[5], {0, 300}));
    assert(state.takeDragTarget(newGeneration, 1, 1)->y == 300);
    std::cout << "scroll-state: prior drag terminals precede new start while obsolete samples drop\n";
}

static void commandsAndCallbackReentry() {
    auto state = initialized();
    state.beginDrag(sample());
    auto generation = state.generation;
    // Content shrink that also adjusts the offset is a real replacement.
    assert(state.specs({0, 80}, true, false, sample()));
    auto delivered = drain(state);
    expect(delivered, {Type::StartDrag, Type::CancelDrag, Type::End});
    for (const auto& notice : delivered) assert(notice.generation == generation);
    assert(!state.acceptDragTarget(delivered[1], {0, 200}));

    state.beginDrag(sample(80));
    drain(state);
    state.release(sample(166));
    auto release = state.nextNotice();
    assert(release && release->type == Type::EndDrag);
    // onDragEnding synchronously starts a ref animation before returning its
    // own target. NativeScroll rechecks this same production journal.
    assert(state.specs({0, 500}, false, true, sample(166)));
    assert(!state.acceptDragTarget(*release, {0, 200}));
    expect(drain(state), {Type::End});
    assert(state.active && !state.dragTarget);

    // Synchronous cancellation while still dragging queues both terminals,
    // and a later generation's correction cannot hide the old End.
    state.beginDrag(sample(180));
    drain(state);
    state.cancel(sample(200));
    auto cancelled = state.nextNotice();
    assert(cancelled && cancelled->type == Type::CancelDrag);
    state.beginDrag(sample(220));
    state.release(sample(260));
    auto oldEnd = state.nextNotice();
    auto newStart = state.nextNotice();
    auto newRelease = state.nextNotice();
    assert(oldEnd && oldEnd->type == Type::End && newStart && newRelease);
    assert(state.acceptDragTarget(*newRelease, {0, 300}));
    assert(!state.hasDragTarget(oldEnd->generation));
    std::cout << "scroll-state: superseding commands/reentrant callbacks retain terminals, reject old returns\n";
}

static void historicalEndDuringNewAnimation() {
    for (bool publishFrame : {false, true}) {
        auto replacement = initialized();
        assert(replacement.specs({0, 500}, false, true, sample(0)));
        assert(replacement.specs({0, 800}, false, true, sample(0)));
        const auto animation = replacement.generation;
        auto historical = replacement.nextNotice();
        assert(historical && historical->type == Type::End);
        bool animating = true;
        int notifications = 0;
        replacement.deliverEnd(*historical, [&] {
            animating = false; // ViewNode::onScrollEnd's unconditional flag clear
            ++notifications;
        }, [&] { ++notifications; });
        assert(animating && notifications == 1);
        if (publishFrame) {
            replacement.enqueue({Type::Scroll}, sample(64));
            assert(replacement.nextNotice()->type == Type::Scroll);
            // ViewNode::onScroll updates offsets without restoring this flag.
        }
        // A later ref jump to the last published offset must pass the runtime
        // early-return guard, both before B's first frame and after sampling.
        const auto unchanged = replacement.runtimeOffset;
        assert(animating);
        animating = false;
        assert(replacement.specs(unchanged, false, false, sample(unchanged.y)));
        assert(!replacement.current(animation) && !replacement.active);
    }

    auto state = initialized();
    assert(state.specs({0, 500}, false, true, sample(0))); // animation A
    state.enqueue({Type::Scroll}, sample(100));
    auto frame = state.nextNotice();
    assert(frame && state.runtimeOffset.y == 100);
    assert(state.specs({0, 800}, false, true, sample(100))); // animation B
    const auto animationB = state.generation;
    auto oldEnd = state.nextNotice();
    assert(oldEnd && oldEnd->type == Type::End && oldEnd->generation != animationB);

    // Runtime contract: setScrollContentOffset(animated) marks true before
    // native specs; onScrollEnd clears it before JS, onScroll never restores it.
    // Exercise the production routing policy at that boundary, including a
    // ref jump to the unchanged published offset from inside the old callback.
    bool runtimeAnimating = true;
    int callbacks = 0, runtimeFinishes = 0, controllerCancellations = 0;
    auto immediateRef = [&](float target) {
        if (!runtimeAnimating && target == state.runtimeOffset.y) return;
        runtimeAnimating = false;
        assert(state.specs({0, target}, false, false, sample(100)));
        ++controllerCancellations;
    };
    state.deliverEnd(*oldEnd, [&] {
        ++runtimeFinishes;
        runtimeAnimating = false;
    }, [&] {
        ++callbacks;
        assert(runtimeAnimating);
        immediateRef(100);
    });
    assert(callbacks == 1 && runtimeFinishes == 0 && controllerCancellations == 1);
    assert(!runtimeAnimating && !state.active && !state.current(animationB));
    auto cancelledB = state.nextNotice();
    assert(cancelledB && cancelledB->type == Type::End && cancelledB->generation == animationB);
    state.deliverEnd(*cancelledB, [&] { ++runtimeFinishes; }, [&] { ++callbacks; });
    assert(runtimeFinishes == 1 && callbacks == 1 && !state.nextNotice());

    // If JS starts animation C during historical notification, there is no
    // post-callback restoration of B that could overwrite C or its target.
    assert(state.specs({0, 500}, false, true, sample(100)));
    assert(state.specs({0, 800}, false, true, sample(100)));
    oldEnd = state.nextNotice();
    runtimeAnimating = true;
    state.deliverEnd(*oldEnd, [&] { runtimeAnimating = false; }, [&] {
        ++callbacks;
        assert(state.specs({0, 900}, false, true, sample(100)));
    });
    assert(runtimeAnimating && state.active);
    auto replacedB = state.nextNotice();
    state.deliverEnd(*replacedB, [&] { runtimeAnimating = false; }, [&] { ++callbacks; });
    assert(runtimeAnimating && callbacks == 3);
    state.stop(sample(900));
    auto ended = drain(state);
    expect(ended, {Type::Scroll, Type::End});
    state.deliverEnd(ended.back(), [&] { runtimeAnimating = false; }, [&] { ++callbacks; });
    assert(!runtimeAnimating && callbacks == 3); // current end still finishes runtime
    std::cout << "scroll-state: historical end preserves replacement flag through immediate ref and callback reentry\n";
}

static void dragCorrectionWaitsForLayout() {
    auto state = initialized();
    ScrollGeometry geometry {320, 260, 320, 600, false};
    uint64_t geometryRevision = 1, laidOutRevision = 1;
    state.beginDrag(sample(0));
    drain(state);
    state.enqueue({Type::Scroll}, sample(166));
    state.nextNotice();
    state.release(sample(166));
    auto release = state.nextNotice();
    assert(release && release->type == Type::EndDrag);
    const auto token = release->generation;
    // Actual onDragEnding ordering: JS grows content at unchanged published
    // offset, returns a target beyond the OLD extent, and the posted task runs
    // before ArkUI lays out that growth. The generation intentionally survives.
    assert(geometry.clamp({0, 900}).y == 340);
    assert(!state.specs({0, 166}, true, false, sample(166)));
    geometry.contentHeight = 1400;
    ++geometryRevision;
    assert(state.acceptDragTarget(*release, {0, 900}));
    assert(state.current(token));
    assert(!state.takeDragTarget(token, geometryRevision, laidOutRevision));
    assert(state.hasDragTarget(token) && state.active);
    state.stop(sample(166)); // native STOP cannot finish the retained correction
    assert(drain(state).empty());

    // A second geometry update may also overtake the queued UI task.
    laidOutRevision = geometryRevision;
    assert(!state.specs({0, 166}, true, false, sample(166)));
    geometry.contentHeight = 1600;
    ++geometryRevision;
    assert(!state.takeDragTarget(token, geometryRevision, laidOutRevision));
    laidOutRevision = geometryRevision; // production didLayout queues another attempt
    auto target = state.takeDragTarget(token, geometryRevision, laidOutRevision);
    assert(target && geometry.clamp(*target).y == 900);
    assert(!state.takeDragTarget(token, geometryRevision, laidOutRevision)); // exactly once
    state.stop(sample(900));
    expect(drain(state), {Type::Scroll, Type::End});

    // A new command/drag wins while waiting. An old task cannot consume or
    // clear the later generation's correction, even once layout catches up.
    state.beginDrag(sample(900));
    drain(state);
    state.release(sample(920));
    release = state.nextNotice();
    assert(release && state.acceptDragTarget(*release, {0, 1000}));
    const auto stale = release->generation;
    ++geometryRevision;
    assert(!state.takeDragTarget(stale, geometryRevision, laidOutRevision));
    state.beginDrag(sample(920));
    expect(drain(state), {Type::End, Type::StartDrag});
    state.release(sample(960));
    release = state.nextNotice();
    assert(release && state.acceptDragTarget(*release, {0, 1100}));
    laidOutRevision = geometryRevision;
    assert(!state.takeDragTarget(stale, geometryRevision, laidOutRevision));
    assert(state.hasDragTarget(state.generation));
    target = state.takeDragTarget(state.generation, geometryRevision, laidOutRevision);
    assert(target && target->y == 1100);
    std::cout << "scroll-state: grown-content drag correction waits for matching layout and remains generation-safe\n";
}

int main() {
    // Valdi bounds, including Yoga padding, remain the sole content extent.
    // The native content does not collapse when virtualization removes views.
    ScrollGeometry geometry {320, 260, 320, 40 * 64, false};
    auto extent = geometry.contentExtent();
    assert(extent.x == 320 && extent.y == 2560);
    auto clamped = geometry.clamp({14, 3000});
    assert(clamped.x == 0 && clamped.y == 2300);
    clamped = geometry.clamp({0, -48}); // retain -48 separately as unclamped bounce
    assert(clamped.x == 0 && clamped.y == 0);
    geometry.contentHeight = 100;
    extent = geometry.contentExtent();
    assert(extent.y == 260 && geometry.clamp({0, 100}).y == 0);

    // Horizontal physical offsets are not mirrored again by native Scroll.
    // ViewNode supplies the resolved RTL offset and shifted child frames.
    geometry = {320, 260, 40 * 180, 240, true};
    extent = geometry.contentExtent();
    assert(extent.x == 7200 && extent.y == 260);
    clamped = geometry.clamp({7000, 10});
    assert(clamped.x == 6880 && clamped.y == 0);
    geometry.viewportWidth = 8000;
    assert(geometry.contentExtent().x == 8000 && geometry.clamp({100, 0}).x == 0);
    geometry = {0, 0, 0, 0, false};
    assert(geometry.clamp({1, 1}).y == 0);

    ScrollMotion motion;
    motion.reset({0, 64}, 1);
    motion.sample({0, 96}, 1.016);
    assert(std::abs(motion.velocity.y - 2000) < .1f && motion.velocity.x == 0);
    motion.release(-1500, false);
    assert(motion.velocity.y == 1500); // native gesture sign is not content-offset sign
    motion.sample({0, 72}, 1.032);
    motion.release(900, false);
    assert(motion.velocity.y == -900);
    motion.sample({0, 72}, 2); // no stale velocity after idle
    assert(motion.velocity.y == 0);
    motion.reset({120, 0}, 3);
    motion.sample({100, 0}, 3.02);
    motion.release(800, true);
    assert(motion.velocity.x == -800 && motion.velocity.y == 0);

    ScrollSequence sequence;
    auto animated = sequence.replace(true);
    assert(sequence.active && !sequence.dragging);
    assert(sequence.startDrag()); // user interrupts a programmatic animation
    assert(!sequence.current(animated));
    auto drag = sequence.generation;
    assert(!sequence.startDrag()); // duplicate native start must not notify twice
    assert(sequence.endDrag() && !sequence.endDrag());
    assert(sequence.active); // drag release is followed by momentum
    auto terminal = sequence.finish();
    assert(terminal.active && !terminal.dragging);
    // Reentrant cancellation consumes an already consumed terminal.
    auto nested = sequence.finish();
    assert(!nested.active && !nested.dragging);
    sequence.replace(); // inline JS ref jump supersedes a pending native override
    assert(!sequence.current(drag));
    assert(!sequence.active && !sequence.dragging);
    assert(sequence.startDrag());
    terminal = sequence.finish();
    assert(terminal.active && terminal.dragging);
    nested = sequence.finish();
    assert(!nested.active && !nested.dragging);
    std::cout << "scroll-state: geometry, axis bounds, virtual content, and reentry passed\n";
    geometrySyncDuringDrag();
    stalePostedCorrection();
    releaseThenCancelWhileLocked();
    releaseThenNewDragWhileLocked();
    commandsAndCallbackReentry();
    historicalEndDuringNewAnimation();
    dragCorrectionWaitsForLayout();
}
