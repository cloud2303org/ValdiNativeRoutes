// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/AttachmentControls.swift.
import AVFoundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Options shared by the UIKit attachment pickers and AppUI's chooseImage/chooseFile.
public struct AttachmentPickOptions {
  public var limit: Int
  public var mimeTypes: [String]

  public init(limit: Int = 1, mimeTypes: [String] = ["*/*"]) {
    self.limit = min(max(1, limit), 20)
    self.mimeTypes = mimeTypes.isEmpty ? ["*/*"] : mimeTypes
  }
}

/// A file copied into the app's temporary attachment cache.
public struct AttachmentAsset: Equatable, Sendable {
  public let id: String
  public let uri: String
  public let name: String
  public let mimeType: String
  public let size: Double

  public init(id: String, uri: String, name: String, mimeType: String, size: Double) {
    self.id = id
    self.uri = uri
    self.name = name
    self.mimeType = mimeType
    self.size = size
  }
}

public struct AttachmentSelection: Equatable, Sendable {
  public let canceled: Bool
  public let assets: [AttachmentAsset]

  public init(canceled: Bool, assets: [AttachmentAsset]) {
    self.canceled = canceled
    self.assets = assets
  }
}

/// Clears only files created by the attachment picker. Finish selection, upload and
/// preview operations before calling this; existing cached attachment URIs become invalid.
public enum AttachmentCache {
  public static func clear() throws {
    do {
      try FileManager.default.removeItem(at: directory)
    } catch let error as CocoaError where error.code == .fileNoSuchFile {
      // An empty or never-created cache is already cleared.
    }
  }

  fileprivate static func fileURL(extension fileExtension: String) throws -> URL {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let suffix = fileExtension.isEmpty ? "" : ".\(fileExtension)"
    return directory.appendingPathComponent(UUID().uuidString + suffix, isDirectory: false)
  }

  private static var directory: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
      .appendingPathComponent("attachments", isDirectory: true)
  }
}

public enum AttachmentPickerError: Error, LocalizedError {
  case busy
  case noPresenter
  case invalidSource(String)
  case cameraUnavailable
  case cameraPermissionDenied
  case unsupportedMimeTypes
  case itemLoadFailed(String)
  case fileCopyFailed(String)

  public var code: String {
    switch self {
    case .busy: return "E_PICKER_BUSY"
    case .noPresenter: return "E_NO_PRESENTER"
    case .invalidSource: return "E_INVALID_SOURCE"
    case .cameraUnavailable: return "E_CAMERA_UNAVAILABLE"
    case .cameraPermissionDenied: return "E_CAMERA_PERMISSION"
    case .unsupportedMimeTypes: return "E_UNSUPPORTED_MIME_TYPES"
    case .itemLoadFailed: return "E_ATTACHMENT_LOAD"
    case .fileCopyFailed: return "E_ATTACHMENT_CACHE"
    }
  }

  public var errorDescription: String? {
    switch self {
    case .busy: return "An attachment picker is already active."
    case .noPresenter: return "There is no active view controller to present the picker."
    case let .invalidSource(source): return "Unsupported attachment source: \(source)."
    case .cameraUnavailable: return "This device does not have an available camera."
    case .cameraPermissionDenied: return "Camera access is denied or restricted."
    case .unsupportedMimeTypes: return "The requested MIME types are not supported by this source."
    case let .itemLoadFailed(message): return message
    case let .fileCopyFailed(message): return message
    }
  }
}

