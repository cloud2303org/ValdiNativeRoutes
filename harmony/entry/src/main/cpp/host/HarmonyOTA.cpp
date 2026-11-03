#include "HarmonyOTA.hpp"

#include <json/json.h>
#include <openssl/base64.h>
#include <openssl/ec.h>
#include <openssl/ec_key.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/sha.h>

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <mutex>
#include <set>
#include <stdexcept>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <utility>

namespace ValdiHarmony {
namespace {
constexpr size_t maxPackage = 64U << 20;
constexpr size_t maxManifest = 1U << 20;

[[noreturn]] void fail(const char* message) { throw std::runtime_error(message); }
void require(bool value, const char* message) { if (!value) fail(message); }

class FD {
public:
    explicit FD(int fd = -1) : value(fd) {}
    ~FD() { if (value >= 0) close(value); }
    FD(FD&& other) noexcept : value(std::exchange(other.value, -1)) {}
    FD& operator=(FD&& other) noexcept {
        if (this != &other) { if (value >= 0) close(value); value = std::exchange(other.value, -1); }
        return *this;
    }
    FD(const FD&) = delete;
    int get() const { return value; }
private:
    int value;
};

bool alnum(char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}
bool versionName(const std::string& s) {
    return !s.empty() && s.size() <= 64 && alnum(s.front()) &&
        std::all_of(s.begin(), s.end(), [](char c) { return alnum(c) || c == '.' || c == '_' || c == '-'; });
}
bool component(const std::string& s) {
    return !s.empty() && (alnum(s.front()) || s.front() == '_' || s.front() == '@') &&
        std::all_of(s.begin(), s.end(), [](char c) {
            return alnum(c) || c == '_' || c == '@' || c == '.' || c == '-';
        });
}
bool hex(const std::string& s, size_t length) {
    return s.size() == length && std::all_of(s.begin(), s.end(), [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    });
}
std::vector<std::string> split(const std::string& path) {
    std::vector<std::string> result;
    size_t start = 0;
    do {
        const auto end = path.find('/', start);
        result.push_back(path.substr(start, end == std::string::npos ? end : end - start));
        if (end == std::string::npos) return result;
        start = end + 1;
    } while (true);
}
bool fileName(const std::string& path) {
    if (path.size() > 1024) return false;
    const auto parts = split(path);
    return parts.size() >= 2 && (parts[0] == "modules" || parts[0] == "res") &&
        std::all_of(parts.begin() + 1, parts.end(), component);
}
bool endpoint(const std::string& url, bool allowHTTP) {
    const auto offset = url.starts_with("https://") ? 8U :
        (allowHTTP && url.starts_with("http://") ? 7U : 0U);
    if (!offset || url.size() <= offset || url.size() > 4096) return false;
    if (url.find_first_of("?#\\@") != std::string::npos ||
        std::any_of(url.begin(), url.end(), [](unsigned char c) { return c <= 32 || c >= 127; })) return false;
    const auto end = url.find('/', offset);
    if (end == offset) return false;
    // Forbid URL path normalization/encoded traversal. Configuration uses literal safe paths.
    if (end != std::string::npos) {
        auto tail = url.substr(end + 1);
        if (!tail.empty() && tail.back() == '/') tail.pop_back();
        if (!tail.empty()) for (const auto& part : split(tail)) if (!component(part)) return false;
    }
    return true;
}
Json::Value parse(const OTABytes& bytes) {
    Json::CharReaderBuilder builder;
    builder["collectComments"] = false;
    builder["allowComments"] = false;
    builder["allowTrailingCommas"] = false;
    builder["rejectDupKeys"] = true;
    builder["failIfExtra"] = true;
    builder["strictRoot"] = true;
    builder["stackLimit"] = 32;
    std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
    Json::Value result;
    std::string errors;
    const std::string text(bytes.begin(), bytes.end());
    require(reader->parse(text.data(), text.data() + text.size(), &result, &errors) && result.isObject(),
            "Invalid OTA JSON");
    return result;
}
std::string field(const Json::Value& object, const char* name) {
    require(object[name].isString(), "Missing OTA string field");
    return object[name].asString();
}
OTABytes encode(const Json::Value& value) {
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    const auto string = Json::writeString(writer, value);
    return OTABytes(string.begin(), string.end());
}
std::string digest(const OTABytes& bytes) {
    uint8_t raw[SHA256_DIGEST_LENGTH];
    SHA256(bytes.data(), bytes.size(), raw);
    static constexpr char chars[] = "0123456789abcdef";
    std::string result;
    for (auto c : raw) { result += chars[c >> 4]; result += chars[c & 15]; }
    return result;
}
using Key = std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)>;
Key readKey(const std::string& pem) {
    if (pem.empty() || pem.size() > 16384 || pem.find("PRIVATE KEY") != std::string::npos)
        return {nullptr, EVP_PKEY_free};
    std::unique_ptr<BIO, decltype(&BIO_free)> bio(BIO_new_mem_buf(pem.data(), static_cast<int>(pem.size())), BIO_free);
    Key key(bio ? PEM_read_bio_PUBKEY(bio.get(), nullptr, nullptr, nullptr) : nullptr, EVP_PKEY_free);
    if (!key || EVP_PKEY_id(key.get()) != EVP_PKEY_EC) return {nullptr, EVP_PKEY_free};
    auto* ec = EVP_PKEY_get0_EC_KEY(key.get());
    if (ec == nullptr || EC_GROUP_get_curve_name(EC_KEY_get0_group(ec)) != NID_X9_62_prime256v1 ||
        EC_KEY_check_key(ec) != 1) return {nullptr, EVP_PKEY_free};
    return key;
}

FD directory(int parent, const std::string& name, bool create = false) {
    if (create && mkdirat(parent, name.c_str(), 0700) != 0 && errno != EEXIST) fail("Cannot create OTA directory");
    FD fd(openat(parent, name.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW));
    require(fd.get() >= 0, "Cannot open OTA directory (symlinks are forbidden)");
    return fd;
}
FD parentOf(int root, const std::string& path, std::string& leaf, bool create = false) {
    auto parts = split(path);
    FD fd(dup(root));
    require(fd.get() >= 0, "Cannot duplicate OTA directory");
    for (size_t i = 0; i + 1 < parts.size(); i++) {
        require(component(parts[i]), "Invalid OTA directory component");
        fd = directory(fd.get(), parts[i], create);
    }
    leaf = parts.back();
    require(component(leaf), "Invalid OTA leaf name");
    return fd;
}
OTABytes read(int root, const std::string& path, size_t limit) {
    std::string leaf;
    auto parent = parentOf(root, path, leaf);
    FD fd(openat(parent.get(), leaf.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK));
    struct stat st {};
    require(fd.get() >= 0 && fstat(fd.get(), &st) == 0 && S_ISREG(st.st_mode) && st.st_nlink == 1 &&
                st.st_size >= 0 && static_cast<uint64_t>(st.st_size) <= limit, "Invalid OTA file or size");
    OTABytes bytes(static_cast<size_t>(st.st_size));
    size_t done = 0;
    while (done < bytes.size()) {
        const auto count = ::read(fd.get(), bytes.data() + done, bytes.size() - done);
        if (count < 0 && errno == EINTR) continue;
        require(count > 0, "Cannot read complete OTA file");
        done += static_cast<size_t>(count);
    }
    uint8_t extra;
    require(::read(fd.get(), &extra, 1) == 0, "OTA file changed while reading");
    return bytes;
}
void write(int root, const std::string& path, const OTABytes& bytes) {
    std::string leaf;
    auto parent = parentOf(root, path, leaf, true);
    FD fd(openat(parent.get(), leaf.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600));
    require(fd.get() >= 0, "Cannot create OTA file");
    size_t done = 0;
    while (done < bytes.size()) {
        const auto count = ::write(fd.get(), bytes.data() + done, bytes.size() - done);
        if (count < 0 && errno == EINTR) continue;
        require(count > 0, "Cannot write complete OTA file");
        done += static_cast<size_t>(count);
    }
    require(fsync(fd.get()) == 0 && fsync(parent.get()) == 0, "Cannot sync OTA file");
}
std::vector<std::string> children(int root) {
    // dup() shares directory offsets; openat(".") obtains a fresh directory description.
    FD copy(openat(root, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW));
    require(copy.get() >= 0, "Cannot enumerate OTA directory");
    DIR* raw = fdopendir(dup(copy.get()));
    require(raw != nullptr, "Cannot enumerate OTA directory");
    std::unique_ptr<DIR, decltype(&closedir)> dir(raw, closedir);
    std::vector<std::string> names;
    errno = 0;
    while (auto* entry = readdir(raw)) {
        const std::string name(entry->d_name);
        if (name != "." && name != "..") names.push_back(name);
    }
    require(errno == 0, "Cannot enumerate OTA directory");
    return names;
}
void remove(int root, const std::string& name) {
    // Only direct children from readdir or fixed internal names. Never follow links.
    require(name != "." && name != ".." && name.find('/') == std::string::npos, "Invalid OTA removal");
    struct stat st {};
    if (fstatat(root, name.c_str(), &st, AT_SYMLINK_NOFOLLOW) != 0) {
        require(errno == ENOENT, "Cannot inspect OTA removal");
        return;
    }
    if (S_ISDIR(st.st_mode)) {
        auto fd = directory(root, name);
        for (const auto& child : children(fd.get())) remove(fd.get(), child);
        require(unlinkat(root, name.c_str(), AT_REMOVEDIR) == 0, "Cannot remove OTA directory");
    } else require(unlinkat(root, name.c_str(), 0) == 0, "Cannot remove OTA file");
}
void syncTree(int root) {
    for (const auto& name : children(root)) {
        struct stat st {};
        require(fstatat(root, name.c_str(), &st, AT_SYMLINK_NOFOLLOW) == 0, "Cannot inspect staged OTA file");
        if (S_ISDIR(st.st_mode)) { auto child = directory(root, name); syncTree(child.get()); }
        else require(S_ISREG(st.st_mode), "Invalid staged OTA file");
    }
    require(fsync(root) == 0, "Cannot sync OTA directory");
}

struct State {
    std::string binary, current, pending;
    bool pendingLaunched = false;
    std::set<std::string> failed;
    bool knows(const std::string& version) const {
        return current == version || pending == version || failed.contains(version);
    }
    Json::Value json() const {
        Json::Value result(Json::objectValue);
        result["binary"] = binary;
        result["current"] = current.empty() ? Json::Value() : Json::Value(current);
        result["pending"] = pending.empty() ? Json::Value() : Json::Value(pending);
        result["pendingLaunched"] = pendingLaunched;
        result["failed"] = Json::Value(Json::arrayValue);
        for (const auto& version : failed) result["failed"].append(version);
        return result;
    }
    static State load(int root) {
        struct stat st {};
        if (fstatat(root, "state.json", &st, AT_SYMLINK_NOFOLLOW) != 0) {
            require(errno == ENOENT, "Cannot inspect OTA state");
            return {};
        }
        // Corrupt state fails closed, never guesses whether an unconfirmed package was good.
        const auto value = parse(read(root, "state.json", maxManifest));
        State result;
        result.binary = field(value, "binary");
        for (auto pair : {std::pair{"current", &result.current}, std::pair{"pending", &result.pending}}) {
            if (value[pair.first].isNull()) continue;
            *pair.second = field(value, pair.first);
            require(versionName(*pair.second), "Invalid OTA state version");
        }
        require(value["pendingLaunched"].isBool() && value["failed"].isArray(), "Invalid OTA state");
        result.pendingLaunched = value["pendingLaunched"].asBool();
        for (const auto& version : value["failed"]) {
            require(version.isString() && versionName(version.asString()), "Invalid OTA failed version");
            result.failed.insert(version.asString());
        }
        return result;
    }
    void save(int root) const {
        remove(root, "state.next");
        write(root, "state.next", encode(json()));
        require(renameat(root, "state.next", root, "state.json") == 0, "Cannot commit OTA state");
        require(fsync(root) == 0, "Cannot sync OTA state");
    }
};
struct Package {
    std::string version;
    std::map<std::string, std::string> files;
};
Package verify(const HarmonyOTAConfig& config, EVP_PKEY* key, const OTABytes& bytes,
               const OTABytes& signature, const std::string& version) {
    require(bytes.size() <= maxManifest && signature.size() <= 4096, "Oversize OTA manifest/signature");
    std::string base64(signature.begin(), signature.end());
    base64.erase(std::remove_if(base64.begin(), base64.end(), [](char c) {
        return c == ' ' || c == '\t' || c == '\r' || c == '\n';
    }), base64.end());
    OTABytes der(base64.size());
    size_t length = 0;
    require(!base64.empty() && EVP_DecodeBase64(der.data(), &length, der.size(),
                reinterpret_cast<const uint8_t*>(base64.data()), base64.size()) == 1, "Invalid OTA signature base64");
    std::unique_ptr<EVP_MD_CTX, decltype(&EVP_MD_CTX_free)> ctx(EVP_MD_CTX_new(), EVP_MD_CTX_free);
    require(ctx && EVP_DigestVerifyInit(ctx.get(), nullptr, EVP_sha256(), nullptr, key) == 1 &&
                EVP_DigestVerify(ctx.get(), der.data(), length, bytes.data(), bytes.size()) == 1,
            "Invalid OTA manifest signature");
    const auto manifest = parse(bytes);
    require(field(manifest, "platform") == "harmony", "Wrong OTA platform");
    require(field(manifest, "appVersion") == config.appVersion, "Wrong OTA app version");
    require(field(manifest, "fingerprint") == config.fingerprint, "Wrong OTA native fingerprint");
    require(versionName(version) && field(manifest, "version") == version, "Wrong OTA package version");
    require(manifest["files"].isObject() && manifest["files"].size() <= 4096, "Invalid OTA file list");
    Package result{version, {}};
    bool module = false;
    for (const auto& name : manifest["files"].getMemberNames()) {
        require(fileName(name) && manifest["files"][name].isString() &&
                    hex(manifest["files"][name].asString(), 64), "Invalid OTA file path/hash");
        const auto parts = split(name);
        // Harmony ResourceManager requests flat complete filenames.
        if (parts[0] == "modules") {
            require(parts.size() == 2 && (name.ends_with(".valdimodule") || name.ends_with(".map.json")),
                    "Unsupported Harmony OTA module layout");
            module = module || name.ends_with(".valdimodule");
        } else {
            require(parts.size() == 4 && parts[1] == "assets" &&
                        (name.ends_with(".png") || name.ends_with(".webp")), "Unsupported Harmony OTA asset layout");
        }
        result.files.emplace(name, manifest["files"][name].asString());
    }
    require(module, "OTA package has no module");
    return result;
}
} // namespace

