package io.valdiroutes.app

import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import androidx.dynamicanimation.animation.FlingAnimation
import androidx.dynamicanimation.animation.FloatValueHolder
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.extensions.ViewUtils
import com.snap.valdi.utils.InternedString
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.views.ValdiScrollView
import com.snap.valdi.views.touches.ScrollViewDragGestureRecognizer
import com.snap.valdi.views.touches.ValdiGestureRecognizer
import com.snap.valdi.views.touches.ValdiGestureRecognizerState
import io.valdiroutes.app_ui.ui.OwnsVerticalDrags
import kotlin.math.abs
import kotlin.math.roundToInt

private val HIT_TEST_X_KEY = InternedString.create("x")
private val HIT_TEST_Y_KEY = InternedString.create("y")

/**
 * Installs a synchronous native [ValdiFunction] on `view`'s `GestureRecognizers.hitTest` so
 * Valdi's `TouchDispatcher` evaluates `predicate(xPx, yPx)` in `view`-local pixel coordinates.
 */
internal fun installValdiHitTest(view: View, predicate: (xPx: Float, yPx: Float) -> Boolean) {
    ViewUtils.getOrCreateGestureRecognizers(view).hitTest = object : ValdiFunction {
        override fun perform(marshaller: ValdiMarshaller): Boolean {
            val density = view.resources.displayMetrics.density
            val hit = if (density > 0f && marshaller.isMap(0)) {
                val xPx = (marshaller.getMapPropertyDouble(HIT_TEST_X_KEY, 0) * density).toFloat()
                val yPx = (marshaller.getMapPropertyDouble(HIT_TEST_Y_KEY, 0) * density).toFloat()
                predicate(xPx, yPx)
            } else {
                false
            }
            marshaller.pushBoolean(hit)
            return true
        }
    }
}

internal enum class SheetPanMode {
    UNDECIDED,
    SHEET,
    SCROLL,
}

/**
 * Valdi gesture recognizer attached to `BottomSheetHostView.sheetContainer` that implements:
 * - Direct vertical sheet dragging with VelocityTracker release velocity
 * - Bidirectional scroll coordination (`NONE`, `INITIAL`, `HANDOFF`) with vertical [ValdiScrollView]
 *   via `canRecognizeSimultaneously` + contentOffset pinning + scrollbar suppression
 * - Automatic exclusion of horizontal [ValdiScrollView] drags and [OwnsVerticalDrags] picker wheels
 * - Automatic cancellation of child tap recognizers (`shouldCancelOtherGesturesOnStart() == true`)
 *   as soon as a sheet drag begins.
 */
