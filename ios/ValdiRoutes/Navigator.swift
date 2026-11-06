import UIKit
import ValdiRuntime

enum Presentation: String {
    case push

    /// A page shown in the tab shell, not on the stack.
    case tab
}

/// A page's resolved transition (routes.ts resolves the global, route and call layers). iOS has the system push and
/// none, and 'fullScreen' covers the stack, as in ExpoNativeRoutes.
extension VRResolvedNavigation {
    static var defaultOptions: VRResolvedNavigation {
        VRResolvedNavigation(animation: "default", durationMs: 300, presentation: "push")
    }

    var animated: Bool { animation != "none" && durationMs > 0 }
    var fullScreen: Bool { presentation == "fullScreen" }
}

typealias ResultCallback = (_ result: [String: Any], _ canceled: Bool) -> Void

final class PageEntry: Equatable {
    let id: String
    let route: String
    let definition: RouteDefinition
    private let payload: RoutePayload
    var params: [String: Any] { payload.value }
    let presentation: Presentation
    let navigation: VRResolvedNavigation
    private let onResult: ResultCallback?

    /// Owned here, not by its container, so a page outlives the views that show it.
    var rootView: SCValdiRootView?
    var appliedInsets: UIEdgeInsets?
    /// Custom tab callbacks live as long as the shell, including while another tab or page is shown.
    var tabBarContext: VRTabBarContext?
    private(set) var removed = false
    private var completion = RouteResultState()

    init(id: String, route: String, definition: RouteDefinition, params: [String: Any], presentation: Presentation,
         navigation: VRResolvedNavigation = .defaultOptions, onResult: ResultCallback?) {
        self.id = id
        self.route = route
        self.definition = definition
        payload = RoutePayload(params)
        self.presentation = presentation
        self.navigation = navigation
        self.onResult = onResult
    }

    /// A tab shell's pages, which leave with it, and the tab it shows: switchTab sets it, also while the shell is
    /// covered, and the shell shows it when it appears (TabsContainer).
    var tabPages: [PageEntry] = []
    var selectedTab: String?
    /// For a tab page, the shell it is in.
    weak var shell: PageEntry?

    /// PageViewModel.visible / visibilityReason, set by Navigator.updateVisibility.
    private(set) var visible = false
    private(set) var visibilityReason = ""

    func setVisibility(_ visible: Bool, reason: String) {
        self.visible = visible
        visibilityReason = reason
    }


    func close(result: [String: Any]?, canceled: Bool) {
        completion.accept(result, canceled: canceled)
    }

    /// Runs once the page has left the stack, also when the user swiped it away.
    func remove() {
        guard !removed else { return }
        removed = true
        let (value, canceled) = completion.result
        onResult?(value, canceled)
        tabPages.forEach { $0.remove() }
        // A page still on screen (pop or dismiss animation) is destroyed once it has disappeared (PageController).
        if rootView?.window == nil { destroy() }
    }

    func destroy() {
        rootView?.valdiContext?.destroy()
        rootView = nil
        tabBarContext = nil
    }

    static func == (lhs: PageEntry, rhs: PageEntry) -> Bool { lhs.id == rhs.id }
}

