#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace Valdi::Harmony::detail {

inline int namedFontWeight(std::string_view name) {
    if (name == "thin") return 100;
    if (name == "ultralight" || name == "extralight") return 200;
    if (name == "light") return 300;
    if (name == "normal" || name == "regular") return 400;
    if (name == "medium") return 500;
    if (name == "semibold" || name == "demibold") return 600;
    if (name == "bold") return 700;
    if (name == "extrabold" || name == "ultrabold") return 800;
    if (name == "black" || name == "heavy") return 900;
    for (int weight = 100; weight <= 900; weight += 100) {
        if (name == std::to_string(weight)) return weight;
    }
    throw std::runtime_error("unsupported font weight: " + std::string(name));
}

struct FontSpec {
    std::string family;
    float size = 16;
    int weight = 400;
};

inline FontSpec parseFont(std::string_view value) {
    std::istringstream input {std::string(value)};
    std::string name, extra;
    double size = 0;
    if (!(input >> name >> size) || (input >> extra) ||
        !std::isfinite(size) || size <= 0 || size > 100000) {
        throw std::runtime_error("font requires a family and a positive finite point size");
    }
    FontSpec font;
    font.size = static_cast<float>(size);
    if (name == "system") return font;
    if (name.starts_with("system-")) {
        font.weight = namedFontWeight(std::string_view(name).substr(7));
    } else {
        const auto colon = name.find(':');
        if (colon == std::string::npos || colon == 0 || colon + 1 == name.size() ||
            name.find(':', colon + 1) != std::string::npos) {
            throw std::runtime_error("font supports system[-weight] SIZE or module:name SIZE");
        }
        font.family = std::move(name);
    }
    return font;
}

// Production identity/cache policy independent of native SDK types. Never hash
// font bytes into an alias: exact equality handles even adversarial collisions.
// The process singleton is intentionally never destroyed; native registrations
// and buffers must outlive every host, text node and typography object.
class FontRegistry {
public:
    struct Entry {
        std::string qualifiedName;
        std::string alias;
        std::vector<uint8_t> bytes;
    };
    std::recursive_mutex mutex;

    template<class Register>
    std::string resolve(std::string name, const uint8_t* bytes, size_t length, Register&& registration) {
        std::lock_guard lock(mutex);
        if (!bytes || !length) throw std::runtime_error("module font data is empty");
        for (const auto* entry : _ready) {
            if (entry->qualifiedName == name && entry->bytes.size() == length &&
                std::equal(entry->bytes.begin(), entry->bytes.end(), bytes)) return entry->alias;
        }
        if (_nextId == std::numeric_limits<uint64_t>::max()) throw std::runtime_error("font alias exhaustion");
        auto entry = std::make_unique<Entry>();
        entry->qualifiedName = std::move(name);
        entry->alias = "__valdi_harmony_module_font_" + std::to_string(_nextId++);
        entry->bytes.assign(bytes, bytes + length);
        // Publish ownership before the SDK sees this mutable buffer. Even a
        // registration error must not free storage potentially observed by SDK.
        auto* retained = entry.get();
        _entries.push_back(std::move(entry));
        registration(*retained);
        _ready.push_back(retained);
        return retained->alias;
    }

private:
    uint64_t _nextId = 1;
    std::vector<std::unique_ptr<Entry>> _entries;
    std::vector<Entry*> _ready;
};

inline FontRegistry& fontRegistry() {
    static auto* registry = new FontRegistry();
    return *registry;
}

// Resolution can synchronously re-enter the renderer through loadFontData.
// Copy the entire style before crossing that boundary and publish only the
// latest application. Callers retain the native owner and validate lifecycle.
struct FontApplicationEpoch {
    uint64_t generation = 0;
    void invalidate() { ++generation; }
};

template<class Style, class Resolve, class Valid, class Apply>
bool applyResolvedFont(FontApplicationEpoch& epoch, Style snapshot,
                       Resolve&& resolve, Valid&& valid, Apply&& apply) {
    const auto generation = ++epoch.generation;
    const auto family = resolve(snapshot.family);
    if (epoch.generation != generation || !valid()) return false;
    apply(snapshot, family);
    return true;
}

} // namespace Valdi::Harmony::detail
