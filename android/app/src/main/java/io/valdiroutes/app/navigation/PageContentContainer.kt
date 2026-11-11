package io.valdiroutes.app

import android.content.Context
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout

/** A prepared but undisplayed tab must not accept input or accessibility focus. */
internal class PageContentContainer(context: Context) : FrameLayout(context) {
    private val normalFocusability = descendantFocusability

    var acceptsInput = true
        set(value) {
            if (field == value) return
            field = value
            descendantFocusability = if (value) normalFocusability else FOCUS_BLOCK_DESCENDANTS
            importantForAccessibility = if (value) View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
                else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            if (!value) clearFocus()
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
