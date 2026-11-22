package io.valdiroutes.app

import io.valdiroutes.app.KeyboardMath
import org.junit.Assert.assertEquals
import org.junit.Test

class KeyboardMathTest {
    @Test
    fun stickyTranslationYTracksOpenCloseAndClampsSubSafeKeyboards() {
        // Closed
        assertEquals(0f, KeyboardMath.stickyTranslationY(0f, 0f, 0f, 70f, true), 0.01f)
        assertEquals(12f, KeyboardMath.stickyTranslationY(0f, 0f, 12f, 70f, true), 0.01f)
        // Mid-animation (50% of 900px = 450px; offset 0 -> 70 => 35 => -450 + 35 = -415)
        assertEquals(-415f, KeyboardMath.stickyTranslationY(450f, 0.5f, 0f, 70f, true), 0.01f)
        // Settled open with openedOffset = 70 => -900 + 70 = -830
        assertEquals(-830f, KeyboardMath.stickyTranslationY(900f, 1f, 0f, 70f, true), 0.01f)
        // Tiny keyboard smaller than openedOffset never pushes downward past closedOffset
        assertEquals(0f, KeyboardMath.stickyTranslationY(40f, 1f, 0f, 70f, true), 0.01f)
        // Negative offset (lifting extra margin when opened) is respected
        assertEquals(-920f, KeyboardMath.stickyTranslationY(900f, 1f, 0f, -20f, true), 0.01f)
        // Disabled
        assertEquals(0f, KeyboardMath.stickyTranslationY(900f, 1f, 10f, 70f, false), 0.01f)
    }

    @Test
    fun avoidingOverlapPxAccountsForVerticalOffsetAndClampsToViewHeight() {
        // Closed
        assertEquals(0f, KeyboardMath.avoidingOverlapPx(2400f, 2400f, 2400f, 0f, 0f, true), 0.01f)
        // Fullscreen view with -70px vertical offset against 900px keyboard => 830px overlap
        assertEquals(830f, KeyboardMath.avoidingOverlapPx(2400f, 2400f, 2400f, 900f, -70f, true), 0.01f)
        // View already above keyboard => 0
        assertEquals(0f, KeyboardMath.avoidingOverlapPx(1200f, 500f, 2400f, 900f, 0f, true), 0.01f)
        // Clamped to viewHeight when keyboard exceeds view height
        assertEquals(300f, KeyboardMath.avoidingOverlapPx(2300f, 300f, 2400f, 900f, 0f, true), 0.01f)
        // Disabled
        assertEquals(0f, KeyboardMath.avoidingOverlapPx(2400f, 2400f, 2400f, 900f, 0f, false), 0.01f)
    }

    @Test
    fun awareScrollBottomInsetPxCombinesOverlapAndExtraSpace() {
        // Closed
        assertEquals(0, KeyboardMath.awareScrollBottomInsetPx(2300f, 2400f, 0f, 0f, 64f, true))
        // Scroll bottom 2100 overlaps keyboard top (2400 - 900 = 1500) by 600; progress 0.5 of 64 = 32 => 632
        assertEquals(632, KeyboardMath.awareScrollBottomInsetPx(2100f, 2400f, 900f, 0.5f, 64f, true))
        // Settled
        assertEquals(664, KeyboardMath.awareScrollBottomInsetPx(2100f, 2400f, 900f, 1f, 64f, true))
        // Scroll completely above keyboard: only progress-scaled extra space applies
        assertEquals(48, KeyboardMath.awareScrollBottomInsetPx(1300f, 2400f, 900f, 1f, 48f, true))
        // Disabled
        assertEquals(0, KeyboardMath.awareScrollBottomInsetPx(2100f, 2400f, 900f, 1f, 48f, false))
    }

    @Test
    fun awareScrollTargetOffsetYRevealsFocusedViewAndClampsOnClose() {
        // Scroll bottom = 2100, keyboard top = 1500, bottomOffset = 80 => visibleBottom = 1420.
        // Focused input bottom = 1520 => overlaps visibleBottom by 100 => offset 200 -> 300.
        assertEquals(
            300,
            KeyboardMath.awareScrollTargetOffsetY(
                scrollTopInWindowPx = 300f,
                scrollHeightPx = 1800f,
                windowHeightPx = 2400f,
                keyboardHeightPx = 900f,
                bottomOffsetPx = 80f,
                topMarginPx = 24f,
                focusedTopInWindowPx = 1400f,
                focusedBottomInWindowPx = 1520f,
                currentOffsetY = 200,
                contentHeightPx = 2200,
                bottomInsetPx = 664,
            ),
        )
        // Focused input scrolled above top (+24px topMargin => 324; focusedTop = 260) => 200 - 64 = 136
        assertEquals(
            136,
            KeyboardMath.awareScrollTargetOffsetY(
                scrollTopInWindowPx = 300f,
                scrollHeightPx = 1800f,
                windowHeightPx = 2400f,
                keyboardHeightPx = 900f,
                bottomOffsetPx = 80f,
                topMarginPx = 24f,
                focusedTopInWindowPx = 260f,
                focusedBottomInWindowPx = 360f,
                currentOffsetY = 200,
                contentHeightPx = 2200,
                bottomInsetPx = 664,
            ),
        )
        // Keyboard closed -> clamps stale offset (700) back down to contentHeight(2200) - scrollHeight(1800) = 400
        assertEquals(
            400,
            KeyboardMath.awareScrollTargetOffsetY(
                scrollTopInWindowPx = 300f,
                scrollHeightPx = 1800f,
                windowHeightPx = 2400f,
                keyboardHeightPx = 0f,
                bottomOffsetPx = 80f,
                topMarginPx = 24f,
                focusedTopInWindowPx = 1000f,
                focusedBottomInWindowPx = 1100f,
                currentOffsetY = 700,
                contentHeightPx = 2200,
                bottomInsetPx = 0,
            ),
        )
    }
}
