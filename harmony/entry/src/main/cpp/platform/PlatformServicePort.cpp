#include "PlatformServicePort.hpp"
#include "PlatformServiceAdapters.hpp"
#include "valdi_core/cpp/Marshalling/RegisteredCppGeneratedClass.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include <stdexcept>
namespace ValdiHarmony::Platform {
ServiceDescriptor makeServiceDescriptor(const char* name, Valdi::RegisteredCppGeneratedClass* host,
    std::initializer_list<MethodBinding> methods, Valdi::RegisteredCppGeneratedClass* events) {
    auto schema = host->getResolvedClassSchema();
    if (!schema) throw Valdi::Exception(schema.error());
    ServiceDescriptor descriptor{name, schema.value(), {}, {}};
    for (const auto& binding : methods) {
        if (binding.propertyIndex >= schema.value()->getPropertiesSize())
            throw Valdi::Exception("E_PLATFORM_SCHEMA:generated method index mismatch");
        const auto& field = schema.value()->getProperty(binding.propertyIndex);
        auto* function = field.schema.getFunction();
        if (field.name.toStringView() != binding.name || !function || !function->getReturnValue().isPromise())
            throw Valdi::Exception("E_PLATFORM_SCHEMA:generated method signature mismatch");
        descriptor.methods.push_back({name, binding.name,
            {function->getParameters(), function->getParameters() + function->getParametersSize()},
            function->getReturnValue().getPromise()->getValueSchema()});
    }
    if (events) {
        auto eventSchema = events->getResolvedClassSchema();
        if (!eventSchema) throw Valdi::Exception(eventSchema.error());
        descriptor.events = std::make_unique<EventsDescriptor>(EventsDescriptor{name, eventSchema.value(), {}});
        size_t index = 0;
        for (const auto& field : *eventSchema.value()) {
            auto* function = field.schema.getFunction();
            if (!function || function->getParametersSize() != 1 || !function->getReturnValue().isVoid())
                throw Valdi::Exception("E_PLATFORM_SCHEMA:generated event signature mismatch");
            descriptor.events->fields.emplace(field.name.slowToString(), EventField{index++, function->getParameter(0)});
        }
    }
    return descriptor;
}
ServicePort::ServicePort(std::shared_ptr<ServiceTransport> transport, Post ui, Post js)
    : _transport(std::move(transport)), _ui(std::move(ui)), _js(std::move(js)) {}
ServicePort::~ServicePort() = default;
std::shared_ptr<ServicePort> ServicePort::create(std::shared_ptr<ServiceTransport> transport, Post ui, Post js) {
    return std::shared_ptr<ServicePort>(new ServicePort(std::move(transport), std::move(ui), std::move(js)));
}
ServiceInterfaces& ServicePort::interfaces() {
    if (!_interfaces) _interfaces = std::make_unique<ServiceInterfaces>(weak_from_this());
    return *_interfaces;
}
Valdi::Value ServicePort::request(const MethodDescriptor& descriptor, const std::vector<Valdi::Value>& input) {
    if (_closed) throw std::runtime_error("E_PLATFORM_CLOSED:runtime closed");
    if (input.size() != descriptor.parameters.size()) throw std::invalid_argument("E_PLATFORM_INVALID:service arity");
    std::vector<Valdi::Value> args;
    for (size_t i = 0; i < input.size(); ++i) args.emplace_back(copy(descriptor.parameters[i], input[i]));
    if (_pending.size() >= 256 || _nextId == UINT64_MAX)
        throw std::runtime_error("E_PLATFORM_CAPACITY:too many pending calls");
    auto promise = Valdi::makeShared<Valdi::ResolvablePromise>();
    const auto id = _nextId++;
    _pending.emplace(id, Pending{Valdi::RetainedContext(Valdi::Ref(Valdi::Context::currentRoot())), promise, descriptor.result});
    try {
        _ui([weak = weak_from_this(), id, descriptor = &descriptor, args = std::move(args)]() mutable {
            auto self = weak.lock();
            if (!self || self->_closed) return;
            try {
                self->_transport->invoke(*descriptor, std::move(args), [weak, id](Valdi::Value value, std::string error) mutable {
                    auto port = weak.lock();
                    if (!port || port->_closed) return;
                    port->_js([weak, id, value = std::move(value), error = std::move(error)]() mutable {
                        if (auto port = weak.lock()) port->finish(id, std::move(value), std::move(error));
                    });
                });
            } catch (...) {
                self->_js([weak, id] {
                    if (auto port = weak.lock()) port->finish(id, {}, "E_PLATFORM_TRANSPORT:ArkTS call failed");
                });
            }
        });
    } catch (...) { finish(id, {}, "E_PLATFORM_TRANSPORT:UI dispatch failed"); }
    return Valdi::Value(promise);
}
void ServicePort::installEvents(const EventsDescriptor& descriptor, const Valdi::Value& input) {
    auto object = Valdi::ValueTypedObject::make(descriptor.schema);
    for (const auto& [name, field] : descriptor.fields) {
        auto function = property(input, Valdi::StringBox::fromString(name));
        if (!function.isFunction()) throw std::invalid_argument("E_PLATFORM_INVALID:event function required");
        object->setProperty(field.index, function);
    }
    if (_epoch == UINT64_MAX) throw std::runtime_error("E_PLATFORM_CAPACITY:event epochs exhausted");
    const auto epoch = ++_epoch;
    Sink replacement{Valdi::RetainedContext(Valdi::Ref(Valdi::Context::currentRoot())), Valdi::Value(object), epoch};
    std::optional<Sink> retired;
    auto found = _sinks.find(&descriptor);
    if (found != _sinks.end()) { retired.emplace(std::move(found->second)); _sinks.erase(found); }
    _sinks.emplace(&descriptor, std::move(replacement));
    _ui([weak = weak_from_this(), descriptor = &descriptor, epoch] {
        if (auto self = weak.lock(); self && !self->_closed) {
            self->_transport->setEvents(*descriptor, epoch, [weak, descriptor, epoch](std::string name, Valdi::Value value) {
                if (auto port = weak.lock(); port && !port->_closed)
                    port->_js([weak, descriptor, epoch, name = std::move(name), value = std::move(value)]() mutable {
                        if (auto port = weak.lock()) port->event(*descriptor, epoch, std::move(name), std::move(value));
                    });
            });
        }
    });
}
void ServicePort::finish(uint64_t id, Valdi::Value value, std::string error) {
    auto found = _pending.find(id);
    if (found == _pending.end()) return;
    auto pending = std::move(found->second);
    _pending.erase(found);
    if (error.empty()) {
        try { value = copy(pending.resultSchema, value); }
        catch (...) { error = "E_PLATFORM_INVALID:invalid service result"; }
    }
    if (error.empty()) pending.promise->fulfill(std::move(value));
    else pending.promise->fulfill(Valdi::Error(std::string_view(error)));
}
void ServicePort::event(const EventsDescriptor& descriptor, uint64_t epoch, std::string name, Valdi::Value value) {
    if (_closed) return;
    auto found = _sinks.find(&descriptor);
    if (found == _sinks.end() || found->second.epoch != epoch) return;
    auto field = descriptor.fields.find(name);
    if (field == descriptor.fields.end()) return;
    auto sink = found->second;
    try {
        auto owned = copy(field->second.payload, value);
        auto function = sink.events.getTypedObject()->getProperty(field->second.index).getFunctionRef();
        (*function)(Valdi::ValueFunctionFlagsNeverCallSync, {owned});
    } catch (...) { /* Malformed OS events never reach business callbacks. */ }
}
void ServicePort::setActive(bool active) { if (!_closed) _transport->setActive(active); }
void ServicePort::closeOnUI() {
    _closed = true;
    if (_uiClosed) return;
    _uiClosed = true;
    // Cancellation is queued before navigation/page teardown can be queued.
    _js([self = shared_from_this()] { self->shutdownOnJS(); });
    _transport->close();
}
void ServicePort::shutdownOnJS() {
    _closed = true;
    auto pending = std::move(_pending);
    _pending.clear();
    auto sinks = std::move(_sinks);
    _sinks.clear();
    _interfaces.reset();
    for (auto& [id, request] : pending)
        request.promise->fulfill(Valdi::Error("E_PLATFORM_CLOSED:runtime closed"));
}
void ServicePort::releaseOnUI() {
    if (_released) return;
    _released = true;
    _transport->release();
}
} // namespace ValdiHarmony::Platform
