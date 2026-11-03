#include "HarmonyMainThreadDispatcher.hpp"

#include <hilog/log.h>

#include <condition_variable>
#include <deque>
#include <exception>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>

namespace ValdiHarmony {

void logNativeError(const char* message) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, 0xFF00, "ValdiHarmony", "%{public}s", message);
}

struct HarmonyMainThreadDispatcher::State {
    struct Task {
        explicit Task(Valdi::DispatchFunction* callable) : function(callable) {}
        std::unique_ptr<Valdi::DispatchFunction> function;
        std::mutex mutex;
        std::condition_variable condition;
        std::exception_ptr error;
        bool done = false;

        void finish(bool execute) {
            try {
                if (execute) {
                    (*function)();
                }
            } catch (const std::exception& error) {
                this->error = std::current_exception();
                logNativeError(error.what());
            } catch (...) {
                error = std::current_exception();
                logNativeError("Unknown exception in Valdi UI dispatch");
            }
            function.reset();
            {
                std::lock_guard lock(mutex);
                done = true;
            }
            condition.notify_all();
        }
    };

    uv_async_t async{};
    const std::thread::id uiThread = std::this_thread::get_id();
    std::mutex mutex;
    std::deque<std::shared_ptr<Task>> tasks;
    bool closed = false;
    std::function<void()> onClose;

    void drain() {
        // Snapshot the queue so a re-enqueued idle callback yields to libuv.
        std::deque<std::shared_ptr<Task>> pending;
        {
            std::lock_guard lock(mutex);
            pending.swap(tasks);
        }
        for (const auto& task : pending) {
            task->finish(true);
        }
    }
};

HarmonyMainThreadDispatcher::HarmonyMainThreadDispatcher(uv_loop_t* loop) : _state(std::make_shared<State>()) {
    auto* holder = new std::shared_ptr<State>(_state);
    _state->async.data = holder;
    const auto status = uv_async_init(loop, &_state->async, [](uv_async_t* async) {
        auto state = *static_cast<std::shared_ptr<State>*>(async->data);
        state->drain();
    });
    if (status != 0) {
        delete holder;
        throw std::runtime_error(std::string("uv_async_init: ") + uv_strerror(status));
    }
    uv_unref(reinterpret_cast<uv_handle_t*>(&_state->async));
}

HarmonyMainThreadDispatcher::~HarmonyMainThreadDispatcher() = default;

bool HarmonyMainThreadDispatcher::isUIThread() const {
    return std::this_thread::get_id() == _state->uiThread;
}

void HarmonyMainThreadDispatcher::dispatch(Valdi::DispatchFunction* function, bool sync) {
    auto task = std::make_shared<State::Task>(function);
    if (sync && isUIThread()) {
        task->finish(true);
        if (task->error) {
            std::rethrow_exception(task->error);
        }
        return;
    }
    bool queued = false;
    {
        std::lock_guard lock(_state->mutex);
        if (_state->closed) {
            // No producer should survive runtime teardown. Never strand a sync waiter.
            logNativeError("Dispatch requested after Harmony UI dispatcher closed");
        } else {
            _state->tasks.emplace_back(task);
            const auto status = uv_async_send(&_state->async);
            if (status != 0) {
                _state->tasks.pop_back();
                logNativeError(uv_strerror(status));
            } else {
                queued = true;
            }
        }
    }
    if (!queued) {
        task->finish(false);
        if (sync) {
            throw std::runtime_error("Harmony UI dispatch queue is closed");
        }
        return;
    }
    if (sync) {
        std::unique_lock lock(task->mutex);
        task->condition.wait(lock, [&task] { return task->done; });
        if (task->error) {
            std::rethrow_exception(task->error);
        }
    }
}

void HarmonyMainThreadDispatcher::drain() {
    if (!isUIThread()) {
        throw std::runtime_error("UI dispatcher drain called off UI thread");
    }
    _state->drain();
}

void HarmonyMainThreadDispatcher::keepAlive(bool enabled) {
    if (!isUIThread()) {
        throw std::runtime_error("UI dispatcher keepAlive called off UI thread");
    }
    auto* handle = reinterpret_cast<uv_handle_t*>(&_state->async);
    if (enabled) {
        uv_ref(handle);
    } else {
        uv_unref(handle);
    }
}

void HarmonyMainThreadDispatcher::close(std::function<void()> completion) {
    if (!isUIThread()) {
        throw std::runtime_error("UI dispatcher close called off UI thread");
    }
    drain();
    std::deque<std::shared_ptr<State::Task>> remaining;
    {
        std::lock_guard lock(_state->mutex);
        _state->closed = true;
        remaining.swap(_state->tasks);
    }
    for (const auto& task : remaining) {
        task->finish(false);
    }
    _state->onClose = std::move(completion);
    uv_close(reinterpret_cast<uv_handle_t*>(&_state->async), [](uv_handle_t* handle) {
        auto* holder = static_cast<std::shared_ptr<State>*>(handle->data);
        auto callback = std::move((*holder)->onClose);
        delete holder;
        if (callback) {
            callback();
        }
    });
}

} // namespace ValdiHarmony
