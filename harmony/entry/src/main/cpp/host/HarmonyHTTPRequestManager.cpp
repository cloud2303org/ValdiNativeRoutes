#include "HarmonyHTTPRequestManager.hpp"

#include "valdi_core/Cancelable.hpp"
#include "valdi_core/HTTPRequest.hpp"
#include "valdi_core/HTTPRequestManagerCompletion.hpp"
#include "valdi_core/HTTPResponse.hpp"
#include "valdi_core/cpp/Utils/Bytes.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"

#include <RemoteCommunicationKit/rcp.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <condition_variable>
#include <limits>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace ValdiHarmony {
namespace {

constexpr size_t kMaximumBodyBytes = 256ULL * 1024 * 1024;

struct Wake {
    std::mutex mutex;
    std::condition_variable condition;
    uint64_t revision = 0;
    std::atomic<bool> stopping{false};

    void notify() {
        {
            std::lock_guard lock(mutex);
            ++revision;
        }
        condition.notify_one();
    }
};

struct Task final : snap::valdi_core::Cancelable, std::enable_shared_from_this<Task> {
    explicit Task(std::shared_ptr<Wake> wake,
                  std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion> completion)
        : wake(std::move(wake)), completion(std::move(completion)) {}

    void cancel() override {
        {
            // Recursive because a completion may cancel itself or shut down its manager.
            std::lock_guard lock(deliveryMutex);
            if (canceled.exchange(true)) {
                return;
            }
            completion.reset();
        }
        wake->notify();
    }

    std::shared_ptr<Wake> wake;
    std::recursive_mutex deliveryMutex;
    std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion> completion;
    std::atomic<bool> canceled{false};

    // All native calls and the response callback share this gate. Fetch/Cancel may
    // call back inline; a callback never invokes Valdi or destroys its request.
    std::recursive_mutex nativeMutex;
    std::string url;
    std::string method;
    std::vector<std::pair<std::string, std::string>> headers;
    std::vector<char> upload;
    bool hasContent = false;
    Rcp_RequestContent content{};
    Rcp_Configuration configuration{};
    Rcp_ResponseCallbackObject callback{};
    Rcp_Request* native = nullptr;
    Rcp_Headers* nativeHeaders = nullptr;
    // Preserve any defaults allocated by CreateRequest; our fields are borrowed.
    Rcp_RequestContent* originalContent = nullptr;
    Rcp_Configuration* originalConfiguration = nullptr;
    Rcp_Headers* originalHeaders = nullptr;
    const char* originalMethod = nullptr;
    bool started = false;
    bool terminal = false;
    bool cancelSent = false;
    bool delivered = false;
    const char* error = nullptr;
    uint32_t nativeError = 0;
    int32_t status = 0;
    Valdi::Value responseHeaders;
    Valdi::Ref<Valdi::Bytes> bytes;
};

struct Session {
    Rcp_SessionConfiguration configuration{};
    Rcp_Session* native = nullptr;
    uint32_t error = 0;
    bool attempted = false;

    bool open() {
        if (!attempted) {
            attempted = true;
            native = HMS_Rcp_CreateSession(&configuration, &error);
        }
        return native && error == 0;
    }