internal class SheetValdiGestureRecognizer(
    view: View,
    private val host: BottomSheetHostView,
) : ValdiGestureRecognizer(view) {

    private val touchSlop: Int = ViewConfiguration.get(view.context).scaledTouchSlop
    private val minFlingVelocity: Float =
        ViewConfiguration.get(view.context).scaledMinimumFlingVelocity.toFloat()
    private var activePointerId = MotionEvent.INVALID_POINTER_ID
    private var downRawX = 0f
    private var downRawY = 0f
    private var lastRawY = 0f
    private var downLocalX = 0f
    private var downLocalY = 0f
    private var slopExceeded = false
    private var rejected = false
    private var velocityTracker: VelocityTracker? = null

    private var coordinatedScrollView: ValdiScrollView? = null
    private var coordinatedScrollRecognizer: ScrollViewDragGestureRecognizer? = null
    private var panMode: SheetPanMode = SheetPanMode.UNDECIDED
    private var exclusiveScrollClaim: Boolean = false
    private var scrollClaimedBySheet: Boolean = false
    private var savedScrollEnabled: Boolean? = null
    private var startedHostDrag = false
    private var pinnedScrollOffsetY: Int = 0
    private var manualScrollOffsetY: Float = 0f
    private var savedVerticalScrollBarEnabled: Boolean? = null
    private var scrollFlingAnimation: FlingAnimation? = null

    override fun shouldCancelOtherGesturesOnStart(): Boolean =
        coordinatedScrollView == null || exclusiveScrollClaim || panMode == SheetPanMode.SHEET

    override fun shouldPreventInterceptTouchEvent(): Boolean = true

    override fun canRecognizeSimultaneously(other: ValdiGestureRecognizer): Boolean {
        if (other is ScrollViewDragGestureRecognizer && !other.isHorizontalScroll) {
            val sv = coordinatedScrollView
            if (sv != null && other.view === sv) {
                coordinatedScrollRecognizer = other
                return true
            }
        }
        return false
    }

    override fun shouldBegin(): Boolean = !rejected && host.canStartSheetGesture()

    override fun onUpdate(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                cancelScrollFling()
                resetTracking()
                if (!host.canStartSheetGesture() || !host.isLocalPointInPresentedCard(event.x, event.y)) {
                    rejected = true
                    updateState(ValdiGestureRecognizerState.FAILED)
                    return
                }
                if (ownsVerticalDragUnderPoint(view, event.x, event.y)) {
                    rejected = true
                    updateState(ValdiGestureRecognizerState.FAILED)
                    return
                }
                downLocalX = event.x
                downLocalY = event.y
                activePointerId = event.getPointerId(0)
                downRawX = screenX(event, 0)
                downRawY = screenY(event, 0)
                lastRawY = downRawY

                coordinatedScrollView = findInnermostVerticalValdiScrollView(view, event.x, event.y)
                pinnedScrollOffsetY = coordinatedScrollView?.contentOffsetY ?: 0
                manualScrollOffsetY = pinnedScrollOffsetY.toFloat()
                panMode = SheetPanMode.UNDECIDED

                velocityTracker = VelocityTracker.obtain().also {
                    addScreenMovement(it, event)
                }
                updateState(ValdiGestureRecognizerState.POSSIBLE)
            }

            MotionEvent.ACTION_MOVE -> {
                if (rejected) return
                val pointerIndex = if (activePointerId != MotionEvent.INVALID_POINTER_ID) {
                    event.findPointerIndex(activePointerId)
                } else {
                    0
                }
                if (pointerIndex < 0 || pointerIndex >= event.pointerCount) return

                val tracker = velocityTracker ?: VelocityTracker.obtain().also { velocityTracker = it }
                addScreenMovement(tracker, event)

                val curX = screenX(event, pointerIndex)
                val curY = screenY(event, pointerIndex)
                val totalDx = curX - downRawX
                val totalDy = curY - downRawY

                if (!slopExceeded) {
                    if (abs(totalDx) > touchSlop && abs(totalDx) > abs(totalDy)) {
                        // Horizontal drag (e.g. horizontal carousel/scroll inside sheet): yield cleanly.
                        rejected = true
                        updateState(ValdiGestureRecognizerState.FAILED)
                        return
                    }
                    if (abs(totalDy) <= touchSlop) {
                        lastRawY = curY
                        return
                    }
                    slopExceeded = true

                    val sv = coordinatedScrollView
                    if (sv != null && canScrollVerticallyInSomeDirection(sv)) {
                        val initialDecision = decideInitialMode(sv, totalDy)
                        if (initialDecision == null) {
                            // Coordination == NONE, or INITIAL chose scroll: fail sheet recognizer so
                            // ValdiScrollView scrolls unimpeded with normal momentum.
                            rejected = true
                            updateState(ValdiGestureRecognizerState.FAILED)
                            return
                        }
                        panMode = initialDecision
                    } else {
                        coordinatedScrollView = null
                        panMode = SheetPanMode.SHEET
                    }

                    lastRawY = curY
                    startedHostDrag = true
                    host.onSheetDragBegan()
                    if (panMode == SheetPanMode.SHEET) {
                        coordinatedScrollView?.let { markScrollClaimedOnStart(it) }
                    }
                    if (exclusiveScrollClaim) {
                        coordinatedScrollView?.let { pinScrollOffset(it) }
                    }
                    updateState(ValdiGestureRecognizerState.BEGAN)
                    return
                }

                if (lastRawY.isNaN()) {
                    lastRawY = curY
                    updateState(ValdiGestureRecognizerState.CHANGED)
                    return
                }
                val dy = curY - lastRawY
                lastRawY = curY
                if (dy == 0f) {
                    updateState(ValdiGestureRecognizerState.CHANGED)
                    return
                }

                handleMoveDelta(dy, event)
                updateState(ValdiGestureRecognizerState.CHANGED)
            }

            MotionEvent.ACTION_UP -> {
                if (slopExceeded && !rejected && isActive) {
                    startedHostDrag = false
                    val tracker = velocityTracker
                    val vy = if (tracker != null) {
                        tracker.computeCurrentVelocity(1000)
                        if (activePointerId != MotionEvent.INVALID_POINTER_ID) {
                            tracker.getYVelocity(activePointerId)
                        } else {
                            tracker.yVelocity
                        }
                    } else {
                        0f
                    }
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                    finishCoordinatedDrag(event, vy)
                    updateState(ValdiGestureRecognizerState.ENDED)
                } else {
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                    restoreScrollBar()
                    restoreScrollEnabled()
                    if (startedHostDrag) {
                        startedHostDrag = false
                        host.onSheetDragCancelled()
                    }
                    if (!rejected) {
                        updateState(ValdiGestureRecognizerState.FAILED)
                    }
                }
                recycleTracker()
            }

            MotionEvent.ACTION_POINTER_UP -> {
                val actionIndex = event.actionIndex
                if (event.getPointerId(actionIndex) == activePointerId && event.pointerCount > 1) {
                    val newPointerIndex = if (actionIndex == 0) 1 else 0
                    activePointerId = event.getPointerId(newPointerIndex)
                    lastRawY = screenY(event, newPointerIndex)
                    velocityTracker?.clear()
                }
            }

            MotionEvent.ACTION_CANCEL -> {
                activePointerId = MotionEvent.INVALID_POINTER_ID
                restoreScrollBar()
                restoreScrollEnabled()
                if (startedHostDrag) {
                    startedHostDrag = false
                    host.onSheetDragCancelled()
                }
                recycleTracker()
                updateState(ValdiGestureRecognizerState.FAILED)
            }
        }
    }

    override fun onProcess() {
        // State transitions and host updates happen synchronously in onUpdate for 1-frame latency.
        // Re-pin after ScrollViewDragGestureRecognizer.onProcess() runs in TouchDispatcher Step 5.
        if (slopExceeded && !rejected && panMode == SheetPanMode.SHEET) {
            coordinatedScrollView?.let { pinScrollOffset(it) }
        }
    }

    override fun onReset(event: MotionEvent) {
        super.onReset(event)
        restoreScrollBar()
        restoreScrollEnabled()
        if (startedHostDrag) {
            startedHostDrag = false
            host.onSheetDragCancelled()
        }
        resetTracking()
    }

    override fun onDestroy() {
        cancelScrollFling()
        restoreScrollBar()
        restoreScrollEnabled()
        recycleTracker()
        super.onDestroy()
    }

    /**
     * Returns `null` when the sheet recognizer should FAIL and hand full ownership to [sv],
     * or the starting [SheetPanMode] when the sheet recognizer should BEGIN.
     */
    private fun decideInitialMode(sv: ValdiScrollView, initialTotalDy: Float): SheetPanMode? {
        val draggingUp = initialTotalDy < 0f
        val level = if (draggingUp) host.scrollExpandCoordination else host.scrollCollapseCoordination
        val atTop = sv.contentOffsetY <= 0
        val sheetCanExpand = host.canSheetExpandFurther()

        return when (level) {
            ScrollCoordinationLevel.NONE -> null
            ScrollCoordinationLevel.INITIAL -> {
                if (draggingUp) {
                    if (atTop && sheetCanExpand) {
                        // Sheet claims this gesture exclusively; cancel scroll view's recognizer if active.
                        exclusiveScrollClaim = true
                        SheetPanMode.SHEET
                    } else {
                        null
                    }
                } else {
                    if (atTop) {
                        exclusiveScrollClaim = true
                        SheetPanMode.SHEET
                    } else {
                        null
                    }
                }
            }
            ScrollCoordinationLevel.HANDOFF -> {
                pinnedScrollOffsetY = sv.contentOffsetY
                manualScrollOffsetY = pinnedScrollOffsetY.toFloat()
                if (draggingUp) {
                    if (atTop && sheetCanExpand) SheetPanMode.SHEET else SheetPanMode.SCROLL
                } else {
                    if (sv.contentOffsetY <= initialTotalDy) {
                        pinnedScrollOffsetY = 0
                        manualScrollOffsetY = 0f
                        SheetPanMode.SHEET
                    } else {
                        SheetPanMode.SCROLL
                    }
                }
            }
        }
    }

    private fun handleMoveDelta(dy: Float, event: MotionEvent) {
        val sv = coordinatedScrollView
        if (sv == null) {
            host.onSheetDragBy(dy)
            return
        }
        if (exclusiveScrollClaim) {
            pinScrollOffset(sv)
            host.onSheetDragBy(dy)
            return
        }

        val draggingUp = dy < 0f
        val level = if (draggingUp) host.scrollExpandCoordination else host.scrollCollapseCoordination

        if (level != ScrollCoordinationLevel.HANDOFF) {
            // Direction switched to one whose coordination is NONE or INITIAL during a gesture that
            // began in HANDOFF: keep current mode without mid-gesture handoff.
            if (panMode == SheetPanMode.SHEET) {
                pinScrollOffset(sv)
                host.onSheetDragBy(dy)
            } else {
                restoreScrollBar()
                if (scrollClaimedBySheet) {
                    manualScrollOffsetY = (manualScrollOffsetY - dy).coerceIn(0f, maxScrollOffsetY(sv).toFloat())
                    pinnedScrollOffsetY = manualScrollOffsetY.roundToInt()
                    sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                } else {
                    pinnedScrollOffsetY = sv.contentOffsetY
                    manualScrollOffsetY = pinnedScrollOffsetY.toFloat()
                }
            }
            return
        }

        // Full bidirectional HANDOFF:
        if (draggingUp) {
            // Upward drag (finger moves up, dy < 0): expand sheet first up to highest detent, then scroll content.
            if (host.canSheetExpandFurther()) {
                if (!scrollClaimedBySheet) {
                    claimScrollOwnershipFromRecognizer(sv, event, sv.contentOffsetY)
                }
                panMode = SheetPanMode.SHEET
                val leftoverDy = host.onSheetDragByClampedToTop(dy)
                pinScrollOffset(sv)
                if (leftoverDy < 0f) {
                    // Reached top detent mid-frame: feed remaining upward delta into scrollView!
                    panMode = SheetPanMode.SCROLL
                    restoreScrollBar()
                    val maxOffset = maxScrollOffsetY(sv).toFloat()
                    manualScrollOffsetY = (manualScrollOffsetY - leftoverDy).coerceIn(0f, maxOffset)
                    pinnedScrollOffsetY = manualScrollOffsetY.roundToInt()
                    sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                }
            } else {
                panMode = SheetPanMode.SCROLL
                restoreScrollBar()
                if (scrollClaimedBySheet) {
                    val maxOffset = maxScrollOffsetY(sv).toFloat()
                    manualScrollOffsetY = (manualScrollOffsetY - dy).coerceIn(0f, maxOffset)
                    pinnedScrollOffsetY = manualScrollOffsetY.roundToInt()
                    sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                } else {
                    pinnedScrollOffsetY = sv.contentOffsetY
                    manualScrollOffsetY = pinnedScrollOffsetY.toFloat()
                }
            }
        } else {
            // Downward drag (finger moves down, dy > 0): scroll content back to 0 first, then collapse sheet.
            if (panMode == SheetPanMode.SCROLL) {
                if (scrollClaimedBySheet) {
                    val (consumed, sheetLeftover) = BottomSheetMath.splitCollapseScrollDelta(manualScrollOffsetY, dy)
                    manualScrollOffsetY = (manualScrollOffsetY - consumed).coerceAtLeast(0f)
                    pinnedScrollOffsetY = manualScrollOffsetY.roundToInt()
                    if (sheetLeftover > 0f || manualScrollOffsetY <= 0f) {
                        panMode = SheetPanMode.SHEET
                        pinnedScrollOffsetY = 0
                        manualScrollOffsetY = 0f
                        pinScrollOffset(sv)
                        if (sheetLeftover > 0f) {
                            host.onSheetDragBy(sheetLeftover)
                        }
                    } else {
                        restoreScrollBar()
                        sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                    }
                } else {
                    val remaining = sv.contentOffsetY.coerceAtLeast(0).toFloat()
                    if (remaining > dy) {
                        restoreScrollBar()
                        pinnedScrollOffsetY = remaining.toInt()
                        manualScrollOffsetY = remaining
                    } else {
                        val (_, sheetLeftover) = BottomSheetMath.splitCollapseScrollDelta(remaining, dy)
                        panMode = SheetPanMode.SHEET
                        claimScrollOwnershipFromRecognizer(sv, event, 0)
                        pinScrollOffset(sv)
                        if (sheetLeftover > 0f) {
                            host.onSheetDragBy(sheetLeftover)
                        }
                    }
                }
            } else {
                if (!scrollClaimedBySheet) {
                    claimScrollOwnershipFromRecognizer(sv, event, 0)
                }
                pinnedScrollOffsetY = 0
                manualScrollOffsetY = 0f
                pinScrollOffset(sv)
                host.onSheetDragBy(dy)
            }
        }
    }

    private fun finishCoordinatedDrag(event: MotionEvent, velocityYPxPerSec: Float) {
        val sv = coordinatedScrollView
        val wasClaimed = scrollClaimedBySheet
        restoreScrollBar()
        restoreScrollEnabled()
        if (sv != null) {
            if (!host.isAtRestingDetent() || panMode == SheetPanMode.SHEET) {
                // Prevent scroll view from flinging while sheet snaps to its target detent.
                coordinatedScrollRecognizer?.cancel(event)
                sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                host.onSheetDragEnded(velocityYPxPerSec)
            } else {
                // Sheet stayed stationary at a resting detent while content scrolled: let scroll view fling naturally.
                host.onSheetDragSettledAtRest()
                if (wasClaimed && abs(velocityYPxPerSec) >= minFlingVelocity) {
                    startManualScrollFling(sv, velocityYPxPerSec)
                }
            }
        } else {
            host.onSheetDragEnded(velocityYPxPerSec)
        }
    }

    private fun markScrollClaimedOnStart(sv: ValdiScrollView) {
        if (!scrollClaimedBySheet) {
            scrollClaimedBySheet = true
            if (savedScrollEnabled == null) {
                savedScrollEnabled = sv.scrollEnabled
            }
            sv.scrollEnabled = false
        }
        pinScrollOffset(sv)
    }

    private fun claimScrollOwnershipFromRecognizer(sv: ValdiScrollView, event: MotionEvent, pinY: Int) {
        if (scrollClaimedBySheet) return
        scrollClaimedBySheet = true
        if (savedScrollEnabled == null) {
            savedScrollEnabled = sv.scrollEnabled
        }
        sv.scrollEnabled = false
        coordinatedScrollRecognizer?.cancel(event)
        coordinatedScrollRecognizer = null
        pinnedScrollOffsetY = pinY
        manualScrollOffsetY = pinY.toFloat()
        sv.setContentOffset(sv.contentOffsetX, pinY, 0f, 0f, false)
    }

    private fun pinScrollOffset(sv: ValdiScrollView) {
        if (savedVerticalScrollBarEnabled == null) {
            savedVerticalScrollBarEnabled = sv.isVerticalScrollBarEnabled
            sv.isVerticalScrollBarEnabled = false
        }
        if (sv.contentOffsetY != pinnedScrollOffsetY || sv.unclampedContentOffsetY != pinnedScrollOffsetY) {
            sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
        }
    }

    private fun restoreScrollBar() {
        val saved = savedVerticalScrollBarEnabled ?: return
        coordinatedScrollView?.isVerticalScrollBarEnabled = saved
        savedVerticalScrollBarEnabled = null
    }

    private fun restoreScrollEnabled() {
        val saved = savedScrollEnabled ?: return
        coordinatedScrollView?.scrollEnabled = saved
        savedScrollEnabled = null
    }

    private fun startManualScrollFling(sv: ValdiScrollView, velocityYPxPerSec: Float) {
        cancelScrollFling()
        val maxOffset = maxScrollOffsetY(sv).toFloat()
        if (maxOffset <= 0f) return
        val startOffset = manualScrollOffsetY.coerceIn(0f, maxOffset)
        val holder = FloatValueHolder(startOffset)
        // Velocity in screen Y is inverted relative to contentOffsetY (dragging up negative -> increases offsetY).
        val fling = FlingAnimation(holder)
            .setStartVelocity(-velocityYPxPerSec)
            .setMinValue(0f)
            .setMaxValue(maxOffset)
            .setFriction(1.1f)
        fling.addUpdateListener { _, value, _ ->
            sv.setContentOffset(sv.contentOffsetX, value.roundToInt(), 0f, 0f, false)
        }
        fling.addEndListener { anim, _, _, _ ->
            if (scrollFlingAnimation === anim) {
                scrollFlingAnimation = null
            }
        }
        scrollFlingAnimation = fling
        fling.start()
    }

    private fun cancelScrollFling() {
        val active = scrollFlingAnimation ?: return
        scrollFlingAnimation = null
        active.cancel()
    }

    private fun resetTracking() {
        restoreScrollBar()
        restoreScrollEnabled()
        activePointerId = MotionEvent.INVALID_POINTER_ID
        slopExceeded = false
        rejected = false
        startedHostDrag = false
        coordinatedScrollView = null
        coordinatedScrollRecognizer = null
        panMode = SheetPanMode.UNDECIDED
        exclusiveScrollClaim = false
        scrollClaimedBySheet = false
        pinnedScrollOffsetY = 0
        manualScrollOffsetY = 0f
        recycleTracker()
    }

    private fun recycleTracker() {
        velocityTracker?.recycle()
        velocityTracker = null
    }

    private fun screenX(event: MotionEvent, pointerIndex: Int): Float =
        event.getX(pointerIndex) + (event.rawX - event.x)

    private fun screenY(event: MotionEvent, pointerIndex: Int): Float =
        event.getY(pointerIndex) + (event.rawY - event.y)

    private fun addScreenMovement(tracker: VelocityTracker, event: MotionEvent) {
        val copy = MotionEvent.obtain(event)
        copy.offsetLocation(event.rawX - event.x, event.rawY - event.y)
        tracker.addMovement(copy)
        copy.recycle()
    }

    private fun maxScrollOffsetY(sv: ValdiScrollView): Int =
        (sv.contentHeight - sv.height + ValdiScrollViewInsets.getBottomInset(sv)).coerceAtLeast(0)

    private fun canScrollVerticallyInSomeDirection(sv: ValdiScrollView): Boolean =
        sv.scrollEnabled && !sv.horizontalScroll && (maxScrollOffsetY(sv) > 0 || sv.contentOffsetY > 0)
}

