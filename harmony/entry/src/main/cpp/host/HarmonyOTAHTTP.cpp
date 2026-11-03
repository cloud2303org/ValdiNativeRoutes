#include "HarmonyOTA.hpp"

#include "valdi_core/Cancelable.hpp"
#include "valdi_core/HTTPRequest.hpp"
#include "valdi_core/HTTPRequestManager.hpp"
#include "valdi_core/HTTPRequestManagerCompletion.hpp"
#include "valdi_core/HTTPResponse.hpp"

#include <condition_variable>
#include <mutex>
#include <stdexcept>

namespace ValdiHarmony {
namespace {
struct Completion final : snap::valdi_core::HTTPRequestManagerCompletion {
    explicit Completion(size_t maximum) : limit(maximum) {}
    std::mutex mutex;
    std::condition_variable cv;
    size_t limit;
    bool done = false;
    OTABytes bytes;
    std::string error;
    void onComplete(const snap::valdi_core::HTTPResponse& response) override {
        std::lock_guard guard(mutex);
        if (done) return;
        if (response.statusCode != 200) error = "OTA HTTP status " + std::to_string(response.statusCode);
        else if (response.body && response.body->size() > limit) error = "OTA HTTP body exceeds size limit";
        else if (response.body && response.body->size())
            bytes.assign(response.body->data(), response.body->data() + response.body->size());
        done = true;
        cv.notify_all();
    }
    void onFail(const std::string&) override {
        std::lock_guard guard(mutex);
        if (done) return;
        // Native diagnostics may include credential-bearing URLs; do not propagate them.
        error = "OTA HTTP transport failed";
        done = true;
        cv.notify_all();
    }
};
class NativeTransport final : public HarmonyOTATransport {
public:
    NativeTransport(std::shared_ptr<snap::valdi_core::HTTPRequestManager> manager,
                    std::chrono::milliseconds deadline) : manager(std::move(manager)), deadline(deadline) {
        if (!this->manager || deadline.count() <= 0) throw std::invalid_argument("Invalid OTA HTTP manager/deadline");
    }
    OTABytes get(const std::string& url, size_t limit, const std::atomic<bool>& cancelled) override {
        if (cancelled) throw std::runtime_error("OTA cancelled");
        const auto until = std::chrono::steady_clock::now() + deadline;
        auto completion = std::make_shared<Completion>(limit);
        snap::valdi_core::HTTPRequest request(Valdi::StringBox::fromString(url),
            Valdi::StringBox::fromCString("GET"), Valdi::Value(), std::nullopt, 0);
        std::shared_ptr<snap::valdi_core::Cancelable> handle;
        try { handle = manager->performRequest(request, completion); }
        catch (...) { throw std::runtime_error("OTA HTTP request failed"); }
        std::unique_lock guard(completion->mutex);
        while (!completion->done && !cancelled && std::chrono::steady_clock::now() < until)
            completion->cv.wait_until(guard, std::min(until, std::chrono::steady_clock::now() + std::chrono::milliseconds(20)));
        const bool timedOut = !completion->done;
        if (cancelled || timedOut) {
            completion->done = true; // Native late callbacks retain their own completion safely.
            guard.unlock();
            if (handle) { try { handle->cancel(); } catch (...) {} }
            throw std::runtime_error(cancelled ? "OTA cancelled" : "OTA HTTP deadline exceeded");
        }
        if (!completion->error.empty()) throw std::runtime_error(completion->error);
        return std::move(completion->bytes);
    }
private:
    std::shared_ptr<snap::valdi_core::HTTPRequestManager> manager;
    std::chrono::milliseconds deadline;
};
}
std::shared_ptr<HarmonyOTATransport> makeHarmonyOTATransport(
    std::shared_ptr<snap::valdi_core::HTTPRequestManager> manager, std::chrono::milliseconds deadline) {
    return std::make_shared<NativeTransport>(std::move(manager), deadline);
}
} // namespace ValdiHarmony
