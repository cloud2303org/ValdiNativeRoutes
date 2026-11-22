package io.valdiroutes.app

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import io.valdiroutes.app_ui.appui.AppUI
import java.util.WeakHashMap
import kotlin.math.max

/** Normalized per-frame keyboard geometry in window pixels, matching `react-native-keyboard-controller`. */
data class KeyboardFrame(
    val heightPx: Float = 0f,
    val progress: Float = 0f,
    val targetHeightPx: Float = 0f,
    val isAnimating: Boolean = false,
    val isInteractive: Boolean = false,
)

fun interface KeyboardSubscription {
    fun dispose()
}

/**
 * Window-scoped IME observer that attaches a tiny non-interactive tracker inside `android.R.id.content` (sibling to
 * Compose / Valdi hosts so existing Compose `InsetsListener` hooks remain untouched) and broadcasts every IME
 * animation frame and settled height change.
 */
object AppUIKeyboardObserver {
    private val trackers = WeakHashMap<ViewGroup, KeyboardTrackerView>()

    fun observe(anchorView: View, listener: (KeyboardFrame) -> Unit): KeyboardSubscription {
        val contentRoot = resolveContentRoot(anchorView)
        if (contentRoot == null) {
            listener(KeyboardFrame())
            return KeyboardSubscription { }
        }
        val tracker = trackers.getOrPut(contentRoot) {
            KeyboardTrackerView(contentRoot.context).also { trackerView ->
                contentRoot.addView(trackerView, ViewGroup.LayoutParams(0, 0))
            }
        }
        return tracker.addListener(listener)
    }

    private fun resolveContentRoot(view: View): ViewGroup? {
        val root = view.rootView as? ViewGroup ?: return null
        return root.findViewById(android.R.id.content) ?: root
    }
}

private class KeyboardTrackerView(context: Context) : FrameLayout(context) {
    private val listeners = linkedMapOf<Int, (KeyboardFrame) -> Unit>()
    private val animationView = View(context)
    private val activeImeAnimations = LinkedHashSet<WindowInsetsAnimationCompat>()
    private var nextListenerId = 0
    private var lastRawImePx = 0
    private var modalSuppressed = false
    private var settledTargetHeightPx = 0f
    private var observedRoot: ViewGroup? = null

