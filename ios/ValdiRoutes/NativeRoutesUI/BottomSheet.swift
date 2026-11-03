// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/BottomSheet.swift.
import UIKit

fileprivate enum SheetLayout { case content, scroll, list }

/// Page-scoped sheet matching the RN `BottomSheet`. Add it over the page view, pinned to all edges.
/// Drag down or tap the scrim requests a close with `.gesture`.
@MainActor
public class BottomSheet: UIView {
  public let content: UIStackView = SheetContentStackView()
  public var title: String? { get { header.title } set { header.title = newValue; updateHeaderVisibility() } }
  public var message: String? { get { header.message } set { header.message = newValue; updateHeaderVisibility() } }
  public var iconName: String? { get { header.iconName } set { header.iconName = newValue } }
  /// Pinned below the body and kept above the keyboard, e.g. `PopupActionButtons`.
  /// Custom footer, taking precedence over the standard buttons.
  public var footer: UIView? { get { actions.footer } set { actions.footer = newValue } }
  /// Overrides the default confirm close request. When supplied, the caller changes open after success.
  public var onConfirm: (() -> Void)? { get { actions.onConfirm } set { actions.onConfirm = newValue } }
  public var onCancel: (() -> Void)? { get { actions.onCancel } set { actions.onCancel = newValue } }
  public var showCancel: Bool { get { actions.showCancel } set { actions.showCancel = newValue } }
  public var confirmText: String { get { actions.confirmText } set { actions.confirmText = newValue } }
  public var cancelText: String { get { actions.cancelText } set { actions.cancelText = newValue } }
  public var confirmDisabled: Bool { get { actions.confirmDisabled } set { actions.confirmDisabled = newValue } }
  public var confirmTone: ConfirmTone { get { actions.confirmTone } set { actions.confirmTone = newValue } }
  private var footerView: UIView?
  private lazy var actions = OverlayActions(
    defaultConfirm: { [weak self] in self?.onOpenChange(false, .confirm) },
    defaultCancel: { [weak self] in self?.onOpenChange(false, .cancel) },
    changed: { [weak self] view in
      guard let self, self.footerView !== view else { return }
      let old = self.footerView
      self.footerView = view
      self.replaceFooter(old)
    })
  public var onOpenChange: (Bool, SheetDismissReason) -> Void {
    get { presenter.onOpenChange } set { presenter.onOpenChange = newValue }
  }
  public var onClosed: (OverlayCloseReason) -> Void { get { presenter.onClosed } set { presenter.onClosed = newValue } }
  public var dismissible: Bool {
    get { presenter.dismissible }
    set { presenter.dismissible = newValue; shell.dismissible = newValue }
  }
  public var open: Bool { get { presenter.open } set { presenter.setOpen(newValue) } }

  public var showHandle = true { didSet { header.showHandle = showHandle; updateHeaderVisibility() } }
  public var edgeToEdge = false { didSet { header.edgeToEdge = edgeToEdge; applyContentInsets(); setNeedsLayout() } }
  public var showCloseButton = false { didSet { closeButton.isHidden = !showCloseButton } }
  private let closeButton = UIButton(type: .system)

  private let layout: SheetLayout
  private lazy var presenter = OverlayPresenter<SheetDismissReason>(view: self, back: .back, navigation: .navigation)
  private let shell = SheetHostView()
  private var closeCompletion: (() -> Void)?
  private let panel = SheetContentView()
  private let header = SheetHeaderView()
  private let scroll = UIScrollView()
  private let footerSlot = UIView()
  private var footerInsets: [NSLayoutConstraint] = []
  private var columnBottom: NSLayoutConstraint!
  private var heightLimit: NSLayoutConstraint!
  private var keyboardHeight: CGFloat = 0

  public convenience init(onOpenChange: @escaping (Bool, SheetDismissReason) -> Void = { _, _ in }) {
    self.init(layout: .content, onOpenChange: onOpenChange)
  }

