import UIKit
import ValdiRuntime

enum Presentation: String {
    case push

    /// Fixed height; the keyboard shrinks the page inside it.
    case sheet

    /// Sized by its page; sits on the keyboard.
    case compactSheet

    /// A page shown in the tab shell, not on the stack.
    case tab

    init(_ value: String) {
        self = Presentation(rawValue: value) ?? .push
    }
}

/// A page's resolved transition (routes.ts resolves the global, route and call layers). iOS has the system push and
/// none, and 'fullScreen' covers the stack, as in ExpoNativeRoutes.
struct NavigationOptions {
    var animation = "default"
    var durationMs = 300
    var fullScreen = false

    var animated: Bool { animation != "none" && durationMs > 0 }

    init() {}

    init(json: String) {
        let value = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
        animation = value["animation"] as? String ?? "default"
        durationMs = value["durationMs"] as? Int ?? 300
        fullScreen = value["presentation"] as? String == "fullScreen"
    }
}

typealias ResultCallback = (_ resultJson: String, _ canceled: Bool) -> Void

final class PageEntry: Equatable {
    let id: String
    let route: String
    let definition: RouteDefinition
    let paramsJson: String
    let presentation: Presentation
    let navigation: NavigationOptions
    private let onResult: ResultCallback?

    /// Owned here, not by its container, so a page outlives the views that show it.
    var rootView: SCValdiRootView?
    var appliedInsets: UIEdgeInsets?
    private(set) var removed = false
    private var result: (json: String, canceled: Bool)?

    init(id: String, route: String, definition: RouteDefinition, paramsJson: String, presentation: Presentation,
         navigation: NavigationOptions = NavigationOptions(), onResult: ResultCallback?) {
        self.id = id
        self.route = route
        self.definition = definition
        self.paramsJson = paramsJson
        self.presentation = presentation
        self.navigation = navigation
        self.onResult = onResult
    }

    /// A tab shell's pages, which leave with it, and the tab it shows: switchTab sets it, also while the shell is
    /// covered, and the shell shows it when it appears (TabsController).
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


    func close(resultJson: String?, canceled: Bool) {
        if result == nil { result = (resultJson ?? "", canceled) }
    }

    /// Runs once the page has left the stack, also when the user swiped it away.
    func remove() {
        guard !removed else { return }
        removed = true
        let (json, canceled) = result ?? ("", true)
        onResult?(json, canceled)
        tabPages.forEach { $0.remove() }
        // A page still on screen (pop or dismiss animation) is destroyed once it has disappeared (PageController).
        if rootView?.window == nil { destroy() }
    }

