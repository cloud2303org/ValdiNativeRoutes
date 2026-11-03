// Real SQLite + production host + current canonical generated marshalling.
#include "../../host/HarmonyStorageHost.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include "valdi_core/cpp/Utils/ValueTypedObject.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <gtest/gtest.h>
#include <cmath>
#include <filesystem>
#include <limits>
#include <sqlite3.h>
#include <unistd.h>

namespace {
using Valdi::Value;
using namespace snap::valdi_modules::app_pages;

Valdi::StringBox string(const std::string& value) {
    return Valdi::StringBox::fromString(value);
}
Valdi::Ref<Valdi::ValueMap> payload(const Value& value) {
    auto map = Valdi::makeShared<Valdi::ValueMap>();
    (*map)[STRING_LITERAL("value")] = value;
    return map;
}
Valdi::Result<Value> callStorage(const Value& host, const char* method,
                                std::initializer_list<Value> arguments = {}) {
    auto fn = host.getTypedObject()->getPropertyForName(Valdi::StringBox::fromCString(method)).getFunctionRef();
    return (*fn)(Valdi::ValueFunctionFlagsCallSync, arguments);
}
Value request(const std::string& key, const Valdi::Ref<Valdi::ValueMap>& data) {
    Valdi::SimpleExceptionTracker error;
    Value result;
    Valdi::CppMarshaller::marshall(error, StorageWriteRequest(string(key), data), result);
    EXPECT_TRUE(error);
    EXPECT_NE(result.getTypedObject(), nullptr);
    return result;
}

// Compare semantic JSON values without stringifying across the object bridge.
void expectValue(const Value& actual, const Value& expected) {
    if (expected.isNumber() && !expected.isBool()) {
        ASSERT_TRUE(actual.isNumber());
        ASSERT_FALSE(actual.isBool());
        EXPECT_EQ(actual.toDouble(), expected.toDouble());
        if (expected.toDouble() == 0.0) {
            EXPECT_EQ(std::signbit(actual.toDouble()), std::signbit(expected.toDouble()));
        }
    } else if (expected.isMap()) {
        ASSERT_TRUE(actual.isMap());
        ASSERT_EQ(actual.getMap()->size(), expected.getMap()->size());
        for (const auto& [key, value] : *expected.getMap()) {
            auto found = actual.getMap()->find(key);
            ASSERT_NE(found, actual.getMap()->end());
            expectValue(found->second, value);
        }
    } else if (expected.isArray()) {
        ASSERT_TRUE(actual.isArray());
        ASSERT_EQ(actual.getArray()->size(), expected.getArray()->size());
        for (size_t i = 0; i < expected.getArray()->size(); ++i) {
            expectValue((*actual.getArray())[i], (*expected.getArray())[i]);
        }
    } else {
        EXPECT_EQ(actual, expected);
    }
}

struct Storage : testing::Test {
    std::filesystem::path root;
    std::shared_ptr<ValdiHarmony::HarmonyStorageHost> owner;
    Value host;
    void SetUp() override {
        char path[] = "/tmp/harmony-storage-test-XXXXXX";
        auto* directory = mkdtemp(path);
        ASSERT_NE(directory, nullptr);
        root = directory;
        reopen();
    }
    void TearDown() override {
        owner.reset();
        std::filesystem::remove_all(root);
    }
    void reopen() {
        if (owner) owner->shutdownOnJS();
        owner = std::make_shared<ValdiHarmony::HarmonyStorageHost>(root.string());
        host = owner->hostValue();
        ASSERT_NE(host.getTypedObject(), nullptr);
    }
    bool write(const std::string& key, const Value& value) {
        auto result = callStorage(host, "set", {request(key, payload(value))});
        EXPECT_TRUE(result);
        return result && result.value().toBool();
    }
    StorageReadReply read(const std::string& key) {
        auto result = callStorage(host, "get", {Value(string(key))});
        EXPECT_TRUE(result);
        StorageReadReply reply;
        if (result) {
            EXPECT_NE(result.value().getTypedObject(), nullptr);
            Valdi::SimpleExceptionTracker error;
            Valdi::CppMarshaller::unmarshall(error, result.value(), reply);
            EXPECT_TRUE(error);
        }
        return reply;
    }
    void expectRecord(const std::string& key, const Value& value) {
        auto reply = read(key);
        ASSERT_TRUE(reply.getFound()) << reply.getError().slowToString();
        EXPECT_TRUE(reply.getError().isEmpty());
        auto found = reply.getPayload()->find(STRING_LITERAL("value"));
        ASSERT_NE(found, reply.getPayload()->end());
        expectValue(found->second, value);
    }
    void sql(const std::string& command) {
        sqlite3* db = nullptr;
        ASSERT_EQ(sqlite3_open((root / "app-storage-structured.sqlite3").c_str(), &db), SQLITE_OK);
        std::unique_ptr<sqlite3, decltype(&sqlite3_close)> connection(db, sqlite3_close);
        ASSERT_EQ(sqlite3_exec(db, command.c_str(), nullptr, nullptr, nullptr), SQLITE_OK) << sqlite3_errmsg(db);
    }
    void storedText(const std::string& text, const std::string& key = "bad") {
        // sqlite3_exec() would truncate a literal NUL before the corrupt suffix.
        // Bind an explicit byte count so production reads the entire record.
        sqlite3* db = nullptr;
        ASSERT_EQ(sqlite3_open((root / "app-storage-structured.sqlite3").c_str(), &db), SQLITE_OK);
        std::unique_ptr<sqlite3, decltype(&sqlite3_close)> connection(db, sqlite3_close);
        sqlite3_stmt* statement = nullptr;
        ASSERT_EQ(sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO kv(key,value) VALUES(?,?);",
                                    -1, &statement, nullptr), SQLITE_OK);
        std::unique_ptr<sqlite3_stmt, decltype(&sqlite3_finalize)> query(statement, sqlite3_finalize);
        ASSERT_LE(key.size(), static_cast<size_t>(std::numeric_limits<int>::max()));
        ASSERT_LE(text.size(), static_cast<size_t>(std::numeric_limits<int>::max()));
        ASSERT_EQ(sqlite3_bind_text(statement, 1, key.data(), static_cast<int>(key.size()), SQLITE_TRANSIENT), SQLITE_OK);
        ASSERT_EQ(sqlite3_bind_text(statement, 2, text.data(), static_cast<int>(text.size()), SQLITE_TRANSIENT), SQLITE_OK);
        ASSERT_EQ(sqlite3_step(statement), SQLITE_DONE) << sqlite3_errmsg(db);
    }
};