  fileprivate init(layout: SheetLayout, onOpenChange: @escaping (Bool, SheetDismissReason) -> Void = { _, _ in }) {
    self.layout = layout
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    isHidden = true
    presenter.onOpenChange = onOpenChange
    presenter.render = { [weak self] animated, closed in self?.render(animated: animated, closed: closed) }
    presenter.coveredChanged = { [weak self] in self?.coveredChanged() }

    // SheetHostView owns the only surface, scrim, drag recognizer and spring.
    // The existing header owns the optional handle so its public spacing stays intact.
    shell.showsHandle = false
    shell.presentsAutomatically = false
    shell.surfaceColor = UiTheme.surface
    shell.scrimColor = UiTheme.scrim
    shell.cornerRadius = UiDesign.radius.sheet
    shell.onCloseRequested = { [weak self] in self?.presenter.requestClose(.gesture) }
    shell.onClosed = { [weak self] _ in
      guard let self, !self.presenter.open else { return }
      self.isHidden = true
      let completion = self.closeCompletion
      self.closeCompletion = nil
      completion?()
    }
    addSubview(shell)
    shell.setContent(panel)
    panel.onLayout = { [weak self] in
      guard let self, self.bounds.width > 0, self.heightLimit != nil else { return }
      // Intrinsic content changes can lay out the column without laying out the
      // full-screen owner. Refit its detent on the next owner layout in that case.
      if abs(self.fittedHeight - self.shell.openHeight) > 0.5 { self.setNeedsLayout() }
    }
    // A scroll viewport can keep its frame while its content grows. That only
    // lays out the inner stack, so observing the outer panel alone misses it.
    (content as? SheetContentStackView)?.onLayout = panel.onLayout

    content.axis = .vertical
    content.translatesAutoresizingMaskIntoConstraints = false
    let padded = layout != .list
    content.spacing = padded ? UiDesign.space.lg : 0
    content.isLayoutMarginsRelativeArrangement = true
    // applyMetrics owns safe-area clearance once; inherited margins would add it again.
    content.insetsLayoutMarginsFromSafeArea = false
    content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: padded ? UiDesign.space.content : 0,
                                                               bottom: 0, trailing: padded ? UiDesign.space.content : 0)
    let body: UIView
    if layout == .scroll {
      scroll.translatesAutoresizingMaskIntoConstraints = false
      scroll.keyboardDismissMode = .interactive
      scroll.addSubview(content)
      let hug = scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: content.heightAnchor)
      hug.priority = UILayoutPriority(740)
      NSLayoutConstraint.activate([
        content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
        content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
        content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
        content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
        content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        hug,
      ])
      body = scroll
    } else {
      content.clipsToBounds = true
      body = content
    }
    footerSlot.translatesAutoresizingMaskIntoConstraints = false
    footerSlot.isHidden = true
    let column = UIStackView(arrangedSubviews: [header, body, footerSlot])
    column.axis = .vertical
    column.translatesAutoresizingMaskIntoConstraints = false
    panel.addSubview(column)

    columnBottom = column.bottomAnchor.constraint(equalTo: panel.bottomAnchor)
    heightLimit = layout == .list ? panel.heightAnchor.constraint(equalToConstant: 0) : panel.heightAnchor.constraint(lessThanOrEqualToConstant: 0)
    heightLimit.priority = UILayoutPriority(999)
    NSLayoutConstraint.activate([
      heightLimit,
      column.topAnchor.constraint(equalTo: panel.topAnchor),
      column.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
      column.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
      columnBottom,
    ])
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.isHidden = true
    closeButton.backgroundColor = UiDesign.light.color.floatingCloseFill
    closeButton.layer.cornerRadius = UiDesign.component.overlay.closeSize / 2
    closeButton.layer.borderWidth = 1
    closeButton.layer.borderColor = UiDesign.light.color.floatingCloseBorder.cgColor
    closeButton.tintColor = UiDesign.media.text
    closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: UiDesign.component.overlay.closeIcon, weight: .semibold)), for: .normal)
    closeButton.accessibilityLabel = "关闭图片"
    closeButton.accessibilityIdentifier = "sheet-close-button"
    closeButton.addAction(UIAction { [weak self] _ in self?.presenter.requestClose(.closeButton) }, for: .touchUpInside)
    panel.addSubview(closeButton)
    NSLayoutConstraint.activate([closeButton.topAnchor.constraint(equalTo: panel.topAnchor, constant: UiDesign.component.overlay.closeInset), closeButton.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -UiDesign.component.overlay.closeInset), closeButton.widthAnchor.constraint(equalToConstant: UiDesign.component.overlay.closeSize), closeButton.heightAnchor.constraint(equalToConstant: UiDesign.component.overlay.closeSize)])
    _ = actions
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    center.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UIResponder.keyboardDidShowNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UITextField.textDidBeginEditingNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UITextView.textDidBeginEditingNotification, object: nil)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    shell.frame = bounds
    applyMetrics()
    shell.layoutIfNeeded()
  }
  public override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }
  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { presenter.forceRemove(.unmount) }
  }
  // Keep the full-screen hit-test shield while closing, even though actions are disabled.
  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, presenter.top, bounds.contains(point) else { return nil }
    return presenter.open ? super.hitTest(point, with: event) : self
  }

  /// A covered sheet keeps its layout while an upper overlay shows the keyboard.
  private var keyboard: CGFloat { presenter.interactive && layout != .content ? keyboardHeight : 0 }

  private func applyMetrics() {
    let available = max(0, bounds.height - safeAreaInsets.top)
    let limit = keyboard > 0 ? available : available * 0.85
    let bottom = keyboard > 0 ? keyboard + UiDesign.space.md : (edgeToEdge ? 0 : max(safeAreaInsets.bottom, UiDesign.space.lg))
    if heightLimit.constant != limit { heightLimit.constant = limit }
    if columnBottom.constant != -bottom { columnBottom.constant = -bottom }
    guard bounds.width > 0, limit > 0 else { return }
    // Fit the existing header/body/footer column at the real width. Scroll content
    // hugs its natural height until the cap; list content always receives the cap.
    shell.openHeight = fittedHeight
  }

  private var fittedHeight: CGFloat {
    let limit = heightLimit.constant
    if layout == .list { return limit }
    let fitted = panel.systemLayoutSizeFitting(
      CGSize(width: bounds.width, height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
    return min(limit, max(0, fitted))
  }

  private func updateHeaderVisibility() {
    header.isHidden = !showHandle && header.title == nil && header.message == nil
  }

  private func applyContentInsets() {
    let padded = layout != .list && !edgeToEdge
    content.spacing = padded ? UiDesign.space.lg : 0
    if footerInsets.count == 3 {
      footerInsets[0].constant = edgeToEdge ? 0 : UiDesign.space.lg
      footerInsets[1].constant = edgeToEdge ? 0 : UiDesign.space.content
      footerInsets[2].constant = edgeToEdge ? 0 : -UiDesign.space.content
    }
    content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: padded ? UiDesign.space.content : 0, bottom: 0, trailing: padded ? UiDesign.space.content : 0)
  }

  private func coveredChanged() {
    if !presenter.top { endEditing(true) }
    isUserInteractionEnabled = presenter.top
    accessibilityElementsHidden = !presenter.interactive
    shell.interactionEnabled = presenter.interactive
    setNeedsLayout()
  }

  private func replaceFooter(_ old: UIView?) {
    NSLayoutConstraint.deactivate(footerInsets); footerInsets = []
    old?.removeFromSuperview()
    footerSlot.isHidden = footerView == nil
    guard let footer = footerView else { return }
    footer.translatesAutoresizingMaskIntoConstraints = false
    footerSlot.addSubview(footer)
    footerInsets = [
      footer.topAnchor.constraint(equalTo: footerSlot.topAnchor, constant: edgeToEdge ? 0 : UiDesign.space.lg),
      footer.leadingAnchor.constraint(equalTo: footerSlot.leadingAnchor, constant: edgeToEdge ? 0 : UiDesign.space.content),
      footer.trailingAnchor.constraint(equalTo: footerSlot.trailingAnchor, constant: edgeToEdge ? 0 : -UiDesign.space.content),
    ]
    NSLayoutConstraint.activate(footerInsets + [footer.bottomAnchor.constraint(equalTo: footerSlot.bottomAnchor)])
  }

  private func render(animated: Bool, closed: @escaping () -> Void) {
    coveredChanged()
    if presenter.open {
      closeCompletion = nil
      isHidden = false
      shell.present()
      setNeedsLayout()
      layoutIfNeeded()
    } else {
      endEditing(true)
      closeCompletion = closed
      shell.dismiss(animated: animated)
    }
  }

  @objc private func keyboardChanged(_ notification: Notification) {
    let info = notification.userInfo ?? [:]
    if notification.name == UIResponder.keyboardWillHideNotification {
      keyboardHeight = 0
    } else if let frame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect, let screen = window?.screen {
      keyboardHeight = max(0, bounds.maxY - convert(frame, from: screen.coordinateSpace).minY)
    }
    guard !isHidden else { return }
    let duration = info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
    let curve = info[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt ?? 7
    setNeedsLayout()
    UIView.animate(withDuration: duration, delay: 0, options: UIView.AnimationOptions(rawValue: curve << 16)) { self.layoutIfNeeded() }
  }

  @objc private func revealFocused() {
    guard layout == .scroll, presenter.interactive, keyboard > 0, let field = content.firstResponderDescendant else { return }
    layoutIfNeeded()
    scroll.scrollRectToVisible(field.convert(field.bounds, to: scroll).insetBy(dx: 0, dy: -UiDesign.space.lg), animated: true)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(onOpenChange:)") }
}

/// Notify the full-screen owner when the embedded column changes intrinsic size.
private final class SheetContentView: UIView {
  var onLayout: (() -> Void)?
  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }
}

private final class SheetContentStackView: UIStackView {
  var onLayout: (() -> Void)?
  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }
}

// Preserve the public conformance; the shell now owns all gesture negotiation.
extension BottomSheet: UIGestureRecognizerDelegate {}

extension UIView {
  var firstResponderDescendant: UIView? {
    if isFirstResponder { return self }
    for child in subviews { if let found = child.firstResponderDescendant { return found } }
    return nil
  }
}

/// Scrolling sheet with a pinned header/footer; content is wrapped in one UIScrollView.
@MainActor
public final class ScrollBottomSheet: BottomSheet {
  public init(onOpenChange: @escaping (Bool, SheetDismissReason) -> Void = { _, _ in }) {
    super.init(layout: .scroll, onOpenChange: onOpenChange)
  }
  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(onOpenChange:)") }
}

/// Fixed-height sheet for a caller-owned table/collection view; no outer UIScrollView.
@MainActor
public final class ListBottomSheet: BottomSheet {
  public init(onOpenChange: @escaping (Bool, SheetDismissReason) -> Void = { _, _ in }) {
    super.init(layout: .list, onOpenChange: onOpenChange)
  }
  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(onOpenChange:)") }
}
