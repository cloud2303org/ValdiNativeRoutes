import UIKit
import ValdiRuntime

private let appModalOverlayComponentPath = "AppModalOverlay@app_ui/src/modal_presenter/AppModalOverlay"
private let appSheetOverlayComponentPath = "AppSheetOverlay@app_ui/src/sheet_presenter/AppSheetOverlay"

/// Presenters for `AppUI`: modal dialogs (`AppModalOverlay`) and sheets/pickers (`AppSheetOverlay`) render through the
/// single Valdi pipeline, while `previewImage` uses the fullscreen `ImagePreview` overlay.
/// `complete` runs once, after the close animation; the returned closure cancels (AppUI's queue owns the page).
@MainActor
enum AppPresenters {
    static func presentModal(_ options: ModalOptions, in window: UIWindow,
                             runtime: SCValdiRuntime,
                             complete: @escaping (ModalResult) -> Void) throws -> () -> Void {
        let session = try ValdiModalSession(options: options, window: window, runtime: runtime, complete: complete)
        return { [weak session] in
            session?.cancelFromHost()
        }
    }

    static func present(_ options: PresentationOptions, in window: UIWindow,
                        imageLoader: NativeImageLoading.Loader?,
                        complete: @escaping (PresentationResult) -> Void) throws -> () -> Void {
        switch options {
        case .actionSheet, .picker, .datePicker:
            guard let runtime = AppUI.runtime else {
                throw AppUIFailure(message: "E_NO_VALDI_RUNTIME:Configure AppUI.runtime before presenting sheets")
            }
            return try presentValdiSheet(options, in: window, runtime: runtime, complete: complete)
        case let .imagePreview(options):
            guard let imageLoader else {
                throw AppUIFailure(message: "E_NO_IMAGE_LOADER:Configure AppUI.imageLoader before previewImage")
            }
            return imagePreview(options, window, imageLoader, complete)
        }
    }

    private static func presentValdiSheet(_ options: PresentationOptions, in window: UIWindow,
                                          runtime: SCValdiRuntime,
                                          complete: @escaping (PresentationResult) -> Void) throws -> () -> Void {
        window.endEditing(true)
        let session = try ValdiSheetSession(options: options, window: window, runtime: runtime, complete: complete)
        return { [weak session] in
            session?.cancelFromHost()
        }
    }

    private static func imagePreview(_ options: ImagePreviewOptions, _ window: UIWindow,
                                     _ imageLoader: @escaping NativeImageLoading.Loader,
                                     _ complete: @escaping (PresentationResult) -> Void) -> () -> Void {
        let layer = PresentationLayer(window: window)
        let preview = ImagePreview(imageLoader: imageLoader)
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
}

@MainActor
private final class ValdiSheetSession: UIView {
    private let options: PresentationOptions
    private let complete: (PresentationResult) -> Void
    private var context: VRAppSheetOverlayContext?
    private var rootView: SCValdiRootView?
    private var isOpen = true
    private var completed = false
    private var outcome: PresentationResult
    private let bottomInset: Double

