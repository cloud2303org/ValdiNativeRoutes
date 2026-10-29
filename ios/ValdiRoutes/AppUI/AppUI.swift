import UIKit

// The native side of `api` (valdi/modules/app_pages/src/api.ts), after ExpoNativeRoutes' AppUI: Valdi pages reach it
// through AppUIHost, native pages call `app.ui` directly. Every page here is drawn by the host, so the modal and the
// presentations (AppPresenters, on the NativeRoutesUI components) are always the host's own, over whichever page is on top.

struct ModalOptions {
    var title = ""
    var content = ""
    var showCancel = true
    var confirmText = "确定"
    var cancelText = "取消"
    var editable = false
    var placeholderText = ""
    var defaultText = ""
}

struct ModalResult {
    let confirm: Bool
    let cancel: Bool
    var content = ""
    var errMsg: String { "showModal:ok" }

    static let cancelled = ModalResult(confirm: false, cancel: true)
}

struct ToastOptions {
    var title: String
    var icon = "success"
    /// Milliseconds.
    var duration: Double = 1500
    var mask = false
}

struct LoadingOptions {
    var title: String
    var mask = false
}

struct APISuccess {
    let errMsg: String
}

// The presentations, as in ExpoNativeRoutes' NativeAppUI. Valdi requests arrive validated and defaulted by `api`
// (schemas.ts); nothing here checks them again, so native callers pass valid options.

struct ActionSheetOptions {
    /// Text above the menu.
    var alertText = ""
    var itemList: [String]
}

struct PickerOptions {
    var title: String
    var options: [PickerOption]
    var value: String
    var confirmText: String
    var cancelText: String

    init(title: String = "", options: [PickerOption], value: String = "", confirmText: String = "确定",
         cancelText: String = "取消") {
        self.title = title
        self.options = options
        self.value = value.isEmpty ? options.first?.value ?? "" : value
        self.confirmText = confirmText
        self.cancelText = cancelText
    }
}

struct DatePickerOptions {
    var title: String
    /// "year", "year-month", "date", "time" or "datetime".
    var mode: String
    /// YYYY, YYYY-MM, YYYY-MM-DD, HH:mm or YYYY-MM-DD HH:mm; "" for now.
    var value: String
    var minYear: Int
    var maxYear: Int
    var confirmText: String
    var cancelText: String

    init(title: String = "", mode: String = "date", value: String = "", minYear: Int? = nil, maxYear: Int? = nil,
         confirmText: String = "确定", cancelText: String = "取消") {
        let year = Calendar.current.component(.year, from: Date())
        self.title = title
        self.mode = mode
        self.value = value
        self.minYear = minYear ?? year - 5
        self.maxYear = maxYear ?? year + 5
        self.confirmText = confirmText
        self.cancelText = cancelText
    }
}

struct BottomSheetOptions {
    var title = ""
    var content = ""
    var confirmText = "确定"
    var cancelText = "取消"
    var showCancel = true
    var dismissible = true
}

struct ImagePreviewOptions {
    var urls: [String]
    /// One of urls; "" for the first.
    var current = ""
}

/// Shared reply: exactly one of confirm/cancel; `value` and `index` are the selection (or the image shown last).
struct PresentationResult {
    let confirm: Bool
    let cancel: Bool
    var value = ""
    var index = -1
}

struct ActionSheetResult {
    let tapIndex: Int
    var errMsg: String { "showActionSheet:ok" }
}

struct PickerResult {
    let confirm: Bool
    let cancel: Bool
    let value: String
    let index: Int
    var errMsg: String { "showPicker:ok" }
}

struct DatePickerResult {
    let confirm: Bool
    let cancel: Bool
    let value: String
    var errMsg: String { "showDatePicker:ok" }
}

struct BottomSheetResult {
    let confirm: Bool
    let cancel: Bool
    var errMsg: String { "showBottomSheet:ok" }
}

enum PresentationOptions {
    case actionSheet(ActionSheetOptions)
    case picker(PickerOptions)
    case datePicker(DatePickerOptions)
    case bottomSheet(BottomSheetOptions)
    case imagePreview(ImagePreviewOptions)

    /// The reply when the presentation is cancelled for the user (its page covered or removed, or the call cancelled).
    func cancelled(shown: PresentationResult? = nil) -> PresentationResult {
        switch self {
        // Pickers cancel with no value, as in ExpoNativeRoutes.
        case .picker, .datePicker:
            return PresentationResult(confirm: false, cancel: true, value: "", index: -1)
        case let .imagePreview(options):
            let index = shown?.index ?? options.urls.firstIndex(of: options.current) ?? 0
            return PresentationResult(confirm: false, cancel: true, value: options.urls[index], index: index)
        case .actionSheet, .bottomSheet:
            return PresentationResult(confirm: false, cancel: true)
        }
    }
}

