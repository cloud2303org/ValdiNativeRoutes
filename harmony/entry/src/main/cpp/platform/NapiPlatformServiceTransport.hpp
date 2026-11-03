#pragma once

#include "PlatformServicePort.hpp"
#include <napi/native_api.h>

namespace ValdiHarmony::Platform {

// Public typed NAPI codec, UI only. Decoding copies typed-array view bytes,
// including byteOffset/length; no napi_value ever escapes its handle scope.
Valdi::Value fromNapi(napi_env env, const Valdi::ValueSchema& schema, napi_value value);
napi_value toNapi(napi_env env, const Valdi::ValueSchema& schema, const Valdi::Value& value);

class NapiServiceTransport final : public ServiceTransport,
                                   public std::enable_shared_from_this<NapiServiceTransport> {
public:
    static std::shared_ptr<NapiServiceTransport> create(napi_env env, napi_value services);
    ~NapiServiceTransport() override;
    void invoke(const MethodDescriptor&, std::vector<Valdi::Value>, Completion) override;
    void setEvents(const EventsDescriptor&, uint64_t, Event) override;
    void setActive(bool) override;
    void close() override;
    void release() override;
    bool closed() const { return _closed; } // UI only, callbacks never retain this as a raw pointer.
private:
    explicit NapiServiceTransport(napi_env env) : _env(env) {}
    napi_value receiver(const std::string& service);
    void lifecycle(const char* method, size_t argc, napi_value* argv);
    napi_env _env;
    napi_ref _services = nullptr;
    std::map<std::string, napi_ref> _children;
    bool _closed = false;
};
} // namespace ValdiHarmony::Platform