/// A UINavigationController of pages. Valdi pages draw their own header, so its bar only shows for native pages, and
/// the edge swipe back, which a hidden bar turns off, is turned back on. Pages leave it by code (pop) or by the user
/// (swipe, the native bar's back button); either way `entries` catches up and the pages that left are removed.
final class StackController: UINavigationController, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
    var onChange: (() -> Void)?
    private(set) var entries: [PageEntry] = []

    init(root: PageController) {
        super.init(nibName: nil, bundle: nil)
        setViewControllers([root], animated: false)
        entries = [root.entry]
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self
        interactivePopGestureRecognizer?.delegate = self
        setNavigationBarHidden(true, animated: false)
    }

    func push(_ page: PageController) {
        whenIdle { [self] in
            pushViewController(page, animated: page.entry.navigation.animated)
            sync()
        }
    }

    /// The top page pops with its own animation; one below it leaves without any.
    func pop(_ entry: PageEntry) {
        whenIdle { [self] in
            if (topViewController as? PageController)?.entry == entry {
                popViewController(animated: entry.navigation.animated)
            } else {
                setViewControllers(viewControllers.filter { ($0 as? PageController)?.entry != entry }, animated: false)
            }
            sync()
        }
    }

    /// Keeps the bottom `count` pages, the rest leave in one transition.
    func keep(_ count: Int) {
        whenIdle { [self] in
            guard viewControllers.count > count else { return }
            let animated = (topViewController as? PageController)?.entry.navigation.animated ?? true
            setViewControllers(Array(viewControllers.prefix(count)), animated: animated)
            sync()
        }
    }

    func replaceTop(with page: PageController) {
        whenIdle { [self] in
            setViewControllers(viewControllers.dropLast() + [page], animated: page.entry.navigation.animated)
            sync()
        }
    }

    func reset(to page: PageController) {
        whenIdle { [self] in
            setViewControllers([page], animated: false)
            sync()
        }
    }

    /// UIKit drops a push or pop requested while another transition runs; run it after.
    private func whenIdle(_ change: @escaping () -> Void) {
        guard let coordinator = transitionCoordinator else { return change() }
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            DispatchQueue.main.async { self?.whenIdle(change) }
        }
    }

    private func sync() {
        let current = viewControllers.compactMap { ($0 as? PageController)?.entry }
        let left = entries.filter { !current.contains($0) }
        entries = current
        // Top first: a pushForResult caller below still exists when its callback runs.
        left.reversed().forEach { $0.remove() }
        onChange?()
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1 && transitionCoordinator == nil
    }

    func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController,
                              animated: Bool) {
        let native = (viewController as? PageController)?.entry.definition.kind == "native"
        setNavigationBarHidden(!native, animated: animated)
    }

    /// Also the end of a swipe back or a tap on the bar's back button; a cancelled swipe shows the same page again.
    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController,
                              animated: Bool) {
        sync()
    }
}

/// The navigation state: a UINavigationController and at most one full-screen cover with its own stack.
/// JS drives it through NavigationHost (ValdiHost), native pages call it directly.
/// Every page an operation removes is cancelled, top first, unless it finished with a result.
final class Navigator {
    var tabBar: TabBar? { routes.tabBar }
    var rootRoute: String? { stack?.entries.first?.route }
    private(set) var stack: StackController!
    /// The page opened with ios.presentation 'fullScreen'; it can't be swiped away, only closed.
    private var cover: StackController?
    private var coverHost: StackHostController?

    private var routes: RouteTable
    private weak var host: UIViewController?
    private var nextId = 1

    init(routes: RouteTable, host: UIViewController) {
        self.routes = routes
        self.host = host
        // The first page is startApp's (app.ts): JS decides it, once, at startup.
        stack = StackController(root: PageController(entry: entry(routes.root), navigator: self))
        stack.onChange = { [weak self] in self?.updateVisibility() }
        updateVisibility()
        NotificationCenter.default.addObserver(forName: UIScene.didEnterBackgroundNotification, object: nil, queue: .main) {
            [weak self] _ in self?.setForeground(false)
        }
        NotificationCenter.default.addObserver(forName: UIScene.willEnterForegroundNotification, object: nil, queue: .main) {
            [weak self] _ in self?.setForeground(true)
        }
    }

    func reloadRoutes(_ table: RouteTable) {
        let oldRoot = stack.entries.first
        let route = oldRoot.map { table.contains($0.route) ? $0.route : table.root } ?? table.root
        let selected = oldRoot?.selectedTab
        routes = table
        let params: [String: Any]
        if route == table.tabBar?.route {
            if let selected, table.tabBar?.tabs.contains(where: { $0.route == selected }) == true {
                params = ["tab": selected]
            } else {
                params = [:]
            }
        } else {
            params = oldRoot?.route == route ? oldRoot?.params ?? [:] : [:]
        }
        // A published declaration rebuilds the root; pages removed above it complete as canceled.
        reset(route, params: params)
    }

    // MARK: Visibility and status bar

    private var visiblePages: [PageEntry] = []
    /// Background and foreground, not active and inactive: those also come and go with Control Center, a permission
    /// alert or Face ID.
    private var foreground = true

    private func setForeground(_ foreground: Bool) {
        self.foreground = foreground
        updateVisibility()
    }