struct HarmonyOTA::Impl {
    HarmonyOTAConfig config;
    std::shared_ptr<HarmonyOTATransport> transport;
    Key key{nullptr, EVP_PKEY_free};
    FD root, packages, lockFile;
    State state;
    std::optional<Package> active;
    std::atomic<bool> cancelled{false};
    mutable std::mutex mutex;
    std::mutex workerMutex;
    std::shared_future<HarmonyOTAResult> job;
    bool on = false, stopping = false;

    explicit Impl(HarmonyOTAConfig c, std::shared_ptr<HarmonyOTATransport> t)
        : config(std::move(c)), transport(std::move(t)) {
        key = readKey(config.publicKey);
        if (!key || !transport || !endpoint(config.url, config.allowInsecureHTTP) ||
            !versionName(config.appVersion) || !hex(config.fingerprint, 32) ||
            config.binaryIdentity.empty()) return;
        while (config.url.ends_with('/')) config.url.pop_back();
        // Walk from "/" so even ancestors cannot silently redirect the persistent store.
        require(config.persistentRoot.starts_with('/'), "OTA filesDir must be absolute");
        FD parent(open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC));
        for (const auto& part : split(config.persistentRoot.substr(1))) {
            require(!part.empty() && part != "." && part != ".." && part.find('\0') == std::string::npos,
                    "OTA filesDir must be canonical");
            parent = directory(parent.get(), part);
        }
        root = directory(parent.get(), "valdi-ota", true);
        require(fsync(parent.get()) == 0, "Cannot sync OTA store creation");
        struct stat st {};
        require(fstat(root.get(), &st) == 0 && st.st_uid == geteuid() && (st.st_mode & 0077) == 0,
                "OTA store must be app-private");
        lockFile = FD(openat(root.get(), "lock", O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600));
        require(lockFile.get() >= 0 && fstat(lockFile.get(), &st) == 0 && S_ISREG(st.st_mode) &&
                    st.st_nlink == 1 && flock(lockFile.get(), LOCK_EX | LOCK_NB) == 0, "OTA store already in use or unsafe");
        packages = directory(root.get(), "packages", true);
        state = State::load(root.get());
        const auto identity = config.appVersion + "/" + config.fingerprint + "/" + config.binaryIdentity;
        if (state.binary != identity) {
            state = State{};
            state.binary = identity;
        }
        auto selected = state.current;
        if (!state.pending.empty()) {
            if (state.pendingLaunched) {
                state.failed.insert(state.pending);
                state.pending.clear();
                state.pendingLaunched = false;
            } else {
                state.pendingLaunched = true;
                selected = state.pending;
            }
        }
        if (!selected.empty()) {
            try { active = openPackage(selected); }
            catch (const std::exception&) {
                state.failed.insert(selected);
                if (selected == state.pending) {
                    state.pending.clear();
                    state.pendingLaunched = false;
                    if (!state.current.empty()) {
                        try { active = openPackage(state.current); }
                        catch (const std::exception&) { state.failed.insert(state.current); state.current.clear(); }
                    }
                } else state.current.clear();
            }
        }
        state.save(root.get()); // Never return selected bytes before the launch marker is durable.
        for (const auto& name : children(packages.get()))
            if (name != state.current && name != state.pending) remove(packages.get(), name);
        remove(root.get(), "download");
        on = true;
    }
    Package openPackage(const std::string& version) {
        auto dir = directory(packages.get(), version);
        auto pkg = verify(config, key.get(), read(dir.get(), "manifest.json", maxManifest),
                          read(dir.get(), "manifest.sig", 4096), version);
        size_t total = 0;
        for (const auto& [name, hash] : pkg.files) {
            const auto bytes = read(dir.get(), name, maxPackage - total);
            total += bytes.size();
            require(digest(bytes) == hash, "Cached OTA file hash mismatch");
        }
        return pkg;
    }
    std::optional<OTABytes> readActive(const std::string& name) const {
        std::lock_guard guard(mutex);
        if (!on || !active || !active->files.contains(name)) return std::nullopt;
        auto dir = directory(packages.get(), active->version);
        auto bytes = read(dir.get(), name, maxPackage);
        require(digest(bytes) == active->files.at(name), "Active OTA file hash mismatch");
        return bytes;
    }
    std::string assetName(const std::string& module, const std::string& logical) const {
        if (!component(module) || !component(logical)) return {};
        std::lock_guard guard(mutex);
        if (active) for (const auto* ext : {".png", ".webp"}) {
            auto name = "res/assets/" + module + "/" + logical + ext;
            if (active->files.contains(name)) return name;
        }
        return {};
    }
    std::optional<std::string> path(const std::string& name) const {
        // Validates listed bytes first; loader should use readModule/readAsset to avoid reopen races.
        if (!readActive(name)) return std::nullopt;
        return config.persistentRoot + "/valdi-ota/packages/" + active->version + "/" + name;
    }
    OTABytes download(const std::string& url, size_t limit) {
        require(!cancelled, "OTA cancelled");
        auto bytes = transport->get(url, limit, cancelled);
        require(!cancelled, "OTA cancelled");
        require(bytes.size() <= limit, "OTA response exceeds size limit");
        return bytes;
    }
    HarmonyOTAResult update() {
        std::string version;
        try {
            const auto base = config.url + "/harmony/" + config.appVersion;
            version = field(parse(download(base + "/latest.json", 64U << 10)), "version");
            require(versionName(version), "Invalid OTA latest version");
            {
                std::lock_guard guard(mutex);
                if (state.knows(version)) return {HarmonyOTAStatus::Known, version, {}};
                if (active && state.pending == active->version) return {HarmonyOTAStatus::PendingLaunch, version, {}};
            }
            const auto remote = base + "/" + version + "/";
            const auto manifest = download(remote + "manifest.json", maxManifest);
            const auto signature = download(remote + "manifest.sig", 4096);
            const auto pkg = verify(config, key.get(), manifest, signature, version);
            remove(root.get(), "download");
            auto staged = directory(root.get(), "download", true);
            size_t total = 0;
            for (const auto& [name, hash] : pkg.files) {
                auto bytes = download(remote + name, maxPackage - total);
                total += bytes.size();
                require(digest(bytes) == hash, "Downloaded OTA file hash mismatch");
                write(staged.get(), name, bytes);
            }
            write(staged.get(), "manifest.json", manifest);
            write(staged.get(), "manifest.sig", signature);
            syncTree(staged.get());
            {
                std::lock_guard guard(mutex);
                require(!cancelled, "OTA cancelled");
                if (state.knows(version)) {
                    remove(root.get(), "download");
                    return {HarmonyOTAStatus::Known, version, {}};
                }
                struct stat st {};
                require(fstatat(packages.get(), version.c_str(), &st, AT_SYMLINK_NOFOLLOW) != 0 && errno == ENOENT,
                        "OTA package destination exists");
                require(renameat(root.get(), "download", packages.get(), version.c_str()) == 0,
                        "Cannot commit OTA package");
                require(fsync(packages.get()) == 0 && fsync(root.get()) == 0, "Cannot sync OTA package commit");
                auto next = state;
                next.pending = version;
                next.pendingLaunched = false;
                // Crash before state rename leaves only an orphan, cleaned at next startup.
                next.save(root.get());
                state = std::move(next);
            }
            return {HarmonyOTAStatus::Installed, version, {}};
        } catch (const std::exception& e) {
            try { remove(root.get(), "download"); } catch (...) {}
            return {cancelled ? HarmonyOTAStatus::Cancelled : HarmonyOTAStatus::Failed, version, e.what()};
        } catch (...) {
            try { remove(root.get(), "download"); } catch (...) {}
            return {HarmonyOTAStatus::Failed, version, "Unknown OTA failure"};
        }
    }
};

