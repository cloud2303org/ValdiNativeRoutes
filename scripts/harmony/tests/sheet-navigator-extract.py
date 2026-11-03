#!/usr/bin/env python3
"""Extract actual sheet Navigator bodies with explicit collaborator boundaries.

No compiler is invoked. The existing native-route extractor supplies real SDK /
Valdi includes and its documented tree/runtime/backend doubles. This extension
adds the real sheet methods and a surface collaborator (the actual surface is
covered separately). It never substitutes a navigation algorithm. Native tests
must be run separately, serially, after the parent's explicit slot grant.
"""
from pathlib import Path
import hashlib
import json
import runpy
import sys

ROOT = Path(__file__).resolve().parents[3]
HOST = ROOT / "harmony/entry/src/main/cpp/host"
source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
negative = sys.argv[3] if len(sys.argv) > 3 else ""
base = ROOT / "scripts/harmony/tests/native-route-extract.py"
original_args = sys.argv[:]
sys.argv = [str(base), str(source), str(output)]
runpy.run_path(str(base), run_name="__main__")
sys.argv = original_args
text = source.read_text()


def block(signature):
    start = text.index(signature)
    brace = text.index("{", start)
    depth, end = 1, brace + 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[start:end]


names = {
    "sheetGeometry": "HarmonySheetGeometry", "registerSheetSurface": "void",
    "setSheetWindowMetrics": "void", "showSheet": "void", "layoutSheet": "void",
    "reconcileSheet": "void", "closeSheet": "void", "afterSheet": "bool",
    "finishSheet": "void", "detachPage": "void", "retirePage": "void",
    "cancelCallerResults": "void", "captureResultCaller": "void", "replace": "void", "pagesValue": "Value",
    "back": "bool", "setInsets": "void", "viewModel": "Value", "currentPages": "void",
    "updateRootDragObserver": "void", "rootDrag": "void", "bindSheetInput": "void",
    "unbindSheetInput": "void", "sheetInputCurrent": "bool",
    "tabShell": "HarmonyNavigator::PagePtr",
}
methods = [block(f"{result} HarmonyNavigator::{name}(") for name, result in names.items()]
methods = [m.replace("HarmonySheetSurface::create", "SheetSurfaceBoundary::create") for m in methods]
declarations = "\n".join(m.split("{", 1)[0].replace("HarmonyNavigator::", "").rstrip() + ";" for m in methods)
# Defaults are declarations only, not changes to any production function body.
declarations = declarations.replace("void closeSheet(const Value& value, bool canceled, float velocity);",
                                    "void closeSheet(const Value& value = {}, bool canceled = true, float velocity = 0);")
declarations = declarations.replace("void finishSheet(uint64_t generation, bool teardown);",
                                    "void finishSheet(uint64_t generation, bool teardown = false);")

boundary = r'''
struct NavigationInsets { double top=0,bottom=0,left=0,right=0,tabBarHeight=0; };
static std::vector<std::string> sheetTrace;
struct SheetSurfaceBoundary {
 static inline std::weak_ptr<SheetSurfaceBoundary> latest;
 static inline bool failCreate=false;
 std::function<void()> scrim;
 std::function<void(bool)> completion;
 HarmonySheetGeometry geometry{};
 float position=0;
 bool active=true,inputEnabled=true,retired=false,detached=false;
 static auto create(ArkUI_NodeContentHandle,ArkUI_ContextHandle,
                    std::function<void(std::function<void()>)>,std::function<void()> scrim){
  if(std::exchange(failCreate,false))throw std::runtime_error("surface allocation failure");
  auto surface=std::make_shared<SheetSurfaceBoundary>();surface->scrim=std::move(scrim);
  latest=surface;return surface;
 }
 ArkUI_NodeHandle viewport(){return reinterpret_cast<ArkUI_NodeHandle>(2);}
 ArkUI_NodeHandle interactionNode(){return reinterpret_cast<ArkUI_NodeHandle>(3);}
 void layout(const HarmonySheetGeometry& g,float offset){geometry=g;position=offset;}
 float currentOffset()const noexcept{return position;}
 float cancelAnimation()noexcept{completion={};return position;}
 void animateTo(float offset,float,std::function<void(bool)> done){position=offset;completion=std::move(done);}
 void setActive(bool v){active=v;}
 void setInputEnabled(bool v){inputEnabled=v;}
 void detach()noexcept{detached=true;sheetTrace.push_back("panel-detach");}
 void retire()noexcept{if(retired)return;retired=true;completion={};detach();}
 void end(){auto done=std::exchange(completion,{});if(done)done(true);}
};
'''
generated = output.read_text()
generated = '#include "HarmonySheetGeometry.hpp"\n#include "../backend/SheetInteraction.hpp"\n' + generated
# Dependencies are declared before namespace/classes, same headers as production.
generated = generated.replace("namespace ValdiHarmony {", "namespace ValdiHarmony {\n" + boundary, 1)
generated = generated.replace("struct Insets{double top=0,bottom=0,left=0,right=0,tabBarHeight=0;} _insets;",
                              "NavigationInsets _insets;")