    init(options: PresentationOptions, window: UIWindow, runtime: SCValdiRuntime,
         complete: @escaping (PresentationResult) -> Void) throws {
        self.options = options
        self.complete = complete
        self.outcome = options.cancelled()
        self.bottomInset = Double(window.safeAreaInsets.bottom)
        super.init(frame: window.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backgroundColor = .clear
        isOpaque = false

        let overlayContext = VRAppSheetOverlayContext(
            onSelect: { [weak self] rawIndex in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleSelect(Int(rawIndex)) }
                }
            },
            onConfirm: { [weak self] value, rawIndex in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleConfirm(value: value, index: Int(rawIndex)) }
                }
            },
            onCancel: { [weak self] in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleCancel() }
                }
            },
            onDismissed: { [weak self] in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleDismissed() }
                }
            }
        )
        // Valdi contexts hold componentContext weakly; retain strongly for the presentation lifetime.
        self.context = overlayContext

        let initialVM = Self.makeViewModel(options: options, open: true, bottomInset: bottomInset)
        guard let loaded = try runtime.loadView(
            withComponentPath: appSheetOverlayComponentPath,
            owner: nil,
            viewModel: initialVM,
            componentContext: overlayContext
        ) as? SCValdiRootView else {
            self.context = nil
            throw AppUIFailure(message: "E_VALDI_SHEET_VIEW:Failed to load AppSheetOverlay")
        }

        loaded.frame = bounds
        loaded.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        loaded.backgroundColor = .clear
        loaded.isOpaque = false
        loaded.valdiContext?.enableAccessibility = true
        self.rootView = loaded

        addSubview(loaded)
        window.addSubview(self)
        layoutIfNeeded()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    private func handleSelect(_ index: Int) {
        guard isOpen, case let .actionSheet(sheetOptions) = options else { return }
        outcome = PresentationResult(
            confirm: true,
            cancel: false,
            value: sheetOptions.itemList[index],
            index: index
        )
        isOpen = false
        pushViewModel()
    }

    private func handleConfirm(value: String, index: Int) {
        guard isOpen else { return }
        switch options {
        case .picker:
            outcome = PresentationResult(confirm: true, cancel: false, value: value, index: index)
        default:
            outcome = PresentationResult(confirm: true, cancel: false, value: value)
        }
        isOpen = false
        pushViewModel()
    }

    private func handleCancel() {
        guard isOpen else { return }
        outcome = options.cancelled()
        isOpen = false
        pushViewModel()
    }

    func cancelFromHost() {
        handleCancel()
    }

    private func handleDismissed() {
        guard !completed else { return }
        completed = true
        let root = rootView
        rootView = nil
        root?.valdiContext?.destroy()
        context = nil
        removeFromSuperview()
        complete(outcome)
    }

    private func pushViewModel() {
        guard let valdiContext = rootView?.valdiContext, !valdiContext.destroyed else { return }
        valdiContext.viewModel = Self.makeViewModel(options: options, open: isOpen, bottomInset: bottomInset)
    }

    private static func makeViewModel(options: PresentationOptions, open: Bool,
                                      bottomInset: Double) -> VRAppSheetOverlayViewModel {
        switch options {
        case let .actionSheet(opts):
            return VRAppSheetOverlayViewModel(
                open: open,
                kind: "actionSheet",
                title: opts.alertText,
                confirmText: "",
                cancelText: "取消",
                items: opts.itemList,
                options: [],
                value: "",
                dateMode: "date",
                minYear: 2000,
                maxYear: 2100,
                bottomInset: bottomInset
            )
        case let .picker(opts):
            return VRAppSheetOverlayViewModel(
                open: open,
                kind: "picker",
                title: opts.title,
                confirmText: opts.confirmText,
                cancelText: opts.cancelText,
                items: [],
                options: opts.options.map { VRPickerOption(value: $0.value, label: $0.label) },
                value: opts.value,
                dateMode: "date",
                minYear: 2000,
                maxYear: 2100,
                bottomInset: bottomInset
            )
        case let .datePicker(opts):
            return VRAppSheetOverlayViewModel(
                open: open,
                kind: "datePicker",
                title: opts.title,
                confirmText: opts.confirmText,
                cancelText: opts.cancelText,
                items: [],
                options: [],
                value: opts.value,
                dateMode: opts.mode,
                minYear: Double(opts.minYear),
                maxYear: Double(opts.maxYear),
                bottomInset: bottomInset
            )
        case .imagePreview:
            preconditionFailure("imagePreview uses ImagePreview presenter")
        }
    }
}

@MainActor
private final class ValdiModalSession: UIView {
    private let options: ModalOptions
    private let complete: (ModalResult) -> Void
    private var context: VRAppModalOverlayContext?
    private var rootView: SCValdiRootView?
    private var keyboardSubscription: AppUIKeyboardSubscription?
    private var isOpen = true
    private var completed = false
    private var outcome: ModalResult = .cancelled
    private let topInset: Double
    private let bottomInset: Double

