// Actual production Navigator methods above; only collaborators are adapted.
using namespace ValdiHarmony;
auto str(const std::string& s){return Valdi::StringBox::fromString(s);}
Routes::ResolvedNavigation options(int ms=0) {
 Routes::ResolvedNavigation value;value.setPresentation(STRING_LITERAL("push"));
 value.setAnimation(STRING_LITERAL("slideRight"));value.setDurationMs(ms);return value;
}
struct Fixture {
 NativeRouteBoundary sdk;ManagerBoundary manager{sdk};
 std::shared_ptr<HarmonyNavigator> nav=std::make_shared<HarmonyNavigator>(manager);
 int delivered=0;bool canceled=false;Value value;std::shared_ptr<HarmonyNavigator::Result> result;
 Fixture() {
  std::vector<Routes::RouteEntry> entries;
  for(auto route:{"home","detail","wheels"})entries.emplace_back(str(route),STRING_LITERAL("valdi"),str(route),str("test"),std::nullopt);
  entries.emplace_back(STRING_LITERAL("pick"),STRING_LITERAL("native"),STRING_LITERAL("水果"),std::nullopt,STRING_LITERAL("picker"));
  entries.emplace_back(STRING_LITERAL("unknown"),STRING_LITERAL("native"),STRING_LITERAL("未知"),std::nullopt,STRING_LITERAL("nope"));
  entries.emplace_back(STRING_LITERAL("tabs"),STRING_LITERAL("tabs"),STRING_LITERAL("tabs"),std::nullopt,std::nullopt);
  nav->_declaration.setRoutes(entries);
  nav->_declaration.setRoot(STRING_LITERAL("home"));
  std::vector<Routes::RouteTab> tabs;
  for(auto route:{"home","wheels"}){Routes::RouteTab tab;tab.setRoute(str(route));tabs.push_back(tab);}
  nav->_declaration.setTabBar(Valdi::makeShared<Routes::RouteTabBar>(
   STRING_LITERAL("tabs"),STRING_LITERAL("home"),tabs,std::nullopt,std::nullopt));
  nav->reset("home",object());nav->changed();
 }
 void pump(){nav->_dispatcher->drain();nav->_runtime->js.queue.drain();sdk.drain();}
 void open(int duration=0,bool queued=false,const std::string& route="pick") {
  result=std::make_shared<HarmonyNavigator::Result>();
  result->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
   [this](const Valdi::ValueFunctionCallContext& context)->Value{
    assert(nav->_runtime->js.queue.onJS);++delivered;
    canceled=context.getParameter(1).toBool();value=context.getParameter(0);return {};
   });
  if(queued)nav->enqueue([result=result,duration,route](auto& n){
   n.push(route,object(),"push",options(duration),result);
  },result);
  else {nav->push(route,object(),"push",options(duration),result);nav->changed();}
 }
 void end(){manager.end();nav->changed();pump();}
 ~Fixture(){nav->close(false);pump();assert(manager.mounted.empty());nav.reset();sdk.drain();}
};
int main(){
 {Fixture f;
  // The registered nativeName differs deliberately from its route name.
  f.nav->validateRoute("pick");
  try{f.nav->validateRoute("unknown");assert(false);}catch(const std::runtime_error&){}
  auto count=f.nav->_stack.size();
  try{f.nav->push("unknown",object(),"push",options(),nullptr);assert(false);}catch(const std::runtime_error&){}
  assert(f.nav->_stack.size()==count);
  f.open();auto page=f.nav->_stack.back();assert(!page->tree && page->native && page->root);
  auto root=page->root;auto apple=f.sdk.named("苹果");auto raw=apple->clickData;auto click=apple->click;
  f.sdk.click("苹果");f.sdk.click("苹果");f.pump();
  assert(f.delivered==1 && !f.canceled && f.value.getMapValue("value").toString()=="苹果");
  assert(page->removed && f.nav->_stack.size()==1 && !page->native);
  assert(f.nav->_runtime->destroyed==0); // Native pages never create/destroy a Valdi context.
  root.reset();page.reset();f.pump();
 }
 {Fixture f;f.open();auto page=f.nav->_stack.back();auto native=page->native;
  auto root=page->root;auto apple=f.sdk.named("苹果");
  f.sdk.click("从原生页 push Valdi 详情页");f.pump();
  auto detail=f.nav->_stack.back();assert(detail->route=="detail");
  assert(detail->params.getMapValue("id").toDouble()==100 &&
   detail->params.getMapValue("from").toString()=="原生页");
  assert(f.nav->_transition && page->native==native && !page->nativeIdentity->eligible);
  f.sdk.click("苹果");f.pump();assert(f.delivered==0);
  f.end();assert(!page->visible && page->native==native && f.sdk.named("苹果")==apple);
  f.nav->resize({500,800});assert(root->width==500 && root->height==800);
  f.nav->goBack(1);f.nav->changed();f.end();
  assert(f.nav->_stack.back()==page && page->native==native && f.sdk.named("苹果")==apple);
  assert(page->visible && page->nativeIdentity->eligible);
  f.sdk.click("返回");f.pump();assert(f.delivered==1 && f.canceled);
 }
 {Fixture f;f.open();auto page=f.nav->_stack.back();auto identity=page->nativeIdentity;
  auto oldApple=f.sdk.named("苹果");auto oldCallback=oldApple->click;auto oldData=oldApple->clickData;
  f.nav->setActive(false);assert(!identity->eligible && !page->visible);
  f.sdk.click("苹果");f.pump();assert(f.delivered==0);
  f.nav->setActive(true);assert(identity->eligible && page->visible);
  // A queued click is invalidated across a background/foreground epoch.
  f.sdk.click("苹果");f.nav->setActive(false);f.nav->setActive(true);f.pump();assert(f.delivered==0);
  f.sdk.click("返回");f.pump();assert(f.delivered==1 && f.canceled && identity->retired);
  f.open();ArkUI_NodeEvent stale{oldData};oldCallback(&stale); // retired page, same nativeName
  assert(f.delivered==1);f.sdk.click("香蕉");f.pump();
  assert(f.delivered==2 && !f.canceled && f.value.getMapValue("value").toString()=="香蕉");
 }
 {Fixture f;f.open();int modals=0;
  f.nav->_nativeAppUI=[&](auto identity,auto epoch){
   auto exact=identity.lock();assert(exact==f.nav->_stack.back()->nativeIdentity && exact->accepts(epoch));++modals;
  };
  f.sdk.click("原生调用 showModal");assert(modals==0);f.pump();assert(modals==1);
  auto page=f.nav->_stack.back();page->visible=false;
  f.sdk.click("原生调用 showModal");f.sdk.click("苹果");f.pump();
  assert(modals==1 && f.delivered==0);
  page->visible=true;f.nav->changed();
 }
 {Fixture f;f.nav->reset("tabs",object());f.nav->changed();f.open();
  auto page=f.nav->_stack.back();f.sdk.click("原生调用 switchTab('wheels')");f.pump();
  assert(f.nav->_stack.size()==1 && f.nav->_stack.front()->selectedTab=="wheels");
  assert(page->removed && f.delivered==1 && f.canceled);
 }
 {Fixture f;f.open(300);assert(f.nav->_transition);auto page=f.nav->_stack.back();
  f.sdk.click("苹果");f.pump();assert(f.delivered==0);f.end();
  f.sdk.click("苹果");f.pump();assert(f.nav->_transition && !page->removed);
  // A duplicate click from the still-mounted exiting native root is inert.
  f.sdk.click("苹果");f.pump();assert(f.delivered==0);f.end();
  assert(f.delivered==1 && !f.canceled && page->removed);
 }
 {Fixture f;f.open();auto picker=f.nav->_stack.back();auto native=picker->native;
  f.sdk.click("从原生页 push Valdi 详情页");f.pump();f.end();
  auto detail=f.nav->_stack.back();
  f.nav->beginInteractiveBack();f.nav->progressInteractiveBack(90);
  assert(f.nav->_transition->incoming==picker && !picker->visible && picker->native==native);
  f.nav->endInteractiveBack(0,true);f.end();
  assert(f.nav->_stack.back()==detail && !picker->visible && f.delivered==0);
  f.nav->beginInteractiveBack();f.nav->progressInteractiveBack(220);
  f.nav->endInteractiveBack(0,false);f.end();
  assert(f.nav->_stack.back()==picker && picker->native==native && picker->visible && f.delivered==0);
  f.nav->beginInteractiveBack();f.nav->progressInteractiveBack(220);
  f.nav->endInteractiveBack(0,false);f.end();
  assert(picker->removed && f.delivered==1 && f.canceled);
 }
 {Fixture f;
  f.manager.failMount=true;
  try{f.open();assert(false);}catch(const std::runtime_error&){}
  f.pump();assert(f.nav->_stack.size()==1 && f.nav->_mounted==f.nav->_stack.front());
  assert(f.delivered==1 && f.canceled);
  f.open();assert(f.nav->_stack.back()->native);f.nav->close(false);f.pump();
  assert(f.delivered==2 && f.canceled && f.nav->_stack.empty());
 }
 {Fixture f;
  f.sdk.failCreate=f.sdk.createCount+3;
  try{f.open();assert(false);}catch(const std::runtime_error&){}
  f.pump();assert(f.nav->_stack.size()==1);
  f.sdk.failCreate=-1;f.open();f.sdk.click("苹果");
  f.nav->close(false);f.pump();assert(f.delivered==1 && f.canceled);
 }
 {Fixture f;
  f.open(0,true,"unknown");f.pump();
  assert(f.delivered==1 && f.canceled && f.nav->_stack.size()==1 && f.nav->_pendingResults.empty());
  f.sdk.failCreate=f.sdk.createCount+1; // backend root allocation, before adapter creation
  f.open(0,true);f.pump();
  assert(f.delivered==2 && f.canceled && f.nav->_stack.size()==1 && f.nav->_pendingResults.empty());
  f.sdk.failCreate=-1;f.open(0,true);
  f.nav->close(false);f.pump(); // admitted command not yet in the dispatcher's current batch
  assert(f.delivered==3 && f.canceled && f.nav->_pendingResults.empty());
 }
 std::cout<<"PASS actual Navigator methods: nativeName/unknown, fruit/cancel/result-once, "
  "native->detail->native retention, root transitions, sizing, push/back/tab, background/reentry, "
  "stale/duplicate callbacks, allocation/mount failure and close fences\n";
}
