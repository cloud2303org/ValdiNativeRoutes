// Actual production Navigator methods above; only collaborators are adapted.
using namespace ValdiHarmony;
using SheetEndReason = Valdi::Harmony::SheetInteractionEndReason;
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

void sheet(Fixture& f,const std::string& kind="sheet",const std::string& route="detail") {
 f.result=std::make_shared<HarmonyNavigator::Result>();
 f.result->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
  [&f](const Valdi::ValueFunctionCallContext& c)->Value{
   assert(f.nav->_runtime->js.queue.onJS);
   sheetTrace.push_back("result");++f.delivered;
   f.canceled=c.getParameter(1).toBool();f.value=c.getParameter(0);return {};
  });
 auto caller=f.nav->_sheetMounted ? f.nav->_sheetMounted : f.nav->_mounted;
 ContextBoundary::current=caller && caller->tree ? caller->tree->getContext() : nullptr;
 f.nav->captureResultCaller(*f.result);ContextBoundary::current.reset();
 f.nav->enqueue([result=f.result,kind,route](auto& nav){
  nav.push(route,object(),kind,options(),result);
 },f.result);
 f.nav->_dispatcher->drain();f.nav->changed();
}
void settled(Fixture& f) {
 auto surface=f.nav->_sheetSurface;assert(surface);surface->end();f.pump();
}
void detachedBeforeDelivery() {
 auto detach=std::find(sheetTrace.begin(),sheetTrace.end(),"panel-detach");
 auto unmount=std::find(sheetTrace.begin(),sheetTrace.end(),"page-unmount");
 auto scheduled=std::find(sheetTrace.begin(),sheetTrace.end(),"js-schedule");
 assert(unmount!=sheetTrace.end() && detach!=sheetTrace.end() && scheduled!=sheetTrace.end());
 assert(unmount<detach && detach<scheduled);
}
int main(){
 {Fixture f;sheet(f);auto page=f.nav->_sheet;auto base=f.nav->_mounted;
  assert(page && page!=base && f.nav->_stack.size()==1 && base->visible && page->visible);
  assert(!f.nav->interactiveBackEnabled());
  assert(f.nav->foregroundPageIdentity()==page->id);
  auto pages=f.nav->pagesValue();assert(pages.getArray()->size()==2);
  f.nav->push("wheels",object(),"push",options(),nullptr);f.nav->changed();
  assert(f.nav->_sheet==page && f.nav->_stack.size()==2 && page->visible && f.nav->_mounted->visible);
  assert(f.nav->foregroundPageIdentity()==page->id);
  sheetTrace.clear();auto result=object();result.setMapValue("answer",Value(42.0));
  f.nav->finish(page->id,result,false);assert(f.nav->_sheet==page && f.delivered==0);
  assert(f.nav->_sheetSurface->active && !f.nav->_sheetSurface->inputEnabled);
  f.nav->finish(page->id,{},true);f.nav->back();assert(f.nav->_sheet==page);
  settled(f);detachedBeforeDelivery();assert(f.delivered==1 && !f.canceled && page->removed);
  assert(f.value.getMapValue("answer").toDouble()==42 && f.nav->_stack.size()==2);
 }
 {Fixture f;sheet(f);auto old=f.nav->_sheetSurface;auto callback=old->scrim;
  callback();assert(f.nav->_sheetClosing);settled(f);assert(f.delivered==1 && f.canceled);
  sheet(f,"compactSheet");auto replacement=f.nav->_sheet;
  callback();assert(f.nav->_sheet==replacement && !f.nav->_sheetClosing);
  f.nav->back();settled(f);assert(f.delivered==2);
 }
 {Fixture f;sheet(f);auto first=f.nav->_sheet;
  sheet(f,"compactSheet","wheels");
  assert(f.nav->_sheet==first && f.nav->_stack.size()==2 && f.nav->_stack.back()->route=="wheels");
  assert(!f.nav->_stack.back()->sheetPage && first->visible && f.nav->_stack.back()->visible);
 }
 {Fixture f;sheet(f,"compactSheet");auto page=f.nav->_sheet;
  f.nav->resize({360,500});f.nav->setSheetWindowMetrics(800,500,300,34);
  auto geometry=f.nav->sheetGeometry();
  assert(geometry.contentHeight>=0 && geometry.contentHeight<=340);
  assert(page->root->height==int(geometry.contentHeight));
  f.nav->setActive(false);assert(f.nav->_sheet==page && !page->visible && !f.nav->_mounted->visible);
  assert(!f.nav->_sheetSurface->active && f.nav->_sheetSurface->currentOffset()==0);
  f.nav->setActive(true);assert(page->visible && f.nav->_mounted->visible);
  f.nav->resize({600,800});f.nav->setSheetWindowMetrics(800,800,0,34);
  assert(f.nav->_sheet==page && page->root->width==600);
 }
 {Fixture f;sheet(f,"sheet","pick");auto page=f.nav->_sheet;
  assert(!page->tree && page->native && page->nativeIdentity->eligible);
  f.sdk.click("原生调用 showModal");f.pump();
  int modals=0;f.nav->_nativeAppUI=[&](auto identity,auto epoch){
   assert(identity.lock()==page->nativeIdentity && identity.lock()->accepts(epoch));++modals;
  };
  f.sdk.click("原生调用 showModal");f.pump();assert(modals==1);
  f.sdk.click("苹果");f.pump();assert(f.nav->_sheetClosing && f.delivered==0);
  settled(f);assert(f.delivered==1 && !f.canceled && f.value.getMapValue("value").toString()=="苹果");
 }
 {Fixture f;sheet(f);auto page=f.nav->_sheet;
  f.nav->replace("wheels",object(),options());assert(f.nav->_stack.back()->route=="home");
  assert(f.nav->_sheet==page && f.nav->_sheetClosing);settled(f);
  assert(f.nav->_stack.back()->route=="wheels" && f.delivered==1);
 }
 {Fixture f;f.nav->reset("tabs",object());f.nav->changed();auto shell=f.nav->_stack.front();
  sheet(f);f.nav->selectShellTab("retired-shell","wheels");
  assert(!f.nav->_sheetClosing && shell->selectedTab=="home");
  f.nav->selectShellTab(shell->id,"wheels");assert(f.nav->_sheetClosing && shell->selectedTab=="home");
  settled(f);assert(shell->selectedTab=="wheels" && f.nav->_stack.size()==1);
 }
 {Fixture f;sheet(f);auto page=f.nav->_sheet;
  auto result=object();result.setMapValue("done",Value(true));
  f.nav->finish(page->id,result,false);auto old=f.nav->_sheetSurface;
  auto terminal=old->completion;sheetTrace.clear();f.nav->close(false);f.pump();
  detachedBeforeDelivery();assert(f.delivered==1 && !f.canceled);
  terminal(true);f.pump();assert(f.delivered==1 && f.nav->_pendingResults.empty());
 }
 {Fixture f;sheet(f);auto pending=std::make_shared<HarmonyNavigator::Result>();int canceled=0;
  pending->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
   [&](const Valdi::ValueFunctionCallContext& c)->Value{assert(c.getParameter(1).toBool());++canceled;return {};});
  // Admitted outside the current dispatcher batch; reset must fence this
  // request before destroying the sheet's caller.
  ContextBoundary::current=f.nav->_stack.front()->tree->getContext();
  f.nav->captureResultCaller(*pending);ContextBoundary::current.reset();
  f.nav->enqueue([pending](auto& nav){nav.push("detail",object(),"push",options(),pending);},pending);
  f.nav->reset("wheels",object());settled(f);f.pump();
  assert(canceled==1 && pending->completed && f.nav->_pendingResults.empty());
  assert(f.nav->_stack.size()==1 && f.nav->_stack.front()->route=="wheels");
 }
 {Fixture f;sheet(f);auto old=f.nav->_sheetSurface;auto terminal=old->completion;
  auto result=object();result.setMapValue("kept",Value(true));f.nav->finish(f.nav->_sheet->id,result,false);
  f.nav->_foregroundPageObserver=[&](const std::string& id){if(id==f.nav->_stack.front()->id)f.nav->close(false);};
  // A background close settles synchronously, keeping the accepted value.
  f.nav->setActive(false);f.pump();assert(f.delivered==1 && !f.canceled);
 }
 {Fixture f;f.manager.failMount=true;sheet(f);f.pump();
  assert(!f.nav->_sheet && f.delivered==1 && f.canceled && f.nav->_mounted->visible);
  SheetSurfaceBoundary::failCreate=true;sheet(f);f.pump();
  assert(!f.nav->_sheet && f.delivered==2 && f.canceled);
 }
 {Fixture f;bool rejected=false;try{f.nav->push("detail",object(),"unknown",options(),nullptr);}
  catch(const std::runtime_error&){rejected=true;}assert(rejected && !f.nav->_sheet);
 }

 {Fixture f;sheet(f);auto binding=f.nav->_sheetInteraction;assert(binding);
  assert(binding->panel==f.nav->_sheetSurface->interactionNode() &&
         binding->rootMountParent==f.nav->_sheetSurface->viewport());
  assert(binding->begin(7));assert(!binding->begin(8));
  auto height=f.nav->sheetGeometry().panelHeight;
  f.nav->_sheetSurface->layout(f.nav->sheetGeometry(),0);
  assert(binding->offer(7,-100)==0 && f.nav->_sheetSurface->currentOffset()==100);
  assert(binding->offer(7,150)==50 && f.nav->_sheetSurface->currentOffset()==0);
  binding->offer(7,-height);binding->end(7,700,SheetEndReason::Ended);
  assert(f.nav->_sheetClosing && !binding->lifetime->live && !f.manager.sheetBinding);
  binding->end(7,700,SheetEndReason::Ended);settled(f);assert(f.delivered==1);
  sheet(f);auto replacement=f.nav->_sheet;binding->offer(7,-100);
  assert(f.nav->_sheet==replacement && !f.nav->_sheetClosing);
 }
 {Fixture f;sheet(f);auto binding=f.nav->_sheetInteraction;
  assert(binding->begin(9));f.nav->_sheetSurface->layout(f.nav->sheetGeometry(),0);
  binding->offer(9,-120);f.nav->setActive(false);
  assert(!binding->lifetime->live && f.nav->_sheetSurface->currentOffset()==0);
  binding->end(9,800,SheetEndReason::Ended);assert(!f.nav->_sheetClosing);
  f.nav->setActive(true);assert(f.nav->_sheetInteraction!=binding);
 }
 // Actual route SheetHostView uses the same nearest-detent/600 threshold for
 // .ended and ordinary .cancelled. Exact midpoint ties choose closed.
 for (auto reason : {SheetEndReason::Ended,SheetEndReason::GestureCanceled}) {
  for (float fraction : {.49f,.5f,.51f}) {
   for (float velocity : {-601.0f,-600.0f,0.0f,600.0f,601.0f}) {
    Fixture f;sheet(f);auto binding=f.nav->_sheetInteraction;
    assert(binding->begin(42));
    const auto height=f.nav->sheetGeometry().panelHeight;
    f.nav->_sheetSurface->layout(f.nav->sheetGeometry(),height*fraction);
    const bool expectedClose=velocity>600 || (velocity>=-600 && fraction>=.5f);
    binding->end(42,velocity,reason);
    assert(f.nav->_sheetClosing==expectedClose);
    if(expectedClose){settled(f);assert(f.delivered==1 && f.canceled);}
    else assert(f.delivered==0 && f.nav->_sheetSurface->currentOffset()==0);
   }
  }
 }
 {Fixture f;sheet(f);auto binding=f.nav->_sheetInteraction;
  assert(binding->begin(43));
  binding->offer(43,-f.nav->sheetGeometry().panelHeight);
  binding->end(43,900,SheetEndReason::LifecycleCanceled);
  assert(!f.nav->_sheetClosing && f.delivered==0 && f.nav->_sheetSurface->currentOffset()==0);
  binding->end(43,900,SheetEndReason::GestureCanceled);
  assert(!f.nav->_sheetClosing && f.delivered==0);
 }
 {Fixture f;sheet(f);auto page=f.nav->_sheet;auto base=f.nav->_stack.front()->tree->getContext();
  // Chaining from the retained root's result callback must survive callee
  // retirement; it must not hit a global admission gate.
  int chained=0;
  f.result->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
   [&](const Valdi::ValueFunctionCallContext&)->Value{
    auto next=std::make_shared<HarmonyNavigator::Result>();
    next->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
     [&](const Valdi::ValueFunctionCallContext&)->Value{++chained;return {};});
    ContextBoundary::current=base;f.nav->captureResultCaller(*next);ContextBoundary::current.reset();
    f.nav->enqueue([next](auto& nav){nav.push("detail",object(),"sheet",options(),next);},next);
    return {};
   });
  f.nav->back();settled(f);f.pump();assert(f.nav->_sheet && f.nav->_sheet!=page && chained==0);
  f.nav->back();settled(f);assert(chained==1);
 }
 {Fixture f;sheet(f);auto page=f.nav->_sheet;auto owner=page->tree->getContext();
  auto nested=std::make_shared<ContextBoundary>();nested->parent=owner;
  int canceled=0;
  auto pending=std::make_shared<HarmonyNavigator::Result>();
  pending->callback=Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
   [&](const Valdi::ValueFunctionCallContext& c)->Value{assert(c.getParameter(1).toBool());++canceled;return {};});
  ContextBoundary::current=nested;f.nav->captureResultCaller(*pending);ContextBoundary::current.reset();
  f.nav->enqueue([pending](auto& nav){nav.push("wheels",object(),"push",options(),pending);},pending);
  f.nav->_dispatcher->drain();assert(pending->attached && !pending->completed);
  f.nav->back();settled(f);assert(canceled==1 && pending->completed);
  assert(f.nav->_stack.back()->route=="wheels");
  // An explicitly unowned request remains distinct from a captured owner.
  auto unowned=std::make_shared<HarmonyNavigator::Result>();
  f.nav->captureResultCaller(*unowned);assert(!unowned->callerCaptured);
  f.nav->enqueue([unowned](auto& nav){nav.push("detail",object(),"push",options(),unowned);},unowned);
  f.nav->cancelCallerResults(owner);assert(!unowned->completed);
  f.pump();assert(unowned->attached);
 }
 std::cout<<"PASS actual sheet Navigator bodies: separate owner/base visibility, foreground identity, "
  "base opens, native picker, terminal/detach/result fences, caller retirement, tab isolation, "
  "stale callbacks, keyboard/resize, background, mount allocation failure and runtime close\\n";
}