generated = generated.replace("Value viewModel(const PagePtr&)const{return object();}", "")
generated = generated.replace("void updateRootDragObserver(){}", "")
generated = generated.replace("void entryDefaults();", declarations + r'''
 using HarmonySheetSurface=SheetSurfaceBoundary;
 PagePtr _sheet,_sheetMounted,_detachedSheet;
 std::shared_ptr<Valdi::Harmony::SheetInteractionBinding> _sheetInteraction;
 std::shared_ptr<ArkUI_Node> _sheetInputRoot;
 uint64_t _sheetTouchSession=0;
 std::shared_ptr<SheetSurfaceBoundary> _sheetSurface;
 ArkUI_NodeContentHandle _sheetContent=reinterpret_cast<ArkUI_NodeContentHandle>(2);
 ArkUI_ContextHandle _uiContext=reinterpret_cast<ArkUI_ContextHandle>(1);
 uint64_t _sheetGeneration=0;
 bool _sheetClosing=false,_sheetCompact=false,_sheetCanceled=true,_detachedSheetCanceled=true;
 Value _sheetResult,_detachedSheetResult;
 float _fullWindowHeight=640,_sheetViewportHeight=640,_keyboardOverlap=0,_sheetSystemBottom=0;
 std::map<const ContextBoundary*,std::weak_ptr<ContextBoundary>> _retiringContexts;
 std::vector<Command> _afterSheet;
 void entryDefaults();
''')
generated = generated.replace('const std::shared_ptr<Result>& = nullptr,const std::string& = "");',
                              'const std::shared_ptr<Result>& = nullptr,const std::string& = "",bool = false);')
generated = generated.replace('mounted.erase(r.get());++unmounts;',
                              'sheetTrace.push_back("page-unmount");mounted.erase(r.get());++unmounts;')
generated = generated.replace('void unmountRoot(const Root& r)', r'''
 std::shared_ptr<Valdi::Harmony::SheetInteractionBinding> sheetBinding;
 void bindSheetInteraction(const Root&,std::shared_ptr<Valdi::Harmony::SheetInteractionBinding> value){sheetBinding=std::move(value);}

 void mountRootInParent(const Root& r,ArkUI_NodeHandle){mountRoot(r,nullptr);}
 void unmountRoot(const Root& r)''')
generated = generated.replace('void async(std::function<void()> task){tasks.push_back(std::move(task));}',
                              'void async(std::function<void()> task){sheetTrace.push_back("js-schedule");tasks.push_back(std::move(task));}')
generated = generated.replace('struct ContextBoundary {template<typename T>void setViewModel(T){}};', r'''
struct ContextBoundary {
 static inline std::shared_ptr<ContextBoundary> current;
 std::shared_ptr<ContextBoundary> parent;
 bool destroyed=false;
 static auto currentRef(){return current;}
 const auto& getParent()const{return parent;}
 bool isDestroyed()const{return destroyed;}
 template<typename T>void setViewModel(T){}
};
''')
generated = generated.replace('void destroyContext(auto){++destroyed;}',
                              'void destroyContext(auto context){++destroyed;context->destroyed=true;}')
