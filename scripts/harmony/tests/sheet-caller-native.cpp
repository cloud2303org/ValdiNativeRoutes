// Bounded native characterization; exact evidence and limits: sheet-caller.md.
// The Context and both JS/native wrapper directions are upstream classes.
// Rendering/UI/runtime destruction collaborators below are explicit boundaries.
#include "valdi/jscore/JavaScriptCoreContext.hpp"
#include "valdi/runtime/Context/Context.hpp"
#include "valdi/runtime/JavaScript/JavaScriptContextEntryPoint.hpp"
#include "valdi/runtime/JavaScript/JSFunctionWithValueFunction.hpp"
#include "valdi/runtime/JavaScript/JavaScriptTaskScheduler.hpp"
#include "valdi/runtime/JavaScript/JavaScriptUtils.hpp"
#include "valdi/runtime/JavaScript/ValueFunctionWithJSValue.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include "valdi_core/cpp/Utils/ConsoleLogger.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include "HarmonyHostLifecycle.hpp"

#include <algorithm>
#include <atomic>
#include <cassert>
#include <cmath>
#include <deque>
#include <fstream>
#include <functional>
#include <future>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <utility>

using Valdi::Value;
using ContextRef = Valdi::Ref<Valdi::Context>;

// Exact production parent resolver, with real JSValueRefHolder checks. This
// tests the native page payload premise without initializing the renderer.
#include "sheet-caller-parent-resolution.inc"

// This is a scheduler ADAPTER, not JavaScriptRuntime. It uses Valdi's actual
// dedicated serial queue, retained contexts, JS context entry and VM entry.
// In particular, sync() must not impersonate JS on its caller thread.
struct CallerScheduler final : Valdi::JavaScriptTaskScheduler {
    Valdi::Ref<Valdi::DispatchQueue> queue = Valdi::DispatchQueue::createThreaded(
        STRING_LITERAL("sheet caller real JS queue"), Valdi::ThreadQoSClassNormal);
    ContextRef global, last;
    Valdi::IJavaScriptContext* engine = nullptr;
    std::mutex failureMutex;
    std::exception_ptr failure;
    CallerScheduler() { queue->setDisableSyncCallsInCallingThread(true); }
    void execute(ContextRef owner, Valdi::JavaScriptThreadTask& task) {
        assert(queue->isCurrent());
        last = owner;
        Valdi::RetainedContext retained(owner);
        Valdi::JavaScriptContextEntry contextEntry(owner);
        Valdi::JSExceptionTracker error(*engine);
        {
            Valdi::JavaScriptEntryParameters entry(*engine, error, owner);
            task(entry);
        } // Microtask checkpoint remains inside contextEntry.
        if (!error) throw std::runtime_error(error.extractError().toString());
    }
    void dispatchOnJsThread(ContextRef owner, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t delay, Valdi::JavaScriptThreadTask&& task) override {
        auto work = [this, retained = Valdi::RetainedContext(owner != nullptr ? owner : global),
                     task = std::move(task)]() mutable {
            try { execute(retained.context, task); }
            catch (...) { std::lock_guard lock(failureMutex); failure = std::current_exception(); }
        };
        if (type == Valdi::JavaScriptTaskScheduleTypeAlwaysAsync)
            queue->asyncAfter(std::move(work), std::chrono::milliseconds(delay));
        else if (queue->isCurrent()) work();
        else if (type == Valdi::JavaScriptTaskScheduleTypeAlwaysSync) queue->sync(work);
        else queue->async(std::move(work));
    }
    void dispatchOnJsThread(Valdi::JsThreadDispatchReason, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t delay, Valdi::JavaScriptThreadTask&& task) override {
        dispatchOnJsThread(ContextRef(), type, delay, std::move(task));
    }
    bool isInJsThread() override { return queue->isCurrent(); }
    ContextRef getLastDispatchedContext() const override { return last; } // JS-only fixture observation.
    std::vector<Valdi::JavaScriptCapturedStacktrace> captureStackTraces(
        std::chrono::steady_clock::duration) override { return {}; }
    auto getJsDispatchQueue() { return queue; }
    void check() {
        std::exception_ptr error;
        { std::lock_guard lock(failureMutex); error = std::exchange(failure, {}); }
        if (error) std::rethrow_exception(error);
    }
    void on(ContextRef owner, Valdi::JavaScriptThreadTask task) {
        dispatchOnJsThread(std::move(owner), Valdi::JavaScriptTaskScheduleTypeAlwaysSync, 0, std::move(task));
        check();
    }
    void barrier() { queue->sync([] {}); check(); }
};

