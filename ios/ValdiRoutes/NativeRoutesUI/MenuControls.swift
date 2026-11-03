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

/// Presents the shared sheet shell and resolves with the chosen id, or nil on cancel.
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

  /// Same shared sheet with a cancellation handle. Completion follows physical dismissal.
  /// Hosts can supply a page scope; RN hosts already own registration in OverlayProvider.
  @discardableResult
  public static func present(from presenter: UIViewController, title: String? = nil, description: String? = nil,
                             actions: [MenuActionItem], cancelText: String = "取消", dark: Bool? = nil,
                             scope: OverlayScope? = nil,
                             completion: @escaping (String?, OverlayCloseReason) -> Void) -> (OverlayCloseReason) -> Void {
    guard !actions.isEmpty, presenter.isViewLoaded, let window = presenter.view.window,
          presenter.presentedViewController == nil else { completion(nil, .unmount); return { _ in } }
    let layer = ActionSheetLayer(title: title, description: description, actions: actions,
                                 cancelText: cancelText, dark: dark, scope: scope, completion: completion)
    layer.frame = window.bounds
    window.addSubview(layer)
    layer.layoutIfNeeded()
    layer.sheet.open = true
    return { [weak layer] reason in layer?.dismiss(nil, reason: reason) }
  }
}

/// Owns the presentation until the shell physically closes, even if the caller
/// discards its cancellation handle. The window retains this layer; child callbacks
/// are weak so removal also releases the sheet and any retained completion.
@MainActor
private final class ActionSheetLayer: UIView {
  let sheet = ScrollBottomSheet()
  private var completion: ((String?, OverlayCloseReason) -> Void)?
  private var selection: String?
  private var requestedReason: OverlayCloseReason?
  private var closing = false

  init(title: String?, description: String?, actions: [MenuActionItem], cancelText: String,
       dark: Bool?, scope: OverlayScope?, completion: @escaping (String?, OverlayCloseReason) -> Void) {
    self.completion = completion
    super.init(frame: .zero)
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    if let dark { overrideUserInterfaceStyle = dark ? .dark : .light }
    // BottomSheet remains the sole owner of registration and the closing flag.
    // A standalone caller needs a local scope, without a second overlay registry.
    OverlayScope(register: { [weak self] id, dismissible, receive in
      guard let self else { return false }
      if let scope {
        return scope.register(id, dismissible) { [weak self] event in
          if event == "top", let self { self.superview?.bringSubviewToFront(self) }
          receive(event)
        }
      }
      receive("top")
      return true
    }, update: { id, dismissible, closing in
      scope?.update(id, dismissible, closing)
    }, remove: { id in
      scope?.remove(id)
    }).install(on: self)

    sheet.title = title
    sheet.message = description
    sheet.content.spacing = 0
    for item in actions {
      var configuration = UIButton.Configuration.plain()
      configuration.title = item.title
      configuration.image = item.icon.flatMap { UIImage(systemName: $0.symbolName) }
      configuration.imagePadding = UiDesign.space.md
      configuration.contentInsets = NSDirectionalEdgeInsets(top: UiDesign.space.md, leading: 0,
                                                             bottom: UiDesign.space.md, trailing: 0)
      configuration.baseForegroundColor = item.destructive ? UiTheme.danger : UiTheme.text
      configuration.titleLineBreakMode = .byWordWrapping
      let button = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in
        guard !item.disabled, let self, self.sheet.open, self.sheet.isUserInteractionEnabled else { return }
        self.dismiss(item.id, reason: .dismissed)
      })
      button.contentHorizontalAlignment = .leading
      button.isEnabled = !item.disabled
      button.accessibilityIdentifier = "action-sheet-item-" + item.id
      sheet.content.addArrangedSubview(button)
    }
    sheet.footer = ActionButton(title: cancelText, tone: .cancel, action: { [weak self] in
      self?.dismiss(nil, reason: .dismissed)
    })
    sheet.onOpenChange = { [weak self] open, _ in
      if !open { self?.dismiss(nil, reason: .dismissed) }
    }
    sheet.onClosed = { [weak self] reason in self?.finish(reason) }
    addSubview(sheet)
    NSLayoutConstraint.activate([
      sheet.topAnchor.constraint(equalTo: topAnchor), sheet.bottomAnchor.constraint(equalTo: bottomAnchor),
      sheet.leadingAnchor.constraint(equalTo: leadingAnchor), sheet.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  func dismiss(_ selection: String?, reason: OverlayCloseReason) {
    guard completion != nil else { return }
    if reason == .dismissed {
      guard !closing else { return }
      closing = true
      self.selection = selection
      requestedReason = reason
      sheet.open = false
    } else {
      // Force removal supersedes any selected row whose exit is still in flight.
      closing = true
      self.selection = nil
      requestedReason = reason
      removeFromSuperview() // BottomSheet reports .unmount after detaching.
    }
  }

  private func finish(_ reason: OverlayCloseReason) {
    guard let completion else { return }
    self.completion = nil
    // A scope-driven navigation/removal supersedes an ordinary pending selection.
    let effectiveReason: OverlayCloseReason
    if let requestedReason, requestedReason != .dismissed { effectiveReason = requestedReason }
    else { effectiveReason = reason }
    let result = effectiveReason == .dismissed ? selection : nil
    sheet.onClosed = { _ in }
    sheet.onOpenChange = { _, _ in }
    removeFromSuperview()
    completion(result, effectiveReason)
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  deinit { completion?(nil, .unmount) }

  required init?(coder: NSCoder) { fatalError("Use NativeActionSheet.present") }
}