TEST_F(Storage, FiniteDoublesRoundTripExactlyAcrossReopen) {
    const double numbers[] = {1e-7, -1e-7, 1e-100, 1e100, 1.2345678901234567,
        9007199254740991.0, std::numeric_limits<double>::min(),
        std::numeric_limits<double>::denorm_min(), std::numeric_limits<double>::max(), -0.0};
    for (size_t i = 0; i < std::size(numbers); ++i) {
        ASSERT_TRUE(write(std::to_string(i), Value(numbers[i])));
        expectRecord(std::to_string(i), Value(numbers[i]));
    }
    reopen();
    for (size_t i = 0; i < std::size(numbers); ++i) {
        SCOPED_TRACE(i);
        expectRecord(std::to_string(i), Value(numbers[i]));
    }
}

TEST_F(Storage, VerticalTabAndAllControlsRoundTripInValuesAndKeys) {
    std::string controls;
    for (char i = 0; i < 32; ++i) controls += i;
    const std::string special = controls + "\"\\/\x7f" + "中文😀\xe2\x80\xa8\xe2\x80\xa9";
    auto nested = Valdi::makeShared<Valdi::ValueMap>();
    (*nested)[string(special)] = Value(string(special));
    (*nested)[STRING_LITERAL("__proto__")] = Value(Valdi::ValueArray::make(
        {Value("\v"), Value(string(special)), Value(), Value(true), Value(false)}));
    const Value value(nested);
    const std::string key = std::string("存\0", 4) + special;
    ASSERT_TRUE(write(key, value));
    expectRecord(key, value);
    reopen();
    expectRecord(key, value);
}

TEST_F(Storage, GeneratedTypedConsumerDistinguishesNullMissingAndEmptyContainers) {
    Valdi::SimpleExceptionTracker error;
    StorageHost typed;
    Valdi::CppMarshaller::unmarshall(error, host, typed);
    ASSERT_TRUE(error);
    auto missing = typed.getGet()(STRING_LITERAL("missing"));
    EXPECT_FALSE(missing.getFound());
    EXPECT_TRUE(missing.getError().isEmpty());
    EXPECT_TRUE(missing.getPayload()->empty());
    ASSERT_TRUE(typed.getSet()(StorageWriteRequest(STRING_LITERAL("null"), payload(Value()))));
    expectRecord("null", Value());
    ASSERT_TRUE(write("array", Value(Valdi::ValueArray::make(0))));
    ASSERT_TRUE(write("map", Value(Valdi::makeShared<Valdi::ValueMap>())));
    reopen();
    expectRecord("null", Value());
    expectRecord("array", Value(Valdi::ValueArray::make(0)));
    expectRecord("map", Value(Valdi::makeShared<Valdi::ValueMap>()));
    EXPECT_TRUE(callStorage(host, "remove", {Value("null")}));
    EXPECT_FALSE(read("null").getFound());
    EXPECT_TRUE(callStorage(host, "clear"));
    EXPECT_TRUE(callStorage(host, "clear"));
    EXPECT_FALSE(read("array").getFound());
}

