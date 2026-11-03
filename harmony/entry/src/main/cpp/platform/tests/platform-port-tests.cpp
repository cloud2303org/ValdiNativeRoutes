#include "PlatformTestHelpers.hpp"
#include "../PlatformServicePort.hpp"
#include "valdi/runtime/Context/ContextEntry.hpp"
#include "valdi/runtime/Utils/Disposable.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_core/cpp/Utils/ValueTypedProxyObject.hpp"
#include <gtest/gtest.h>
#include <deque>
#include <thread>

using namespace ValdiHarmony::Platform;
using Valdi::Value;
namespace {
struct Queue {
    std::deque<std::function<void()>> work;
    Post post() { return [this](auto fn) { work.emplace_back(std::move(fn)); }; }
    void drain() {
        while (!work.empty()) {
            auto task = std::move(work.front());
            work.pop_front();
            task();
        }
    }
};
// OS service double only; schemas, functions, models, promises, pinning and
// ServicePort lifecycle are the production implementation linked to real Valdi.
struct OS final : ServiceTransport {
    std::string service, method;
    std::vector<Value> args;
    Completion completion;
    std::vector<Event> events;
    int invokes = 0, closes = 0, releases = 0;
    void invoke(const MethodDescriptor& d, std::vector<Value> a, Completion c) override {
        service = d.service; method = d.name; args = std::move(a); completion = std::move(c); ++invokes;
    }
    void setEvents(const EventsDescriptor&, uint64_t, Event event) override { events.push_back(std::move(event)); }
    void setActive(bool) override {}
    void close() override { ++closes; }
    void release() override { ++releases; }
};
Value call(const Value& host, const char* method, std::initializer_list<Value> args = {}) {
    auto fn = property(host, Valdi::StringBox::fromCString(method)).getFunctionRef();
    auto result = (*fn)(Valdi::ValueFunctionFlagsCallSync, args);
    EXPECT_TRUE(result);
    return result ? result.value() : Value::undefined();
}
Valdi::Ref<Valdi::Promise> promise(const Value& value) {
    return Valdi::castOrNull<Valdi::Promise>(value.getValdiObject());
}
Value bytes(std::initializer_list<uint8_t> values) {
    auto storage = Valdi::makeShared<Valdi::Bytes>();
    storage->assign(values);
    return Value(Valdi::makeShared<Valdi::ValueTypedArray>(Valdi::Uint8Array, storage));
}
struct Harness {
    Queue ui, js;
    std::shared_ptr<OS> os = std::make_shared<OS>();
    std::shared_ptr<ServicePort> port = ServicePort::create(os, ui.post(), js.post());
    ~Harness() { port->closeOnUI(); js.drain(); port->shutdownOnJS(); port->releaseOnUI(); }
};

TEST(Platform, AllGeneratedSignaturesAreRealTypedModels) {
    Harness h;
    size_t count = 0;
    for (const auto* name : {"ble", "permissions", "wifi", "nfc"}) {
        auto host = testHostValue(h.port, name);
        ASSERT_TRUE(host.isProxyObject());
        EXPECT_EQ(host.getProxyObject()->getTypedObject()->getSchema(), hostSchema(name));
        ASSERT_TRUE(hostSchema(name)->isInterface());
        for (const auto& property : *host.getProxyObject()->getTypedObject()->getSchema()) {
            auto* method = property.schema.getFunction();
            ASSERT_NE(method, nullptr);
            if (property.name.toStringView() == "setEvents") {
                EXPECT_TRUE(resolved(method->getParameter(0)).isClass());
                EXPECT_TRUE(method->getReturnValue().isVoid());
            } else {
                ASSERT_TRUE(method->getReturnValue().isPromise());
                EXPECT_FALSE(method->getReturnValue().getPromise()->getValueSchema().isUntyped());
                ++count;
            }
            for (size_t i = 0; i < method->getParametersSize(); ++i)
                EXPECT_FALSE(method->getParameter(i).isUntyped());
        }
    }
    EXPECT_EQ(count, 52u);
    auto ble = hostSchema("ble");
    auto& write = methodSchema(*ble, Valdi::StringBox::fromCString("writeBLECharacteristicValue"));
    EXPECT_EQ(write.getParametersSize(), 1u);
    EXPECT_TRUE(resolved(write.getParameter(0)).isClass());
}

TEST(Platform, PublicCodecRejectsInvalidRecordsAndOwnsViews) {
    auto schema = hostSchema("nfc");
    const auto& method = methodSchema(*schema, Valdi::StringBox::fromCString("transceive"));
    Value handle;
    handle.setMapValue("tagHandle", Value("tag"));
    handle.setMapValue("tech", Value("NfcA"));
    auto owned = copy(method.getParameter(0), handle);
    handle.setMapValue("tagHandle", Value("changed"));
    EXPECT_EQ(property(owned, Valdi::StringBox::fromCString("tagHandle")).toString(), "tag");
    handle.setMapValue("tech", Value(true));
    EXPECT_THROW(copy(method.getParameter(0), handle), std::invalid_argument);
    EXPECT_THROW(copy(method.getParameter(0), bytes({1, 2})), std::invalid_argument);
    auto storage = Valdi::makeShared<Valdi::Bytes>();
    storage->assign({90, 1, 2, 3, 91});
    auto view = Value(Valdi::makeShared<Valdi::ValueTypedArray>(Valdi::Uint8Array,
        Valdi::BytesView(storage).subrange(1, 3)));
    auto copied = copy(method.getParameter(1), view);
    (*storage)[1] = 88;
    EXPECT_EQ(copied.getTypedArray()->getBuffer().size(), 3u);
    EXPECT_EQ(copied.getTypedArray()->getBuffer().data()[0], 1);
    EXPECT_THROW(copy(method.getParameter(1), Value(true)), std::invalid_argument);
    auto optional = Valdi::ValueSchema::string().asOptional();
    EXPECT_TRUE(copy(optional, Value()).isNull());
    EXPECT_TRUE(copy(optional, Value::undefined()).isUndefined());
}

TEST(Platform, OwnedParametersAndResultsQueueExactlyOnce) {
    Harness h;
    Value handle;
    handle.setMapValue("tagHandle", Value("tag"));
    handle.setMapValue("tech", Value("NfcA"));
    auto input = bytes({1, 2, 3});
    auto result = promise(call(testHostValue(h.port, "nfc"), "transceive", {handle, input}));
    ASSERT_NE(result, nullptr);
    int count = 0;
    result->onComplete([&](const Valdi::Result<Value>& terminal) {
        ++count;
        ASSERT_TRUE(terminal);
        EXPECT_EQ(terminal.value().getTypedArray()->getBuffer().data()[0], 5);
    });
    handle.setMapValue("tech", Value("mutated"));
    EXPECT_EQ(h.os->invokes, 0);
    h.ui.drain();
    ASSERT_EQ(h.os->args.size(), 2u);
    EXPECT_EQ(property(h.os->args[0], Valdi::StringBox::fromCString("tech")).toString(), "NfcA");
    h.os->completion(bytes({5, 6}), "");
    EXPECT_EQ(count, 0);
    h.os->completion(bytes({7}), "");
    h.js.drain();
    EXPECT_EQ(count, 1);
}

TEST(Platform, RejectsInvalidArgumentsBeforeUIAndInvalidResultsOnJS) {
    Harness h;
    auto permission = testHostValue(h.port, "permissions");
    auto function = property(permission, Valdi::StringBox::fromCString("check")).getFunctionRef();
    auto invalid = (*function)(Valdi::ValueFunctionFlagsCallSync, {Value(true)});
    // The official CppMarshaller now rejects the wrong native argument type
    // before entering the strongly typed virtual method.
    ASSERT_FALSE(invalid);
    int failed = 1;
    h.ui.drain();
    EXPECT_EQ(h.os->invokes, 0);
    auto result = promise(call(permission, "check", {Value("bluetooth")}));
    result->onComplete([&](const auto& terminal) { EXPECT_FALSE(terminal); ++failed; });
    h.ui.drain();
    h.os->completion(Value("true"), "");
    h.js.drain();
    EXPECT_EQ(failed, 2);
}

TEST(Platform, ExplicitGeneratedSubclassReturnsTypedFutureAndKeepsProxyIdentity) {
    Harness h;
    auto host = h.port->interfaces().ble();
    auto first = h.port->interfaces().bleValue();
    auto second = h.port->interfaces().bleValue();
    ASSERT_TRUE(first.isProxyObject());
    EXPECT_EQ(first.getProxyObject(), second.getProxyObject());
    auto future = host->getBLEDeviceRSSI(Valdi::StringBox::fromCString("device"));
    int count = 0;
    future.then([&](Valdi::Result<double> result) {
        ASSERT_TRUE(result);
        EXPECT_EQ(result.value(), -73.5);
        ++count;
    });
    h.ui.drain();
    EXPECT_EQ(h.os->method, "getBLEDeviceRSSI");
    h.os->completion(Value(-73.5), "");
    EXPECT_EQ(count, 0);
    h.js.drain();
    EXPECT_EQ(count, 1);
    h.port->closeOnUI();
    h.js.drain();
    host->getBLEDeviceRSSI(Valdi::StringBox::fromCString("device")).then(
        [&](Valdi::Result<double> result) { EXPECT_FALSE(result); ++count; });
    EXPECT_EQ(count, 2);
}

TEST(Platform, VoidPromiseRejectsTransportFailureEvenWithNullResult) {
    Harness h;
    auto result = promise(call(testHostValue(h.port, "permissions"), "openSettings"));
    ASSERT_NE(result, nullptr);
    int count = 0;
    result->onComplete([&](const auto& terminal) {
        ++count;
        ASSERT_FALSE(terminal);
        EXPECT_EQ(terminal.error().toString(), "E_PLATFORM_SERVICE:ArkTS service rejected");
    });
    h.ui.drain();
    h.os->completion(Value(), "E_PLATFORM_SERVICE:ArkTS service rejected");
    EXPECT_EQ(count, 0);
    h.js.drain();
    EXPECT_EQ(count, 1);
    h.os->completion(Value::undefined(), "");
    h.js.drain();
    EXPECT_EQ(count, 1);
}

TEST(Platform, CloseCancelsUnresolvedPromptAndRejectsLateDuplicates) {
    Harness h;
    auto host = testHostValue(h.port, "permissions");
    auto result = promise(call(host, "requestMultiple",
        {Value(Valdi::ValueArray::make({Value("bluetooth")}))}));
    int count = 0;
    result->onComplete([&](const auto& terminal) { EXPECT_FALSE(terminal); ++count; });
    h.ui.drain();
    auto late = h.os->completion;
    h.port->closeOnUI();
    EXPECT_EQ(count, 0);
    EXPECT_EQ(h.os->closes, 1);
    h.js.drain();
    EXPECT_EQ(count, 1);
    late(Value::undefined(), "");
    h.js.drain();
    h.port->shutdownOnJS();
    h.port->closeOnUI();
    EXPECT_EQ(count, 1);
    int stale = 0;
    promise(call(host, "openSettings"))->onComplete([&](const auto& terminal) {
        EXPECT_FALSE(terminal); ++stale;
    });
    EXPECT_EQ(stale, 1);
    h.port->releaseOnUI(); h.port->releaseOnUI();
    EXPECT_EQ(h.os->releases, 1);
}

TEST(Platform, SeparateUIAndJSExecutionSettlesAndReleasesOnlyOnJS) {
    Harness h;
    const auto jsThread = std::this_thread::get_id();
    auto result = promise(call(testHostValue(h.port, "permissions"), "check", {Value("bluetooth")}));
    int count = 0;
    result->onComplete([&](const auto& terminal) {
        EXPECT_EQ(std::this_thread::get_id(), jsThread);
        ASSERT_TRUE(terminal);
        EXPECT_TRUE(terminal.value().toBool());
        ++count;
    });
    std::thread ui([&] {
        h.ui.drain();
        h.os->completion(Value(true), "");
    });
    ui.join();
    EXPECT_EQ(count, 0);
    h.js.drain();
    EXPECT_EQ(count, 1);
    auto canceled = promise(call(testHostValue(h.port, "permissions"), "openSettings"));
    canceled->onComplete([&](const auto& terminal) {
        EXPECT_EQ(std::this_thread::get_id(), jsThread);
        EXPECT_FALSE(terminal);
        ++count;
    });
    std::thread closeUI([&] { h.port->closeOnUI(); });
    closeUI.join();
    EXPECT_EQ(count, 1);
    h.js.drain();
    EXPECT_EQ(count, 2);
    h.ui.drain(); // The queued call was not admitted after close.
    EXPECT_EQ(h.os->invokes, 1);
}

TEST(Platform, PartialInitializationShutdownStillClosesOSListenersOnUI) {
    Harness h;
    h.port->shutdownOnJS();
    h.port->closeOnUI();
    EXPECT_EQ(h.os->closes, 1);
}

TEST(Platform, ShutdownTaskOwnsCancellationUntilJSFence) {
    Queue ui, js;
    auto os = std::make_shared<OS>();
    auto port = ServicePort::create(os, ui.post(), js.post());
    auto result = promise(call(testHostValue(port, "permissions"), "openSettings"));
    int count = 0;
    const auto jsThread = std::this_thread::get_id();
    result->onComplete([&](const auto& terminal) {
        EXPECT_EQ(std::this_thread::get_id(), jsThread);
        EXPECT_FALSE(terminal);
        ++count;
    });
    port->closeOnUI();
    port.reset();
    EXPECT_EQ(count, 0);
    js.drain();
    ui.drain();
    EXPECT_EQ(count, 1);
    os->release(); // Double has no NAPI refs; production RuntimeHost retains through the UI release fence.
}

Value sink(const char* service, int& count) {
    auto host = hostSchema(service);
    auto schema = resolved(methodSchema(*host, Valdi::StringBox::fromCString("setEvents")).getParameter(0));
    Value result;
    for (const auto& field : *schema.getClass())
        result.setMapValue(field.name, Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
            [&count](const auto&) { ++count; return Value::undefined(); })));
    return result;
}

