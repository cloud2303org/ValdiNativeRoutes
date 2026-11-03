#pragma once

#include "valdi_core/cpp/Utils/Value.hpp"
#include <memory>
#include <optional>
#include <string>

struct sqlite3;

namespace ValdiHarmony {

// app_pages/src/storage.ts: structured bridge values, JSON text only in private app storage, not secrets.
// One connection per runtime; SQLite serializes distinct hosts sharing the root.
class HarmonyStorageHost final : public std::enable_shared_from_this<HarmonyStorageHost> {
public:
    explicit HarmonyStorageHost(const std::string& storageRoot);
    ~HarmonyStorageHost();
    Valdi::Value hostValue();
    void shutdownOnJS();

private:
    sqlite3* _database = nullptr;
    std::optional<std::string> get(const std::string& key);
    bool set(const std::string& key, const std::string& json);
    void remove(const std::string& key);
    void clear();
    void requireOpen() const;
};

} // namespace ValdiHarmony
