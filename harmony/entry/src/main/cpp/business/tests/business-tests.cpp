// Runs the real business adapter and real Valdi Value/Promise implementation.
// Only the OS AssetStore service boundary is a deterministic test double.
// This does not test OS encryption, durability, entitlement, or radio hardware.
// Typed production schema assertions guard JS marshaller selection separately
// from native Promise settlement. Neither executes a JavaScript consumer.
#include "../HarmonyBusinessModules.hpp"
#include "valdi_core/cpp/Schema/ValueSchema.hpp"
#include "valdi_core/cpp/Utils/Promise.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_core/cpp/Utils/ValueTypedProxyObject.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"

#include <asset/asset_api.h>
#include <gtest/gtest.h>

#include <atomic>
#include <functional>
#include <optional>
#include <thread>
#include <utility>
#include <vector>

namespace {

using ValdiHarmony::AssetTokenStore;
using ValdiHarmony::HarmonyBusinessModules;
using Valdi::Value;

std::optional<std::string> stored;
int32_t nextStatus = ASSET_SUCCESS;
bool malformed = false;
bool lastQueryReadSecret = false;
size_t additions = 0;
size_t removals = 0;
size_t secretBuffersFreed = 0;
bool sawUnwipedSecret = false;

const Asset_Attr* attr(const Asset_Attr* attributes, uint32_t size, Asset_Tag tag) {
    for (uint32_t i = 0; i < size; ++i) if (attributes[i].tag == tag) return attributes + i;
    return nullptr;
}

std::string bytes(const Asset_Attr* attribute) {
    if (!attribute) return {};
    return {reinterpret_cast<const char*>(attribute->value.blob.data), attribute->value.blob.size};
}

const Valdi::ValueTypedObject* typed(const Value& value) {
    if (auto* proxy = value.getProxyObject()) return proxy->getTypedObject().get();
    return value.getTypedObject();
}

// Produce valid arguments from the real generated signature. Unsupported
// methods still validate inputs; no handcrafted production schema is used.
Value sample(Valdi::ValueSchema schema) {
    if (schema.isOptional()) return Value::undefined();
    while (schema.isSchemaReference()) schema = schema.getReferencedSchema();
    if (schema.isOptional()) return Value::undefined();
    if (schema.isString()) return Value("test");
    if (schema.isBoolean()) return Value(false);
    if (schema.isDouble()) return Value(23.0);
    if (schema.isArray()) return Value(Valdi::ValueArray::make(0));
    if (schema.isValueTypedArray()) return Value(Valdi::makeShared<Valdi::ValueTypedArray>(
        Valdi::Uint8Array, Valdi::makeShared<Valdi::Bytes>()));
    if (schema.isClass()) {
        auto result = Valdi::ValueTypedObject::make(schema.getClassRef());
        size_t i = 0;
        for (const auto& property : *schema.getClass()) result->setProperty(i++, sample(property.schema));
        return Value(result);
    }
    throw std::runtime_error("unsupported test fixture schema");
}

Valdi::Result<Value> call(const Value& object, const char* method, std::initializer_list<Value> args = {}) {
    const auto property = typed(object) == nullptr ? object.getMapValue(method) :
        typed(object)->getPropertyForName(Valdi::StringBox::fromCString(method));
    auto function = property.getFunctionRef();
    if (function == nullptr) return Valdi::Error("test: missing method");
    return (*function)(Valdi::ValueFunctionFlagsCallSync, args);
}

Value mustCall(const Value& object, const char* method, std::initializer_list<Value> args = {}) {
    auto result = call(object, method, args);
    if (!result) throw std::runtime_error("unexpected Valdi call failure");
    return result.value();
}

void rejectedWith(const Value& object, const char* method, std::string_view code) {
    // A native Promise cast alone also passed with the broken opaque JS bridge.
    // Check the production object's *property signature* on every path.
    const auto* typedObject = typed(object);
    ASSERT_NE(typedObject, nullptr) << method;
    const Valdi::ValueFunctionSchema* signature = nullptr;
    for (const auto& property : *typedObject->getSchema()) {
        if (property.name.toStringView() == method) signature = property.schema.getFunction();
    }
    ASSERT_NE(signature, nullptr) << method;
    ASSERT_TRUE(signature->getReturnValue().isPromise()) << method;
    EXPECT_FALSE(signature->getReturnValue().getPromise()->getValueSchema().isUntyped()) << method;
    EXPECT_FALSE(signature->getAttributes().isSingleCall()) << method;
    EXPECT_FALSE(signature->getAttributes().shouldDispatchToWorkerThread()) << method;
    std::vector<Value> args;
    for (size_t i = 0; i < signature->getParametersSize(); ++i) args.push_back(sample(signature->getParameter(i)));
    const auto function = typedObject->getPropertyForName(Valdi::StringBox::fromCString(method)).getFunctionRef();
    auto result = (*function)(Valdi::ValueFunctionFlagsCallSync, args.data(), args.size());
    ASSERT_TRUE(result) << method;
    auto promise = Valdi::castOrNull<Valdi::Promise>(result.value().getValdiObject());
    ASSERT_NE(promise, nullptr) << method;
    bool completed = false;
    promise->onComplete([&](const Valdi::Result<Value>& terminal) {
        completed = true;
        EXPECT_FALSE(terminal);
        if (!terminal) EXPECT_NE(terminal.error().toString().find(code), std::string::npos) << method;
    });
    EXPECT_TRUE(completed);
}

constexpr const char* events[] = {
    "deviceFound", "adapterStateChange", "connectStateChange", "characteristicUpdate", "mtuChange",
    "peripheralReadRequest", "peripheralWriteRequest", "peripheralSubscribed",
    "peripheralUnsubscribed", "peripheralConnectionStateChange",
};

class Callback final : public Valdi::ValueFunction {
public:
    explicit Callback(std::function<void()> onDestroy = {}) : _onDestroy(std::move(onDestroy)) {}
    ~Callback() override { if (_onDestroy) _onDestroy(); }
    Value operator()(const Valdi::ValueFunctionCallContext&) noexcept override {
        ADD_FAILURE() << "registration must not synthesize radio events";
        return Value::undefined();
    }
    std::string_view getFunctionType() const override { return "test"; }
private:
    std::function<void()> _onDestroy;
};

Value sink(std::function<void()> onDestroy = {}) {
    Value result;
    auto function = Valdi::makeShared<Callback>(std::move(onDestroy));
    for (const auto* name : events) result.setMapValue(name, Value(function));
    return result;
}

class Business : public testing::Test {
    void SetUp() override {
        stored.reset();
        nextStatus = ASSET_SUCCESS;
        malformed = false;
        additions = removals = secretBuffersFreed = 0;
        sawUnwipedSecret = lastQueryReadSecret = false;
    }
};

TEST_F(Business, FactoryReturnsSameAppOwnedHostAcrossLoadsAndSeparateFactories) {
    auto app = HarmonyBusinessModules::create();
    auto factory = app->bluetoothFactory();
    EXPECT_EQ(factory->getModulePath().toStringView(), "bluetooth/src/Bluetooth");
    auto a = mustCall(factory->loadModule(), "getHost");
    auto b = mustCall(factory->loadModule(), "getHost");
    auto c = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    ASSERT_NE(typed(a), nullptr);
    EXPECT_EQ(typed(a), typed(b));
    EXPECT_EQ(typed(a), typed(c));
    auto other = HarmonyBusinessModules::create();
    EXPECT_NE(typed(a), typed(mustCall(other->bluetoothFactory()->loadModule(), "getHost")));
    EXPECT_FALSE(app->hasBluetoothEvents());
}

TEST_F(Business, StartupAcquiresHostAndRegistersAllEventsWithoutTouchingStorageOrRadio) {
    auto app = HarmonyBusinessModules::create();
    auto host = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    mustCall(host, "setEvents", {sink()});
    EXPECT_TRUE(app->hasBluetoothEvents());
    EXPECT_EQ(additions, 0u);
    EXPECT_EQ(removals, 0u);
    app->shutdown();
    EXPECT_FALSE(app->hasBluetoothEvents());
}

TEST_F(Business, ProductionSchemasTypeArgumentsAndResultsAndPreserveSyncEntryPoints) {
    auto app = HarmonyBusinessModules::create();
    const auto module = app->bluetoothFactory()->loadModule();
    EXPECT_TRUE(module.isMap());
    EXPECT_TRUE(module.getMapValue("getHost").isFunction());
    const auto host = mustCall(module, "getHost");
    ASSERT_NE(typed(host), nullptr);
    ASSERT_EQ(typed(host)->getPropertiesSize(), 29u);
    size_t synchronous = 0;
    for (const auto& property : *typed(host)->getSchema()) {
        if (property.name.toStringView() == "setEvents") {
            ++synchronous;
            ASSERT_TRUE(property.schema.isFunction());
            EXPECT_TRUE(property.schema.getFunction()->getReturnValue().isVoid());
            EXPECT_EQ(property.schema.getFunction()->getParametersSize(), 1u);
            EXPECT_TRUE(typed(host)->getPropertyForName(property.name).isFunction());
        } else {
            ASSERT_TRUE(property.schema.isFunction());
            EXPECT_TRUE(property.schema.getFunction()->getReturnValue().isPromise());
        }
    }
    EXPECT_EQ(synchronous, 1u);
    EXPECT_TRUE(mustCall(host, "setEvents", {sink()}).isUndefined());
    const auto permissions = app->permissionHostValue();
    ASSERT_NE(typed(permissions), nullptr);
    EXPECT_EQ(typed(permissions)->getPropertiesSize(), 3u);
    EXPECT_NE(typed(app->tokenStoreValue()), nullptr);
    EXPECT_TRUE(mustCall(app->tokenStoreValue(), "has").isBool());
    EXPECT_TRUE(mustCall(app->tokenStoreValue(), "read").isString());
}

TEST_F(Business, RegistrationSnapshotsFunctionsAndValidationPreservesExistingSink) {
    auto app = HarmonyBusinessModules::create();
    auto host = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    int destroyed = 0;
    auto original = sink([&] { ++destroyed; });
    mustCall(host, "setEvents", {original});
    for (const auto* name : events) original.setMapValue(name, Value::undefined());
    EXPECT_EQ(destroyed, 0); // Native retained a snapshot, not the mutable input.
    EXPECT_FALSE(call(host, "setEvents", {original}));
    EXPECT_FALSE(call(host, "setEvents", {Value(3)}));
    EXPECT_FALSE(call(host, "setEvents"));
    EXPECT_EQ(destroyed, 0);
    EXPECT_TRUE(app->hasBluetoothEvents());
    mustCall(host, "setEvents", {sink()});
    EXPECT_EQ(destroyed, 1);
}

TEST_F(Business, ReplacingSinkReleasesOutsideLockAndAllowsShutdownReentry) {
    auto app = HarmonyBusinessModules::create();
    auto module = app->bluetoothFactory()->loadModule();
    auto host = mustCall(module, "getHost");
    mustCall(host, "setEvents", {sink([&] {
        EXPECT_TRUE(call(module, "getHost"));
        app->shutdown();
    })});
    mustCall(host, "setEvents", {sink()});
    EXPECT_FALSE(app->hasBluetoothEvents());
    EXPECT_FALSE(call(module, "getHost"));
    app->shutdown();
}

TEST_F(Business, ShutdownRetiresFunctionsAndRejectsRetainedCallsWithoutResurrection) {
    auto app = HarmonyBusinessModules::create();
    auto module = app->bluetoothFactory()->loadModule();
    auto host = mustCall(module, "getHost");
    auto tokens = app->tokenStoreValue();
    int retired = 0;
    mustCall(host, "setEvents", {sink([&] {
        ++retired;
        EXPECT_FALSE(call(host, "setEvents", {sink()}));
        app->shutdown();
    })});
    app->shutdown();
    app->shutdown();
    EXPECT_EQ(retired, 1);
    EXPECT_FALSE(call(module, "getHost"));
    EXPECT_FALSE(call(tokens, "has"));
    rejectedWith(host, "openBluetoothAdapter", "E_BLE_NOT_INITIALIZED");
    rejectedWith(app->permissionHostValue(), "check", "E_BUSINESS_HOST_CLOSED");
}

TEST_F(Business, FactoriesAndNativeFunctionsDoNotRetainReleasedOwner) {
    auto app = HarmonyBusinessModules::create();
    std::weak_ptr<HarmonyBusinessModules> weak = app;
    auto module = app->bluetoothFactory()->loadModule();
    auto host = mustCall(module, "getHost");
    auto tokens = app->tokenStoreValue();
    app.reset();
    EXPECT_TRUE(weak.expired());
    EXPECT_FALSE(call(module, "getHost"));
    EXPECT_FALSE(call(host, "setEvents", {sink()}));
    EXPECT_FALSE(call(tokens, "read"));
    rejectedWith(host, "getBluetoothDevices", "E_BLE_NOT_INITIALIZED");
}

TEST_F(Business, EveryRadioOperationReturnsNativeRejectedPromiseWithExistingTSClassificationCode) {
    auto app = HarmonyBusinessModules::create();
    auto host = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    // Independent contract expectation from BleHost.ts (28 Promise methods).
    for (const auto* name : {
        "openBluetoothAdapter", "closeBluetoothAdapter", "getBluetoothAdapterState",
        "startBluetoothDevicesDiscovery", "startBluetoothDevicesDiscoveryWithNames",
        "startBluetoothDevicesDiscoveryWithAddresses", "stopBluetoothDevicesDiscovery", "getBluetoothDevices",
        "createBLEConnection", "closeBLEConnection", "makeBluetoothPair", "isBluetoothDevicePaired",
        "getBLEDeviceServices", "getBLEDeviceRSSI", "getBLEDeviceCharacteristics",
        "notifyBLECharacteristicValueChange", "writeBLECharacteristicValue", "readBLECharacteristicValue",
        "setBLEMTU", "getBLEMTU", "getConnectedBluetoothDevices", "createBLEPeripheralServer",
        "addPeripheralService", "removePeripheralService", "startPeripheralAdvertising",
        "stopPeripheralAdvertising", "writePeripheralCharacteristicValue", "closeBLEPeripheralServer",
    }) {
        rejectedWith(host, name, "E_BLE_SYSTEM_NOT_SUPPORTED");
        app->shutdown();
        rejectedWith(host, name, "E_BLE_NOT_INITIALIZED");
        app.reset();
        rejectedWith(host, name, "E_BLE_NOT_INITIALIZED");
        app = HarmonyBusinessModules::create();
        host = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    }
}

TEST_F(Business, PermissionCapabilitiesNeverInventGrantsOrOpenSettings) {
    auto app = HarmonyBusinessModules::create();
    auto permissions = app->permissionHostValue();
    for (const auto* name : {"check", "requestMultiple", "openSettings"}) {
        rejectedWith(permissions, name, "E_PERMISSION_SYSTEM_NOT_SUPPORTED");
        app->shutdown();
        rejectedWith(permissions, name, "E_BUSINESS_HOST_CLOSED");
        app.reset();
        rejectedWith(permissions, name, "E_BUSINESS_HOST_CLOSED");
        app = HarmonyBusinessModules::create();
        permissions = app->permissionHostValue();
    }
}

TEST_F(Business, GeneratedFallbackArgumentsRejectMalformedCallsBeforeUnsupportedOperation) {
    auto app = HarmonyBusinessModules::create();
    auto host = mustCall(app->bluetoothFactory()->loadModule(), "getHost");
    EXPECT_FALSE(call(host, "getBLEDeviceServices"));
    EXPECT_FALSE(call(host, "setBLEMTU", {Value("id"), Value("invalid")}));
    EXPECT_FALSE(call(host, "writeBLECharacteristicValue", {Value(7)}));
    EXPECT_FALSE(call(app->permissionHostValue(), "check", {Value(false)}));
    EXPECT_FALSE(call(app->permissionHostValue(), "requestMultiple", {Value("invalid")}));
    rejectedWith(host, "getBLEDeviceServices", "E_BLE_SYSTEM_NOT_SUPPORTED");
}

TEST_F(Business, SynchronousTokenStoreRoundTripOverwriteColdOwnerAndIdempotentClear) {
    {
        auto app = HarmonyBusinessModules::create();
        auto tokens = app->tokenStoreValue();
        EXPECT_FALSE(mustCall(tokens, "has").toBool());
        EXPECT_TRUE(mustCall(tokens, "read").toStringBox().isEmpty());
        mustCall(tokens, "write", {Value("first-token")});
        EXPECT_TRUE(mustCall(tokens, "has").toBool());
        EXPECT_FALSE(lastQueryReadSecret);
        mustCall(tokens, "write", {Value("第二个-token")});
        EXPECT_EQ(mustCall(tokens, "read").toStringBox().toStringView(), "第二个-token");
        EXPECT_TRUE(lastQueryReadSecret);
        EXPECT_EQ(secretBuffersFreed, 1u);
        EXPECT_FALSE(sawUnwipedSecret);
        EXPECT_EQ(removals, 0u); // Replacement has no delete/add gap.
        app->shutdown();
    }
    auto restarted = HarmonyBusinessModules::create();
    EXPECT_EQ(mustCall(restarted->tokenStoreValue(), "read").toStringBox().toStringView(), "第二个-token");
    mustCall(restarted->tokenStoreValue(), "clear");
    mustCall(restarted->tokenStoreValue(), "clear");
    EXPECT_FALSE(mustCall(restarted->tokenStoreValue(), "has").toBool());
    EXPECT_TRUE(mustCall(restarted->tokenStoreValue(), "read").toStringBox().isEmpty());
}

TEST_F(Business, StorageFailuresThrowWithoutCachedSuccessDeletionOrSecretInError) {
    auto app = HarmonyBusinessModules::create();
    auto tokens = app->tokenStoreValue();
    mustCall(tokens, "write", {Value("sensitive-existing-token")});
    for (const auto* operation : {"has", "read", "write", "clear"}) {
        nextStatus = ASSET_CRYPTO_ERROR;
        auto result = call(tokens, operation, {Value("sensitive-replacement-token")});
        ASSERT_FALSE(result) << operation;
        EXPECT_NE(result.error().toString().find("E_TOKEN_STORE:"), std::string::npos);
        EXPECT_EQ(result.error().toString().find("sensitive"), std::string::npos);
        EXPECT_EQ(*stored, "sensitive-existing-token");
    }
}

TEST_F(Business, InvalidWritesFailBeforeSDKAndDoNotReplaceToken) {
    AssetTokenStore tokens;
    tokens.write("retained");
    auto app = HarmonyBusinessModules::create();
    auto object = app->tokenStoreValue();
    EXPECT_FALSE(call(object, "write"));
    EXPECT_FALSE(call(object, "write", {Value(1)}));
    EXPECT_FALSE(call(object, "write", {Value("")}));
    EXPECT_FALSE(call(object, "write", {Value(" \n\t")}));
    const std::string tooLarge(1025, 'x');
    EXPECT_FALSE(call(object, "write", {Value(Valdi::StringBox::fromString(tooLarge))}));
    EXPECT_EQ(additions, 1u);
    EXPECT_EQ(tokens.read(), "retained");
    tokens.write(std::string(1024, 'x'));
    EXPECT_EQ(tokens.read().size(), 1024u);
}

TEST_F(Business, CorruptAndLockedStorageResultsDoNotBecomeSignedOut) {
    AssetTokenStore tokens;
    tokens.write("existing");
    malformed = true;
    EXPECT_THROW(tokens.read(), std::runtime_error);
    malformed = false;
    for (const auto code : {ASSET_STATUS_MISMATCH, ASSET_SERVICE_UNAVAILABLE, ASSET_DATA_CORRUPTED}) {
        nextStatus = code;
        EXPECT_THROW(tokens.has(), std::runtime_error);
        nextStatus = code;
        EXPECT_THROW(tokens.read(), std::runtime_error);
        EXPECT_EQ(*stored, "existing");
    }
}

TEST_F(Business, MultipleInstancesSerializeConcurrentSDKOperations) {
    std::atomic<int> errors = 0;
    std::vector<std::thread> workers;
    for (int i = 0; i < 6; ++i) workers.emplace_back([&, i] {
        try {
            AssetTokenStore tokens;
            for (int j = 0; j < 20; ++j) {
                tokens.write("worker-" + std::to_string(i));
                if (!tokens.has() || tokens.read().empty()) ++errors;
            }
        } catch (...) { ++errors; }
    });
    for (auto& worker : workers) worker.join();
    EXPECT_EQ(errors, 0);
    EXPECT_EQ(additions, 120u);
    EXPECT_FALSE(sawUnwipedSecret);
}

} // namespace

