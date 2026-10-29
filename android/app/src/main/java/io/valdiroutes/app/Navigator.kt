package io.valdiroutes.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.snap.valdi.views.ValdiRootView
import org.json.JSONArray
import org.json.JSONObject

enum class Presentation(val value: String) {
    Push("push"),

    /** Fixed height; the keyboard shrinks the page inside it. */
    Sheet("sheet"),

    /** Sized by its page; the whole sheet rides up with the keyboard. */
    CompactSheet("compactSheet"),

    /** A page shown in the tab shell, not on the stack. */
    Tab("tab");

    companion object {
        fun parse(value: String) = entries.firstOrNull { it.value == value } ?: Push
    }
}

typealias ResultCallback = (resultJson: String, canceled: Boolean) -> Unit

class PageEntry(
    val id: String,
    val route: String,
    val definition: RouteDefinition,
    val paramsJson: String,
    val presentation: Presentation,
    val navigation: NavigationOptions,
    private val onResult: ResultCallback?,
) {
    /** Owned here, not by Compose: Nav3 disposes covered pages, and a remount would lose their state. */
    var rootView: ValdiRootView? = null
    var appliedInsets: Insets? = null
    var removed = false
        private set
    private var result: Pair<String, Boolean>? = null

    /** A tab shell's pages by tab, created when first selected. */
    val tabPages = mutableMapOf<String, PageEntry>()
    var selectedTab by mutableStateOf<String?>(null)
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

    fun close(resultJson: String?, canceled: Boolean) {
        if (result == null) result = (resultJson ?: "") to canceled
    }

    /** Runs once the page has left the stack; a tab shell's pages go with it. */
    fun remove() {
        if (removed) return
        removed = true
        val (json, canceled) = result ?: ("" to true)
        onResult?.invoke(json, canceled)
        tabPages.values.forEach { it.remove() }
        // A page still on screen (exit animation) is destroyed when its view is released.
        if (rootView?.parent == null) destroy()
    }

    fun destroy() {
        rootView?.destroy()
        rootView = null
    }
}

/**
 * The one stack of Valdi and native pages: a Nav3 back stack plus at most one sheet above it. JS drives it through
 * NavigationHost (ValdiHost), native pages call it directly. A call that removes pages removes them from the top down,
 * each cancelled, so a pushForResult caller below still exists when its callback runs.
 */
class Navigator(private val routes: RouteTable) {
    val tabBar: TabBar? = routes.tabBar
    val stack = mutableStateListOf<PageEntry>()
    var sheet by mutableStateOf<PageEntry?>(null)
        private set
    var sheetClosing by mutableStateOf(false)
        private set
    private var nextId = 0

    private fun entry(
        route: String, paramsJson: String, presentation: Presentation, navigation: NavigationOptions, onResult: ResultCallback?,
    ): PageEntry {
        val entry = PageEntry("page-${nextId++}", route, routes[route], paramsJson, presentation,
            NativeRouteAnimations.validated(navigation), onResult)
        if (entry.definition.kind == "tabs") {
            val requested = JSONObject(paramsJson.ifEmpty { "{}" }).optString("tab")
            entry.selectedTab = tabBar?.tabs?.firstOrNull { it.tab == requested }?.tab ?: tabBar?.tabs?.firstOrNull()?.tab
        }
        return entry
    }

    fun open(
        route: String, paramsJson: String = "{}", presentation: Presentation = Presentation.Push,
        navigation: NavigationOptions = NavigationOptions.Default, onResult: ResultCallback? = null,
    ) {
        val entry = entry(route, paramsJson, presentation, navigation, onResult)
        if (presentation == Presentation.Push || sheet != null) {
            stack.add(entry)
        } else {
            sheet = entry
            sheetClosing = false
        }
    }

    /** The page shown in a tab shell's `tab`, created the first time. */
    fun tabPage(shell: PageEntry, tab: String): PageEntry = shell.tabPages.getOrPut(tab) {
        val route = requireNotNull(tabBar?.tabs?.firstOrNull { it.tab == tab }) { "Unknown tab: $tab" }.route
        entry(route, "{}", Presentation.Tab, NavigationOptions.Default, null).also { it.shell = shell }
    }

