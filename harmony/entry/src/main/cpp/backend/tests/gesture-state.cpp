#include "../GestureState.hpp"
#include "../NativeDeadline.hpp"

#include <atomic>
#include <cassert>
#include <future>
#include <iostream>
#include <functional>

using namespace Valdi::Harmony::detail;

static void sequences() {
    GestureSequence drag;
    // Rejecting a predicate/canceling a pending recognizer produces no JS
    // terminal. Accepted sequences produce exactly one 0/.../2 sequence.
    assert(!drag.consume(GestureAction::Cancel));
    assert(!drag.consume(GestureAction::End));
    assert(!drag.consume(GestureAction::Update));
    assert(drag.consume(GestureAction::Accept) == 0);
    assert(!drag.consume(GestureAction::Accept));
    assert(drag.consume(GestureAction::Update) == 1);
    assert(drag.consume(GestureAction::Update) == 1);
    assert(drag.consume(GestureAction::Cancel) == 2);
    assert(!drag.active);
    assert(!drag.consume(GestureAction::Cancel));
    assert(!drag.consume(GestureAction::End));
    assert(!drag.consume(GestureAction::Update));
    // A later native sequence is independent from the canceled sequence.
    assert(drag.consume(GestureAction::Accept) == 0);
    assert(drag.consume(GestureAction::End) == 2);
    assert(!drag.consume(GestureAction::Cancel));

    for (auto kind : {GestureKind::Tap, GestureKind::DoubleTap}) {
        GestureSequence tap;
        (void)kind;
        assert(!tap.consume(GestureAction::Cancel, true));
        assert(tap.consume(GestureAction::Accept, true) == 2);
        assert(!tap.active);
        assert(!tap.consume(GestureAction::End, true)); // no double delivery
        assert(!tap.consume(GestureAction::Update, true));
    }
    // Native arbitration may accept all three continuous recognizers. Each
    // tracks its own terminal and cancellation rather than sharing a flag.
    std::array<GestureSequence, 3> continuous;
    for (auto& sequence : continuous) assert(sequence.consume(GestureAction::Accept) == 0);
    assert(continuous[0].consume(GestureAction::End) == 2);
    assert(continuous[1].consume(GestureAction::Update) == 1);
    assert(continuous[2].consume(GestureAction::Cancel) == 2);
    assert(continuous[1].consume(GestureAction::Cancel) == 2);
    for (const auto& sequence : continuous) assert(!sequence.active);
}

static void geometry() {
    constexpr double epsilon = 1e-8;
    auto local = logicalPoint({25, 40}, 100, true);
    assert(local.x == 75 && local.y == 40);
    auto ltr = logicalPoint({25, 40}, 100, false);
    assert(ltr.x == 25 && ltr.y == 40);
    auto absolute = addLogicalFrame(local, 20, 30, 100, 400, true);
    assert(absolute.x == 355 && absolute.y == 70);
    absolute = addLogicalFrame(absolute, 10, 15, 400, 500, false);
    assert(absolute.x == 365 && absolute.y == 85);
    // Logical layout coordinates deliberately do not add a native window
    // origin or the node's presentation translation/rotation.
    assert(logicalDelta(12, true) == -12);
    assert(logicalDelta(-4, false) == -4);
    assert(std::abs(rotationRadians(180, false) - 3.14159265358979323846) < epsilon);
    assert(std::abs(rotationRadians(90, true) + 3.14159265358979323846 / 2) < epsilon);
    assert(std::abs(rotationRadians(-45, true) - 3.14159265358979323846 / 4) < epsilon);

    std::array<std::optional<double>, 5> attributes {};
    assert(TouchInsets::resolve(attributes).empty());
    attributes[0] = 8;
    attributes[1] = 20;
    attributes[2] = 0; // explicit zero overrides shorthand
    attributes[4] = -2; // negative values shrink the area
    auto insets = TouchInsets::resolve(attributes);
    assert(insets.left == 20 && insets.right == 0 && insets.top == 8 && insets.bottom == -2);
    attributes[0].reset();
    insets = TouchInsets::resolve(attributes);
    assert(insets.left == 20 && insets.right == 0 && insets.top == 0 && insets.bottom == -2);
    attributes[1].reset();
    attributes[4].reset();
    assert(TouchInsets::resolve(attributes).empty());

    // Real SDK admission regression: the scalar location was (0,0), but the
    // indexed pointer had the actual tap/root-PAN admission location.
    auto candidate = pointerCentroid(1, {0, 0}, [](uint32_t) { return GesturePoint {166.857, 94.571}; });
    assert(std::abs(candidate.x - 166.857) < epsilon && std::abs(candidate.y - 94.571) < epsilon);
    auto multi = pointerCentroid(2, {0, 0}, [](uint32_t i) {
        return i == 0 ? GesturePoint {100, 20} : GesturePoint {180, 60};
    });
    assert(multi.x == 140 && multi.y == 40);
    auto empty = pointerCentroid(0, {12, 34}, [](uint32_t) { assert(false); return GesturePoint {}; });
    assert(empty.x == 12 && empty.y == 34);
}