    /// The page the user sees: the front stack's top, or for a tab shell its selected page.
    private var frontPage: PageEntry? {
        guard let top = cover?.entries.last ?? stack.entries.last else { return nil }
        guard top.definition.kind == "tabs" else { return top }
        return top.tabPages.first { $0.route == top.selectedTab } ?? top
    }

    /**
     * Pages that came on screen (the front page, in the foreground) or left it get
     * PageViewModel.visible with the reason. A removed page gets nothing: it is destroyed, as a mini program's onUnload
     * without onHide. Called after every change of the stacks, the selected tab and the foreground.
     */
    func updateVisibility() {
        let now = foreground ? [frontPage].compactMap { $0 } : []
        let before = visiblePages
        let wasForeground = visibleInForeground
        visiblePages = now
        visibleInForeground = foreground
        for page in before where !now.contains(page) && !page.removed {
            let reason = wasForeground && !foreground ? "background"
                : page.shell != nil && now.contains { $0.shell === page.shell } ? "tab" : "covered"
            page.setVisibility(false, reason: reason)
            ValdiHost.shared.updateVisibility(page)
        }
        for page in now where !before.contains(page) {
            let reason = !wasForeground && foreground ? "foreground"
                : page.shell != nil && before.contains { $0.shell === page.shell } ? "tab" : "navigation"
            page.setVisibility(true, reason: reason)
            ValdiHost.shared.updateVisibility(page)
            if page.definition.kind == "native" {
                setStatusBarStyle("auto")
            }
        }
        // AppUI dialogs belong to the current front page, including a shell's selected tab.
        MainActor.assumeIsolated { AppUI.shared.topPageChanged(frontPage?.id) }
    }

    /// `foreground` as of the last updateVisibility.
    private var visibleInForeground = true

    /**
     * The app's status bar (StatusBarStyle in PageComponent.ts): a Valdi page sets its own each time it shows, a native
     * page gets 'auto' unless it sets one (NativePage.setStatusBarStyle). RootController and the cover show it.
     */
    private(set) var statusBarStyle: UIStatusBarStyle = .default

    func setStatusBarStyle(_ style: String) {
        statusBarStyle = switch style {
        case "light": .lightContent
        case "dark": .darkContent
        default: .default
        }
        host?.setNeedsStatusBarAppearanceUpdate()
        coverHost?.setNeedsStatusBarAppearanceUpdate()
    }

    private func entry(_ route: String, params: [String: Any] = [:], presentation: Presentation = .push,
                       navigation: VRResolvedNavigation = .defaultOptions, onResult: ResultCallback? = nil) -> PageEntry {
        let entry = PageEntry(id: "page-\(nextId)", route: route, definition: routes[route], params: params,
                              presentation: presentation, navigation: navigation, onResult: onResult)
        nextId += 1
        if entry.definition.kind == "tabs" {
            let tabs = tabBar?.tabs ?? []
            if let requested = params["tab"] {
                precondition(tabs.contains { $0.route == requested as? String }, "Unknown tab: \(requested)")
            }
            entry.selectedTab = tabs.first { $0.route == params["tab"] as? String }?.route ?? tabBar?.initial
        }
        return entry
    }

    /// A tab shell's pages, one per tab of routes.tabs; each loads when its tab is first selected.
    func tabPages(of shell: PageEntry) -> [(tab: Tab, entry: PageEntry)] {
        let pages = (tabBar?.tabs ?? []).map { (tab: $0, entry: entry($0.route, presentation: .tab)) }
        shell.tabPages = pages.map(\.entry)
        pages.forEach { $0.entry.shell = shell }
        return pages
    }

    func open(_ route: String, params: [String: Any] = [:], navigation: VRResolvedNavigation = .defaultOptions,
              onResult: ResultCallback? = nil) {
        let entry = entry(route, params: params, navigation: navigation, onResult: onResult)
        if let cover {
            // One cover at a time: inside it, 'fullScreen' is an ordinary push.
            cover.push(PageController(entry: entry, navigator: self))
        } else if navigation.fullScreen {
            showCover(entry)
        } else {
            stack.push(PageController(entry: entry, navigator: self))
        }
    }

