#pragma once

#include <functional>
#include <mutex>
#include <utility>

namespace ValdiHarmony {

// Shared by the returned cancelable, downloader callback and queued decode.
// Kept independent of SDK/Valdi types so the production synchronization can be
// exercised on the host. User/upstream callbacks never run under a nonrecursive lock.
template<typename Result>
class HarmonyImageRequest final {
public:
    using Completion = std::function<void(const Result&)>;
    explicit HarmonyImageRequest(Completion completion) : _completion(std::move(completion)) {}

    bool wasCanceled() const {
        std::lock_guard<std::recursive_mutex> lock(_mutex);
        return _stage == Stage::Canceled;
    }

    // At most one downloader callback may enqueue a decode, even for a broken
    // downloader that calls its completion twice.
    bool claimDownload() {
        std::function<void()> retired;
        return claimDownload(retired);
    }

    // The downloader callback keeps its upstream handle alive on its stack until
    // it has copied borrowed bytes and finished using callback captures.
    bool claimDownload(std::function<void()>& retired) {
        std::lock_guard<std::recursive_mutex> lock(_mutex);
        if (_stage != Stage::Downloading) return false;
        _stage = Stage::Queued;
        retired.swap(_upstreamCancel);
        return true;
    }

    void installUpstreamCancel(std::function<void()> cancel) {
        bool cancelNow = false;
        {
            std::lock_guard<std::recursive_mutex> lock(_mutex);
            if (_stage == Stage::Downloading) {
                _upstreamCancel = std::move(cancel);
            } else {
                // A synchronous callback may already have queued or completed
                // decoding. Never overwrite that state or retain a stale handle.
                cancelNow = _stage == Stage::Canceled;
            }
        }
        if (cancelNow && cancel) cancel();
    }

    void cancel() {
        std::function<void()> upstream;
        Completion retired;
        {
            std::lock_guard<std::recursive_mutex> lock(_mutex);
            if (_stage == Stage::Canceled || _stage == Stage::Finished) return;
            _stage = Stage::Canceled;
            upstream.swap(_upstreamCancel);
            retired.swap(_completion);
        }
        // A downloader is allowed to invoke its completion from cancel(), or
        // wait for a callback on another thread. Do not hold our gate here.
        if (upstream) upstream();
    }

    void complete(const Result& result) {
        Completion completion;
        std::function<void()> retired;
        std::lock_guard<std::recursive_mutex> lock(_mutex);
        if (_stage == Stage::Canceled || _stage == Stage::Finished) return;
        _stage = Stage::Finished;
        completion.swap(_completion);
        retired.swap(_upstreamCancel);
        // Serialize delivery against cancel(). Recursive acquisition lets the
        // callback cancel its own request without deadlocking. Other threads'
        // cancel() calls wait until delivery has finished.
        if (completion) completion(result);
    }

private:
    enum class Stage { Downloading, Queued, Finished, Canceled };
    mutable std::recursive_mutex _mutex;
    Stage _stage = Stage::Downloading;
    Completion _completion;
    std::function<void()> _upstreamCancel;
};

} // namespace ValdiHarmony
