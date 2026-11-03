#include "NapiPlatformServiceTransport.hpp"
#include "PlatformServiceAdapters.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include <cstring>
#include <stdexcept>

namespace ValdiHarmony::Platform {
namespace {
void check(napi_status status) {
    if (status != napi_ok) throw std::runtime_error("E_PLATFORM_NAPI:ArkTS operation failed");
}
[[noreturn]] void invalid() { throw std::invalid_argument("E_PLATFORM_INVALID:invalid ArkTS service value"); }
void clearException(napi_env env) {
    bool pending = false;
    if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
        napi_value error;
        napi_get_and_clear_last_exception(env, &error);
    }
}
struct Scope {
    napi_env env;
    napi_handle_scope scope = nullptr;
    explicit Scope(napi_env env) : env(env) { check(napi_open_handle_scope(env, &scope)); }
    ~Scope() { napi_close_handle_scope(env, scope); }
};
napi_value field(napi_env env, napi_value object, const std::string& name) {
    napi_value result;
    check(napi_get_named_property(env, object, name.c_str(), &result));
    return result;
}
std::string string(napi_env env, napi_value value) {
    size_t length = 0;
    check(napi_get_value_string_utf8(env, value, nullptr, 0, &length));
    if (length > 1024 * 1024) invalid();
    std::string result(length + 1, '\0');
    size_t copied = 0;
    check(napi_get_value_string_utf8(env, value, result.data(), result.size(), &copied));
    result.resize(copied);
    return result;
}

Valdi::Value decode(napi_env env, const Valdi::ValueSchema& input, napi_value value,
                    size_t depth, size_t& budget) {
    if (depth > 32 || budget == 0) invalid();
    --budget;
    const auto schema = resolved(input);
    napi_valuetype type;
    check(napi_typeof(env, value, &type));
    if (schema.isVoid()) {
        if (type != napi_undefined && type != napi_null) invalid();
        return Valdi::Value::undefined();
    }
    if (type == napi_null || type == napi_undefined) {
        if (!schema.isOptional()) invalid();
        return type == napi_null ? Valdi::Value() : Valdi::Value::undefined();
    }
    if (schema.isString()) {
        if (type != napi_string) invalid();
        return Valdi::Value(string(env, value));
    }
    if (schema.isBoolean()) {
        if (type != napi_boolean) invalid();
        bool result = false;
        check(napi_get_value_bool(env, value, &result));
        return Valdi::Value(result);
    }
    if (schema.isDouble() || schema.isInteger() || schema.isLongInteger()) {
        if (type != napi_number) invalid();
        double result = 0;
        check(napi_get_value_double(env, value, &result));
        return copy(schema, Valdi::Value(result));
    }
    if (schema.isValueTypedArray()) {
        bool isTyped = false;
        check(napi_is_typedarray(env, value, &isTyped));
        if (!isTyped) invalid();
        napi_typedarray_type kind;
        size_t length = 0, offset = 0, bufferSize = 0;
        void* data = nullptr;
        void* bufferData = nullptr;
        napi_value buffer;
        check(napi_get_typedarray_info(env, value, &kind, &length, &data, &buffer, &offset));
        check(napi_get_arraybuffer_info(env, buffer, &bufferData, &bufferSize));
        if (kind != napi_uint8_array || length > 1024 * 1024 ||
            offset > bufferSize || length > bufferSize - offset || (length && data == nullptr)) invalid();
        // NAPI data is already adjusted to the view offset. Do not offset twice.
        auto bytes = Valdi::makeShared<Valdi::Bytes>();
        if (length) bytes->assignData(static_cast<const Valdi::Byte*>(data), length);
        return Valdi::Value(Valdi::makeShared<Valdi::ValueTypedArray>(Valdi::Uint8Array, bytes));
    }
    if (schema.isArray()) {
        bool isArray = false;
        check(napi_is_array(env, value, &isArray));
        if (!isArray) invalid();
        uint32_t size = 0;
        check(napi_get_array_length(env, value, &size));
        if (size > 16384) invalid();
        std::vector<Valdi::Value> values;
        values.reserve(size);
        for (uint32_t i = 0; i < size; ++i) {
            napi_value entry;
            check(napi_get_element(env, value, i, &entry));
            values.emplace_back(decode(env, schema.getArrayItemSchema(), entry, depth + 1, budget));
        }
        return Valdi::Value(Valdi::ValueArray::make(std::move(values)));
    }
    if (schema.isClass()) {
        if (type != napi_object) invalid();
        auto result = Valdi::ValueTypedObject::make(schema.getClassRef());
        size_t index = 0;
        for (const auto& property : *schema.getClass())
            result->setProperty(index++, decode(env, property.schema,
                field(env, value, property.name.slowToString()), depth + 1, budget));
        return Valdi::Value(result);
    }
    invalid();
}

napi_value encode(napi_env env, const Valdi::ValueSchema& input, const Valdi::Value& value) {
    auto schema = resolved(input);
    napi_value result;
    if (value.isUndefined() || schema.isVoid()) check(napi_get_undefined(env, &result));
    else if (value.isNull()) check(napi_get_null(env, &result));
    else if (schema.isString()) {
        auto text = value.toString();
        check(napi_create_string_utf8(env, text.data(), text.size(), &result));
    } else if (schema.isBoolean()) check(napi_get_boolean(env, value.toBool(), &result));
    else if (schema.isDouble() || schema.isInteger() || schema.isLongInteger())
        check(napi_create_double(env, value.toDouble(), &result));
    else if (schema.isValueTypedArray()) {
        const auto& bytes = value.getTypedArray()->getBuffer();
        napi_value buffer;
        void* data;
        check(napi_create_arraybuffer(env, bytes.size(), &data, &buffer));
        if (!bytes.empty()) std::memcpy(data, bytes.data(), bytes.size());
        check(napi_create_typedarray(env, napi_uint8_array, bytes.size(), buffer, 0, &result));
    } else if (schema.isArray()) {
        auto* values = value.getArray();
        check(napi_create_array_with_length(env, values->size(), &result));
        for (size_t i = 0; i < values->size(); ++i)
            check(napi_set_element(env, result, static_cast<uint32_t>(i),
                encode(env, schema.getArrayItemSchema(), (*values)[i])));
    } else if (schema.isClass()) {
        check(napi_create_object(env, &result));
        for (const auto& property : *schema.getClass())
            check(napi_set_named_property(env, result, property.name.slowToString().c_str(),
                encode(env, property.schema, Platform::property(value, property.name))));
    } else invalid();
    return result;
}

struct CallbackToken {
    std::weak_ptr<NapiServiceTransport> owner;
    Valdi::ValueSchema schema;
    Completion completion;
    Event event;
    std::string name;
    std::shared_ptr<bool> settled; // UI only; shared by fulfill/reject callbacks.
    bool reject = false;
};

napi_value callback(napi_env env, napi_callback_info info) {
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    try {
        void* raw = nullptr;
        size_t count = 1;
        napi_value arg = result;
        check(napi_get_cb_info(env, info, &count, &arg, nullptr, &raw));
        auto* token = static_cast<CallbackToken*>(raw);
        auto owner = token->owner.lock();
        if (!owner || owner->closed()) return result;
        if (token->settled) {
            if (*token->settled) return result;
            *token->settled = true;
        }
        if (token->reject) {
            std::string message = "E_PLATFORM_SERVICE:ArkTS service rejected";
            try {
                napi_valuetype type;
                check(napi_typeof(env, arg, &type));
                std::string extracted;
                if (type == napi_string) extracted = string(env, arg);
                else if (type == napi_object) extracted = string(env, field(env, arg, "message"));
                if (!extracted.empty()) message = std::move(extracted);
            } catch (...) { clearException(env); }
            token->completion({}, std::move(message));
        } else {
            try {
                auto owned = fromNapi(env, token->schema, arg);
                if (token->event) token->event(token->name, std::move(owned));
                else token->completion(std::move(owned), {});
            } catch (...) {
                clearException(env);
                if (token->completion) token->completion({}, "E_PLATFORM_INVALID:invalid ArkTS service result");
            }
        }
    } catch (...) { clearException(env); }
    return result;
}

napi_value function(napi_env env, std::unique_ptr<CallbackToken> token) {
    napi_value result;
    check(napi_create_function(env, "platformServiceCallback", NAPI_AUTO_LENGTH, callback, token.get(), &result));
    // The JS function owns this weak token, including if a permission Promise
    // outlives the runtime. It never captures the host or a borrowed napi_value.
    check(napi_add_finalizer(env, result, token.get(),
        [](napi_env, void* data, void*) { delete static_cast<CallbackToken*>(data); }, nullptr, nullptr));
    token.release();
    return result;
}
}

