// Link the production manager as its own translation unit, using actual RCP and
// pinned Valdi declarations. Only HMS_Rcp_* functions form the fake OS boundary.
#include "../HarmonyHTTPRequestManager.hpp"
#include "valdi_core/Cancelable.hpp"
#include "valdi_core/HTTPRequest.hpp"
#include "valdi_core/HTTPRequestManagerCompletion.hpp"
#include "valdi_core/HTTPResponse.hpp"
#include "valdi_core/cpp/Utils/Bytes.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include <RemoteCommunicationKit/rcp.h>

#include <algorithm>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <thread>
#include <vector>

struct Rcp_Headers { std::vector<std::pair<std::string, std::string>> values; };
struct Rcp_Session { const Rcp_SessionConfiguration* configuration; };

namespace {
using ValdiHarmony::HarmonyHTTPRequestManager;
using namespace std::chrono_literals;

struct NativeCall {
    Rcp_Session* session;
    Rcp_Request* request;
    const Rcp_ResponseCallbackObject* callback;
    std::string method;
    std::string url;
    std::vector<char> upload;
    bool hasContent;
    std::vector<std::pair<std::string, std::string>> headers;
    Rcp_Configuration configuration;
    bool replied = false;
    bool destroyed = false;
    unsigned cancels = 0;
};
struct Defaults {
    Rcp_RequestContent* content;
    Rcp_Configuration* configuration;
    Rcp_Headers* headers;
    const char* method;
};
std::mutex nativeMutex;
std::condition_variable nativeCondition;
std::vector<std::shared_ptr<NativeCall>> calls;
std::map<Rcp_Request*, Defaults> allocations;
size_t sessionsCreated = 0, sessionsClosed = 0;
size_t requestsCreated = 0, requestsDestroyed = 0;
size_t headersCreated = 0, headersDestroyed = 0;
size_t responsesCreated = 0, responsesDestroyed = 0;
size_t entriesCreated = 0, entriesDestroyed = 0;
uint32_t sessionError = 0, headerError = 0, fetchError = 0, cancelError = 0;
bool failRequest = false, failHeaders = false;
bool inlineSuccess = false, inlineCancel = false;
bool blockCreate = false, createEntered = false, allowCreate = false;
bool blockResponseDestroy = false, responseDestroyEntered = false, allowResponseDestroy = false;

// Every wait has a condition and a finite deadline; no timing-based success checks.
template<class F> void awaitNative(F predicate) {
    std::unique_lock lock(nativeMutex);
    assert(nativeCondition.wait_for(lock, 5s, predicate));
}
size_t callCount() { std::lock_guard lock(nativeMutex); return calls.size(); }
std::shared_ptr<NativeCall> awaitCall(size_t index) {
    awaitNative([&] { return calls.size() > index; });
    std::lock_guard lock(nativeMutex);
    return calls[index];
}
void awaitDestroyed(const std::shared_ptr<NativeCall>& call) {
    awaitNative([&] { return call->destroyed; });
}
void verifyBorrowed(const NativeCall& call) {
    assert(!call.destroyed);
    assert(call.request->method == call.method);
    assert(call.request->url == call.url);
    assert(call.request->configuration);
    assert(call.request->configuration->transferConfiguration.timeout.connectMs ==
           call.configuration.transferConfiguration.timeout.connectMs);
    assert(call.request->headers->values == call.headers);
    assert((call.request->content != nullptr) == call.hasContent);
    if (call.hasContent) {
        assert(call.request->content->type == RCP_CONTENT_TYPE_STRING);
        const auto& buffer = call.request->content->data.contentStr;
        assert(buffer.length == call.upload.size());
        assert(buffer.buffer); // Present-empty content still has a valid pointer.
        assert(!buffer.length || std::memcmp(buffer.buffer, call.upload.data(), buffer.length) == 0);
    }
    assert(call.callback && call.callback->callback && call.callback->usrCtx);
}
void destroyResponse(Rcp_Response* response) {
    {
        std::unique_lock lock(nativeMutex);
        if (blockResponseDestroy) {
            responseDestroyEntered = true;
            nativeCondition.notify_all();
            assert(nativeCondition.wait_for(lock, 5s, [] { return allowResponseDestroy; }));
        }
        ++responsesDestroyed;
    }
    HMS_Rcp_DestroyHeaders(response->headers);
    delete[] response->body.buffer;
    delete response;
    nativeCondition.notify_all();
}
Rcp_Response* response(int status = 200, const std::vector<char>& body = {}, bool withHeaders = true) {
    auto* value = new Rcp_Response{};
    value->statusCode = static_cast<Rcp_StatusCode>(status);
    if (!body.empty()) {
        auto* bytes = new char[body.size()]; // No terminating NUL; ASan catches strlen/overreads.
        std::copy(body.begin(), body.end(), bytes);
        value->body = {bytes, static_cast<uint32_t>(body.size())};
    }
    if (withHeaders) {
        value->headers = HMS_Rcp_CreateHeaders();
        assert(value->headers);
        assert(HMS_Rcp_SetHeaderValue(value->headers, "x-test", "one") == 0);
        assert(HMS_Rcp_SetHeaderValue(value->headers, "x-test", "two") == 0);
    }
    value->destroyResponse = destroyResponse;
    { std::lock_guard lock(nativeMutex); ++responsesCreated; }
    return value;
}
void reply(const std::shared_ptr<NativeCall>& call, Rcp_Response* value, uint32_t error = 0) {
    Rcp_ResponseCallbackObject callback;
    {
        std::lock_guard lock(nativeMutex);
        verifyBorrowed(*call);
        assert(!call->replied);
        call->replied = true;
        callback = *call->callback;
        if (value) value->request = call->request;
    }
    callback.callback(callback.usrCtx, value, error);
}
struct Completion final : snap::valdi_core::HTTPRequestManagerCompletion {
    std::mutex mutex;
    std::condition_variable condition;
    size_t successes = 0, failures = 0;
    int32_t status = 0;
    Valdi::Value headers;
    std::optional<Valdi::BytesView> body;
    std::string error;
    std::function<void()> reenter;
    void onComplete(const snap::valdi_core::HTTPResponse& value) override {
        if (reenter) reenter();
        std::lock_guard lock(mutex);
        ++successes;
        status = value.statusCode;
        headers = value.headers;
        body = value.body;
        condition.notify_all();
    }
    void onFail(const std::string& value) override {
        std::lock_guard lock(mutex);
        ++failures;
        error = value;
        condition.notify_all();
    }
    void awaitResult() {
        std::unique_lock lock(mutex);
        assert(condition.wait_for(lock, 5s, [&] { return successes + failures != 0; }));
        assert(successes + failures == 1);
    }
    void assertSuppressed() {
        std::lock_guard lock(mutex);
        assert(successes == 0 && failures == 0);
    }
};
snap::valdi_core::HTTPRequest request(std::string_view method = "GET",
                                    std::optional<Valdi::BytesView> body = std::nullopt) {
    return {Valdi::StringBox::fromString(std::string_view("https://fixture.invalid/asset")),
            Valdi::StringBox::fromString(method), Valdi::Value(), body, 10};
}
Valdi::Ref<Valdi::Bytes> bytes(const std::vector<char>& input) {
    auto result = Valdi::makeShared<Valdi::Bytes>();
    for (auto item : input) result->push_back(static_cast<Valdi::Byte>(item));
    return result;
}
struct Manager {
    std::unique_ptr<HarmonyHTTPRequestManager> value;
    size_t closeCount;
    explicit Manager(uint32_t connect = 1234, uint32_t transfer = 5678)
        : value(std::make_unique<HarmonyHTTPRequestManager>(connect, transfer)) {
        std::lock_guard lock(nativeMutex);
        closeCount = sessionsClosed;
    }
    void close(bool hadSession = true) {
        value.reset();
        if (hadSession) awaitNative([&] { return sessionsClosed > closeCount; });
    }
};
void assertBody(const Completion& completion, const std::vector<char>& expected) {
    assert(completion.body && completion.body->size() == expected.size());
    assert(expected.empty() || std::memcmp(completion.body->data(), expected.data(), expected.size()) == 0);
}

void methodsAndBinaryUpload() {
    Manager manager;
    const std::vector<char> binary = {'a', '\0', static_cast<char>(0xff), 'z'};
    for (auto method : {"GET", "HEAD", "OPTIONS", "DELETE", "TRACE", "POST", "PUT", "PATCH", ""}) {
        auto storage = bytes(binary);
        const bool upload = method == std::string_view("POST") || method == std::string_view("PUT") ||
                            method == std::string_view("PATCH");
        auto input = request(method, upload ? std::optional<Valdi::BytesView>(Valdi::BytesView(storage)) : std::nullopt);
        input.headers = Valdi::Value(Valdi::makeShared<Valdi::ValueMap>());
        input.headers.setMapValue(std::string_view("content-type"),
            Valdi::Value(Valdi::StringBox::fromString(std::string_view("application/octet-stream"))));
        auto completion = std::make_shared<Completion>();
        const auto index = callCount();
        {
            std::lock_guard lock(nativeMutex);
            blockCreate = true; createEntered = false; allowCreate = false;
        }
        auto cancelable = manager.value->performRequest(input, completion);
        awaitNative([] { return createEntered; });
        // The caller can immediately mutate/free every input after performRequest returns.
        storage->assign(20, 'q');
        input.headers.setMapValue(std::string_view("content-type"), Valdi::Value());
        input.url = Valdi::StringBox::fromString(std::string_view("https://changed.invalid"));
        {
            std::lock_guard lock(nativeMutex);
            blockCreate = false; allowCreate = true;
        }
        nativeCondition.notify_all();
        auto call = awaitCall(index);
        assert(call->method == (method[0] ? method : "GET"));
        assert(call->hasContent == upload);
        assert(call->upload == (upload ? binary : std::vector<char>{}));
        assert(call->url == "https://fixture.invalid/asset");
        assert(call->headers.size() == 1 && call->headers[0].second == "application/octet-stream");
        assert(call->configuration.transferConfiguration.timeout.connectMs == 1234);
        assert(call->configuration.transferConfiguration.timeout.transferMs == 5678);
        assert(call->configuration.transferConfiguration.autoRedirect);
        assert(call->configuration.securityConfiguration.remoteValidationType == RCP_REMOTE_VALIDATION_SYSTEM);
        assert(call->configuration.proxyConfiguration.proxyType == RCP_PROXY_SYSTEM);
        assert(call->configuration.transferConfiguration.pathPreference == RCP_PATH_PREFERENCE_AUTO);
        reply(call, response(404, binary));
        completion->awaitResult();
        assert(completion->successes == 1 && completion->status == 404);
        assertBody(*completion, binary);
        assert(completion->headers.getMapValue(std::string_view("x-test")).toStringBox().slowToString() == "one, two");
        awaitDestroyed(call);
        cancelable->cancel(); // Remains safe after completion and native destruction.
    }
    // Present-empty body remains distinct from absent, and null/empty response headers are maps.
    for (bool nullHeaders : {false, true}) {
        auto completion = std::make_shared<Completion>();
        auto empty = bytes({});
        const auto index = callCount();
        auto cancelable = manager.value->performRequest(request("POST", Valdi::BytesView(empty)), completion);
        auto call = awaitCall(index);
        assert(call->hasContent && call->upload.empty());
        auto* result = response(204, {}, false);
        if (!nullHeaders) result->headers = HMS_Rcp_CreateHeaders();
        reply(call, result);
        completion->awaitResult();
        assert(completion->successes == 1 && completion->headers.isMap());
        assert(completion->headers.sortedMapKeys().empty());
        assertBody(*completion, {});
    }
    manager.close();
}

void concurrentAssociationAndNoSlotLimit() {
    Manager manager;
    std::vector<std::shared_ptr<Completion>> completions;
    std::vector<std::shared_ptr<snap::valdi_core::Cancelable>> cancelables;
    const auto first = callCount();
    for (int i = 0; i != 80; ++i) {
        completions.push_back(std::make_shared<Completion>());
        cancelables.push_back(manager.value->performRequest(request(), completions.back()));
    }
    awaitCall(first + 79);
    for (int i = 79; i >= 0; --i) {
        auto call = awaitCall(first + i);
        assert(call->callback->usrCtx != awaitCall(first + ((i + 1) % 80))->callback->usrCtx);
        reply(call, response(200 + i % 5, {static_cast<char>(i)}));
        completions[i]->awaitResult();
        assert(completions[i]->status == 200 + i % 5);
        assertBody(*completions[i], {static_cast<char>(i)});
    }
    manager.close();
}

void setupFailuresCannotAffectLiveRequest() {
    Manager manager;
    const auto index = callCount();
    auto firstCompletion = std::make_shared<Completion>();
    auto firstTask = manager.value->performRequest(request(), firstCompletion);
    auto first = awaitCall(index);
    auto failSecond = [&](auto configure, auto reset) {
        { std::lock_guard lock(nativeMutex); configure(); }
        auto completion = std::make_shared<Completion>();
        auto input = request();
        input.headers = Valdi::Value(Valdi::makeShared<Valdi::ValueMap>());
        input.headers.setMapValue(std::string_view("x-req"),
            Valdi::Value(Valdi::StringBox::fromString(std::string_view("second"))));
        auto task = manager.value->performRequest(input, completion);
        completion->awaitResult();
        assert(completion->failures == 1 && !completion->error.empty());
        {
            std::lock_guard lock(nativeMutex);
            reset();
            assert(!first->destroyed && first->cancels == 0 && !first->replied);
        }
        firstCompletion->assertSuppressed();
    };
    failSecond([] { failRequest = true; }, [] { failRequest = false; });
    failSecond([] { failHeaders = true; }, [] { failHeaders = false; });
    failSecond([] { headerError = 401; }, [] { headerError = 0; });
    failSecond([] { fetchError = 201; }, [] { fetchError = 0; });
    reply(first, response(200, {'o', '\0', 'k'}));
    firstCompletion->awaitResult();
    assertBody(*firstCompletion, {'o', '\0', 'k'});
    manager.close();

    Manager unavailable;
    { std::lock_guard lock(nativeMutex); sessionError = 201; }
    auto completion = std::make_shared<Completion>();
    auto task = unavailable.value->performRequest(request(), completion);
    completion->awaitResult();
    assert(completion->failures == 1 && completion->error.find("201") != std::string::npos);
    unavailable.close(false);
    { std::lock_guard lock(nativeMutex); sessionError = 0; }
}

void validationAndTransportFailures() {
    Manager manager;
    auto reject = [&](const snap::valdi_core::HTTPRequest& input) {
        const auto before = callCount();
        auto completion = std::make_shared<Completion>();
        auto task = manager.value->performRequest(input, completion);
        completion->awaitResult();
        assert(completion->failures == 1 && !completion->error.empty());
        assert(callCount() == before);
    };
    for (auto method : {"CONNECT", "patch", "CUSTOM", "GET\r\n"}) reject(request(method));
    auto bad = request();
    bad.url = Valdi::StringBox::fromString(std::string_view("file:///asset")); reject(bad);
    bad = request(); bad.priority = -1; reject(bad);
    bad.priority = 11; reject(bad);
    bad = request(); bad.headers = Valdi::Value(7); reject(bad);
    for (auto name : {"bad name", "", "x\r\ny"}) {
        bad = request(); bad.headers = Valdi::Value(Valdi::makeShared<Valdi::ValueMap>());
        bad.headers.setMapValue(std::string_view(name),
            Valdi::Value(Valdi::StringBox::fromString(std::string_view("value")))); reject(bad);
    }
    for (const auto& text : {std::string("a\0b", 3), std::string("a\rb"), std::string("a\nb")}) {
        bad = request(); bad.headers = Valdi::Value(Valdi::makeShared<Valdi::ValueMap>());
        bad.headers.setMapValue(std::string_view("x-test"),
            Valdi::Value(Valdi::StringBox::fromString(text))); reject(bad);
    }
    for (auto code : {1007900028u, 1007900060u, 1007900992u}) {
        auto completion = std::make_shared<Completion>();
        const auto index = callCount();
        auto task = manager.value->performRequest(request(), completion);
        auto call = awaitCall(index);
        reply(call, response(500), code); // Error responses must still be destroyed.
        completion->awaitResult();
        assert(completion->failures == 1 && completion->error.find(std::to_string(code)) != std::string::npos);
    }
    for (int kind = 0; kind != 4; ++kind) {
        auto completion = std::make_shared<Completion>();
        const auto index = callCount();
        auto task = manager.value->performRequest(request(), completion);
        auto call = awaitCall(index);
        auto* result = kind == 0 ? nullptr : response(kind == 1 ? 99 : 200, {}, false);
        if (kind >= 2) result->body.length = kind == 2 ? 1 : 256u * 1024u * 1024u + 1;
        reply(call, result);
        completion->awaitResult();
        assert(completion->failures == 1);
    }
    manager.close();
    for (auto times : {std::pair{0u, 1u}, std::pair{1u, 0u}}) {
        Manager invalid(times.first, times.second);
        auto completion = std::make_shared<Completion>();
        auto task = invalid.value->performRequest(request(), completion);
        completion->awaitResult();
        assert(completion->failures == 1);
        invalid.close(false);
    }
}

void cancellationRetainsUntilResponse() {
    for (bool failCancel : {false, true}) {
        Manager manager;
        auto completion = std::make_shared<Completion>();
        auto upload = bytes({'a', '\0', static_cast<char>(0xff)});
        const auto index = callCount();
        auto task = manager.value->performRequest(request("PATCH", Valdi::BytesView(upload)), completion);
        auto call = awaitCall(index);
        { std::lock_guard lock(nativeMutex); cancelError = failCancel ? 201 : 0; }
        task->cancel(); task->cancel();
        awaitNative([&] { return call->cancels == 1; });
        {
            std::lock_guard lock(nativeMutex);
            assert(!call->destroyed);
            verifyBorrowed(*call); // Retain body, request, config and callback despite Cancel return.
            cancelError = 0;
        }
        manager.value->shutdown();
        manager.value.reset();
        task->cancel(); // Manager has already been destroyed.
        reply(call, response(200, {'l', 'a', 't', 'e'}), failCancel ? 0 : 1007900992);
        awaitDestroyed(call);
        awaitNative([&] { return sessionsClosed > manager.closeCount; });
        completion->assertSuppressed();
    }
}

void callbackExclusionAndInlineCallbacks() {
    Manager manager;
    auto completion = std::make_shared<Completion>();
    auto index = callCount();
    auto task = manager.value->performRequest(request(), completion);
    auto call = awaitCall(index);
    {
        std::lock_guard lock(nativeMutex);
        blockResponseDestroy = true; responseDestroyEntered = false; allowResponseDestroy = false;
    }
    std::thread callback([&] { reply(call, response(200, {'x'})); });
    awaitNative([] { return responseDestroyEntered; });
    task->cancel();
    {
        std::lock_guard lock(nativeMutex);
        assert(!call->destroyed);
        allowResponseDestroy = true;
    }
    nativeCondition.notify_all();
    callback.join();
    awaitDestroyed(call);
    completion->assertSuppressed();
    { std::lock_guard lock(nativeMutex); blockResponseDestroy = false; inlineSuccess = true; }
    completion = std::make_shared<Completion>();
    task = manager.value->performRequest(request(), completion);
    completion->awaitResult();
    assert(completion->successes == 1 && completion->status == 204);
    { std::lock_guard lock(nativeMutex); inlineSuccess = false; inlineCancel = true; }
    completion = std::make_shared<Completion>();
    index = callCount();
    task = manager.value->performRequest(request(), completion);
    call = awaitCall(index);
    task->cancel();
    awaitDestroyed(call);
    completion->assertSuppressed();
    { std::lock_guard lock(nativeMutex); inlineCancel = false; }
    manager.close();
}

void reentryAndShutdown() {
    Manager manager;
    auto firstCompletion = std::make_shared<Completion>();
    auto nestedCompletion = std::make_shared<Completion>();
    std::shared_ptr<snap::valdi_core::Cancelable> first, nested;
    auto index = callCount();
    firstCompletion->reenter = [&] {
        first->cancel();
        nested = manager.value->performRequest(request("PATCH", Valdi::BytesView(bytes({'b', '\0'}))), nestedCompletion);
    };
    first = manager.value->performRequest(request(), firstCompletion);
    reply(awaitCall(index), response());
    firstCompletion->awaitResult();
    auto next = awaitCall(index + 1);
    nestedCompletion->reenter = [&] {
        manager.value->shutdown();
        manager.value.reset(); // Destroy the manager from its own worker completion.
    };
    reply(next, response(201));
    nestedCompletion->awaitResult();
    assert(nestedCompletion->successes == 1);
    awaitNative([&] { return sessionsClosed > manager.closeCount; });
    first->cancel(); nested->cancel();

    Manager closed;
    closed.value->shutdown();
    auto completion = std::make_shared<Completion>();
    auto task = closed.value->performRequest(request(), completion);
    closed.close(false);
    completion->assertSuppressed();
}
} // namespace