generated = generated.replace('Valdi::Weak<Valdi::Context>', 'std::weak_ptr<ContextBoundary>')
generated = generated.replace('Valdi::Ref<Valdi::Context>', 'std::shared_ptr<ContextBoundary>')
generated = generated.replace('Valdi::Context::currentRef()', 'ContextBoundary::currentRef()')
generated = generated.replace('const Valdi::Context*', 'const ContextBoundary*')
generated = generated.replace('Valdi::weakRef(context.get())', 'std::weak_ptr<ContextBoundary>(context)')
# The base extractor owns the existing native-only tests. Swap its test section
# for sheet-specific cases, retaining all actual method definitions above it.
marker = "// Actual production Navigator methods above; only collaborators are adapted."
assert marker in generated
generated = generated.split(marker)[0]
# Insert methods inside the production namespace, before its final close.
assert generated.rstrip().endswith("}")
generated = generated.rstrip()[:-1] + "\n\n" + "\n\n".join(methods) + "\n}\n"
if negative:
    if negative == "legacy-presentation":
        historical = Path("/tmp/valdi-native-route-20261103/source/harmony/entry/src/main/cpp/host/HarmonyNavigator.cpp").read_text()
        begin = historical.index("RouteAnimation validateOptions(")
        brace = historical.index("{", begin)
        depth,end=1,brace+1
        while depth:
            depth += (historical[end]=="{")-(historical[end]=="}")
            end+=1
        generated = generated.replace(block("RouteAnimation validateOptions("),historical[begin:end])
    elif negative == "result-before-detach":
        actual = block("void HarmonyNavigator::finishSheet(")
        mutation = actual.replace("errors.run([&] { detachPage(page); });",
                                  "errors.run([&] { retirePage(page, value, canceled); });\n    errors.run([&] { detachPage(page); });")
        generated = generated.replace(actual,mutation)
    elif negative == "base-hidden":
        actual = block("void HarmonyNavigator::reconcileSheet(")
        generated = generated.replace(actual,actual.replace("auto page = _sheetMounted;",
            "if (_sheet && _mounted) _mounted->visible=false;\n    auto page = _sheetMounted;"))
    elif negative == "native-cancel-open":
        actual = block("void HarmonyNavigator::bindSheetInput(")
        before = "reason == SheetInteractionEndReason::LifecycleCanceled"
        assert actual.count(before) == 1
        generated = generated.replace(actual, actual.replace(before,
            "reason != SheetInteractionEndReason::Ended"))
    else:
        raise ValueError("Unknown negative control: " + negative)
generated = generated.replace('Valdi::Ref<Valdi::Context>', 'std::shared_ptr<ContextBoundary>')
generated = generated.replace('Valdi::Context::currentRef()', 'ContextBoundary::currentRef()')
generated = generated.replace('const Valdi::Context*', 'const ContextBoundary*')
generated = generated.replace('Valdi::weakRef(context.get())', 'std::weak_ptr<ContextBoundary>(context)')
generated = generated.replace('Valdi::Harmony::bindSheetInteraction(_viewManager, ', '_viewManager.bindSheetInteraction(')
test_path = ROOT / "scripts/harmony/tests/sheet-navigator.inc"
legacy_path = ROOT / "scripts/harmony/tests/native-route-navigator.inc"
tests = test_path.read_text()
legacy = legacy_path.read_text().split("int main(){",1)[1]
legacy = "void nativeRouteRegressionChecks(){" + legacy
position = tests.index("void sheet(Fixture&")
tests = tests[:position] + legacy + "\n" + tests[position:]
tests = tests.replace("int main(){", "int main(){\n nativeRouteRegressionChecks();", 1)
output.write_text(generated + tests)
manifest = json.loads(output.with_suffix(".extraction.json").read_text())
manifest.update({
    "sheetSourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "sourceInputs": {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in (source,base,test_path,legacy_path,Path(__file__).resolve())},
    "nativeRouteHistoricalRegressionBodiesIncluded": True,
    "sheetMethods": list(names), "negativeControl": negative or None,
    "callerContextCollaborator": "ContextBoundary snapshots explicit lineage; does NOT prove real JS wrapper attribution",
    "contextAdaptations": ["Ref/Weak<Context> -> shared_ptr/weak_ptr<ContextBoundary>",
                           "Context::currentRef -> ContextBoundary::currentRef", "weakRef -> std::weak_ptr"],
    "surfaceCollaborator": "SheetSurfaceBoundary; actual native surface tested separately",
    "addedExpressionAdaptations": {"HarmonySheetSurface::create": "SheetSurfaceBoundary::create",
        "Valdi::Harmony::bindSheetInteraction(_viewManager, ... )": "_viewManager.bindSheetInteraction(...)"},
    "navigationAlgorithmReimplemented": False,
    "nativeCompilationExecutedByExtractor": False,
})
output.with_suffix(".extraction.json").write_text(json.dumps(manifest,indent=2))