// Deterministic UI collaborator. drainBatch removes one local batch before
// invoking it, so JS/UI can admit work outside the current batch.
struct CallerUI {
    std::mutex mutex;
    std::deque<Valdi::DispatchFunction> tasks;
    std::thread::id ui = std::this_thread::get_id();
    void dispatch(Valdi::DispatchFunction* work, bool) {
        std::unique_ptr<Valdi::DispatchFunction> owner(work);
        std::lock_guard lock(mutex);
        tasks.push_back(std::move(*owner));
    }
    bool isUIThread() const { return std::this_thread::get_id() == ui; }
    void drainBatch() {
        assert(isUIThread());
        std::deque<Valdi::DispatchFunction> batch;
        { std::lock_guard lock(mutex); batch.swap(tasks); }
        for (auto& task : batch) task();
    }
};

struct CallerRuntimeBoundary {
    Valdi::Ref<CallerScheduler> js;
    std::shared_ptr<CallerUI> ui;
    std::atomic<unsigned> requested{0}, destroyed{0};
    auto* getJavaScriptRuntime() { return js.get(); }
    void destroyContext(ContextRef context) {
        // Match the real direction: called on JS, actual destruction deferred
        // to a NEW UI batch. This is not Runtime::destroyContext execution.
        assert(js->isInJsThread());
        ++requested;
        ui->dispatch(new Valdi::DispatchFunction([this, context] {
            context->onDestroy();
            ++destroyed;
        }), false);
    }
};

namespace ValdiHarmony {
namespace Routes = snap::valdi_modules::app_pages;
struct CallerTreeBoundary {
    ContextRef context;
    const ContextRef& getContext() const { return context; }
};
static void logNativeError(const char* message) { throw std::runtime_error(message); }

// Only the extracted methods are production navigation behavior. Destination
// attachment is deliberately a boundary; this is not a sheet/rendering test.
class HarmonyNavigator : public std::enable_shared_from_this<HarmonyNavigator> {
public:
    struct Result;
    struct Page;
    using PagePtr = std::shared_ptr<Page>;
    using Command = std::function<void(HarmonyNavigator&)>;
    struct Page {
        std::string id;
        std::shared_ptr<CallerTreeBoundary> tree;
        ContextRef root;
        std::map<std::string, PagePtr> tabPages;
        PagePtr tabBar;
        std::shared_ptr<Result> result;
        bool retired = false, tabs = false;
    };
    struct Attachment { std::string route; Value params; std::shared_ptr<Result> result; };
    std::shared_ptr<CallerRuntimeBoundary> _runtime;
    std::shared_ptr<CallerUI> _dispatcher;
    std::mutex _admissionMutex;
    std::map<const Result*, std::shared_ptr<Result>> _pendingResults;
    std::map<const Valdi::Context*, Valdi::Weak<Valdi::Context>> _retiringContexts;
    std::atomic<bool> _closed{false};
    uint64_t _routePublications = 0;
    std::function<void()> _initialRoutesAccepted;
    std::string _error, _statusBarStyle;
    std::vector<PagePtr> _stack;
    std::map<std::string, int> _tabSurfaces;
    std::vector<Attachment> attachments;
    Value _host;
    Value makeNavigationHost();
    void complete(const std::shared_ptr<Result>&, Value = {}, bool = true);
    void enqueue(Command, const std::shared_ptr<Result>& = nullptr, bool = false);
    static void captureResultCaller(Result&);
    void cancelCallerResults(const ContextRef&);
    void retirePage(const PagePtr&, const Value& = {}, bool = true);
    void push(const std::string&, const Value&, const std::string&,
              const Routes::ResolvedNavigation&, const std::shared_ptr<Result>&);
    void changed() {}
    void reportError(const std::string& error) { _error = error; }
    void replace(const std::string&, const Value&, const Routes::ResolvedNavigation&) { unsupported(); }
    void goBack(size_t) { unsupported(); }
    bool afterSheet(Command) { unsupported(); return false; }
    void keep(size_t) { unsupported(); }
    void reconcile() { unsupported(); }
    void reset(const std::string&, const Value&) { unsupported(); }
    void switchTab(const std::string&) { unsupported(); }
    void currentPages(Valdi::Ref<Valdi::ValueFunction>) { unsupported(); }
    void updateRoutes(const Routes::RouteDeclaration&) { unsupported(); }
    static void unsupported() { throw std::runtime_error("Outside caller-context fixture"); }
};

// Generated from the CURRENT production file without Context substitutions.
#include "sheet-caller-production.inc"

void HarmonyNavigator::push(const std::string& route, const Value& params, const std::string&,
                            const Routes::ResolvedNavigation&, const std::shared_ptr<Result>& result) {
    assert(_dispatcher->isUIThread());
    if (result) result->attached = true;
    attachments.push_back({route, params, result});
}
} // namespace ValdiHarmony

