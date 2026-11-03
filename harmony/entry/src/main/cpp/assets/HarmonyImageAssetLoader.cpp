#include "HarmonyImageAssetLoader.hpp"
#include "HarmonyImageDecodePolicy.hpp"
#include "HarmonyImageDecoder.hpp"
#include "HarmonyImageFilter.hpp"
#include "HarmonyImageRequest.hpp"

#include "valdi/runtime/Interfaces/IRemoteDownloader.hpp"
#include "valdi/runtime/Resources/AssetLoaderCompletion.hpp"

#include <memory>

namespace ValdiHarmony {
namespace {

using ImageResult = Valdi::Result<Valdi::Ref<Valdi::LoadedAsset>>;
using ImageRequest = HarmonyImageRequest<ImageResult>;

class ImageCancelable final : public Valdi::SharedPtrRefCountable, public snap::valdi_core::Cancelable {
public:
    explicit ImageCancelable(std::shared_ptr<ImageRequest> request) : _request(std::move(request)) {}
    void cancel() override {
        auto request = _request; // completion teardown may release this cancelable
        request->cancel();
    }

private:
    std::shared_ptr<ImageRequest> _request;
};

class HarmonyImageAssetLoader final : public Valdi::AssetLoader {
public:
    HarmonyImageAssetLoader(std::vector<Valdi::StringBox> schemes,
                           Valdi::Ref<Valdi::IRemoteDownloader> downloader,
                           Valdi::Ref<Valdi::IDispatchQueue> worker, bool retainEncodedBytes)
        : AssetLoader(std::move(schemes)), _downloader(std::move(downloader)),
          _worker(std::move(worker)), _retainEncodedBytes(retainEncodedBytes) {}

    snap::valdi_core::AssetOutputType getOutputType() const override {
        return snap::valdi_core::AssetOutputType::ImageHarmony;
    }

    Valdi::Result<Valdi::Value> requestPayloadFromURL(const Valdi::StringBox& url) override {
        if (url.isEmpty()) return Valdi::Error("Harmony image URL is empty");
        return Valdi::Value(url);
    }

    Valdi::Shared<snap::valdi_core::Cancelable> loadAsset(
        const Valdi::Value& payload, int32_t width, int32_t height, const Valdi::Value& associatedData,
        const Valdi::Ref<Valdi::AssetLoaderCompletion>& completion) override {
        auto request = std::make_shared<ImageRequest>(
            [completion](const ImageResult& result) {
                if (completion != nullptr) completion->onLoadComplete(result);
            });
        auto cancelable = Valdi::makeShared<ImageCancelable>(request);
        // The queue is required by the factory contract; fail explicitly for a
        // misconfigured host rather than silently using a UI/download thread.
        if (_worker == nullptr) {
            request->complete(Valdi::Error("Harmony image loader requires a worker queue"));
            return cancelable.toShared();
        }
        auto fail = [&](const char* message) {
            if (request->claimDownload()) {
                _worker->async([request, message] { request->complete(Valdi::Error(message)); });
            }
        };
        auto filterResult = snapshotHarmonyImageFilter(associatedData);
        if (_downloader == nullptr) {
            fail("Harmony image loader requires a downloader");
        } else if (!payload.isString() || payload.toStringBox().isEmpty()) {
            fail("Harmony image loader expects a nonempty URL string");
        } else if (!filterResult) {
            if (request->claimDownload()) {
                _worker->async([request, error = filterResult.error()] { request->complete(error); });
            }
        } else if (!ImageDecodePolicy::validPreferredSize(width, height)) {
            fail("Harmony image preferred dimensions must be between 0 and 8192");
        } else {
            // Capture dependencies and state, never the loader's raw this. In
            // particular, downloadItem may complete before returning its handle.
            auto worker = _worker;
            auto downloader = _downloader;
            auto filter = filterResult.moveValue();
            auto handle = downloader->downloadItem(
                payload.toStringBox(),
                [request, worker, width, height, filter, retain = _retainEncodedBytes](
                    const Valdi::Result<Valdi::BytesView>& downloaded) {
                    // All work below uses local copies. Retiring the upstream
                    // handle may destroy its stored callback, including this
                    // closure, before operator() returns.
                    auto state = request;
                    auto queue = worker;
                    const auto preferredWidth = width;
                    const auto preferredHeight = height;
                    const auto retainBytes = retain;
                    const auto filterSnapshot = filter;
                    std::function<void()> retired;
                    if (!state->claimDownload(retired)) return;
                    if (!downloaded) {
                        queue->async([state, error = downloaded.error()] { state->complete(error); });
                        return;
                    }
                    const auto& bytes = downloaded.value();
                    if (bytes.empty() || bytes.data() == nullptr ||
                        bytes.size() > ImageDecodePolicy::kMaxEncodedBytes) {
                        queue->async([state] {
                            state->complete(Valdi::Error("Harmony image encoded data is empty or exceeds 32 MiB"));
                        });
                        return;
                    }
                    if (state->wasCanceled()) return;
                    // Copy before returning from the downloader callback. Even a
                    // BytesView over borrowed or mutable memory cannot outlive its
                    // provider and cause a worker use-after-free / mutation.
                    auto owned = Valdi::makeShared<Valdi::Bytes>();
                    owned->assignData(bytes.data(), bytes.size());
                    if (state->wasCanceled()) return;
                    queue->async([state, owned, preferredWidth, preferredHeight, retainBytes, filterSnapshot] {
                        if (state->wasCanceled()) return;
                        auto result = decodeHarmonyImage(owned, preferredWidth, preferredHeight, retainBytes,
                                                         [state] { return state->wasCanceled(); }, filterSnapshot);
                        state->complete(result);
                    });
                });
            if (handle) request->installUpstreamCancel([handle] { handle->cancel(); });
        }
        return cancelable.toShared();
    }

private:
    Valdi::Ref<Valdi::IRemoteDownloader> _downloader;
    Valdi::Ref<Valdi::IDispatchQueue> _worker;
    bool _retainEncodedBytes;
};

} // namespace

HarmonyImageAssetLoaderFactory::HarmonyImageAssetLoaderFactory(Valdi::Ref<Valdi::IDispatchQueue> worker,
                                                               bool retainEncodedBytes)
    : _worker(std::move(worker)), _retainEncodedBytes(retainEncodedBytes) {}

HarmonyImageAssetLoaderFactory::~HarmonyImageAssetLoaderFactory() = default;

snap::valdi_core::AssetOutputType HarmonyImageAssetLoaderFactory::getOutputType() const {
    return snap::valdi_core::AssetOutputType::ImageHarmony;
}

Valdi::Ref<Valdi::AssetLoader> HarmonyImageAssetLoaderFactory::createAssetLoader(
    const std::vector<Valdi::StringBox>& urlSchemes,
    const Valdi::Ref<Valdi::IRemoteDownloader>& downloader) {
    return Valdi::makeShared<HarmonyImageAssetLoader>(urlSchemes, downloader, _worker, _retainEncodedBytes);
}

} // namespace ValdiHarmony
