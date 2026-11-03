#pragma once
#include "../PlatformServiceAdapters.hpp"
namespace ValdiHarmony::Platform {
inline Valdi::Value testHostValue(const std::shared_ptr<ServicePort>& port, const std::string& service) {
    if (service == "ble") return port->interfaces().bleValue();
    if (service == "permissions") return port->interfaces().permissionsValue();
    if (service == "wifi") return port->interfaces().wifiValue();
    if (service == "nfc") return port->interfaces().nfcValue();
    throw std::invalid_argument("test: unknown service");
}
// Reflection belongs to contract/fixture assertions, never the production call path.
inline const ServiceDescriptor& serviceDescriptor(const std::string& service) {
    for (const auto* descriptor : serviceDescriptors()) if (descriptor->name == service) return *descriptor;
    throw std::invalid_argument("test: unknown service");
}
inline Valdi::Ref<Valdi::ClassSchema> hostSchema(const std::string& service) {
    return serviceDescriptor(service).schema;
}
inline const Valdi::ValueFunctionSchema& methodSchema(const Valdi::ClassSchema& host, const Valdi::StringBox& name) {
    auto index = host.getPropertyIndexForName(name);
    if (!index) throw std::invalid_argument("test: unknown method");
    return *host.getProperty(*index).schema.getFunction();
}
inline const MethodDescriptor& methodDescriptor(const std::string& service, const std::string& method) {
    for (const auto& descriptor : serviceDescriptor(service).methods) if (descriptor.name == method) return descriptor;
    throw std::invalid_argument("test: unknown promise method");
}
} // namespace ValdiHarmony::Platform
