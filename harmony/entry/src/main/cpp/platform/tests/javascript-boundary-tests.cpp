#include "PlatformTestHelpers.hpp"
// Real pinned Valdi adapter + attached JavaScriptValueMarshaller. Only the OS
// transport and JS queue are doubles; no JavaScript/Valdi ABI is redeclared.
#include "../PlatformServicePort.hpp"
#include "../PlatformBluetoothModule.hpp"
#include "valdi_core/cpp/Marshalling/RegisteredCppGeneratedClass.hpp"
#include "valdi/jscore/JavaScriptCoreContext.hpp"
#include "valdi/runtime/Context/ContextEntry.hpp"
#include "valdi/runtime/JavaScript/JavaScriptTaskScheduler.hpp"
#include "valdi/runtime/JavaScript/JavaScriptUtils.hpp"
#include "valdi/runtime/JavaScript/JavaScriptValueMarshaller.hpp"
#include "valdi_core/cpp/Utils/ConsoleLogger.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include <gtest/gtest.h>
#include <deque>

using namespace ValdiHarmony::Platform;
using Valdi::Value;
namespace {
struct EngineOS final : ServiceTransport {
    Completion completion;
    std::map<std::string, Event> events;
    void invoke(const MethodDescriptor&, std::vector<Value>, Completion c) override {
        completion = std::move(c);
    }
    void setEvents(const EventsDescriptor& descriptor, uint64_t, Event event) override {
        events[descriptor.service] = std::move(event);
    }
    void setActive(bool) override {}
    void close() override {}
    void release() override {}
};

Value fixture(const Valdi::ValueSchema& input) {
    auto schema = resolved(input);
    if (schema.isVoid()) return Value::undefined();
    if (schema.isString()) return Value("fixture");
    if (schema.isBoolean()) return Value(true);
    if (schema.isDouble() || schema.isInteger() || schema.isLongInteger()) return Value(17.0);
    if (schema.isValueTypedArray()) {
        auto bytes = Valdi::makeShared<Valdi::Bytes>();
        bytes->assign({0, 1, 255});
        return Value(Valdi::makeShared<Valdi::ValueTypedArray>(Valdi::Uint8Array, bytes));
    }
    if (schema.isArray())
        return Value(Valdi::ValueArray::make({fixture(schema.getArrayItemSchema())}));
    if (schema.isClass()) {
        // All transport DTOs are generated ExportModel/c schemas. Do not
        // "repair" records by erasing their schema or wrapping them as proxies.
        EXPECT_FALSE(schema.getClass()->isInterface()) << schema.toString();
        Value map;
        for (const auto& field : *schema.getClass())
            map.setMapValue(field.name, fixture(field.schema));
        auto result = copy(schema, map);
        EXPECT_TRUE(result.isTypedObject());
        EXPECT_EQ(result.getTypedObject()->getSchema(), schema.getClassRef());
        return result;
    }
    ADD_FAILURE() << "Missing generated fixture type: " << schema.toString();
    return Value::undefined();
}

struct EngineQueue final : Valdi::JavaScriptTaskScheduler {
    Valdi::IJavaScriptContext* engine = nullptr;
    std::deque<Valdi::JavaScriptThreadTask> tasks;
    void dispatchOnJsThread(Valdi::Ref<Valdi::Context> owner, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t, Valdi::JavaScriptThreadTask&& task) override {
        if (type == Valdi::JavaScriptTaskScheduleTypeAlwaysAsync) {
            tasks.push_back(std::move(task));
        } else {
            // The official bridge's synchronous dispatch captures stack refs.
            // Honor that contract when already on this test's JS thread.
            Valdi::JSExceptionTracker error(*engine);
            Valdi::JavaScriptEntryParameters entry(*engine, error, owner);
            task(entry);
            EXPECT_TRUE(error) << error.extractError().toString();
        }
    }
    void dispatchOnJsThread(Valdi::JsThreadDispatchReason, Valdi::JavaScriptTaskScheduleType type,
                            uint32_t delay, Valdi::JavaScriptThreadTask&& task) override {
        dispatchOnJsThread(Valdi::Ref<Valdi::Context>(), type, delay, std::move(task));
    }
    bool isInJsThread() override { return true; }
    Valdi::Ref<Valdi::Context> getLastDispatchedContext() const override { return nullptr; }
    std::vector<Valdi::JavaScriptCapturedStacktrace> captureStackTraces(
        std::chrono::steady_clock::duration) override { return {}; }
};
class Boundary : public testing::Test {
public:
    Valdi::Ref<EngineQueue> queue = Valdi::makeShared<EngineQueue>();
    ValdiJSCore::JavaScriptCoreContext engine{queue.get(), Valdi::ConsoleLogger::getLogger()};
    std::shared_ptr<EngineOS> os = std::make_shared<EngineOS>();
    std::shared_ptr<ServicePort> port = ServicePort::create(
        os, [](auto work) { work(); }, [](auto work) { work(); });
    Valdi::Ref<Valdi::Context> owner = Valdi::makeShared<Valdi::Context>(
        701, Valdi::Ref<Valdi::ILogger>());
    std::unique_ptr<Valdi::ContextEntry> entered;

