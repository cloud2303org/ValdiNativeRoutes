// Reuse the existing real Node-API/JSC/generated-proxy and ArkUI boundary
// fixture. The only extra test control is the native host's activity signal.
#include <node_api.h>
#undef NAPI_MODULE
#define NAPI_MODULE(mod, fn)
#include "../../../harmony/entry/src/main/cpp/host/tests/AppUI-feedback-addon.cpp"
#undef NAPI_MODULE

namespace {
napi_value activity(napi_env env,napi_callback_info info){
    return protect(env,[&]{
        size_t count=2;napi_value args[2];void* data=nullptr;
        checked(napi_get_cb_info(env,info,&count,args,nullptr,nullptr));
        checked(napi_unwrap(env,args[0],&data));
        bool active=false;checked(napi_get_value_bool(env,args[1],&active));
        static_cast<Session*>(data)->host->setPresentationActiveOnUI(active);
        napi_value value;checked(napi_get_undefined(env,&value));return value;
    });
}
}
NAPI_MODULE_INIT(){
    initialize(env,exports);
    napi_property_descriptor method={"activity",nullptr,activity,nullptr,nullptr,nullptr,napi_default,nullptr};
    checked(napi_define_properties(env,exports,1,&method));return exports;
}
