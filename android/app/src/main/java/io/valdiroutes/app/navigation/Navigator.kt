package io.valdiroutes.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.pages.ResolvedNavigation
import io.valdiroutes.pages.StackPage

enum class Presentation(val value: String) {
    Push("push"),

    /** A page shown in the tab shell, not on the stack. */
    Tab("tab"),
}

typealias ResultCallback = (result: Map<String, Any?>, canceled: Boolean) -> Unit

class PageEntry(
    val id: String,
    val route: String,
    val definition: RouteDefinition,
    params: Map<String, Any?>,
    val presentation: Presentation,
    val navigation: ResolvedNavigation,
    private val onResult: ResultCallback?,
) {
    /** Copied at creation and recursively immutable, including through NativePage and stack/view-model getters. */
    val params: Map<String, Any?> = snapshotRouteData(params)

    /** Owned here, not by Compose: Nav3 disposes covered pages, and a remount would lose their state. */
    var rootView: ValdiRootView? = null
    var appliedInsets: Insets? = null
    var removed = false
        private set
    private var result: Pair<Map<String, Any?>, Boolean>? = null

    /** A tab shell's pages by tab, created when first selected. */
    val tabPages = mutableMapOf<String, PageEntry>()
    var selectedTab by mutableStateOf<String?>(null)
    internal var customTabBar: CustomTabBar? = null
    /** For a tab page, the shell it is in. */
    var shell: PageEntry? = null

    /** PageViewModel.visible / visibilityReason, set by Navigator.updateVisibility. */
    var visible = false
        private set
    var visibilityReason = ""
        private set

    fun setVisibility(visible: Boolean, reason: String) {
        this.visible = visible
        visibilityReason = reason
    }

    fun close(value: Map<String, Any?>, canceled: Boolean) {
        if (result == null) result = snapshotRouteData(value) to canceled
    }

    /** Runs once the page has left the stack; a tab shell's pages go with it. */
    fun remove() {
        if (removed) return
        removed = true
        customTabBar?.deactivate()
        val (value, canceled) = result ?: (emptyMap<String, Any?>() to true)
        onResult?.invoke(value, canceled)
        tabPages.values.forEach { it.remove() }
        // A page still on screen (exit animation) is destroyed when its view is released.
        if (rootView?.parent == null && customTabBar?.rootView?.parent == null) destroy()
    }

    fun destroy() {
        rootView?.destroy()
        rootView = null
        customTabBar?.destroy()
        customTabBar = null
    }
}

/**
 * The one stack of Valdi and native pages: a Nav3 back stack. JS drives it through
 * NavigationHost (ValdiHost), native pages call it directly. A call that removes pages removes them from the top down,
 * each cancelled, so a pushForResult caller below still exists when its callback runs.
 */
class Navigator(private var routes: RouteTable) {
    val tabBar: TabBar? get() = routes.tabBar
    val stack = mutableStateListOf<PageEntry>()
    private var nextId = 0

    fun reloadRoutes(table: RouteTable) {
        val oldRoot = stack.firstOrNull()
        val root = oldRoot?.route?.takeIf { table.contains(it) } ?: table.root
        val selected = oldRoot?.selectedTab?.takeIf { name -> table.tabBar?.tabs?.any { it.route == name } == true }
        routes = table
        val params = if (root == table.tabBar?.route) {
            selected?.let { mapOf("tab" to it) } ?: emptyMap()
        } else oldRoot?.params ?: emptyMap()
        reset(root, params)
    }

    private fun entry(
        route: String, params: Map<String, Any?>, presentation: Presentation, navigation: ResolvedNavigation, onResult: ResultCallback?,
    ): PageEntry {
        val entry = PageEntry("page-${nextId++}", route, routes[route], params, presentation,
            NativeRouteAnimations.validated(navigation), onResult)
        if (entry.definition.kind == "tabs") {
            val requested = entry.params["tab"]
            require(!entry.params.containsKey("tab") || (requested is String && tabBar?.tabs?.any { it.route == requested } == true)) {
                "Unknown tab: $requested"
            }
            entry.selectedTab = tabBar?.tabs?.firstOrNull { it.route == requested }?.route ?: tabBar?.initial
        }
        return entry
    }

    fun open(
        route: String, params: Map<String, Any?> = emptyMap(),
        navigation: ResolvedNavigation = NativeRouteAnimations.Default, onResult: ResultCallback? = null,
    ) {
        stack.add(entry(route, params, Presentation.Push, navigation, onResult))
    }

    /** The page shown in a tab shell's `tab`, created the first time. */
    fun tabPage(shell: PageEntry, tab: String): PageEntry = shell.tabPages.getOrPut(tab) {
        val route = requireNotNull(tabBar?.tabs?.firstOrNull { it.route == tab }) { "Unknown tab: $tab" }.route
        entry(route, emptyMap(), Presentation.Tab, NativeRouteAnimations.Default, null).also { it.shell = shell }
    }