/// Presents the system picker from the active app controller and returns files in the
/// selection order. The caller owns any upload or later cache cleanup.
public final class AttachmentPicker: NSObject, PHPickerViewControllerDelegate,
                                    UIImagePickerControllerDelegate, UINavigationControllerDelegate,
                                    UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  public typealias Completion = (Result<AttachmentSelection, AttachmentPickerError>) -> Void

  private weak var presenter: UIViewController?
  private weak var presentedController: UIViewController?
  private var completion: Completion?
  private var options = AttachmentPickOptions()
  private var photoAssets: [AttachmentAsset?] = []
  private var photoFailure: AttachmentPickerError?
  private var photoLoadsRemaining = 0
  private var selectionInProgress = false
  private var requestID: UUID?

  public func pick(source: String, options: AttachmentPickOptions = AttachmentPickOptions(),
                   from presenter: UIViewController?, completion: @escaping Completion) throws {
    guard self.completion == nil else { throw AttachmentPickerError.busy }
    guard let presenter, presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingDismissed, presenter.presentedViewController == nil else {
      throw AttachmentPickerError.noPresenter
    }
    guard ["photos", "camera", "files"].contains(source) else {
      throw AttachmentPickerError.invalidSource(source)
    }

    self.presenter = presenter
    self.options = AttachmentPickOptions(limit: options.limit, mimeTypes: options.mimeTypes)
    self.completion = completion
    requestID = UUID()
    selectionInProgress = false

    switch source {
    case "photos":
      presentPhotos(from: presenter)
    case "camera":
      authorizeAndPresentCamera(from: presenter)
    case "files":
      presentFiles(from: presenter)
    default:
      finish(.failure(.invalidSource(source)))
    }
  }

  public func cancel() {
    guard completion != nil else { return }
    selectionInProgress = true
    dismissPicker { [weak self] in
      self?.finish(.success(AttachmentSelection(canceled: true, assets: [])))
    }
  }

  public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard !selectionInProgress, completion != nil,
          presentationController.presentedViewController === presentedController else { return }
    finish(.success(AttachmentSelection(canceled: true, assets: [])))
  }

  public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    guard presentedController === picker, completion != nil else { return }
    selectionInProgress = true
    guard !results.isEmpty else {
      dismissPicker { [weak self] in
        self?.finish(.success(AttachmentSelection(canceled: true, assets: [])))
      }
      return
    }

    photoAssets = Array(repeating: nil, count: results.count)
    photoFailure = nil
    photoLoadsRemaining = results.count
    dismissPicker()

    guard let requestID else { return }
    for (index, result) in results.enumerated() {
      loadPhoto(result, at: index, requestID: requestID)
    }
  }

  public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    guard presentedController === picker, completion != nil else { return }
    selectionInProgress = true
    dismissPicker { [weak self] in
      self?.finish(.success(AttachmentSelection(canceled: true, assets: [])))
    }
  }

  public func imagePickerController(_ picker: UIImagePickerController,
                                    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    guard presentedController === picker, completion != nil, let requestID else { return }
    selectionInProgress = true
    dismissPicker()
    let imageURL = info[.imageURL] as? URL
    let image = info[.originalImage] as? UIImage
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result: Result<AttachmentSelection, AttachmentPickerError>
      do {
        let asset: AttachmentAsset
        if let imageURL {
          asset = try cacheCopiedFile(imageURL, suggestedName: imageURL.lastPathComponent,
                                      fallbackMimeType: "image/jpeg")
        } else if let image, let data = image.jpegData(compressionQuality: 0.92) {
          asset = try cacheAttachmentData(data, name: "photo.jpg", mimeType: "image/jpeg")
        } else {
          throw AttachmentPickerError.itemLoadFailed("The camera did not return an image.")
        }
        result = .success(AttachmentSelection(canceled: false, assets: [asset]))
      } catch let error as AttachmentPickerError {
        result = .failure(error)
      } catch {
        result = .failure(.fileCopyFailed(error.localizedDescription))
      }
      DispatchQueue.main.async {
        guard let self else {
          if case let .success(selection) = result { removeCachedFiles(selection.assets) }
          return
        }
        self.finish(result, requestID: requestID)
      }
    }
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    guard presentedController === controller, completion != nil else { return }
    selectionInProgress = true
    dismissPicker { [weak self] in
      self?.finish(.success(AttachmentSelection(canceled: true, assets: [])))
    }
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard presentedController === controller, completion != nil, let requestID else { return }
    selectionInProgress = true
    guard !urls.isEmpty else {
      finish(.success(AttachmentSelection(canceled: true, assets: [])))
      return
    }
    let selectedURLs = Array(urls.prefix(options.limit)).map { url in
      (url: url, securityScopeStarted: url.startAccessingSecurityScopedResource())
    }
    dismissPicker()
    let mimeTypes = options.mimeTypes
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      defer {
        for selected in selectedURLs where selected.securityScopeStarted {
          selected.url.stopAccessingSecurityScopedResource()
        }
      }
      var assets: [AttachmentAsset] = []
      var failure: AttachmentPickerError?
      for selected in selectedURLs {
        do {
          let asset = try cacheCopiedFile(selected.url, suggestedName: selected.url.lastPathComponent,
                                          fallbackMimeType: "application/octet-stream", manageSecurityScope: false)
          guard accepts(asset.mimeType, requested: mimeTypes) else {
            removeCachedFiles([asset])
            failure = .unsupportedMimeTypes
            break
          }
          assets.append(asset)
        } catch let error as AttachmentPickerError {
          failure = error
          break
        } catch {
          failure = .fileCopyFailed(error.localizedDescription)
          break
        }
      }
      DispatchQueue.main.async {
        guard let self, self.requestID == requestID else { removeCachedFiles(assets); return }
        if let failure {
          removeCachedFiles(assets)
          self.finish(.failure(failure), requestID: requestID)
        } else {
          self.finish(.success(AttachmentSelection(canceled: false, assets: assets)), requestID: requestID)
        }
      }
    }
  }

  private func presentPhotos(from presenter: UIViewController) {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.filter = .images
    configuration.selectionLimit = options.limit
    configuration.preferredAssetRepresentationMode = .current
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    present(picker, from: presenter)
  }

  private func authorizeAndPresentCamera(from presenter: UIViewController) {
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      finish(.failure(.cameraUnavailable)); return
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      showCamera(from: presenter)
    case .notDetermined:
      let requestID = self.requestID
      AVCaptureDevice.requestAccess(for: .video) { [weak self, weak presenter] granted in
        DispatchQueue.main.async {
          guard let self, let presenter, self.completion != nil, self.requestID == requestID else { return }
          guard granted else { self.finish(.failure(.cameraPermissionDenied)); return }
          guard presenter.viewIfLoaded?.window != nil, !presenter.isBeingDismissed,
                presenter.presentedViewController == nil else {
            self.finish(.failure(.noPresenter)); return
          }
          self.showCamera(from: presenter)
        }
      }
    case .denied, .restricted:
      finish(.failure(.cameraPermissionDenied))
    @unknown default:
      finish(.failure(.cameraPermissionDenied))
    }
  }

  private func showCamera(from presenter: UIViewController) {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.mediaTypes = [UTType.image.identifier]
    picker.delegate = self
    present(picker, from: presenter)
  }

  private func presentFiles(from presenter: UIViewController) {
    let types = documentTypes(for: options.mimeTypes)
    guard !types.isEmpty else { finish(.failure(.unsupportedMimeTypes)); return }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
    picker.allowsMultipleSelection = options.limit > 1
    picker.delegate = self
    present(picker, from: presenter)
  }

  private func present(_ controller: UIViewController, from presenter: UIViewController) {
    guard completion != nil, presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingDismissed, presenter.presentedViewController == nil else {
      finish(.failure(.noPresenter)); return
    }
    presentedController = controller
    presenter.present(controller, animated: true) { [weak self, weak controller] in
      guard let self, let controller else { return }
      controller.presentationController?.delegate = self
    }
  }

  private func dismissPicker(completion afterDismiss: (() -> Void)? = nil) {
    guard let controller = presentedController else { afterDismiss?(); return }
    presentedController = nil
    if controller.presentingViewController != nil {
      controller.dismiss(animated: true, completion: afterDismiss)
    } else {
      afterDismiss?()
    }
  }

  private func loadPhoto(_ result: PHPickerResult, at index: Int, requestID: UUID) {
    let provider = result.itemProvider
    let candidate = provider.registeredTypeIdentifiers.first { identifier in
      guard let type = UTType(identifier) else { return false }
      return type.conforms(to: .image)
    }
    guard let candidate, let type = UTType(candidate) else {
      recordPhotoFailure(.itemLoadFailed("The selected photo does not have a readable image type."), requestID: requestID)
      return
    }
    let mimeType = type.preferredMIMEType ?? "image/jpeg"
    provider.loadFileRepresentation(forTypeIdentifier: candidate) { [weak self] url, error in
      guard let self else { return }
      guard let url else {
        DispatchQueue.main.async {
          self.recordPhotoFailure(.itemLoadFailed(error?.localizedDescription ?? "Could not load a selected photo."), requestID: requestID)
        }
        return
      }
      do {
        // The provider URL is temporary and only valid during this callback.
        let asset = try cacheCopiedFile(url, suggestedName: provider.suggestedName, fallbackMimeType: mimeType)
        DispatchQueue.main.async { self.recordPhoto(asset, at: index, requestID: requestID) }
      } catch {
        DispatchQueue.main.async { self.recordPhotoFailure(.fileCopyFailed(error.localizedDescription), requestID: requestID) }
      }
    }
  }

  private func recordPhoto(_ asset: AttachmentAsset, at index: Int, requestID: UUID) {
    guard self.requestID == requestID, completion != nil, photoAssets.indices.contains(index) else {
      removeCachedFiles([asset])
      return
    }
    photoAssets[index] = asset
    finishPhotoLoad()
  }

  private func recordPhotoFailure(_ error: AttachmentPickerError, requestID: UUID) {
    guard self.requestID == requestID, completion != nil else { return }
    photoFailure = photoFailure ?? error
    finishPhotoLoad()
  }

  private func finishPhotoLoad() {
    photoLoadsRemaining -= 1
    guard photoLoadsRemaining == 0 else { return }
    if let photoFailure {
      finish(.failure(photoFailure))
    } else {
      finish(.success(AttachmentSelection(canceled: false, assets: photoAssets.compactMap { $0 })))
    }
  }

  private func finish(_ result: Result<AttachmentSelection, AttachmentPickerError>, requestID expectedRequestID: UUID? = nil) {
    if let expectedRequestID, requestID != expectedRequestID {
      if case let .success(selection) = result { removeCachedFiles(selection.assets) }
      return
    }
    guard let callback = completion else { return }
    if case let .success(selection) = result, selection.canceled {
      removeCachedFiles(photoAssets.compactMap { $0 })
    } else if case .failure = result {
      removeCachedFiles(photoAssets.compactMap { $0 })
    }
    completion = nil
    presenter = nil
    presentedController = nil
    requestID = nil
    photoAssets = []
    photoFailure = nil
    photoLoadsRemaining = 0
    selectionInProgress = false
    callback(result)
  }
}

