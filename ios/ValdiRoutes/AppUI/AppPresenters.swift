import UIKit

/// The UIKit renderers of AppUI's presentations, after ExpoNativeRoutes' AppUIPresenters: the same NativeRoutesUI
/// components with the same replies. Instead of the page view, each one goes on its own layer over the whole window (so
/// it covers the in-window sheet, like AppDialogView); the action sheet is a UIAlertController presented in that window.
/// `complete` runs once, after the close animation; the returned closure cancels (AppUI's queue owns the page).
@MainActor
enum AppPresenters {
    static func present(_ options: PresentationOptions, in window: UIWindow,
                        complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        switch options {
        case let .actionSheet(options): return actionSheet(options, window, complete)
        case let .picker(options): return picker(options, window, complete)
        case let .datePicker(options): return datePicker(options, window, complete)
        case let .bottomSheet(options): return bottomSheet(options, window, complete)
        case let .imagePreview(options): return imagePreview(options, window, complete)
        }
    }

    private static func actionSheet(_ options: ActionSheetOptions, _ window: UIWindow,
                                    _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        guard let controller = topController(window) else {
            complete(PresentationResult(confirm: false, cancel: true))
            return {}
        }
        let cancel = NativeActionSheet.present(from: controller, title: options.alertText.isEmpty ? nil : options.alertText,
            actions: options.itemList.enumerated().map { MenuActionItem(id: String($0.offset), title: $0.element) }) { selection, reason in
                let index = selection.flatMap(Int.init) ?? -1
                complete(PresentationResult(confirm: index >= 0 && reason == .dismissed, cancel: index < 0 || reason != .dismissed,
                                            value: index >= 0 ? options.itemList[index] : "", index: index))
            }
        return { cancel(.dismissed) }
    }

    private static func picker(_ options: PickerOptions, _ window: UIWindow,
                               _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        let layer = PresentationLayer(window: window)
        let picker = ColumnPicker()
        picker.title = options.title.isEmpty ? nil : options.title
        picker.options = options.options
        picker.value = options.value; picker.confirmText = options.confirmText; picker.cancelText = options.cancelText
        // Cancelling carries no value, as in ExpoNativeRoutes.
        let original = PresentationResult(confirm: false, cancel: true, value: "", index: -1)
        var outcome = original
        picker.onConfirm = { value in
            outcome = PresentationResult(confirm: true, cancel: false, value: value,
                                         index: options.options.firstIndex { $0.value == value } ?? -1)
        }
        picker.onOpenChange = { [weak picker] open, _ in if !open { picker?.open = false } }
        picker.onClosed = { [weak picker, weak layer] reason in
            picker?.onClosed = { _ in }; picker?.onOpenChange = { _, _ in }; picker?.onConfirm = { _ in }
            layer?.removeFromSuperview()
            complete(reason == .dismissed ? outcome : original)
        }
        layer.attach(picker); picker.open = true
        return { [weak picker] in outcome = original; picker?.open = false }
    }

    private static func datePicker(_ options: DatePickerOptions, _ window: UIWindow,
                                   _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        let layer = PresentationLayer(window: window)
        let picker = TimePicker()
        picker.title = options.title.isEmpty ? nil : options.title
        picker.mode = timeMode(options.mode); picker.value = options.value; picker.minYear = options.minYear; picker.maxYear = options.maxYear
        picker.confirmText = options.confirmText; picker.cancelText = options.cancelText
        let original = PresentationResult(confirm: false, cancel: true, value: "")
        var outcome = original
        picker.onConfirm = { value in outcome = PresentationResult(confirm: true, cancel: false, value: value) }
        picker.onOpenChange = { [weak picker] open, _ in if !open { picker?.open = false } }
        picker.onClosed = { [weak picker, weak layer] reason in
            picker?.onClosed = { _ in }; picker?.onOpenChange = { _, _ in }; picker?.onConfirm = { _ in }
            layer?.removeFromSuperview()
            complete(reason == .dismissed ? outcome : original)
        }
        layer.attach(picker); picker.open = true
        return { [weak picker] in outcome = original; picker?.open = false }
    }

