#!/usr/bin/env python3
"""Extract real production route admission/validation/changed bodies; use real generated route models."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[7]
    host = root / "harmony/entry/src/main/cpp/host"
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
        "void HarmonyNavigator::enqueue(", "void HarmonyNavigator::setInitialRoutesAccepted(",
        "void HarmonyNavigator::changed(", "void HarmonyNavigator::setObserver(",
        "void HarmonyNavigator::updateRoutes(", "void HarmonyNavigator::reportError(",
    ))
    # Compile the exact initial-publication entry body too (no regenerated TS/API).
    entry = 'self.enqueue([=](auto& nav) { nav.updateRoutes(declaration); }, nullptr, true);'
    if source.count(entry) != 1:
        raise RuntimeError("Initial publication entry changed; inspect production adapter before updating test")
    prefix = r'''
#include "HarmonyOTALaunch.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include "valdi_core/cpp/Interfaces/IMainThreadDispatcher.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include <algorithm>
#include <atomic>
#include <cassert>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <stdexcept>
#include <utility>
#include <vector>
namespace ValdiHarmony {
using Value = Valdi::Value;
namespace Routes = snap::valdi_modules::app_pages;
void logNativeError(const char*) {}
Value object() { return Value(Valdi::makeShared<Valdi::ValueMap>()); }
class HarmonyNavigator : public std::enable_shared_from_this<HarmonyNavigator> {
public:
 struct Result {};
 struct Page { std::string route, selectedTab; Value params; };
 using Command=std::function<void(HarmonyNavigator&)>;
 struct Dispatcher {
   std::deque<std::unique_ptr<Valdi::DispatchFunction>> queue;
   void dispatch(Valdi::DispatchFunction* fn,bool sync) { assert(!sync); queue.emplace_back(fn); }
   void drain() { while(!queue.empty()){auto task=std::move(queue.front());queue.pop_front();(*task)();} }
 };
 std::shared_ptr<Dispatcher> _dispatcher=std::make_shared<Dispatcher>();
 std::atomic<bool> _closed{false};
 std::mutex _admissionMutex;
 uint64_t _routePublications=0;
 std::map<const Result*,std::shared_ptr<Result>> _pendingResults;
 std::function<void()> _initialRoutesAccepted;
 std::function<void(const Value&)> _observer;
 std::string _error;
 Routes::RouteDeclaration _declaration;
 std::vector<std::shared_ptr<Page>> _stack;
 std::vector<std::string> trace;
 bool resetFails=false;
 std::shared_ptr<HarmonyOTALaunch> launch=std::make_shared<HarmonyOTALaunch>();
 uint64_t generation=launch->begin();
 void requireUI()const{}
 void complete(const std::shared_ptr<Result>&) {}
 void notifyForegroundPage(){ trace.push_back("foreground"); }
 void reconcileTabBar(){ trace.push_back("tab"); }
 void updateRootDragObserver(){ trace.push_back("drag"); }
 Value navigationState()const{return object();}
 void settleTransition(){}
 void reset(const std::string&,const Value&){
   trace.push_back("routes");
   if(resetFails)throw std::runtime_error("backend route command failed");
 }
 void close(){
   launch->close(); // Same invalidation called first by RuntimeHost::unmount.
   _closed=true;
 }
 void enqueue(Command,const std::shared_ptr<Result>& = nullptr,bool=false);
 void setInitialRoutesAccepted(std::function<void()>);
 void changed();
 void setObserver(std::function<void(const Value&)>);
 void updateRoutes(const Routes::RouteDeclaration&);
 void reportError(const std::string&);
 void publish(const Routes::RouteDeclaration& declaration) { auto& self=*this;
''' + entry + r'''
 }
};
'''
    tests = r'''
}
using namespace ValdiHarmony;
Routes::RouteDeclaration table(bool valid=true) {
 Routes::RouteEntry entry(STRING_LITERAL("Home"),STRING_LITERAL("native"),STRING_LITERAL("Home"),
   std::nullopt,STRING_LITERAL("Home"));
 return Routes::RouteDeclaration({entry},{},valid?STRING_LITERAL("Home"):STRING_LITERAL("Missing"));
}
int main(){
 int checks=0;
 auto setup=[&] {
   auto nav=std::make_shared<HarmonyNavigator>();
   std::weak_ptr<HarmonyOTALaunch> weak=nav->launch; auto generation=nav->generation;
   nav->setInitialRoutesAccepted([&,weak,generation]{
     if(auto owner=weak.lock())owner->accept(generation,[&]{++checks;});
   });
   return nav;
 };
 { auto n=setup(); n->setObserver([](const auto&){}); assert(checks==0);
   n->enqueue([](auto&){});n->_dispatcher->drain();assert(checks==0);
   n->publish(table());n->_dispatcher->drain();assert(checks==1);
   assert(n->_error.empty() && n->_declaration.getRoot()==STRING_LITERAL("Home"));
   n->publish(table());n->_dispatcher->drain();assert(checks==1);
   bool rejected=false;try{n->setInitialRoutesAccepted([]{});}catch(...){rejected=true;}assert(rejected);
 }
 { auto before=checks;auto n=setup();n->publish(table(false));n->_dispatcher->drain();
   assert(checks==before && !n->_error.empty());
   n->publish(table());n->_dispatcher->drain();assert(checks==before); }
 { auto before=checks;auto n=setup();n->resetFails=true;n->publish(table());n->_dispatcher->drain();
   assert(checks==before && !n->_error.empty()); }
 { auto before=checks;auto n=setup();n->_observer=[&](const auto&){n->close();};
   n->publish(table());n->_dispatcher->drain();assert(checks==before && n->_closed); }
 { auto before=checks;auto n=setup();bool superseded=false;
   n->_observer=[&](const auto&){if(!superseded){superseded=true;n->publish(table());}};
   n->publish(table());n->_dispatcher->drain();assert(checks==before && n->_routePublications==2); }
 { auto before=checks;auto n=setup();n->publish(table());n->publish(table());
   n->_dispatcher->drain();assert(checks==before); }
 { auto before=checks;auto n=setup();bool thrown=false;
   n->_observer=[&](const auto&){if(!thrown){thrown=true;throw std::runtime_error("changed failed");}};
   n->publish(table());n->_dispatcher->drain();assert(checks==before && !n->_error.empty()); }
 { auto before=checks;auto n=setup();n->_observer=[&](const auto&){n->launch->fail();};
   n->publish(table());n->_dispatcher->drain();assert(checks==before); }
 { auto before=checks;auto n=setup();n->_observer=[&](const auto&){n->launch->begin();};
   n->publish(table());n->_dispatcher->drain();assert(checks==before); }
 { auto before=checks;auto n=setup();n->publish(table());n->close();
   n->_dispatcher->drain();assert(checks==before); }
 { auto before=checks;auto n=setup();n->publish(table());n->launch.reset();
   n->_dispatcher->drain();assert(checks==before); }
 std::cout<<"PASS 11 production route/changed/ack scenarios with actual generated route models\n";
}
'''
    cpp = output / "route-acceptance.cpp"
    cpp.write_text(prefix + methods + tests)
    native = root / "harmony/business-build/.artifacts/host"
    row = next(row for row in json.loads((native / "compile_commands.json").read_text())
               if row["file"].endswith("/Runtime.cpp"))
    args = shlex.split(row["command"])
    flags = args[1:]
    del flags[flags.index("-o"):flags.index("-o") + 2]
    del flags[flags.index("-c"):flags.index("-c") + 2]
    flags += ["-I" + str(host), "-I" + str(root / "valdi/native/generated"),
              "-UNDEBUG", "-O1", "-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all"]
    objects = []
    for index, unit in enumerate([cpp, root / "valdi/native/generated/valdi_modules/app_pages/app_pages.cpp"]):
        obj = output / f"{index}.o"
        subprocess.run([args[0], *flags, "-c", str(unit), "-o", str(obj)], check=True)
        objects.append(obj)
    binary = output / "route-acceptance"
    subprocess.run([args[0], *flags, "-Wl,-dead_strip", *map(str, objects),
                    str(native / "libreal_valdi_host.a"), str(native / "deps/fmt/libfmt.a"),
                    str(native / "deps/jsoncpp/src/lib_json/libjsoncpp.a"), "-o", str(binary)], check=True)
    environment = os.environ.copy()
    environment.update({"ASAN_OPTIONS": "halt_on_error=1", "UBSAN_OPTIONS": "halt_on_error=1"})
    subprocess.run([str(binary)], check=True, env=environment)


if __name__ == "__main__":
    main()
