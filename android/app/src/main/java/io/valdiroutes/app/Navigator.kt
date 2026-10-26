package io.valdiroutes.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.snap.valdi.views.ValdiRootView

enum class Presentation(val value: String) {
    Push("push"),

    /** Fixed height; the keyboard shrinks the page inside it. */
    Sheet("sheet"),

    /** Sized by its page; the whole sheet rides up with the keyboard. */
    CompactSheet("compactSheet");

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
    private val onResult: ResultCallback?,
) {
    /** Owned here, not by Compose: Nav3 disposes covered pages, and a remount would lose their state. */
    var rootView: ValdiRootView? = null
    var appliedInsets: Insets? = null
    var removed = false
        private set
    private var result: Pair<String, Boolean>? = null

    fun close(resultJson: String?, canceled: Boolean) {
        if (result == null) result = (resultJson ?: "") to canceled
    }

    /** Runs once the page has left the stack. */
    fun remove() {
        if (removed) return
        removed = true
        val (json, canceled) = result ?: ("" to true)
        onResult?.invoke(json, canceled)
        // A page still on screen (exit animation) is destroyed when its view is released.
        if (rootView?.parent == null) destroy()
    }

    fun destroy() {
        rootView?.destroy()
        rootView = null
    }
}

/** The navigation state: a Nav3 back stack plus at most one sheet above it. */
class Navigator(private val routes: RouteTable) {
    val stack = mutableStateListOf<PageEntry>()
    var sheet by mutableStateOf<PageEntry?>(null)
        private set
    var sheetClosing by mutableStateOf(false)
        private set
    private var nextId = 0

    fun open(route: String, paramsJson: String = "{}", presentation: Presentation = Presentation.Push, onResult: ResultCallback? = null) {
        val entry = PageEntry("page-${nextId++}", route, routes[route], paramsJson, presentation, onResult)
        if (presentation == Presentation.Push || sheet != null) {
            stack.add(entry)
        } else {
            sheet = entry
            sheetClosing = false
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

    fun destroyAll() {
        (stack + listOfNotNull(sheet)).forEach { it.destroy() }
    }
}
