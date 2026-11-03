#include "PlatformTestHelpers.hpp"
// Test harness uses official Node-API, not NAPI symbol/ABI stubs. Only the
// JavaScript OS services in napi-transport.test.cjs are doubles.
#include "../NapiPlatformServiceTransport.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include <node_api.h>
#include <stdexcept>

using namespace ValdiHarmony::Platform;
namespace {
void check(napi_status status) {
    if (status != napi_ok) throw std::runtime_error("test Node-API call failed");
}
std::string text(napi_env env, napi_value value) {
    size_t size;
    check(napi_get_value_string_utf8(env, value, nullptr, 0, &size));
    std::string result(size + 1, '\0');
    check(napi_get_value_string_utf8(env, value, result.data(), result.size(), &size));
    result.resize(size);
    return result;
}
struct Session {
    std::shared_ptr<NapiServiceTransport> transport;
    std::shared_ptr<ServicePort> port;
    std::vector<napi_ref> eventArrays;
};
template<typename F> napi_value protect(napi_env env, F&& function) {
    try { return function(); }
    catch (const std::exception& error) {
        napi_throw_error(env, nullptr, error.what());
        return nullptr;
    }
}
Session* session(napi_env env, napi_callback_info info, size_t& count, napi_value* args) {
    napi_value receiver;
    check(napi_get_cb_info(env, info, &count, args, &receiver, nullptr));
    void* data;
    check(napi_unwrap(env, receiver, &data));
    return static_cast<Session*>(data);
}
napi_value invokeCall(napi_env env, napi_callback_info info, bool throughPort) {
    return protect(env, [&] {
        napi_value args[3];
        size_t count = 3;
        auto* owner = session(env, info, count, args);
        auto service = text(env, args[0]), method = text(env, args[1]);
        auto host = hostSchema(service);
        const auto& signature = methodSchema(*host, Valdi::StringBox::fromString(method));
        uint32_t argc;
        check(napi_get_array_length(env, args[2], &argc));
        if (argc != signature.getParametersSize()) throw std::runtime_error("test arity mismatch");
        std::vector<Valdi::Value> values;
        for (uint32_t i = 0; i < argc; ++i) {
            napi_value value;
            check(napi_get_element(env, args[2], i, &value));
            values.emplace_back(fromNapi(env, signature.getParameter(i), value));
        }
        napi_deferred deferred;
        napi_value result;
        check(napi_create_promise(env, &deferred, &result));
        auto schema = signature.getReturnValue().getPromise()->getValueSchema();
        auto complete = [env, deferred, schema](Valdi::Value value, std::string error) {
                if (error.empty()) {
                    check(napi_resolve_deferred(env, deferred, toNapi(env, schema, value)));
                } else {
                    napi_value message, rejection;
                    check(napi_create_string_utf8(env, error.data(), error.size(), &message));
                    check(napi_create_error(env, nullptr, message, &rejection));
                    check(napi_reject_deferred(env, deferred, rejection));
                }
            };
        if (throughPort) {
            auto fn = property(testHostValue(owner->port, service), Valdi::StringBox::fromString(method)).getFunctionRef();
            auto called = (*fn)(Valdi::ValueFunctionFlagsCallSync, values.data(), values.size());
            if (!called) throw std::runtime_error("test native host call failed");
            auto promise = Valdi::castOrNull<Valdi::Promise>(called.value().getValdiObject());
            if (promise == nullptr) throw std::runtime_error("test native host did not return a Valdi Promise");
            promise->onComplete([complete = std::move(complete)](const Valdi::Result<Valdi::Value>& result) {
                if (result) complete(result.value(), {});
                else complete({}, result.error().toString());
            });
        } else {
            owner->transport->invoke(methodDescriptor(service, method), std::move(values), std::move(complete));
        }
        return result;
    });
}
napi_value call(napi_env env, napi_callback_info info) { return invokeCall(env, info, false); }
napi_value portCall(napi_env env, napi_callback_info info) { return invokeCall(env, info, true); }
napi_value capture(napi_env env, napi_callback_info info) {
    return protect(env, [&] {
        napi_value args[1];
        size_t count = 1;
        auto* owner = session(env, info, count, args);
        const auto service = text(env, args[0]);
        napi_value array;
        check(napi_create_array(env, &array));
        napi_ref ref;
        check(napi_create_reference(env, array, 1, &ref));
        owner->eventArrays.push_back(ref);
        auto host = hostSchema(service);
        auto schema = resolved(methodSchema(*host, Valdi::StringBox::fromCString("setEvents")).getParameter(0));
        owner->transport->setEvents(*serviceDescriptor(service).events, 1, [env, ref, schema](std::string name, Valdi::Value value) {
            napi_value target, record, jsName;
            check(napi_get_reference_value(env, ref, &target));
            const auto& signature = methodSchema(*schema.getClass(), Valdi::StringBox::fromString(name));
            check(napi_create_object(env, &record));
            check(napi_create_string_utf8(env, name.data(), name.size(), &jsName));
            check(napi_set_named_property(env, record, "name", jsName));
            check(napi_set_named_property(env, record, "value", toNapi(env, signature.getParameter(0), value)));
            uint32_t length;
            check(napi_get_array_length(env, target, &length));
            check(napi_set_element(env, target, length, record));
        });
        return array;
    });
}
napi_value close(napi_env env, napi_callback_info info) {
    return protect(env, [&] {
        size_t count = 0;
        auto* owner = session(env, info, count, nullptr);
        owner->port->closeOnUI();
        owner->port->shutdownOnJS();
        owner->port->releaseOnUI();
        napi_value result;
        check(napi_get_undefined(env, &result));
        return result;
    });
}
napi_value active(napi_env env, napi_callback_info info) {
    return protect(env, [&] {
        napi_value args[1], result;
        size_t count = 1;
        auto* owner = session(env, info, count, args);
        bool value;
        check(napi_get_value_bool(env, args[0], &value));
        owner->transport->setActive(value);
        check(napi_get_undefined(env, &result));
        return result;
    });
}
napi_value create(napi_env env, napi_callback_info info) {
    return protect(env, [&] {
        size_t count = 1;
        napi_value args[1], result;
        check(napi_get_cb_info(env, info, &count, args, nullptr, nullptr));
        auto owner = std::make_unique<Session>();
        owner->transport = NapiServiceTransport::create(env, args[0]);
        // This one-thread Node harness executes the real port/Promise path.
        // Separate UI/JS scheduling is exercised by platform-port-tests.cpp.
        Post inlinePost = [](std::function<void()> task) { task(); };
        owner->port = ServicePort::create(owner->transport, inlinePost, inlinePost);
        check(napi_create_object(env, &result));
        const napi_property_descriptor properties[] = {
            {"call", nullptr, call, nullptr, nullptr, nullptr, napi_default, nullptr},
            {"portCall", nullptr, portCall, nullptr, nullptr, nullptr, napi_default, nullptr},
            {"capture", nullptr, capture, nullptr, nullptr, nullptr, napi_default, nullptr},
            {"close", nullptr, close, nullptr, nullptr, nullptr, napi_default, nullptr},
            {"setActive", nullptr, active, nullptr, nullptr, nullptr, napi_default, nullptr},
        };
        check(napi_define_properties(env, result, 5, properties));
        check(napi_wrap(env, result, owner.get(), [](napi_env env, void* pointer, void*) {
            auto* session = static_cast<Session*>(pointer);
            session->port->closeOnUI();
            session->port->shutdownOnJS();
            session->port->releaseOnUI();
            for (auto ref : session->eventArrays) napi_delete_reference(env, ref);
            delete session;
        }, nullptr, nullptr));
        owner.release();
        return result;
    });
}
napi_value initialize(napi_env env, napi_value exports) {
    napi_value fn;
    check(napi_create_function(env, "create", NAPI_AUTO_LENGTH, create, nullptr, &fn));
    check(napi_set_named_property(env, exports, "create", fn));
    return exports;
}
}
NAPI_MODULE(platform_service_test, initialize)