struct OwnerFunction final : Valdi::ValueFunctionWithCallable {
    using Valdi::ValueFunctionWithCallable::ValueFunctionWithCallable;
    bool propagatesOwnerContextOnCall() const override { return true; }
};

struct CallerFixture {
    using Navigator = ValdiHarmony::HarmonyNavigator;
    struct Captured { Valdi::Ref<Valdi::ValueFunctionWithJSValue> function; ContextRef creation, root; };
    Valdi::Ref<CallerScheduler> scheduler = Valdi::makeShared<CallerScheduler>();
    std::unique_ptr<ValdiJSCore::JavaScriptCoreContext> engine;
    ContextRef global, a, b, child;
    std::vector<ContextRef> contexts;
    std::map<std::string, Captured> captured; // touched only on JS.
    std::map<std::string, ContextRef> marks; // touched only on JS.
    std::shared_ptr<CallerUI> ui = std::make_shared<CallerUI>();
    std::shared_ptr<CallerRuntimeBoundary> runtime = std::make_shared<CallerRuntimeBoundary>();
    std::shared_ptr<Navigator> nav = std::make_shared<Navigator>();
    std::thread::id driver = std::this_thread::get_id();

    ContextRef context(int id, ContextRef parent = nullptr) {
        auto value = Valdi::makeShared<Valdi::Context>(id, Valdi::Ref<Valdi::ILogger>());
        value->postInit();
        value->setParent(parent);
        contexts.push_back(value);
        return value;
    }
    void put(Valdi::JavaScriptEntryParameters& entry, const char* name, const Value& value) {
        auto js = Valdi::valueToJSValue(entry.jsContext, value, Valdi::ReferenceInfoBuilder(), entry.exceptionTracker);
        auto object = entry.jsContext.getGlobalObject(entry.exceptionTracker);
        entry.jsContext.setObjectProperty(object.get(), name, js.get(), true, entry.exceptionTracker);
    }
    std::string evaluate(Valdi::JavaScriptEntryParameters& entry, const std::string& source) {
        auto value = entry.jsContext.evaluate(source, "sheet-caller.js", entry.exceptionTracker);
        if (!entry.exceptionTracker) return {};
        return entry.jsContext.valueToString(value.get(), entry.exceptionTracker).slowToString();
    }
    CallerFixture(const std::string& source) {
        global = context(900);
        a = context(901); b = context(902); child = context(903, a);
        scheduler->global = global;
        runtime->js = scheduler; runtime->ui = ui;
        nav->_runtime = runtime; nav->_dispatcher = ui;
        // Initialize and destroy the JS engine on its real dedicated thread.
        scheduler->queue->sync([&] {
            assert(std::this_thread::get_id() != driver);
            engine = std::make_unique<ValdiJSCore::JavaScriptCoreContext>(
                scheduler.get(), Valdi::ConsoleLogger::getLogger());
            scheduler->engine = engine.get();
        });
        scheduler->on(global, [&](auto& entry) {
            entry.jsContext.initialize({}, entry.exceptionTracker);
            assert(entry.jsContext.getValueMarshaller());
            put(entry, "__sheetHost", nav->makeNavigationHost());
            auto object = entry.jsContext.getGlobalObject(entry.exceptionTracker);
            auto host = entry.jsContext.getObjectProperty(object.get(), "__sheetHost", entry.exceptionTracker);
            auto push = entry.jsContext.getObjectProperty(host.get(), "pushForResult", entry.exceptionTracker);
            auto nativeWrapper = Valdi::castOrNull<Valdi::JSFunctionWithValueFunction>(
                entry.jsContext.valueToFunction(push.get(), entry.exceptionTracker));
            assert(nativeWrapper != nullptr); // Actual native -> JS wrapper.
            auto capture = Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                [this](const Valdi::ValueFunctionCallContext& call) -> Value {
                    auto function = Valdi::castOrNull<Valdi::ValueFunctionWithJSValue>(call.getParameterAsFunction(1));
                    assert(function != nullptr); // Real JS -> native wrapper, not a callable double.
                    captured[call.getParameterAsString(0).slowToString()] =
                        {function, Valdi::Context::currentRef(), function->getContext()};
                    return {};
                });
            put(entry, "__sheetCapture", Value(capture));
            auto mark = Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                [this](const Valdi::ValueFunctionCallContext& call) -> Value {
                    assert(scheduler->isInJsThread() && std::this_thread::get_id() != driver);
                    marks[call.getParameterAsString(0).slowToString()] = Valdi::Context::currentRef();
                    return {};
                });
            put(entry, "__sheetMark", Value(mark));
            auto owner = Valdi::makeShared<OwnerFunction>(
                [](const Valdi::ValueFunctionCallContext& call) -> Value {
                    auto callback = call.getParameterAsFunction(0);
                    if (callback != nullptr) (*callback)();
                    return {};
                });
            put(entry, "__sheetOwnerInvoke", Value(owner)); // wrapper owner = global
            evaluate(entry, source);
        });
    }
    std::string eval(ContextRef owner, const std::string& source) {
        std::string result;
        scheduler->on(owner, [&](auto& entry) { result = evaluate(entry, source); });
        return result;
    }
    void make(ContextRef creation, const std::string& label, const std::string& mode = "router") {
        eval(creation, "sheetCaller.make('" + label + "','" + mode + "')");
    }
    void native(const std::string& label) {
        // Native driver invokes the ACTUAL ValueFunctionWithJSValue off JS.
        Valdi::Ref<Valdi::ValueFunctionWithJSValue> function;
        scheduler->on(global, [&](auto&) { function = captured.at(label).function; });
        auto result = static_cast<Valdi::ValueFunction&>(*function)();
        assert(result);
        scheduler->barrier();
    }
    std::vector<std::shared_ptr<Navigator::Result>> pending() {
        std::lock_guard lock(nav->_admissionMutex);
        std::vector<std::shared_ptr<Navigator::Result>> result;
        for (const auto& [_, value] : nav->_pendingResults) result.push_back(value);
        return result;
    }
    std::shared_ptr<Navigator::Result> onlyPending() {
        auto results = pending();
        assert(results.size() == 1);
        return results.front();
    }
    void row(const std::string& label, const std::shared_ptr<Navigator::Result>& result,
             ContextRef expected, ContextRef pageContext) {
        assert(result->callerCaptured == (expected != nullptr));
        assert((result->callerLineage.empty() ? ContextRef() : result->callerLineage.front()) == expected);
        // The generated NavigationHost decodes the JS callback into a typed
        // Function, then the delivery owner retains its CppValueFunction
        // wrapper. The original JS function remains captured inside that
        // wrapper; it is no longer the outer Result::callback object.
        assert(result->callback != nullptr);
        assert(result->callback->getFunctionType() == "cpp function");
        scheduler->on(global, [&](auto&) {
            assert(marks.at(label) == expected);
            const auto id = [](const ContextRef& value) { return value != nullptr ? value->getContextId() : 0; };
            auto original = captured.find(label);
            std::cout << "{\"label\":\"" << label << "\",\"emitted\":" << id(expected)
                      << ",\"resultCallbackRepresentation\":\"generated typed wrapper\""
                      << ",\"suppliedPageTreeContext\":" << id(pageContext)
                      << ",\"suppliedPageRoot\":" << (pageContext != nullptr ? pageContext->getRoot()->getContextId() : 0)
                      << ",\"originalCallbackCreation\":";
            if (original == captured.end()) std::cout << "null";
            else std::cout << id(original->second.creation);
            std::cout << ",\"originalCallbackRoot\":";
            if (original == captured.end()) std::cout << "null";
            else std::cout << id(original->second.root);
            std::cout << ",\"lineage\":[";
            bool first = true;
            for (const auto& owner : result->callerLineage) {
                if (!first) std::cout << ',';
                first = false; std::cout << id(owner);
            }
            std::cout << "]}\n";
        });
    }
    void settle(const std::shared_ptr<Navigator::Result>& result, bool canceled = true) {
        nav->complete(result, ValdiHarmony::object(), canceled);
        scheduler->barrier();
    }
    auto page(ContextRef context) {
        auto page = std::make_shared<Navigator::Page>();
        if (context != nullptr) page->tree = std::make_shared<ValdiHarmony::CallerTreeBoundary>(
            ValdiHarmony::CallerTreeBoundary{context});
        return page;
    }
    ~CallerFixture() {
        for (const auto& result : pending()) settle(result);
        ui->drainBatch();
        scheduler->barrier();
        ui->drainBatch();
        scheduler->on(global, [&](auto&) {
            captured.clear(); marks.clear();
            nav->attachments.clear(); nav->_host = {};
            for (const auto& owner : contexts) owner->onDestroy();
        });
        scheduler->barrier();
        scheduler->queue->sync([&] { engine.reset(); scheduler->engine = nullptr; });
        scheduler->queue->fullTeardown();
    }
};

