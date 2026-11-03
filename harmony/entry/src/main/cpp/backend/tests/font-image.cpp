#include "../FontResolver.hpp"
#include "../ImageGeometry.hpp"
#include "../ImageDecodedState.hpp"

#include <cassert>
#include <iostream>
#include <thread>

using namespace Valdi::Harmony::detail;

int main() {
    for (const auto* weight : {"thin", "ultralight", "light", "regular", "medium",
                               "semibold", "bold", "extrabold", "black"}) {
        const auto parsed = parseFont(std::string("system-") + weight + " 20.5");
        assert(parsed.family.empty() && parsed.size == 20.5f);
        assert(parsed.weight == namedFontWeight(weight));
    }
    assert(parseFont("app_pages:roboto_mono_regular 20").family == "app_pages:roboto_mono_regular");
    for (const auto* invalid : {"system 0", "system -1", "system nan", "system 20px", "system 20 extra",
                                "unknown 20", "module: 20", ":font 20", "a:b:c 20", "system-italic 20"}) {
        bool threw = false;
        try { (void)parseFont(invalid); } catch (const std::runtime_error&) { threw = true; }
        assert(threw);
    }

    FontRegistry registry;
    std::string originalAlias;
    const uint8_t* retained = nullptr;
    int registrations = 0;
    const auto registration = [&](FontRegistry::Entry& entry) {
        ++registrations;
        retained = entry.bytes.data();
        assert(entry.bytes == std::vector<uint8_t>({1, 2, 3}));
    };
    {
        std::vector<uint8_t> temporary {1, 2, 3};
        originalAlias = registry.resolve("app:font", temporary.data(), temporary.size(), registration);
        temporary.assign(3, 9);
    }
    assert(retained[0] == 1 && retained[1] == 2 && retained[2] == 3);
    const uint8_t same[] {1, 2, 3}, changed[] {1, 2, 4};
    std::vector<std::thread> hosts;
    for (int i = 0; i < 8; ++i) {
        hosts.emplace_back([&] {
            assert(registry.resolve("app:font", same, 3, registration) == originalAlias);
        });
    }
    for (auto& host : hosts) host.join();
    assert(registrations == 1);
    const auto different = registry.resolve("app:font", changed, 3, [](auto&) {});
    const auto anotherModule = registry.resolve("other:font", same, 3, [](auto&) {});
    assert(different != originalAlias && anotherModule != originalAlias && different != anotherModule);
    assert(registry.resolve("app:font", same, 3, registration) == originalAlias);
    bool failed = false;
    try {
        registry.resolve("bad:font", same, 3, [](auto&) { throw std::runtime_error("registration failed"); });
    } catch (const std::runtime_error&) { failed = true; }
    assert(failed);
    int retries = 0;
    registry.resolve("bad:font", same, 3, [&](auto&) { ++retries; });
    assert(retries == 1); // Never reuse an alias whose native registration failed.

    // Real production helper: loading A synchronously applies B. A's bytes
    // must retain the A identity and the superseded outer style must not apply.
    FontApplicationEpoch styleEpoch;
    auto style = parseFont("app:A 20");
    std::string appliedFamily;
    float appliedSize = 0;
    std::vector<std::string> loadedNames;
    auto publish = [&](const FontSpec& snapshot, const std::string& family) {
        appliedFamily = family;
        appliedSize = snapshot.size;
    };
    const auto resolveB = [&](const std::string& family) {
        loadedNames.push_back(family);
        return registry.resolve(family, changed, 3, [](auto& entry) {
            assert(entry.qualifiedName == "app:B");
            assert(entry.bytes == std::vector<uint8_t>({1, 2, 4}));
        });
    };
    std::string aliasB;
    const bool outerApplied = applyResolvedFont(styleEpoch, style,
        [&](const std::string& family) {
            loadedNames.push_back(family);
            style = parseFont("app:B 31");
            assert(applyResolvedFont(styleEpoch, style, resolveB, [] { return true; }, publish));
            aliasB = appliedFamily;
            return registry.resolve(family, same, 3, [](auto& entry) {
                assert(entry.qualifiedName == "app:A");
                assert(entry.bytes == std::vector<uint8_t>({1, 2, 3}));
            });
        }, [] { return true; }, publish);
    assert(!outerApplied && appliedFamily == aliasB && appliedSize == 31);
    assert((loadedNames == std::vector<std::string>{"app:A", "app:B"}));
    assert(registry.resolve("app:A", same, 3, [](auto&) { assert(false); }) != aliasB);
    bool alive = true;
    assert(!applyResolvedFont(styleEpoch, style,
        [&](auto&) { alive = false; return "disposed"; },
        [&] { return alive; }, [&](auto&, auto&) { assert(false); }));

    ImageDecodedState decoded;
    decoded.setCallback(true);
    assert(!decoded.schedule()); // No dimensions on failed/absent assets.
    decoded.setAsset(true);
    const auto oldCallback = decoded.schedule();
    assert(oldCallback && !decoded.schedule());
    decoded.setCallback(true); // Callback replaced before queued delivery.
    const auto newCallback = decoded.schedule();
    assert(newCallback && !decoded.consume(*oldCallback));
    assert(decoded.consume(*newCallback));
    decoded.setCallback(true); // Inline lambda replaced by the callback's render.
    assert(!decoded.schedule()); // No callback/render feedback loop.
    decoded.setAsset(true);
    auto obsoleteAsset = decoded.schedule();
    decoded.setAsset(false);
    assert(obsoleteAsset && !decoded.consume(*obsoleteAsset) && !decoded.schedule());
    decoded.setAsset(true);
    auto unmounted = decoded.schedule();
    decoded.detach();
    assert(unmounted && !decoded.consume(*unmounted));
    auto remounted = decoded.schedule();
    assert(remounted && decoded.consume(*remounted));
    decoded.setAsset(true);
    auto resetCallback = decoded.schedule();
    decoded.setCallback(false);
    assert(resetCallback && !decoded.consume(*resetCallback) && !decoded.schedule());
    decoded.setCallback(true);
    assert(decoded.consume(*decoded.schedule())); // Late listener gets pending asset.

    const auto intrinsic = [](float w, bool exactW, float h, bool exactH) {
        return imageIntrinsicSize(72, 36, w, exactW, h, exactH);
    };
    assert((intrinsic(-1, false, -1, false) == std::array<float, 2>{72, 36}));
    assert((intrinsic(36, false, -1, false) == std::array<float, 2>{36, 18}));
    assert((intrinsic(144, true, -1, false) == std::array<float, 2>{144, 72}));
    assert((intrinsic(-1, false, 72, true) == std::array<float, 2>{144, 72}));
    assert((intrinsic(144, true, 10, false) == std::array<float, 2>{144, 10}));
    assert((intrinsic(12, true, 50, true) == std::array<float, 2>{12, 50}));
    assert((intrinsic(0, false, -1, false) == std::array<float, 2>{0, 0}));
    assert((imageIntrinsicSize(0, 0, 12, true, -1, false) == std::array<float, 2>{12, 0}));

    const auto tint = imageTintMatrix(0x80402010);
    assert(tint[4] == 64 && tint[9] == 32 && tint[14] == 16);
    assert(std::abs(tint[18] - 128.f / 255) < 1e-6);
    for (int i = 0; i < 20; ++i) {
        if (i != 4 && i != 9 && i != 14 && i != 18) assert(tint[i] == 0);
    }
    std::cout << "font parsing/cache concurrency/versioning and image intrinsic/tint tests passed\n";
}