TEST(Platform, EventsUseTypedValuesAndEpochsAndRuntimeIsolation) {
    Harness a, b;
    int first = 0, second = 0, other = 0;
    call(testHostValue(a.port, "nfc"), "setEvents", {sink("nfc", first)});
    call(testHostValue(b.port, "nfc"), "setEvents", {sink("nfc", other)});
    a.ui.drain(); b.ui.drain();
    a.os->events[0]("discoveryStateChange", Value(true));
    EXPECT_EQ(first, 0);
    a.js.drain();
    EXPECT_EQ(first, 1);
    EXPECT_EQ(other, 0);
    call(testHostValue(a.port, "nfc"), "setEvents", {sink("nfc", second)});
    a.ui.drain();
    a.os->events[0]("discoveryStateChange", Value(true)); // Retired epoch.
    a.os->events[1]("discoveryStateChange", Value("true")); // Invalid bool.
    a.os->events[1]("discoveryStateChange", Value(false));
    a.js.drain();
    EXPECT_EQ(first, 1);
    EXPECT_EQ(second, 1);
    a.port->closeOnUI();
    a.os->events[1]("discoveryStateChange", Value(true));
    a.js.drain();
    EXPECT_EQ(second, 1);
    b.os->events[0]("discoveryStateChange", Value(false));
    b.js.drain();
    EXPECT_EQ(other, 1);
}

struct Disposable final : Valdi::Disposable {
    bool disposed = false;
    bool dispose(std::unique_lock<Valdi::Mutex>&) override { disposed = true; return true; }
};
TEST(Platform, ActualContextPinSurvivesPageDestroyUntilJSCancellation) {
    Harness h;
    Disposable disposable;
    auto owner = Valdi::makeShared<Valdi::Context>(101, Valdi::Ref<Valdi::ILogger>());
    owner->postInit();
    ASSERT_TRUE(owner->insertDisposable(&disposable));
    int count = 0;
    {
        Valdi::ContextEntry entered(owner);
        call(testHostValue(h.port, "nfc"), "setEvents", {sink("nfc", count)});
        auto result = promise(call(testHostValue(h.port, "permissions"), "openSettings"));
        result->onComplete([&](const auto& terminal) {
            EXPECT_FALSE(disposable.disposed);
            EXPECT_FALSE(terminal);
            ++count;
        });
    }
    std::thread destroyUI([owner] { owner->onDestroy(); });
    destroyUI.join();
    EXPECT_FALSE(disposable.disposed);
    h.port->closeOnUI();
    h.js.drain();
    EXPECT_EQ(count, 1);
    EXPECT_TRUE(disposable.disposed);
}
} // namespace
