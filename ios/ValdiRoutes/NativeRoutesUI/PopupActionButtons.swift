// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/PopupActionButtons.swift.
import UIKit

public enum ConfirmTone { case primary, danger }

/// Cancel / confirm pair shared by sheets and dialogs; mirrors the RN `PopupActionButtons`.
@MainActor
public final class PopupActionButtons: UIStackView {
  private let confirm: ActionButton
  public var confirmEnabled = true { didSet { confirm.isEnabled = confirmEnabled } }

  public init(cancelText: String = "取消", confirmText: String = "确定", tone: ConfirmTone = .primary, showCancel: Bool = true,
              cancelSymbol: String? = nil, confirmSymbol: String? = nil,
              onCancel: @escaping () -> Void, onConfirm: @escaping () -> Void) {
    confirm = ActionButton(title: confirmText, tone: tone == .danger ? .danger : .primary,
                           symbolName: confirmSymbol, action: onConfirm)
    super.init(frame: .zero)
    axis = .horizontal
    spacing = UiDesign.space.md
    distribution = .fillEqually
    translatesAutoresizingMaskIntoConstraints = false
    if showCancel {
      addArrangedSubview(ActionButton(title: cancelText, tone: .cancel, symbolName: cancelSymbol, action: onCancel))
    }
    addArrangedSubview(confirm)
  }

  @available(*, unavailable)
  required init(coder: NSCoder) { fatalError("Use init(cancelText:confirmText:tone:showCancel:cancelSymbol:confirmSymbol:onCancel:onConfirm:)") }
}

/// Grabber, title and description; mirrors the RN `SheetHeader`.
@MainActor
final class SheetHeaderView: UIView {
  private let titleLabel = OverlayLabel(size: UiDesign.component.overlay.titleSize, weight: .semibold, lineHeight: UiDesign.component.overlay.titleLine, color: UiTheme.text)
  private let titleIcon = UIImageView()
  private let titleRow = UIStackView()
  private let descriptionLabel = OverlayLabel(size: UiDesign.component.overlay.descriptionSize, lineHeight: UiDesign.component.overlay.descriptionLine, color: UiTheme.muted)
  private var bottom: NSLayoutConstraint!
  private let handle = UIView()
  private var handleHeight: NSLayoutConstraint!
  private var handleTop: NSLayoutConstraint!
  private var bodyTop: NSLayoutConstraint!
  private var bodyLeading: NSLayoutConstraint!
  private var bodyTrailing: NSLayoutConstraint!
  private let stack = UIStackView()
  var edgeToEdge = false { didSet { relayout() } }
  var showHandle = true { didSet { relayout() } }

  var title: String? { didSet { titleLabel.value = title; titleLabel.accessibilityTraits = .header; relayout() } }
  var message: String? { didSet { descriptionLabel.value = message; relayout() } }
  var iconName: String? { didSet { updateIcon(); relayout() } }

  init() {
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    handle.translatesAutoresizingMaskIntoConstraints = false
    handle.backgroundColor = UiTheme.handle
    handle.layer.cornerRadius = UiDesign.radius.tiny
    handle.isAccessibilityElement = false
    titleIcon.contentMode = .scaleAspectFit
    titleIcon.tintColor = UiTheme.primary
    titleIcon.isAccessibilityElement = false
    titleIcon.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      titleIcon.widthAnchor.constraint(equalToConstant: 18),
      titleIcon.heightAnchor.constraint(equalToConstant: 18),
    ])
    titleRow.axis = .horizontal
    titleRow.alignment = .center
    titleRow.spacing = UiDesign.space.sm
    titleRow.addArrangedSubview(titleIcon)
    titleRow.addArrangedSubview(titleLabel)
    stack.addArrangedSubview(titleRow); stack.addArrangedSubview(descriptionLabel)
    stack.axis = .vertical
    stack.alignment = .center
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(handle); addSubview(stack)
    stack.setCustomSpacing(UiDesign.space.sm, after: titleRow)
    handleTop = handle.topAnchor.constraint(equalTo: topAnchor, constant: UiDesign.component.overlay.handleTop)
    handleHeight = handle.heightAnchor.constraint(equalToConstant: UiDesign.component.overlay.handleHeight)
    bodyTop = stack.topAnchor.constraint(equalTo: handle.bottomAnchor, constant: UiDesign.component.overlay.titleGap)
    bodyLeading = stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: UiDesign.space.content)
    bodyTrailing = stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -UiDesign.space.content)
    bottom = stack.bottomAnchor.constraint(equalTo: bottomAnchor)
    NSLayoutConstraint.activate([
      handleTop,
      handle.centerXAnchor.constraint(equalTo: centerXAnchor),
      handle.widthAnchor.constraint(equalToConstant: UiDesign.component.overlay.handleWidth),
      handleHeight,
      bodyTop,
      bodyLeading, bodyTrailing,
      titleRow.widthAnchor.constraint(lessThanOrEqualTo: stack.widthAnchor),
      descriptionLabel.widthAnchor.constraint(equalTo: stack.widthAnchor),
      bottom,
    ])
    relayout()
  }

  private func relayout() {
    handle.isHidden = !showHandle
    handleTop.constant = showHandle && !edgeToEdge ? UiDesign.component.overlay.handleTop : 0
    handleHeight.constant = showHandle ? UiDesign.component.overlay.handleHeight : 0
    bodyTop.constant = showHandle && !edgeToEdge ? UiDesign.component.overlay.titleGap : 0
    bodyLeading.constant = edgeToEdge ? 0 : UiDesign.space.content
    bodyTrailing.constant = edgeToEdge ? 0 : -UiDesign.space.content
    stack.setCustomSpacing(edgeToEdge ? 0 : UiDesign.space.sm, after: titleRow)
    titleLabel.isHidden = title == nil
    titleIcon.isHidden = iconName == nil
    titleRow.isHidden = title == nil
    descriptionLabel.isHidden = message == nil
    bottom.constant = edgeToEdge || (title == nil && message == nil) ? 0 : -UiDesign.space.xl
  }

  private func updateIcon() {
    titleIcon.image = iconName.flatMap { UIImage(systemName: $0, withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)) }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init()") }
}
