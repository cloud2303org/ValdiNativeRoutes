#include "valdi_modules/app_vision/app_vision.hpp"
#include "valdi/runtime/Runtime.hpp"
#include "valdi/runtime/Interfaces/IDiskCache.hpp"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"
#include "valdi_core/cpp/Threading/DispatchQueue.hpp"
#include "valdi_core/cpp/Utils/Bytes.hpp"
#include "valdi_core/cpp/Utils/Exception.hpp"
#include "utils/encoding/Base64Utils.hpp"

#ifdef VALDI_VISION_ENABLED
#include "VisionCore.hpp"
#endif

#include <atomic>
#include <cstdlib>
#include <exception>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace snap::valdi_modules::app_vision {
namespace {

using Valdi::Path;
using Valdi::Ref;
using Valdi::StringBox;

struct VisionState {
    Ref<Valdi::IDiskCache> cache;
    std::mutex mutex;
    std::vector<Path> previousImages;
    bool cleanedCache = false;

    explicit VisionState(Ref<Valdi::IDiskCache> cache) : cache(std::move(cache)) {}
};

std::atomic<uint64_t> nextImageId{0};

#ifdef VALDI_VISION_ENABLED
StringBox storeImage(VisionState& state, const std::string& dataUrl, const Path& path) {
    constexpr std::string_view prefix = "data:image/png;base64,";
    if (dataUrl.compare(0, prefix.size(), prefix) != 0)
        throw Valdi::Exception("VisionCore returned an unexpected image");
    auto decoded = snap::utils::encoding::base64ToBinary(std::string_view(dataUrl).substr(prefix.size()));
    if (decoded.empty()) throw Valdi::Exception("VisionCore returned an invalid PNG");
    auto bytes = Valdi::makeShared<Valdi::Bytes>();
    bytes->assignVec(std::move(decoded));
    auto stored = state.cache->store(path, Valdi::BytesView(bytes));
    if (!stored) throw Valdi::Exception(stored.moveError());
    return state.cache->getAbsoluteURL(path);
}

Ref<VisionDemoResult> runVision(VisionState& state) {
#ifdef __ANDROID__
    // Static OpenCV uses its builtin pool, without looking for APK-side plugins.
    static const bool configured = [] { setenv("OPENCV_PARALLEL_BACKEND", "builtin", 0); return true; }();
    (void)configured;
#endif
    auto native = native_routes::vision::runDemo();
    if (!state.cleanedCache) {
        for (const auto& previous : state.cache->list(state.cache->getRootPath())) state.cache->remove(previous);
        state.cleanedCache = true;
    }
    const auto name = std::string("run-") + std::to_string(++nextImageId);
    const Path input(name + "-input.png");
    const Path edges(name + "-edges.png");
    StringBox inputUrl;
    StringBox edgeUrl;
    try {
        inputUrl = storeImage(state, native.inputImageDataUrl, input);
        edgeUrl = storeImage(state, native.edgeImageDataUrl, edges);
    } catch (...) {
        state.cache->remove(input);
        state.cache->remove(edges);
        throw;
    }
    for (const auto& previous : state.previousImages) state.cache->remove(previous);
    state.previousImages = {input, edges};
    std::vector<VisionPrediction> predictions;
    predictions.reserve(native.predictions.size());
    for (const auto& prediction : native.predictions)
        predictions.emplace_back(StringBox::fromString(prediction.label), prediction.score);
    return Valdi::makeShared<VisionDemoResult>(
        StringBox::fromString(native.opencvVersion), StringBox::fromString(native.ncnnVersion),
        StringBox::fromString(native.modelName), StringBox::fromString(native.modelDescription),
        native.processingMs, native.inferenceMs, native.width, native.height, native.inferenceWidth,
        native.inferenceHeight, native.edgePixelCount, inputUrl, edgeUrl, predictions);
}
#endif

class VisionHostImpl final : public VisionHost {
public:
    VisionHostImpl() {
        auto runtime = Valdi::Runtime::currentRuntime();
        if (runtime == nullptr) throw Valdi::Exception("Vision requires an active Valdi runtime");
        _worker = runtime->getWorkerQueue();
        auto cache = runtime->getDiskCache()->scopedCache(Path("vision"), false);
        if (cache == nullptr) throw Valdi::Exception("Vision cache is unavailable");
        _state = std::make_shared<VisionState>(std::move(cache));
    }

    void runDemo(RunDemoDoneFn done) final {
        // Retain only the cache/state and generated callback, not a Runtime or JS context.
        _worker->async([state = _state, done = std::move(done)]() {
            Ref<VisionDemoResult> result;
            auto error = StringBox::fromCString("");
            try {
#ifdef VALDI_VISION_ENABLED
                std::lock_guard<std::mutex> lock(state->mutex);
                result = runVision(*state);
#else
                throw Valdi::Exception("Vision supports Android/iOS arm64 only");
#endif
            } catch (const std::exception& exception) {
                error = StringBox::fromCString(exception.what());
            } catch (...) {
                error = StringBox::fromCString("VisionCore failed");
            }
            // The generated Function marshals the callback back to its JS runtime.
            // Invoke outside the state lock so reentrant calls cannot deadlock.
            done(std::move(error), std::move(result));
        });
    }

private:
    Ref<Valdi::IDispatchQueue> _worker;
    std::shared_ptr<VisionState> _state;
};

class VisionModuleImpl final : public VisionModule {
public:
    Ref<VisionHost> getHost() final {
        if (_host == nullptr) _host = Valdi::makeShared<VisionHostImpl>();
        return _host;
    }

private:
    Ref<VisionHost> _host;
};

class VisionModuleFactoryImpl final : public VisionModuleFactory {
protected:
    Ref<VisionModule> onLoadModule() final { return Valdi::makeShared<VisionModuleImpl>(); }
};

auto registerVision = Valdi::RegisterModuleFactory::registerTyped<VisionModuleFactoryImpl>();

} // namespace
} // namespace snap::valdi_modules::app_vision
