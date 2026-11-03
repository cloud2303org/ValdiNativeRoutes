#include "../SnapshotState.hpp"
#include "../ScrollState.hpp"

#include <atomic>
#include <barrier>
#include <cassert>
#include <iostream>
#include <thread>
#include <vector>

using namespace Valdi::Harmony::detail;

struct Pixels {
    std::atomic<int>& destroyed;
    explicit Pixels(std::atomic<int>& count) : destroyed(count) {}
    ~Pixels() { ++destroyed; }
};
using Job = SnapshotRequest<Pixels, int>;

int main() {
    assert(SnapshotBudget::dimensions(2048, 2048));
    assert(SnapshotBudget::dimensions(4096, 1024));
    assert(!SnapshotBudget::dimensions(4096, 1025));
    assert(!SnapshotBudget::dimensions(0, 1));
    assert(!SnapshotBudget::dimensions(UINT32_MAX, UINT32_MAX));
    assert(SnapshotBudget::layout(2048, 2048, 8192, 16 * 1024 * 1024));
    assert(!SnapshotBudget::layout(2048, 2048, 8191, 16 * 1024 * 1024));
    assert(!SnapshotBudget::layout(2048, 2048, 8192, 16 * 1024 * 1024 - 1));
    assert(!SnapshotBudget::layout(1, 1, UINT32_MAX, UINT32_MAX));

    // Shutdown before an accepted queue runs: release pixels and runtime
    // callback captures immediately, without needing a worker/UI round trip.
    std::atomic<int> destroyed {0};
    auto runtime = std::make_shared<int>(7);
    std::weak_ptr<int> weakRuntime = runtime;
    int calls = 0;
    auto queued = std::make_shared<Job>([runtime, &calls](int result) {
        assert(result == -1 && *runtime == 7);
        ++calls;
    });
    runtime.reset();
    queued->setResource(std::make_shared<Pixels>(destroyed));
    queued->complete(-1);
    assert(calls == 1 && destroyed == 1 && weakRuntime.expired());
    assert(!queued->takeResource());
    queued->complete(1);
    assert(calls == 1);

    // An already running encoder alone retains pixels; cancellation completes
    // while that worker remains blocked, and success cannot publish afterward.
    std::barrier started(2), release(2);
    auto encoding = std::make_shared<Job>([&](int result) { assert(result == -2); ++calls; });
    encoding->setResource(std::make_shared<Pixels>(destroyed));
    std::thread worker([&] {
        auto pixels = encoding->takeResource();
        assert(pixels);
        started.arrive_and_wait();
        release.arrive_and_wait();
        encoding->complete(1);
    });
    started.arrive_and_wait();
    encoding->complete(-2);
    assert(calls == 2 && destroyed == 1);
    release.arrive_and_wait();
    worker.join();
    assert(calls == 2 && destroyed == 2);

    // Completion may cancel/release its own request or wait for another
    // thread entering the same terminal gate; no lock is held during callbacks.
    std::shared_ptr<Job> reentrant;
    reentrant = std::make_shared<Job>([&](int result) {
        assert(result == 42);
        std::thread duplicate([self = reentrant] { self->complete(-3); });
        duplicate.join();
        reentrant.reset();
        ++calls;
    });
    auto retained = reentrant;
    retained->complete(42);
    assert(!reentrant && calls == 3);

    // Race successful encoding against shutdown. Exactly one result/callback,
    // and exactly one resource destruction, independent of the winner.
    for (int iteration = 0; iteration < 100; ++iteration) {
        std::atomic<int> terminals {0};
        auto job = std::make_shared<Job>([&](int result) {
            assert(result == 1 || result == -1);
            ++terminals;
        });
        job->setResource(std::make_shared<Pixels>(destroyed));
        std::barrier race(3);
        std::thread success([&] { race.arrive_and_wait(); job->complete(1); });
        std::thread shutdown([&] { race.arrive_and_wait(); job->complete(-1); });
        race.arrive_and_wait();
        success.join();
        shutdown.join();
        assert(terminals == 1 && job->finished());
    }
    assert(destroyed == 102);

    // Actual production touch-stop predicate and durable scroll journal.
    ScrollState<ScrollPoint> scroll;
    const ScrollState<ScrollPoint>::Sample sample {{0, 18}, {0, 19}, {0, 300}};
    assert(!scroll.stopOnDown(true));
    scroll.replace(true);
    assert(!scroll.stopOnDown(false) && scroll.stopOnDown(true));
    scroll.beginDrag(sample);
    assert(!scroll.stopOnDown(true)); // never cancel an admitted child drag
    scroll.release(sample);
    assert(scroll.stopOnDown(true));
    auto oldGeneration = scroll.generation;
    scroll.cancel(sample);
    assert(!scroll.stopOnDown(true));
    std::vector<ScrollNoticeType> notices;
    while (auto notice = scroll.nextNotice()) notices.push_back(notice->type);
    assert((notices == std::vector<ScrollNoticeType>{
        ScrollNoticeType::End, ScrollNoticeType::StartDrag, ScrollNoticeType::EndDrag, ScrollNoticeType::End}));
    assert(!scroll.current(oldGeneration)); // queued release correction is obsolete
    assert(scroll.stopOnDown(true, true)); // not-yet-laid-out animated request
    assert(!scroll.stopOnDown(false, true));
    std::cout << "snapshot bounds, queued/running cancellation, callback reentry/races; touch-stop journal passed\n";
}