    void SetUp() override {
        queue->engine = &engine;
        owner->postInit();
        entered = std::make_unique<Valdi::ContextEntry>(owner);
        Valdi::JSExceptionTracker error(engine);
        engine.initialize({}, error);
        ASSERT_TRUE(error) << error.extractError().toString();
        ASSERT_NE(engine.getValueMarshaller(), nullptr);
    }
    void TearDown() override {
        port->closeOnUI();
        port->shutdownOnJS();
        drain();
        port->releaseOnUI();
        entered.reset();
        owner->onDestroy();
        drain();
    }
    void drain() {
        while (!queue->tasks.empty()) {
            auto task = std::move(queue->tasks.front());
            queue->tasks.pop_front();
            Valdi::JSExceptionTracker error(engine);
            Valdi::JavaScriptEntryParameters entry(engine, error, nullptr);
            task(entry);
            EXPECT_TRUE(error) << error.extractError().toString();
        }
    }
    void install(const Value& value) {
        Valdi::JSExceptionTracker error(engine);
        auto global = engine.getGlobalObject(error);
        auto js = Valdi::valueToJSValue(engine, value, Valdi::ReferenceInfoBuilder(), error);
        ASSERT_TRUE(error) << error.extractError().toString();
        engine.setObjectProperty(global.get(), "__harmonyBusinessBootstrap", js.get(), true, error);
        ASSERT_TRUE(error) << error.extractError().toString();
    }
    std::string eval(const std::string& source) {
        Valdi::JSExceptionTracker error(engine);
        auto value = engine.evaluate(source, "platform-boundary-test.js", error);
        EXPECT_TRUE(error) << error.extractError().toString();
        if (!error) return {};
        auto result = engine.valueToString(value.get(), error);
        EXPECT_TRUE(error) << error.extractError().toString();
        return result.slowToString();
    }
    Value received(const Valdi::ValueSchema& schema) {
        Valdi::JSExceptionTracker error(engine);
        auto global = engine.getGlobalObject(error);
        auto js = engine.getObjectProperty(global.get(), "received", error);
        auto result = engine.getValueMarshaller()->marshall(js, schema, Valdi::ReferenceInfoBuilder(), error);
        EXPECT_TRUE(error) << error.extractError().toString();
        return result;
    }
};

TEST_F(Boundary, BareGeneratedInterfaceReproducesBootstrapFailure) {
    for (const auto* service : {"ble", "permissions", "wifi", "nfc"}) {
        SCOPED_TRACE(service);
        // Exactly the pre-fix payload, with real populated native methods.
        auto proxy = testHostValue(port, service);
        Value bootstrap;
        bootstrap.setMapValue(service, Value(proxy.getProxyObject()->getTypedObject()));
        Valdi::JSExceptionTracker error(engine);
        auto ignored = Valdi::valueToJSValue(engine, bootstrap, Valdi::ReferenceInfoBuilder(), error);
        ASSERT_FALSE(error);
        EXPECT_NE(error.extractError().toString().find(
            "Cannot convert type 'typed object' to type 'proxy object'"), std::string::npos);
    }
}

TEST_F(Boundary, ProductionHostsCrossNestedBootstrapWithAttachedMarshaller) {
    Value bootstrap;
    for (const auto* service : {"ble", "permissions", "wifi", "nfc"})
        bootstrap.setMapValue(service, testHostValue(port, service));
    bootstrap.setMapValue("samePermissionHost", bootstrap.getMapValue("permissions"));
    install(bootstrap);
    EXPECT_EQ(eval("typeof __harmonyBusinessBootstrap.permissions.check + ':' + "
                   "typeof __harmonyBusinessBootstrap.wifi.getConnectedWifi + ':' + "
                   "typeof __harmonyBusinessBootstrap.nfc.getAvailability + ':' + "
                   "typeof __harmonyBusinessBootstrap.ble.openBluetoothAdapter"),
              "function:function:function:function");
    EXPECT_EQ(eval("__harmonyBusinessBootstrap.permissions === "
                   "__harmonyBusinessBootstrap.samePermissionHost"), "true");
}

TEST_F(Boundary, BluetoothFactoryAndGeneratedHostReturnCrossAttachedMarshaller) {
    BluetoothFactory factory(port);
    EXPECT_EQ(factory.getModulePath().toStringView(), "bluetooth/src/Bluetooth");
    auto module = factory.loadModule();
    ASSERT_TRUE(module.isProxyObject());
    auto typed = module.getProxyObject()->getTypedObject();
    auto generated = snap::valdi_modules::bluetooth::BluetoothModule::getRegisteredClass()
        ->getResolvedClassSchema();
    ASSERT_TRUE(generated);
    EXPECT_EQ(typed->getSchema(), generated.value());
    install(module);
    EXPECT_EQ(eval("typeof __harmonyBusinessBootstrap.getHost().openBluetoothAdapter"), "function");
    // The original factory payload independently reproduces the same c+ error.
    Valdi::JSExceptionTracker error(engine);
    auto ignored = Valdi::valueToJSValue(engine, Value(typed), Valdi::ReferenceInfoBuilder(), error);
    ASSERT_FALSE(error);
    EXPECT_NE(error.extractError().toString().find(
        "Cannot convert type 'typed object' to type 'proxy object'"), std::string::npos);
}

TEST_F(Boundary, EveryGeneratedMethodMarshalsArgumentsAndFulfillsItsTypedPromiseInJS) {
    size_t calls = 0;
    for (const auto* service : {"ble", "permissions", "wifi", "nfc"}) {
        for (const auto& field : *hostSchema(service)) {
            const auto name = field.name.slowToString();
            if (name == "setEvents") continue;
            SCOPED_TRACE(std::string(service) + "." + name);
            const auto& method = *field.schema.getFunction();
            std::vector<Value> args;
            for (size_t i = 0; i < method.getParametersSize(); ++i)
                args.push_back(fixture(method.getParameter(i)));
            Value bootstrap;
            bootstrap.setMapValue("host", testHostValue(port, service));
            bootstrap.setMapValue("args", Value(Valdi::ValueArray::make(std::move(args))));
            install(bootstrap);
            os->completion = {};
            EXPECT_EQ(eval("globalThis.settled = 'pending'; globalThis.received = undefined; "
                           "__harmonyBusinessBootstrap.host." + name +
                           "(...__harmonyBusinessBootstrap.args).then("
                           "v => { globalThis.received = v; globalThis.settled = 'ok'; }, "
                           "e => { globalThis.settled = String(e); }); 'armed'"), "armed");
            ASSERT_TRUE(os->completion);
            auto resultSchema = method.getReturnValue().getPromise()->getValueSchema();
            auto expected = fixture(resultSchema);
            os->completion(expected, {});
            drain();
            EXPECT_EQ(eval("globalThis.settled"), "ok");
            EXPECT_EQ(copy(resultSchema, received(resultSchema)), expected);
            ++calls;
        }
    }
    EXPECT_EQ(calls, 52u);
}

TEST_F(Boundary, EveryGeneratedFutureRejectsMalformedOSResultsInJS) {
    size_t calls = 0;
    for (const auto* descriptor : serviceDescriptors()) {
        for (const auto& method : descriptor->methods) {
            SCOPED_TRACE(descriptor->name + "." + method.name);
            std::vector<Value> args;
            for (const auto& schema : method.parameters) args.push_back(fixture(schema));
            Value bootstrap;
            bootstrap.setMapValue("host", testHostValue(port, descriptor->name));
            bootstrap.setMapValue("args", Value(Valdi::ValueArray::make(std::move(args))));
            install(bootstrap);
            EXPECT_EQ(eval("globalThis.settled = 'pending'; __harmonyBusinessBootstrap.host." +
                method.name + "(...__harmonyBusinessBootstrap.args).then("
                "() => globalThis.settled = 'fulfilled', "
                "e => globalThis.settled = String(e)); 'armed'"), "armed");
            ASSERT_TRUE(os->completion);
            // A string for boolean payloads and a boolean for every other
            // result kind is invalid, including Promise<void>.
            os->completion(resolved(method.result).isBoolean() ? Value("false") : Value(false), {});
            drain();
            EXPECT_NE(eval("globalThis.settled").find("E_PLATFORM_INVALID"), std::string::npos);
            ++calls;
        }
    }
    EXPECT_EQ(calls, 52u);
}

TEST_F(Boundary, GeneratedModuleAndCachedHostKeepOnlyWeakRuntimeOwnership) {
    auto detached = ServicePort::create(os, [](auto task) { task(); }, [](auto task) { task(); });
    std::weak_ptr<ServicePort> weak = detached;
    BluetoothFactory factory(detached);
    install(factory.loadModule());
    EXPECT_EQ(eval("globalThis.cachedHost = __harmonyBusinessBootstrap.getHost(); "
                   "typeof globalThis.cachedHost.closeBluetoothAdapter"), "function");
    detached->closeOnUI();
    detached->shutdownOnJS();
    detached->releaseOnUI();
    detached.reset();
    ASSERT_TRUE(weak.expired());
    EXPECT_EQ(eval("globalThis.settled = 'pending'; cachedHost.closeBluetoothAdapter().then("
                   "() => globalThis.settled = 'fulfilled', "
                   "e => globalThis.settled = String(e)); 'armed'"), "armed");
    drain();
    EXPECT_NE(eval("globalThis.settled").find("E_PLATFORM_CLOSED"), std::string::npos);
    EXPECT_NE(eval("try { __harmonyBusinessBootstrap.getHost(); 'unexpected'; } "
                   "catch (e) { String(e); }").find("E_PLATFORM_CLOSED"), std::string::npos);
}

TEST_F(Boundary, GeneratedEventRecordsArraysAndBytesReachJS) {
    size_t count = 0;
    for (const auto* service : {"ble", "wifi", "nfc"}) {
        auto host = hostSchema(service);
        auto events = resolved(methodSchema(*host, Valdi::StringBox::fromCString("setEvents")).getParameter(0));
        ASSERT_FALSE(events.getClass()->isInterface());
        install(testHostValue(port, service));
        std::string sink = "{";
        for (const auto& field : *events.getClass())
            sink += field.name.slowToString() + ": v => { globalThis.received = v; },";
        EXPECT_EQ(eval("__harmonyBusinessBootstrap.setEvents(" + sink + "}); 'installed'"), "installed");
        ASSERT_TRUE(os->events.count(service));
        for (const auto& field : *events.getClass()) {
            SCOPED_TRACE(std::string(service) + "." + field.name.slowToString());
            const auto& schema = field.schema.getFunction()->getParameter(0);
            auto expected = fixture(schema);
            os->events[service](field.name.slowToString(), expected);
            drain();
            EXPECT_EQ(copy(schema, received(schema)), expected);
            EXPECT_EQ(eval("globalThis.received = 'unchanged'; 'armed'"), "armed");
            os->events[service](field.name.slowToString(),
                resolved(schema).isBoolean() ? Value("false") : Value(false));
            drain();
            EXPECT_EQ(eval("globalThis.received"), "unchanged");
            ++count;
        }
    }
    EXPECT_EQ(count, 14u);
}
} // namespace