    private func showCover(_ entry: PageEntry) {
        let cover = StackController(root: PageController(entry: entry, navigator: self))
        cover.onChange = { [weak self] in self?.updateVisibility() }
        let coverHost = StackHostController(stack: cover, navigator: self)
        coverHost.modalPresentationStyle = .fullScreen
        self.cover = cover
        self.coverHost = coverHost
        host?.present(coverHost, animated: entry.navigation.animated)
        updateVisibility()
    }

    func finish(_ pageId: String, result: [String: Any]) { close(pageId, result: result, canceled: false) }

    func cancel(_ pageId: String) { close(pageId, result: nil, canceled: true) }

    /// A page leaves with its own options: one opened without animation also closes without.
    private func close(_ pageId: String, result: [String: Any]?, canceled: Bool) {
        if let cover, let entry = cover.entries.first, entry.id == pageId {
            entry.close(result: result, canceled: canceled)
            closeCover(animated: entry.navigation.animated)
            return
        }
        for stack in [cover, stack].compactMap({ $0 }) {
            // The root page, and a cover's first page (above), can't be popped.
            guard let entry = stack.entries.dropFirst().first(where: { $0.id == pageId }) else { continue }
            entry.close(result: result, canceled: canceled)
            stack.pop(entry)
            return
        }
    }

    private func closeCover(animated: Bool) {
        guard let cover else { return }
        self.cover = nil
        coverHost?.dismiss(animated: animated)
        coverHost = nil
        // Pages pushed inside go with it, cancelled.
        cover.entries.reversed().forEach { $0.remove() }
        updateVisibility()
    }

    /// Replaces the top page of the front stack (the cover's when there is one).
    func replace(_ route: String, params: [String: Any], navigation: VRResolvedNavigation) {
        (cover ?? stack).replaceTop(with: PageController(entry: entry(route, params: params, navigation: navigation),
                                                         navigator: self))
    }

    /// A full-screen cover's pages count as pages; the root never goes.
    func back(_ delta: Int) {
        var count = delta
        if count > 0, let cover {
            if count >= cover.entries.count {
                count -= cover.entries.count
                closeCover(animated: cover.entries.first?.navigation.animated ?? true)
            } else {
                cover.keep(cover.entries.count - count)
                count = 0
            }
        }
        if count > 0 { stack.keep(max(1, stack.entries.count - count)) }
    }

    func popToRoot() {
        closeCover(animated: true)
        stack.keep(1)
    }

    /// Clears everything, root included; `route` is the new root.
    func reset(_ route: String, params: [String: Any]) {
        closeCover(animated: false)
        stack.reset(to: PageController(entry: entry(route, params: params), navigator: self))
    }

    /// Back to the tab shell with `tab` selected; a new root shell when the stack has none.
    func switchTab(_ tab: String) {
        guard let tabBar else { preconditionFailure("No tabs declared") }
        precondition(tabBar.tabs.contains { $0.route == tab }, "Unknown tab: \(tab)")
        guard let index = stack.entries.lastIndex(where: { $0.route == tabBar.route }) else {
            return reset(tabBar.route, params: ["tab": tab])
        }
        let shell = stack.entries[index]
        shell.selectedTab = tab
        closeCover(animated: true)
        stack.keep(index + 1)
        // Shown now if the shell is loaded; otherwise when it appears.
        stack.viewControllers.lazy.compactMap { $0 as? PageController }.first { $0.entry == shell }?.showSelectedTab()
    }

    /// A tap in a shell changes only that shell. A callback queued before its removal cannot revive it.
    func selectTab(_ tab: String, in shell: PageEntry) {
        guard !shell.removed else { return }
        precondition(shell.tabPages.contains { $0.route == tab }, "Unknown tab: \(tab)")
        shell.selectedTab = tab
        for container in [stack, cover].compactMap({ $0 }) {
            container.viewControllers.lazy.compactMap { $0 as? PageController }
                .first { $0.entry === shell }?.showSelectedTab()
        }
        updateVisibility()
    }

    /// Root first, then the cover's pages; the pages in a tab shell are not on the stack.
    func currentPages() -> [VRStackPage] {
        let pages = stack.entries + (cover?.entries ?? [])
        return pages.map { VRStackPage(pageId: $0.id, route: $0.route, params: $0.params) }
    }
}
