#pragma once

#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <thread>

namespace Valdi::Harmony::detail {

// A cancelable native monotonic deadline for delayed raw touch observation.
// It does not recognize gestures. ArkUI recognizers own all gesture timing.
// The callback may only enqueue UI work. Destruction cancels and joins without
// waiting for UI or calling any Valdi/ArkUI API from the timer thread.
class NativeDeadline {
public:
    NativeDeadline(double seconds, std::function<void()> enqueue)
        : _thread([this, seconds, enqueue = std::move(enqueue)] {
              std::unique_lock lock(_mutex);
              if (_condition.wait_for(lock, std::chrono::duration<double>(seconds), [this] { return _cancelled; })) return;
              lock.unlock();
              enqueue();
          }) {}
    ~NativeDeadline() {
        {
            std::lock_guard lock(_mutex);
            _cancelled = true;
        }
        _condition.notify_one();
        _thread.join();
    }
    NativeDeadline(const NativeDeadline&) = delete;
    NativeDeadline& operator=(const NativeDeadline&) = delete;
private:
    std::mutex _mutex;
    std::condition_variable _condition;
    bool _cancelled = false;
    std::thread _thread;
};
} // namespace Valdi::Harmony::detail