struct AppAPIError: LocalizedError {
    let errMsg: String

    init(_ method: String, _ cause: Error) {
        errMsg = "\(method):fail \(cause.localizedDescription)"
    }

    var errorDescription: String? { errMsg }
}

struct AppUIFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Native callers: `try await app.ui.showModal(ModalOptions(title: "确认操作"))`.
let app = NativeApp()

struct NativeApp {
    let ui = AppUIService()
}

struct AppUIService {
    @MainActor
    func showModal(_ options: ModalOptions = ModalOptions()) async throws -> ModalResult {
        try await api("showModal") {
            var requestId: String?
            return try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { continuation in
                    requestId = AppUI.shared.showModal(options) { continuation.resume(with: $0) }
                }
            } onCancel: {
                Task { @MainActor in requestId.map(AppUI.shared.cancelRequest) }
            }
        }
    }

    /// Cancelling the menu throws "showActionSheet:fail cancel".
    @MainActor
    func showActionSheet(_ options: ActionSheetOptions) async throws -> ActionSheetResult {
        try await api("showActionSheet") {
            let result = try await presentation(.actionSheet(options))
            guard !result.cancel else { throw AppUIFailure(message: "cancel") }
            return ActionSheetResult(tapIndex: result.index)
        }
    }

    @MainActor
    func showPicker(_ options: PickerOptions) async throws -> PickerResult {
        try await api("showPicker") {
            let result = try await presentation(.picker(options))
            return PickerResult(confirm: result.confirm, cancel: result.cancel, value: result.value, index: result.index)
        }
    }

    @MainActor
    func showDatePicker(_ options: DatePickerOptions = DatePickerOptions()) async throws -> DatePickerResult {
        try await api("showDatePicker") {
            let result = try await presentation(.datePicker(options))
            return DatePickerResult(confirm: result.confirm, cancel: result.cancel, value: result.value)
        }
    }

    @MainActor
    func showBottomSheet(_ options: BottomSheetOptions = BottomSheetOptions()) async throws -> BottomSheetResult {
        try await api("showBottomSheet") {
            let result = try await presentation(.bottomSheet(options))
            return BottomSheetResult(confirm: result.confirm, cancel: result.cancel)
        }
    }

    /// Completes when the preview is closed or its page goes away.
    @discardableResult @MainActor
    func previewImage(_ options: ImagePreviewOptions) async throws -> APISuccess {
        try await api("previewImage") {
            _ = try await presentation(.imagePreview(options))
            return APISuccess(errMsg: "previewImage:ok")
        }
    }

    /// Closing the scanner throws "scanCode:fail cancel".
    @MainActor
    func scanCode() async throws -> ScanCodeResult {
        try await api("scanCode") {
            try await withCheckedThrowingContinuation { continuation in
                AppUI.shared.scanCode { continuation.resume(with: $0) }
            }
        }
    }

    /// source: "photos", "camera" or "files". Cancelling answers `canceled`, it doesn't throw.
    @MainActor
    func pickAttachments(_ source: String, _ options: AttachmentPickOptions = AttachmentPickOptions()) async throws
        -> AttachmentSelection {
        try await api("pickAttachments") {
            try await withCheckedThrowingContinuation { continuation in
                AppUI.shared.pickAttachments(source, options) { continuation.resume(with: $0) }
            }
        }
    }

    func clearAttachmentCache() async throws -> APISuccess {
        try await api("clearAttachmentCache") {
            try await AppUI.clearAttachmentCache()
            return APISuccess(errMsg: "clearAttachmentCache:ok")
        }
    }

    @MainActor
    private func presentation(_ options: PresentationOptions) async throws -> PresentationResult {
        var requestId: String?
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                requestId = AppUI.shared.showPresentation(options) { continuation.resume(with: $0) }
            }
        } onCancel: {
            Task { @MainActor in requestId.map(AppUI.shared.cancelRequest) }
        }
    }

    @MainActor
    func showToast(_ options: ToastOptions) async throws -> APISuccess {
        try await api("showToast") { try AppUI.shared.showToast(options); return APISuccess(errMsg: "showToast:ok") }
    }

    @MainActor
    func hideToast() async throws -> APISuccess {
        AppUI.shared.hideToast()
        return APISuccess(errMsg: "hideToast:ok")
    }

    @MainActor
    func showLoading(_ options: LoadingOptions) async throws -> APISuccess {
        try await api("showLoading") { try AppUI.shared.showLoading(options); return APISuccess(errMsg: "showLoading:ok") }
    }

    @MainActor
    func hideLoading() async throws -> APISuccess {
        AppUI.shared.hideLoading()
        return APISuccess(errMsg: "hideLoading:ok")
    }

    private func api<T>(_ method: String, _ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw AppAPIError(method, error)
        }
    }
}

