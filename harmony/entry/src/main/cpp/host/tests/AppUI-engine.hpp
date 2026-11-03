#pragma once
// Real pinned Valdi JSC adapter and attached c+ proxy/Promise marshaller.
// The scheduler retains each task's Context exactly as JavaScriptRuntime does.
#include "valdi/jscore/JavaScriptCoreContext.hpp"
#include "valdi/runtime/JavaScript/JavaScriptTaskScheduler.hpp"
#include "valdi/runtime/JavaScript/JavaScriptUtils.hpp"
#include "valdi_core/cpp/Utils/ConsoleLogger.hpp"

struct AppUIEngineQueue final : Valdi::JavaScriptTaskScheduler {
    struct Task {
        Valdi::RetainedContext owner;
        Valdi::JavaScriptThreadTask callback;
    };
    Valdi::IJavaScriptContext* engine = nullptr;
    std::deque<Task> tasks;
    void execute(Task task) {
        Valdi::JSExceptionTracker error(*engine);
        Valdi::JavaScriptEntryParameters entry(*engine, error, task.owner.context);
        task.callback(entry);
        if (!error) throw std::runtime_error(error.extractError().toString());
    }
    void dispatchOnJsThread(Valdi::Ref<Valdi::Context> owner, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t, Valdi::JavaScriptThreadTask&& callback) override {
        Task task{Valdi::RetainedContext(std::move(owner)), std::move(callback)};
        if (type == Valdi::JavaScriptTaskScheduleTypeAlwaysAsync) tasks.push_back(std::move(task));
        else execute(std::move(task));
    }
    void dispatchOnJsThread(Valdi::JsThreadDispatchReason, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t delay, Valdi::JavaScriptThreadTask&& task) override {
        dispatchOnJsThread(Valdi::Ref<Valdi::Context>(), type, delay, std::move(task));
    }
    bool isInJsThread() override { return true; }
    Valdi::Ref<Valdi::Context> getLastDispatchedContext() const override { return nullptr; }
    std::vector<Valdi::JavaScriptCapturedStacktrace> captureStackTraces(
        std::chrono::steady_clock::duration) override { return {}; }
    void drain() {
        while (!tasks.empty()) {
            auto task = std::move(tasks.front()); tasks.pop_front(); execute(std::move(task));
        }
    }
};

struct AppUIEngine {
    Valdi::Ref<AppUIEngineQueue> queue = Valdi::makeShared<AppUIEngineQueue>();
    ValdiJSCore::JavaScriptCoreContext engine{queue.get(), Valdi::ConsoleLogger::getLogger()};
    AppUIEngine(const Valdi::Value& host) {
        queue->engine = &engine;
        Valdi::JSExceptionTracker error(engine);
        engine.initialize({}, error);
        if (!error) throw std::runtime_error(error.extractError().toString());
        assert(engine.getValueMarshaller() != nullptr);
        // Exercise the actual nested business-bootstrap conversion.
        Valdi::Value bootstrap; bootstrap.setMapValue("appUI", host);
        auto js = Valdi::valueToJSValue(engine, bootstrap, Valdi::ReferenceInfoBuilder(), error);
        if (!error) throw std::runtime_error(error.extractError().toString());
        auto global = engine.getGlobalObject(error);
        engine.setObjectProperty(global.get(), "__harmonyBusinessBootstrap", js.get(), true, error);
        if (!error) throw std::runtime_error(error.extractError().toString());
    }
    std::string eval(const std::string& source) {
        Valdi::JSExceptionTracker error(engine);
        auto js = engine.evaluate(source, "AppUI-engine-test.js", error);
        if (!error) throw std::runtime_error(error.extractError().toString());
        auto value = engine.valueToString(js.get(), error);
        if (!error) throw std::runtime_error(error.extractError().toString());
        return value.slowToString();
    }
};
