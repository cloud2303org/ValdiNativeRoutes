package io.valdiroutes.app

import android.content.Context
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import androidx.annotation.Keep
import com.snap.valdi.views.ValdiView
import java.util.WeakHashMap

/**
 * Native portal host `<custom-view>` rendered by `BottomSheetProvider.tsx`.
 *
 * Responsibilities:
 * - Stacks active `BottomSheetView` instances in ascending `openOrder` (`z` order).
 * - Passes through all Valdi touches that do not hit any active sheet card or modal scrim so app
 *   content behind `BottomSheetProvider` stays 100% interactive.
 * - Routes Android Back / Predictive Back and hardware `Escape` keys to the topmost eligible sheet.
 * - Hides background sibling views (app content inside `BottomSheetProvider`) from TalkBack / Switch
 *   Access whenever at least one modal sheet is presented, restoring their original
 *   `importantForAccessibility` values once dismissed.
 */
@Keep
class BottomSheetPortalHostView(context: Context) : ValdiView(context) {

    private val savedSiblingAccessibility = WeakHashMap<View, Int>()
    private var backgroundHiddenForModal = false
    private var escapeInterceptor: WindowEscapeKeyInterceptor? = null

    private val closeCoordinator = PortalCloseRequestCoordinator<BottomSheetView>(
        stateOf = { it.portalCloseState() },
        onEmitCloseRequest = { it.emitPortalCloseRequest() },
        onDismissModal = { it.dismissPortalModal() },
    )

    init {
        clipChildren = false
        clipToPadding = false
        clipToBounds = false

        installValdiHitTest(this) { xPx, yPx ->
            hasInteractiveChildAt(xPx, yPx)
        }
    }

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    private fun hasInteractiveChildAt(xPx: Float, yPx: Float): Boolean {
        for (i in childCount - 1 downTo 0) {
            val child = getChildAt(i)
            if (child !is BottomSheetView || child.visibility != VISIBLE) continue
            val localX = xPx - child.left - child.translationX
            val localY = yPx - child.top - child.translationY
            if (child.isPortalInteractiveAt(localX, localY)) return true
        }
        return false
    }

    override fun onViewAdded(child: View?) {
        super.onViewAdded(child)
        if (child is BottomSheetView) {
            child.portalOwner = this
        }
        syncSheetStack()
    }

    override fun onViewRemoved(child: View?) {
        if (child is BottomSheetView && child.portalOwner === this) {
            child.portalOwner = null
        }
        super.onViewRemoved(child)
        syncSheetStack()
    }

    internal fun syncSheetStack() {
        val sheets = mutableListOf<BottomSheetView>()
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (child is BottomSheetView && !child.windowOverlay) {
                sheets.add(child)
            }
        }
        sheets.sortBy { it.openOrder }
        // Apply visual & hit-test z-order via translationZ so Valdi child indices stay untouched!
        for (idx in sheets.indices) {
            sheets[idx].translationZ = idx.toFloat() * 0.01f
        }

        closeCoordinator.updateSheets(sheets)
        syncBackgroundAccessibility(sheets.any { it.isPortalModalPresented() })
    }

    private fun syncBackgroundAccessibility(anyModalPresented: Boolean) {
        val parentGroup = parent as? ViewGroup ?: return
        if (anyModalPresented && !backgroundHiddenForModal) {
            backgroundHiddenForModal = true
            for (i in 0 until parentGroup.childCount) {
                val sibling = parentGroup.getChildAt(i)
                if (sibling === this || sibling is BottomSheetPortalHostView) continue
                if (!savedSiblingAccessibility.containsKey(sibling)) {
                    savedSiblingAccessibility[sibling] = sibling.importantForAccessibility
                }
                sibling.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            }
        } else if (!anyModalPresented && backgroundHiddenForModal) {
            restoreBackgroundAccessibility()
        }
    }

    private fun restoreBackgroundAccessibility() {
        backgroundHiddenForModal = false
        for ((sibling, originalValue) in savedSiblingAccessibility) {
            sibling.importantForAccessibility = originalValue
        }
        savedSiblingAccessibility.clear()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (closeCoordinator.handleKeyEvent(event.keyCode, event)) return true
        return super.dispatchKeyEvent(event)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        closeCoordinator.attach(resolveBackDispatcher())
        context.findActivity()?.window?.let { hostWindow ->
            escapeInterceptor = WindowEscapeKeyInterceptor(hostWindow) { event ->
                closeCoordinator.handleKeyEvent(event.keyCode, event)
            }.also { it.install() }
        }
        syncSheetStack()
    }

    override fun onDetachedFromWindow() {
        escapeInterceptor?.uninstall()
        escapeInterceptor = null
        closeCoordinator.detach()
        restoreBackgroundAccessibility()
        super.onDetachedFromWindow()
    }
}
