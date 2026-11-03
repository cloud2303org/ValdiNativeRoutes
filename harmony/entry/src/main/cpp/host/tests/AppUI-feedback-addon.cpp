// Production AppUI host/proxy and official Node-API runtime. ArkUI rendering is
// the same real-header boundary simulator as the native presenter regressions.
#define APP_UI_BOUNDARY_ONLY
#include "AppUI-native.cpp"
#include "../HarmonyAppUIHost.hpp"
#include "valdi/runtime/Context/ContextEntry.hpp"
#include "valdi/runtime/Utils/Disposable.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/Promise.hpp"
#include <node_api.h>
#include <hilog/log.h>
#include "AppUI-engine.hpp"

extern "C" int OH_LOG_Print(LogType,LogLevel,unsigned int,const char*,const char*,...) {return 0;}
namespace {
namespace Pages=snap::valdi_modules::app_pages;
void checked(napi_status result){if(result!=napi_ok)throw std::runtime_error("AppUI test Node-API failure");}
struct JSQueue final:Valdi::DispatchQueue {
    std::deque<Valdi::DispatchFunction> work;
    bool isCurrent()const override{return true;}
    void sync(const Valdi::DispatchFunction& fn)override{fn();}
    void async(Valdi::DispatchFunction fn)override{work.push_back(std::move(fn));}
    Valdi::task_id_t asyncAfter(Valdi::DispatchFunction fn,std::chrono::steady_clock::duration)override{async(std::move(fn));return 1;}
    void cancel(Valdi::task_id_t)override{}
    void fullTeardown()override{drain();}
    void setListener(const Valdi::Shared<Valdi::IQueueListener>&)override{}
    Valdi::Shared<Valdi::IQueueListener> getListener()const override{return {};}
    void drain(){while(!work.empty()){auto fn=std::move(work.front());work.pop_front();fn();}}
};
struct Probe final:Valdi::Disposable {
    bool disposed=false;
    bool dispose(std::unique_lock<Valdi::Mutex>&)override{disposed=true;return true;}
};
struct Session {
    std::unique_ptr<Boundary> sdk=std::make_unique<Boundary>();
    Valdi::Ref<JSQueue> js=Valdi::makeShared<JSQueue>();
    Valdi::Ref<HarmonyMainThreadDispatcher> ui;
    std::shared_ptr<HarmonyAppUIHost> host;
    Valdi::Ref<Pages::AppUIHost> api;
    Valdi::Ref<Valdi::Context> context=Valdi::makeShared<Valdi::Context>(51,Valdi::Ref<Valdi::ILogger>());
    std::unique_ptr<AppUIEngine> engine;
    Probe probe;bool closed=false;
    Session(napi_env env,napi_value feedback){
        try {
        context->postInit();assert(context->insertDisposable(&probe));
        uv_loop_t* loop;checked(napi_get_uv_event_loop(env,&loop));
        ui=Valdi::makeShared<HarmonyMainThreadDispatcher>(loop);
        host=std::make_shared<HarmonyAppUIHost>(env,feedback,ui,js,&sdk->context);
        host->setForegroundPageOnUI("Root");
        Valdi::ContextEntry entry(context);Valdi::SimpleExceptionTracker error;
        auto value=host->hostValue();assert(value.isProxyObject());
        Pages::AppUIHost::unmarshall(error,value,api);assert(error && api!=nullptr);
        engine=std::make_unique<AppUIEngine>(value);
        } catch (...) { close(); throw; }
    }
    void flush(){for(int i=0;i<4;++i){ui->drain();js->drain();if(engine)engine->queue->drain();}}
    void close(){if(closed)return;closed=true;
        if(host)host->closeOnUI();
        if(ui!=nullptr)flush();
        context->onDestroy();
        if(ui!=nullptr)flush();
        engine.reset();host.reset();api=nullptr;sdk.reset();if(ui!=nullptr)ui->close([]{});}
    ~Session(){close();}
};
std::string text(napi_env env,napi_value value){size_t size=0;checked(napi_get_value_string_utf8(env,value,nullptr,0,&size));
    std::string result(size+1,'\0');checked(napi_get_value_string_utf8(env,value,result.data(),result.size(),&size));result.resize(size);return result;}
napi_value property(napi_env env,napi_value object,const char* name){napi_value value;checked(napi_get_named_property(env,object,name,&value));return value;}
std::string stringProperty(napi_env env,napi_value object,const char* name){return text(env,property(env,object,name));}
bool boolProperty(napi_env env,napi_value object,const char* name){bool value;checked(napi_get_value_bool(env,property(env,object,name),&value));return value;}
void put(napi_env env,napi_value object,const char* name,const std::string& value){napi_value js;checked(napi_create_string_utf8(env,value.data(),value.size(),&js));checked(napi_set_named_property(env,object,name,js));}
void put(napi_env env,napi_value object,const char* name,bool value){napi_value js;checked(napi_get_boolean(env,value,&js));checked(napi_set_named_property(env,object,name,js));}
template<typename T> napi_value bridge(napi_env env,Valdi::Future<T> future){
    napi_deferred deferred;napi_value promise;checked(napi_create_promise(env,&deferred,&promise));
    Valdi::SimpleExceptionTracker error;Valdi::Value converted;
    Valdi::CppMarshaller::marshall(error,future,converted);assert(error);
    auto native=Valdi::castOrNull<Valdi::Promise>(converted.getValdiObject());assert(native!=nullptr);
    native->onComplete([env,deferred](const Valdi::Result<Valdi::Value>& result){
        if(!result){napi_value message,rejection;auto error=result.error().toString();
            checked(napi_create_string_utf8(env,error.data(),error.size(),&message));checked(napi_create_error(env,nullptr,message,&rejection));
            checked(napi_reject_deferred(env,deferred,rejection));return;}
        napi_value value;
        if constexpr(std::is_void_v<T>){assert(result.value().isUndefined());checked(napi_get_undefined(env,&value));}
        else if constexpr(std::is_same_v<T,Pages::ModalReply>){
            T dto;Valdi::SimpleExceptionTracker error;Valdi::CppMarshaller::unmarshall(error,result.value(),dto);assert(error);
            checked(napi_create_object(env,&value));put(env,value,"confirm",dto.getConfirm());put(env,value,"cancel",dto.getCancel());put(env,value,"content",dto.getContent().slowToString());
        }else if constexpr(std::is_same_v<T,Pages::PresentationReply>){
            T dto;Valdi::SimpleExceptionTracker error;Valdi::CppMarshaller::unmarshall(error,result.value(),dto);assert(error);
            checked(napi_create_object(env,&value));put(env,value,"confirm",dto.getConfirm());put(env,value,"cancel",dto.getCancel());put(env,value,"value",dto.getValue().slowToString());
            napi_value index;checked(napi_create_double(env,dto.getIndex(),&index));checked(napi_set_named_property(env,value,"index",index));
        }else {assert(false);checked(napi_get_undefined(env,&value));}
        checked(napi_resolve_deferred(env,deferred,value));
    });return promise;
}
Session* owner(napi_env env,napi_callback_info info,size_t& count,napi_value* args){napi_value receiver;void* data;
    checked(napi_get_cb_info(env,info,&count,args,&receiver,nullptr));checked(napi_unwrap(env,receiver,&data));return static_cast<Session*>(data);}
template<typename F> napi_value protect(napi_env env,F fn){try{return fn();}catch(const std::exception& error){napi_throw_error(env,nullptr,error.what());return nullptr;}}
napi_value invoke(napi_env env,napi_callback_info info){return protect(env,[&]{
    size_t count=2;napi_value args[2];auto* s=owner(env,info,count,args);if(s->closed)throw std::runtime_error("closed test session");
    auto method=text(env,args[0]);Valdi::ContextEntry entered(s->context);
    if(method=="showLoading")return bridge(env,s->api->showLoading(Pages::LoadingRequest(Valdi::StringBox::fromString(stringProperty(env,args[1],"title")),boolProperty(env,args[1],"mask"))));
    if(method=="hideLoading")return bridge(env,s->api->hideLoading());
    if(method=="showToast"){
        double duration;checked(napi_get_value_double(env,property(env,args[1],"duration"),&duration));
        return bridge(env,s->api->showToast(Pages::ToastRequest(Valdi::StringBox::fromString(stringProperty(env,args[1],"title")),
            Valdi::StringBox::fromString(stringProperty(env,args[1],"icon")),duration,boolProperty(env,args[1],"mask"))));}
    if(method=="hideToast")return bridge(env,s->api->hideToast());
    if(method=="scanCode")return bridge(env,s->api->scanCode());
    if(method=="pickAttachments")return bridge(env,s->api->pickAttachments(STRING_LITERAL("photos"),1,{}));
    if(method=="clearAttachmentCache")return bridge(env,s->api->clearAttachmentCache());
    if(method=="showModal")return bridge(env,s->api->showModal(Pages::ModalRequest(STRING_LITERAL("Confirm"),STRING_LITERAL("Content"),true,
        STRING_LITERAL("Yes"),STRING_LITERAL("No"),true,STRING_LITERAL("Placeholder"),STRING_LITERAL("Default"))));
    throw std::runtime_error("unknown test method");
});}
napi_value flush(napi_env env,napi_callback_info info){return protect(env,[&]{size_t count=0;auto* s=owner(env,info,count,nullptr);s->flush();napi_value value;checked(napi_get_undefined(env,&value));return value;});}
napi_value evaluate(napi_env env,napi_callback_info info){return protect(env,[&]{
    size_t count=1;napi_value arg;auto* s=owner(env,info,count,&arg);
    if(s->closed)throw std::runtime_error("closed test session");
    Valdi::ContextEntry entered(s->context);
    auto result=s->engine->eval(text(env,arg));napi_value value;
    checked(napi_create_string_utf8(env,result.data(),result.size(),&value));return value;
});}
napi_value control(napi_env env,napi_callback_info info){return protect(env,[&]{size_t count=2;napi_value args[2];auto* s=owner(env,info,count,args);
    auto action=text(env,args[0]);
    if(action=="confirm"){s->sdk->click("Yes");s->sdk->disappear();}
    else if(action=="cancel"){s->sdk->click("No");s->sdk->disappear();}
    else if(action=="edit")s->sdk->event(s->sdk->find(ARKUI_NODE_TEXT_INPUT).at(0),NODE_TEXT_INPUT_ON_CHANGE,{},text(env,args[1]).c_str());
    else if(action=="foreground")s->host->setForegroundPageOnUI(text(env,args[1]));
    else if(action=="disappear")s->sdk->disappear();
    else if(action=="dismiss")s->sdk->dismiss();
    else if(action=="detach")s->context->onDestroy();
    else if(action=="close")s->close();
    else throw std::runtime_error("unknown test control");
    napi_value value;checked(napi_get_boolean(env,s->probe.disposed,&value));return value;
});}
napi_value create(napi_env env,napi_callback_info info){return protect(env,[&]{size_t count=1;napi_value feedback,result;
    checked(napi_get_cb_info(env,info,&count,&feedback,nullptr,nullptr));auto session=std::make_unique<Session>(env,feedback);
    checked(napi_create_object(env,&result));napi_property_descriptor methods[]={
        {"call",nullptr,invoke,nullptr,nullptr,nullptr,napi_default,nullptr},
        {"eval",nullptr,evaluate,nullptr,nullptr,nullptr,napi_default,nullptr},
        {"flush",nullptr,flush,nullptr,nullptr,nullptr,napi_default,nullptr},
        {"control",nullptr,control,nullptr,nullptr,nullptr,napi_default,nullptr}};
    checked(napi_define_properties(env,result,4,methods));checked(napi_wrap(env,result,session.get(),[](napi_env,void* data,void*){delete static_cast<Session*>(data);},nullptr,nullptr));
    session.release();return result;
});}
napi_value initialize(napi_env env,napi_value exports){napi_property_descriptor method={"create",nullptr,create,nullptr,nullptr,nullptr,napi_default,nullptr};checked(napi_define_properties(env,exports,1,&method));return exports;}
}
NAPI_MODULE(appui_feedback,initialize)