/**
 * Main-thread presentation state. The modal and the presentations (action sheet, pickers, bottom sheet, image preview)
 * share one serial queue: each is owned by the page on top when it is shown and is cancelled when that page is covered
 * or removed, and settles only after its close animation. Toast and Loading have their own windows above them.
 */
@MainActor
final class AppUI {
    static let shared = AppUI()

    private enum Kind {
        case modal(ModalOptions, (Result<ModalResult, Error>) -> Void)
        case presentation(PresentationOptions, (Result<PresentationResult, Error>) -> Void)
    }

    private enum Reply {
        case modal(ModalResult)
        case presentation(PresentationResult)
    }

    private final class Request {
        let id = UUID().uuidString
        let kind: Kind
        /// Closes the presentation; its reply still arrives after the close animation.
        var cancel: (() -> Void)?
        var cancelled = false

        init(_ kind: Kind) { self.kind = kind }

        func settle(_ reply: Reply) {
            switch (kind, reply) {
            case let (.modal(_, done), .modal(result)):
                done(.success(cancelled ? .cancelled : result))
            case let (.presentation(options, done), .presentation(result)):
                done(.success(cancelled && result.confirm ? options.cancelled(shown: result) : result))
            default:
                fail(AppUIFailure(message: "invalid reply"))
            }
        }

        func settleCancelled() {
            switch kind {
            case let .modal(_, done): done(.success(.cancelled))
            case let .presentation(options, done): done(.success(options.cancelled()))
            }
        }

        func fail(_ error: Error) {
            switch kind {
            case let .modal(_, done): done(.failure(error))
            case let .presentation(_, done): done(.failure(error))
            }
        }
    }

    private var pending: [Request] = []
    private var active: Request?
    private var activePageId: String?
    private var dialog: AppDialogView?
    private var dialogResult: ModalResult?
    private var topPageId: String?
    private let feedback = FeedbackHost()

    /// The host reports the page on top: the stack's last page, or the sheet above it.
    func topPageChanged(_ pageId: String?) {
        guard topPageId != pageId else { return }
        topPageId = pageId
        if active != nil, activePageId != pageId { cancelActive() }
        schedule()
    }

    @discardableResult
    func showModal(_ options: ModalOptions, done: @escaping (Result<ModalResult, Error>) -> Void) -> String {
        enqueue(Request(.modal(options, done)))
    }

    @discardableResult
    func showPresentation(_ options: PresentationOptions,
                          done: @escaping (Result<PresentationResult, Error>) -> Void) -> String {
        // Options arrive checked: `api` validates them once in TS (schemas.ts); native callers pass valid ones.
        enqueue(Request(.presentation(options, done)))
    }

    func cancelRequest(_ requestId: String) {
        if let index = pending.firstIndex(where: { $0.id == requestId }) {
            pending.remove(at: index).settleCancelled()
        }
        if active?.id == requestId { cancelActive() }
    }

    private func enqueue(_ request: Request) -> String {
        pending.append(request)
        schedule()
        return request.id
    }

    func showToast(_ options: ToastOptions) throws {
        try feedback.showToast(options)
    }

    func hideToast() {
        feedback.hideToast()
    }

    func showLoading(_ options: LoadingOptions) throws {
        try feedback.showLoading(options)
    }

    func hideLoading() {
        feedback.hideLoading()
    }

    // MARK: Scanner and attachments

    // As ExpoNativeRoutes' HybridUI: system view controllers presented over the whole app, outside the modal queue and
    // page ownership. One of each at a time, each from a PresenterWindow of its own.

    private var scanner: CodeScanner?
    private var picker: AttachmentPicker?

    func scanCode(_ done: @escaping (Result<ScanCodeResult, Error>) -> Void) {
        guard scanner == nil else { return done(.failure(AppUIFailure(message: "scanner already open"))) }
        guard let window = PresenterWindow.open() else { return done(.failure(AppUIFailure(message: "no foreground view controller"))) }
        let scanner = CodeScanner()
        self.scanner = scanner
        scanner.scanCode(from: window.controller) { [weak self] result in
            window.close()
            if self?.scanner === scanner { self?.scanner = nil }
            done(result.mapError { $0 })
        }
    }

