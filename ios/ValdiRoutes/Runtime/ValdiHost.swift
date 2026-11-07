import UIKit
import ValdiRuntime

/// One Valdi runtime for the whole app; every page is a root view inside it.
final class ValdiHost {
    static let shared = ValdiHost()

    /// Shared explicitly by the official loader and the generated native module factory.
    private let videoService = VRVideoService()

    private lazy var runtimeManager: SCValdiRuntimeManager = {
        let videoService = self.videoService
        let manager = SCValdiRuntimeManager()
        // The over-the-air package's modules and images (ValdiOta.swift), chosen before the runtime starts.
        let modules = ValdiOta.start()
        // Applied when the runtime starts, after Valdi's default loader, so remote <image> sources go through SDWebImage.
        manager.updateConfiguration {
            $0.imageLoaders = [AppImageLoader()]
            $0.videoLoaders = [videoService]
            $0.customModuleProvider = modules
            // Device.observeDarkMode (theme.ts) only hears about the appearance with this on.
            $0.allowDarkMode = true
        }
        return manager
    }()

    private var runtime: SCValdiRuntime { runtimeManager.mainRuntime! }

    /// The route table, tab bar and first page, from startApp (app.ts) once it has run; on the main thread.
    func start(completion: @escaping (RouteTable) -> Void) {
        if let started { return completion(started) }
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        MainActor.assumeIsolated { AppUI.imageLoader = AppImages.load }
        let runtime = self.runtime
        videoService.registerModules { VRRegisterNativeModules(runtime) }
        AppNativeModules.register(runtime, navigationHost: navigationHost)
        // App-wide objects (the SQLite connection, api, the router) are created here, not in a page.
        #if DEBUG
        let debug = true
        #else
        let debug = false
        #endif
        VRStartApp.invoke(jsRuntimeProvider: { runtime.jsRuntime()! }, debug: debug) { declaration in
            let table = RouteTable(declaration)
            Task.detached(priority: .background) { await ValdiOta.checkForUpdate() }
            DispatchQueue.main.async { [self] in
                started = table
                waiting.forEach { $0(table) }
                waiting.removeAll()
            }
        }
    }

    private var started: RouteTable?
    private var waiting: [(RouteTable) -> Void] = []

    /// The navigator JS drives (RootController's).
    weak var navigator: Navigator?

    /// The res/ images of app_pages: app_pages.bundle, which the "Valdi modules" build phase (tools/valdi-rolldown) puts in
    /// the app's resources, next to the generated classes (ios/Generated/valdi).
    static let resourceBundle: Bundle? = Bundle(for: VRNavigationHost.self).url(forResource: "app_pages", withExtension: "bundle")
        .flatMap(Bundle.init(url:))

    /// `router` (routes.ts) lands here on the JS thread; the navigator lives on the main thread.
    private lazy var navigationHost = VRNavigationHost(
        push: { [weak self] route, params, navigation in
            self?.onNavigator { $0.open(route, params: params, navigation: navigation) }
        },
        pushForResult: { [weak self] route, params, navigation, onResult in
            self?.onNavigator {
                $0.open(route, params: params, navigation: navigation) { result, canceled in onResult(result, canceled) }
            }
        },
        replace: { [weak self] route, params, navigation in
            self?.onNavigator { $0.replace(route, params: params, navigation: navigation) }
        },
        back: { [weak self] delta in self?.onNavigator { $0.back(Int(delta)) } },
        popToRoot: { [weak self] in self?.onNavigator { $0.popToRoot() } },
        reset: { [weak self] route, params in self?.onNavigator { $0.reset(route, params: params) } },
        switchTab: { [weak self] tab in self?.onNavigator { $0.switchTab(tab) } },
        setStatusBarStyle: { [weak self] style in self?.onNavigator { $0.setStatusBarStyle(style) } },
        currentPages: { [weak self] done in
            DispatchQueue.main.async { done(self?.navigator?.currentPages() ?? []) }
        },
        updateRoutes: { [weak self] declaration in
            let table = RouteTable(declaration)
            DispatchQueue.main.async {
                self?.navigator?.reloadRoutes(table)
                let root = self?.navigator?.rootRoute ?? table.root
                self?.started = table.contains(root) ? table.withRoot(root) : table
            }
        }
    )

    private func onNavigator(_ action: @escaping (Navigator) -> Void) {
        DispatchQueue.main.async { [weak self] in self?.navigator.map(action) }
    }

