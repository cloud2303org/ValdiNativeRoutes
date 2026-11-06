import UIKit
import ValdiRuntime

/// Synchronous policy changes never wait for UIKit or the JS queue.
final class StartupSplashScreen: NSObject, VRSplashScreenHost {
    static let shared = StartupSplashScreen()
    private let state = StartupSplashState()
    private weak var current: InitialContentSplashOverlay?

    func attach(to content: UIView, roots: @escaping () -> [SCValdiRootView]?,
                onFailure: @escaping (Error) -> Void) -> InitialContentSplashOverlay {
        current?.dispose()
        let overlay = InitialContentSplashOverlay(content: content, state: state, roots: roots, onFailure: onFailure)
        current = overlay
        return overlay
    }

    func preventAutoHide() -> Bool {
        let accepted = state.preventAutoHide()
        if accepted { DispatchQueue.main.async { [weak self] in self?.contentDidChange() } }
        return accepted
    }

    func hide() {
        state.hide()
        DispatchQueue.main.async { [weak self] in self?.contentDidChange() }
    }

    func contentDidChange() {
        current?.scheduleEvaluation()
    }
}

final class SplashScreenModuleFactory: VRSplashScreenNativeModuleFactory {
    private let module = SplashScreenModule()
    override func onLoadModule() -> any VRSplashScreenNativeModule { module }
}

private final class SplashScreenModule: NSObject, VRSplashScreenNativeModule {
    func getHost() -> any VRSplashScreenHost { StartupSplashScreen.shared }
}

/// Like Expo's loading view, this is the system launch storyboard hosted above live content.
/// Readiness is a Valdi transaction callback, not an assertion that pixels have been presented.
final class InitialContentSplashOverlay {
    private final class Request {
        let revision: UInt64
        let context: any SCValdiContextProtocol
        let model: AnyObject?
        let frame: CGRect
        let bounds: CGRect
        let safeArea: UIEdgeInsets
        var ready = false

        init(root: SCValdiRootView, context: any SCValdiContextProtocol, revision: UInt64) {
            self.revision = revision
            self.context = context
            model = context.viewModel as AnyObject?
            frame = root.frame
            bounds = root.bounds
            safeArea = root.safeAreaInsets
        }

        func matches(_ root: SCValdiRootView, revision: UInt64, window: UIWindow) -> Bool {
            self.revision == revision && root.valdiContext === context && !context.destroyed &&
                model === (context.viewModel as AnyObject?) && root.window === window &&
                frame == root.frame && bounds == root.bounds && safeArea == root.safeAreaInsets
        }
    }

    private weak var content: UIView?
    private weak var ownerWindow: UIWindow?
    private let state: StartupSplashState
    private let roots: () -> [SCValdiRootView]?
    private let onFailure: (Error) -> Void
    private let loadingView: UIView
    private var requests: [ObjectIdentifier: Request] = [:]
    private var active = true
    private var scheduled = false

    init(content: UIView, state: StartupSplashState, roots: @escaping () -> [SCValdiRootView]?,
         onFailure: @escaping (Error) -> Void) {
        self.content = content
        self.state = state
        self.roots = roots
        self.onFailure = onFailure
        let name = Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String ?? "SplashScreen"
        guard let controller = UIStoryboard(name: name, bundle: nil).instantiateInitialViewController() else {
            preconditionFailure("Missing initial controller in \(name).storyboard")
        }
        loadingView = controller.view
        loadingView.frame = content.bounds
        loadingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        loadingView.isAccessibilityElement = true
        loadingView.accessibilityLabel = "正在启动"
        loadingView.accessibilityIdentifier = "startup.splash"
        loadingView.accessibilityViewIsModal = true
        content.addSubview(loadingView)
    }

    func scheduleEvaluation() {
        guard active, !scheduled else { return }
        scheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            scheduled = false
            evaluate()
        }
    }

    private func evaluate() {
        guard active, let content else { return }
        if let attachedWindow = content.window { ownerWindow = attachedWindow }
        // UIKit detaches the presenting root after a full-screen presentation.
        // The loading view and selected cover still belong to the same window.
        guard let window = ownerWindow else { return }
        let revision = state.readinessRevision()
        if state.takeDrawPermission(contentReady: false, readinessRevision: revision) {
            dispose()
            return
        }
        // A window-level overlay also covers a full-screen native presentation during a manual hold.
        if loadingView.superview !== window { window.addSubview(loadingView) }
        loadingView.frame = window.bounds
        window.bringSubviewToFront(loadingView)
        content.layoutIfNeeded()
        guard content.bounds.width > 0, content.bounds.height > 0, let selectedRoots = roots() else { return }
        let identifiers = Set(selectedRoots.map(ObjectIdentifier.init))
        requests = requests.filter { identifiers.contains($0.key) }
        for root in selectedRoots {
            guard root.window === window, root.bounds.width > 0, root.bounds.height > 0,
                  let context = root.valdiContext, !context.destroyed else { return }
            root.layoutIfNeeded()
            let key = ObjectIdentifier(root)
            if requests[key]?.matches(root, revision: revision, window: window) == true { continue }
            let request = Request(root: root, context: context, revision: revision)
            requests[key] = request
            // Context update completion is only the fence for JS root creation. Never synchronously wait here.
            context.waitUntilRenderCompleted { [weak self, weak root] in
                DispatchQueue.main.async { [weak self, weak root] in
                    guard let self, let root, isCurrent(root, request) else { return }
                    ValdiHost.shared.requestInitialContentDraw(context: request.context) { [weak self, weak root] accepted in
                        guard let self, let root else { return }
                        drawReady(root, request, accepted: accepted)
                    }
                }
            }
        }
        let ready = selectedRoots.allSatisfy {
            requests[ObjectIdentifier($0)]?.ready == true &&
                requests[ObjectIdentifier($0)]?.matches($0, revision: revision, window: window) == true
        }
        if state.takeDrawPermission(contentReady: ready, readinessRevision: revision) { dispose() }
    }

    private func isCurrent(_ root: SCValdiRootView, _ request: Request) -> Bool {
        guard active, requests[ObjectIdentifier(root)] === request,
              let window = ownerWindow, roots()?.contains(where: { $0 === root }) == true else { return false }
        guard request.matches(root, revision: state.readinessRevision(), window: window) else {
            scheduleEvaluation()
            return false
        }
        return true
    }

    private func drawReady(_ root: SCValdiRootView, _ request: Request, accepted: Bool) {
        guard isCurrent(root, request) else { return }
        if !accepted {
            // Failure acceptance and synchronous hide share the same lock/revision check.
            guard state.dispose(readinessRevision: request.revision) else {
                scheduleEvaluation()
                return
            }
            dispose()
            onFailure(NSError(domain: "StartupSplash", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Initial content renderer is unavailable"]))
            return
        }
        request.ready = true
        scheduleEvaluation()
    }

    func dispose() {
        guard active else { return }
        active = false
        requests.removeAll()
        loadingView.removeFromSuperview()
    }

    deinit { loadingView.removeFromSuperview() }
}
