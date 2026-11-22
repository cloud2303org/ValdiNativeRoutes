import UIKit

/// Holds the page stack once the route table has loaded, and presents the full-screen cover. Pages handle their own
/// keyboard avoidance through `app_ui` keyboard components (`KeyboardStickyView`, `KeyboardAvoidingView`,
/// `KeyboardAwareScrollView`).
final class RootController: UIViewController {
    private var navigator: Navigator?
    private var splash: InitialContentSplashOverlay?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        splash = StartupSplashScreen.shared.attach(
            to: view,
            roots: { [weak self] in self?.navigator?.initialContentRoots() },
            onFailure: { [weak self] error in self?.showStartupFailure(error) }
        )
        ValdiHost.shared.start { [weak self] routes in self?.start(routes) }
    }

    private func start(_ routes: RouteTable) {
        let navigator = Navigator(routes: routes, host: self)
        self.navigator = navigator
        ValdiHost.shared.navigator = navigator
        embed(navigator.stack, in: self)
        splash?.scheduleEvaluation()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        splash?.scheduleEvaluation()
    }

    private func showStartupFailure(_ error: Error) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 24, dy: 24))
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        label.numberOfLines = 0
        label.textAlignment = .center
        label.text = error.localizedDescription
        view.addSubview(label)
    }

    deinit { splash?.dispose() }

    override var preferredStatusBarStyle: UIStatusBarStyle { navigator?.statusBarStyle ?? .default }
}

/// The full-screen cover with its own stack.
final class StackHostController: UIViewController {
    private let stack: StackController
    private weak var navigator: Navigator?

    init(stack: StackController, navigator: Navigator) {
        self.stack = stack
        self.navigator = navigator
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        embed(stack, in: self)
    }

    /// A full-screen presentation shows its own status bar style: the app's, as RootController.
    override var preferredStatusBarStyle: UIStatusBarStyle { navigator?.statusBarStyle ?? .default }
}

/// Both containers display PageEntry.selectedTab; neither owns a second navigation state.
protocol TabsContainer: AnyObject {
    func showSelectedTab()
}

/// UIKit owns the default tab bar's appearance and safe area. Each page loads on first selection and stays.
final class SystemTabsController: UITabBarController, UITabBarControllerDelegate, TabsContainer {
    private let shell: PageEntry
    private let routeTabs: [Tab]
    private weak var navigator: Navigator?

    init(shell: PageEntry, navigator: Navigator) {
        self.shell = shell
        self.navigator = navigator
        let pages = navigator.tabPages(of: shell)
        routeTabs = pages.map(\.tab)
        super.init(nibName: nil, bundle: nil)
        viewControllers = pages.map { tab, entry in
            let page = PageController(entry: entry, navigator: navigator)
            page.tabBarItem = UITabBarItem(title: tab.text, image: Self.image(tab.icon, data: tab.iconData),
                                           selectedImage: Self.image(tab.selectedIcon, data: tab.selectedIconData ?? tab.iconData))
            return page
        }
        delegate = self
        showSelectedTab()
    }

    required init?(coder: NSCoder) { fatalError() }

    /// The shell's selected tab (PageEntry.selectedTab), which switchTab may have changed while it was covered.
    func showSelectedTab() {
        defer { navigator?.updateVisibility() }
        guard let index = routeTabs.firstIndex(where: { $0.route == shell.selectedTab }), index != selectedIndex else { return }
        selectedIndex = index
    }


    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        showSelectedTab()
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        navigator?.selectTab(routeTabs[selectedIndex].route, in: shell)
    }

    /// A res/ silhouette of the app_pages module: normalized to 24pt when decoded from dev base64 bytes, and rendered
    /// as a template so UITabBar applies active/inactive semantic tinting across Light, Dark, and single-icon configs.
    static func image(_ name: String, data: String?) -> UIImage? {
        if let data, let bytes = Data(base64Encoded: data), let raw = UIImage(data: bytes) {
            let maxSide = max(raw.size.width, raw.size.height)
            let scaled: UIImage
            if maxSide > 24, let cgImage = raw.cgImage {
                scaled = UIImage(cgImage: cgImage, scale: maxSide / 24.0, orientation: raw.imageOrientation)
            } else {
                scaled = raw
            }
            return scaled.withRenderingMode(.alwaysTemplate)
        }
        return UIImage(named: name, in: ValdiHost.resourceBundle, compatibleWith: nil)?
            .withRenderingMode(.alwaysTemplate)
    }
}

/// Docked custom bars (`bar.height != nil`) anchor at the bottom and propagate `bar.height` through UIKit's
/// `additionalSafeAreaInsets`; explicit overlays (`overlay: true`, `bar.height == nil`) span `view.bounds`.
final class CustomTabsController: UIViewController, TabsContainer {
    private let shell: PageEntry
    private let bar: TabBar
    private let pages: [PageController]
    private weak var navigator: Navigator?
    private var displayedPage: PageController?
    private var safeAreaBottom: CGFloat?
    private var renderedSelection: String?

