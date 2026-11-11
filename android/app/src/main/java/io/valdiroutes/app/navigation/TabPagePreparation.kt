package io.valdiroutes.app

import android.view.View
import android.view.ViewTreeObserver
import com.snap.valdi.views.ValdiRootView
import java.lang.ref.WeakReference

/**
 * Observe a tab root's render transaction and layout without ever vetoing a window draw.
 * The current page keeps drawing while the target is mounted in a transparent preparation slot.
 */
internal class TabPagePreparation(
    private val content: View,
    private val page: PageEntry,
    private val ready: () -> Unit,
    private val failed: (Exception) -> Unit,
) : ViewTreeObserver.OnPreDrawListener {
    private data class Request(
        val root: WeakReference<ValdiRootView>,
        val revision: Long,
        val width: Int,
        val height: Int,
    )

    private val observer = content.viewTreeObserver
    private var active = true
    private var request: Request? = null

    init {
        observer.addOnPreDrawListener(this)
        content.postInvalidateOnAnimation()
    }

    override fun onPreDraw(): Boolean {
        if (!active) return true
        val root = page.rootView
        if (page.removed) {
            dispose()
            return true
        }
        if (root?.destroyed == true) {
            dispose()
            content.post { failed(IllegalStateException("Tab root was destroyed during preparation")) }
            return true
        }
        if (root == null || !root.isAttachedToWindow || !root.isLaidOut ||
            root.width <= 0 || root.height <= 0 || root.isLayoutRequested
        ) return true
        val old = request
        val revision = ValdiHost.contentRevision(root)
        if (old == null || old.root.get() !== root || old.revision != revision ||
            old.width != root.width || old.height != root.height
        ) {
            val next = Request(WeakReference(root), revision, root.width, root.height)
            request = next
            val weak = WeakReference(this)
            ValdiHost.requestInitialContentDraw(root) { error ->
                val preparation = weak.get() ?: return@requestInitialContentDraw
                preparation.content.post { preparation.completed(next, error) }
            }
        }
        return true
    }

    private fun completed(expected: Request, error: Exception?) {
        if (!active || request !== expected || page.removed) return
        val root = page.rootView
        if (root == null || root !== expected.root.get() || root.destroyed ||
            ValdiHost.contentRevision(root) != expected.revision ||
            root.width != expected.width || root.height != expected.height ||
            !root.isAttachedToWindow || root.isLayoutRequested
        ) {
            request = null
            content.postInvalidateOnAnimation()
            return
        }
        dispose()
        if (error != null) failed(error) else {
            page.tabContentInitialized = true
            ready()
        }
    }

    fun dispose() {
        if (!active) return
        active = false
        if (observer.isAlive) observer.removeOnPreDrawListener(this)
        else content.viewTreeObserver.takeIf { it.isAlive }?.removeOnPreDrawListener(this)
        request = null
    }
}
