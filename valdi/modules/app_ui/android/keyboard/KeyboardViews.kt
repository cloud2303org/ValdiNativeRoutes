package io.valdiroutes.app

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.Keep
import com.snap.valdi.ValdiRuntimeManager
import com.snap.valdi.attributes.AttributesBinder
import com.snap.valdi.attributes.AttributesBindingContext
import com.snap.valdi.views.ValdiScrollView
import com.snap.valdi.views.ValdiView
import java.util.WeakHashMap
import kotlin.math.abs

/** Tracks the bottom content inset applied to a [ValdiScrollView] so gesture coordinators can read its scrollable range. */
internal object ValdiScrollViewInsets {
    private val bottomInsets = WeakHashMap<ValdiScrollView, Int>()

    fun setBottomInset(scrollView: ValdiScrollView, bottomPx: Int) {
        val clamped = bottomPx.coerceAtLeast(0)
        if (clamped == 0) {
            bottomInsets.remove(scrollView)
        } else {
            bottomInsets[scrollView] = clamped
        }
    }

    fun getBottomInset(scrollView: ValdiScrollView): Int = bottomInsets[scrollView] ?: 0
}

/**
 * Native `<custom-view>` container mirroring `react-native-keyboard-controller`'s `KeyboardStickyView`.
 * Translates via `translationY` every display frame in sync with the OS IME animation without relayout.
 */
@Keep
class KeyboardStickyView(context: Context) : ValdiView(context) {
    var keyboardEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            applyFrame(lastFrame)
        }
    var offsetClosedDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            applyFrame(lastFrame)
        }
    var offsetOpenedDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            applyFrame(lastFrame)
        }

    private var subscription: KeyboardSubscription? = null
    private var lastFrame = KeyboardFrame()

    init {
        clipChildren = false
        clipToPadding = false
        clipToBounds = false
    }

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    fun resetConfig() {
        keyboardEnabled = true
        offsetClosedDp = 0f
        offsetOpenedDp = 0f
        lastFrame = KeyboardFrame()
        translationY = 0f
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        subscription?.dispose()
        subscription = AppUIKeyboardObserver.observe(this) { frame ->
            lastFrame = frame
            applyFrame(frame)
        }
    }

    override fun onDetachedFromWindow() {
        subscription?.dispose()
        subscription = null
        super.onDetachedFromWindow()
    }

    override fun onLayout(p0: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(p0, l, t, r, b)
        applyFrame(lastFrame)
    }

    override fun prepareForRecycling() {
        subscription?.dispose()
        subscription = null
        resetConfig()
        super.prepareForRecycling()
    }

    private fun applyFrame(frame: KeyboardFrame) {
        if (!isShown && frame.heightPx > 0f) return
        val density = resources.displayMetrics.density
        val dy = KeyboardMath.stickyTranslationY(
            keyboardHeightPx = frame.heightPx,
            progress = frame.progress,
            closedOffsetPx = offsetClosedDp * density,
            openedOffsetPx = offsetOpenedDp * density,
            enabled = keyboardEnabled,
        )
        if (translationY != dy) {
            translationY = dy
        }
    }
}

/**
 * Native `<custom-view>` container mirroring `KeyboardAvoidingView` (`behavior`: `'padding' | 'translate-with-padding' | 'height'`).
 */