    func createPage(_ entry: PageEntry, insets: UIEdgeInsets, navigator: Navigator) -> SCValdiRootView {
        let viewModel = viewModel(entry, insets)
        let context = pageContext(entry, navigator)
        guard let component = entry.definition.component else {
            preconditionFailure("Missing Valdi component for \(entry.route)")
        }
        let rootView: SCValdiRootView
        do {
            guard let view = try runtime.loadView(withComponentPath: component, owner: nil,
                                                   viewModel: viewModel, componentContext: context) as? SCValdiRootView else {
                preconditionFailure("No Valdi root view for \(component)")
            }
            rootView = view
        } catch {
            preconditionFailure("Cannot create \(component): \(error)")
        }
        // Valdi's own accessibility tree (labels, buttons) for VoiceOver and UI automation; off unless asked for. The
        // Android runtime exposes its views' accessibility by default.
        rootView.valdiContext?.enableAccessibility = true
        return rootView
    }

    func updateInsets(_ entry: PageEntry, insets: UIEdgeInsets) {
        entry.rootView?.valdiContext?.viewModel = viewModel(entry, insets)
    }

    func createTabBar(_ bar: TabBar, shell: PageEntry, safeAreaBottom: CGFloat,
                      navigator: Navigator) -> SCValdiRootView {
        guard let component = bar.component else { preconditionFailure("Missing custom tab bar component") }
        let context = VRTabBarContext(selectTab: { [weak shell, weak navigator] route in
            DispatchQueue.main.async { [weak shell, weak navigator] in
                guard let shell, let navigator, !shell.removed else { return }
                navigator.selectTab(route, in: shell)
            }
        })
        // JS references native functions weakly. Retain the context with the shell, just as pages retain their root.
        shell.tabBarContext = context
        let root = TabBarRootView(componentPath: component, owner: nil, viewModel: tabBarViewModel(bar, shell, safeAreaBottom),
                                  componentContext: context, runtime: runtime)
        root.backgroundColor = .clear
        root.isOpaque = false
        root.valdiContext?.enableAccessibility = true
        return root
    }

    func updateTabBar(_ bar: TabBar, shell: PageEntry, safeAreaBottom: CGFloat) {
        shell.rootView?.valdiContext?.viewModel = tabBarViewModel(bar, shell, safeAreaBottom)
    }

    private func tabBarViewModel(_ bar: TabBar, _ shell: PageEntry, _ bottom: CGFloat) -> VRTabBarViewModel {
        VRTabBarViewModel(items: bar.tabs, selectedRoute: shell.selectedTab ?? bar.initial, safeAreaBottom: Double(bottom))
    }

    /// The page's visibility changed (Navigator.updateVisibility); a page without its view yet gets it on creation.
    func updateVisibility(_ entry: PageEntry) {
        guard let insets = entry.appliedInsets else { return }
        entry.rootView?.valdiContext?.viewModel = viewModel(entry, insets)
    }

    /// Acceptance only registers the hook. The completion reports the hook itself, on main.
    func requestInitialContentDraw(context: any SCValdiContextProtocol, completion: @escaping (Bool) -> Void) {
        guard !context.destroyed, let jsRuntime = runtime.jsRuntime() else {
            completion(false)
            return
        }
        VRRequestInitialContentDraw.invoke(
            jsRuntimeProvider: { jsRuntime },
            contextId: String(Int32(bitPattern: context.contextId)),
            ready: { DispatchQueue.main.async { completion(true) } }
        ) { accepted in
            if !accepted { DispatchQueue.main.async { completion(false) } }
        }
    }

    private func viewModel(_ entry: PageEntry, _ insets: UIEdgeInsets) -> VRPageViewModel {
        VRPageViewModel(
            pageId: entry.id,
            route: entry.route,
            params: entry.params,
            presentation: entry.presentation.rawValue,
            insets: VRPageInsets(top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right),
            visible: entry.visible,
            visibilityReason: entry.visibilityReason
        )
    }

    // TS calls these on the JS thread; navigation state lives on the main thread. A tab page is not on the stack, so
    // both do nothing for it.
    private func pageContext(_ entry: PageEntry, _ navigator: Navigator) -> VRPageContext {
        VRPageContext(
            finish: { result in DispatchQueue.main.async { navigator.finish(entry.id, result: result) } },
            back: { DispatchQueue.main.async { navigator.cancel(entry.id) } }
        )
    }
}