static void characterization(const std::string& source) {
    CallerFixture f(source);
    f.make(f.a, "page", "Router");
    f.scheduler->on(f.global, [&](auto&) {
        assert(f.captured.at("page").creation == f.a && f.captured.at("page").root == f.a);
    });
    f.native("page");
    auto result = f.onlyPending();
    f.row("page", result, f.a, f.a); f.settle(result); f.ui->drainBatch();

    f.make(f.child, "child");
    f.scheduler->on(f.global, [&](auto&) {
        assert(f.captured.at("child").creation == f.child && f.captured.at("child").root == f.a);
    });
    f.eval(f.child, "sheetCaller.direct('child')");
    result = f.onlyPending();
    f.row("child", result, f.child, f.a);
    assert(result->callerLineage.size() == 2 && result->callerLineage[1] == f.a);
    f.settle(result); f.ui->drainBatch();
    f.native("child");
    result = f.onlyPending();
    f.row("child", result, f.a, f.a); f.settle(result); f.ui->drainBatch();

    // The same lexical callback under another page preserves that CURRENT page.
    f.eval(f.b, "sheetCaller.direct('page')");
    result = f.onlyPending();
    f.row("page", result, f.b, f.a); f.settle(result); f.ui->drainBatch();
    f.make(f.b, "other"); f.native("other");
    result = f.onlyPending();
    f.row("other", result, f.b, f.b); f.settle(result); f.ui->drainBatch();

    f.make(f.a, "owner", "owner"); f.native("owner");
    result = f.onlyPending();
    f.row("owner", result, f.global, f.a); f.settle(result); f.ui->drainBatch();
    f.make(f.child, "async", "async"); f.native("async");
    result = f.onlyPending();
    f.row("async", result, f.a, f.a); f.settle(result); f.ui->drainBatch();

    // A page below an application context is not necessarily callback current.
    auto underGlobal = f.context(904, f.global);
    f.make(underGlobal, "parented"); f.native("parented");
    result = f.onlyPending();
    f.row("parented", result, f.global, underGlobal);
    // Dynamic caller is global, so retirement of the supplied lexical page
    // must NOT infer 904 as caller or close the global admission gate.
    f.nav->retirePage(f.page(underGlobal)); f.scheduler->barrier();
    assert(!result->completed && !f.global->isDestroyed());
    f.ui->drainBatch();
    assert(underGlobal->isDestroyed() && result->attached && !result->completed);
    f.settle(result);

    // Prove the real private weak creation context differs from holder root
    // using its public teardown behavior; never redefine/private-peek its ABI.
    f.scheduler->on(f.global, [&](auto&) {
        auto function = f.captured.at("child").function;
        assert(function->getContext() == f.a);
        function->setIgnoreIfValdiContextIsDestroyed(true);
        assert(!function->ownerIsTearingDown());
        f.child->onDestroy();
        assert(!f.a->isDestroyed() && function->ownerIsTearingDown());
    });
}