    func pickAttachments(_ source: String, _ options: AttachmentPickOptions,
                         _ done: @escaping (Result<AttachmentSelection, Error>) -> Void) {
        guard picker == nil else { return done(.failure(AppUIFailure(message: "E_PICKER_BUSY:Attachment picker already open"))) }
        guard let window = PresenterWindow.open() else { return done(.failure(AppUIFailure(message: "E_NO_PRESENTER:No active presenter"))) }
        let picker = AttachmentPicker()
        self.picker = picker
        do {
            try picker.pick(source: source, options: options, from: window.controller) { [weak self] result in
                window.close()
                if self?.picker === picker { self?.picker = nil }
                done(result.mapError { AppUIFailure(message: "\($0.code):\($0.localizedDescription)") })
            }
        } catch let error as AttachmentPickerError {
            window.close()
            self.picker = nil
            done(.failure(AppUIFailure(message: "\(error.code):\(error.localizedDescription)")))
        } catch {
            window.close()
            self.picker = nil
            done(.failure(error))
        }
    }

    /// Off the main thread: the cache may hold many files.
    nonisolated static func clearAttachmentCache() async throws {
        try await Task.detached(priority: .utility) { try AttachmentCache.clear() }.value
    }

    private func schedule() {
        DispatchQueue.main.async { [self] in dispatch() }
    }

    private func dispatch() {
        guard active == nil, !pending.isEmpty, let pageId = topPageId else { return }
        guard let window = FeedbackHost.appWindow else {
            pending.removeFirst().fail(AppUIFailure(message: "No foreground window"))
            return schedule()
        }
        let request = pending.removeFirst()
        active = request
        activePageId = pageId
        let requestId = request.id
        switch request.kind {
        case let .modal(options, _):
            dialogResult = nil
            let dialog = AppDialogView(options: options) { [weak self] result in self?.closeDialog(requestId, result) }
            self.dialog = dialog
            request.cancel = { [weak self] in self?.closeDialog(requestId, .cancelled) }
            dialog.present(in: window)
        case let .presentation(options, _):
            let cancel = AppPresenters.present(options, in: window) { [weak self] result in
                self?.finish(requestId, .presentation(result))
            }
            if active === request { request.cancel = cancel }
        }
    }

    /// Covering or removing the page: the presentation animates out, then settles as cancelled.
    private func cancelActive() {
        guard let request = active, !request.cancelled else { return }
        request.cancelled = true
        request.cancel?()
    }

    /// Animates the dialog out, then settles the request.
    private func closeDialog(_ requestId: String, _ result: ModalResult) {
        guard active?.id == requestId, dialogResult == nil, let dialog else { return }
        dialogResult = result
        dialog.dismiss { [weak self] in self?.finish(requestId, .modal(result)) }
    }

    private func finish(_ requestId: String, _ reply: Reply) {
        guard let request = active, request.id == requestId else { return }
        active = nil
        activePageId = nil
        dialog = nil
        dialogResult = nil
        request.cancel = nil
        request.settle(reply)
        schedule()
    }
}

/// A clear window just above the app for one system controller, so it never shares the app's presentation chain with
/// the full-screen cover. (Under the former SwiftUI stack, dismissing one presented from the root controller made the
/// NavigationStack show its root page while its path still held the pushed ones.)
@MainActor
private final class PresenterWindow: UIWindow {
    private weak var app: UIWindow?

    var controller: UIViewController { rootViewController! }

    static func open() -> PresenterWindow? {
        guard let app = FeedbackHost.appWindow, let scene = app.windowScene else { return nil }
        let window = PresenterWindow(windowScene: scene)
        window.app = app
        window.frame = app.bounds
        // Below Toast and Loading.
        window.windowLevel = UIWindow.Level(rawValue: app.windowLevel.rawValue + 1)
        let controller = UIViewController()
        controller.view.backgroundColor = .clear
        window.rootViewController = controller
        window.isHidden = false
        return window
    }

    func close() {
        isHidden = true
        if app?.isKeyWindow == false { app?.makeKey() }
    }
}

// MARK: - Toast and Loading

/// Ported from ExpoNativeRoutes (NativeRoutesUI/ToastHost.swift): Toast and Loading each own a window above the app
/// (Toast above Loading). A mask swallows touches without taking the keyboard.
@MainActor
private final class FeedbackHost {
    private let toast = FeedbackSlot()
    private let loading = FeedbackSlot()