    private static func bottomSheet(_ options: BottomSheetOptions, _ window: UIWindow,
                                    _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        let layer = PresentationLayer(window: window)
        let sheet = ScrollBottomSheet()
        sheet.title = options.title.isEmpty ? nil : options.title; sheet.dismissible = options.dismissible
        let label = UILabel(); label.text = options.content; label.numberOfLines = 0
        label.font = .systemFont(ofSize: UiDesign.font.content); label.textColor = UiTheme.text
        sheet.content.addArrangedSubview(label)
        var outcome = PresentationResult(confirm: false, cancel: true)
        let close: (Bool) -> Void = { [weak sheet] confirmed in
            guard let sheet, sheet.open else { return }
            outcome = PresentationResult(confirm: confirmed, cancel: !confirmed); sheet.open = false
        }
        sheet.footer = PopupActionButtons(cancelText: options.cancelText, confirmText: options.confirmText, showCancel: options.showCancel,
            onCancel: { close(false) }, onConfirm: { close(true) })
        sheet.onOpenChange = { open, _ in if !open { close(false) } }
        sheet.onClosed = { [weak sheet, weak layer] reason in
            sheet?.onClosed = { _ in }; sheet?.onOpenChange = { _, _ in }
            layer?.removeFromSuperview()
            complete(reason == .dismissed ? outcome : PresentationResult(confirm: false, cancel: true))
        }
        layer.attach(sheet); sheet.open = true
        return { close(false) }
    }

    private static func imagePreview(_ options: ImagePreviewOptions, _ window: UIWindow,
                                     _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        let layer = PresentationLayer(window: window)
        let preview = ImagePreview(imageLoader: AppImages.load)
        preview.sources = options.urls.compactMap(URL.init(string:)); preview.index = options.urls.firstIndex(of: options.current) ?? 0
        var index = preview.index
        preview.onIndexChange = { index = $0 }
        preview.onOpenChange = { [weak preview] open, _ in if !open { preview?.open = false } }
        var cancelled = false
        preview.onClosed = { [weak preview, weak layer] reason in
            preview?.onClosed = { _ in }; preview?.onOpenChange = { _, _ in }; preview?.onIndexChange = { _ in }
            layer?.removeFromSuperview()
            let finished = reason == .dismissed && !cancelled
            complete(PresentationResult(confirm: finished, cancel: !finished, value: options.urls[index], index: index))
        }
        layer.attach(preview); preview.open = true
        return { [weak preview] in cancelled = true; preview?.open = false }
    }

    private static func topController(_ window: UIWindow) -> UIViewController? {
        var controller = window.rootViewController
        while let presented = controller?.presentedViewController, !presented.isBeingDismissed { controller = presented }
        return controller
    }

    private static func timeMode(_ mode: String) -> TimePickMode {
        switch mode {
        case "year": return .year
        case "year-month": return .yearMonth
        case "time": return .time
        case "datetime": return .datetime
        default: return .date
        }
    }
}

/// One presentation's layer over the whole window. It carries the OverlayScope the NativeRoutesUI components register
/// with; AppUI's queue already ties the presentation to its page, so the scope only puts the overlay on top.
@MainActor
private final class PresentationLayer: UIView {
    private var overlays: [String: (String) -> Void] = [:]

    init(window: UIWindow) {
        super.init(frame: window.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let scope = OverlayScope(
            register: { [unowned self] id, _, event in
                overlays[id] = event
                event("top")
                return true
            },
            update: { _, _, _ in },
            remove: { [unowned self] id in overlays[id] = nil }
        )
        scope.install(on: self)
        window.addSubview(self)
    }

    required init?(coder: NSCoder) { fatalError() }

    func attach(_ overlay: UIView) {
        addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: topAnchor), overlay.bottomAnchor.constraint(equalTo: bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: leadingAnchor), overlay.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        layoutIfNeeded()
    }

    // Only the overlay takes touches.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}