extern "C" {
Rcp_Session* HMS_Rcp_CreateSession(const Rcp_SessionConfiguration* configuration, uint32_t* error) {
    std::lock_guard lock(nativeMutex);
    assert(configuration && configuration->type == RCP_SESSION_TYPE_HTTP);
    *error = sessionError;
    if (*error) return nullptr;
    ++sessionsCreated;
    return new Rcp_Session{configuration};
}
uint32_t HMS_Rcp_CloseSession(Rcp_Session** session) {
    {
        std::lock_guard lock(nativeMutex);
        for (const auto& call : calls) if (call->session == *session) assert(call->destroyed);
        assert((*session)->configuration->type == RCP_SESSION_TYPE_HTTP);
        ++sessionsClosed;
        delete *session;
        *session = nullptr;
    }
    nativeCondition.notify_all();
    return 0;
}
Rcp_Request* HMS_Rcp_CreateRequest(const char* url) {
    std::unique_lock lock(nativeMutex);
    if (blockCreate) {
        createEntered = true;
        nativeCondition.notify_all();
        assert(nativeCondition.wait_for(lock, 5s, [] { return allowCreate; }));
    }
    if (failRequest) return nullptr;
    auto* value = new Rcp_Request{};
    value->url = strdup(url);
    // Deliberately supply defaults to check that borrowed replacements are restored.
    value->method = "DEFAULT";
    value->content = new Rcp_RequestContent{};
    value->configuration = new Rcp_Configuration{};
    value->headers = new Rcp_Headers{};
    allocations.emplace(value, Defaults{value->content, value->configuration, value->headers, value->method});
    ++requestsCreated;
    return value;
}
void HMS_Rcp_DestroyRequest(Rcp_Request* request) {
    {
        std::lock_guard lock(nativeMutex);
        auto found = allocations.find(request);
        assert(found != allocations.end());
        const auto& original = found->second;
        assert(request->content == original.content && request->configuration == original.configuration);
        assert(request->headers == original.headers && request->method == original.method);
        for (const auto& call : calls) {
            if (call->request == request && !call->destroyed) {
                assert(call->replied); // Cancel acceptance alone never permits deallocation.
                call->destroyed = true;
            }
        }
        delete request->content;
        delete request->configuration;
        delete request->headers;
        free(request->url);
        delete request;
        allocations.erase(found);
        ++requestsDestroyed;
    }
    nativeCondition.notify_all();
}
Rcp_Headers* HMS_Rcp_CreateHeaders() {
    std::lock_guard lock(nativeMutex);
    if (failHeaders) return nullptr;
    ++headersCreated;
    return new Rcp_Headers{};
}
void HMS_Rcp_DestroyHeaders(Rcp_Headers* headers) {
    if (!headers) return;
    std::lock_guard lock(nativeMutex);
    ++headersDestroyed;
    delete headers;
}
uint32_t HMS_Rcp_SetHeaderValue(Rcp_Headers* headers, const char* name, const char* value) {
    std::lock_guard lock(nativeMutex);
    if (headerError) return headerError;
    headers->values.emplace_back(name, value);
    return 0;
}
Rcp_HeaderEntry* HMS_Rcp_GetHeaderEntries(Rcp_Headers* headers) {
    std::lock_guard lock(nativeMutex);
    Rcp_HeaderEntry* head = nullptr;
    auto** next = &head;
    std::map<std::string, std::vector<std::string>> grouped;
    for (const auto& [key, value] : headers->values) grouped[key].push_back(value);
    for (const auto& [key, values] : grouped) {
        *next = new Rcp_HeaderEntry{};
        ++entriesCreated;
        (*next)->key = strdup(key.c_str());
        auto** nextValue = &(*next)->value;
        for (const auto& value : values) {
            *nextValue = new Rcp_HeaderValue{strdup(value.c_str()), nullptr};
            nextValue = &(*nextValue)->next;
        }
        next = &(*next)->next;
    }
    return head;
}
void HMS_Rcp_DestroyHeaderEntries(Rcp_HeaderEntry* entry) {
    std::lock_guard lock(nativeMutex);
    while (entry) {
        auto* next = entry->next;
        while (entry->value) {
            auto* value = entry->value;
            entry->value = value->next;
            free(value->value);
            delete value;
        }
        free(entry->key);
        delete entry;
        entry = next;
        ++entriesDestroyed;
    }
}
uint32_t HMS_Rcp_Fetch(Rcp_Session* session, Rcp_Request* request, const Rcp_ResponseCallbackObject* callback) {
    std::shared_ptr<NativeCall> call;
    bool completeInline;
    {
        std::lock_guard lock(nativeMutex);
        if (fetchError) return fetchError;
        std::vector<char> upload;
        if (request->content) {
            const auto& buffer = request->content->data.contentStr;
            upload.assign(buffer.buffer, buffer.buffer + buffer.length);
        }
        call = std::make_shared<NativeCall>(NativeCall{session, request, callback,
            request->method, request->url, upload, request->content != nullptr,
            request->headers->values, *request->configuration});
        calls.push_back(call);
        verifyBorrowed(*call);
        completeInline = inlineSuccess;
    }
    nativeCondition.notify_all();
    if (completeInline) reply(call, response(204));
    return 0;
}
uint32_t HMS_Rcp_CancelRequest(Rcp_Session* session, const Rcp_Request* request) {
    std::shared_ptr<NativeCall> found;
    bool completeInline;
    uint32_t error;
    {
        std::lock_guard lock(nativeMutex);
        for (const auto& call : calls) if (call->request == request && !call->destroyed) found = call;
        assert(found && found->session == session);
        verifyBorrowed(*found);
        ++found->cancels;
        completeInline = inlineCancel;
        error = cancelError;
    }
    nativeCondition.notify_all();
    if (completeInline) reply(found, nullptr, 1007900992);
    return error;
}
} // extern C

int main() {
    methodsAndBinaryUpload();
    concurrentAssociationAndNoSlotLimit();
    setupFailuresCannotAffectLiveRequest();
    validationAndTransportFailures();
    cancellationRetainsUntilResponse();
    callbackExclusionAndInlineCallbacks();
    reentryAndShutdown();
    std::lock_guard lock(nativeMutex);
    assert(allocations.empty());
    assert(sessionsCreated == sessionsClosed);
    assert(requestsCreated == requestsDestroyed);
    assert(headersCreated == headersDestroyed);
    assert(responsesCreated == responsesDestroyed);
    assert(entriesCreated == entriesDestroyed);
    for (const auto& call : calls) assert(call->destroyed);
    std::cout << "Harmony RCP HTTP: 7 production-manager regression groups passed; "
              << calls.size() << " native fetches; all native ownership counters balanced\n";
}
