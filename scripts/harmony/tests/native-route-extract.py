#!/usr/bin/env python3
"""Compile production Navigator methods with explicit runtime/backend boundaries.

No substitute navigation algorithm: all stack mutations, permission checks,
native action creation, transitions, sizing, results and retirement below are
extracted verbatim. Only root/tree/runtime/dispatcher types are adapted so the
test can execute on macOS without an OHOS window or full runtime link.
"""
import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / "harmony/entry/src/main/cpp/host"
current = (HOST / "HarmonyNavigator.cpp").read_text()
source = Path(sys.argv[1]).read_text()


def block(text, signature):
    start = text.index(signature)
    brace = text.index("{", start)
    depth, end = 1, brace + 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[start:end]


signatures = (
    "const Routes::RouteEntry* HarmonyNavigator::routeDefinition(",
    "void HarmonyNavigator::validateRoute(",
    "void HarmonyNavigator::validateTab(",
    "HarmonyNavigator::PagePtr HarmonyNavigator::entry(",
    "HarmonyNavigator::PagePtr HarmonyNavigator::front(",
    "void HarmonyNavigator::createNative(",
    "void HarmonyNavigator::sizePage(",
    "bool HarmonyNavigator::nativeActionAllowed(",
    "void HarmonyNavigator::syncNativeActions(",
    "void HarmonyNavigator::updateViewModel(",
    "void HarmonyNavigator::mountPage(",
    "void HarmonyNavigator::parkPage(",
    "void HarmonyNavigator::reconcile(",
    "void HarmonyNavigator::transitionTo(",
    "void HarmonyNavigator::settleTransition(",
    "bool HarmonyNavigator::interactiveBackEnabled(",
    "void HarmonyNavigator::beginInteractiveBack(",
    "void HarmonyNavigator::progressInteractiveBack(",
    "void HarmonyNavigator::endInteractiveBack(",
    "void HarmonyNavigator::finishTransition(",
    "void HarmonyNavigator::remove(",
    "void HarmonyNavigator::keep(",
    "void HarmonyNavigator::push(",
    "void HarmonyNavigator::reset(",
    "void HarmonyNavigator::goBack(",
    "void HarmonyNavigator::finish(",
    "void HarmonyNavigator::switchTab(",
    "void HarmonyNavigator::selectShellTab(",
    "void HarmonyNavigator::resize(",
    "void HarmonyNavigator::setActive(",
    "void HarmonyNavigator::close(",
    "void HarmonyNavigator::complete(",
    "void HarmonyNavigator::enqueue(",
    "void HarmonyNavigator::changed(",
    "std::string HarmonyNavigator::foregroundPageIdentity(",
    "void HarmonyNavigator::notifyForegroundPage(",
)
# Negative controls intentionally swap just actual historical method bodies.
# Added native methods still come from current production, never a test model.
methods = [block(source if sig in source else current, sig) for sig in signatures]
declarations = "\n".join(m.split("{", 1)[0].replace("HarmonyNavigator::", "") + ";" for m in methods)
page = block(current, "struct HarmonyNavigator::Page {").replace("struct HarmonyNavigator::Page", "struct Page")
page = page.replace("Valdi::SharedViewNodeTree", "std::shared_ptr<TreeBoundary>")
page = page.replace("Valdi::Ref<Valdi::View>", "std::shared_ptr<ArkUI_Node>")
transition = block(current, "struct HarmonyNavigator::Transition {").replace("struct HarmonyNavigator::Transition", "struct Transition")
transition = transition.replace("Valdi::NativeAnimator", "std::shared_ptr<AnimatorBoundary>")
result = block(current, "struct HarmonyNavigator::Result {").replace("struct HarmonyNavigator::Result", "struct Result")
adaptations = {
    "std::make_shared<Valdi::Ref<Valdi::View>>(page->root)": "page->root",
}
body = "\n\n".join(methods)
for before, after in adaptations.items():
    body = body.replace(before, after)

