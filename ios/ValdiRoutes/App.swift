import SwiftUI
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
/// the keyboard: KeyboardObserver reports its height once, and each page container pads itself (PageContainerView).
/// Sheets are drawn in the same window by SheetLayerView, not presented modally.
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

/// The full-screen cover: its stack, and the sheet above it while the cover is in front.
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

/**
 * The tab shell (TAB_BAR in routes.ts): the system tab bar, Liquid Glass from iOS 26 and the classic blur before, over
 * pages that extend under it; their bottom safe area, and so their insets, includes it. Each tab's page loads when its
 * tab is first selected and stays.
 */
final class TabsController: UITabBarController, UITabBarControllerDelegate {
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
            page.tabBarItem = UITabBarItem(title: tab.text, image: Self.image(tab.icon),
                                           selectedImage: Self.image(tab.selectedIcon ?? tab.icon))
            return page
        }
        delegate = self
        showSelectedTab()
        tabBar.tintColor = UIColor(red: 0x25 / 255, green: 0x63 / 255, blue: 0xeb / 255, alpha: 1)
        if #unavailable(iOS 26) {
            // Blurred also when a page is scrolled to its end: from iOS 15 the bar turns clear there, and it can't see
            // whether a Valdi page is.
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            tabBar.standardAppearance = appearance
            tabBar.scrollEdgeAppearance = appearance
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    /// The shell's selected tab (PageEntry.selectedTab), which switchTab may have changed while it was covered.
    func showSelectedTab() {
        defer { navigator?.updateVisibility() }
        guard let index = routeTabs.firstIndex(where: { $0.tab == shell.selectedTab }), index != selectedIndex else { return }
        selectedIndex = index
    }


    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        showSelectedTab()
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        shell.selectedTab = routeTabs[selectedIndex].tab
        navigator?.updateVisibility()
    }

    /// A res/ image of the app_pages module, as is: from the over-the-air package when it has one (ValdiOta.swift), as
    /// the Valdi pages load it; otherwise from app_pages.bundle, where Valdi exports it.
    private static func image(_ name: String) -> UIImage? {
        (ValdiOta.image(module: "app_pages", name: name) ?? UIImage(named: name, in: ValdiHost.resourceBundle, compatibleWith: nil))?
            .withRenderingMode(.alwaysOriginal)
    }
}

/// What a native page gets: its params, and the navigator it shares with the Valdi pages.
struct NativePage {
    let entry: PageEntry
    let navigator: Navigator

