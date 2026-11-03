#include "HarmonyAppUIHost.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/ExceptionTracker.hpp"
#include <array>
#include <cmath>
#include <utility>

namespace ValdiHarmony {
namespace Pages = snap::valdi_modules::app_pages;
namespace {
using Kind = HarmonyNativeAppUIKind;
void napiCheck(napi_status status) {
    if (status != napi_ok) throw std::runtime_error("E_APP_UI_FEEDBACK:native invocation failed");
}
void clearException(napi_env env) {
    bool pending = false;
    if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
        napi_value ignored; napi_get_and_clear_last_exception(env, &ignored);
    }
}
// Each concrete overload supplies its fixed property name and typed arguments.
// This transport helper only invokes and observes the returned Promise.
template<typename Callbacks>
void invokePromise(napi_env env, napi_ref reference, const char* name,
                   const std::vector<napi_value>& args, Callbacks callbacks) {
    napi_value receiver, method, promise, then, ignored;
    napiCheck(napi_get_reference_value(env, reference, &receiver));
    napiCheck(napi_get_named_property(env, receiver, name, &method));
    napiCheck(napi_call_function(env, receiver, method, args.size(), args.empty() ? nullptr : args.data(), &promise));
    bool isPromise = false;
    napiCheck(napi_is_promise(env, promise, &isPromise));
    if (!isPromise) throw std::runtime_error("AppUI method must return Promise");
    auto handlers = callbacks();
    napiCheck(napi_get_named_property(env, promise, "then", &then));
    napiCheck(napi_call_function(env, promise, then, handlers.size(), handlers.data(), &ignored));
}
napi_value feedbackArgument(napi_env env, const std::string& title, bool mask) {
    napi_value argument, value;
    napiCheck(napi_create_object(env, &argument));
    napiCheck(napi_create_string_utf8(env, title.data(), title.size(), &value));
    napiCheck(napi_set_named_property(env, argument, "title", value));
    napiCheck(napi_get_boolean(env, mask, &value));
    napiCheck(napi_set_named_property(env, argument, "mask", value));
    return argument;
}
struct NativeStrings {
    size_t remaining = 131072;
    std::string text(const Valdi::StringBox& value) {
        auto out = value.slowToString();
        // C text attributes are NUL terminated. Bound native resource use; do
        // not duplicate business schema/default/selection/date validation.
        if (out.size() > 16384 || out.size() > remaining || out.find('\0') != std::string::npos)
            throw std::runtime_error("native text bounds");
        remaining -= out.size(); return out;
    }
};
void count(size_t value) { if (!value || value > 512) throw std::runtime_error("native node count"); }
int nativeYear(double year) {
    if (!std::isfinite(year) || std::floor(year) != year || year < 1 || year > 9999)
        throw std::runtime_error("native calendar representation");
    return static_cast<int>(year);
}
HarmonyNativeAppUIRequest native(const Pages::ModalRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind = Kind::Modal;
    out.title=s.text(dto.getTitle()); out.content=s.text(dto.getContent());
    out.confirmText=s.text(dto.getConfirmText()); out.cancelText=s.text(dto.getCancelText());
    out.placeholderText=s.text(dto.getPlaceholderText()); out.defaultText=s.text(dto.getDefaultText());
    out.showCancel=dto.getShowCancel(); out.editable=dto.getEditable(); return out;
}
HarmonyNativeAppUIRequest native(const Pages::ActionSheetRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind=Kind::ActionSheet;
    out.title=s.text(dto.getTitle()); count(dto.getItemList().size());
    for (const auto& item:dto.getItemList()) out.items.push_back(s.text(item));
    return out;
}
HarmonyNativeAppUIRequest native(const Pages::PickerRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind=Kind::Picker;
    out.title=s.text(dto.getTitle()); out.confirmText=s.text(dto.getConfirmText());
    out.cancelText=s.text(dto.getCancelText()); out.value=s.text(dto.getValue()); count(dto.getOptions().size());
    for (const auto& item:dto.getOptions()) out.options.push_back({s.text(item.getValue()),s.text(item.getLabel())});
    return out;
}
HarmonyNativeAppUIRequest native(const Pages::DatePickerRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind=Kind::DatePicker;
    out.title=s.text(dto.getTitle()); out.confirmText=s.text(dto.getConfirmText());
    out.cancelText=s.text(dto.getCancelText()); out.mode=s.text(dto.getMode()); out.value=s.text(dto.getValue());
    out.minYear=nativeYear(dto.getMinYear()); out.maxYear=nativeYear(dto.getMaxYear());
    if (out.minYear>out.maxYear) throw std::runtime_error("native calendar range");
    return out;
}
HarmonyNativeAppUIRequest native(const Pages::BottomSheetRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind=Kind::BottomSheet;
    out.title=s.text(dto.getTitle()); out.content=s.text(dto.getContent());
    out.confirmText=s.text(dto.getConfirmText()); out.cancelText=s.text(dto.getCancelText());
    out.showCancel=dto.getShowCancel(); out.dismissible=dto.getDismissible(); return out;
}
HarmonyNativeAppUIRequest native(const Pages::ImagePreviewRequest& dto) {
    NativeStrings s; HarmonyNativeAppUIRequest out; out.kind=Kind::ImagePreview;
    out.current=s.text(dto.getCurrent()); count(dto.getUrls().size());
    for (const auto& url:dto.getUrls()) out.urls.push_back(s.text(url)); return out;
}
template<typename T> Valdi::Future<T> rejected(const char* message) {
    Valdi::TypedPromise<T> promise; auto future=promise.getFuture(); promise.setError(Valdi::Error(message)); return future;
}
}