/**
 * Valdi gesture recognizer attached to [BottomSheetHostView] that detects taps on the modal scrim
 * outside the presented card and triggers `onScrimTap()`.
 */
internal class ScrimValdiGestureRecognizer(
    view: View,
    private val host: BottomSheetHostView,
) : ValdiGestureRecognizer(view) {

    private val touchSlop: Int = ViewConfiguration.get(view.context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var trackingScrimTap = false

    override fun shouldBegin(): Boolean = trackingScrimTap

    override fun onUpdate(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (host.isScrimInteractiveAt(event.x, event.y)) {
                    downX = event.x
                    downY = event.y
                    trackingScrimTap = true
                    updateState(ValdiGestureRecognizerState.POSSIBLE)
                } else {
                    trackingScrimTap = false
                    updateState(ValdiGestureRecognizerState.FAILED)
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (!trackingScrimTap) return
                if (
                    abs(event.x - downX) > touchSlop ||
                    abs(event.y - downY) > touchSlop ||
                    !host.isScrimInteractiveAt(event.x, event.y)
                ) {
                    trackingScrimTap = false
                    updateState(ValdiGestureRecognizerState.FAILED)
                }
            }
            MotionEvent.ACTION_UP -> {
                if (trackingScrimTap && host.isScrimInteractiveAt(event.x, event.y)) {
                    trackingScrimTap = false
                    updateState(ValdiGestureRecognizerState.ENDED)
                    host.onScrimTapped()
                } else {
                    trackingScrimTap = false
                    updateState(ValdiGestureRecognizerState.FAILED)
                }
            }
            MotionEvent.ACTION_CANCEL -> {
                trackingScrimTap = false
                updateState(ValdiGestureRecognizerState.FAILED)
            }
        }
    }

    override fun onProcess() {}

    override fun onReset(event: MotionEvent) {
        super.onReset(event)
        trackingScrimTap = false
    }
}

