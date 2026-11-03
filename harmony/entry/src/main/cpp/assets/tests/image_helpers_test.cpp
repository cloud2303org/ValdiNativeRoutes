#include "../HarmonyImageDecodePolicy.hpp"
#include "../HarmonyImageRequest.hpp"

#include <atomic>
#include <cassert>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>

namespace {

void sizingAndMemoryBounds() {
    using namespace ValdiHarmony::ImageDecodePolicy;
    auto size = targetSize(640, 480, 0, 0);
    assert(size.width == 640 && size.height == 480);
    size = targetSize(640, 480, 160, 0);
    assert(size.width == 160 && size.height == 120);
    size = targetSize(640, 480, 0, 120);
    assert(size.width == 160 && size.height == 120);
    size = targetSize(640, 480, 200, 100);
    assert(size.width == 133 && size.height == 100);
    size = targetSize(640, 480, 1000, 1000);
    assert(size.width == 640 && size.height == 480);
    size = targetSize(8192, 1, 1, 1);
    assert(size.width == 1 && size.height == 1);
    size = targetSize(1, 8192, 1, 1);
    assert(size.width == 1 && size.height == 1);
    assert(!validPreferredSize(-1, 0));
    assert(!validPreferredSize(INT32_MAX, INT32_MAX));
    assert(validPreferredSize(0, 0));
    assert(validDimensions(4096, 4096));
    assert(!validDimensions(0, 480));
    assert(!validDimensions(UINT32_MAX, UINT32_MAX));
    assert(!validDimensions(8192, 8192));
    assert(validDecodedLayout(4096, 4096, 16384, 67108864));
    assert(validDecodedLayout(3, 4, 16, 64)); // stride padding
    assert(!validDecodedLayout(3, 4, 11, 64));
    assert(!validDecodedLayout(3, 4, 16, 63));
    assert(!validDecodedLayout(8192, 2048, UINT32_MAX, UINT32_MAX));
    assert(!validDecodedLayout(4096, 4096, 16388, 67125248));

    // Exercise integer fitting for thin images, rounding and unspecified axes.
    for (uint32_t w : {1U, 3U, 400U, 8192U}) {
        for (uint32_t h : {1U, 3U, 400U, 8192U}) {
            for (int32_t pw : {0, 1, 17, 8192}) {
                for (int32_t ph : {0, 1, 17, 8192}) {
                    size = targetSize(w, h, pw, ph);
                    assert(size.width >= 1 && size.height >= 1);
                    assert(size.width <= w && size.height <= h);
                    assert(pw == 0 || size.width <= uint32_t(pw));
                    assert(ph == 0 || size.height <= uint32_t(ph));
                }
            }
        }
    }
}

using Request = ValdiHarmony::HarmonyImageRequest<int>;

void synchronousAndDuplicateCompletion() {
    int deliveries = 0, cancels = 0;
    auto request = std::make_shared<Request>([&](const int& result) {
        assert(result == 42);
        ++deliveries;
    });
    assert(request->claimDownload());
    assert(!request->claimDownload());
    request->complete(42); // worker may also run inline
    request->installUpstreamCancel([&] { ++cancels; }); // downloadItem returns afterwards
    request->complete(7);
    request->cancel();
    assert(deliveries == 1 && cancels == 0);
}

void cancelBeforeHandleAndDuringQueuedDecode() {
    int deliveries = 0, cancels = 0;
    auto request = std::make_shared<Request>([&](const int&) { ++deliveries; });
    request->cancel(); // reentrant cancel while downloadItem is still on stack
    request->installUpstreamCancel([&] {
        ++cancels;
        assert(!request->claimDownload()); // upstream completion from cancel()
        request->complete(1);
    });
    request->cancel();
    assert(cancels == 1 && deliveries == 0);

    auto queued = std::make_shared<Request>([&](const int&) { ++deliveries; });
    assert(queued->claimDownload());
    queued->cancel();
    queued->complete(1); // decode returns late
    assert(queued->wasCanceled() && deliveries == 0);
}

void cancelBreaksDownloadCycle() {
    std::weak_ptr<Request> weak;
    int upstreamCancels = 0, deliveries = 0;
    {
        auto request = std::make_shared<Request>([&](const int&) { ++deliveries; });
        weak = request;
        // Models an upstream handle retaining its download callback and state.
        request->installUpstreamCancel([request, &upstreamCancels] {
            ++upstreamCancels;
            assert(!request->claimDownload());
        });
        request->cancel();
    }
    assert(weak.expired() && upstreamCancels == 1 && deliveries == 0);
    {
        auto request = std::make_shared<Request>([](const int&) {});
        weak = request;
        request->installUpstreamCancel([request] {});
        assert(request->claimDownload()); // also breaks the cycle on download success/error
        request->complete(1);
    }
    assert(weak.expired());

    // A callback uses this overload so retiring the handle cannot free its
    // borrowed input buffer or captured state before it has copied the bytes.
    auto marker = std::make_shared<int>(42);
    std::weak_ptr<int> weakMarker = marker;
    auto request = std::make_shared<Request>([](const int&) {});
    request->installUpstreamCancel([marker] {});
    marker.reset();
    std::function<void()> retired;
    assert(request->claimDownload(retired));
    request->cancel();
    assert(!weakMarker.expired());
    retired = nullptr;
    assert(weakMarker.expired());

    // Cancellation releases the completion's captured ownership immediately.
    marker = std::make_shared<int>(1);
    weakMarker = marker;
    auto pending = std::make_shared<Request>([marker](const int&) {});
    marker.reset();
    pending->cancel();
    assert(weakMarker.expired());
}

void callbackReentry() {
    int deliveries = 0;
    std::shared_ptr<Request> request;
    request = std::make_shared<Request>([&](const int&) {
        ++deliveries;
        request->cancel();
        request->complete(2);
        assert(!request->claimDownload());
    });
    request->complete(1);
    assert(deliveries == 1);
}

void cancelSynchronizesWithDelivery() {
    std::mutex mutex;
    std::condition_variable condition;
    bool callbackEntered = false, releaseCallback = false, cancelStarted = false;
    std::atomic_bool callbackEnded{false};
    auto request = std::make_shared<Request>([&](const int&) {
        std::unique_lock lock(mutex);
        callbackEntered = true;
        condition.notify_all();
        condition.wait(lock, [&] { return releaseCallback; });
        callbackEnded = true;
    });
    std::thread delivery([&] { request->complete(1); });
    {
        std::unique_lock lock(mutex);
        condition.wait(lock, [&] { return callbackEntered; });
    }
    std::thread cancel([&] {
        {
            std::lock_guard lock(mutex);
            cancelStarted = true;
            condition.notify_all();
        }
        request->cancel();
        assert(callbackEnded); // cancel must wait for an in-flight callback
    });
    {
        std::unique_lock lock(mutex);
        condition.wait(lock, [&] { return cancelStarted; });
        releaseCallback = true;
        condition.notify_all();
    }
    cancel.join();
    delivery.join();
}

void concurrentTerminalRaces() {
    for (int i = 0; i < 500; ++i) {
        std::atomic_int deliveries{0}, upstreamCancels{0};
        auto request = std::make_shared<Request>([&](const int&) { ++deliveries; });
        std::thread download([&] {
            if (request->claimDownload()) request->complete(1);
        });
        std::thread cancel([&] { request->cancel(); });
        std::thread install([&] { request->installUpstreamCancel([&] { ++upstreamCancels; }); });
        download.join();
        cancel.join();
        install.join();
        request->complete(2);
        assert(deliveries <= 1 && upstreamCancels <= 1);
        assert(request->wasCanceled() ? deliveries == 0 : deliveries == 1);
    }
}

} // namespace

int main() {
    sizingAndMemoryBounds();
    synchronousAndDuplicateCompletion();
    cancelBeforeHandleAndDuringQueuedDecode();
    cancelBreaksDownloadCycle();
    callbackReentry();
    cancelSynchronizesWithDelivery();
    concurrentTerminalRaces();
    std::cout << "Harmony image policy and request lifecycle: 7 groups passed\n";
}