TEST_F(Storage, FailedSQLiteCommitReturnsFalseAndPreservesExistingRecord) {
    ASSERT_TRUE(write("key", Value("old")));
    sql("CREATE TRIGGER reject_write BEFORE INSERT ON kv BEGIN "
        "SELECT RAISE(ABORT, 'test commit failure'); END;");
    auto failed = callStorage(host, "set", {request("key", payload(Value("new")))});
    ASSERT_TRUE(failed);
    EXPECT_FALSE(failed.value().toBool());
    expectRecord("key", Value("old"));
    reopen();
    expectRecord("key", Value("old"));
}

TEST_F(Storage, MalformedPersistentRecordsReturnErrorRatherThanMissing) {
    for (const char* malformed : {"", "{", "{}", "[]", "null", "{\"value\":01}",
        "{\"value\":1.}", "{\"value\":1e}", "{\"value\":0x1}", "{\"value\":1e999}",
        "{\"value\":1e-9999}", "{\"value\":true} trailing", "{\"value\":1,\"value\":2}",
        "{\"value\":\"raw\ncontrol\"}"}) {
        storedText(malformed);
        auto reply = read("bad");
        EXPECT_FALSE(reply.getFound());
        EXPECT_FALSE(reply.getError().isEmpty()) << "stored text: " << malformed;
        EXPECT_TRUE(reply.getPayload()->empty());
    }
}

TEST_F(Storage, RawNULInPersistentRecordReturnsError) {
    for (const auto& malformed : {std::string("{\"value\":1}") + '\0' + "garbage",
                                  std::string("{\"value\":1}") + '\0',
                                  std::string(1, '\0') + "{\"value\":1}"}) {
        storedText(malformed);
        auto reply = read("bad");
        EXPECT_FALSE(reply.getFound());
        EXPECT_FALSE(reply.getError().isEmpty()) << "stored bytes: " << malformed.size();
        EXPECT_TRUE(reply.getPayload()->empty());
        reopen();
        reply = read("bad");
        EXPECT_FALSE(reply.getFound());
        EXPECT_FALSE(reply.getError().isEmpty());
    }
}

TEST_F(Storage, TrailingCommasInPersistentRecordReturnError) {
    for (const char* malformed : {"{\"value\":{\"\":1,}}", "{\"value\":{\"\":1, \t\r\n}}",
        "{\"value\":{\"key\":1,}}", "{\"value\":[1,]}", "{\"value\":[1, \t\r\n]}",
        "{\"value\":{\"\":\"quoted ,} and ,]\",}}", "{\"value\":1,}"}) {
        storedText(malformed);
        auto reply = read("bad");
        EXPECT_FALSE(reply.getFound()) << malformed;
        EXPECT_FALSE(reply.getError().isEmpty()) << malformed;
        EXPECT_TRUE(reply.getPayload()->empty());
        reopen();
        reply = read("bad");
        EXPECT_FALSE(reply.getFound()) << malformed;
        EXPECT_FALSE(reply.getError().isEmpty()) << malformed;
    }
}

TEST_F(Storage, EmptyKeysEscapedNULAndQuotedDelimitersRemainValid) {
    storedText(R"({"value":{"":1,"\u0000":"\u0000\u000b","syntax":"inside ,} ,] \" and \\","array":[{},[]]}})",
               "valid");
    auto expected = Valdi::makeShared<Valdi::ValueMap>();
    (*expected)[string("")] = Value(1);
    (*expected)[string(std::string(1, '\0'))] = Value(string(std::string("\0\v", 2)));
    (*expected)[STRING_LITERAL("syntax")] = Value("inside ,} ,] \" and \\");
    (*expected)[STRING_LITERAL("array")] = Value(Valdi::ValueArray::make({
        Value(Valdi::makeShared<Valdi::ValueMap>()), Value(Valdi::ValueArray::make(0))}));
    expectRecord("valid", Value(expected));
    reopen();
    expectRecord("valid", Value(expected));
    ASSERT_TRUE(write("written", Value(expected)));
    reopen();
    expectRecord("written", Value(expected));
    storedText("{ \t\r\n\"value\" : { \"\" : 1 , \"other\" : [ 2 , 3 ] } \r\n}", "whitespace");
    auto whitespace = Valdi::makeShared<Valdi::ValueMap>();
    (*whitespace)[string("")] = Value(1);
    (*whitespace)[STRING_LITERAL("other")] = Value(Valdi::ValueArray::make({Value(2), Value(3)}));
    expectRecord("whitespace", Value(whitespace));
}