private func cacheCopiedFile(_ sourceURL: URL, suggestedName: String?, fallbackMimeType: String,
                             manageSecurityScope: Bool = true) throws -> AttachmentAsset {
  let accessing = manageSecurityScope && sourceURL.startAccessingSecurityScopedResource()
  defer { if accessing { sourceURL.stopAccessingSecurityScopedResource() } }
  let sourceName = suggestedName?.isEmpty == false ? suggestedName! : sourceURL.lastPathComponent
  let sourceType = UTType(filenameExtension: sourceURL.pathExtension)
  let mimeType = sourceType?.preferredMIMEType ?? fallbackMimeType
  let fileExtension = sourceURL.pathExtension.isEmpty ? (sourceType?.preferredFilenameExtension ?? "") : sourceURL.pathExtension
  let destination = try AttachmentCache.fileURL(extension: fileExtension)
  do {
    try FileManager.default.copyItem(at: sourceURL, to: destination)
  } catch {
    try? FileManager.default.removeItem(at: destination)
    throw AttachmentPickerError.fileCopyFailed(error.localizedDescription)
  }
  let values = try destination.resourceValues(forKeys: [.fileSizeKey])
  return AttachmentAsset(id: UUID().uuidString, uri: destination.absoluteString, name: sourceName,
                         mimeType: mimeType, size: Double(values.fileSize ?? 0))
}