    var params: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(entry.paramsJson.utf8))) as? [String: Any] ?? [:]
    }

    /// Closes this page and delivers the result to whoever opened it with pushForResult.
    func finish(_ result: [String: Any]) {
        navigator.finish(entry.id, resultJson: String(data: try! JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
    }

    func back() { navigator.cancel(entry.id) }

    /// As Page.setStatusBarStyle: "auto", "light" or "dark"; reset to "auto" each time the page comes back.
    func setStatusBarStyle(_ style: String) {
        precondition(["auto", "light", "dark"].contains(style), "Bad status bar style: \(style)")
        navigator.setStatusBarStyle(style)
    }
}

/// The native pages, by route: the routes with kind 'native' in routes.ts. A UIKit controller or a SwiftUI view.
enum NativeScreens {
    private static var screens: [String: (NativePage) -> UIViewController] = registerDefaults()

    static func register(_ route: String, _ make: @escaping (NativePage) -> UIViewController) {
        precondition(screens[route] == nil, "Duplicate native screen: \(route)")
        screens[route] = make
    }

    static func register<Content: View>(_ route: String, _ make: @escaping (NativePage) -> Content) {
        register(route) { UIHostingController(rootView: make($0)) as UIViewController }
    }

    static func make(_ page: NativePage) -> UIViewController {
        guard let make = screens[page.entry.route] else { fatalError("No native screen registered for \(page.entry.route)") }
        return make(page)
    }

    private static func registerDefaults() -> [String: (NativePage) -> UIViewController] {
        ["picker": { UIHostingController(rootView: PickerScreen(page: $0)) }]
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
    private var tabs: TabsController?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        self.navigator = navigator
        super.init(nibName: nil, bundle: nil)
        title = entry.definition.title
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        guard entry.definition.kind == "valdi" else { return super.loadView() }
        view = PageContainerView(entry: entry, navigator: navigator, followsSafeArea: true)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .pageBackground
        switch entry.definition.kind {
        case "valdi":
            break
        case "tabs":
            let tabs = TabsController(shell: entry, navigator: navigator)
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
/// keyboard height, and the bottom inset drops by the part of it the keyboard covers. A fixed-height sheet therefore
/// shrinks its page, while a compact sheet, sized to its content plus the keyboard, rides up with it.
final class PageContainerView: UIView {
    let entry: PageEntry
    private let navigator: Navigator
    /// A full-screen page keeps clear of its own safe area; a sheet sets `baseInsets` itself.
    private let followsSafeArea: Bool
    /// Insets without the keyboard.
    var baseInsets = UIEdgeInsets.zero {
        didSet { if baseInsets != oldValue { applyInsets() } }
    }
    private var keyboardSubscription: KeyboardSubscription?

    init(entry: PageEntry, navigator: Navigator, followsSafeArea: Bool) {
        self.entry = entry
        self.navigator = navigator
        self.followsSafeArea = followsSafeArea
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
        if followsSafeArea { baseInsets = safeAreaInsets }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        KeyboardObserver.shared.prepare()
        keyboardDidMove()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if followsSafeArea { baseInsets = safeAreaInsets }
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

/// A sheet over the front layer, in the same window (see SheetHostView). 'sheet' is 75% of the window;
/// 'compactSheet' is its form plus the keyboard, so the whole sheet rides up with the keyboard.
final class SheetLayerView: UIView {
    let entry: PageEntry
    let host = SheetHostView()
    private let content: PageContainerView
    private var keyboardSubscription: KeyboardSubscription?

    init(entry: PageEntry, navigator: Navigator) {
        self.entry = entry
        content = PageContainerView(entry: entry, navigator: navigator, followsSafeArea: false)
        super.init(frame: .zero)
        host.setContent(content)
        host.onClosed = { [entry] byUser in
            // Dragged down or scrim tapped: the page did not finish, so it is cancelled.
            if byUser { entry.close(resultJson: nil, canceled: true) }
            navigator.onSheetHidden()
        }
        addSubview(host)
        keyboardSubscription = KeyboardObserver.shared.observe { [weak self] _ in self?.updateOpenHeight() }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        host.frame = bounds
        // The sheet has no top inset; the page keeps clear of the home indicator.
        content.baseInsets = UIEdgeInsets(top: 0, left: safeAreaInsets.left, bottom: safeAreaInsets.bottom,
                                          right: safeAreaInsets.right)
        updateOpenHeight()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        setNeedsLayout()
    }

    private func updateOpenHeight() {
        let keyboard = KeyboardObserver.shared.height
        switch entry.presentation {
        case .compactSheet:
            host.openHeight = SheetHostView.handleHeight + 340 + max(0, safeAreaInsets.bottom - keyboard) + keyboard
        default:
            host.openHeight = bounds.height * 0.75
        }
    }
}

private let fruits = ["苹果", "香蕉", "橙子", "葡萄", "西瓜"]

/// A plain SwiftUI page in the same stack, returning a result to the Valdi page that opened it.
struct PickerScreen: View {
    let page: NativePage

    var body: some View {
        List {
            Section("SwiftUI 页面，选一项返回给 Valdi 页面") {
                ForEach(fruits, id: \.self) { fruit in
                    Button(fruit) { page.finish(["value": fruit]) }
                }
            }
            Button("从原生页 push Valdi 详情页") {
                page.navigator.open("detail", paramsJson: #"{"id":100,"from":"原生页"}"#)
            }
            Button("原生调用 switchTab('wheels')") { page.navigator.switchTab("wheels") }
            // Native pages call the same AppUI directly, without going through JS.
            Button("原生调用 showModal") {
                Task {
                    let answer = try await app.ui.showModal(ModalOptions(title: "原生调用", content: "app.ui.showModal"))
                    _ = try await app.ui.showToast(ToastOptions(title: answer.confirm ? "原生页点了确定" : "原生页点了取消", icon: "none"))
                }
            }
        }
    }
}