static void pageParentResolution(const std::string& source) {
    CallerFixture f(source);
    f.scheduler->on(f.global, [&](auto&) {
        // Same generated native models as Navigator::createTree/viewModel.
        // Their callbacks are native functions, not captured JS values.
        using namespace ValdiHarmony;
        Routes::PageContext pageContext(
            [](Valdi::Ref<Valdi::ValueMap>) {}, [] {});
        Routes::TabBarContext tabContext([](Valdi::StringBox) {});
        Routes::PageViewModel viewModel(
            STRING_LITERAL("id"), STRING_LITERAL("home"), object().getMapRef(),
            STRING_LITERAL("push"), Routes::PageInsets(0, 0, 0, 0),
            true, STRING_LITERAL("navigation"));
        ContextRef parent;
        Valdi::resolveParentContext(marshalled(viewModel), parent);
        Valdi::resolveParentContext(marshalled(pageContext), parent);
        Valdi::resolveParentContext(marshalled(tabContext), parent);
        Value nativeCallback(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
            [](const Valdi::ValueFunctionCallContext&) -> Value { return {}; }));
        Valdi::resolveParentContext(nativeCallback, parent);
        assert(parent == nullptr);
        // Actual resolver positive control: a retained JS callback WOULD
        // resolve its holder root if one reached the creation payload.
        f.make(f.child, "parent-resolver");
        Value foreign = object();
        foreign.setMapValue("callback", Value(f.captured.at("parent-resolver").function));
        Valdi::resolveParentContext(foreign, parent);
        assert(parent == f.a);
        parent = nullptr;
        auto array = Valdi::ValueArray::make(1);
        array->emplace(0, foreign);
        Value nested = object();
        nested.setMapValue("nested", Value(array));
        Valdi::resolveParentContext(nested, parent);
        assert(parent == f.a);
        bool rejected = false;
        try { (void)dictionary(nested); }
        catch (const std::runtime_error&) { rejected = true; }
        assert(rejected); // Router page params cannot carry that JS holder.
    });
}

