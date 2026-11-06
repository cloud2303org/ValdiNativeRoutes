package io.valdiroutes.app

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.pages.AndroidSplashScreenHost
import io.valdiroutes.pages.AndroidSplashScreenNativeModule
import io.valdiroutes.pages.AndroidSplashScreenNativeModuleFactory
import java.lang.ref.WeakReference
import java.util.IdentityHashMap

/** Launch policy outlives an Activity; the window and pending draw callbacks do not. */
internal object StartupSplashScreen : AndroidSplashScreenHost {
    private val main = Handler(Looper.getMainLooper())
    private val state = StartupSplashState()
    private var current = WeakReference<InitialContentSplashGate>(null)

    fun attach(
        content: View,
        roots: () -> List<ValdiRootView>?,
        onFailure: (Exception) -> Unit,
    ): InitialContentSplashGate {
        current.get()?.dispose()
        return InitialContentSplashGate(content, state, roots, onFailure).also {
            current = WeakReference(it)
        }
    }

    override fun preventAutoHide(): Boolean {
        val accepted = state.preventAutoHide()
        if (accepted) main.post { current.get()?.invalidate() }
        return accepted
    }

    override fun hide() {
        state.hide()
        main.post { current.get()?.invalidate() }
    }
}

internal class SplashScreenModuleFactoryImpl : AndroidSplashScreenNativeModuleFactory() {
    private val module = object : AndroidSplashScreenNativeModule {
        override fun getHost(): AndroidSplashScreenHost = StartupSplashScreen
    }

    override fun onLoadModule(): AndroidSplashScreenNativeModule = module
}

/** Defers only drawing: composition, layout and both execution queues remain live. */
internal class InitialContentSplashGate(
    private val content: View,
    private val state: StartupSplashState,
    private val initialRoots: () -> List<ValdiRootView>?,
    private val onFailure: (Exception) -> Unit,
) : ViewTreeObserver.OnPreDrawListener {
    private data class Request(
        val ticket: Long,
        val readinessRevision: Long,
        val revision: Long,
        val width: Int,
        val height: Int,
        var ready: Boolean = false,
    )

    private val observer = content.viewTreeObserver
    private val requests = IdentityHashMap<ValdiRootView, Request>()
    private var nextTicket = 0L
    private var observedReadinessRevision = state.readinessRevision()
    private var composed = false
    private var active = true

    init {
        observer.addOnPreDrawListener(this)
    }

    fun onContentComposed() {
        composed = true
    }

    fun invalidate() {
        if (active) content.postInvalidateOnAnimation()
    }

    override fun onPreDraw(): Boolean {
        if (!active) return true
        val readinessRevision = state.readinessRevision()
        if (observedReadinessRevision != readinessRevision) {
            // A synchronous hide invalidates old readiness even before its UI wake-up runs.
            requests.clear()
            observedReadinessRevision = readinessRevision
        }
        if (state.takeDrawPermission(false, readinessRevision)) {
            dispose()
            return true
        }
        if (!composed || !content.isLaidOut || content.width <= 0 || content.height <= 0) return false
        val roots = initialRoots() ?: return false
        requests.keys.removeAll { root -> roots.none { it === root } }
        for (root in roots) {
            if (root.destroyed) {
                fail(IllegalStateException("Initial page was destroyed before its first draw"))
                return true
            }
            if (!root.isAttachedToWindow || !root.isLaidOut ||
                root.width <= 0 || root.height <= 0 || root.isLayoutRequested
            ) return false
        }
        for (root in roots) {
            val revision = ValdiHost.contentRevision(root)
            val old = requests[root]
            if (old == null || old.revision != revision || old.width != root.width || old.height != root.height) {
                val request = Request(++nextTicket, readinessRevision, revision, root.width, root.height)
                requests[root] = request
                val weakGate = WeakReference(this)
                val weakRoot = WeakReference(root)
                // Neither a callback queued in JS nor its native wrapper owns the Activity.
                ValdiHost.requestInitialContentDraw(root) { error ->
                    val gate = weakGate.get() ?: return@requestInitialContentDraw
                    val readyRoot = weakRoot.get() ?: return@requestInitialContentDraw
                    gate.content.post { gate.drawReady(readyRoot, request.ticket, error) }
                }
            }
        }
        val ready = roots.all { requests[it]?.ready == true && !it.isLayoutRequested }
        if (!state.takeDrawPermission(ready, readinessRevision)) return false
        StartupTrace.mark("activity.initial_content_ready_for_draw")
        dispose()
        return true
    }

    private fun drawReady(root: ValdiRootView, ticket: Long, error: Exception?) {
        if (!active || root.destroyed) return
        val request = requests[root] ?: return
        if (request.ticket != ticket) return
        if (request.readinessRevision != state.readinessRevision()) {
            invalidate()
            return
        }
        val currentRoots = initialRoots() ?: return
        if (currentRoots.none { it === root } || request.revision != ValdiHost.contentRevision(root) ||
            request.width != root.width || request.height != root.height
        ) {
            invalidate()
            return
        }
        if (error != null) {
            fail(error, request.readinessRevision)
            return
        }
        request.ready = true
        invalidate()
    }

    fun fail(error: Exception, readinessRevision: Long? = null) {
        if (!active) return
        if (!state.dispose(readinessRevision)) {
            invalidate()
            return
        }
        dispose()
        onFailure(error)
    }

    fun dispose() {
        if (!active) return
        active = false
        if (observer.isAlive) observer.removeOnPreDrawListener(this)
        else content.viewTreeObserver.removeOnPreDrawListener(this)
        requests.clear()
    }
}