@Keep
class KeyboardAvoidingView(context: Context) : ValdiView(context) {
    var keyboardEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            scheduleUpdate()
        }
    var keyboardBehavior: String = "padding"
        set(value) {
            if (field == value) return
            clearOverrides(invalidate = true)
            field = value
            scheduleUpdate()
        }
    var keyboardVerticalOffsetDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            scheduleUpdate()
        }

    private var subscription: KeyboardSubscription? = null
    private var lastFrame = KeyboardFrame()
    private val location = IntArray(2)
    private var appliedTranslationY = 0f
    private var hasPaddingOverride = false
    private var savedBasePaddingDp = 0f
    private var lastAppliedPaddingDp = Float.NaN
    private var hasHeightOverride = false
    private var restingHeightPx = 0
    private var lastAppliedHeightDp = Float.NaN
    private var lastWindowWidthPx = 0
    private var lastWindowHeightPx = 0
    private var lastLaidOutWidthPx = 0
    private var lastLaidOutHeightPx = 0
    private var updateScheduled = false

    init {
        clipChildren = false
        clipToPadding = false
        clipToBounds = false
    }

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    fun resetConfig() {
        clearOverrides(invalidate = false)
        keyboardEnabled = true
        keyboardBehavior = "padding"
        keyboardVerticalOffsetDp = 0f
        lastFrame = KeyboardFrame()
        restingHeightPx = 0
        lastWindowWidthPx = 0
        lastWindowHeightPx = 0
        lastLaidOutWidthPx = 0
        lastLaidOutHeightPx = 0
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        subscription?.dispose()
        subscription = AppUIKeyboardObserver.observe(this) { frame ->
            lastFrame = frame
            applyFrame(frame)
        }
    }

    override fun onDetachedFromWindow() {
        subscription?.dispose()
        subscription = null
        clearOverrides(invalidate = false)
        super.onDetachedFromWindow()
    }

    override fun onLayout(p0: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(p0, l, t, r, b)
        val winW = rootView?.width ?: 0
        val winH = rootView?.height ?: 0
        val windowChanged = winW != lastWindowWidthPx || winH != lastWindowHeightPx
        val sizeChanged = width != lastLaidOutWidthPx || height != lastLaidOutHeightPx
        lastWindowWidthPx = winW
        lastWindowHeightPx = winH
        lastLaidOutWidthPx = width
        lastLaidOutHeightPx = height
        if (keyboardBehavior == "height") {
            if (windowChanged && hasHeightOverride) {
                scheduleUpdate(resetHeightBaseline = true)
                return
            }
            if (!hasHeightOverride && height > 0) {
                restingHeightPx = height
            }
        }
        if (windowChanged || sizeChanged) {
            scheduleUpdate()
        }
    }

    override fun prepareForRecycling() {
        subscription?.dispose()
        subscription = null
        resetConfig()
        super.prepareForRecycling()
    }

    private fun scheduleUpdate(resetHeightBaseline: Boolean = false) {
        if (!isAttachedToWindow) return
        if (resetHeightBaseline) {
            clearHeightOverride(invalidate = true)
            restingHeightPx = 0
        }
        if (updateScheduled) return
        updateScheduled = true
        post {
            updateScheduled = false
            if (isAttachedToWindow) {
                applyFrame(lastFrame)
            }
        }
    }

    private fun applyFrame(frame: KeyboardFrame) {
        if (!isAttachedToWindow) return
        if (!isShown) {
            if (frame.heightPx <= 0f || !keyboardEnabled) {
                clearOverrides(invalidate = true)
            }
            return
        }
        val windowHeight = rootView?.height ?: 0
        if (windowHeight <= 0 || height <= 0) return

        val density = resources.displayMetrics.density
        val verticalOffsetPx = keyboardVerticalOffsetDp * density
        getLocationInWindow(location)

        when (keyboardBehavior) {
            "translate-with-padding" -> {
                clearPaddingOverride(invalidate = true)
                clearHeightOverride(invalidate = true)
                val restingBottom = minOf(location[1] + height - appliedTranslationY, windowHeight.toFloat())
                val overlap = KeyboardMath.avoidingOverlapPx(
                    restingBottomInWindowPx = restingBottom,
                    viewHeightPx = height.toFloat(),
                    windowHeightPx = windowHeight.toFloat(),
                    keyboardHeightPx = frame.heightPx,
                    keyboardVerticalOffsetPx = verticalOffsetPx,
                    enabled = keyboardEnabled,
                )
                val targetTranslation = -overlap
                appliedTranslationY = targetTranslation
                if (translationY != targetTranslation) {
                    translationY = targetTranslation
                }
            }
            "height" -> {
                clearTranslation()
                clearPaddingOverride(invalidate = true)
                if (!hasHeightOverride) {
                    restingHeightPx = height
                }
                val baseH = if (restingHeightPx > 0) restingHeightPx else height
                val restingBottom = minOf(location[1] + baseH.toFloat(), windowHeight.toFloat())
                val overlap = KeyboardMath.avoidingOverlapPx(
                    restingBottomInWindowPx = restingBottom,
                    viewHeightPx = baseH.toFloat(),
                    windowHeightPx = windowHeight.toFloat(),
                    keyboardHeightPx = frame.heightPx,
                    keyboardVerticalOffsetPx = verticalOffsetPx,
                    enabled = keyboardEnabled,
                )
                val node = valdiViewNode ?: return
                if (overlap > 0.5f) {
                    hasHeightOverride = true
                    val targetHeightDp = maxOf(0f, (baseH - overlap) / density)
                    if (lastAppliedHeightDp.isNaN() || abs(targetHeightDp - lastAppliedHeightDp) >= 0.5f) {
                        lastAppliedHeightDp = targetHeightDp
                        node.setAttribute("height", targetHeightDp.toDouble(), true)
                        node.invalidateLayout()
                    }
                } else {
                    clearHeightOverride(invalidate = true)
                }
            }
            else -> {
                clearTranslation()
                clearHeightOverride(invalidate = true)
                val restingBottom = minOf(location[1] + height.toFloat(), windowHeight.toFloat())
                val overlap = KeyboardMath.avoidingOverlapPx(
                    restingBottomInWindowPx = restingBottom,
                    viewHeightPx = height.toFloat(),
                    windowHeightPx = windowHeight.toFloat(),
                    keyboardHeightPx = frame.heightPx,
                    keyboardVerticalOffsetPx = verticalOffsetPx,
                    enabled = keyboardEnabled,
                )
                val node = valdiViewNode ?: return
                if (overlap > 0.5f) {
                    if (!hasPaddingOverride) {
                        savedBasePaddingDp = (node.getAttribute("paddingBottom") as? Number)?.toFloat() ?: 0f
                        hasPaddingOverride = true
                    }
                    val nextPaddingDp = savedBasePaddingDp + overlap / density
                    if (lastAppliedPaddingDp.isNaN() || abs(nextPaddingDp - lastAppliedPaddingDp) >= 0.5f) {
                        lastAppliedPaddingDp = nextPaddingDp
                        node.setAttribute("paddingBottom", nextPaddingDp.toDouble(), true)
                        node.invalidateLayout()
                    }
                } else {
                    clearPaddingOverride(invalidate = true)
                }
            }
        }
    }

    private fun clearOverrides(invalidate: Boolean) {
        clearTranslation()
        clearPaddingOverride(invalidate = invalidate)
        clearHeightOverride(invalidate = invalidate)
    }

    private fun clearTranslation() {
        if (appliedTranslationY != 0f || translationY != 0f) {
            appliedTranslationY = 0f
            translationY = 0f
        }
    }

    private fun clearPaddingOverride(invalidate: Boolean) {
        if (!hasPaddingOverride) return
        hasPaddingOverride = false
        savedBasePaddingDp = 0f
        lastAppliedPaddingDp = Float.NaN
        val node = valdiViewNode ?: return
        // Remove the NativeOverridenAttributeOwner entry so Valdi reverts to the JS-defined attribute.
        node.setAttribute("paddingBottom", null, true)
        if (invalidate) {
            node.invalidateLayout()
        }
    }

    private fun clearHeightOverride(invalidate: Boolean) {
        if (!hasHeightOverride) return
        hasHeightOverride = false
        lastAppliedHeightDp = Float.NaN
        val node = valdiViewNode ?: return
        // Remove the NativeOverridenAttributeOwner entry so Valdi reverts to the JS-defined height.
        node.setAttribute("height", null, true)
        if (invalidate) {
            node.invalidateLayout()
        }
    }
}