    ~Session() {
        if (native) {
            HMS_Rcp_CloseSession(&native);
        }
    }
};

struct ResponseOwner {
    Rcp_Response* value;
    ~ResponseOwner() {
        if (value && value->destroyResponse) {
            value->destroyResponse(value);
        }
    }
};

Valdi::Value copyHeaders(Rcp_Headers* headers) {
    Valdi::Value result(Valdi::makeShared<Valdi::ValueMap>());
    if (!headers) {
        return result;
    }
    struct Entries {
        Rcp_HeaderEntry* value;
        ~Entries() {
            if (value) {
                HMS_Rcp_DestroyHeaderEntries(value);
            }
        }
    } entries{HMS_Rcp_GetHeaderEntries(headers)};
    // RCP's linked-list API can return null for an empty header map.
    for (auto* entry = entries.value; entry; entry = entry->next) {
        if (!entry->key) {
            continue;
        }
        std::string value;
        bool first = true;
        for (auto* item = entry->value; item; item = item->next) {
            if (!item->value) {
                continue;
            }
            if (!first) {
                value += ", ";
            }
            value += item->value;
            first = false;
        }
        result.setMapValue(std::string_view(entry->key),
                           Valdi::Value(Valdi::StringBox::fromString(value)));
    }
    return result;
}

void receiveResponse(void* context, Rcp_Response* response, uint32_t errorCode) {
    // The worker holds Task until this callback sets terminal. Taking a strong
    // reference also keeps the userdata alive through the callback's return path.
    auto task = static_cast<Task*>(context)->shared_from_this();
    std::lock_guard lock(task->nativeMutex);
    {
        ResponseOwner owned{response};
        if (task->terminal) {
            return;
        }
        task->nativeError = errorCode;
        if (errorCode == 0 && !task->canceled.load()) {
            try {
                if (!response || !response->destroyResponse) {
                    task->error = "RCP returned an invalid HTTP response";
                } else {
                    task->status = static_cast<int32_t>(response->statusCode);
                    const auto length = response->body.length;
                    if (task->status < 100 || task->status > 599) {
                        task->error = "RCP returned an invalid HTTP status";
                    } else if (length > kMaximumBodyBytes || (length && !response->body.buffer)) {
                        task->error = "RCP response is invalid or exceeds the 256 MiB body limit";
                    } else {
                        // Rcp_Buffer is explicitly length-bearing. Never strlen,
                        // UTF-8 conversion, JSON, or the old net_http body buffer.
                        task->bytes = Valdi::makeShared<Valdi::Bytes>();
                        if (length) {
                            const auto* begin = reinterpret_cast<const Valdi::Byte*>(response->body.buffer);
                            task->bytes->insert(task->bytes->end(), begin, begin + length);
                        }
                        task->responseHeaders = copyHeaders(response->headers);
                    }
                }
            } catch (...) {
                task->error = "Could not retain RCP HTTP response bytes or headers";
            }
        }
        // Dispose the callback-owned response before destroying its request.
    }
    task->terminal = true;
    task->wake->notify();
}

bool containsControl(std::string_view text) {
    return text.find_first_of(std::string_view("\r\n\0", 3)) != std::string_view::npos;
}

bool isHeaderName(std::string_view text) {
    return !text.empty() &&
           text.find_first_not_of("!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz"
                                  "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == std::string_view::npos;
}

void snapshotRequest(Task& task, const snap::valdi_core::HTTPRequest& request,
                     uint32_t connectTimeoutMs, uint32_t requestTimeoutMs) {
    task.url = request.url.slowToString();
    task.method = request.method.slowToString();
    if (task.method.empty()) {
        task.method = RCP_METHOD_GET;
    }
    if ((task.url.rfind("https://", 0) != 0 && task.url.rfind("http://", 0) != 0) ||
        containsControl(task.url)) {
        task.error = "Native HTTP requires an http:// or https:// URL without CR, LF or NUL";
        return;
    }
    constexpr std::array<std::string_view, 8> methods{
        RCP_METHOD_GET, RCP_METHOD_HEAD, RCP_METHOD_POST, RCP_METHOD_PUT,
        RCP_METHOD_DELETE, RCP_METHOD_OPTIONS, RCP_METHOD_TRACE, RCP_METHOD_PATCH};
    if (std::find(methods.begin(), methods.end(), task.method) == methods.end()) {
        task.error = "HTTP method is unsupported by the RCP C HTTP API";
        return;
    }
    if (request.priority < 0 || request.priority > 10) {
        task.error = "Valdi HTTP priority must be between 0 and 10";
        return;
    }
    if (connectTimeoutMs == 0 || requestTimeoutMs == 0) {
        task.error = "Native HTTP connect and overall request timeouts must be positive milliseconds";
        return;
    }
    if (!request.headers.isNullOrUndefined() && !request.headers.isMap()) {
        task.error = "HTTP request headers must be a string map";
        return;
    }
    // Snapshot JS-backed values and bytes synchronously; no borrowed caller data
    // reaches the worker. Rcp_Buffer does not copy its source buffer.
    for (const auto& key : request.headers.sortedMapKeys()) {
        const auto value = request.headers.getMapValue(key);
        if (!isHeaderName(key.toStringView()) || !value.isString() ||
            containsControl(value.toStringBox().toStringView())) {
            task.error = "HTTP headers require token names and string values without CR, LF or NUL";
            return;
        }
        task.headers.emplace_back(key.slowToString(), value.toStringBox().slowToString());
    }
    task.hasContent = request.body.has_value();
    if (request.body) {
        const auto length = request.body->size();
        if (length > std::numeric_limits<uint32_t>::max()) {
            task.error = "HTTP upload exceeds the RCP uint32_t buffer length";
            return;
        }
        if (length) {
            const auto* begin = reinterpret_cast<const char*>(request.body->data());
            task.upload.assign(begin, begin + length);
        }
    }
    task.content.type = RCP_CONTENT_TYPE_STRING;
    task.content.data.contentStr = {
        task.upload.empty() ? "" : task.upload.data(), static_cast<uint32_t>(task.upload.size())};
    // Zero/default enums select system trust, system proxy and automatic network
    // selection. Retain RCP's documented redirect default.
    task.configuration.transferConfiguration.autoRedirect = true;
    task.configuration.transferConfiguration.timeout = {connectTimeoutMs, requestTimeoutMs};
    // RCP has no native priority field. Valdi's valid priority is advisory.
}

void destroyNative(Task& task) {
    if (task.native) {
        task.native->content = task.originalContent;
        task.native->configuration = task.originalConfiguration;
        task.native->headers = task.originalHeaders;
        task.native->method = task.originalMethod;
        HMS_Rcp_DestroyRequest(task.native);
        task.native = nullptr;
    }
    if (task.nativeHeaders) {
        HMS_Rcp_DestroyHeaders(task.nativeHeaders);
        task.nativeHeaders = nullptr;
    }
}

// Worker only. Cancel is separate from DestroyRequest; destruction waits for
// the response callback, even when CancelRequest returns a nonzero error.
bool advance(const std::shared_ptr<Task>& task, Session& session) {
    std::lock_guard lock(task->nativeMutex);
    if (!task->started) {
        task->started = true;
        if (task->canceled.load() || task->error) {
            task->terminal = true;
        } else if (!session.open()) {
            task->error = "Could not create RCP HTTP session";
            task->nativeError = session.error;
            task->terminal = true;
        } else {
            task->native = HMS_Rcp_CreateRequest(task->url.c_str());
            if (task->native) {
                task->originalContent = task->native->content;
                task->originalConfiguration = task->native->configuration;
                task->originalHeaders = task->native->headers;
                task->originalMethod = task->native->method;
                task->nativeHeaders = HMS_Rcp_CreateHeaders();
            }
            if (!task->native || !task->nativeHeaders) {
                task->error = "Could not create RCP HTTP request or headers";
                task->terminal = true;
            } else {
                for (const auto& [key, value] : task->headers) {
                    task->nativeError = HMS_Rcp_SetHeaderValue(task->nativeHeaders, key.c_str(), value.c_str());
                    if (task->nativeError != 0) {
                        task->terminal = true;
                        break;
                    }
                }
                if (!task->terminal) {
                    task->native->method = task->method.c_str();
                    task->native->headers = task->nativeHeaders;
                    task->native->content = task->hasContent ? &task->content : nullptr;
                    task->native->configuration = &task->configuration;
                    task->callback = {receiveResponse, task.get()};
                    const auto error = HMS_Rcp_Fetch(session.native, task->native, &task->callback);
                    if (error != 0) {
                        // A rejected Fetch installs no outstanding request.
                        task->nativeError = error;
                        task->terminal = true;
                    }
                }
            }
        }
    }
    if (!task->terminal && task->canceled.load() && !task->cancelSent) {
        task->cancelSent = true;
        HMS_Rcp_CancelRequest(session.native, task->native);
        // The terminal Fetch callback (normally 1007900992) remains the lifetime
        // boundary. A successful cancel return is not a synchronous drain.
    }
    if (!task->terminal) {
        return false;
    }
    destroyNative(*task);
    return true;
}

void deliver(const std::shared_ptr<Task>& task) {
    std::lock_guard lock(task->deliveryMutex);
    if (task->delivered) {
        return;
    }
    task->delivered = true;
    auto completion = std::move(task->completion);
    try {
        if (!task->canceled.load() && !task->wake->stopping.load() && completion) {
            if (task->error) {
                auto message = std::string(task->error);
                if (task->nativeError) {
                    message += " (RCP error " + std::to_string(task->nativeError) + ")";
                }
                completion->onFail(message);
            } else if (task->nativeError != 0) {
                completion->onFail("RCP HTTP error " + std::to_string(task->nativeError));
            } else {
                snap::valdi_core::HTTPResponse response(task->status, task->responseHeaders,
                                                        Valdi::BytesView(task->bytes));
                completion->onComplete(response);
            }
        }
    } catch (...) {
        // Never unwind a foreign completion through the detached worker or
        // invoke a second terminal completion if the first threw.
    }
    task->bytes = nullptr;
    task->responseHeaders = Valdi::Value();
    task->headers.clear();
    std::vector<char>().swap(task->upload);
    task->content.data.contentStr = {};
}

} // namespace

struct HarmonyHTTPRequestManager::State {
    std::shared_ptr<Wake> signal = std::make_shared<Wake>();
    std::vector<std::shared_ptr<Task>> tasks; // guarded by signal->mutex
    uint32_t connectTimeoutMs;
    uint32_t requestTimeoutMs;

