#pragma once
#include "PlatformServiceCodec.hpp"
#include "valdi/runtime/Context/Context.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include <array>
#include <atomic>
#include <functional>
#include <map>
#include <memory>

namespace ValdiHarmony::Platform {
class ServiceInterfaces;
struct MethodDescriptor {
    std::string service, name;
    std::vector<Valdi::ValueSchema> parameters;
    Valdi::ValueSchema result;
};
struct EventField { size_t index; Valdi::ValueSchema payload; };
struct EventsDescriptor {
    std::string service;
    Valdi::Ref<Valdi::ClassSchema> schema;
    std::map<std::string, EventField> fields;
};
struct ServiceDescriptor {
    std::string name;
    Valdi::Ref<Valdi::ClassSchema> schema;
    std::vector<MethodDescriptor> methods;
    std::unique_ptr<EventsDescriptor> events;
};
struct MethodBinding { size_t propertyIndex; const char* name; };
// Resolved once by generated fixed bindings, never by a business call's name.
ServiceDescriptor makeServiceDescriptor(const char* name, Valdi::RegisteredCppGeneratedClass* host,
    std::initializer_list<MethodBinding> methods, Valdi::RegisteredCppGeneratedClass* events);
using Post = std::function<void(std::function<void()>)>;
using Completion = std::function<void(Valdi::Value, std::string)>;
using Event = std::function<void(std::string, Valdi::Value)>;
class ServiceTransport {
public:
    virtual ~ServiceTransport() = default;
    virtual void invoke(const MethodDescriptor&, std::vector<Valdi::Value>, Completion) = 0;
    virtual void setEvents(const EventsDescriptor&, uint64_t epoch, Event) = 0;
    virtual void setActive(bool active) = 0;
    virtual void close() = 0;
    virtual void release() = 0;
};
// Private common transport: queues owned values and owns pending native promises.
// Generated CppGeneratedInterface subclasses are the only business-facing API.
class ServicePort final : public std::enable_shared_from_this<ServicePort> {
public:
    static std::shared_ptr<ServicePort> create(std::shared_ptr<ServiceTransport>, Post ui, Post js);
    ~ServicePort();
    ServiceInterfaces& interfaces(); // JS; one typed instance of each service per runtime.
    Valdi::Value request(const MethodDescriptor&, const std::vector<Valdi::Value>&); // JS
    void installEvents(const EventsDescriptor&, const Valdi::Value&); // JS
    bool closed() const { return _closed; }
    void setActive(bool); // UI
    void closeOnUI();
    void shutdownOnJS();
    void releaseOnUI();
private:
    ServicePort(std::shared_ptr<ServiceTransport>, Post, Post);
    void finish(uint64_t, Valdi::Value, std::string);
    void event(const EventsDescriptor&, uint64_t, std::string, Valdi::Value);
    struct Pending {
        Valdi::RetainedContext owner;
        Valdi::Ref<Valdi::ResolvablePromise> promise;
        Valdi::ValueSchema resultSchema;
    };
    struct Sink { Valdi::RetainedContext owner; Valdi::Value events; uint64_t epoch; };
    std::shared_ptr<ServiceTransport> _transport;
    Post _ui, _js;
    std::atomic<bool> _closed{false};
    bool _uiClosed = false, _released = false;
    uint64_t _nextId = 1, _epoch = 0;
    std::map<uint64_t, Pending> _pending;
    std::map<const EventsDescriptor*, Sink> _sinks;
    std::unique_ptr<ServiceInterfaces> _interfaces;
};

template<typename R> Valdi::Future<R> failedFuture(std::string_view message) {
    Valdi::TypedPromise<R> promise;
    promise.setError(Valdi::Error(message));
    return promise.getFuture();
}
// Official marshallers cover native DTO arguments and the Future result. The
// low-level request copies all byte views/records before posting to UI.
template<typename R, typename... A>
Valdi::Future<R> invokeFuture(const std::weak_ptr<ServicePort>& weak,
                            const MethodDescriptor& descriptor, const A&... args) {
    try {
        auto port = weak.lock();
        if (!port || port->closed()) return failedFuture<R>("E_PLATFORM_CLOSED:runtime closed");
        Valdi::SimpleExceptionTracker error;
        std::vector<Valdi::Value> values(sizeof...(A));
        [[maybe_unused]] size_t index = 0;
        (Valdi::CppMarshaller::marshall(error, args, values[index++]), ...);
        if (!error) return failedFuture<R>(error.extractError().toString());
        auto result = port->request(descriptor, values);
        Valdi::Future<R> future;
        Valdi::CppMarshaller::unmarshall(error, result, future);
        if (!error) return failedFuture<R>(error.extractError().toString());
        return future;
    } catch (const std::exception& error) {
        return failedFuture<R>(error.what());
    } catch (...) { return failedFuture<R>("E_PLATFORM_INTERNAL:service call failed"); }
}
template<typename Events>
void installTypedEvents(const std::weak_ptr<ServicePort>& weak, const EventsDescriptor& descriptor,
                        const Events& events) {
    auto port = weak.lock();
    if (!port || port->closed()) throw Valdi::Exception("E_PLATFORM_CLOSED:runtime closed");
    Valdi::SimpleExceptionTracker error;
    Valdi::Value value;
    Valdi::CppMarshaller::marshall(error, events, value);
    if (!error) throw Valdi::Exception(error.extractError());
    try { port->installEvents(descriptor, value); }
    catch (const std::exception& error) { throw Valdi::Exception(std::string_view(error.what())); }
}
} // namespace ValdiHarmony::Platform