TEST_F(Storage, NestedNumbersPreserveIntegersBooleansAndSubnormalsTogether) {
    auto map = Valdi::makeShared<Valdi::ValueMap>();
    (*map)[STRING_LITERAL("double")] = Value(std::numeric_limits<double>::denorm_min());
    (*map)[STRING_LITERAL("minimumInteger")] = Value(std::numeric_limits<int64_t>::min());
    (*map)[STRING_LITERAL("maximumInteger")] = Value(std::numeric_limits<int64_t>::max());
    (*map)[STRING_LITERAL("array")] = Value(Valdi::ValueArray::make({
        Value(17), Value(true), Value(false), Value(), Value(-0.0), Value(-1e-310), Value(1.2345678901234567)}));
    ASSERT_TRUE(write("mixed", Value(map)));
    reopen();
    expectRecord("mixed", Value(map));
    auto result = read("mixed").getPayload()->at(STRING_LITERAL("value"));
    ASSERT_TRUE(result.isMap());
    const auto minimum = result.getMap()->at(STRING_LITERAL("minimumInteger"));
    const auto maximum = result.getMap()->at(STRING_LITERAL("maximumInteger"));
    ASSERT_TRUE(minimum.isLong());
    ASSERT_TRUE(maximum.isLong());
    EXPECT_EQ(minimum.toLong(), std::numeric_limits<int64_t>::min());
    EXPECT_EQ(maximum.toLong(), std::numeric_limits<int64_t>::max());
}

TEST_F(Storage, UnsupportedValuesFailBeforeReplacingExistingRecord) {
    ASSERT_TRUE(write("key", Value("old")));
    for (const Value value : {Value(std::numeric_limits<double>::infinity()),
                              Value(-std::numeric_limits<double>::infinity()),
                              Value(std::numeric_limits<double>::quiet_NaN()), Value::undefined()}) {
        auto result = callStorage(host, "set", {request("key", payload(value))});
        ASSERT_FALSE(result);
        EXPECT_NE(result.error().toString().find("E_STORAGE:"), std::string::npos);
        expectRecord("key", Value("old"));
    }
}

TEST_F(Storage, LegacyDatabaseIsNotReadOrMigrated) {
    sqlite3* db = nullptr;
    ASSERT_EQ(sqlite3_open((root / "app-storage.sqlite3").c_str(), &db), SQLITE_OK);
    std::unique_ptr<sqlite3, decltype(&sqlite3_close)> connection(db, sqlite3_close);
    ASSERT_EQ(sqlite3_exec(db, "CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT);"
        "INSERT INTO kv VALUES('legacy', '{\"value\":42}');", nullptr, nullptr, nullptr), SQLITE_OK);
    reopen();
    EXPECT_FALSE(read("legacy").getFound());
    EXPECT_TRUE(read("legacy").getError().isEmpty());
}

TEST_F(Storage, InvalidArgumentsAndRetainedCallbacksFailThroughValdiExceptions) {
    EXPECT_FALSE(callStorage(host, "get"));
    EXPECT_FALSE(callStorage(host, "set", {Value("key"), Value(2)}));
    EXPECT_FALSE(callStorage(host, "set", {request("key", Valdi::makeShared<Valdi::ValueMap>())}));
    EXPECT_FALSE(callStorage(host, "remove", {Value(false)}));
    owner->shutdownOnJS();
    for (const char* method : {"get", "set", "remove", "clear"}) {
        auto result = std::string(method) == "set"
            ? callStorage(host, method, {request("key", payload(Value()))})
            : std::string(method) == "clear" ? callStorage(host, method)
            : callStorage(host, method, {Value("key")});
        ASSERT_FALSE(result);
        EXPECT_NE(result.error().toString().find("E_STORAGE_CLOSED"), std::string::npos);
    }
    std::weak_ptr<ValdiHarmony::HarmonyStorageHost> weak = owner;
    owner.reset();
    EXPECT_TRUE(weak.expired());
    for (const char* method : {"get", "set", "remove", "clear"}) {
        auto result = std::string(method) == "set"
            ? callStorage(host, method, {request("key", payload(Value()))})
            : std::string(method) == "clear" ? callStorage(host, method)
            : callStorage(host, method, {Value("key")});
        ASSERT_FALSE(result);
        EXPECT_NE(result.error().toString().find("owner was released"), std::string::npos);
    }
}
} // namespace
