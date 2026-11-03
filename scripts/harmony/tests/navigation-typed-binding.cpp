// Actual makeNavigationHost/helpers, canonical generated models and real
// CppMarshaller. Only command execution/rendering and caller capture are doubles.
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <algorithm>
#include <cassert>
#include <cmath>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace ValdiHarmony {
using Valdi::Value;
namespace Routes = snap::valdi_modules::app_pages;
class HarmonyNavigator : public std::enable_shared_from_this<HarmonyNavigator> {
public:
    struct Result { Valdi::Ref<Valdi::ValueFunction> callback; bool captured = false; };
    using Command = std::function<void(HarmonyNavigator&)>;
    Value _host, params;
    std::string _statusBarStyle, route, presentation;
    std::vector<int> _stack{1, 2, 3};
    std::vector<Command> commands;
    std::vector<std::string> calls;
    std::shared_ptr<Result> result;
    Routes::ResolvedNavigation options;
    Routes::RouteDeclaration declaration;
    Valdi::Ref<Valdi::ValueFunction> pages;
    size_t delta = 0;
    bool publication = false;
    Value makeNavigationHost();
    void enqueue(Command command, const std::shared_ptr<Result>& failure = nullptr, bool publish = false) {
        if (failure) assert(failure->captured);
        publication = publish;
        commands.push_back(std::move(command));
    }
    static void captureResultCaller(Result& result) { result.captured = true; }
    void drain() {
        auto pending = std::move(commands);
        commands.clear();
        for (auto& command : pending) command(*this);
    }
    void push(const std::string& r, const Value& p, const std::string& style,
              const Routes::ResolvedNavigation& o, const std::shared_ptr<Result>& callback) {
        calls.push_back("push"); route = r; params = p; presentation = style; options = o; result = callback;
    }
    void replace(const std::string& r, const Value& p, const Routes::ResolvedNavigation& o) {
        calls.push_back("replace"); route = r; params = p; options = o;
    }
    void reset(const std::string& r, const Value& p) { calls.push_back("reset"); route = r; params = p; }
    void goBack(size_t value) { calls.push_back("back"); delta = value; }
    bool afterSheet(Command) { return false; }
    void keep(size_t value) { calls.push_back("keep"); delta = value; }
    void reconcile() { calls.push_back("reconcile"); }
    void switchTab(const std::string& r) { calls.push_back("switchTab"); route = r; }
    void currentPages(Valdi::Ref<Valdi::ValueFunction> callback) { pages = std::move(callback); }
    void updateRoutes(const Routes::RouteDeclaration& table) { calls.push_back("updateRoutes"); declaration = table; }
};
#include "navigation-typed-binding-production.inc"
}

using namespace ValdiHarmony;
static std::string invoke(const Value& host, const char* name, std::initializer_list<Value> args) {
    Valdi::SimpleExceptionTracker tracker;
    Valdi::Ref<Valdi::ValueFunction> fn;
    for (const auto& property : *host.getTypedObject()) {
        if (property.name.toStringView() == name) fn = property.value.getFunctionRef();
    }
    assert(fn != nullptr);
    (*fn)(Valdi::ValueFunctionCallContext(Valdi::ValueFunctionFlagsNone, args.begin(), args.size(), tracker));
    return tracker ? "" : tracker.extractError().toString();
}