prefix = r'''
#include "HarmonyNativeScreens.hpp"
#include "HarmonyHostLifecycle.hpp"
#include "HarmonyNativeAppUIPresenter.hpp"
#include "../backend/ArkUIViewManager.hpp"
#include "native-route-boundary.hpp"
#include "valdi_core/cpp/Utils/LazyValueConvertible.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include <atomic>
#include <chrono>
#include <cmath>
#include <exception>
#include <iostream>
#include <mutex>
#include <utility>

namespace ValdiHarmony {
using Valdi::Value;
namespace Routes=snap::valdi_modules::app_pages;
Value object(){return Value(Valdi::makeShared<Valdi::ValueMap>());}
Value dictionary(const Value& value){assert(value.isMap());return value;}
template<typename T>Value marshalled(const T& value){
 Valdi::SimpleExceptionTracker tracker;Value out;Valdi::CppMarshaller::marshall(tracker,value,out);
 assert(tracker);return out;
}
void logNativeError(const char* message){std::cerr<<message<<"\n";}
struct QueueBoundary {
 std::deque<std::function<void()>> tasks;
 bool onJS=false;
 void async(std::function<void()> task){tasks.push_back(std::move(task));}
 void drain(){auto batch=std::move(tasks);tasks.clear();onJS=true;for(auto& t:batch)t();onJS=false;}
};
struct ContextBoundary {template<typename T>void setViewModel(T){}};
struct TreeBoundary {
 int layouts=0;Valdi::Size size;std::shared_ptr<ContextBoundary> context=std::make_shared<ContextBoundary>();
 void setLayoutSpecs(Valdi::Size s,auto){++layouts;size=s;}
 auto getContext(){return context;}
};
struct JSBoundary {
 QueueBoundary queue;
 bool isInJsThread(){return queue.onJS;}
 auto getJsDispatchQueue(){return &queue;}
};
struct RuntimeBoundary {
 JSBoundary js;int destroyed=0;
 auto getJavaScriptRuntime(){return &js;}
 void destroyContext(auto){++destroyed;}
};
struct DispatcherBoundary {
 std::deque<std::function<void()>> tasks;
 bool isUIThread(){return true;}
 void dispatch(Valdi::DispatchFunction* task,bool sync){
  assert(!sync);auto owner=std::shared_ptr<Valdi::DispatchFunction>(task);
  tasks.push_back([owner]{(*owner)();});
 }
 void drain(){auto batch=std::move(tasks);tasks.clear();for(auto& task:batch)task();}
};
struct AnimatorBoundary {
 std::function<void(bool)> callback;
 void cancel(){if(callback){auto cb=std::exchange(callback,{});cb(true);}}
};
struct ManagerBoundary {
 NativeRouteBoundary& sdk;bool failMount=false;int mounts=0,unmounts=0,sizes=0;
 std::set<ArkUI_Node*> mounted;std::function<void(bool)> completion;
 using Root=std::shared_ptr<ArkUI_Node>;
 struct Tween{Root root;Valdi::Harmony::RootVisualState from,to;};
 Root createRootView(){return sdk.root();}
 ArkUI_NodeHandle nativeNode(const Root& r){return r.get();}
 void setRootSize(const Root& r,Valdi::Size size){assert(r);++sizes;r->width=size.width;r->height=size.height;}
 void mountRoot(const Root& r,ArkUI_NodeContentHandle,int=-1){
  assert(r);if(std::exchange(failMount,false))throw std::runtime_error("mount failure");
  mounted.insert(r.get());++mounts;
 }
 void unmountRoot(const Root& r){mounted.erase(r.get());++unmounts;}
 void setRootVisualState(const Root&,Valdi::Harmony::RootVisualState){}
 void setRootDragObserver(const Root&,Valdi::Harmony::RootDragObserver){}
 void cancelRootAnimations(const Root&){}
 std::shared_ptr<AnimatorBoundary> tweenRoots(std::initializer_list<Tween>,
  const Valdi::Harmony::NativeTweenOptions&,std::function<void(bool)> callback){
  completion=callback;auto result=std::make_shared<AnimatorBoundary>();result->callback=callback;return result;
 }
 void end(){auto cb=std::exchange(completion,{});if(cb)cb(false);}
};
class HarmonyNavigator:public std::enable_shared_from_this<HarmonyNavigator>{
public:
 struct Page;struct Result;struct Transition;
 using PagePtr=std::shared_ptr<Page>;using Command=std::function<void(HarmonyNavigator&)>;
'''
fields = r'''
 std::shared_ptr<RuntimeBoundary> _runtime=std::make_shared<RuntimeBoundary>();
 std::shared_ptr<DispatcherBoundary> _dispatcher=std::make_shared<DispatcherBoundary>();
 ManagerBoundary& _viewManager;
 ArkUI_NodeContentHandle _content=reinterpret_cast<ArkUI_NodeContentHandle>(1),_tabBarContent=nullptr;
 Valdi::Size _size{360,640};
 struct Insets{double top=0,bottom=0,left=0,right=0,tabBarHeight=0;} _insets;
 HarmonyNativeScreens _nativeScreens;HarmonyNativeAppUI _nativeAppUI;
 float _nativeScale=1;
 Routes::RouteDeclaration _declaration;
 std::vector<PagePtr> _stack;PagePtr _mounted,_mountedTabBar,_dragRoot;
 std::shared_ptr<Transition> _transition;
 uint64_t _nextId=1,_nextTransitionId=1,_routePublications=0;
 bool _active=true;std::atomic<bool> _closed{false};std::mutex _admissionMutex;
 std::map<const Result*,std::shared_ptr<Result>> _pendingResults;
 std::map<std::string,std::map<std::string,ArkUI_NodeContentHandle>> _tabSurfaces;
 std::function<void()> _initialRoutesAccepted;
 std::function<void(const Value&)> _observer;
 std::function<void(const std::string&)> _foregroundPageObserver;
 std::string _foregroundPageId,_error,_statusBarStyle="auto";Value _host;
 explicit HarmonyNavigator(ManagerBoundary& manager):_viewManager(manager){}
 void requireUI()const{}
 void reportError(const std::string& e){_error=e;}
 Value navigationState()const{return object();}
 Value viewModel(const PagePtr&)const{return object();}
 bool customTabBar()const{return false;}
 ArkUI_NodeContentHandle tabSurface(const PagePtr&)const{return nullptr;}
 void reconcileTabBar(){}
 void updateRootDragObserver(){}
 void logInteractiveBack(const std::shared_ptr<Transition>&,const char*)const{}
 void createTree(const PagePtr& page){
  page->tree=std::make_shared<TreeBoundary>();page->root=_viewManager.createRootView();sizePage(page);
 }
 void perform(const Command& command){if(!_closed){command(*this);changed();}}
 void enqueue(Command,const std::shared_ptr<Result>& = nullptr,bool=false);
 void complete(const std::shared_ptr<Result>&,Value={},bool=true);
 void entryDefaults();
 void transitionTo(const PagePtr&,const PagePtr& = nullptr,const Value& = {},bool=true);
 void reconcile(const std::string& = "navigation");
 void remove(const PagePtr&,const Value& = {},bool=true);
 void mountPage(const PagePtr&,ArkUI_NodeContentHandle,int = -1);
 PagePtr entry(const std::string&,const Value&,const std::string& = "push",
               const std::shared_ptr<Result>& = nullptr,const std::string& = "");
};
'''
# Supply default arguments once, on declarations. Methods themselves are exact.
skip = {"enqueue", "complete", "transitionTo", "reconcile", "remove", "entry", "mountPage"}
declarations = "\n".join(d for d in declarations.splitlines()
                         if not any((" " + name + "(") in d or d.startswith(name + "(") for name in skip))
