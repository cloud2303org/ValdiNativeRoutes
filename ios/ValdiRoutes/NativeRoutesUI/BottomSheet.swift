// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/BottomSheet.swift.
import UIKit

fileprivate enum SheetLayout { case content, scroll, list }

/// Page-scoped sheet matching the RN `BottomSheet`. Add it over the page view, pinned to all edges.
/// Drag down or tap the scrim requests a close with `.gesture`.
@MainActor
public class BottomSheet: UIView {
  public let content = UIStackView()
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
  public var dismissible: Bool { get { presenter.dismissible } set { presenter.dismissible = newValue } }
  public var open: Bool { get { presenter.open } set { presenter.setOpen(newValue) } }

  public var showHandle = true { didSet { header.showHandle = showHandle; updateHeaderVisibility() } }
  public var edgeToEdge = false { didSet { header.edgeToEdge = edgeToEdge; applyContentInsets(); setNeedsLayout() } }
  public var showCloseButton = false { didSet { closeButton.isHidden = !showCloseButton } }
  private let closeButton = UIButton(type: .system)

  private let layout: SheetLayout
  private lazy var presenter = OverlayPresenter<SheetDismissReason>(view: self, back: .back, navigation: .navigation)
  private let scrim = UIControl()
  private let panel = UIView()
  private let header = SheetHeaderView()
  private let scroll = UIScrollView()
  private let footerSlot = UIView()
  private var footerInsets: [NSLayoutConstraint] = []
  private var panelBottom: NSLayoutConstraint!
  private var columnBottom: NSLayoutConstraint!
  private var heightLimit: NSLayoutConstraint!
  private var animator: UIViewPropertyAnimator?
  private var keyboardHeight: CGFloat = 0
  private lazy var panGesture = UIPanGestureRecognizer(target: self, action: #selector(drag(_:)))
  private var panScrollViews: [(view: UIScrollView, inverted: Bool)] = []
  private var panScrollDistance: CGFloat = 0
  private var panHasSheetDrag = false

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

    scrim.translatesAutoresizingMaskIntoConstraints = false
    scrim.backgroundColor = UiTheme.scrim
    scrim.addAction(UIAction { [weak self] _ in self?.presenter.requestClose(.gesture) }, for: .touchUpInside)
    addSubview(scrim)
    panel.translatesAutoresizingMaskIntoConstraints = false
    panel.backgroundColor = UiTheme.surface
    panel.layer.cornerRadius = UiDesign.radius.sheet
    panel.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    panel.clipsToBounds = true
    addSubview(panel)

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

    panelBottom = panel.bottomAnchor.constraint(equalTo: bottomAnchor)
    columnBottom = column.bottomAnchor.constraint(equalTo: panel.bottomAnchor)
    heightLimit = layout == .list ? panel.heightAnchor.constraint(equalToConstant: 0) : panel.heightAnchor.constraint(lessThanOrEqualToConstant: 0)
    heightLimit.priority = UILayoutPriority(999)
    NSLayoutConstraint.activate([
      scrim.topAnchor.constraint(equalTo: topAnchor),
      scrim.bottomAnchor.constraint(equalTo: bottomAnchor),
      scrim.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrim.trailingAnchor.constraint(equalTo: trailingAnchor),
      panel.leadingAnchor.constraint(equalTo: leadingAnchor),
      panel.trailingAnchor.constraint(equalTo: trailingAnchor),
      panel.topAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.topAnchor),
      panelBottom, heightLimit,
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
    panGesture.delegate = self
    panel.addGestureRecognizer(panGesture)
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    center.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UIResponder.keyboardDidShowNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UITextField.textDidBeginEditingNotification, object: nil)
    center.addObserver(self, selector: #selector(revealFocused), name: UITextView.textDidBeginEditingNotification, object: nil)
  }

  public override func layoutSubviews() {
    applyMetrics()
    super.layoutSubviews()
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
    let available = bounds.height - safeAreaInsets.top
    let limit = keyboard > 0 ? available : available * 0.85
    let bottom = keyboard > 0 ? keyboard + UiDesign.space.md : (edgeToEdge ? 0 : max(safeAreaInsets.bottom, UiDesign.space.lg))
    if heightLimit.constant != limit { heightLimit.constant = limit }
    if columnBottom.constant != -bottom { columnBottom.constant = -bottom }
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
    animator?.stopAnimation(true); animator = nil
    let open = presenter.open
    coveredChanged()
    if open {
      let wasHidden = isHidden
      isHidden = false
      layoutIfNeeded()
      if wasHidden { panelBottom.constant = panel.bounds.height + 24; scrim.alpha = 0; layoutIfNeeded() }
    } else {
      endEditing(true)
    }
    panelBottom.constant = open ? 0 : panel.bounds.height + 24
    let changes = { self.scrim.alpha = open ? 1 : 0; self.layoutIfNeeded() }
    let finish = { [weak self] in
      guard let self, !self.presenter.open else { return }
      self.isHidden = true
      closed()
    }
    guard animated else { changes(); finish(); return }
    let animation = UIViewPropertyAnimator(duration: 0.28, curve: .easeOut, animations: changes)
    animation.addCompletion { position in if position == .end { finish() } }
    animator = animation; animation.startAnimation()
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

  private func isVerticallyScrollable(_ scrollView: UIScrollView) -> Bool {
    guard scrollView.isScrollEnabled else { return false }
    let insets = scrollView.adjustedContentInset.top + scrollView.adjustedContentInset.bottom
    return scrollView.alwaysBounceVertical || scrollView.contentSize.height > max(0, scrollView.bounds.height - insets)
  }

  private func scrollViewsForPan(at location: CGPoint) -> [(view: UIScrollView, inverted: Bool)] {
    var chain: [UIView] = []
    var node = panel.hitTest(location, with: nil)
    while let view = node, view !== panel { chain.append(view); node = view.superview }
    var inverted = false
    var result: [(view: UIScrollView, inverted: Bool)] = []
    for view in chain.reversed() {
      inverted = inverted || view.transform.d < 0
      if let scroll = view as? UIScrollView, isVerticallyScrollable(scroll) { result.append((scroll, inverted)) }
    }
    return result
  }

  private func startsOnPickerWheel(_ location: CGPoint) -> Bool {
    var node = panel.hitTest(location, with: nil)
    while let view = node, view !== panel {
      if view is UIPickerView { return true }
      node = view.superview
    }
    return false
  }

  private func scrollDistanceToEdge(_ candidate: (view: UIScrollView, inverted: Bool)) -> CGFloat {
    let scroll = candidate.view
    if candidate.inverted {
      let edge = max(-scroll.adjustedContentInset.top,
        scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
      return max(0, edge - scroll.contentOffset.y)
    }
    return max(0, scroll.contentOffset.y + scroll.adjustedContentInset.top)
  }

  private func pinPanScrollViews() {
    for candidate in panScrollViews {
      let scroll = candidate.view
      let top = -scroll.adjustedContentInset.top
      let edge = candidate.inverted
        ? max(top, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom) : top
      scroll.contentOffset = CGPoint(x: scroll.contentOffset.x, y: edge)
    }
  }

  @objc private func drag(_ gesture: UIPanGestureRecognizer) {
    guard presenter.interactive, presenter.dismissible else { return }
    let translation = max(0, gesture.translation(in: self).y - panScrollDistance)
    switch gesture.state {
    case .began:
      panScrollDistance = panScrollViews.reduce(0) { max($0, scrollDistanceToEdge($1)) }
      panHasSheetDrag = panScrollViews.isEmpty || panScrollDistance <= 0.5
      if panHasSheetDrag { endEditing(true) }
      gesture.setTranslation(.zero, in: self)
    case .changed:
      if !panHasSheetDrag, panScrollViews.contains(where: { scrollDistanceToEdge($0) > 0.5 }) { return }
      guard panHasSheetDrag || translation > 0 else { return }
      if !panHasSheetDrag { endEditing(true); panHasSheetDrag = true }
      if translation > 0 { pinPanScrollViews() }
      panelBottom.constant = translation
      scrim.alpha = 1 - (panel.bounds.height > 0 ? min(1, translation / panel.bounds.height) : 0)
    case .ended, .cancelled:
      let dragged = panHasSheetDrag
      panScrollViews = []; panScrollDistance = 0; panHasSheetDrag = false
      guard dragged else { return }
      if gesture.state == .ended, translation > 80 || gesture.velocity(in: self).y > 800 { presenter.requestClose(.gesture) }
      if presenter.open { render(animated: true) {} }
    case .failed:
      panScrollViews = []; panScrollDistance = 0; panHasSheetDrag = false
    default:
      break
    }
  }

  public override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === panGesture, presenter.interactive, presenter.dismissible else { return false }
    let velocity = panGesture.velocity(in: self)
    guard velocity.y > 0, abs(velocity.y) > abs(velocity.x) else { return false }
    let location = panGesture.location(in: panel)
    // A picker wheel owns its drags: one that reaches its first row stops there instead of pulling the sheet down.
    guard !startsOnPickerWheel(location) else { return false }
    // Both recognizers begin together. The sheet waits until the body consumes
    // its distance to the top, then uses the rest of this same gesture.
    panScrollViews = scrollViewsForPan(at: location)
    panGesture.cancelsTouchesInView = panScrollViews.isEmpty
    return true
  }


  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(onOpenChange:)") }
}

extension BottomSheet: UIGestureRecognizerDelegate {

  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === panGesture else { return false }
    guard let scroll = other.view as? UIScrollView, scroll.panGestureRecognizer === other,
          scroll.isDescendant(of: panel) else { return false }
    return isVerticallyScrollable(scroll)
  }
}

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
