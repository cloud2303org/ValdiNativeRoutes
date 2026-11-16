package io.valdiroutes.app

import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
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
    private var pinnedScrollOffsetY: Int = 0
    private var savedVerticalScrollBarEnabled: Boolean? = null

    override fun shouldCancelOtherGesturesOnStart(): Boolean = true

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
                resetTracking()
                if (!host.canStartSheetGesture() || !host.isPointInPresentedCard(event.x, event.y)) {
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
                downRawX = event.rawX
                downRawY = event.rawY
                lastRawY = event.rawY

                coordinatedScrollView = findInnermostVerticalValdiScrollView(view, event.x, event.y)
                pinnedScrollOffsetY = coordinatedScrollView?.contentOffsetY ?: 0
                panMode = SheetPanMode.UNDECIDED

                velocityTracker = VelocityTracker.obtain().also {
                    addRawMovement(it, event)
                }
                updateState(ValdiGestureRecognizerState.POSSIBLE)
            }

            MotionEvent.ACTION_MOVE -> {
                if (rejected) return
                if (event.pointerCount > 1 && !slopExceeded) {
                    rejected = true
                    updateState(ValdiGestureRecognizerState.FAILED)
                    return
                }
                val tracker = velocityTracker ?: VelocityTracker.obtain().also { velocityTracker = it }
                addRawMovement(tracker, event)

                val totalDx = event.rawX - downRawX
                val totalDy = event.rawY - downRawY

                if (!slopExceeded) {
                    if (abs(totalDx) > touchSlop && abs(totalDx) > abs(totalDy)) {
                        // Horizontal drag (e.g. horizontal carousel/scroll inside sheet): yield cleanly.
                        rejected = true
                        updateState(ValdiGestureRecognizerState.FAILED)
                        return
                    }
                    if (abs(totalDy) <= touchSlop) {
                        lastRawY = event.rawY
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

                    lastRawY = event.rawY
                    host.onSheetDragBegan()
                    updateState(ValdiGestureRecognizerState.BEGAN)
                    return
                }

                val dy = event.rawY - lastRawY
                lastRawY = event.rawY
                if (dy == 0f) {
                    updateState(ValdiGestureRecognizerState.CHANGED)
                    return
                }

                handleMoveDelta(dy)
                updateState(ValdiGestureRecognizerState.CHANGED)
            }

            MotionEvent.ACTION_UP -> {
                if (slopExceeded && !rejected && isActive) {
                    val tracker = velocityTracker
                    tracker?.let {
                        addRawMovement(it, event)
                        it.computeCurrentVelocity(1000)
                    }
                    val vy = tracker?.yVelocity ?: 0f
                    finishCoordinatedDrag(event, vy)
                    updateState(ValdiGestureRecognizerState.ENDED)
                } else if (!rejected) {
                    updateState(ValdiGestureRecognizerState.FAILED)
                }
                recycleTracker()
            }

            MotionEvent.ACTION_CANCEL -> {
                if (slopExceeded && !rejected && isActive) {
                    restoreScrollBar()
                    host.onSheetDragCancelled()
                }
                recycleTracker()
                updateState(ValdiGestureRecognizerState.FAILED)
            }
        }
    }

    override fun onProcess() {
        // State transitions and host updates happen synchronously in onUpdate for 1-frame latency.
    }

    override fun onReset(event: MotionEvent) {
        super.onReset(event)
        restoreScrollBar()
        resetTracking()
    }

    override fun onDestroy() {
        restoreScrollBar()
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
                        coordinatedScrollView = null
                        SheetPanMode.SHEET
                    } else {
                        null
                    }
                } else {
                    if (atTop) {
                        coordinatedScrollView = null
                        SheetPanMode.SHEET
                    } else {
                        null
                    }
                }
            }
            ScrollCoordinationLevel.HANDOFF -> {
                pinnedScrollOffsetY = sv.contentOffsetY
                if (draggingUp) {
                    if (atTop && sheetCanExpand) SheetPanMode.SHEET else SheetPanMode.SCROLL
                } else {
                    if (atTop) SheetPanMode.SHEET else SheetPanMode.SCROLL
                }
            }
        }
    }

    private fun handleMoveDelta(dy: Float) {
        val sv = coordinatedScrollView
        if (sv == null) {
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
                pinnedScrollOffsetY = sv.contentOffsetY
            }
            return
        }

        // Full bidirectional HANDOFF:
        if (draggingUp) {
            // Upward drag (finger moves up, dy < 0): expand sheet first up to highest detent, then scroll content.
            if (host.canSheetExpandFurther()) {
                panMode = SheetPanMode.SHEET
                val leftoverDy = host.onSheetDragByClampedToTop(dy)
                pinScrollOffset(sv)
                if (leftoverDy < 0f) {
                    // Reached top detent mid-frame: feed remaining upward delta into scrollView!
                    panMode = SheetPanMode.SCROLL
                    restoreScrollBar()
                    val maxOffset = maxScrollOffsetY(sv)
                    val nextOffset = (pinnedScrollOffsetY + (-leftoverDy).toInt()).coerceIn(0, maxOffset)
                    pinnedScrollOffsetY = nextOffset
                    sv.setContentOffset(sv.contentOffsetX, nextOffset, 0f, 0f, false)
                }
            } else {
                panMode = SheetPanMode.SCROLL
                restoreScrollBar()
                pinnedScrollOffsetY = sv.contentOffsetY
            }
        } else {
            // Downward drag (finger moves down, dy > 0): scroll content back to 0 first, then collapse sheet.
            val currentOffsetY = sv.contentOffsetY
            if (panMode == SheetPanMode.SCROLL && currentOffsetY > 0) {
                restoreScrollBar()
                pinnedScrollOffsetY = currentOffsetY
            } else {
                // Scroll view reached top (or we were already moving the sheet): lock scroll at 0 and move sheet!
                panMode = SheetPanMode.SHEET
                pinnedScrollOffsetY = 0
                pinScrollOffset(sv)
                host.onSheetDragBy(dy)
            }
        }
    }

    private fun finishCoordinatedDrag(event: MotionEvent, velocityYPxPerSec: Float) {
        val sv = coordinatedScrollView
        restoreScrollBar()
        if (sv != null) {
            if (!host.isAtRestingDetent() || panMode == SheetPanMode.SHEET) {
                // Prevent scroll view from flinging while sheet snaps to its target detent.
                coordinatedScrollRecognizer?.cancel(event)
                sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
                host.onSheetDragEnded(velocityYPxPerSec)
            } else {
                // Sheet stayed stationary at a resting detent while content scrolled: let scroll view fling naturally.
                host.onSheetDragSettledAtRest()
            }
        } else {
            host.onSheetDragEnded(velocityYPxPerSec)
        }
    }

    private fun pinScrollOffset(sv: ValdiScrollView) {
        if (savedVerticalScrollBarEnabled == null) {
            savedVerticalScrollBarEnabled = sv.isVerticalScrollBarEnabled
            sv.isVerticalScrollBarEnabled = false
        }
        if (sv.contentOffsetY != pinnedScrollOffsetY) {
            sv.setContentOffset(sv.contentOffsetX, pinnedScrollOffsetY, 0f, 0f, false)
        }
    }

    private fun restoreScrollBar() {
        val saved = savedVerticalScrollBarEnabled ?: return
        coordinatedScrollView?.isVerticalScrollBarEnabled = saved
        savedVerticalScrollBarEnabled = null
    }

    private fun resetTracking() {
        slopExceeded = false
        rejected = false
        coordinatedScrollView = null
        coordinatedScrollRecognizer = null
        panMode = SheetPanMode.UNDECIDED
        pinnedScrollOffsetY = 0
        recycleTracker()
    }

    private fun recycleTracker() {
        velocityTracker?.recycle()
        velocityTracker = null
    }

    private fun addRawMovement(tracker: VelocityTracker, event: MotionEvent) {
        val rawEvent = MotionEvent.obtain(
            event.downTime,
            event.eventTime,
            event.actionMasked,
            event.rawX,
            event.rawY,
            event.metaState,
        )
        tracker.addMovement(rawEvent)
        rawEvent.recycle()
    }

    private fun maxScrollOffsetY(sv: ValdiScrollView): Int =
        (sv.contentHeight - sv.height).coerceAtLeast(0)

    private fun canScrollVerticallyInSomeDirection(sv: ValdiScrollView): Boolean =
        sv.scrollEnabled && !sv.horizontalScroll && (sv.contentHeight > sv.height || sv.contentOffsetY > 0)
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