    init(shell: PageEntry, bar: TabBar, navigator: Navigator) {
        self.shell = shell
        self.bar = bar
        self.navigator = navigator
        let dockedBottom = (bar.height?.doubleValue).flatMap { $0 > 0 ? CGFloat($0) : nil } ?? 0
        pages = navigator.tabPages(of: shell).map { item in
            let controller = PageController(entry: item.entry, navigator: navigator)
            if dockedBottom > 0 {
                controller.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 0, bottom: dockedBottom, right: 0)
            }
            return controller
        }
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        showSelectedTab()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        showSelectedTab()
    }

    func showSelectedTab() {
        guard isViewLoaded, !shell.removed,
              let page = pages.first(where: { $0.entry.route == shell.selectedTab }) else { return }
        if displayedPage !== page {
            let previousPage = displayedPage
            addChild(page)
            page.view.frame = view.bounds
            page.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.insertSubview(page.view, at: 0)
            page.didMove(toParent: self)
            // Keep the previous content attached through the incoming page's first layout, which creates its Valdi
            // root with the attached safe area. This completes UIKit setup, not asynchronous Valdi rendering.
            page.view.setNeedsLayout()
            page.view.layoutIfNeeded()
            previousPage?.willMove(toParent: nil)
            previousPage?.view.removeFromSuperview()
            previousPage?.removeFromParent()
            displayedPage = page
        }
        updateTabBar()
        navigator?.updateVisibility()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        displayedPage?.view.frame = view.bounds
        updateTabBar()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateTabBar()
    }

    private func updateTabBar() {
        guard isViewLoaded, view.bounds.width > 0, view.bounds.height > 0,
              !shell.removed, let navigator else { return }
        let bottom = view.safeAreaInsets.bottom
        if shell.rootView == nil {
            shell.rootView = ValdiHost.shared.createTabBar(bar, shell: shell, safeAreaBottom: bottom, navigator: navigator)
            safeAreaBottom = bottom
            renderedSelection = shell.selectedTab
        } else if bottom != safeAreaBottom || renderedSelection != shell.selectedTab {
            ValdiHost.shared.updateTabBar(bar, shell: shell, safeAreaBottom: bottom)
            safeAreaBottom = bottom
            renderedSelection = shell.selectedTab
        }
        guard let root = shell.rootView else { return }
        if root.superview !== view { view.addSubview(root) }
        if let barHeight = bar.height?.doubleValue, barHeight > 0 {
            let totalHeight = min(view.bounds.height, CGFloat(barHeight) + bottom)
            root.frame = CGRect(x: 0, y: max(0, view.bounds.height - totalHeight), width: view.bounds.width, height: totalHeight)
        } else {
            root.frame = view.bounds
        }
        StartupSplashScreen.shared.contentDidChange()
    }
}

private func embed(_ child: UIViewController, in parent: UIViewController) {
    parent.addChild(child)
    child.view.frame = parent.view.bounds
    child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    parent.view.addSubview(child.view)
    child.didMove(toParent: parent)
}

/// One page in a stack: a Valdi page edge to edge, padding itself with the insets, the tab shell, or a native page
/// (NativeScreens) under the navigation bar.
final class PageController: UIViewController {
    let entry: PageEntry
    private weak var navigator: Navigator?
    private var tabs: (UIViewController & TabsContainer)?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        self.navigator = navigator
        super.init(nibName: nil, bundle: nil)
        title = entry.definition.title
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        guard entry.definition.kind == "valdi", let navigator else { return super.loadView() }
        view = PageContainerView(entry: entry, navigator: navigator)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The embedded Valdi/native page owns its background.
        view.backgroundColor = .clear
        guard let navigator else { return }
        switch entry.definition.kind {
        case "valdi":
            break
        case "tabs":
            guard let bar = navigator.tabBar else { preconditionFailure("Missing tab declaration for \(entry.route)") }
            let tabs: UIViewController & TabsContainer
            if bar.mode == "custom" {
                tabs = CustomTabsController(shell: entry, bar: bar, navigator: navigator)
            } else {
                tabs = SystemTabsController(shell: entry, navigator: navigator)
            }
            self.tabs = tabs
            embed(tabs, in: self)
        default:
            embed(NativeScreens.make(NativePage(entry: entry, navigator: navigator)), in: self)
            entry.nativeContentView = view
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard entry.definition.kind == "native" else { return }
        CATransaction.begin()
        CATransaction.setCompletionBlock { [weak self] in
            guard let self, !entry.removed, view.window != nil else { return }
            entry.nativeContentReady = true
            StartupSplashScreen.shared.contentDidChange()
        }
        view.setNeedsLayout()
        view.setNeedsDisplay()
        CATransaction.commit()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if entry.definition.kind == "native" { StartupSplashScreen.shared.contentDidChange() }
    }

    /// A shell not loaded yet shows its selected tab when it loads.
    func showSelectedTab() {
        tabs?.showSelectedTab()
    }


    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // A page popped or dismissed with an animation is destroyed once it is off screen.
        if entry.removed { entry.destroy() }
    }
}

/// Holds a page's root view sized edge-to-edge to its container; pages handle keyboard avoidance themselves.
final class PageContainerView: UIView {
    let entry: PageEntry
    private weak var navigator: Navigator?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        self.navigator = navigator
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Created on the first layout, once the insets are known; never again for a page that has left.
        guard let rootView = entry.rootView ?? (entry.removed ? nil : createRootView()) else { return }
        if rootView.superview !== self { addSubview(rootView) }
        rootView.frame = bounds
        syncInsets()
        StartupSplashScreen.shared.contentDidChange()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        syncInsets()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        syncInsets()
    }

    private func syncInsets() {
        guard entry.rootView != nil, window != nil else { return }
        let insets = safeAreaInsets
        guard entry.appliedInsets != insets else { return }
        entry.appliedInsets = insets
        ValdiHost.shared.updateInsets(entry, insets: insets)
    }

    private func createRootView() -> SCValdiRootView? {
        guard let navigator else { return nil }
        let insets = safeAreaInsets
        let rootView = ValdiHost.shared.createPage(entry, insets: insets, navigator: navigator)
        entry.rootView = rootView
        entry.appliedInsets = insets
        return rootView
    }
}