    static var appWindow: UIWindow? {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first { $0.isKeyWindow && !($0 is FeedbackWindow) && !($0 is PresenterWindow) }
    }

    func showToast(_ options: ToastOptions) throws {
        try present(toast, title: options.title, icon: options.icon, milliseconds: options.duration, mask: options.mask, level: 2)
    }

    func showLoading(_ options: LoadingOptions) throws {
        try present(loading, title: options.title, icon: "loading", milliseconds: nil, mask: options.mask, level: 1)
    }

    func hideToast() { toast.clear() }

    func hideLoading() { loading.clear() }

    private func present(_ slot: FeedbackSlot, title: String, icon: String, milliseconds: Double?, mask: Bool,
                         level: CGFloat) throws {
        slot.clear()
        guard let source = Self.appWindow, let scene = source.windowScene else {
            throw AppUIFailure(message: "No foreground window")
        }
        let window = FeedbackWindow(windowScene: scene)
        window.blocksTouches = mask
        window.frame = source.bounds
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + level)
        window.backgroundColor = .clear
        window.rootViewController = ToastController(message: title, mode: icon)
        slot.window = window
        window.isHidden = false
        if let milliseconds {
            let work = DispatchWorkItem { [weak slot, weak window] in
                if slot?.window === window { slot?.clear() }
            }
            slot.expiry = work
            DispatchQueue.main.asyncAfter(deadline: .now() + milliseconds / 1000, execute: work)
        }
        UIAccessibility.post(notification: .announcement, argument: title)
    }
}

@MainActor
private final class FeedbackSlot {
    var window: FeedbackWindow?
    var expiry: DispatchWorkItem?

    func clear() {
        expiry?.cancel()
        expiry = nil
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
    }
}

private final class FeedbackWindow: UIWindow {
    var blocksTouches = false

    override var canBecomeKey: Bool { false }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        blocksTouches ? super.hitTest(point, with: event) : nil
    }
}

private final class ToastController: UIViewController {
    private let panel = UIView()

    init(message: String, mode: String) {
        super.init(nibName: nil, bundle: nil)
        view.backgroundColor = .clear
        let marked = mode != "none"
        panel.translatesAutoresizingMaskIntoConstraints = false
        panel.backgroundColor = UIColor(red: 24 / 255, green: 28 / 255, blue: 35 / 255, alpha: 0.94)
        panel.layer.cornerRadius = marked ? 16 : 12

        let label = UILabel()
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.minimumLineHeight = 22
        paragraph.maximumLineHeight = 22
        label.attributedText = NSAttributedString(string: message, attributes: [
            .font: UIFont.systemFont(ofSize: 15), .foregroundColor: UIColor.white, .paragraphStyle: paragraph,
        ])
        label.numberOfLines = 0
        label.accessibilityIdentifier = "app-toast-message"

        let body = UIStackView()
        body.axis = .vertical
        body.alignment = .center
        body.spacing = 12
        body.translatesAutoresizingMaskIntoConstraints = false
        if mode == "loading" {
            let spinner = UIActivityIndicatorView(style: .large)
            spinner.color = .white
            spinner.startAnimating()
            body.addArrangedSubview(spinner)
        } else if marked {
            let icon = UIImageView(image: UIImage(systemName: mode == "error" ? "xmark" : "checkmark",
                                                  withConfiguration: UIImage.SymbolConfiguration(pointSize: 36, weight: .medium)))
            icon.tintColor = .white
            icon.contentMode = .scaleAspectFit
            icon.widthAnchor.constraint(equalToConstant: 48).isActive = true
            icon.heightAnchor.constraint(equalToConstant: 48).isActive = true
            body.addArrangedSubview(icon)
        }
        body.addArrangedSubview(label)
        panel.addSubview(body)
        view.addSubview(panel)

        let inset: CGFloat = marked ? 20 : 18
        let vertical: CGFloat = marked ? 20 : 12
        NSLayoutConstraint.activate([
            panel.widthAnchor.constraint(greaterThanOrEqualToConstant: marked ? 136 : 0),
            panel.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
            panel.heightAnchor.constraint(greaterThanOrEqualToConstant: marked ? 136 : 48),
            panel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            panel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            panel.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            panel.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            body.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: inset),
            body.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -inset),
            body.topAnchor.constraint(equalTo: panel.topAnchor, constant: vertical),
            body.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -vertical),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }
}