// This is the actual generated c+ interface, marshalled through the official
// CppMarshaller. No handwritten ValueTypedObject/ValueTypedProxyObject schema.
class HarmonyGeneratedAppUIProxy final : public Pages::AppUIHost {
public:
    explicit HarmonyGeneratedAppUIProxy(std::weak_ptr<HarmonyAppUIHost> owner):_owner(std::move(owner)){}
    Valdi::Future<Pages::ModalReply> showModal(Pages::ModalRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::ModalReply>([&]{return native(request);});
        return rejected<Pages::ModalReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::PresentationReply> showActionSheet(Pages::ActionSheetRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::PresentationReply>([&]{return native(request);});
        return rejected<Pages::PresentationReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::PresentationReply> showPicker(Pages::PickerRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::PresentationReply>([&]{return native(request);});
        return rejected<Pages::PresentationReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::PresentationReply> showDatePicker(Pages::DatePickerRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::PresentationReply>([&]{return native(request);});
        return rejected<Pages::PresentationReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::PresentationReply> showBottomSheet(Pages::BottomSheetRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::PresentationReply>([&]{return native(request);});
        return rejected<Pages::PresentationReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::PresentationReply> previewImage(Pages::ImagePreviewRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::PresentationReply>([&]{return native(request);});
        return rejected<Pages::PresentationReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::ScanCodeReply> scanCode() override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::ScanCodeReply>([]{
            return HarmonyAppUIHost::ScanCode{};});
        return rejected<Pages::ScanCodeReply>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<Pages::AttachmentSelection> pickAttachments(Valdi::StringBox source, double limit,
                                                            std::vector<Valdi::StringBox> mimeTypes) override {
        if(auto owner=_owner.lock()) return owner->submit<Pages::AttachmentSelection>([&]{
            NativeStrings strings;
            HarmonyAppUIHost::PickAttachments call{strings.text(source),limit,{}};
            if(mimeTypes.size()>128)throw std::runtime_error("MIME count");
            for(const auto& mime:mimeTypes)call.mimeTypes.push_back(strings.text(mime));
            return call;});
        return rejected<Pages::AttachmentSelection>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<void> clearAttachmentCache() override {
        if(auto owner=_owner.lock()) return owner->submit<void>([]{
            return HarmonyAppUIHost::ClearAttachmentCache{};});
        return rejected<void>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<void> showLoading(Pages::LoadingRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<void>([&] {
            return HarmonyAppUIHost::ShowLoading{request.getTitle().slowToString(),request.getMask()};
        });
        return rejected<void>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<void> hideLoading() override {
        if(auto owner=_owner.lock()) return owner->submit<void>([]{return HarmonyAppUIHost::HideLoading{};});
        return rejected<void>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<void> showToast(Pages::ToastRequest request) override {
        if(auto owner=_owner.lock()) return owner->submit<void>([&] {
            return HarmonyAppUIHost::ShowToast{
                request.getTitle().slowToString(),request.getIcon().slowToString(),request.getDuration(),request.getMask()};
        });
        return rejected<void>("E_APP_UI_CLOSED:host is closing");
    }
    Valdi::Future<void> hideToast() override {
        if(auto owner=_owner.lock()) return owner->submit<void>([]{return HarmonyAppUIHost::HideToast{};});
        return rejected<void>("E_APP_UI_CLOSED:host is closing");
    }
private:
    std::weak_ptr<HarmonyAppUIHost> _owner;
};

HarmonyAppUIHost::HarmonyAppUIHost(napi_env env,napi_value feedback,
    Valdi::Ref<HarmonyMainThreadDispatcher> dispatcher,Valdi::Ref<Valdi::DispatchQueue> jsQueue,
    ArkUI_ContextHandle context):_env(env),_dispatcher(std::move(dispatcher)),_jsQueue(std::move(jsQueue)),_uiContext(context) {
    napi_valuetype type;
    if(!feedback || napi_typeof(env,feedback,&type)!=napi_ok || type!=napi_object)
        throw std::invalid_argument("Business bootstrap requires an AppUI feedback host");
    for(const auto* name:{"showLoading","hideLoading","showToast","hideToast"}) {
        napi_value method;
        if(napi_get_named_property(env,feedback,name,&method)!=napi_ok ||
           napi_typeof(env,method,&type)!=napi_ok || type!=napi_function)
            throw std::invalid_argument("AppUI feedback host requires four Promise methods");
    }
    napiCheck(napi_create_reference(env,feedback,1,&_feedback));
    try {
        bool hasMedia=false; napiCheck(napi_has_named_property(env,feedback,"media",&hasMedia));
        if(hasMedia){
            napi_value media,method;
            napiCheck(napi_get_named_property(env,feedback,"media",&media));
            napiCheck(napi_typeof(env,media,&type));
            if(type!=napi_undefined){
                if(type!=napi_object)throw std::invalid_argument("AppUI media must be an object or undefined");
                for(const auto* name:{"scanCode","pickAttachments","clearAttachmentCache","setOwner","close"}){
                    napiCheck(napi_get_named_property(env,media,name,&method));
                    napiCheck(napi_typeof(env,method,&type));
                    if(type!=napi_function)throw std::invalid_argument("AppUI media requires typed SDK methods");
                }
                napiCheck(napi_create_reference(env,media,1,&_media));
            }
        }
    }catch(...){napi_delete_reference(env,_feedback);_feedback=nullptr;throw;}
}
HarmonyAppUIHost::~HarmonyAppUIHost(){if(_media)closeMediaOnUI();if(_feedback)napi_delete_reference(_env,_feedback);}
Valdi::Value HarmonyAppUIHost::hostValue(){
    Valdi::Ref<Pages::AppUIHost> proxy=Valdi::makeShared<HarmonyGeneratedAppUIProxy>(weak_from_this());
    Valdi::SimpleExceptionTracker error; Valdi::Value value;
    Valdi::CppMarshaller::marshall(error,proxy,value);
    if(!error)throw std::runtime_error("E_APP_UI_PROXY:generated proxy marshalling failed");
    return value;
}
void HarmonyAppUIHost::performOnUI(uint64_t id,HarmonyNativeAppUIRequest request){
    if(!_presentationActive){completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI_BACKGROUND:page is not foreground"});return;}
    try{
        if(!_nativePresenter){
            _nativePresenter=std::make_unique<HarmonyNativeAppUIPresenter>(_uiContext,
                [dispatcher=_dispatcher](std::function<void()> task){dispatcher->dispatch(new Valdi::DispatchFunction(std::move(task)),false);},
                [weak=weak_from_this()](uint64_t requestId,HarmonyNativeAppUIResult result){
                    if(auto self=weak.lock())self->completeOnUI(requestId,std::move(result));});
            _nativePresenter->setForegroundPage(_foregroundPageId);
        }
        request.id=id; _nativePresenter->present(std::move(request));
    }catch(...){completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI:native presentation failed"});}
}
struct HarmonyAppUIHost::FeedbackCallback {
    std::weak_ptr<HarmonyAppUIHost> owner; uint64_t id; bool reject; std::shared_ptr<bool> settled;
};
napi_value HarmonyAppUIHost::feedbackResult(napi_env env,napi_callback_info info){
    napi_value undefined=nullptr; napi_get_undefined(env,&undefined);
    try{
        size_t count=0; void* raw=nullptr; napiCheck(napi_get_cb_info(env,info,&count,nullptr,nullptr,&raw));
        auto* token=static_cast<FeedbackCallback*>(raw);
        if(*token->settled)return undefined;
        *token->settled=true;
        if(auto owner=token->owner.lock();owner && !owner->_closed){
            if(token->reject)owner->completeOnUI(token->id,HarmonyNativeAppUIError{"E_APP_UI_FEEDBACK:ArkTS feedback rejected"});
            else owner->completeOnUI(token->id,std::monostate{});
        }
    }catch(...){clearException(env);}
    return undefined;
}
napi_value HarmonyAppUIHost::feedbackFunction(uint64_t id,bool reject,const std::shared_ptr<bool>& settled){
    auto token=std::make_unique<FeedbackCallback>(FeedbackCallback{weak_from_this(),id,reject,settled});
    napi_value function;
    napiCheck(napi_create_function(_env,"appUIFeedbackResult",NAPI_AUTO_LENGTH,feedbackResult,token.get(),&function));
    napiCheck(napi_add_finalizer(_env,function,token.get(),[](napi_env,void* data,void*){
        delete static_cast<FeedbackCallback*>(data);},nullptr,nullptr));
    token.release(); return function;
}
void HarmonyAppUIHost::performOnUI(uint64_t id,ShowLoading call){
    feedbackOnUI(id,"showLoading",true,[&]{
        return std::vector<napi_value>{feedbackArgument(_env,call.title,call.mask)};
    });
}
void HarmonyAppUIHost::performOnUI(uint64_t id,HideLoading){
    feedbackOnUI(id,"hideLoading",false,[]{return std::vector<napi_value>{};});
}
void HarmonyAppUIHost::performOnUI(uint64_t id,ShowToast call){
    feedbackOnUI(id,"showToast",true,[&]{
        napi_value argument=feedbackArgument(_env,call.title,call.mask),value;
        napiCheck(napi_create_string_utf8(_env,call.icon.data(),call.icon.size(),&value));
        napiCheck(napi_set_named_property(_env,argument,"icon",value));
        napiCheck(napi_create_double(_env,call.duration,&value));
        napiCheck(napi_set_named_property(_env,argument,"duration",value));
        return std::vector<napi_value>{argument};
    });
}
void HarmonyAppUIHost::performOnUI(uint64_t id,HideToast){
    feedbackOnUI(id,"hideToast",false,[]{return std::vector<napi_value>{};});
}
void HarmonyAppUIHost::feedbackOnUI(uint64_t id,const char* method,bool requiresForeground,const PrepareArguments& prepare){
    napi_handle_scope scope=nullptr;
    if(napi_open_handle_scope(_env,&scope)!=napi_ok){completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI_FEEDBACK:cannot open scope"});return;}
    try{
        if(!_presentationActive && requiresForeground)throw std::runtime_error("background");
        invokePromise(_env,_feedback,method,prepare(),[&]{
            auto settled=std::make_shared<bool>(false);
            return std::array<napi_value,2>{feedbackFunction(id,false,settled),feedbackFunction(id,true,settled)};
        });
    }catch(...){clearException(_env);completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI_FEEDBACK:typed feedback invocation failed"});}
    napi_close_handle_scope(_env,scope);
}
namespace {
napi_value mediaProperty(napi_env env,napi_value value,const char* name){
    napi_value out; napiCheck(napi_get_named_property(env,value,name,&out)); return out;
}
std::string mediaText(napi_env env,napi_value value){
    size_t size=0; napiCheck(napi_get_value_string_utf8(env,value,nullptr,0,&size));
    if(size>1048576)throw std::runtime_error("media string bounds");
    std::string out(size+1,'\0');
    napiCheck(napi_get_value_string_utf8(env,value,out.data(),out.size(),&size));out.resize(size);return out;
}
std::string mediaText(napi_env env,napi_value value,const char* name){return mediaText(env,mediaProperty(env,value,name));}
}
struct HarmonyAppUIHost::MediaCallback {
    std::weak_ptr<HarmonyAppUIHost> owner;
    uint64_t id;
    MediaResultKind kind;
    bool reject;
    std::shared_ptr<bool> settled;
};
napi_value HarmonyAppUIHost::mediaResult(napi_env env,napi_callback_info info){
    napi_value undefined=nullptr; napi_get_undefined(env,&undefined);
    MediaCallback* token=nullptr;
    std::shared_ptr<HarmonyAppUIHost> owner;
    try{
        size_t argc=1; napi_value value=undefined; void* raw=nullptr;
        napiCheck(napi_get_cb_info(env,info,&argc,&value,nullptr,&raw));
        token=static_cast<MediaCallback*>(raw);
        if(*token->settled)return undefined;
        *token->settled=true;
        owner=token->owner.lock();
        if(!owner || owner->_closed)return undefined;
        HarmonyNativeAppUIResult result;
        if(token->reject){
            // ArkTS normalizes SDK failures/cancel once. Preserve that exact
            // message through Valdi::Error and official Promise marshalling.
            std::string message=mediaText(env,value,"message");
            if(message.empty())message="E_APP_UI_MEDIA:SDK operation failed";
            result=HarmonyNativeAppUIError{std::move(message)};
        }else if(token->kind==MediaResultKind::Scan){
            result=HarmonyNativeScanReply{mediaText(env,value,"result"),mediaText(env,value,"scanType")};
        }else if(token->kind==MediaResultKind::Selection){
            HarmonyNativeAttachmentSelection reply;
            napiCheck(napi_get_value_bool(env,mediaProperty(env,value,"canceled"),&reply.canceled));
            napi_value assets=mediaProperty(env,value,"assets");bool array=false;
            napiCheck(napi_is_array(env,assets,&array));if(!array)throw std::runtime_error("media assets array");
            uint32_t count=0;napiCheck(napi_get_array_length(env,assets,&count));
            if(count>20 || (reply.canceled && count))throw std::runtime_error("media asset bounds");
            for(uint32_t index=0;index<count;++index){
                napi_value asset;napiCheck(napi_get_element(env,assets,index,&asset));
                HarmonyNativeAttachmentAsset item{mediaText(env,asset,"id"),mediaText(env,asset,"uri"),
                    mediaText(env,asset,"name"),mediaText(env,asset,"mimeType"),0};
                napiCheck(napi_get_value_double(env,mediaProperty(env,asset,"size"),&item.size));
                if(!std::isfinite(item.size) || item.size<0 || item.size>9007199254740991.0 || std::floor(item.size)!=item.size)
                    throw std::runtime_error("media asset size");
                reply.assets.push_back(std::move(item));
            }
            result=std::move(reply);
        }else{
            napi_valuetype type;napiCheck(napi_typeof(env,value,&type));
            if(type!=napi_undefined)throw std::runtime_error("media clear must fulfill undefined");
            result=std::monostate{};
        }
        owner->completeOnUI(token->id,std::move(result));
    }catch(...){
        clearException(env);
        if(owner && token)owner->completeOnUI(token->id,HarmonyNativeAppUIError{"E_APP_UI_MEDIA:invalid typed SDK result"});
    }
    return undefined;
}
napi_value HarmonyAppUIHost::mediaFunction(uint64_t id,MediaResultKind kind,bool reject,const std::shared_ptr<bool>& settled){
    auto token=std::make_unique<MediaCallback>(MediaCallback{weak_from_this(),id,kind,reject,settled});
    napi_value function;
    napiCheck(napi_create_function(_env,"appUIMediaResult",NAPI_AUTO_LENGTH,mediaResult,token.get(),&function));
    napiCheck(napi_add_finalizer(_env,function,token.get(),[](napi_env,void* data,void*){
        delete static_cast<MediaCallback*>(data);},nullptr,nullptr));
    token.release();return function;
}
void HarmonyAppUIHost::performOnUI(uint64_t id,ScanCode){
    mediaOnUI(id,"scanCode",MediaResultKind::Scan,[]{return std::vector<napi_value>{};});
}
void HarmonyAppUIHost::performOnUI(uint64_t id,PickAttachments call){
    mediaOnUI(id,"pickAttachments",MediaResultKind::Selection,[&]{
        std::vector<napi_value> args(3);
        napiCheck(napi_create_string_utf8(_env,call.source.data(),call.source.size(),&args[0]));
        napiCheck(napi_create_double(_env,call.limit,&args[1]));
        napiCheck(napi_create_array_with_length(_env,call.mimeTypes.size(),&args[2]));
        for(size_t i=0;i<call.mimeTypes.size();++i){
            napi_value text;const auto& mime=call.mimeTypes[i];
            napiCheck(napi_create_string_utf8(_env,mime.data(),mime.size(),&text));
            napiCheck(napi_set_element(_env,args[2],static_cast<uint32_t>(i),text));
        }
        return args;
    });
}
void HarmonyAppUIHost::performOnUI(uint64_t id,ClearAttachmentCache){
    mediaOnUI(id,"clearAttachmentCache",MediaResultKind::Void,[]{return std::vector<napi_value>{};});
}
void HarmonyAppUIHost::mediaOnUI(uint64_t id,const char* method,MediaResultKind resultKind,const PrepareArguments& prepare){
    napi_handle_scope scope=nullptr;
    if(napi_open_handle_scope(_env,&scope)!=napi_ok){
        completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI_MEDIA:cannot open scope"});return;
    }
    auto settled=std::make_shared<bool>(false);
    try{
        if(!_media)throw std::runtime_error("no media owner");
        invokePromise(_env,_media,method,prepare(),[&]{
            return std::array<napi_value,2>{mediaFunction(id,resultKind,false,settled),mediaFunction(id,resultKind,true,settled)};
        });
    }catch(...){
        clearException(_env);
        if(!*settled){*settled=true;completeOnUI(id,HarmonyNativeAppUIError{"E_APP_UI_MEDIA:typed SDK invocation failed"});}
    }
    napi_close_handle_scope(_env,scope);
}
void HarmonyAppUIHost::updateMediaOwnerOnUI(){
    if(!_media)return;
    napi_handle_scope scope=nullptr;
    if(napi_open_handle_scope(_env,&scope)!=napi_ok)return;
    try{
        napi_value receiver,method,args[2],ignored;
        napiCheck(napi_get_reference_value(_env,_media,&receiver));
        napiCheck(napi_get_named_property(_env,receiver,"setOwner",&method));
        napiCheck(napi_create_string_utf8(_env,_foregroundPageId.data(),_foregroundPageId.size(),&args[0]));
        napiCheck(napi_get_boolean(_env,_presentationActive,&args[1]));
        napiCheck(napi_call_function(_env,receiver,method,2,args,&ignored));
    }catch(...){clearException(_env);closeMediaOnUI();}
    napi_close_handle_scope(_env,scope);
}
void HarmonyAppUIHost::closeMediaOnUI(){
    if(!_media)return;
    const auto reference=std::exchange(_media,nullptr);
    napi_handle_scope scope=nullptr;
    if(napi_open_handle_scope(_env,&scope)==napi_ok){
        try{
            napi_value receiver,method,ignored;
            napiCheck(napi_get_reference_value(_env,reference,&receiver));
            napiCheck(napi_get_named_property(_env,receiver,"close",&method));
            napiCheck(napi_call_function(_env,receiver,method,0,nullptr,&ignored));
        }catch(...){clearException(_env);}
        napi_close_handle_scope(_env,scope);
    }
    napi_delete_reference(_env,reference);
}
void HarmonyAppUIHost::completeOnUI(uint64_t id,HarmonyNativeAppUIResult result){
    if(_closed)return;
    _jsQueue->async([self=shared_from_this(),id,result=std::move(result)]{self->finishOnJS(id,result);});
}
void HarmonyAppUIHost::finishOnJS(uint64_t id,const HarmonyNativeAppUIResult& result){
    auto entry=_pending.find(id);if(entry==_pending.end())return;
    auto pending=std::move(entry->second);_pending.erase(entry);
    pending.finish(result); // Pin survives Promise settlement/reentrant handlers.
}
void HarmonyAppUIHost::cancelPresentationsOnUI(){if(!_closed && _nativePresenter)_nativePresenter->cancelPending();}
void HarmonyAppUIHost::setForegroundPageOnUI(std::string id){
    if(_closed)return;_foregroundPageId=std::move(id);if(_nativePresenter)_nativePresenter->setForegroundPage(_foregroundPageId);
    updateMediaOwnerOnUI();
}
void HarmonyAppUIHost::setPresentationActiveOnUI(bool active){
    _presentationActive=active;if(!active)cancelPresentationsOnUI();
    if(!_closed)updateMediaOwnerOnUI();
}
void HarmonyAppUIHost::closeOnUI(){
    if(_closed.exchange(true))return;
    _jsQueue->async([self=shared_from_this()]{self->shutdownOnJS();});
    closeMediaOnUI();
    if(_nativePresenter)_nativePresenter->shutdown();
    if(_feedback){napi_delete_reference(_env,_feedback);_feedback=nullptr;}
}
void HarmonyAppUIHost::shutdownOnJS(){
    _closed=true;auto pending=std::move(_pending);_pending.clear();
    for(auto& [id,request]:pending)request.finish(HarmonyNativeAppUIError{"E_APP_UI_CLOSED:host was destroyed"});
}
} // namespace ValdiHarmony