static void retirement(const std::string& source) {
    CallerFixture f(source);
    // Retire A, then B can still emit; no foreground/global admission gate.
    f.make(f.a, "attached"); f.native("attached");
    auto attached = f.onlyPending(); f.ui->drainBatch(); assert(attached->attached);
    f.make(f.child, "outside");
    f.eval(f.child, "sheetCaller.direct('outside')");
    auto all = f.pending(); assert(all.size() == 2);
    auto outside = all[0] == attached ? all[1] : all[0];
    assert(!outside->attached);
    auto page = f.page(f.a);
    f.nav->retirePage(page);
    f.scheduler->barrier(); // JS destroyContext fence ran; UI destroy has not.
    assert(attached->completed && outside->completed);
    assert(!f.a->isDestroyed() && f.runtime->requested == 1 && f.runtime->destroyed == 0);
    const auto count = f.nav->attachments.size();

    f.make(f.a, "reentrant"); f.native("reentrant");
    assert(f.pending().empty()); // Still gated during the JS -> UI destroy hop.
    f.make(f.b, "survives"); f.native("survives");
    auto other = f.onlyPending(); assert(!other->completed);
    f.ui->drainBatch(); // canceled outside command cannot attach.
    assert(f.a->isDestroyed() && f.nav->attachments.size() == count + 1);
    assert(other->attached && !other->completed); f.settle(other);
    assert(f.eval(f.global, "sheetCaller.count('attached')") == "1");
    assert(f.eval(f.global, "sheetCaller.count('outside')") == "1");
    assert(f.eval(f.global, "sheetCaller.count('reentrant')") == "1");
    // The supplied native-picker page has no tree. Retiring it must not sweep
    // an unrelated pending JS caller, nor an explicitly unowned native result.
    f.make(f.b, "picker-control"); f.native("picker-control");
    other = f.onlyPending();
    f.row("picker-control", other, f.b, nullptr);
    auto unowned = std::make_shared<CallerFixture::Navigator::Result>();
    {
        Valdi::ContextEntry explicitlyUnowned(nullptr);
        CallerFixture::Navigator::captureResultCaller(*unowned);
    }
    assert(!unowned->callerCaptured && unowned->callerLineage.empty());
    f.nav->enqueue([](auto&) {}, unowned);
    auto picker = f.page(nullptr); assert(!picker->tree);
    f.nav->retirePage(picker);
    f.nav->cancelCallerResults(f.a);
    assert(!other->completed && !unowned->completed);
    f.settle(other); f.settle(unowned); f.ui->drainBatch();
}