int main() {
    auto nav = std::make_shared<HarmonyNavigator>();
    auto host = nav->makeNavigationHost();
    assert(host.isTypedObject());
    Routes::NavigationHost roundtrip;
    Valdi::SimpleExceptionTracker tracker;
    Valdi::CppMarshaller::unmarshall(tracker, host, roundtrip);
    assert(tracker);
    auto options = marshalled(Routes::ResolvedNavigation(
        STRING_LITERAL("slideRight"), 300, STRING_LITERAL("push")));
    auto nested = object();
    nested.setMapValue("answer", Value(42));
    auto data = object();
    data.setMapValue("nested", nested);
    data.setMapValue("nullable", Value());
    auto list = Valdi::ValueArray::make(2);
    list->emplace(0, Value(true));
    list->emplace(1, Value("text"));
    data.setMapValue("list", Value(list));
    assert(invoke(host, "push", {Value("detail"), data, Value("push"), options}).empty());
    assert(nav->calls.empty() && nav->commands.size() == 1);
    nested.setMapValue("answer", Value(99));
    nav->drain();
    assert(nav->route == "detail" && nav->presentation == "push");
    assert(nav->params.getMapValue("nested").getMapValue("answer").toInt() == 42);
    assert(nav->params.getMapValue("nullable").isNull());
    assert(nav->params.getMapValue("list").getArray()->size() == 2);
    assert(nav->options.getDurationMs() == 300);

    // Real generated argument decoder must reject bad/missing arguments before
    // admitting a command; native data errors must become tracked exceptions.
    for (auto invalid : {Value(), Value(3), Value(Valdi::ValueArray::make(0))}) {
        assert(!invoke(host, "push", {Value("detail"), invalid, Value("push"), options}).empty());
    }
    assert(!invoke(host, "push", {Value(4), data, Value("push"), options}).empty());
    assert(!invoke(host, "push", {Value("detail"), data}).empty());
    auto invalidData = object();
    invalidData.setMapValue("infinite", Value(INFINITY));
    assert(invoke(host, "reset", {Value("root"), invalidData}).find("finite structured") != std::string::npos);
    invalidData.setMapValue("infinite", Value(0));
    invalidData.setMapValue("callback", marshalled(Routes::NavigationHost::PopToRootFn([] {})));
    assert(!invoke(host, "reset", {Value("root"), invalidData}).empty());
    assert(nav->commands.empty());

    unsigned delivered = 0;
    auto pin = std::make_shared<int>(7);
    std::weak_ptr<int> weakPin = pin;
    Routes::NavigationHost::PushForResultOnResultFn callback =
        [pin, &delivered](Valdi::Ref<Valdi::ValueMap> value, bool canceled) {
            assert(*pin == 7 && !canceled);
            assert(Value(value).getMapValue("result").toInt() == 123);
            ++delivered;
        };
    auto callbackValue = marshalled(callback);
    callback = {};
    pin.reset();
    assert(invoke(host, "pushForResult", {Value("child"), data, Value("sheet"), options, callbackValue}).empty());
    callbackValue = {};
    assert(!weakPin.expired());
    nav->drain();
    assert(nav->result && nav->result->captured && delivered == 0);
    auto resultData = object();
    resultData.setMapValue("result", Value(123));
    (*nav->result->callback)(Valdi::ValueFunctionFlagsNeverCallSync, {resultData, Value(false)});
    assert(delivered == 1);
    nav->result.reset();
    assert(weakPin.expired());
    assert(!invoke(host, "pushForResult", {Value("child"), data, Value("sheet"), options, Value(4)}).empty());

    assert(invoke(host, "replace", {Value("replacement"), data, options}).empty());
    assert(invoke(host, "reset", {Value("root"), data}).empty());
    assert(invoke(host, "switchTab", {Value("settings")}).empty());
    assert(invoke(host, "back", {Value(100)}).empty());
    nav->drain();
    assert(nav->route == "settings" && nav->delta == 3);
    assert(invoke(host, "popToRoot", {}).empty());
    nav->drain();
    assert(nav->delta == 1 && nav->calls.back() == "reconcile");
    assert(invoke(host, "setStatusBarStyle", {Value("dark")}).empty());
    nav->drain();
    assert(nav->_statusBarStyle == "dark");
    assert(invoke(host, "back", {Value(0.5)}).empty());
    try { nav->drain(); assert(false); } catch (const std::runtime_error&) {}
    assert(invoke(host, "setStatusBarStyle", {Value("invalid")}).empty());
    try { nav->drain(); assert(false); } catch (const std::runtime_error&) {}

    unsigned pageCalls = 0;
    Routes::NavigationHost::CurrentPagesDoneFn done = [&](std::vector<Routes::StackPage> pages) {
        assert(pages.size() == 1 && pages[0].getPageId() == STRING_LITERAL("page-1"));
        assert(Value(pages[0].getParams()).getMapValue("nested").getMapValue("answer").toInt() == 99);
        ++pageCalls;
    };
    assert(invoke(host, "currentPages", {marshalled(done)}).empty());
    auto pages = marshalled(std::vector<Routes::StackPage>{
        Routes::StackPage(STRING_LITERAL("page-1"), STRING_LITERAL("root"), data.getMapRef())});
    (*nav->pages)(Valdi::ValueFunctionFlagsNeverCallSync, {pages});
    assert(pageCalls == 1);
    assert(!invoke(host, "currentPages", {Value(false)}).empty());
    Routes::RouteDeclaration table({}, nullptr, STRING_LITERAL("root"));
    assert(invoke(host, "updateRoutes", {marshalled(table)}).empty());
    table.setRoot(STRING_LITERAL("changed"));
    assert(nav->publication);
    nav->drain();
    assert(nav->declaration.getRoot() == STRING_LITERAL("root"));
    nav.reset();
    assert(invoke(host, "back", {Value(1)}).find("disposed") != std::string::npos);
    std::cout << "PASS: ten generated callbacks, decoding, data isolation, callback retention, disposed owner\n";
}
