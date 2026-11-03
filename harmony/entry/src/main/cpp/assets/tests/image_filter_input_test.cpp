// Exercises the production pre-Drawing dispatcher and numeric formatter.
// Metadata below is deliberate synthetic input, NOT observed SDK26 values.
#include "../HarmonyImageFilterInput.hpp"
#include <cassert>
#include <iostream>
#include <memory>
#include <variant>
#include <vector>

namespace {
using namespace ValdiHarmony;

struct Info {
    uint32_t width = 13, height = 9, rowStride = 64, allocationBytes = 576;
    int32_t pixelFormat = 3, alphaType = 0;
};
struct Asset {
    Info info;
    std::shared_ptr<int> pixelmap;
    std::vector<uint8_t> retainedBytes;
    const Info& getInfo() const { return info; }
};
using Source = std::shared_ptr<const Asset>;
using Result = std::variant<Source, std::string>;

Source makeSource(Info info = {}) {
    return std::make_shared<Asset>(Asset{info, std::make_shared<int>(17), {1, 2, 3}});
}
Result error(const char* message) { return std::string(message); }

void identityNeverQueriesDrawingMetadata() {
    // An identity must preserve the already-bounded source even if a renderer
    // would reject its alpha/format metadata. Decoding validates RGBA upstream;
    // the identity dispatcher itself makes no Drawing format/alpha assumption.
    for (auto alpha : {0, -1, 4, INT32_MAX}) {
        for (auto format : {3, -1, INT32_MAX}) {
            Info info;
            info.alphaType = alpha;
            info.pixelFormat = format;
            auto source = makeSource(info);
            int sdkQueries = 0;
            auto rejectRendering = [&]() -> Result {
                ++sdkQueries;
                return "unsupported effective filter metadata";
            };
            auto result = dispatchHarmonyImageFilter<Result>(
                source, {}, 6, [] { return false; }, rejectRendering, error);
            assert(std::holds_alternative<Source>(result));
            const auto& retained = std::get<Source>(result);
            assert(retained.get() == source.get() && retained->pixelmap == source->pixelmap);
            assert(retained->retainedBytes == source->retainedBytes);
            assert(retained->info.alphaType == alpha && retained->info.pixelFormat == format);
            assert(sdkQueries == 0);
        }
    }
}

void effectiveFiltersStillValidateThroughRenderer() {
    auto source = makeSource();
    for (bool blurOnly : {false, true}) {
        HarmonyImageFilterSpec spec;
        if (blurOnly) spec.sigma = 2;
        else spec.matrix[4] = 0.25f;
        int sdkQueries = 0;
        auto result = dispatchHarmonyImageFilter<Result>(
            source, spec, 6, [] { return false; }, [&]() -> Result {
                ++sdkQueries;
                return "unsupported effective filter source (" +
                       describeHarmonyImagePixelmap(source->info) + ")";
            }, error);
        assert(sdkQueries == 1 && std::holds_alternative<std::string>(result));
        const auto& message = std::get<std::string>(result);
        assert(message.find("pixelFormat=3, alphaType=0, width=13, height=9, "
                            "rowStride=64, allocationBytes=576") != std::string::npos);
    }
    Info numeric;
    numeric.pixelFormat = -23;
    numeric.alphaType = 123456;
    assert(describeHarmonyImagePixelmap(numeric) ==
           "pixelFormat=-23, alphaType=123456, width=13, height=9, rowStride=64, allocationBytes=576");
}

void identityStillRejectsInvalidLayoutAndMemory() {
    std::vector<Info> invalid(5);
    invalid[0].width = 0;
    invalid[1].height = UINT32_MAX;
    invalid[2].rowStride = 51;
    invalid[3].allocationBytes = 575;
    invalid[4].allocationBytes = uint32_t(ImageDecodePolicy::kMaxDecodedBytes + 1);
    int sdkQueries = 0;
    auto render = [&]() -> Result { ++sdkQueries; return makeSource(); };
    for (const auto& info : invalid) {
        auto source = makeSource(info);
        auto result = dispatchHarmonyImageFilter<Result>(
            source, {}, 0, [] { return false; }, render, error);
        assert(std::holds_alternative<std::string>(result));
        assert(std::get<std::string>(result).find("decoded layout") != std::string::npos);
    }
    auto source = makeSource();
    auto result = dispatchHarmonyImageFilter<Result>(
        source, {}, UINT64_MAX, [] { return false; }, render, error);
    assert(std::get<std::string>(result).find("working set") != std::string::npos);
    assert(sdkQueries == 0);
}

void canceledSourceIsNotPublishedAndOwnershipIsPreserved() {
    auto source = makeSource();
    std::weak_ptr<const Asset> weak = source;
    int sdkQueries = 0;
    auto render = [&]() -> Result { ++sdkQueries; return source; };
    auto canceled = dispatchHarmonyImageFilter<Result>(
        source, {}, 6, [] { return true; }, render, error);
    assert(std::get<std::string>(canceled).find("canceled") != std::string::npos);
    assert(sdkQueries == 0);
    {
        auto result = dispatchHarmonyImageFilter<Result>(
            source, {}, 6, [] { return false; }, render, error);
        source.reset();
        assert(!weak.expired() && *std::get<Source>(result)->pixelmap == 17);
    }
    assert(weak.expired());
}
} // namespace

int main() {
    identityNeverQueriesDrawingMetadata();
    effectiveFiltersStillValidateThroughRenderer();
    identityStillRejectsInvalidLayoutAndMemory();
    canceledSourceIsNotPublishedAndOwnershipIsPreserved();
    std::cout << "Production image filter input dispatch: 4 groups passed\n";
}
