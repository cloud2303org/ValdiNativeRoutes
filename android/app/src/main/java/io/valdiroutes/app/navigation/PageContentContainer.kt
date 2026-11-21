package io.valdiroutes.app

import android.content.Context
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import com.snap.valdi.views.ValdiScrollView
import kotlin.math.roundToInt

/** A prepared but undisplayed tab must not accept input or accessibility focus. */
internal class PageContentContainer(context: Context) : FrameLayout(context) {
    private val normalFocusability = descendantFocusability
    private var imeBottomPx: Int = 0
    private var pendingRevealFocusedInput: Boolean = false
    private var lastAdjustedFocus: View? = null
    private val focusedLocation = IntArray(2)
    private val scrollLocation = IntArray(2)
    private val focusChangeListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
        if (newFocus != null && imeBottomPx > 0 && isDescendant(newFocus) && newFocus !== lastAdjustedFocus) {
            pendingRevealFocusedInput = true
            post { ensureFocusedInputVisible() }
        }
    }

    var acceptsInput = true
        set(value) {
            if (field == value) return
            field = value
            descendantFocusability = if (value) normalFocusability else FOCUS_BLOCK_DESCENDANTS
            importantForAccessibility = if (value) View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
                else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            if (!value) clearFocus()
        }

    fun setKeyboardHeightPx(nextImeBottomPx: Int) {
        if (nextImeBottomPx == imeBottomPx) return
        val grew = nextImeBottomPx > imeBottomPx
        imeBottomPx = nextImeBottomPx
        if (imeBottomPx <= 0) {
            pendingRevealFocusedInput = false
            lastAdjustedFocus = null
            return
        }
        if (grew) {
            pendingRevealFocusedInput = true
            post {
                if (pendingRevealFocusedInput) {
                    ensureFocusedInputVisible()
                }
            }
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnGlobalFocusChangeListener(focusChangeListener)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnGlobalFocusChangeListener(focusChangeListener)
        super.onDetachedFromWindow()
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        if (pendingRevealFocusedInput && imeBottomPx > 0) {
            ensureFocusedInputVisible()
        }
    }

    private fun isDescendant(view: View): Boolean {
        var current: View? = view
        while (current != null) {
            if (current === this) return true
            current = current.parent as? View
        }
        return false
    }

    private fun ensureFocusedInputVisible() {
        pendingRevealFocusedInput = false
        if (imeBottomPx <= 0) return
        val focused = findFocus() ?: return
        val sv = findNearestVerticalScrollView(focused) ?: return
        if (sv.height <= 0 || focused.height <= 0) return

        focused.getLocationInWindow(focusedLocation)
        sv.getLocationInWindow(scrollLocation)

        val marginPx = (16f * resources.displayMetrics.density).roundToInt()
        val focusedTop = focusedLocation[1]
        val focusedBottom = focusedTop + focused.height
        val svTop = scrollLocation[1]
        val svBottom = svTop + sv.height

        val overlapBottom = (focusedBottom + marginPx) - svBottom
        val overlapTop = (svTop + marginPx) - focusedTop
        if (overlapBottom > 0) {
            val maxOffset = (sv.contentHeight - sv.height).coerceAtLeast(0)
            val target = (sv.contentOffsetY + overlapBottom).coerceIn(0, maxOffset)
            if (target != sv.contentOffsetY) {
                sv.setContentOffset(sv.contentOffsetX, target, 0f, 0f, false)
            }
        } else if (overlapTop > 0) {
            val target = (sv.contentOffsetY - overlapTop).coerceAtLeast(0)
            if (target != sv.contentOffsetY) {
                sv.setContentOffset(sv.contentOffsetX, target, 0f, 0f, false)
            }
        }
        lastAdjustedFocus = focused
    }

    private fun findNearestVerticalScrollView(start: View): ValdiScrollView? {
        var current = start.parent as? View
        while (current != null && current !== this) {
            if (current is ValdiScrollView && !current.horizontalScroll && current.scrollEnabled) {
                return current
            }
            current = current.parent as? View
        }
        return null
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean =
        acceptsInput && super.dispatchTouchEvent(event)

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean =
        acceptsInput && super.dispatchGenericMotionEvent(event)

    override fun dispatchHoverEvent(event: MotionEvent): Boolean =
        acceptsInput && super.dispatchHoverEvent(event)

    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        acceptsInput && super.dispatchKeyEvent(event)
}