    /** The page the user sees under any sheet: the stack's top, or for a tab shell its selected page. */
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
     * The pages on screen (the front page and a sheet over it), while the activity is started; called by AppRoot
     * whenever they change. Pages that came or went get PageViewModel.visible with the reason. A removed page gets
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
            if (page.definition.kind == "native" && page.presentation in listOf(Presentation.Push, Presentation.Tab)) {
                statusBarStyle = "auto"
            }
        }
    }

    fun finish(pageId: String, resultJson: String) = close(pageId, resultJson, canceled = false)

    fun cancel(pageId: String) = close(pageId, null, canceled = true)

    /** Back from the system (gesture, key, Nav3's onBack): cancels the top page. */
    fun back() {
        stack.lastOrNull()?.takeIf { stack.size > 1 }?.let { cancel(it.id) }
    }

    private fun close(pageId: String, resultJson: String?, canceled: Boolean) {
        val current = sheet
        if (current?.id == pageId) {
            current.close(resultJson, canceled)
            sheetClosing = true // SheetHost animates it out, then calls onSheetHidden().
            return
        }
        val entry = stack.firstOrNull { it.id == pageId } ?: return
        if (stack.size == 1) return
        entry.close(resultJson, canceled)
        stack.remove(entry)
        entry.remove()
    }

    fun onSheetHidden() {
        val current = sheet ?: return
        sheet = null
        sheetClosing = false
        current.remove()
    }

    /** Animates the sheet out, cancelled. */
    private fun dismissSheet() {
        sheet?.takeIf { !sheetClosing }?.let { it.close(null, true); sheetClosing = true }
    }

    /** Keeps the bottom `count` pages, removing the rest at once (one Nav3 transition), top first. */
    private fun keep(count: Int) {
        if (stack.size <= count) return
        val removed = stack.subList(count, stack.size).toList()
        stack.removeRange(count, stack.size)
        removed.asReversed().forEach { it.remove() }
    }

    fun replace(route: String, paramsJson: String, navigation: NavigationOptions) {
        dismissSheet()
        val old = stack.lastOrNull() ?: return
        stack[stack.lastIndex] = entry(route, paramsJson, Presentation.Push, navigation, null)
        old.remove()
    }

    /** The sheet counts as one page; the root never goes. */
    fun back(delta: Int) {
        var count = delta
        if (count > 0 && sheet != null) {
            dismissSheet()
            count--
        }
        keep((stack.size - count).coerceAtLeast(1))
    }

    fun popToRoot() {
        dismissSheet()
        keep(1)
    }

    fun reset(route: String, paramsJson: String) {
        val removed = stack.toList()
        val oldSheet = sheet
        sheet = null
        sheetClosing = false
        stack.clear()
        stack.add(entry(route, paramsJson, Presentation.Push, NavigationOptions.Default, null))
        oldSheet?.remove()
        removed.asReversed().forEach { it.remove() }
    }

    /** Back to the tab shell with `tab` selected; a new root shell when the stack has none. */
    fun switchTab(tab: String) {
        val bar = tabBar ?: return
        val index = stack.indexOfLast { it.route == bar.route }
        if (index < 0) return reset(bar.route, JSONObject().put("tab", tab).toString())
        dismissSheet()
        keep(index + 1)
        stack[index].selectedTab = tab
    }

    /** Root first, the sheet last; the pages in a tab shell are not on the stack. */
    fun currentPages(): String = JSONArray((stack + listOfNotNull(sheet)).map { page ->
        JSONObject().put("pageId", page.id).put("route", page.route).put("params", JSONObject(page.paramsJson.ifEmpty { "{}" }))
    }).toString()

    fun destroyAll() {
        (stack + listOfNotNull(sheet)).forEach { page -> page.tabPages.values.forEach { it.destroy() }; page.destroy() }
    }
}