    func destroy() {
        rootView?.valdiContext?.destroy()
        rootView = nil
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

/// The navigation state: a UINavigationController, at most one full-screen cover with its own stack, and at most one
/// sheet above whichever of them is in front, in the same window. JS drives it through NavigationHost (ValdiHost),
/// native pages call it directly. Every page an operation removes is cancelled, top first.
final class Navigator {
    let tabBar: TabBar?
    private(set) var stack: StackController!
    /// The page opened with ios.presentation 'fullScreen'; it can't be swiped away, only closed.
    private var cover: StackController?
    private var coverHost: StackHostController?
    private var sheet: (entry: PageEntry, layer: SheetLayerView)?

    private let routes: RouteTable
    private weak var host: UIViewController?
    private var nextId = 1

    init(routes: RouteTable, host: UIViewController) {
        self.routes = routes
        self.host = host
        tabBar = routes.tabBar
        // The first page is startApp's (app.ts): JS decides it, once, at startup.
        stack = StackController(root: PageController(entry: entry(routes.root), navigator: self))
        stack.onChange = { [weak self] in self?.reportTopPage() }
        reportTopPage()
        NotificationCenter.default.addObserver(forName: UIScene.didEnterBackgroundNotification, object: nil, queue: .main) {
            [weak self] _ in self?.setForeground(false)
        }
        NotificationCenter.default.addObserver(forName: UIScene.willEnterForegroundNotification, object: nil, queue: .main) {
            [weak self] _ in self?.setForeground(true)
        }
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

    /// The page the user sees under any sheet: the front stack's top, or for a tab shell its selected page.
    private var frontPage: PageEntry? {
        guard let top = cover?.entries.last ?? stack.entries.last else { return nil }
        guard top.definition.kind == "tabs" else { return top }
        return top.tabPages.first { $0.route == tabBar?.tabs.first { $0.tab == top.selectedTab }?.route } ?? top
    }

    /**
     * Pages that came on screen (the front page and a sheet over it, in the foreground) or left it get
     * PageViewModel.visible with the reason. A removed page gets nothing: it is destroyed, as a mini program's onUnload
     * without onHide. Called after every change of the stacks, the sheet, the selected tab and the foreground.
     */
    func updateVisibility() {
        let now = foreground ? [frontPage, sheet?.entry].compactMap { $0 } : []
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
            if page.definition.kind == "native", page.presentation == .push || page.presentation == .tab {
                setStatusBarStyle("auto")
            }
        }
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

    /// showModal belongs to the page on top: covering or removing it cancels the dialog.
    private func reportTopPage() {
        updateVisibility()
        guard let top = (sheet?.entry ?? cover?.entries.last ?? stack.entries.last)?.id else { return }
        MainActor.assumeIsolated { AppUI.shared.topPageChanged(top) }
    }

    /// The front layer, which a sheet covers: the cover when there is one. Never a navigation controller's own view,
    /// where a navigation bar shown later would land above the sheet.
    private var front: UIView? { coverHost?.view ?? host?.view }

    private func entry(_ route: String, paramsJson: String = "{}", presentation: Presentation = .push,
                       navigation: NavigationOptions = NavigationOptions(), onResult: ResultCallback? = nil) -> PageEntry {
        let entry = PageEntry(id: "page-\(nextId)", route: route, definition: routes[route], paramsJson: paramsJson,
                              presentation: presentation, navigation: navigation, onResult: onResult)
        nextId += 1
        if entry.definition.kind == "tabs" {
            let params = (try? JSONSerialization.jsonObject(with: Data(paramsJson.utf8))) as? [String: Any]
            let tabs = tabBar?.tabs ?? []
            entry.selectedTab = tabs.first { $0.tab == params?["tab"] as? String }?.tab ?? tabs.first?.tab
        }
        return entry
    }

    /// A tab shell's pages, one per tab of TAB_BAR; each loads when its tab is first selected.
    func tabPages(of shell: PageEntry) -> [(tab: Tab, entry: PageEntry)] {
        let pages = (tabBar?.tabs ?? []).map { (tab: $0, entry: entry($0.route, presentation: .tab)) }
        shell.tabPages = pages.map(\.entry)
        pages.forEach { $0.entry.shell = shell }
        return pages
    }

    func open(_ route: String, paramsJson: String = "{}", presentation: Presentation = .push,
              navigation: NavigationOptions = NavigationOptions(), onResult: ResultCallback? = nil) {
        let entry = entry(route, paramsJson: paramsJson, presentation: presentation, navigation: navigation,
                          onResult: onResult)
        if presentation != .push && sheet == nil {
            showSheet(entry)
        } else if let cover {
            // One cover at a time: inside it, 'fullScreen' is an ordinary push.
            cover.push(PageController(entry: entry, navigator: self))
        } else if navigation.fullScreen {
            showCover(entry)
        } else {
            stack.push(PageController(entry: entry, navigator: self))
        }
    }

    private func showSheet(_ entry: PageEntry) {
        let layer = SheetLayerView(entry: entry, navigator: self)
        sheet = (entry, layer)
        if let front {
            layer.frame = front.bounds
            layer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            front.addSubview(layer)
        }
        reportTopPage()
    }

    private func showCover(_ entry: PageEntry) {
        let cover = StackController(root: PageController(entry: entry, navigator: self))
        cover.onChange = { [weak self] in self?.reportTopPage() }
        let coverHost = StackHostController(stack: cover, navigator: self)
        coverHost.modalPresentationStyle = .fullScreen
        self.cover = cover
        self.coverHost = coverHost
        host?.present(coverHost, animated: entry.navigation.animated)
        // A sheet stays in front.
        if let layer = sheet?.layer { coverHost.view.addSubview(layer) }
        reportTopPage()
    }

    func finish(_ pageId: String, resultJson: String) { close(pageId, resultJson: resultJson, canceled: false) }

    func cancel(_ pageId: String) { close(pageId, resultJson: nil, canceled: true) }

    /// A page leaves with its own options: one opened without animation also closes without.
    private func close(_ pageId: String, resultJson: String?, canceled: Bool) {
        if let sheet, sheet.entry.id == pageId {
            sheet.entry.close(resultJson: resultJson, canceled: canceled)
            sheet.layer.host.dismiss() // Animates out, then onSheetHidden().
            return
        }
        if let cover, let entry = cover.entries.first, entry.id == pageId {
            entry.close(resultJson: resultJson, canceled: canceled)
            closeCover(animated: entry.navigation.animated)
            return
        }
        for stack in [cover, stack].compactMap({ $0 }) {
            // The root page, and a cover's first page (above), can't be popped.
            guard let entry = stack.entries.dropFirst().first(where: { $0.id == pageId }) else { continue }
            entry.close(resultJson: resultJson, canceled: canceled)
            stack.pop(entry)
            return
        }
    }

    private func closeCover(animated: Bool) {
        guard let cover else { return }
        self.cover = nil
        if let layer = sheet?.layer, let view = host?.view { view.addSubview(layer) }
        coverHost?.dismiss(animated: animated)
        coverHost = nil
        // Pages pushed inside go with it, cancelled.
        cover.entries.reversed().forEach { $0.remove() }
        reportTopPage()
    }

    /// Animates the sheet out, cancelled.
    private func dismissSheet() {
        guard let sheet else { return }
        sheet.entry.close(resultJson: nil, canceled: true)
        sheet.layer.host.dismiss()
    }

    /// Replaces the top page of the front stack (the cover's when there is one), after closing a sheet over it.
    func replace(_ route: String, paramsJson: String, navigation: NavigationOptions) {
        dismissSheet()
        (cover ?? stack).replaceTop(with: PageController(entry: entry(route, paramsJson: paramsJson, navigation: navigation),
                                                         navigator: self))
    }

    /// The sheet and a full-screen cover's pages count as pages; the root never goes.
    func back(_ delta: Int) {
        var count = delta
        if count > 0, sheet != nil {
            dismissSheet()
            count -= 1
        }
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
        dismissSheet()
        closeCover(animated: true)
        stack.keep(1)
    }

    /// Clears everything, root included; `route` is the new root.
    func reset(_ route: String, paramsJson: String) {
        if let current = sheet {
            sheet = nil
            current.layer.removeFromSuperview()
            current.entry.remove()
        }
        closeCover(animated: false)
        stack.reset(to: PageController(entry: entry(route, paramsJson: paramsJson), navigator: self))
    }

    /// Back to the tab shell with `tab` selected; a new root shell when the stack has none.
    func switchTab(_ tab: String) {
        guard let tabBar else { return }
        guard let index = stack.entries.lastIndex(where: { $0.route == tabBar.route }) else {
            let params = String(data: try! JSONSerialization.data(withJSONObject: ["tab": tab]), encoding: .utf8)!
            return reset(tabBar.route, paramsJson: params)
        }
        let shell = stack.entries[index]
        shell.selectedTab = tab
        dismissSheet()
        closeCover(animated: true)
        stack.keep(index + 1)
        // Shown now if the shell is loaded; otherwise when it appears.
        stack.viewControllers.lazy.compactMap { $0 as? PageController }.first { $0.entry == shell }?.showSelectedTab()
    }

    /// Root first, the sheet last; the pages in a tab shell are not on the stack.
    func currentPages() -> String {
        let pages = stack.entries + (cover?.entries ?? []) + (sheet.map { [$0.entry] } ?? [])
        let json = pages.map { page -> [String: Any] in
            let params = (try? JSONSerialization.jsonObject(with: Data(page.paramsJson.utf8))) ?? [String: Any]()
            return ["pageId": page.id, "route": page.route, "params": params]
        }
        return String(data: try! JSONSerialization.data(withJSONObject: json), encoding: .utf8)!
    }

    /// The sheet finished animating out; a drag down or a tap on the scrim closed it as cancelled.
    func onSheetHidden() {
        guard let current = sheet else { return }
        sheet = nil
        current.layer.removeFromSuperview()
        current.entry.remove()
        reportTopPage()
    }
}