extern "C" {

int32_t OH_Asset_Add(const Asset_Attr* attributes, uint32_t count) {
    const auto status = std::exchange(nextStatus, ASSET_SUCCESS);
    if (status != ASSET_SUCCESS) return status;
    EXPECT_EQ(bytes(attr(attributes, count, ASSET_TAG_ALIAS)), AssetTokenStore::Alias);
    EXPECT_EQ(attr(attributes, count, ASSET_TAG_ACCESSIBILITY)->value.u32,
              ASSET_ACCESSIBILITY_DEVICE_FIRST_UNLOCKED);
    EXPECT_EQ(attr(attributes, count, ASSET_TAG_AUTH_TYPE)->value.u32, ASSET_AUTH_TYPE_NONE);
    EXPECT_EQ(attr(attributes, count, ASSET_TAG_SYNC_TYPE)->value.u32, ASSET_SYNC_TYPE_NEVER);
    EXPECT_FALSE(attr(attributes, count, ASSET_TAG_IS_PERSISTENT));
    EXPECT_EQ(attr(attributes, count, ASSET_TAG_CONFLICT_RESOLUTION)->value.u32, ASSET_CONFLICT_OVERWRITE);
    stored = bytes(attr(attributes, count, ASSET_TAG_SECRET));
    ++additions;
    return ASSET_SUCCESS;
}

int32_t OH_Asset_Query(const Asset_Attr* query, uint32_t count, Asset_ResultSet* results) {
    const auto status = std::exchange(nextStatus, ASSET_SUCCESS);
    if (status != ASSET_SUCCESS) return status;
    EXPECT_EQ(bytes(attr(query, count, ASSET_TAG_ALIAS)), AssetTokenStore::Alias);
    EXPECT_EQ(attr(query, count, ASSET_TAG_RETURN_LIMIT)->value.u32, 1u);
    lastQueryReadSecret = attr(query, count, ASSET_TAG_RETURN_TYPE)->value.u32 == ASSET_RETURN_ALL;
    if (!stored) return ASSET_NOT_FOUND;
    results->count = 1;
    results->results = new Asset_Result[1]{};
    if (lastQueryReadSecret && !malformed) {
        auto& result = results->results[0];
        result.count = 1;
        result.attrs = new Asset_Attr[1]{};
        result.attrs[0].tag = ASSET_TAG_SECRET;
        auto& blob = result.attrs[0].value.blob;
        blob.size = static_cast<uint32_t>(stored->size());
        blob.data = new uint8_t[blob.size];
        std::copy(stored->begin(), stored->end(), blob.data);
    }
    return ASSET_SUCCESS;
}

int32_t OH_Asset_Remove(const Asset_Attr* query, uint32_t count) {
    const auto status = std::exchange(nextStatus, ASSET_SUCCESS);
    if (status != ASSET_SUCCESS) return status;
    EXPECT_EQ(bytes(attr(query, count, ASSET_TAG_ALIAS)), AssetTokenStore::Alias);
    ++removals;
    if (!stored) return ASSET_NOT_FOUND;
    stored.reset();
    return ASSET_SUCCESS;
}

Asset_Attr* OH_Asset_ParseAttr(const Asset_Result* result, Asset_Tag tag) {
    return const_cast<Asset_Attr*>(attr(result->attrs, result->count, tag));
}

void OH_Asset_FreeResultSet(Asset_ResultSet* results) {
    for (uint32_t i = 0; i < results->count; ++i) {
        auto& result = results->results[i];
        auto* secret = OH_Asset_ParseAttr(&result, ASSET_TAG_SECRET);
        if (secret) {
            for (uint32_t j = 0; j < secret->value.blob.size; ++j)
                if (secret->value.blob.data[j] != 0) sawUnwipedSecret = true;
            delete[] secret->value.blob.data;
            ++secretBuffersFreed;
        }
        delete[] result.attrs;
    }
    delete[] results->results;
    *results = {};
}

} // extern "C"