    private val rootLayoutChangeListener =
        View.OnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            val resized = (right - left) != (oldRight - oldLeft) || (bottom - top) != (oldBottom - oldTop)
            if (!resized) return@OnLayoutChangeListener
            activeImeAnimations.clear()
            settledTargetHeightPx = 0f
            ViewCompat.requestApplyInsets(this)
            post {
                if (isAttachedToWindow && activeImeAnimations.isEmpty()) {
                    val rawImePx = ViewCompat.getRootWindowInsets(this)
                        ?.getInsets(WindowInsetsCompat.Type.ime())
                        ?.bottom ?: 0
                    updateModalLatch(rawImePx)
                    emitSettled(rawImePx)
                }
            }
        }

    var currentFrame = KeyboardFrame()
        private set

    init {
        setWillNotDraw(true)
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        animationView.setWillNotDraw(true)
        animationView.isClickable = false
        animationView.isFocusable = false
        animationView.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        addView(animationView, LayoutParams(0, 0))

        // Install OnApplyWindowInsetsListener on the outer tracker and WindowInsetsAnimationCompat on its child view
        // so AndroidX pre-R fallback chaining and Compose sibling listeners never interfere with each other.
        ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
            val imePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            updateModalLatch(imePx)
            if (activeImeAnimations.isEmpty()) {
                emitSettled(imePx)
            }
            insets
        }

        ViewCompat.setWindowInsetsAnimationCallback(
            animationView,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onPrepare(animation: WindowInsetsAnimationCompat) {
                    if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
                        activeImeAnimations.add(animation)
                    }
                }

                override fun onStart(
                    animation: WindowInsetsAnimationCompat,
                    bounds: WindowInsetsAnimationCompat.BoundsCompat,
                ): WindowInsetsAnimationCompat.BoundsCompat {
                    if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
                        val upperImePx = bounds.upperBound.bottom.toFloat()
                        if (upperImePx > 0f) {
                            settledTargetHeightPx = upperImePx
                        }
                    }
                    return bounds
                }

                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<WindowInsetsAnimationCompat>,
                ): WindowInsetsCompat {
                    val hasIme = runningAnimations.any {
                        (it.typeMask and WindowInsetsCompat.Type.ime()) != 0
                    }
                    if (!hasIme) return insets
                    val rawImePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                    updateModalLatch(rawImePx)
                    if (modalSuppressed) {
                        emit(KeyboardFrame())
                        return insets
                    }
                    val heightPx = rawImePx.toFloat().coerceAtLeast(0f)
                    val target = max(settledTargetHeightPx, heightPx)
                    val progress = if (heightPx <= 0f || target <= 0f) 0f else (heightPx / target).coerceIn(0f, 1f)
                    emit(
                        KeyboardFrame(
                            heightPx = heightPx,
                            progress = progress,
                            targetHeightPx = target,
                            isAnimating = true,
                            isInteractive = false,
                        ),
                    )
                    return insets
                }

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    if ((animation.typeMask and WindowInsetsCompat.Type.ime()) != 0) {
                        activeImeAnimations.remove(animation)
                        if (activeImeAnimations.isEmpty()) {
                            val rawImePx = ViewCompat.getRootWindowInsets(this@KeyboardTrackerView)
                                ?.getInsets(WindowInsetsCompat.Type.ime())
                                ?.bottom ?: 0
                            updateModalLatch(rawImePx)
                            emitSettled(rawImePx)
                        }
                    }
                }
            },
        )
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(0, 0)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        val host = parent as? ViewGroup
        if (host !== observedRoot) {
            observedRoot?.removeOnLayoutChangeListener(rootLayoutChangeListener)
            observedRoot = host
            host?.addOnLayoutChangeListener(rootLayoutChangeListener)
        }
        val rawImePx = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.ime())
            ?.bottom ?: 0
        updateModalLatch(rawImePx)
        emitSettled(rawImePx)
        ViewCompat.requestApplyInsets(this)
    }

    override fun onDetachedFromWindow() {
        observedRoot?.removeOnLayoutChangeListener(rootLayoutChangeListener)
        observedRoot = null
        activeImeAnimations.clear()
        settledTargetHeightPx = 0f
        super.onDetachedFromWindow()
    }

    fun addListener(listener: (KeyboardFrame) -> Unit): KeyboardSubscription {
        val id = nextListenerId++
        listeners[id] = listener
        if (isAttachedToWindow) {
            listener(currentFrame)
        }
        return KeyboardSubscription { listeners.remove(id) }
    }

    private fun updateModalLatch(rawImePx: Int) {
        val modalOpen = rootView === AppUI.hostWindow?.decorView && AppUI.modal != null
        if (modalOpen) {
            modalSuppressed = true
        } else if (rawImePx == 0 || lastRawImePx == 0) {
            modalSuppressed = false
        }
        lastRawImePx = rawImePx
    }

    private fun emitSettled(rawImePx: Int) {
        if (modalSuppressed) {
            settledTargetHeightPx = 0f
            emit(KeyboardFrame())
            return
        }
        val heightPx = rawImePx.toFloat().coerceAtLeast(0f)
        if (heightPx > 0f) {
            settledTargetHeightPx = heightPx
            emit(
                KeyboardFrame(
                    heightPx = heightPx,
                    progress = 1f,
                    targetHeightPx = heightPx,
                    isAnimating = false,
                    isInteractive = false,
                ),
            )
        } else {
            settledTargetHeightPx = 0f
            emit(
                KeyboardFrame(
                    heightPx = 0f,
                    progress = 0f,
                    targetHeightPx = 0f,
                    isAnimating = false,
                    isInteractive = false,
                ),
            )
        }
    }

    private fun emit(frame: KeyboardFrame) {
        if (frame == currentFrame) return
        currentFrame = frame
        for (listener in listeners.values.toList()) {
            listener(frame)
        }
    }
}
