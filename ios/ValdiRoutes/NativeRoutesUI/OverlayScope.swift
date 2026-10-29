// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/OverlayScope.swift.
import UIKit
import ObjectiveC

/// App-supplied page adapter; this package has no navigation or RN dependency.
@MainActor
public final class OverlayScope {
  let register: (String, Bool, @escaping (String) -> Void) -> Bool
  let update: (String, Bool, Bool) -> Void
  let remove: (String) -> Void
  public init(register: @escaping (String, Bool, @escaping (String) -> Void) -> Bool,
              update: @escaping (String, Bool, Bool) -> Void, remove: @escaping (String) -> Void) {
    self.register = register; self.update = update; self.remove = remove
  }
  private static var key: UInt8 = 0
  public func install(on page: UIView) { objc_setAssociatedObject(page, &Self.key, self, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
  static func find(from view: UIView) -> OverlayScope? {
    var current: UIView? = view
    while let node = current {
      if let scope = objc_getAssociatedObject(node, &key) as? OverlayScope { return scope }
      current = node.superview
    }
    return nil
  }
}

/// Same reasons as the RN package. A sheet reports drags and scrim taps as `gesture`.
public enum SheetDismissReason { case gesture, back, navigation, closeButton, cancel, confirm }
public enum DialogDismissReason { case backdrop, back, navigation, cancel, confirm }
public enum OverlayCloseReason { case dismissed, navigation, unmount }

/// Registration and open/close cycle shared by `BottomSheet` and `Dialog`.
/// The registration is retained until the exit animation completes.
@MainActor
final class OverlayPresenter<Reason> {
  private unowned let view: UIView
  private let back: Reason, navigation: Reason
  private var scope: OverlayScope?
  private var id: String?
  private var generation = 0
  private(set) var open = false
  private(set) var top = false
  var dismissible = true { didSet { update() } }
  var onOpenChange: (Bool, Reason) -> Void = { _, _ in }
  var onClosed: (OverlayCloseReason) -> Void = { _ in }
  /// Animates the view to `open`; calls the completion once a close has fully finished.
  var render: (_ animated: Bool, _ closed: @escaping () -> Void) -> Void = { _, closed in closed() }
  var coveredChanged: () -> Void = {}
  var interactive: Bool { id != nil && top && open }

  init(view: UIView, back: Reason, navigation: Reason) { self.view = view; self.back = back; self.navigation = navigation }

  func setOpen(_ value: Bool) {
    guard value != open else { return }
    open = value
    if open { view.window?.endEditing(true) }
    if open && id == nil && !register() {
      open = false; onOpenChange(false, navigation); onClosed(.navigation); return
    }
    update()
    generation += 1
    let cycle = generation
    render(view.window != nil) { [weak self] in
      guard let self, cycle == self.generation, !self.open, let id = self.id else { return }
      self.id = nil; self.scope?.remove(id); self.scope = nil
      self.onClosed(.dismissed)
    }
  }
  /// User close request; ignored while covered, closing or not dismissible.
  func requestClose(_ reason: Reason) {
    guard interactive, dismissible else { return }
    onOpenChange(false, reason)
  }
  /// Navigation or removal from the window ends the presentation without animation.
  func forceRemove(_ reason: OverlayCloseReason) {
    guard let id else { return }
    generation += 1
    self.id = nil; open = false
    if reason != .navigation { scope?.remove(id) }
    scope = nil
    render(false) {}
    if reason == .navigation { onOpenChange(false, navigation) }
    onClosed(reason)
  }

  private func update() { if let id { scope?.update(id, dismissible, !open) } }
  private func register() -> Bool {
    guard let scope = OverlayScope.find(from: view) else { assertionFailure("Install OverlayScope on the page view"); return false }
    let id = UUID().uuidString
    self.scope = scope; self.id = id; top = false
    let accepted = scope.register(id, dismissible) { [weak self] event in
      guard let self, self.id == id else { return }
      switch event {
      case "top": self.top = true; self.view.superview?.bringSubviewToFront(self.view); self.coveredChanged()
      case "covered": self.top = false; self.coveredChanged()
      case "close": self.requestClose(self.back)
      case "removed": self.forceRemove(.navigation)
      default: break
      }
    }
    if !accepted { self.id = nil; self.scope = nil }
    return accepted
  }
}

/// Centered label with the RN font size and line height.
@MainActor
final class OverlayLabel: UILabel {
  private let lineHeight: CGFloat
  var value: String? { didSet { apply() } }
  init(size: CGFloat, weight: UIFont.Weight = .regular, lineHeight: CGFloat, color: UIColor) {
    self.lineHeight = lineHeight
    super.init(frame: .zero)
    font = .systemFont(ofSize: size, weight: weight)
    textColor = color
    numberOfLines = 0
    textAlignment = .center
    translatesAutoresizingMaskIntoConstraints = false
  }
  private func apply() {
    guard let value, let font else { attributedText = nil; return }
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = lineHeight; paragraph.maximumLineHeight = lineHeight
    paragraph.alignment = textAlignment
    attributedText = NSAttributedString(string: value, attributes: [
      .font: font, .paragraphStyle: paragraph, .foregroundColor: textColor ?? UiTheme.text,
      .baselineOffset: (lineHeight - font.lineHeight) / 4,
    ])
  }
  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(size:weight:lineHeight:color:)") }
}