    State(uint32_t connectTimeoutMs, uint32_t requestTimeoutMs)
        : connectTimeoutMs(connectTimeoutMs), requestTimeoutMs(requestTimeoutMs) {}

    void run() {
        // This worker alone owns session start/close and native request calls.
        // State and every callback's userdata survive manager destruction.
        Session session;
        for (;;) {
            std::vector<std::shared_ptr<Task>> snapshot;
            uint64_t revision;
            {
                std::lock_guard lock(signal->mutex);
                snapshot = tasks;
                revision = signal->revision;
            }
            for (const auto& task : snapshot) {
                if (signal->stopping.load()) {
                    task->cancel();
                }
                if (advance(task, session)) {
                    deliver(task);
                    std::lock_guard lock(signal->mutex);
                    tasks.erase(std::remove(tasks.begin(), tasks.end(), task), tasks.end());
                }
            }
            std::unique_lock lock(signal->mutex);
            if (signal->stopping.load() && tasks.empty()) {
                return;
            }
            signal->condition.wait(lock, [&] { return signal->revision != revision; });
        }
    }
};

HarmonyHTTPRequestManager::HarmonyHTTPRequestManager(uint32_t connectTimeoutMs, uint32_t requestTimeoutMs)
    : _state(std::make_shared<State>(connectTimeoutMs, requestTimeoutMs)) {
    std::thread([state = _state] { state->run(); }).detach();
}

HarmonyHTTPRequestManager::~HarmonyHTTPRequestManager() {
    shutdown();
}

std::shared_ptr<snap::valdi_core::Cancelable> HarmonyHTTPRequestManager::performRequest(
    const snap::valdi_core::HTTPRequest& request,
    const std::shared_ptr<snap::valdi_core::HTTPRequestManagerCompletion>& completion) {
    auto task = std::make_shared<Task>(_state->signal, completion);
    try {
        snapshotRequest(*task, request, _state->connectTimeoutMs, _state->requestTimeoutMs);
    } catch (...) {
        task->error = "Could not copy native HTTP request parameters";
    }
    {
        std::lock_guard lock(_state->signal->mutex);
        if (!_state->signal->stopping.load()) {
            _state->tasks.push_back(task);
            ++_state->signal->revision;
            _state->signal->condition.notify_one();
            return task;
        }
    }
    task->cancel();
    return task;
}

void HarmonyHTTPRequestManager::shutdown() {
    std::vector<std::shared_ptr<Task>> tasks;
    {
        std::lock_guard lock(_state->signal->mutex);
        _state->signal->stopping.store(true);
        tasks = _state->tasks;
        ++_state->signal->revision;
    }
    for (const auto& task : tasks) {
        task->cancel();
    }
    _state->signal->condition.notify_one();
}

} // namespace ValdiHarmony
