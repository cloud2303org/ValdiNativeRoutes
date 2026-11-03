#!/usr/bin/env python3
"""Sanitize actual Navigator foreground/finish/close method bodies with small UI collaborators."""
import os
from pathlib import Path
import subprocess
import tempfile

host = Path(__file__).resolve().parents[1]
source = (host / "HarmonyNavigator.cpp").read_text()


def method(signature):
    start = source.index(signature)
    brace = source.index("{", start)
    depth, end = 1, brace + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


methods = "\n".join(method(name) for name in (
    "void HarmonyNavigator::changed(",
    "std::string HarmonyNavigator::foregroundPageIdentity(",
    "void HarmonyNavigator::notifyForegroundPage(",
    "void HarmonyNavigator::setForegroundPageObserver(",
    "void HarmonyNavigator::finish(",
    "void HarmonyNavigator::close(",
))
prefix = r'''
#include "HarmonyNativeAppUIPresenter.hpp"
#include "HarmonyHostLifecycle.hpp"
#include <algorithm>
#include <atomic>
#include <cassert>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <utility>
namespace ValdiHarmony {
struct Value { bool isMap() const { return true; } };
void logNativeError(const char*) {}
class HarmonyNavigator {
public:
 struct Result {};
 struct Page {
   std::string id, selectedTab; bool tabs=false, removed=false;
   std::map<std::string,std::shared_ptr<Page>> tabPages;
   void* root=nullptr;
 };
 using PagePtr=std::shared_ptr<Page>;
 struct Transition { PagePtr retiring; };
 struct Manager { void setRootDragObserver(void*,std::function<void()>){} } _viewManager;
 struct Dispatcher { std::function<void()> callback; void drain(){if(callback)callback();} };
 std::shared_ptr<Dispatcher> _dispatcher=std::make_shared<Dispatcher>();
 std::shared_ptr<Transition> _transition;
 std::vector<PagePtr> _stack;
 PagePtr _mounted,_mountedTabBar,_dragRoot;
 std::atomic<bool> _closed{false};
 std::mutex _admissionMutex;
 std::map<const Result*,std::shared_ptr<Result>> _pendingResults;
 std::function<void(const Value&)> _observer;
 std::function<void(const std::string&)> _foregroundPageObserver;
 std::string _foregroundPageId;
 std::map<std::string,int> _tabSurfaces;
 void* _tabBarContent=nullptr;
 int reconciles=0, drags=0, removals=0;
 Value _host;
 void requireUI()const{}
 void reconcileTabBar(){assert(!_closed);++reconciles;}
 void updateRootDragObserver(){assert(!_closed);++drags;}
 Value navigationState()const{return {};}
 void settleTransition(){_transition=nullptr;}
 void remove(const PagePtr& p,const Value& value = {},bool canceled = true) { if(p){p->removed=true;++removals;} }
 void reconcile(){}
 void transitionTo(const PagePtr&,const PagePtr&,const Value&,bool){}
 void complete(const std::shared_ptr<Result>&){}
 void changed();
 std::string foregroundPageIdentity()const;
 void notifyForegroundPage();
 void setForegroundPageObserver(std::function<void(const std::string&)>);
 void finish(const std::string&,const Value&,bool);
 void close(bool);
 static PagePtr page(std::string id){auto p=std::make_shared<Page>();p->id=std::move(id);return p;}
};
'''
tests = r'''
}
using namespace ValdiHarmony;
int main() {
 { HarmonyNavigator n; std::vector<std::string> ids;
   n.setForegroundPageObserver([&](const std::string& id){ids.push_back(id);});
   auto root=n.page("Root"),a=n.page("A"),b=n.page("B");
   n._stack={root,a,b};n.changed();
   assert((ids==std::vector<std::string>{"","B"}));
   n.finish("A",{},false);n.changed(); // Execute actual covered-page finish.
   assert(a->removed && n._stack.back()==b && ids.size()==2);
   n._stack.push_back(n.page("C"));n.changed();assert(ids.back()=="C");
   n._mounted=root;n.changed(); // Interactive preview visual root changes only.
   assert(ids.back()=="C" && ids.size()==3);
   n._mounted=n._stack.back();n.changed();assert(ids.size()==3); // Gesture cancel.
   n._stack.pop_back();n.changed();assert(ids.back()=="B"); // Gesture commit.
 }
 { HarmonyNavigator n; auto shell=n.page("Shell");
   shell->tabs=true;shell->selectedTab="a";shell->tabPages={{"a",n.page("A")},{"b",n.page("B")}};
   n._stack={shell};std::vector<std::string> ids;
   n.setForegroundPageObserver([&](const std::string& id){ids.push_back(id);});
   assert(ids.back()=="A");
   shell->selectedTab="b";n.changed();assert(ids.back()=="B");
   shell->selectedTab="missing";auto count=shell->tabPages.size();n.changed();
   assert(ids.back().empty() && shell->tabPages.size()==count); // Observer never creates a page.
 }
 { HarmonyNavigator n; n._stack={n.page("A")};int callbacks=0;
   n.setForegroundPageObserver([&](const std::string& id){
     ++callbacks;
     if(id=="B"){n._stack={n.page("C")};n.changed();}
   });
   n._stack={n.page("B")};n.changed();
   assert(callbacks==3 && n._foregroundPageId=="C"); // Reentry publishes latest identity.
   n.changed();assert(callbacks==3);
 }
 { HarmonyNavigator n; n._stack={n.page("A")};std::vector<std::string> ids;
   n.setForegroundPageObserver([&](const std::string& id){
     ids.push_back(id);
     if(id=="B")n.close(false);
     if(id.empty())n.close(false); // Duplicate close is inert.
   });
   n._dispatcher->callback=[&]{n.changed();};
   n._stack.push_back(n.page("B"));n.changed();
   assert(n._closed && (ids==std::vector<std::string>{"A","B",""}));
   assert(n.reconciles==0 && n.drags==0 && n._stack.empty());
   n.changed();n.setForegroundPageObserver([](const std::string&){assert(false);});
   assert(ids.size()==3);
 }
 std::cout<<"PASS: actual Navigator foreground/finish/close methods; covered finish, tabs, preview, reentry, close\n";
}
'''

sdk = Path(os.environ.get("HARMONY_ETS_SDK",
    "/Users/cloud/Library/Huawei/26.0.0.865/command-line-tools/sdk/default/openharmony/ets")).parent / "native"
with tempfile.TemporaryDirectory(prefix="AppUI-navigation-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(prefix + methods + tests)
    subprocess.run(["/usr/bin/clang++", "-std=c++20", "-UNDEBUG", "-g",
                    "-fsanitize=address,undefined", "-fno-omit-frame-pointer",
                    "-I", str(host), "-idirafter", str(sdk / "sysroot/usr/include"),
                    str(cpp), "-o", str(binary)], check=True)
    environment = os.environ.copy()
    environment["ASAN_OPTIONS"] = "halt_on_error=1"
    environment["UBSAN_OPTIONS"] = "halt_on_error=1"
    subprocess.run([str(binary)], env=environment, check=True)
