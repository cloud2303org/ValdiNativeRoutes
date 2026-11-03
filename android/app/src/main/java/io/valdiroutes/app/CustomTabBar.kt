package io.valdiroutes.app

import androidx.annotation.Keep
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.pages.TabBarContext

/**
 * Owned by PageEntry, so covering a shell retains its bar, while reset/reload destroys the old one.
 * ValdiContext keeps componentContext weakly: retain the generated context until the root is destroyed.
 */
internal class CustomTabBar(
    val rootView: ValdiRootView,
    @Keep private val context: TabBarContext,
    private val selection: TabBarSelection,
) {
    private var destroyed = false
    private var selectedRoute: String? = null
    private var safeAreaBottom: Double? = null

    fun update(selectedRoute: String, safeAreaBottom: Double, update: () -> Unit) {
        if (destroyed || (this.selectedRoute == selectedRoute && this.safeAreaBottom == safeAreaBottom)) return
        this.selectedRoute = selectedRoute
        this.safeAreaBottom = safeAreaBottom
        update()
    }

    fun deactivate() = selection.deactivate()

    fun destroy() {
        if (destroyed) return
        destroyed = true
        deactivate()
        rootView.destroy()
    }
}
