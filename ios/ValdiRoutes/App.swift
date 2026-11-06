import UIKit

extension UIColor {
    static let pageBackground = UIColor(red: 0xf3 / 255, green: 0xf4 / 255, blue: 0xf6 / 255, alpha: 1)
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

/// Named by Info.plist's scene manifest (project.yml).
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = RootController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

/// Holds the page stack once the route table has loaded, and presents the full-screen cover. Nothing in UIKit avoids
/// the keyboard: KeyboardObserver reports its height continuously, and each page container pads itself (PageContainerView).
final class RootController: UIViewController {
    private var navigator: Navigator?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .pageBackground
        ValdiHost.shared.start { [weak self] routes in self?.start(routes) }
    }

    private func start(_ routes: RouteTable) {
        let navigator = Navigator(routes: routes, host: self)
        self.navigator = navigator
        ValdiHost.shared.navigator = navigator
        embed(navigator.stack, in: self)
    }

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

    /// A res/ image of the app_pages module, as is: from the over-the-air package when it has one (ValdiOta.swift), as
    /// the Valdi pages load it; otherwise from app_pages.bundle, where Valdi exports it.
    private static func image(_ name: String, data: String?) -> UIImage? {
        if let data, let bytes = Data(base64Encoded: data), let image = UIImage(data: bytes) {
            return image.withRenderingMode(.alwaysOriginal)
        }
        return (ValdiOta.image(module: "app_pages", name: name) ?? UIImage(named: name, in: ValdiHost.resourceBundle, compatibleWith: nil))?
            .withRenderingMode(.alwaysOriginal)
    }
}

/// Pages occupy the system viewport. The business Valdi root overlays it, with no height measurement or extra inset.
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
        pages = navigator.tabPages(of: shell).map { PageController(entry: $0.entry, navigator: navigator) }
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
            displayedPage?.willMove(toParent: nil)
            displayedPage?.view.removeFromSuperview()
            displayedPage?.removeFromParent()
            addChild(page)
            page.view.frame = view.bounds
            page.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.insertSubview(page.view, at: 0)
            page.didMove(toParent: self)
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
        root.frame = view.bounds
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
    private let navigator: Navigator
    private var tabs: (UIViewController & TabsContainer)?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        self.navigator = navigator
        super.init(nibName: nil, bundle: nil)
        title = entry.definition.title
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        guard entry.definition.kind == "valdi" else { return super.loadView() }
        view = PageContainerView(entry: entry, navigator: navigator)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .pageBackground
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
        }
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

/// Holds a page's root view and is the only place that handles the keyboard: the root view's bottom moves up by the
/// keyboard height, and the bottom safe-area inset drops by the part of it the keyboard covers.
final class PageContainerView: UIView {
    let entry: PageEntry
    private let navigator: Navigator
    /// Insets without the keyboard.
    private var baseInsets = UIEdgeInsets.zero {
        didSet { if baseInsets != oldValue { applyInsets() } }
    }
    private var keyboardSubscription: KeyboardSubscription?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        self.navigator = navigator
        super.init(frame: .zero)
        keyboardSubscription = KeyboardObserver.shared.observe { [weak self] _ in self?.keyboardDidMove() }
    }

    required init?(coder: NSCoder) { fatalError() }

    private static func insets(_ base: UIEdgeInsets) -> UIEdgeInsets {
        var insets = base
        insets.bottom = max(0, base.bottom - KeyboardObserver.shared.height)
        return insets
    }

    private func keyboardDidMove() {
        // A covered page is out of the window; it catches up when it comes back.
        guard window != nil else { return }
        setNeedsLayout()
        layoutIfNeeded()
        applyInsets()
    }

    private func applyInsets() {
        guard case .some = entry.rootView else { return }
        let insets = Self.insets(baseInsets)
        guard entry.appliedInsets != insets else { return }
        entry.appliedInsets = insets
        ValdiHost.shared.updateInsets(entry, insets: insets)
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        baseInsets = safeAreaInsets
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        KeyboardObserver.shared.prepare()
        keyboardDidMove()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        baseInsets = safeAreaInsets
        // Created on the first layout, once the insets are known; never again for a page that has left.
        guard let rootView = entry.rootView ?? (entry.removed ? nil : createRootView()) else { return }
        if rootView.superview !== self { addSubview(rootView) }
        let keyboard = KeyboardObserver.shared.height
        rootView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: max(0, bounds.height - keyboard))
    }

    private func createRootView() -> SCValdiRootView {
        let insets = Self.insets(baseInsets)
        let rootView = ValdiHost.shared.createPage(entry, insets: insets, navigator: navigator)
        entry.rootView = rootView
        entry.appliedInsets = insets
        return rootView
    }
}
