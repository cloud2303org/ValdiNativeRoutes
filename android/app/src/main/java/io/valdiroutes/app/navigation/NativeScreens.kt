package io.valdiroutes.app

import androidx.compose.runtime.Composable

/** What a native page gets: its params, and the navigator it shares with the Valdi pages. */
class NativePage(val entry: PageEntry, val navigator: Navigator, val insets: Insets) {
    val params: Map<String, Any?> get() = entry.params

    /** Closes this page and delivers the result to whoever opened it with pushForResult. */
    fun finish(result: Map<String, Any?>) = navigator.finish(entry.id, result)

    fun back() = navigator.cancel(entry.id)

    /** As Page.setStatusBarStyle: 'auto', 'light' or 'dark'; reset to 'auto' each time the page comes back. */
    fun setStatusBarStyle(style: String) {
        require(style in listOf("auto", "light", "dark")) { "Bad status bar style: $style" }
        navigator.statusBarStyle = style
    }
}

/**
 * The native pages, keyed by nativeName for routes with kind 'native' in routes.ts. Registered at startup (App);
 * RouteTable.from validates each native route's registration before the first page opens.
 */
object NativeScreens {
    private val screens = mutableMapOf<String, @Composable (NativePage) -> Unit>()

    fun register(route: String, content: @Composable (NativePage) -> Unit) {
        require(route !in screens) { "Duplicate native screen: $route" }
        screens[route] = content
    }

    fun contains(name: String) = screens.containsKey(name)

    @Composable
    fun Content(page: NativePage) {
        requireNotNull(screens[page.entry.definition.nativeName]) { "No native screen registered for ${page.entry.route}" }(page)
    }
}