private func cacheAttachmentData(_ data: Data, name: String, mimeType: String) throws -> AttachmentAsset {
  let fileExtension = UTType(mimeType: mimeType)?.preferredFilenameExtension ?? "bin"
  let destination = try AttachmentCache.fileURL(extension: fileExtension)
  do {
    try data.write(to: destination, options: .atomic)
  } catch {
    throw AttachmentPickerError.fileCopyFailed(error.localizedDescription)
  }
  return AttachmentAsset(id: UUID().uuidString, uri: destination.absoluteString, name: name,
                         mimeType: mimeType, size: Double(data.count))
}

private func removeCachedFiles(_ assets: [AttachmentAsset]) {
  for asset in assets {
    guard let url = URL(string: asset.uri), url.isFileURL else { continue }
    try? FileManager.default.removeItem(at: url)
  }
}

private func documentTypes(for mimeTypes: [String]) -> [UTType] {
  if mimeTypes.contains(where: { $0 == "*/*" }) { return [.item] }
  var types: [UTType] = []
  for mime in mimeTypes {
    let normalized = mime.lowercased()
    if normalized.hasSuffix("/*") {
      switch normalized {
      case "image/*": types.append(.image)
      case "audio/*": types.append(.audio)
      case "video/*": types.append(.movie)
      case "text/*": types.append(.text)
      case "application/*": types.append(.data)
      default: break
      }
    } else if let type = UTType(mimeType: normalized) {
      types.append(type)
    }
  }
  var seen = Set<String>()
  return types.filter { seen.insert($0.identifier).inserted }
}

private func accepts(_ mimeType: String, requested: [String]) -> Bool {
  requested.isEmpty || requested.contains(where: { mimePattern($0, matches: mimeType) })
}

private func mimePattern(_ pattern: String, matches mimeType: String) -> Bool {
  let pattern = pattern.lowercased()
  let mimeType = mimeType.lowercased()
  if pattern == "*/*" || pattern == mimeType { return true }
  if pattern.hasSuffix("/*") { return mimeType.hasPrefix(String(pattern.dropLast())) }
  return false
}
