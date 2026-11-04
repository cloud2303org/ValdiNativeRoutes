// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/ActionButton.swift.
import UIKit

public enum ActionButtonTone { case primary, cancel, danger, text }
public enum ActionButtonSize { case small, medium, large }
public enum ActionButtonShape { case standard, square, round }

@MainActor
public func makeActionButton(_ title: String, identifier: String? = nil, tone: ActionButtonTone = .primary,
                             symbolName: String? = nil, size: ActionButtonSize = .large,
                             shape: ActionButtonShape = .standard, action: @escaping () -> Void) -> ActionButton {
  ActionButton(title: title, tone: tone, identifier: identifier, symbolName: symbolName, size: size, shape: shape, action: action)
}

/// Single wushui control; mirrors the RN `ActionButton`.
@MainActor
public final class ActionButton: UIControl {
  private let label = UILabel()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let symbol = UIImageView()
  private let content = UIStackView()
  private let outline = CAShapeLayer()
  private var callerEnabled = true
  private var contentCenterX: NSLayoutConstraint!
  private var contentCenterY: NSLayoutConstraint!
  private var contentLeading: NSLayoutConstraint!
  private var contentTrailing: NSLayoutConstraint!
  private var contentMaxWidth: NSLayoutConstraint!
  private var contentVerticalTop: NSLayoutConstraint!
  private var contentVerticalBottom: NSLayoutConstraint!
  private var minimumHeight: NSLayoutConstraint!
  private var symbolWidth: NSLayoutConstraint!
  private var symbolHeight: NSLayoutConstraint!
  var isStateAction = false { didSet { updateSymbol(); applyTheme() } }
  public var tone: ActionButtonTone { didSet { applyTheme() } }
  public var size: ActionButtonSize { didSet { updateSymbol() } }
  public var shape: ActionButtonShape { didSet { setNeedsLayout() } }
  public var loading = false { didSet { updateLoadingState() } }
  public var title: String {
    didSet { label.text = title; accessibilityLabel = title; updateContentLayout() }
  }
  public var symbolName: String? { didSet { updateSymbol() } }
  override public var isEnabled: Bool {
    get { super.isEnabled }
    set {
      callerEnabled = newValue
      super.isEnabled = newValue && !loading
      applyTheme()
      accessibilityTraits = isEnabled ? .button : [.button, .notEnabled]
    }
  }
  override public var isHighlighted: Bool {
    didSet {
      let pressed = isHighlighted && isEnabled
      alpha = restingAlpha * (pressed ? UiDesign.motion.pressedOpacity : 1)
      transform = pressed ? CGAffineTransform(scaleX: UiDesign.motion.pressedScale, y: UiDesign.motion.pressedScale) : .identity
    }
  }