HarmonyOTA::HarmonyOTA(HarmonyOTAConfig config, std::shared_ptr<HarmonyOTATransport> transport)
    : _impl(std::make_shared<Impl>(std::move(config), std::move(transport))) {}
HarmonyOTA::~HarmonyOTA() { shutdown(); }
bool HarmonyOTA::enabled() const { return _impl->on; }
std::string HarmonyOTA::activeVersion() const { return _impl->active ? _impl->active->version : ""; }
std::optional<std::string> HarmonyOTA::resolveModulePath(const std::string& filename) const {
    if (!component(filename)) return std::nullopt;
    return _impl->path("modules/" + filename);
}
std::optional<std::string> HarmonyOTA::resolveAssetPath(const std::string& module, const std::string& logical) const {
    return _impl->path(_impl->assetName(module, logical));
}
std::optional<OTABytes> HarmonyOTA::readModule(const std::string& filename) const {
    if (!component(filename)) return std::nullopt;
    return _impl->readActive("modules/" + filename);
}
std::optional<OTABytes> HarmonyOTA::readAsset(const std::string& module, const std::string& logical) const {
    return _impl->readActive(_impl->assetName(module, logical));
}
void HarmonyOTA::confirmLaunch() {
    auto self = _impl;
    std::lock_guard guard(self->mutex);
    if (!self->on || self->cancelled || !self->active || self->state.pending != self->active->version) return;
    auto next = self->state;
    next.current = next.pending;
    next.pending.clear();
    next.pendingLaunched = false;
    next.save(self->root.get());
    self->state = std::move(next);
    // Preserve every package until the next startup; active readers never lose their directory.
}
std::shared_future<HarmonyOTAResult> HarmonyOTA::checkForUpdate() {
    auto self = _impl;
    std::lock_guard guard(self->workerMutex);
    if (!self->on || self->stopping) {
        std::promise<HarmonyOTAResult> done;
        done.set_value({self->stopping ? HarmonyOTAStatus::Cancelled : HarmonyOTAStatus::Disabled, {}, {}});
        return done.get_future().share();
    }
    if (!self->job.valid() || self->job.wait_for(std::chrono::seconds(0)) == std::future_status::ready)
        // Destructor joins before releasing _impl. Do not capture a shared owner:
        // Impl owning a future whose callable owns Impl would form a cycle.
        self->job = std::async(std::launch::async, [impl = self.get()] { return impl->update(); }).share();
    return self->job;
}
void HarmonyOTA::shutdown() {
    auto self = _impl;
    std::shared_future<HarmonyOTAResult> job;
    {
        std::lock_guard worker(self->workerMutex);
        // Serialize shutdown with the commit boundary and confirmLaunch.
        std::lock_guard state(self->mutex);
        self->stopping = true;
        self->cancelled = true;
        job = self->job;
    }
    if (job.valid()) job.wait();
}
} // namespace ValdiHarmony
