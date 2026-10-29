import SDWebImage
import UIKit
import ValdiRuntime

/// The image pipeline, after ExpoNativeRoutes' AppImages: one SDWebImage manager with its own memory and disk cache,
/// used by ImagePreview and, through AppImageLoader, by every Valdi <image>.
@MainActor
enum AppImages {
    nonisolated static let manager: SDWebImageManager = {
        let cacheConfiguration = SDImageCacheConfig()
        cacheConfiguration.maxMemoryCost = 32 * 1024 * 1024
        cacheConfiguration.maxDiskSize = 128 * 1024 * 1024
        cacheConfiguration.maxDiskAge = 7 * 24 * 60 * 60
        let cache = SDImageCache(namespace: "native-images", diskCacheDirectory: nil, config: cacheConfiguration)
        // SDImageCache is the only HTTP cache; URLCache would keep a second copy.
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.urlCache = nil
        sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let downloaderConfiguration = SDWebImageDownloaderConfig()
        downloaderConfiguration.sessionConfiguration = sessionConfiguration
        let downloader = SDWebImageDownloader(config: downloaderConfiguration)
        return SDWebImageManager(cache: cache, loader: downloader)
    }()

    static func load(_ url: URL, completion: @escaping NativeImageLoading.Completion) -> NativeImageLoading.Cancellation? {
        // Picked attachments are local files; caching them again would only duplicate them.
        if url.isFileURL {
            let task = DispatchWorkItem {
                let image = UIImage(contentsOfFile: url.path)?.preparingForDisplay()
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { completion(image.map { .success($0) } ?? .failure(invalidImageError())) }
                }
            }
            DispatchQueue.global(qos: .userInitiated).async(execute: task)
            return { task.cancel() }
        }
        let operation = manager.loadImage(with: url, options: [.retryFailed], progress: nil) { image, _, error, _, finished, _ in
            guard finished else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { completion(image.map { .success($0) } ?? .failure(error ?? invalidImageError())) }
            }
        }
        return operation.map { operation in { operation.cancel() } }
    }

    nonisolated static func invalidImageError() -> NSError {
        NSError(domain: "AppImages", code: 1, userInfo: [NSLocalizedDescriptionKey: "图片无法显示"])
    }
}

/// Remote <image> sources through AppImages' SDWebImage manager. Registered after Valdi's default loader, so it wins for
/// http(s); file:// and valdi-res:// stay with the default loader, which reads them directly.
final class AppImageLoader: NSObject, SCValdiImageLoader {
    func supportedURLSchemes() -> [String] { ["http", "https"] }

    func requestPayload(with imageURL: URL, error: NSErrorPointer) -> Any { imageURL }

    func loadImage(withRequestPayload requestPayload: Any, parameters: SCValdiAssetRequestParameters,
                   completion: @escaping SCValdiImageLoaderCompletion) -> SCValdiCancelable {
        let task = AppImageLoadTask()
        guard let url = requestPayload as? URL else {
            completion(nil, AppImages.invalidImageError())
            return task
        }
        task.operation = AppImages.manager.loadImage(with: url, options: [.retryFailed], progress: nil) {
            image, _, error, _, finished, _ in
            guard finished else { return }
            if let image, let valdiImage = ValdiImageBridge.image(with: image) { completion(valdiImage, nil) }
            else { completion(nil, error ?? AppImages.invalidImageError()) }
        }
        return task
    }
}

private final class AppImageLoadTask: NSObject, SCValdiCancelable {
    var operation: SDWebImageCombinedOperation?

    func cancel() { operation?.cancel() }
}