/**
 * Native `<custom-view>` wrapper around `<scroll>` mirroring `KeyboardAwareScrollView`:
 * manages bottom content insets, focused-input auto-reveal, and close-time offset clamping without JS bridge chatter.
 */
@Keep
class KeyboardAwareScrollViewHost(context: Context) : ValdiView(context) {
    var keyboardEnabled: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            applyFrame(lastFrame)
        }
    var bottomOffsetDp: Float = 16f
        set(value) {
            if (field == value) return
            field = value
            if (lastFrame.heightPx > 0f) {
                post { ensureFocusedInputVisible(lastFrame) }
            }
        }
    var extraKeyboardSpaceDp: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            applyFrame(lastFrame)
        }

    private var subscription: KeyboardSubscription? = null
    private var lastFrame = KeyboardFrame()
    private var lastKeyboardHeightPx = 0f
    private var appliedBottomInsetPx = 0
    private var lastWindowWidthPx = 0
    private var lastWindowHeightPx = 0
    private var lastLaidOutWidthPx = 0
    private var lastLaidOutHeightPx = 0
    private var pendingRevealFocusedInput = false
    private var lastAdjustedFocus: View? = null
    private var cachedScrollView: ValdiScrollView? = null
    private val focusedLocation = IntArray(2)
    private val scrollLocation = IntArray(2)

    private val focusChangeListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
        if (newFocus != null && isDescendant(newFocus)) {
            if (lastFrame.heightPx > 0f && newFocus !== lastAdjustedFocus) {
                pendingRevealFocusedInput = true
                post {
                    if (pendingRevealFocusedInput && lastFrame.heightPx > 0f) {
                        ensureFocusedInputVisible(lastFrame)
                    }
                }
            }
        } else if (newFocus == null || !isDescendant(newFocus)) {
            lastAdjustedFocus = null
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnGlobalFocusChangeListener(focusChangeListener)
        subscription?.dispose()
        subscription = AppUIKeyboardObserver.observe(this) { frame ->
            applyFrame(frame)
        }
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnGlobalFocusChangeListener(focusChangeListener)
        subscription?.dispose()
        subscription = null
        cachedScrollView = null
        super.onDetachedFromWindow()
    }

    override fun onLayout(p0: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(p0, l, t, r, b)
        if (!isAttachedToWindow) return
        val winW = rootView?.width ?: 0
        val winH = rootView?.height ?: 0
        val windowChanged = winW != lastWindowWidthPx || winH != lastWindowHeightPx
        val sizeChanged = width != lastLaidOutWidthPx || height != lastLaidOutHeightPx
        lastWindowWidthPx = winW
        lastWindowHeightPx = winH
        lastLaidOutWidthPx = width
        lastLaidOutHeightPx = height
        val sv = resolveScrollView() ?: return
        val prevInset = appliedBottomInsetPx
        val bottomInsetPx = computeBottomInsetPx(sv, lastFrame)
        applyBottomInset(sv, bottomInsetPx)
        val resizedWithFocus = (sizeChanged || windowChanged) && keyboardEnabled && findFocus() != null
        if (lastFrame.heightPx > 0f && (pendingRevealFocusedInput || resizedWithFocus)) {
            if (bottomInsetPx < prevInset) {
                clampScrollOffset(sv, bottomInsetPx)
            }
            ensureFocusedInputVisible(lastFrame)
            if (sizeChanged || windowChanged) {
                post {
                    if (isAttachedToWindow && lastFrame.heightPx > 0f) {
                        ensureFocusedInputVisible(lastFrame)
                    }
                }
            }
        } else if (p0 || windowChanged || sizeChanged || bottomInsetPx < prevInset || lastFrame.heightPx <= 0f) {
            clampScrollOffset(sv, bottomInsetPx)
        }
    }

    fun resetConfig() {
        keyboardEnabled = true
        bottomOffsetDp = 16f
        extraKeyboardSpaceDp = 0f
        lastFrame = KeyboardFrame()
        lastKeyboardHeightPx = 0f
        pendingRevealFocusedInput = false
        lastAdjustedFocus = null
        lastWindowWidthPx = 0
        lastWindowHeightPx = 0
        lastLaidOutWidthPx = 0
        lastLaidOutHeightPx = 0
        val cached = cachedScrollView
        cached?.let { applyBottomInset(it, 0) }
        resolveScrollView()?.takeIf { it !== cached }?.let { applyBottomInset(it, 0) }
        cachedScrollView = null
        appliedBottomInsetPx = 0
    }

    override fun prepareForRecycling() {
        viewTreeObserver.removeOnGlobalFocusChangeListener(focusChangeListener)
        subscription?.dispose()
        subscription = null
        resetConfig()
        super.prepareForRecycling()
    }

    private fun applyFrame(frame: KeyboardFrame) {
        val prevHeight = lastKeyboardHeightPx
        val grew = frame.heightPx > prevHeight
        val shrank = frame.heightPx < prevHeight
        lastFrame = frame
        lastKeyboardHeightPx = frame.heightPx
        if (frame.heightPx <= 0f) {
            pendingRevealFocusedInput = false
            lastAdjustedFocus = null
        }

        if (!isAttachedToWindow) return
        if (!isShown && frame.heightPx > 0f) return
        val sv = resolveScrollView() ?: return
        val bottomInsetPx = computeBottomInsetPx(sv, frame)
        applyBottomInset(sv, bottomInsetPx)

        if (!keyboardEnabled) {
            clampScrollOffset(sv, 0)
            return
        }

        if (grew) {
            pendingRevealFocusedInput = true
            ensureFocusedInputVisible(frame)
            post {
                if (pendingRevealFocusedInput && lastFrame.heightPx > 0f) {
                    ensureFocusedInputVisible(lastFrame)
                }
            }
        } else if (shrank || frame.heightPx <= 0f) {
            clampScrollOffset(sv, bottomInsetPx)
            if (frame.heightPx <= 0f) {
                post {
                    if (lastFrame.heightPx <= 0f) {
                        resolveScrollView()?.let { clampScrollOffset(it, 0) }
                    }
                }
            }
        } else if (frame.heightPx > 0f && pendingRevealFocusedInput) {
            ensureFocusedInputVisible(frame)
        }
    }

    private fun applyBottomInset(sv: ValdiScrollView, bottomInsetPx: Int) {
        val clamped = bottomInsetPx.coerceAtLeast(0)
        if (clamped != appliedBottomInsetPx || ValdiScrollViewInsets.getBottomInset(sv) != clamped) {
            appliedBottomInsetPx = clamped
            sv.setContentInset(0, 0, 0, clamped)
            ValdiScrollViewInsets.setBottomInset(sv, clamped)
        }
    }

    private fun resolveScrollView(): ValdiScrollView? {
        cachedScrollView?.let { sv ->
            if (sv.isAttachedToWindow && isDescendant(sv) && !sv.horizontalScroll) {
                return sv
            }
        }
        return findVerticalScrollView(this).also { cachedScrollView = it }
    }

    private fun computeBottomInsetPx(sv: ValdiScrollView, frame: KeyboardFrame): Int {
        val windowHeight = rootView?.height ?: 0
        if (windowHeight <= 0 || sv.height <= 0) return 0
        sv.getLocationInWindow(scrollLocation)
        val scrollBottom = scrollLocation[1] + sv.height.toFloat()
        val density = resources.displayMetrics.density
        return KeyboardMath.awareScrollBottomInsetPx(
            scrollBottomInWindowPx = scrollBottom,
            windowHeightPx = windowHeight.toFloat(),
            keyboardHeightPx = frame.heightPx,
            progress = frame.progress,
            extraKeyboardSpacePx = extraKeyboardSpaceDp * density,
            enabled = keyboardEnabled,
        )
    }

    private fun ensureFocusedInputVisible(frame: KeyboardFrame) {
        pendingRevealFocusedInput = false
        if (!keyboardEnabled || frame.heightPx <= 0f) return
        val windowHeight = rootView?.height ?: 0
        if (windowHeight <= 0) return
        val focused = findFocus() ?: return
        val sv = resolveScrollView() ?: return
        if (sv.height <= 0 || sv.contentHeight <= 0 || focused.height <= 0) return

        val bottomInsetPx = computeBottomInsetPx(sv, frame)
        applyBottomInset(sv, bottomInsetPx)

        focused.getLocationInWindow(focusedLocation)
        sv.getLocationInWindow(scrollLocation)
        val density = resources.displayMetrics.density
        val target = KeyboardMath.awareScrollTargetOffsetY(
            scrollTopInWindowPx = scrollLocation[1].toFloat(),
            scrollHeightPx = sv.height.toFloat(),
            windowHeightPx = windowHeight.toFloat(),
            keyboardHeightPx = frame.heightPx,
            bottomOffsetPx = bottomOffsetDp * density,
            topMarginPx = 16f * density,
            focusedTopInWindowPx = focusedLocation[1].toFloat(),
            focusedBottomInWindowPx = (focusedLocation[1] + focused.height).toFloat(),
            currentOffsetY = sv.contentOffsetY,
            contentHeightPx = sv.contentHeight,
            bottomInsetPx = bottomInsetPx,
        )
        if (target != sv.contentOffsetY) {
            sv.setContentOffset(sv.contentOffsetX, target, 0f, 0f, false)
        }
        lastAdjustedFocus = focused
    }

    private fun clampScrollOffset(sv: ValdiScrollView, bottomInsetPx: Int) {
        if (sv.height <= 0 || sv.contentHeight <= 0 || sv.horizontalScroll) return
        val maxOffset = (sv.contentHeight - sv.height + bottomInsetPx.coerceAtLeast(0)).coerceAtLeast(0)
        if (sv.contentOffsetY > maxOffset || sv.unclampedContentOffsetY > maxOffset) {
            sv.setContentOffset(sv.contentOffsetX, maxOffset, 0f, 0f, false)
        }
    }

    private fun findVerticalScrollView(view: View): ValdiScrollView? {
        if (view !== this && view is ValdiScrollView && !view.horizontalScroll) {
            return view
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findVerticalScrollView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun isDescendant(view: View): Boolean {
        var current: View? = view
        while (current != null) {
            if (current === this) return true
            current = current.parent as? View
        }
        return false
    }
}

/** Registers all Valdi `<custom-view>` binders for `app_ui`'s keyboard components. */
object KeyboardBinders {
    fun register(runtimeManager: ValdiRuntimeManager) {
        runtimeManager.registerGlobalAttributesBinder(KeyboardStickyViewBinder())
        runtimeManager.registerGlobalAttributesBinder(KeyboardAvoidingViewBinder())
        runtimeManager.registerGlobalAttributesBinder(KeyboardAwareScrollViewBinder())
    }
}

private class KeyboardStickyViewBinder : AttributesBinder<KeyboardStickyView> {
    override val viewClass: Class<KeyboardStickyView> = KeyboardStickyView::class.java

    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<KeyboardStickyView>) {
        attributesBindingContext.bindBooleanAttribute(
            "keyboardEnabled",
            false,
            { view, value, _ -> view.keyboardEnabled = value },
            { view, _ -> view.keyboardEnabled = true },
        )
        attributesBindingContext.bindFloatAttribute(
            "offsetClosed",
            false,
            { view, value, _ -> view.offsetClosedDp = value },
            { view, _ -> view.offsetClosedDp = 0f },
        )
        attributesBindingContext.bindFloatAttribute(
            "offsetOpened",
            false,
            { view, value, _ -> view.offsetOpenedDp = value },
            { view, _ -> view.offsetOpenedDp = 0f },
        )
    }
}

