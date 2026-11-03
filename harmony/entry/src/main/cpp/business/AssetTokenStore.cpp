#include "AssetTokenStore.hpp"

#include <asset/asset_api.h>

#include <iterator>
#include <mutex>
#include <stdexcept>

namespace ValdiHarmony {
namespace {

// Serialize operations across mounted runtimes targeting the same app alias.
// This protects only in-process ordering; the OS owns atomic persistent writes.
std::mutex& storeMutex() {
    static std::mutex mutex;
    return mutex;
}

Asset_Attr blob(Asset_Tag tag, std::string_view value) {
    Asset_Attr result{};
    result.tag = tag;
    result.value.blob = {static_cast<uint32_t>(value.size()),
                         reinterpret_cast<uint8_t*>(const_cast<char*>(value.data()))};
    return result;
}

Asset_Attr number(Asset_Tag tag, uint32_t value) {
    Asset_Attr result{};
    result.tag = tag;
    result.value.u32 = value;
    return result;
}

void check(int32_t status, const char* operation) {
    if (status != ASSET_SUCCESS) {
        // Never include the token or returned SDK attributes in an error.
        throw std::runtime_error(std::string("E_TOKEN_STORE:") + operation +
                                 " failed (AssetStore status " + std::to_string(status) + ")");
    }
}

struct Results {
    Asset_ResultSet value{};
    ~Results() {
        // Clear returned secret bytes before asking the SDK to release them.
        if (value.results) {
            for (uint32_t i = 0; i < value.count; ++i) {
                auto* secret = OH_Asset_ParseAttr(&value.results[i], ASSET_TAG_SECRET);
                if (secret && secret->value.blob.data) {
                    volatile uint8_t* bytes = secret->value.blob.data;
                    for (uint32_t j = 0; j < secret->value.blob.size; ++j) bytes[j] = 0;
                }
            }
        }
        OH_Asset_FreeResultSet(&value);
    }
};

} // namespace

bool AssetTokenStore::has() {
    std::lock_guard lock(storeMutex());
    Asset_Attr query[] = {blob(ASSET_TAG_ALIAS, Alias),
                         number(ASSET_TAG_RETURN_TYPE, ASSET_RETURN_ATTRIBUTES),
                         number(ASSET_TAG_RETURN_LIMIT, 1)};
    Results results;
    const auto status = OH_Asset_Query(query, std::size(query), &results.value);
    if (status == ASSET_NOT_FOUND) return false;
    check(status, "has");
    if (results.value.count != 1 || !results.value.results) {
        throw std::runtime_error("E_TOKEN_STORE:invalid presence result");
    }
    return true;
}

std::string AssetTokenStore::read() {
    std::lock_guard lock(storeMutex());
    Asset_Attr query[] = {blob(ASSET_TAG_ALIAS, Alias),
                         number(ASSET_TAG_RETURN_TYPE, ASSET_RETURN_ALL),
                         number(ASSET_TAG_RETURN_LIMIT, 1)};
    Results results;
    const auto status = OH_Asset_Query(query, std::size(query), &results.value);
    if (status == ASSET_NOT_FOUND) return {};
    check(status, "read");
    if (results.value.count != 1 || !results.value.results) {
        throw std::runtime_error("E_TOKEN_STORE:invalid read result");
    }
    const auto* secret = OH_Asset_ParseAttr(&results.value.results[0], ASSET_TAG_SECRET);
    if (!secret || !secret->value.blob.data || secret->value.blob.size == 0 ||
        secret->value.blob.size > MaxTokenBytes) {
        throw std::runtime_error("E_TOKEN_STORE:invalid secret result");
    }
    return {reinterpret_cast<const char*>(secret->value.blob.data), secret->value.blob.size};
}

void AssetTokenStore::write(std::string_view token) {
    if (token.empty() || token.size() > MaxTokenBytes ||
        token.find_first_not_of(" \t\r\n\f\v") == std::string_view::npos) {
        throw std::runtime_error("E_TOKEN_STORE:token must contain 1..1024 UTF-8 bytes and non-whitespace");
    }
    std::lock_guard lock(storeMutex());
    // OVERWRITE is one service operation: no remove/add gap, no cached success.
    // Omit IS_PERSISTENT (default false): do not retain the asset on uninstall
    // or require the privileged STORE_PERSISTENT_DATA permission.
    // SYNC_NEVER prevents device/account migration of this credential.
    Asset_Attr attributes[] = {
        blob(ASSET_TAG_ALIAS, Alias),
        blob(ASSET_TAG_SECRET, token),
        number(ASSET_TAG_ACCESSIBILITY, ASSET_ACCESSIBILITY_DEVICE_FIRST_UNLOCKED),
        number(ASSET_TAG_AUTH_TYPE, ASSET_AUTH_TYPE_NONE),
        number(ASSET_TAG_SYNC_TYPE, ASSET_SYNC_TYPE_NEVER),
        number(ASSET_TAG_CONFLICT_RESOLUTION, ASSET_CONFLICT_OVERWRITE),
    };
    check(OH_Asset_Add(attributes, std::size(attributes)), "write");
}

void AssetTokenStore::clear() {
    std::lock_guard lock(storeMutex());
    const Asset_Attr query[] = {blob(ASSET_TAG_ALIAS, Alias)};
    const auto status = OH_Asset_Remove(query, std::size(query));
    if (status != ASSET_NOT_FOUND) check(status, "clear");
}

} // namespace ValdiHarmony