static void retainedRegistry() {
    struct Node : std::enable_shared_from_this<Node> {
        int& destroyed;
        explicit Node(int& counter) : destroyed(counter) {}
        ~Node() { ++destroyed; }
    };
    int destroyed = 0;
    auto first = std::make_shared<Node>(destroyed);
    auto sibling = std::make_shared<Node>(destroyed);
    std::vector<Node*> registry {first.get(), sibling.get()};
    auto snapshot = retainRegistry(registry);
    // A synchronous handler removes itself and a later sibling. The iteration
    // still owns both nodes until it has finished all cancellation callbacks.
    first.reset();
    sibling.reset();
    registry.clear();
    assert(destroyed == 0 && snapshot.size() == 2);
    snapshot.clear();
    assert(destroyed == 2);
}

static void rawTerminalReentry() {
    using Actions = std::array<std::function<void()>, 3>;
    for (bool delayedStart : {false, true}) {
        bool active = !delayedStart, pending = delayedStart;
        uint64_t generation = 1;
        int allEnded = 0, touchEnded = 0, nestedTerminals = 0;
        Actions actions;
        auto nestedCancel = [&] {
            auto nested = consumeTouchTerminal(active, pending, generation, actions, 2);
            if (nested.valid) ++nestedTerminals;
        };
        actions[0] = [&] {
            ++allEnded;
            // onTouch(Ended) disables target. Native cancellation must neither
            // steal the captured onTouchEnd nor produce a duplicate terminal.
            nestedCancel();
        };
        actions[2] = [&] {
            ++touchEnded;
            // Delay changes inside Start also take this terminal path. Its End
            // callback can remove/disable the target reentrantly.
            nestedCancel();
        };
        auto terminal = consumeTouchTerminal(active, pending, generation, actions, 2);
        assert(terminal.valid && !active && !pending && generation == 2);
        assert(!actions[0] && !actions[2]);
        terminal.actions[0]();
        terminal.actions[2]();
        assert(allEnded == 1 && touchEnded == 1 && nestedTerminals == 0);
        assert(generation == 4); // both nested cancels are consumed and inert
    }
}

static void nativeDeadlines() {
    std::atomic<int> callbacks {0};
    // A long pending deadline must cancel immediately on teardown; destruction
    // never waits for the requested timeout and never invokes its work.
    auto before = std::chrono::steady_clock::now();
    {
        NativeDeadline pending(86400, [&] { ++callbacks; });
    }
    assert(callbacks == 0);
    assert(std::chrono::steady_clock::now() - before < std::chrono::seconds(1));
    std::promise<void> fired;
    auto result = fired.get_future();
    {
        NativeDeadline immediate(0, [&] {
            ++callbacks;
            fired.set_value();
        });
        assert(result.wait_for(std::chrono::seconds(2)) == std::future_status::ready);
    }
    assert(callbacks == 1);
}

int main() {
    sequences();
    geometry();
    retainedRegistry();
    rawTerminalReentry();
    nativeDeadlines();
    std::cout << "Gesture production state: accepted/pending/canceled sequences, "
                 "tap terminal deduplication, parallel state independence, "
                 "RTL coordinates/deltas/radians, inset precedence, "
                 "indexed centroids, retained sibling lifetime, raw terminal "
                 "reentry, native deadline fire/cancel passed\n";
}