  public init(title: String, tone: ActionButtonTone = .primary, identifier: String? = nil, enabled: Bool = true,
              symbolName: String? = nil, size: ActionButtonSize = .large, shape: ActionButtonShape = .standard,
              action: @escaping () -> Void) {
    self.title = title
    self.tone = tone
    self.symbolName = symbolName
    self.size = size
    self.shape = shape
    super.init(frame: .zero)
    isEnabled = enabled
    layer.cornerRadius = UiDesign.radius.button
    clipsToBounds = true
    outline.lineJoin = .round
    outline.contentsScale = UIScreen.main.scale
    layer.insertSublayer(outline, at: 0)
    label.text = title
    label.font = .systemFont(ofSize: UiDesign.font.control, weight: .semibold)
    label.textAlignment = .center
    label.numberOfLines = 0
    label.translatesAutoresizingMaskIntoConstraints = false
    label.setContentHuggingPriority(.defaultLow, for: .horizontal)
    label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    content.axis = .horizontal
    content.isUserInteractionEnabled = false
    content.alignment = .center
    content.spacing = UiDesign.space.sm
    content.translatesAutoresizingMaskIntoConstraints = false
    symbol.contentMode = .scaleAspectFit
    symbol.isAccessibilityElement = false
    symbol.translatesAutoresizingMaskIntoConstraints = false
    symbolWidth = symbol.widthAnchor.constraint(equalToConstant: 20)
    symbolHeight = symbol.heightAnchor.constraint(equalToConstant: 20)
    NSLayoutConstraint.activate([symbolWidth, symbolHeight])
    spinner.hidesWhenStopped = false
    spinner.isHidden = true
    content.addArrangedSubview(spinner)
    content.addArrangedSubview(symbol)
    content.addArrangedSubview(label)
    addSubview(content)
    contentCenterX = content.centerXAnchor.constraint(equalTo: centerXAnchor)
    contentCenterY = content.centerYAnchor.constraint(equalTo: centerYAnchor)
    contentLeading = content.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: UiDesign.space.md)
    contentTrailing = content.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -UiDesign.space.md)
    contentMaxWidth = content.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, constant: -2 * UiDesign.space.md)
    contentVerticalTop = content.topAnchor.constraint(equalTo: topAnchor, constant: UiDesign.space.md)
    contentVerticalBottom = content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -UiDesign.space.md)
    minimumHeight = heightAnchor.constraint(greaterThanOrEqualToConstant: UiDesign.size.button)
    NSLayoutConstraint.activate([
      minimumHeight,
      contentCenterX, contentCenterY, contentLeading, contentTrailing, contentMaxWidth,
      contentVerticalTop, contentVerticalBottom,
    ])
    isAccessibilityElement = true
    accessibilityLabel = title
    accessibilityIdentifier = identifier ?? title
    accessibilityTraits = enabled ? .button : [.button, .notEnabled]
    addAction(UIAction { [weak self] _ in
      guard let self, self.isEnabled, !self.loading else { return }
      action()
    }, for: .touchUpInside)
    updateContentLayout()
    updateSymbol()
    applyTheme()
  }

  override public func traitCollectionDidChange(_ previous: UITraitCollection?) {
    super.traitCollectionDidChange(previous)
    if traitCollection.hasDifferentColorAppearance(comparedTo: previous) { applyTheme() }
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    let cornerRadius: CGFloat
    switch shape {
    case .standard: cornerRadius = UiDesign.radius.button
    case .square: cornerRadius = 0
    case .round: cornerRadius = bounds.height / 2
    }
    let inset = outline.lineWidth / 2
    let rect = bounds.insetBy(dx: inset, dy: inset)
    let radius = max(0, min(cornerRadius - inset, min(rect.height / 2, rect.width / 2)))
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layer.cornerRadius = cornerRadius
    outline.frame = bounds
    outline.path = UIBezierPath(roundedRect: rect, cornerRadius: radius).cgPath
    CATransaction.commit()
  }

  override public var intrinsicContentSize: CGSize {
    let metrics = layoutMetrics
    guard !title.isEmpty else { return CGSize(width: metrics.height, height: metrics.height) }
    let textSize = label.intrinsicContentSize
    let accessoryWidth: CGFloat = loading || symbolName != nil ? metrics.icon + 8 : 0
    return CGSize(width: textSize.width + accessoryWidth + metrics.horizontal * 2,
                  height: max(metrics.height, textSize.height + metrics.vertical * 2))
  }

  private var layoutMetrics: (height: CGFloat, font: CGFloat, line: CGFloat, horizontal: CGFloat, vertical: CGFloat, icon: CGFloat) {
    if isStateAction { return (UiDesign.component.state.button.height, UiDesign.component.state.button.fontSize, UiDesign.component.state.button.lineHeight, UiDesign.component.state.button.paddingHorizontal, UiDesign.component.state.button.paddingVertical, UiDesign.component.state.button.iconSize) }
    switch size {
    case .small: return (UiDesign.buttonSize.small.height, UiDesign.buttonSize.small.fontSize, UiDesign.buttonSize.small.lineHeight, UiDesign.buttonSize.small.paddingHorizontal, UiDesign.buttonSize.small.paddingVertical, UiDesign.buttonSize.small.iconSize)
    case .medium: return (UiDesign.buttonSize.medium.height, UiDesign.buttonSize.medium.fontSize, UiDesign.buttonSize.medium.lineHeight, UiDesign.buttonSize.medium.paddingHorizontal, UiDesign.buttonSize.medium.paddingVertical, UiDesign.buttonSize.medium.iconSize)
    case .large: return (UiDesign.buttonSize.large.height, UiDesign.buttonSize.large.fontSize, UiDesign.buttonSize.large.lineHeight, UiDesign.buttonSize.large.paddingHorizontal, UiDesign.buttonSize.large.paddingVertical, UiDesign.buttonSize.large.iconSize)
    }
  }

  /// Disabled keeps its tone at reduced opacity rather than switching to gray.
  private var restingAlpha: CGFloat { callerEnabled ? 1 : UiDesign.motion.disabledOpacity }

  private func applyTheme() {
    // Flat fills without outlines.
    let colors: (fill: UIColor, text: UIColor)
    switch tone {
    case .danger: colors = (UiTheme.buttonDanger, UiTheme.buttonOnDanger)
    case .cancel: colors = (UiTheme.buttonSecondary, UiTheme.buttonOnSecondary)
    case .text: colors = (.clear, UiTheme.primary)
    case .primary: colors = (UiTheme.buttonPrimary, UiTheme.buttonOnPrimary)
    }
    backgroundColor = .clear
    alpha = restingAlpha
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    outline.fillColor = colors.fill.resolvedColor(with: traitCollection).cgColor
    outline.lineWidth = 0
    outline.strokeColor = nil
    CATransaction.commit()
    label.textColor = colors.text
    spinner.color = colors.text
    symbol.tintColor = colors.text
    accessibilityValue = loading ? "加载中" : nil
    setNeedsLayout()
  }

  private func updateLoadingState() {
    super.isEnabled = callerEnabled && !loading
    if loading { spinner.startAnimating() } else { spinner.stopAnimating() }
    spinner.isHidden = !loading
    updateSymbol()
    updateContentLayout()
    accessibilityTraits = isEnabled ? .button : [.button, .notEnabled]
    applyTheme()
  }

  private func updateContentLayout() {
    let metrics = layoutMetrics
    let hasTitle = !title.isEmpty
    let showsSymbol = !loading && symbolName != nil
    symbol.isHidden = !showsSymbol
    label.isHidden = !hasTitle
    content.spacing = hasTitle && (loading || showsSymbol) ? 8 : 0
    contentLeading.constant = hasTitle ? metrics.horizontal : 0
    contentTrailing.constant = hasTitle ? -metrics.horizontal : 0
    contentMaxWidth.constant = hasTitle ? -2 * metrics.horizontal : 0
    contentVerticalTop.constant = hasTitle ? metrics.vertical : 0
    contentVerticalBottom.constant = hasTitle ? -metrics.vertical : 0
    minimumHeight.constant = metrics.height
    symbolWidth.constant = metrics.icon
    symbolHeight.constant = metrics.icon
    let font = UIFont.systemFont(ofSize: metrics.font, weight: isStateAction ? .medium : .semibold)
    label.font = font
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = metrics.line
    paragraph.maximumLineHeight = metrics.line
    paragraph.alignment = .center
    // UILabel puts the extra fixed line-height below the font baseline by default.
    // Split that leading above/below the glyphs, matching RN's iOS text layout.
    label.attributedText = NSAttributedString(string: title, attributes: [
      .font: font, .paragraphStyle: paragraph,
      .baselineOffset: (metrics.line - font.lineHeight) / 2,
    ])
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  private func updateSymbol() {
    let pointSize: CGFloat = isStateAction ? 16 : layoutMetrics.icon
    symbol.image = symbolName.flatMap { UIImage(systemName: $0, withConfiguration: UIImage.SymbolConfiguration(pointSize: pointSize, weight: .medium)) }
    symbol.isHidden = loading || symbol.image == nil
    updateContentLayout()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(title:tone:identifier:enabled:action:)") }
}