private fun ownsVerticalDragUnderPoint(root: View, x: Float, y: Float): Boolean {
    if (root is OwnsVerticalDrags) return true
    if (root !is ViewGroup || root.visibility != View.VISIBLE) return false
    for (i in root.childCount - 1 downTo 0) {
        val child = root.getChildAt(i)
        if (child.visibility != View.VISIBLE) continue
        val childX = x + root.scrollX - child.left - child.translationX
        val childY = y + root.scrollY - child.top - child.translationY
        if (childX >= 0f && childX <= child.width && childY >= 0f && childY <= child.height) {
            if (ownsVerticalDragUnderPoint(child, childX, childY)) return true
        }
    }
    return false
}

private fun findInnermostVerticalValdiScrollView(root: View, x: Float, y: Float): ValdiScrollView? {
    if (root !is ViewGroup || root.visibility != View.VISIBLE) return null
    for (i in root.childCount - 1 downTo 0) {
        val child = root.getChildAt(i)
        if (child.visibility != View.VISIBLE) continue
        val childX = x + root.scrollX - child.left - child.translationX
        val childY = y + root.scrollY - child.top - child.translationY
        if (childX >= 0f && childX <= child.width && childY >= 0f && childY <= child.height) {
            findInnermostVerticalValdiScrollView(child, childX, childY)?.let { return it }
            if (child is ValdiScrollView && child.scrollEnabled && !child.horizontalScroll) {
                return child
            }
        }
    }
    return null
}