    /** The page the user sees: the stack's top, or for a tab shell its selected page. */
    fun frontPage(): PageEntry? {
        val top = stack.lastOrNull() ?: return null
        val tab = top.selectedTab ?: return top
        return if (top.definition.kind == "tabs") tabPage(top, tab) else top
    }

    /**
     * The app's status bar (StatusBarStyle in PageComponent.ts): a Valdi page sets its own each time it shows, a
     * native page gets 'auto' unless it sets one (NativePage.setStatusBarStyle).
     */
    var statusBarStyle by mutableStateOf("auto")

    private var visiblePages = emptyList<PageEntry>()
    private var foreground = true

    /**
     * The front page, while the activity is started; called by AppRoot whenever it changes.
     * Pages that came or went get PageViewModel.visible with the reason. A removed page gets
     * nothing: it is destroyed, as a mini program's onUnload without onHide.
     */
    fun updateVisibility(pages: List<PageEntry>, foreground: Boolean) {
        val now = if (foreground) pages else emptyList()
        val wasForeground = this.foreground
        val before = visiblePages
        visiblePages = now
        this.foreground = foreground
        for (page in before) {
            if (page in now || page.removed) continue
            val reason = when {
                wasForeground && !foreground -> "background"
                page.shell != null && now.any { it.shell === page.shell } -> "tab"
                else -> "covered"
            }
            page.setVisibility(false, reason)
            ValdiHost.updateVisibility(page)
        }
        for (page in now) {
            if (page in before) continue
            val reason = when {
                !wasForeground && foreground -> "foreground"
                page.shell != null && before.any { it.shell === page.shell } -> "tab"
                else -> "navigation"
            }
            page.setVisibility(true, reason)
            ValdiHost.updateVisibility(page)
            if (page.definition.kind == "native") {
                statusBarStyle = "auto"
            }
        }
    }

    fun finish(pageId: String, result: Map<String, Any?>) = close(pageId, result, canceled = false)

    fun cancel(pageId: String) = close(pageId, emptyMap(), canceled = true)

    /** Back from the system (gesture, key, Nav3's onBack): cancels the top page. */
    fun back() {
        stack.lastOrNull()?.takeIf { stack.size > 1 }?.let { cancel(it.id) }
    }

    private fun close(pageId: String, result: Map<String, Any?>, canceled: Boolean) {
        val entry = stack.firstOrNull { it.id == pageId } ?: return
        if (stack.size == 1) return
        entry.close(result, canceled)
        stack.remove(entry)
        entry.remove()
    }

    /** Keeps the bottom `count` pages, removing the rest at once (one Nav3 transition), top first. */
    private fun keep(count: Int) {
        if (stack.size <= count) return
        val removed = stack.subList(count, stack.size).toList()
        stack.removeRange(count, stack.size)
        removed.asReversed().forEach { it.remove() }
    }

    fun replace(route: String, params: Map<String, Any?>, navigation: ResolvedNavigation) {
        val old = stack.lastOrNull() ?: return
        stack[stack.lastIndex] = entry(route, params, Presentation.Push, navigation, null)
        old.remove()
    }

    /** Removes up to `delta` pages; the root never goes. */
    fun back(delta: Int) {
        keep((stack.size - delta).coerceAtLeast(1))
    }

    fun popToRoot() {
        keep(1)
    }

    fun reset(route: String, params: Map<String, Any?>) {
        val removed = stack.toList()
        stack.clear()
        stack.add(entry(route, params, Presentation.Push, NativeRouteAnimations.Default, null))
        removed.asReversed().forEach { it.remove() }
    }

    /** Back to the tab shell with `tab` selected; a new root shell when the stack has none. */
    fun switchTab(tab: String) {
        val bar = requireNotNull(tabBar) { "No tabs declared" }
        require(bar.tabs.any { it.route == tab }) { "Unknown tab: $tab" }
        val index = stack.indexOfLast { it.route == bar.route }
        if (index < 0) return reset(bar.route, mapOf("tab" to tab))
        keep(index + 1)
        stack[index].selectedTab = tab
    }

    /** Bar taps belong to this shell only; they do not pop pages or target a replacement shell. */
    internal fun selectTab(shell: PageEntry, tab: String) {
        if (shell.removed || shell !in stack) return
        require(tabBar?.tabs?.any { it.route == tab } == true) { "Unknown tab: $tab" }
        shell.selectedTab = tab
    }

    /** Root first; the pages in a tab shell are not on the stack. */
    fun currentPages(): List<StackPage> = stack.map { page ->
        StackPage(page.id, page.route, page.params)
    }

    fun destroyAll() {
        stack.forEach { page -> page.tabPages.values.forEach { it.destroy() }; page.destroy() }
    }
}
