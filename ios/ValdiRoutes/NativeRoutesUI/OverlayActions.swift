// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/OverlayActions.swift.
import UIKit

/// Shared default actions for UIKit sheets and dialogs. Custom footer content takes precedence.
@MainActor
final class OverlayActions {
  var footer: UIView? { didSet { update() } }
  var onConfirm: (() -> Void)? { didSet { update() } }
  var onCancel: (() -> Void)? { didSet { update() } }
  var showCancel = true { didSet { update() } }
  var confirmText = "确定" { didSet { update() } }
  var cancelText = "取消" { didSet { update() } }
  var confirmDisabled = false { didSet { update() } }
  var confirmTone: ConfirmTone = .primary { didSet { update() } }

  private let defaultConfirm: () -> Void
  private let defaultCancel: () -> Void
  private let changed: (UIView?) -> Void

  init(defaultConfirm: @escaping () -> Void, defaultCancel: @escaping () -> Void, changed: @escaping (UIView?) -> Void) {
    self.defaultConfirm = defaultConfirm
    self.defaultCancel = defaultCancel
    self.changed = changed
    update()
  }

  private func update() {
    if let footer { changed(footer); return }
    let buttons = PopupActionButtons(cancelText: cancelText, confirmText: confirmText,
      tone: confirmTone, showCancel: showCancel,
      onCancel: { [weak self] in
        guard let self else { return }
        if let onCancel = self.onCancel { onCancel() } else { self.defaultCancel() }
      }, onConfirm: { [weak self] in
        guard let self, !self.confirmDisabled else { return }
        if let onConfirm = self.onConfirm { onConfirm() } else { self.defaultConfirm() }
      })
    buttons.confirmEnabled = !confirmDisabled
    changed(buttons)
  }
}