Valdi::Value fromNapi(napi_env env, const Valdi::ValueSchema& schema, napi_value value) {
    size_t budget = 65536;
    return decode(env, schema, value, 0, budget);
}
napi_value toNapi(napi_env env, const Valdi::ValueSchema& schema, const Valdi::Value& value) {
    return encode(env, schema, copy(schema, value));
}

std::shared_ptr<NapiServiceTransport> NapiServiceTransport::create(napi_env env, napi_value services) {
    auto self = std::shared_ptr<NapiServiceTransport>(new NapiServiceTransport(env));
    try {
        napi_valuetype type;
        check(napi_typeof(env, services, &type));
        if (type != napi_object) invalid();
        auto version = fromNapi(env, Valdi::ValueSchema::doublePrecision(), field(env, services, "version"));
        if (version.toDouble() != 1) invalid();
        check(napi_create_reference(env, services, 1, &self->_services));
        for (const auto* descriptor : serviceDescriptors()) {
            const auto& name = descriptor->name;
            auto child = field(env, services, name);
            check(napi_typeof(env, child, &type));
            if (type != napi_object) invalid();
            napi_ref ref = nullptr;
            check(napi_create_reference(env, child, 1, &ref));
            self->_children.emplace(name, ref);
            for (const auto& method : descriptor->methods) {
                check(napi_typeof(env, field(env, child, method.name), &type));
                if (type != napi_function) invalid();
            }
            if (descriptor->events) {
                check(napi_typeof(env, field(env, child, "setEvents"), &type));
                if (type != napi_function) invalid();
            }
        }
        for (const auto* method : {"setActive", "close"}) {
            check(napi_typeof(env, field(env, services, method), &type));
            if (type != napi_function) invalid();
        }
    } catch (...) { self->release(); clearException(env); throw; }
    return self;
}
NapiServiceTransport::~NapiServiceTransport() {
    // RuntimeHost must call releaseOnUI before dropping its last owner.
    // Never delete NAPI refs from an arbitrary worker-thread destructor.
}
napi_value NapiServiceTransport::receiver(const std::string& service) {
    napi_value result;
    check(napi_get_reference_value(_env, _children.at(service), &result));
    return result;
}
void NapiServiceTransport::invoke(const MethodDescriptor& descriptor,
                                 std::vector<Valdi::Value> args, Completion completion) {
    Scope scope(_env);
    try {
        if (_closed) throw std::runtime_error("E_PLATFORM_CLOSED:runtime closed");
        const auto& service = descriptor.service;
        const auto& method = descriptor.name;
        std::vector<napi_value> values;
        for (size_t i = 0; i < args.size(); ++i) values.push_back(toNapi(_env, descriptor.parameters[i], args[i]));
        auto child = receiver(service);
        napi_value promise;
        check(napi_call_function(_env, child, field(_env, child, method), values.size(), values.data(), &promise));
        bool isPromise = false;
        check(napi_is_promise(_env, promise, &isPromise));
        if (!isPromise) throw std::runtime_error("E_PLATFORM_INVALID:service must return a Promise");
        auto settled = std::make_shared<bool>(false);
        auto token = std::make_unique<CallbackToken>();
        token->owner = weak_from_this();
        token->schema = descriptor.result;
        token->completion = completion;
        token->settled = settled;
        auto rejection = std::make_unique<CallbackToken>(*token);
        rejection->reject = true;
        napi_value callbacks[] = {function(_env, std::move(token)), function(_env, std::move(rejection))};
        napi_value ignored;
        check(napi_call_function(_env, promise, field(_env, promise, "then"), 2, callbacks, &ignored));
    } catch (...) {
        clearException(_env);
        completion({}, "E_PLATFORM_TRANSPORT:ArkTS invocation failed");
    }
}
void NapiServiceTransport::setEvents(const EventsDescriptor& descriptor, uint64_t, Event event) {
    if (_closed) return;
    Scope scope(_env);
    try {
        const auto& service = descriptor.service;
        napi_value object;
        check(napi_create_object(_env, &object));
        for (const auto& [name, field] : descriptor.fields) {
            auto token = std::make_unique<CallbackToken>();
            token->owner = weak_from_this();
            token->schema = field.payload;
            token->name = name;
            token->event = event;
            auto fn = function(_env, std::move(token));
            check(napi_set_named_property(_env, object, name.c_str(), fn));
        }
        auto child = receiver(service);
        napi_value ignored;
        check(napi_call_function(_env, child, field(_env, child, "setEvents"), 1, &object, &ignored));
    } catch (...) { clearException(_env); }
}
void NapiServiceTransport::lifecycle(const char* method, size_t argc, napi_value* argv) {
    if (!_services) return;
    napi_value services, ignored;
    check(napi_get_reference_value(_env, _services, &services));
    check(napi_call_function(_env, services, field(_env, services, method), argc, argv, &ignored));
}
void NapiServiceTransport::setActive(bool active) {
    if (_closed) return;
    Scope scope(_env);
    try {
        napi_value value;
        check(napi_get_boolean(_env, active, &value));
        lifecycle("setActive", 1, &value);
    } catch (...) { clearException(_env); }
}
void NapiServiceTransport::close() {
    if (_closed) return;
    _closed = true;
    Scope scope(_env);
    try { lifecycle("close", 0, nullptr); } catch (...) { clearException(_env); }
}
void NapiServiceTransport::release() {
    close();
    for (auto& [name, ref] : _children) napi_delete_reference(_env, ref);
    _children.clear();
    if (_services) { napi_delete_reference(_env, _services); _services = nullptr; }
}
} // namespace ValdiHarmony::Platform
