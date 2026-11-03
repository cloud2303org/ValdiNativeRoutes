#include "../HarmonyPendingAppUIRequest.hpp"
#include "valdi/runtime/Context/ContextEntry.hpp"
#include "valdi/runtime/Utils/Disposable.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Marshalling/RegisteredCppGeneratedClass.hpp"
#include "valdi_core/cpp/Utils/ExceptionTracker.hpp"
#include "valdi_core/cpp/Utils/Promise.hpp"
#include <cassert>
#include <iostream>
#include <map>
#include <thread>

using namespace ValdiHarmony;
namespace Pages=snap::valdi_modules::app_pages;
struct StashedReference final:Valdi::Disposable {
    bool disposed=false;
    bool dispose(std::unique_lock<Valdi::Mutex>&) override {disposed=true;return true;}
};
template<typename T> Valdi::Ref<Valdi::Promise> bridged(const Valdi::Future<T>& future) {
    Valdi::SimpleExceptionTracker error;Valdi::Value value;
    Valdi::CppMarshaller::marshall(error,future,value);assert(error);
    auto promise=Valdi::castOrNull<Valdi::Promise>(value.getValdiObject());assert(promise!=nullptr);return promise;
}
void modalLifetime(bool shutdown) {
    StashedReference stash;
    auto context=Valdi::makeShared<Valdi::Context>(1,Valdi::Ref<Valdi::ILogger>());
    context->postInit();assert(context->insertDisposable(&stash));
    Valdi::TypedPromise<Pages::ModalReply> source;
    auto future=source.getFuture();auto promise=bridged(future);
    std::map<int,HarmonyPendingAppUIRequest> pending;
    {
        Valdi::ContextEntry entry(context);
        pending.emplace(1,HarmonyPendingAppUIRequest(source));
    }
    int calls=0;auto jsThread=std::this_thread::get_id();
    promise->onComplete([&](const Valdi::Result<Valdi::Value>& result){
        ++calls;assert(!stash.disposed && std::this_thread::get_id()==jsThread);
        if(shutdown)assert(!result && result.error().toString().find("E_APP_UI_CLOSED")!=std::string::npos);
        else {
            assert(result);Pages::ModalReply reply;Valdi::SimpleExceptionTracker error;
            Valdi::CppMarshaller::unmarshall(error,result.value(),reply);assert(error);
            assert(reply.getConfirm() && !reply.getCancel() && reply.getContent().toStringView()=="edited");
        }
    });
    std::thread ui([context]{context->onDestroy();});ui.join();
    assert(context->isDestroyed() && !stash.disposed);
    {
        auto held=std::move(pending.at(1));pending.erase(1);
        if(shutdown)held.finish(HarmonyNativeAppUIError{"E_APP_UI_CLOSED:host was destroyed"});
        else held.finish(HarmonyNativeModalReply{true,false,"edited"});
        assert(calls==1 && !stash.disposed && pending.empty());
        // Production retires map admission before settling. A late duplicate
        // never obtains this TypedPromise and cannot settle it twice.
        assert(pending.find(1)==pending.end());
    }
    assert(stash.disposed);
    int late=0;promise->onComplete([&](const auto&){++late;});assert(late==1);
}
void voidAndTypedSelection() {
    Valdi::TypedPromise<void> voidSource;auto promise=bridged(voidSource.getFuture());
    int calls=0;promise->onComplete([&](const auto& result){++calls;assert(result && result.value().isUndefined());});
    {HarmonyPendingAppUIRequest pending(voidSource);pending.finish(std::monostate{});}
    assert(calls==1);
    Valdi::TypedPromise<Pages::PresentationReply> source;auto selection=bridged(source.getFuture());
    selection->onComplete([&](const auto& result){
        assert(result);Pages::PresentationReply value;Valdi::SimpleExceptionTracker error;
        Valdi::CppMarshaller::unmarshall(error,result.value(),value);assert(error);
        assert(value.getCancel() && value.getValue().toStringView().empty() && value.getIndex()==-1);
    });
    {HarmonyPendingAppUIRequest pending(source);pending.finish(HarmonyNativePresentationReply{false,true,"",-1});}
}
void cancellationAndWrongNativeVariant() {
    Valdi::TypedPromise<void> source;auto promise=bridged(source.getFuture());
    int calls=0;promise->onComplete([&](const auto& result){++calls;assert(!result);});
    promise->cancel();assert(calls==1);
    {HarmonyPendingAppUIRequest pending(source);pending.finish(std::monostate{});}
    assert(calls==1); // Official ResolvablePromise drops a late native fulfillment.
    Valdi::TypedPromise<Pages::ModalReply> modal;auto result=bridged(modal.getFuture());
    result->onComplete([](const auto& value){assert(!value && value.error().toString().find("INTERNAL")!=std::string::npos);});
    {HarmonyPendingAppUIRequest pending(modal);pending.finish(std::monostate{});}
}
int main(){
    static_assert(std::is_base_of_v<Valdi::CppGeneratedInterface,Pages::AppUIHost>);
    auto schema=Pages::AppUIHost::getRegisteredClass()->getResolvedClassSchema();assert(schema && schema.value()->isInterface());
    modalLifetime(false);modalLifetime(true);voidAndTypedSelection();cancellationAndWrongNativeVariant();
    std::cout<<"PASS: canonical generated proxy schema, real typed Future/ResolvablePromise, undefined void, page pin/cancel lifetime\n";
}
