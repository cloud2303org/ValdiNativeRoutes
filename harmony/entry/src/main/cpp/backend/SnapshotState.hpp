#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <utility>

namespace Valdi::Harmony::detail {

struct SnapshotBudget {
    static constexpr uint32_t maxDimension = 4096;
    static constexpr uint64_t maxPixels = 4 * 1024 * 1024;
    static constexpr size_t maxRawBytes = 16 * 1024 * 1024;
    static constexpr size_t maxPNGBytes = 16 * 1024 * 1024;
    static constexpr size_t maxRequests = 2;

    static bool dimensions(uint32_t width, uint32_t height) {
        return width && height && width <= maxDimension && height <= maxDimension &&
            uint64_t(width) * height <= maxPixels;
    }
    static bool layout(uint32_t width, uint32_t height, uint32_t stride, uint32_t allocation) {
        return dimensions(width, height) && stride >= uint64_t(width) * 4 &&
            uint64_t(stride) * height <= allocation && allocation <= maxRawBytes;
    }
};

// Shared by UI cancellation and a worker which owns no backend, ViewNode or
// dispatcher. A canceled queued job releases its resource and callback at once.
// An encoder already running retains only its local resource until it unwinds.
// Claim terminal state under the lock; run callbacks/destructors without it.
// This permits callback reentry and avoids worker -> UI -> gate deadlocks.
template<typename Resource, typename Result>
class SnapshotRequest {
public:
    using Completion = std::function<void(Result)>;
    explicit SnapshotRequest(Completion completion) : _completion(std::move(completion)) {}
    void setResource(std::shared_ptr<Resource> resource) {
        std::lock_guard<std::mutex> lock(_mutex);
        if (!_finished) _resource = std::move(resource);
    }
    std::shared_ptr<Resource> takeResource() {
        std::lock_guard<std::mutex> lock(_mutex);
        if (_finished) return {};
        return std::exchange(_resource, {});
    }
    bool finished() const {
        std::lock_guard<std::mutex> lock(_mutex);
        return _finished;
    }
    void complete(Result result) {
        Completion completion;
        std::shared_ptr<Resource> retired;
        {
            std::lock_guard<std::mutex> lock(_mutex);
            if (_finished) return;
            _finished = true;
            completion = std::move(_completion);
            retired = std::move(_resource);
        }
        retired.reset();
        if (completion) completion(std::move(result));
    }

private:
    mutable std::mutex _mutex;
    bool _finished = false;
    std::shared_ptr<Resource> _resource;
    Completion _completion;
};

} // namespace Valdi::Harmony::detail
