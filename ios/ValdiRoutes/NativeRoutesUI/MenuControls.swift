// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/MenuControls.swift (the action sheet; PopupMenuButton left out).
import UIKit

public enum MenuActionIcon: String, Equatable {
  case edit, copy, delete, share, download, camera, photo, file, add, check, close, refresh, more, calendar, location, scan

  fileprivate var symbolName: String {
    switch self {
    case .edit: return "pencil"
    case .copy: return "doc.on.doc"
    case .delete: return "trash"
    case .share: return "square.and.arrow.up"
    case .download: return "arrow.down.to.line"
    case .camera: return "camera"
    case .photo: return "photo"
    case .file: return "doc"
    case .add: return "plus"
    case .check: return "checkmark"
    case .close: return "xmark"
    case .refresh: return "arrow.clockwise"
    case .more: return "ellipsis"
    case .calendar: return "calendar"
    case .location: return "mappin.and.ellipse"
    case .scan: return "qrcode.viewfinder"
    }
  }
}

/// A typed item shared by UIKit callers, Compose callers, and the Fabric bridge.
public struct MenuActionItem: Equatable {
  public let id: String
  public let title: String
  public let disabled: Bool
  public let destructive: Bool
  public let icon: MenuActionIcon?

  public init(id: String, title: String, disabled: Bool = false, destructive: Bool = false, icon: MenuActionIcon? = nil) {
    self.id = id
    self.title = title
    self.disabled = disabled
    self.destructive = destructive
    self.icon = icon
  }
}

/// Presents the standard UIKit action sheet and resolves with the chosen id, or nil on cancel.
@MainActor
public enum NativeActionSheet {
  @discardableResult
  public static func present(
    from presenter: UIViewController,
    title: String? = nil,
    description: String? = nil,
    actions: [MenuActionItem],
    cancelText: String = "取消",
    dark: Bool? = nil
  ) async -> String? {
    return await withCheckedContinuation { continuation in
      _ = present(from: presenter, title: title, description: description, actions: actions, cancelText: cancelText, dark: dark) { selection, _ in continuation.resume(returning: selection) }
    }
  }

  /// Same UIKit sheet with a cancellation handle. Completion follows physical dismissal.
  /// Hosts can supply a page scope; RN hosts already own registration in OverlayProvider.
  @discardableResult
  public static func present(from presenter: UIViewController, title: String? = nil, description: String? = nil,
                             actions: [MenuActionItem], cancelText: String = "取消", dark: Bool? = nil,
                             scope: OverlayScope? = nil,
                             completion: @escaping (String?, OverlayCloseReason) -> Void) -> (OverlayCloseReason) -> Void {
    guard !actions.isEmpty, presenter.isViewLoaded, presenter.view.window != nil,
          presenter.presentedViewController == nil else { completion(nil, .unmount); return { _ in } }
      let controller = UIAlertController(title: title, message: description, preferredStyle: .actionSheet)
      if let dark {
        controller.overrideUserInterfaceStyle = dark ? .dark : .light
      }

      let pending = ActionSheetCompletion(controller: controller, scope: scope, completion: completion)
      for item in actions {
        let style: UIAlertAction.Style = item.destructive ? .destructive : .default
        let action = UIAlertAction(title: item.title, style: style) { _ in pending.dismiss(item.id, reason: .dismissed) }
        action.isEnabled = !item.disabled
        controller.addAction(action)
      }
      controller.addAction(UIAlertAction(title: cancelText, style: .cancel) { _ in pending.dismiss(nil, reason: .dismissed) })
      // UIAlertController owns its presentation delegate. Its cancel action
      // also handles outside taps; keep selection/closure in the action handlers.
      ActionSheetCompletion.retain(pending, on: controller)
      guard pending.register() else { return { _ in } }

      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
        popover.permittedArrowDirections = []
      }
      presenter.present(controller, animated: true)
      return { [weak pending] reason in pending?.dismiss(nil, reason: reason) }
  }
}

@MainActor
private final class ActionSheetCompletion: NSObject {
  private weak var controller: UIAlertController?
  private var completion: ((String?, OverlayCloseReason) -> Void)?
  private var scope: OverlayScope?
  private var overlayID: String?
  private var closing = false
  init(controller: UIAlertController, scope: OverlayScope?, completion: @escaping (String?, OverlayCloseReason) -> Void) {
    self.controller = controller; self.scope = scope; self.completion = completion
  }
  func register() -> Bool {
    guard let scope else { return true }
    let id = UUID().uuidString; overlayID = id
    let accepted = scope.register(id, true) { [weak self] event in
      if event == "close" { self?.dismiss(nil, reason: .dismissed) }
      else if event == "removed" { self?.dismiss(nil, reason: .navigation) }
    }
    if !accepted { overlayID = nil; finish(nil, reason: .navigation) }
    return accepted
  }
  func dismiss(_ selection: String?, reason: OverlayCloseReason) {
    guard !closing, completion != nil else { return }
    closing = true
    if let overlayID { scope?.update(overlayID, true, true) }
    guard let controller, controller.presentingViewController != nil else { finish(selection, reason: reason); return }
    controller.dismiss(animated: reason == .dismissed) { [weak self] in self?.finish(selection, reason: reason) }
  }
  private func finish(_ selection: String?, reason: OverlayCloseReason) {
    guard let completion else { return }
    self.completion = nil
    if let overlayID { scope?.remove(overlayID) }
    overlayID = nil; scope = nil
    completion(selection, reason)
  }

  deinit { completion?(nil, .unmount) }

  static func retain(_ completion: ActionSheetCompletion, on controller: UIViewController) {
    objc_setAssociatedObject(controller, &associationKey, completion, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
  }

  private static var associationKey: UInt8 = 0
}
