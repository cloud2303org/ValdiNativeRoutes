from pathlib import Path
import subprocess
import tempfile
source = (Path(__file__).resolve().parents[1] / 'HarmonyRuntimeHost.cpp').read_text()
def method(name):
    start=source.index(name)
    brace=source.index('{', start)
    depth=1; end=brace+1
    while depth:
        depth += (source[end]=='{') - (source[end]=='}')
        end += 1
    return source[start:end]
methods='\n'.join(method(n) for n in ['void HarmonyRuntimeHost::setActive(', 'bool HarmonyRuntimeHost::activityCurrent(', 'void HarmonyRuntimeHost::applyActivity('])
prefix=r'''
#include <cassert>
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
struct HostConfiguration { std::string storageRoot; int revision = 0; };
struct Queue {
 std::vector<std::function<void()>> tasks;
 template<class F> void async(F fn) { tasks.emplace_back(std::move(fn)); }
 void drain() { for (size_t i=0;i<tasks.size();++i) tasks[i](); tasks.clear(); }
};
struct Bridge {
 bool active=true; std::vector<bool> events; int revision=0;
 void updateConfiguration(HostConfiguration c) { revision=c.revision; }
 void setActive(bool v) { active=v; events.push_back(v); }
};
struct Runtime { std::shared_ptr<Queue> queue=std::make_shared<Queue>(); Runtime* getJavaScriptRuntime(){return this;} std::shared_ptr<Queue> getJsDispatchQueue(){return queue;} };
struct Endpoint {
 bool active=true, destroyed=false; int calls=0, depth=0, maxDepth=0;
 std::function<void(bool)> callback;
 void apply(bool v) {
   assert(!destroyed); ++calls; ++depth; if(depth>maxDepth)maxDepth=depth;
   active=v; if(callback)callback(v); --depth;
 }
 void setSuspended(bool v){apply(!v);}
 void applicationDidResume(){apply(true);}
 void applicationWillPause(){apply(false);}
 void setActive(bool v){apply(v);}
};
class HarmonyRuntimeHost {
public:
 HostConfiguration _configuration{"storage"}; bool _active=true,_closing=false;
 uint64_t _activityGeneration=0; bool _applyingActivity=false;
 bool _backendActive=true,_managerActive=true,_navigatorActive=true;
 std::shared_ptr<Endpoint> _viewManager=std::make_shared<Endpoint>();
 std::shared_ptr<Endpoint> _manager=std::make_shared<Endpoint>();
 std::shared_ptr<Endpoint> _navigator=std::make_shared<Endpoint>();
 std::shared_ptr<Runtime> _runtime=std::make_shared<Runtime>();
 std::shared_ptr<Bridge> _bridgeState=std::make_shared<Bridge>();
 void setActive(bool,HostConfiguration); bool activityCurrent(uint64_t)const; void applyActivity();
 void close() { _closing=true; _active=false; ++_activityGeneration; _manager->destroyed=true; }
 void assertActive(bool value){assert(_active==value); assert(_viewManager->active==value); assert(_manager->active==value); assert(_navigator->active==value); _runtime->queue->drain(); assert(_bridgeState->active==value); assert(!_applyingActivity);}
};
'''
tests=r'''
int main(){
 { HarmonyRuntimeHost h; h.setActive(false,{}); h.assertActive(false); h.setActive(true,{}); h.assertActive(true); }
 // Original bug: foreground from the synchronous background navigation observer.
 { HarmonyRuntimeHost h; bool fired=false;
   h._navigator->callback=[&](bool active){if(!active&&!fired){fired=true; assert(!h._active); h.setActive(true,{"",7});}};
   h.setActive(false,{}); h.assertActive(true); assert(h._manager->calls==0); assert(h._viewManager->calls==0);
   assert(h._bridgeState->revision==7); assert((h._bridgeState->events==std::vector<bool>{false,true})); }
 // Observer destruction must not call a manager already in teardown.
 { HarmonyRuntimeHost h; h._navigator->callback=[&](bool active){if(!active)h.close();};
   h.setActive(false,{}); assert(h._closing); assert(h._manager->calls==0); assert(h._viewManager->calls==0); assert(!h._applyingActivity); }
 // Backend callbacks can supersede a request, without nesting backend operations.
 { HarmonyRuntimeHost h; bool fired=false;
   h._viewManager->callback=[&](bool active){if(!active&&!fired){fired=true; h.setActive(true,{});}};
   h.setActive(false,{}); h.assertActive(true); assert(h._viewManager->maxDepth==1); assert(h._manager->calls==0); }
 // Background during foreground resume must finish with all consumers background.
 { HarmonyRuntimeHost h; h.setActive(false,{}); h.assertActive(false); bool fired=false;
   h._viewManager->callback=[&](bool active){if(active&&!fired){fired=true; h.setActive(false,{});}};
   h.setActive(true,{}); h.assertActive(false); assert(h._viewManager->maxDepth==1); assert(h._manager->calls==1); }
 // Manager callbacks can request the opposite lifecycle; old generation stops.
 { HarmonyRuntimeHost h; bool fired=false;
   h._manager->callback=[&](bool active){if(!active&&!fired){fired=true; h.setActive(true,{});}};
   h.setActive(false,{}); h.assertActive(true); assert(h._manager->maxDepth==1); }
 // A same-state reentrant request does not repeatedly notify navigation.
 { HarmonyRuntimeHost h; h._navigator->callback=[&](bool active){h.setActive(active,{});};
   h.setActive(false,{}); h.assertActive(false); assert(h._navigator->calls==1); }
 // Latest of multiple nested requests wins, with ordered owned bridge tasks.
 { HarmonyRuntimeHost h; bool fired=false;
   h._navigator->callback=[&](bool active){if(!active&&!fired){fired=true; h.setActive(true,{"",2}); h.setActive(false,{"",3});}};
   h.setActive(false,{}); h.assertActive(false); assert(h._bridgeState->revision==3); assert(h._navigator->calls==1); }
 // Destruction from a backend callback also blocks stale manager continuation.
 { HarmonyRuntimeHost h; h._viewManager->callback=[&](bool active){if(!active)h.close();};
   h.setActive(false,{}); assert(h._closing); assert(h._manager->calls==0); }
 std::cout<<"PASS 9 activity reentrancy scenarios using extracted production method bodies\n";
}
'''
output=Path(tempfile.mkdtemp(prefix='valdi-host-activity-'))
path=output / 'activity.cpp'; path.write_text(prefix+methods+tests)
subprocess.run(['c++','-std=c++20','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-g',str(path),'-o',str(output / 'activity')],check=True)
subprocess.run([str(output / 'activity')],check=True)
