#include "HarmonyStorageHost.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <sqlite3.h>
#include <json/json.h>

#include <cmath>
#include <cerrno>
#include <charconv>
#include <cstdlib>
#include <locale.h>
#include <limits>
#include <stdexcept>
#include <type_traits>
#include <unordered_map>
#if defined(__APPLE__)
#include <xlocale.h>
#endif

namespace ValdiHarmony {
namespace {

using Statement = std::unique_ptr<sqlite3_stmt, decltype(&sqlite3_finalize)>;

// JSON belongs only to the persistence boundary. The bridge continues carrying
// generated models and Value maps/arrays. Use JSONCPP's length-aware strings and
// keys, standard control escapes, and round-trip double precision here rather
// than the general Valdi JSONWriter (which formats doubles with std::to_string).
Json::Value storageJSONValue(const Valdi::Value& value) {
    if (value.isNull()) return Json::Value(Json::nullValue);
    if (value.isBool()) return Json::Value(value.toBool());
    if (value.isInt()) return Json::Value(value.toInt());
    if (value.isLong()) return Json::Value(static_cast<Json::Int64>(value.toLong()));
    if (value.isDouble()) {
        const auto number = value.toDouble();
        if (!std::isfinite(number)) throw std::runtime_error("E_STORAGE:non-finite number");
        return Json::Value(number);
    }
    if (value.isString()) {
        const auto text = value.toStringBox();
        const auto view = text.toStringView();
        return Json::Value(view.data(), view.data() + view.size());
    }
    if (value.isArray()) {
        Json::Value result(Json::arrayValue);
        for (const auto& element : *value.getArray()) result.append(storageJSONValue(element));
        return result;
    }
    if (value.isMap()) {
        Json::Value result(Json::objectValue);
        for (const auto& [key, element] : *value.getMap()) {
            const auto view = key.toStringView();
            result[Json::String(view.data(), view.size())] = storageJSONValue(element);
        }
        return result;
    }
    throw std::runtime_error("E_STORAGE:unsupported structured value");
}

std::string storageJSONString(const Valdi::Value& value) {
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    writer["commentStyle"] = "None";
    writer["precision"] = std::numeric_limits<double>::max_digits10;
    writer["precisionType"] = "significant";
    // Keep Unicode as UTF-8, escaping all JSON control characters including VT.
    writer["emitUTF8"] = true;
    return Json::writeString(writer, storageJSONValue(value));
}

bool storageNumber(std::string_view text, locale_t locale, Valdi::Value& result) {
    // Validate JSON number grammar before strtod_l, which also accepts hex,
    // infinities and other spellings that must never enter persistent records.
    size_t i = 0;
    if (i < text.size() && text[i] == '-') ++i;
    const auto digits = [&] {
        const auto start = i;
        while (i < text.size() && text[i] >= '0' && text[i] <= '9') ++i;
        return i != start;
    };
    if (i < text.size() && text[i] == '0') ++i;
    else if (!digits()) return false;
    if (i < text.size() && text[i] == '.') {
        ++i;
        if (!digits()) return false;
    }
    if (i < text.size() && (text[i] == 'e' || text[i] == 'E')) {
        ++i;
        if (i < text.size() && (text[i] == '+' || text[i] == '-')) ++i;
        if (!digits()) return false;
    }
    if (i != text.size()) return false;
    int64_t integer = 0;
    const auto parsed = std::from_chars(text.data(), text.data() + text.size(), integer);
    if (parsed.ec == std::errc{} && parsed.ptr == text.data() + text.size() && text != "-0") {
        result = integer >= std::numeric_limits<int32_t>::min() && integer <= std::numeric_limits<int32_t>::max()
            ? Valdi::Value(static_cast<int32_t>(integer)) : Valdi::Value(integer);
        return true;
    }
    const std::string terminated(text);
    char* end = nullptr;
    errno = 0;
    const auto number = strtod_l(terminated.c_str(), &end, locale);
    // ERANGE with a finite nonzero subnormal is a successful, rounded double.
    // Overflow and underflow all the way to zero cannot be represented.
    if (end != terminated.c_str() + terminated.size() || !std::isfinite(number) ||
        (errno == ERANGE && number == 0.0)) return false;
    result = Valdi::Value(number);
    return true;
}

using StorageNumbers = std::unordered_map<ptrdiff_t, Valdi::Value>;

Valdi::Value storageValueFromJSON(const Json::Value& value, const StorageNumbers& numbers) {
    switch (value.type()) {
        case Json::nullValue: return Valdi::Value();
        case Json::booleanValue: return Valdi::Value(value.asBool());
        case Json::intValue:
        case Json::uintValue:
        case Json::realValue: return numbers.at(value.getOffsetStart());
        case Json::stringValue: {
            const char* begin;
            const char* end;
            value.getString(&begin, &end);
            return Valdi::Value(Valdi::StringBox::fromString(std::string(begin, end)));
        }
        case Json::arrayValue: {
            auto array = Valdi::ValueArray::make(value.size());
            for (Json::ArrayIndex i = 0; i < value.size(); ++i) {
                array->emplace(i, storageValueFromJSON(value[i], numbers));
            }
            return Valdi::Value(array);
        }
        case Json::objectValue: {
            auto map = Valdi::makeShared<Valdi::ValueMap>();
            for (auto it = value.begin(); it != value.end(); ++it) {
                const char* end;
                const char* begin = it.memberName(&end);
                (*map)[Valdi::StringBox::fromString(std::string(begin, end))] = storageValueFromJSON(*it, numbers);
            }
            return Valdi::Value(map);
        }
    }
    throw std::runtime_error("E_STORAGE:unexpected JSON value");
}

Valdi::Result<Valdi::Value> storageJSONFromString(const std::string& text) {
    const auto invalid = [] { return Valdi::Error("Invalid stored value"); };
    // JSONCPP treats a raw NUL as EOF even when an explicit end is supplied.
    // Escaped \u0000 remains valid JSON in both keys and string values.
    if (text.find('\0') != std::string::npos) return invalid();
    std::unique_ptr<std::remove_pointer_t<locale_t>, decltype(&freelocale)> locale(
        newlocale(LC_NUMERIC_MASK, "C", nullptr), freelocale);
    if (!locale) throw std::runtime_error("E_STORAGE:numeric locale unavailable");
    auto structural = text;
    StorageNumbers numbers;
    bool quoted = false;
    for (size_t i = 0; i < text.size(); ++i) {
        const auto c = text[i];
        if (quoted) {
            if (static_cast<unsigned char>(c) < 0x20) return invalid();
            if (c == '\\') ++i;
            else if (c == '"') quoted = false;
        } else if (c == '"') {
            quoted = true;
        } else if (c == ',') {
            // JSONCPP can accept an object trailing comma after an empty key
            // despite allowTrailingCommas=false. Check only unquoted delimiters.
            auto next = i + 1;
            while (next < text.size() && (text[next] == ' ' || text[next] == '\t' ||
                   text[next] == '\r' || text[next] == '\n')) ++next;
            if (next < text.size() && (text[next] == '}' || text[next] == ']')) return invalid();
        } else if (c == '-' || (c >= '0' && c <= '9')) {
            const auto start = i;
            while (i < text.size() && (text[i] == '-' || text[i] == '+' || text[i] == '.' ||
                   text[i] == 'e' || text[i] == 'E' || (text[i] >= '0' && text[i] <= '9'))) ++i;
            Valdi::Value number;
            if (!storageNumber(std::string_view(text).substr(start, i - start), locale.get(), number)) return invalid();
            numbers.emplace(static_cast<ptrdiff_t>(start), std::move(number));
            // JSONCPP's iostream number decoder rejects subnormals on libc++.
            // Keep offsets intact while it validates the complete JSON structure,
            // strings and keys. Restore independently validated numbers by offset.
            structural[start] = '0';
            for (size_t j = start + 1; j < i; ++j) structural[j] = ' ';
            --i;
        }
    }
    Json::CharReaderBuilder builder;
    Json::CharReaderBuilder::strictMode(&builder.settings_);
    builder["skipBom"] = false;
    std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
    Json::Value parsed;
    if (!reader->parse(structural.data(), structural.data() + structural.size(), &parsed, nullptr)) return invalid();
    return storageValueFromJSON(parsed, numbers);
}

void requireSQL(int result, sqlite3* database) {
    if (result != SQLITE_OK) {
        throw std::runtime_error(std::string("E_STORAGE:") +
                                 (database != nullptr ? sqlite3_errmsg(database) : "database unavailable"));
    }
}

Statement prepare(sqlite3* database, const char* sql) {
    sqlite3_stmt* statement = nullptr;
    const auto status = sqlite3_prepare_v2(database, sql, -1, &statement, nullptr);
    Statement result(statement, sqlite3_finalize);
    requireSQL(status, database);
    return result;
}

void bindText(sqlite3* database, sqlite3_stmt* statement, int index, const std::string& value) {
    if (value.size() > static_cast<size_t>(std::numeric_limits<int>::max())) {
        throw std::runtime_error("E_STORAGE:value exceeds SQLite text length");
    }
    requireSQL(sqlite3_bind_text(statement, index, value.data(), static_cast<int>(value.size()), SQLITE_TRANSIENT),
               database);
}

} // namespace

HarmonyStorageHost::HarmonyStorageHost(const std::string& storageRoot) {
    try {
        requireSQL(sqlite3_open_v2((storageRoot + "/app-storage-structured.sqlite3").c_str(), &_database,
                                  SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nullptr),
                   _database);
        requireSQL(sqlite3_busy_timeout(_database, 5000), _database);
        requireSQL(sqlite3_exec(_database, "PRAGMA synchronous=FULL;"
            "CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
            nullptr, nullptr, nullptr), _database);
    } catch (...) {
        if (_database != nullptr) sqlite3_close_v2(_database);
        _database = nullptr;
        throw;
    }
}

HarmonyStorageHost::~HarmonyStorageHost() {
    if (_database != nullptr) sqlite3_close_v2(_database);
}

void HarmonyStorageHost::requireOpen() const {
    if (_database == nullptr) throw std::runtime_error("E_STORAGE_CLOSED:application storage was closed");
}

std::optional<std::string> HarmonyStorageHost::get(const std::string& key) {
    auto statement = prepare(_database, "SELECT value FROM kv WHERE key=?;");
    bindText(_database, statement.get(), 1, key);
    const auto status = sqlite3_step(statement.get());
    if (status == SQLITE_DONE) return {};
    if (status != SQLITE_ROW) requireSQL(status, _database);
    const auto* text = sqlite3_column_text(statement.get(), 0);
    const auto size = sqlite3_column_bytes(statement.get(), 0);
    if (text == nullptr) throw std::runtime_error("E_STORAGE:stored JSON text is unavailable");
    return std::string(reinterpret_cast<const char*>(text), static_cast<size_t>(size));
}

bool HarmonyStorageHost::set(const std::string& key, const std::string& json) {
    auto statement = prepare(_database, "INSERT OR REPLACE INTO kv(key,value) VALUES(?,?);");
    bindText(_database, statement.get(), 1, key);
    bindText(_database, statement.get(), 2, json);
    // Commit completes before returning true. Disk-full/read-only failures
    // propagate as the existing StorageHost.set(false) contract.
    return sqlite3_step(statement.get()) == SQLITE_DONE;
}

void HarmonyStorageHost::remove(const std::string& key) {
    auto statement = prepare(_database, "DELETE FROM kv WHERE key=?;");
    bindText(_database, statement.get(), 1, key);
    const auto status = sqlite3_step(statement.get());
    if (status != SQLITE_DONE) requireSQL(status, _database);
}

void HarmonyStorageHost::clear() {
    requireSQL(sqlite3_exec(_database, "DELETE FROM kv;", nullptr, nullptr, nullptr), _database);
}

Valdi::Value HarmonyStorageHost::hostValue() {
    // Generated model callbacks carry both argument and result schemas.
    // The official noexcept trampoline catches Valdi::Exception only.
    const auto invoke = [weak = weak_from_this()](auto operation) -> decltype(auto) {
        try {
            auto self = weak.lock();
            if (!self) throw std::runtime_error("E_STORAGE_CLOSED:application owner was released");
            self->requireOpen();
            return operation(*self);
        } catch (const Valdi::Exception&) {
            throw;
        } catch (const std::exception& error) {
            throw Valdi::Exception(Valdi::Error(std::string_view(error.what())));
        } catch (...) {
            throw Valdi::Exception(Valdi::Error("E_STORAGE:unexpected native failure"));
        }
    };
    snap::valdi_modules::app_pages::StorageHost host;
    host.setGet([invoke](Valdi::StringBox key) {
        return invoke([&](auto& self) {
            auto payload = Valdi::makeShared<Valdi::ValueMap>();
            const auto stored = self.get(key.slowToString());
            if (!stored) {
                return snap::valdi_modules::app_pages::StorageReadReply(false, payload, Valdi::StringBox::fromCString(""));
            }
            const auto decoded = storageJSONFromString(*stored);
            if (!decoded || !decoded.value().isMap() ||
                decoded.value().getMap()->find(Valdi::StringBox::fromCString("value")) == decoded.value().getMap()->end()) {
                return snap::valdi_modules::app_pages::StorageReadReply(
                    false, payload, Valdi::StringBox::fromCString("Invalid stored value"));
            }
            payload->insert(decoded.value().getMap()->begin(), decoded.value().getMap()->end());
            return snap::valdi_modules::app_pages::StorageReadReply(true, payload, Valdi::StringBox::fromCString(""));
        });
    });
    host.setSet([invoke](snap::valdi_modules::app_pages::StorageWriteRequest request) {
        return invoke([&](auto& self) {
            const auto& payload = request.getPayload();
            const auto found = payload->find(Valdi::StringBox::fromCString("value"));
            if (found == payload->end()) throw std::runtime_error("E_STORAGE:payload is missing value");
            return self.set(request.getKey().slowToString(), storageJSONString(Valdi::Value(payload)));
        });
    });
    host.setRemove([invoke](Valdi::StringBox key) {
        invoke([&](auto& self) { self.remove(key.slowToString()); });
    });
    host.setClear([invoke] { invoke([](auto& self) { self.clear(); }); });
    Valdi::SimpleExceptionTracker error;
    Valdi::Value value;
    Valdi::CppMarshaller::marshall(error, host, value);
    if (!error) throw Valdi::Exception(error.extractError());
    return value;
}

void HarmonyStorageHost::shutdownOnJS() {
    auto* database = _database;
    _database = nullptr;
    if (database != nullptr) sqlite3_close_v2(database);
}

} // namespace ValdiHarmony