# Multi-line declarations need a real parser: regenerate per method instead.
declarations = "\n".join(
    m.split("{", 1)[0].replace("HarmonyNavigator::", "") + ";"
    for m in methods if re.search(r"HarmonyNavigator::(\w+)\(", m).group(1) not in skip)

tests = (ROOT / "scripts/harmony/tests/native-route-navigator.inc").read_text()
output = Path(sys.argv[2])
animation = block(current, "struct RouteAnimation {") + ";\n" + block(current, "RouteAnimation validateOptions(")
prefix = prefix.replace("class HarmonyNavigator:", animation + "\nclass HarmonyNavigator:")
output.write_text(prefix + result + ";\n" + page + ";\n" + transition + ";\n" +
                  declarations + fields + "\n" + body + "\n}\n" + tests)
output.with_suffix(".extraction.json").write_text(json.dumps({
    "source": str(Path(sys.argv[1]).resolve()), "currentNativeMethods": str(HOST / "HarmonyNavigator.cpp"),
    "methodSignatures": signatures, "adaptedTypes": [
        "ViewNodeTree -> TreeBoundary", "Ref<View> -> shared_ptr<SDK root>",
        "NativeAnimator -> AnimatorBoundary", "runtime/backend/dispatcher -> explicit boundaries"],
    "expressionAdaptations": adaptations,
    "navigationAlgorithmReimplemented": False}, indent=2))
