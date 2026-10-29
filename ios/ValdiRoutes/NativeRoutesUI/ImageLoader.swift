// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/ImageLoader.swift.
import UIKit

/// The consumer owns image transport and cache policy; NativeRoutesUI owns presentation only.
public enum NativeImageLoading {
  public typealias Cancellation = () -> Void
  public typealias Completion = @MainActor (Result<UIImage, Error>) -> Void
  public typealias Loader = @MainActor (URL, @escaping Completion) -> Cancellation?
}
