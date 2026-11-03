#include "HarmonyDevelopmentHostLease.hpp"
#include "HarmonyHostLifecycle.hpp"

#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

using ValdiHarmony::HarmonyDevelopmentHostLease;
using ValdiHarmony::takeHostForDestruction;

// Compiled separately to verify the header's authority is shared across TUs.
bool peerCanAdmit();

static void require(bool value, const char* message) {
    if (!value) {
        std::fprintf(stderr, "FAIL: %s\n", message);
        std::exit(1);
    }
}

static void requireHeld([[maybe_unused]] const char* phase) {
#if VALDI_HARMONY_FULL_DEVELOPMENT
    require(!peerCanAdmit(), phase);
#else
    require(peerCanAdmit(), "Lean must not acquire development admission");
#endif
}

static_assert(!std::is_copy_constructible_v<HarmonyDevelopmentHostLease>);
static_assert(!std::is_copy_assignable_v<HarmonyDevelopmentHostLease>);
static_assert(!std::is_move_constructible_v<HarmonyDevelopmentHostLease>);
static_assert(!std::is_move_assignable_v<HarmonyDevelopmentHostLease>);
static_assert(std::is_nothrow_destructible_v<HarmonyDevelopmentHostLease>);

enum class Failure { None, FirstMember, LastMember, ConstructorBody };

struct Resource {
    std::vector<std::string>* events;
    const char* name;

    Resource(std::vector<std::string>* events, const char* name, bool fail, bool reenter)
        : events(events), name(name) {
        if (events) events->push_back(std::string("construct-") + name);
        if (reenter) requireHeld("Reentrant construction admitted another host");
        if (fail) throw std::runtime_error("resource construction failed");
    }

    ~Resource() {
        requireHeld("Admission released before a later member destructor");
        if (events) events->push_back(name);
    }
};

// Reduced lifetime harness, not a fake Valdi runtime. The first private member
// is copied verbatim by the runner from the actual production host header.
// Resource probes observe C++ construction/destruction ordering around it.
class HostOwner {
private:
#include "host-admission-member.inc"
    std::vector<std::string>* _events;
    Resource _first;
    Resource _last;

public:
    explicit HostOwner(Failure failure = Failure::None,
                       std::vector<std::string>* events = nullptr,
                       bool reenter = false)
        : _events(events),
          _first(events, "first", failure == Failure::FirstMember, reenter),
          _last(events, "last", failure == Failure::LastMember, reenter) {
        if (reenter) requireHeld("Reentrant constructor body admitted another host");
        if (failure == Failure::ConstructorBody) throw std::runtime_error("constructor body failed");
    }

    ~HostOwner() {
        requireHeld("Admission released before the owner destructor body");
        if (_events) _events->push_back("owner-body");
    }
};

#if VALDI_HARMONY_FULL_DEVELOPMENT
static void rejectAnotherOwner(std::vector<std::string>* events = nullptr) {
    try {
        HostOwner other(Failure::None, events);
        require(false, "second full-development live host was admitted");
    } catch (const std::runtime_error& error) {
        require(std::string(error.what()).find("only one live or destroying runtime host") != std::string::npos,
                "Rejected construction threw an unrelated error");
    }
}
#endif

static void testLiveAndPaused() {
    auto owner = std::make_unique<HostOwner>();
#if VALDI_HARMONY_FULL_DEVELOPMENT
    std::vector<std::string> rejectedEvents;
    rejectAnotherOwner(&rejectedEvents);
    require(rejectedEvents.empty(), "Rejected host constructed resources before admission");
    requireHeld("Rejected constructor released the incumbent admission");
    // Pause/resume cannot change admission: source integration checks also
    // require actual lifecycle methods never to reference/reset the member.
    requireHeld("Paused owner allowed a competing debugger owner");
    requireHeld("Resumed owner allowed a competing debugger owner");
#else
    std::vector<std::unique_ptr<HostOwner>> otherOwners;
    for (int i = 1; i < 16; ++i) otherOwners.push_back(std::make_unique<HostOwner>());
    require(otherOwners.size() == 15, "Lean could not retain sixteen owners");
#endif
    owner.reset();
    require(peerCanAdmit(), "Final owner destruction did not release admission");
}

