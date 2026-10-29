// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/CodeScanner.swift.
import UIKit

public struct ScanCodeResult {
  public let result: String
  public let scanType: String
}

public enum ScanCodeError: String, Error, LocalizedError {
  case cancel = "cancel"
  case busy = "scanner already open"
  case noPresenter = "no foreground view controller"
  public var errorDescription: String? { rawValue }
}

/// A native full-screen scanner, shared by Swift callers and the RN API.
@MainActor
public final class CodeScanner {
  private static var active: CodeScanner?
  private var controller: ScanCodeController?
  private var completion: ((Result<ScanCodeResult, ScanCodeError>) -> Void)?
  private var finishing = false

  public init() {}

  public func scanCode(from presenter: UIViewController,
                       completion: @escaping (Result<ScanCodeResult, ScanCodeError>) -> Void) {
    guard Self.active == nil else { completion(.failure(.busy)); return }
    guard presenter.viewIfLoaded?.window != nil, !presenter.isBeingDismissed,
          presenter.presentedViewController == nil else { completion(.failure(.noPresenter)); return }
    Self.active = self
    self.completion = completion
    finishing = false
    let controller = ScanCodeController()
    self.controller = controller
    controller.modalPresentationStyle = .fullScreen
    controller.scanner.onBack = { [weak self] in self?.cancel() }
    controller.scanner.onScan = { [weak self] value in
      let formats = ["qr": "QR_CODE", "ean13": "EAN_13", "ean8": "EAN_8",
                     "code128": "CODE_128", "code39": "CODE_39", "upc_a": "UPC_A"]
      guard let type = formats[value.type] else { return }
      self?.finish(.success(ScanCodeResult(result: value.value, scanType: type)))
    }
    controller.onDismiss = { [weak self] in self?.cancel() }
    presenter.present(controller, animated: true)
  }

  public func cancel() { finish(.failure(.cancel)) }

  private func finish(_ result: Result<ScanCodeResult, ScanCodeError>) {
    guard completion != nil, !finishing else { return }
    finishing = true
    controller?.scanner.active = false
    controller?.onDismiss = nil
    let complete = {
      let callback = self.completion
      self.completion = nil
      self.controller = nil
      if Self.active === self { Self.active = nil }
      callback?(result)
    }
    if let controller, controller.presentingViewController != nil {
      controller.dismiss(animated: true, completion: complete)
    } else { complete() }
  }
}

@MainActor
private final class ScanCodeController: UIViewController {
  let scanner = ScannerView(frame: .zero)
  var onDismiss: (() -> Void)?
  private var previousStatusBarStyle: UIStatusBarStyle?
  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
  override func loadView() { view = scanner }
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    // ScannerView already reads its safeAreaInsets. Reassigning its inset props
    // during this root view's layout would schedule another layout indefinitely.
    if Bundle.main.object(forInfoDictionaryKey: "UIViewControllerBasedStatusBarAppearance") as? Bool == false {
      previousStatusBarStyle = UIApplication.shared.statusBarStyle
      UIApplication.shared.statusBarStyle = .lightContent
    }
    scanner.active = true
  }
  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    scanner.active = false
    if let previousStatusBarStyle { UIApplication.shared.statusBarStyle = previousStatusBarStyle }
    previousStatusBarStyle = nil
  }
  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if presentingViewController == nil { onDismiss?() }
  }
}