static void rootResultChain(const std::string& source) {
    CallerFixture f(source);
    f.make(f.global, "chain", "chain"); f.native("chain");
    auto first = f.onlyPending();
    f.row("chain", first, f.global, f.global);
    f.ui->drainBatch(); assert(first->attached);
    auto sheetContext = f.context(905);
    auto sheet = f.page(sheetContext);
    sheet->result = first;
    f.nav->retirePage(sheet, ValdiHarmony::object(), false);
    f.scheduler->barrier();
    auto next = f.onlyPending();
    f.row("chain:next", next, f.global, f.global);
    assert(!next->completed && !next->attached);
    assert(!sheetContext->isDestroyed());
    f.ui->drainBatch();
    assert(sheetContext->isDestroyed() && next->attached && !next->completed);
    f.settle(next);
    assert(f.eval(f.global, "sheetCaller.count('chain')") == "1");
    assert(f.eval(f.global, "sheetCaller.count('chain:next')") == "1");
}

int main(int argc, char** argv) {
    assert(argc == 2);
    std::ifstream stream(argv[1]);
    assert(stream);
    std::ostringstream source; source << stream.rdbuf();
    std::cout << "{\"freshABI\":{\"IJavaScriptContext\":" << sizeof(Valdi::IJavaScriptContext)
              << ",\"JSValueRef\":" << sizeof(Valdi::JSValueRef)
              << ",\"Context\":" << sizeof(Valdi::Context) << "}}\n";
    characterization(source.str());
    pageParentResolution(source.str());
    retirement(source.str());
    rootResultChain(source.str());
    std::cout << "PASS bounded real JSC/wrappers/DispatchQueue characterization; "
                 "rendering, production scheduler and OHOS Hermes remain unproved\n";
}