static void testDestroyingAndMountFailure() {
    for (bool mountFailed : {false, true}) {
        std::map<unsigned, std::unique_ptr<HostOwner>> hosts;
        hosts.emplace(1, std::make_unique<HostOwner>());
        if (mountFailed) {
            try { throw std::runtime_error("mount failed after host insertion"); }
            catch (const std::runtime_error&) {
                requireHeld("Mount failure released admission while owner remained registered");
            }
        }
        // This is the actual NAPI ownership-transfer helper. Empty public
        // admission does not mean the asynchronous destroying owner is gone.
        auto destroying = takeHostForDestruction(hosts, 1u);
        require(hosts.empty(), "Public ownership did not transfer to destroying owner");
        requireHeld("UI unmount allowed a second host while old owner was destroying");
        std::thread worker([&] {
            requireHeld("Worker fullTeardown allowed a second host");
        });
        worker.join();
        requireHeld("UI release allowed a second host before final owner destruction");
        destroying.reset();
        require(peerCanAdmit(), "Destroyed owner still blocks later admission");
        HostOwner replacement;
        requireHeld("Replacement did not acquire its own admission");
    }
}

static void testConstructionFailureAndOrder() {
    for (auto failure : {Failure::FirstMember, Failure::LastMember, Failure::ConstructorBody}) {
        bool threw = false;
        try { HostOwner failing(failure, nullptr, true); }
        catch (const std::runtime_error&) { threw = true; }
        require(threw, "Injected construction failure did not execute");
        require(peerCanAdmit(), "Partial construction leaked development admission");
        HostOwner replacement;
        requireHeld("Replacement after construction failure lost admission");
    }
    std::vector<std::string> events;
    auto owner = std::make_unique<HostOwner>(Failure::None, &events, true);
    events.clear();
    owner.reset();
    require(events == std::vector<std::string>({"owner-body", "last", "first"}),
            "Owner/member destruction order changed");
    require(peerCanAdmit(), "Lease was not the last owner resource released");
}

static void testConcurrentAdmission() {
    std::mutex mutex;
    std::condition_variable condition;
    bool start = false;
    bool release = false;
    int reports = 0;
    int admitted = 0;
    int rejected = 0;
    auto contender = [&] {
        {
            std::unique_lock lock(mutex);
            condition.wait(lock, [&] { return start; });
        }
        try {
            HostOwner owner;
            std::unique_lock lock(mutex);
            ++admitted;
            ++reports;
            condition.notify_all();
            condition.wait(lock, [&] { return release; });
        } catch (const std::runtime_error& error) {
            require(std::string(error.what()).find("only one live or destroying runtime host") != std::string::npos,
                    "Concurrent admission failed for an unrelated reason");
            std::lock_guard lock(mutex);
            ++rejected;
            ++reports;
            condition.notify_all();
        }
    };
    std::thread first(contender);
    std::thread second(contender);
    {
        std::unique_lock lock(mutex);
        start = true;
        condition.notify_all();
        condition.wait(lock, [&] { return reports == 2; });
#if VALDI_HARMONY_FULL_DEVELOPMENT
        require(admitted == 1 && rejected == 1, "Concurrent full hosts both acquired admission");
#else
        require(admitted == 2 && rejected == 0, "Concurrent lean hosts were restricted");
#endif
        release = true;
        condition.notify_all();
    }
    first.join();
    second.join();
    require(peerCanAdmit(), "Concurrent test leaked admission");
}

int main() {
    testLiveAndPaused();
    testDestroyingAndMountFailure();
    testConstructionFailureAndOrder();
    testConcurrentAdmission();
    std::puts("PASS production admission lifetime: live/paused, destroying/mount-failure, constructor rollback/order, concurrent/cross-TU");
}