    init(options: ModalOptions, window: UIWindow, runtime: SCValdiRuntime,
         complete: @escaping (ModalResult) -> Void) throws {
        self.options = options
        self.complete = complete
        self.topInset = Double(window.safeAreaInsets.top)
        self.bottomInset = Double(window.safeAreaInsets.bottom)
        super.init(frame: window.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backgroundColor = .clear
        isOpaque = false
        accessibilityViewIsModal = true

        let overlayContext = VRAppModalOverlayContext(
            onConfirm: { [weak self] content in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleConfirm(content: content) }
                }
            },
            onCancel: { [weak self] in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleCancel() }
                }
            },
            onDismissed: { [weak self] in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.handleDismissed() }
                }
            }
        )
        // Valdi contexts hold componentContext weakly; retain strongly for the presentation lifetime.
        self.context = overlayContext

        let initialVM = Self.makeViewModel(
            options: options,
            open: true,
            topInset: topInset,
            bottomInset: bottomInset
        )
        guard let loaded = try runtime.loadView(
            withComponentPath: appModalOverlayComponentPath,
            owner: nil,
            viewModel: initialVM,
            componentContext: overlayContext
        ) as? SCValdiRootView else {
            self.context = nil
            throw AppUIFailure(message: "E_VALDI_MODAL_VIEW:Failed to load AppModalOverlay")
        }

        loaded.frame = bounds
        loaded.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        loaded.backgroundColor = .clear
        loaded.isOpaque = false
        loaded.valdiContext?.enableAccessibility = true
        self.rootView = loaded

        addSubview(loaded)
        window.addSubview(self)
        AppUIKeyboardObserver.shared.prepare()
        keyboardSubscription = AppUIKeyboardObserver.shared.observe { [weak self] _ in
            self?.keyboardDidMove()
        }
        keyboardDidMove()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    private func keyboardDidMove() {
        setNeedsLayout()
        layoutIfNeeded()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let keyboard = AppUIKeyboardObserver.shared.height
        rootView?.frame = CGRect(x: 0, y: 0, width: bounds.width, height: max(0, bounds.height - keyboard))
    }

    override func accessibilityPerformEscape() -> Bool {
        handleCancel()
        return true
    }

    private func handleConfirm(content: String) {
        guard isOpen else { return }
        outcome = ModalResult(confirm: true, cancel: false, content: options.editable ? content : "")
        isOpen = false
        endEditing(true)
        pushViewModel()
    }

    private func handleCancel() {
        guard isOpen else { return }
        outcome = .cancelled
        isOpen = false
        endEditing(true)
        pushViewModel()
    }

    func cancelFromHost() {
        handleCancel()
    }

    private func handleDismissed() {
        guard !completed else { return }
        completed = true
        keyboardSubscription = nil
        let root = rootView
        rootView = nil
        root?.valdiContext?.destroy()
        context = nil
        removeFromSuperview()
        complete(outcome)
    }

    private func pushViewModel() {
        guard let valdiContext = rootView?.valdiContext, !valdiContext.destroyed else { return }
        valdiContext.viewModel = Self.makeViewModel(
            options: options,
            open: isOpen,
            topInset: topInset,
            bottomInset: bottomInset
        )
    }

    private static func makeViewModel(options: ModalOptions, open: Bool,
                                      topInset: Double, bottomInset: Double) -> VRAppModalOverlayViewModel {
        VRAppModalOverlayViewModel(
            open: open,
            title: options.title,
            content: options.content,
            showCancel: options.showCancel,
            confirmText: options.confirmText,
            cancelText: options.cancelText,
            editable: options.editable,
            placeholderText: options.placeholderText,
            defaultText: options.defaultText,
            topInset: topInset,
            bottomInset: bottomInset
        )
    }
}

/// Full-window layer for `ImagePreview`, carrying `OverlayScope` registration.
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
