package io.valdiroutes.app

import kotlin.math.roundToInt

/**
 * Pure layout and animation math shared between Android keyboard views (`KeyboardViews.kt`) and JVM unit tests.
 */
internal object KeyboardMath {
    /**
     * Vertical translation applied to `KeyboardStickyView` in pixels.
     *
     * At rest (`keyboardHeightPx <= 0`), keeps `closedOffsetPx`. During an active keyboard transition (`progress` in
     * `[0, 1]`), interpolates smoothly between `closedOffsetPx` and `openedOffsetPx` so the sticky view tracks the
     * keyboard frame-by-frame without layout churn.
     */
    fun stickyTranslationY(
        keyboardHeightPx: Float,
        progress: Float,
        closedOffsetPx: Float,
        openedOffsetPx: Float,
        enabled: Boolean,
    ): Float {
        if (!enabled) return 0f
        if (keyboardHeightPx <= 0f) return closedOffsetPx
        val clampedProgress = progress.coerceIn(0f, 1f)
        val interpolated = closedOffsetPx + (openedOffsetPx - closedOffsetPx) * clampedProgress
        val raw = -keyboardHeightPx + interpolated
        return if (openedOffsetPx >= closedOffsetPx) minOf(closedOffsetPx, raw) else raw
    }

    /**
     * Number of vertical pixels `KeyboardAvoidingView` overlaps the visible keyboard (shifted by
     * `keyboardVerticalOffsetPx`), clamped to `[0, viewHeightPx]`.
     */
    fun avoidingOverlapPx(
        restingBottomInWindowPx: Float,
        viewHeightPx: Float,
        windowHeightPx: Float,
        keyboardHeightPx: Float,
        keyboardVerticalOffsetPx: Float,
        enabled: Boolean,
    ): Float {
        if (!enabled || keyboardHeightPx <= 0f || viewHeightPx <= 0f || windowHeightPx <= 0f) return 0f
        val keyboardTop = windowHeightPx - keyboardHeightPx
        val raw = restingBottomInWindowPx - keyboardTop + keyboardVerticalOffsetPx
        return raw.coerceIn(0f, viewHeightPx)
    }

    /**
     * Bottom content inset applied to the inner `ValdiScrollView` of `KeyboardAwareScrollView` in pixels.
     */
    fun awareScrollBottomInsetPx(
        scrollBottomInWindowPx: Float,
        windowHeightPx: Float,
        keyboardHeightPx: Float,
        progress: Float,
        extraKeyboardSpacePx: Float,
        enabled: Boolean,
    ): Int {
        if (!enabled || keyboardHeightPx <= 0f || windowHeightPx <= 0f) return 0
        val keyboardTop = windowHeightPx - keyboardHeightPx
        val overlap = (scrollBottomInWindowPx - keyboardTop).coerceAtLeast(0f)
        val extra = extraKeyboardSpacePx.coerceAtLeast(0f) * progress.coerceIn(0f, 1f)
        return (overlap + extra).roundToInt().coerceAtLeast(0)
    }

    /**
     * Target vertical scroll offset (`contentOffsetY`) that brings a focused input inside `[top + topMargin, visibleBottom]`
     * and clamps the offset when the keyboard shrinks or hides.
     */
    fun awareScrollTargetOffsetY(
        scrollTopInWindowPx: Float,
        scrollHeightPx: Float,
        windowHeightPx: Float,
        keyboardHeightPx: Float,
        bottomOffsetPx: Float,
        topMarginPx: Float,
        focusedTopInWindowPx: Float,
        focusedBottomInWindowPx: Float,
        currentOffsetY: Int,
        contentHeightPx: Int,
        bottomInsetPx: Int,
    ): Int {
        val clampedScrollH = scrollHeightPx.roundToInt().coerceAtLeast(0)
        val maxOffset = (contentHeightPx - clampedScrollH + bottomInsetPx.coerceAtLeast(0)).coerceAtLeast(0)
        if (keyboardHeightPx <= 0f || scrollHeightPx <= 0f || windowHeightPx <= 0f) {
            return currentOffsetY.coerceIn(0, maxOffset)
        }
        val keyboardTop = windowHeightPx - keyboardHeightPx
        val visibleBottom = minOf(scrollTopInWindowPx + scrollHeightPx, keyboardTop) - bottomOffsetPx
        val overlapBottom = focusedBottomInWindowPx - visibleBottom
        val overlapTop = (scrollTopInWindowPx + topMarginPx) - focusedTopInWindowPx
        return when {
            overlapBottom > 0f -> (currentOffsetY + overlapBottom.roundToInt()).coerceIn(0, maxOffset)
            overlapTop > 0f -> (currentOffsetY - overlapTop.roundToInt()).coerceIn(0, maxOffset)
            else -> currentOffsetY.coerceIn(0, maxOffset)
        }
    }
}