private class KeyboardAvoidingViewBinder : AttributesBinder<KeyboardAvoidingView> {
    override val viewClass: Class<KeyboardAvoidingView> = KeyboardAvoidingView::class.java

    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<KeyboardAvoidingView>) {
        attributesBindingContext.bindBooleanAttribute(
            "keyboardEnabled",
            false,
            { view, value, _ -> view.keyboardEnabled = value },
            { view, _ -> view.keyboardEnabled = true },
        )
        attributesBindingContext.bindStringAttribute(
            "keyboardBehavior",
            false,
            { view, value, _ -> view.keyboardBehavior = value },
            { view, _ -> view.keyboardBehavior = "padding" },
        )
        attributesBindingContext.bindFloatAttribute(
            "keyboardVerticalOffset",
            false,
            { view, value, _ -> view.keyboardVerticalOffsetDp = value },
            { view, _ -> view.keyboardVerticalOffsetDp = 0f },
        )
    }
}

private class KeyboardAwareScrollViewBinder : AttributesBinder<KeyboardAwareScrollViewHost> {
    override val viewClass: Class<KeyboardAwareScrollViewHost> = KeyboardAwareScrollViewHost::class.java

    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<KeyboardAwareScrollViewHost>) {
        attributesBindingContext.bindBooleanAttribute(
            "keyboardEnabled",
            false,
            { view, value, _ -> view.keyboardEnabled = value },
            { view, _ -> view.keyboardEnabled = true },
        )
        attributesBindingContext.bindFloatAttribute(
            "bottomOffset",
            false,
            { view, value, _ -> view.bottomOffsetDp = value },
            { view, _ -> view.bottomOffsetDp = 16f },
        )
        attributesBindingContext.bindFloatAttribute(
            "extraKeyboardSpace",
            false,
            { view, value, _ -> view.extraKeyboardSpaceDp = value },
            { view, _ -> view.extraKeyboardSpaceDp = 0f },
        )
    }
}
