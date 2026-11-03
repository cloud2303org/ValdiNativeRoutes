// Ported from Software Mansion's react-native-bottom-sheet 0.16.2 (android/BottomSheetHostView.kt), MIT License,
// Copyright 2026 by Software Mansion. The React Native bindings (Fabric state, content-height detents, JS touch
// dispatch) are removed; the detent, spring, scrim and scroll-negotiation logic is kept. Like the original, the sheet
// knows nothing about the keyboard: whoever hosts it pads the content and sizes the detent.

package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowInsets
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.dynamicanimation.animation.DynamicAnimation
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.abs

/** A view that owns every vertical drag starting on it, such as a picker wheel: the sheet never takes those over. */
interface OwnsVerticalDrags

/** Compose scroll nodes are not native child Views; their bridge can hit-test them in local coordinates. */
interface VerticalDragOwnerAtPoint {
    fun ownsVerticalDragAt(x: Float, y: Float): Boolean
}

/**
 * A modal bottom sheet in the current window: a scrim plus a panel that snaps between detents. Dragging follows the
 * finger and hands over to the content's scroll: a downward drag moves the sheet only once the scroll under the
 * finger is at its top.
 */
class SheetHostView(context: Context) : ViewGroup(context) {

    /** Called once the sheet has settled closed. [byUser] is false for [dismiss]. */
    var onClosed: ((byUser: Boolean) -> Unit)? = null

    /** Controlled overlays request dismissal first and call [dismiss] once their owner accepts it. */
    var onDismissRequest: (() -> Unit)? = null
    var dismissible = true
        set(value) {
            if (field == value) return
            field = value
            if (!value) {
                // Stop a sheet gesture, but leave an ordinary child scroll's
                // pointer stream intact when only dismissal is disabled.
                interruptTouch(cancelChild = isPanning || nestedPanning || scrimTouchActive)
            }
        }
    var interactionEnabled = true
        set(value) {
            if (field == value) return
            field = value
            if (!value) interruptTouch(cancelChild = true)
        }

    /** Opt-in content sizing. Existing navigation sheets retain their explicit [openHeight]. */
    var measureContent = false
        set(value) { if (field != value) { field = value; requestLayout() } }
    var bottomInset = 0
        set(value) { if (field != value) { field = value; requestLayout() } }
    var showHandle = true
        set(value) {
            if (field == value) return
            field = value
            handle.visibility = if (value) VISIBLE else GONE
            (contentFrame.layoutParams as FrameLayout.LayoutParams).topMargin = if (value) HANDLE_HEIGHT_DP.dp else 0
            requestLayout()
        }

    /** Height of the open detent in px, before clamping to the space below the status bar. Changes apply immediately. */
    var openHeight = 0f
        set(value) {
            if (field == value) return
            field = value
            requestLayout()
        }

    private val density = context.resources.displayMetrics.density
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    var scrimColor = Color.argb(0x66, 0, 0, 0)
        set(value) { field = value; invalidate() }
    private val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    var cornerRadius = 20 * density
        set(value) { if (field != value) { field = value; updateSurface() } }
    var surfaceColor = Color.WHITE
        set(value) { if (field != value) { field = value; updateSurface() } }

    private val sheetContainer = FrameLayout(context).apply {
        background = GradientDrawable().apply {
            setColor(Color.WHITE)
            cornerRadii = floatArrayOf(cornerRadius, cornerRadius, cornerRadius, cornerRadius, 0f, 0f, 0f, 0f)
        }
        // Clip the content to the rounded top; the outline extends below the bottom edge so only the top is rounded.
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height + cornerRadius.toInt(), cornerRadius)
            }
        }
        clipToOutline = true
    }
    private val contentFrame = FrameLayout(context)
    private val handle = View(context).apply {
        background = GradientDrawable().apply {
            setColor(Color.rgb(0xD1, 0xD5, 0xDB))
            cornerRadius = 2 * density
        }
    }

    private fun updateSurface() {
        sheetContainer.background = GradientDrawable().apply {
            setColor(surfaceColor)
            val radius = this@SheetHostView.cornerRadius
            cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
        }
        sheetContainer.invalidateOutline()
    }

    // Detent heights in px, ascending; index 0 is closed.
    private var detents = listOf(0f, 0f)
    private var targetIndex = 0
    private var hasLaidOut = false
    private var closeRequested = false
    private var closedNotified = false

    private var activeAnimation: SpringAnimation? = null
    private var velocityTracker: VelocityTracker? = null
    private var isPanning = false
    private var nestedPanning = false
    private var cancellingTouch = false
    private var discardTouchUntilDown = false
    private var lastTouchEvent: MotionEvent? = null
    private var activeDragRange: ClosedFloatingPointRange<Float>? = null
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var lastTouchY = 0f
    private var activePointerId = MotionEvent.INVALID_POINTER_ID
    private var scrimPressed = false
    private var scrimTouchActive = false
    /** The touch started on an [OwnsVerticalDrags] view. */
    private var touchOwnedByContent = false
    private var scrimProgress = 0f
    private var capPx = Float.NaN
    private var laidOutHeight = 0f

    init {
        setWillNotDraw(false)
        sheetContainer.addView(handle, FrameLayout.LayoutParams((36 * density).toInt(), (4 * density).toInt(), Gravity.CENTER_HORIZONTAL).apply {
            topMargin = (10 * density).toInt()
        })
        sheetContainer.addView(contentFrame, FrameLayout.LayoutParams(-1, -1).apply { topMargin = HANDLE_HEIGHT_DP.dp })
        addView(sheetContainer)
    }

    fun setContent(view: View) {
        (view.parent as? ViewGroup)?.removeView(view)
        contentFrame.removeAllViews()
        contentFrame.addView(view, FrameLayout.LayoutParams(-1, -1))
    }

    fun removeContent() = contentFrame.removeAllViews()

    /** Animates the sheet closed; [onClosed] fires with byUser = false once it settles. */
    fun dismiss() {
        if (closeRequested || closedNotified) return
        closeRequested = true
        interruptTouch(cancelChild = true)
        snapToIndex(CLOSED, 0f)
    }

    // MARK: - Geometry

    override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
        // The cap depends on the top inset, which can change without a resize.
        requestLayout()
        return super.onApplyWindowInsets(insets)
    }

    /** Space below the status bar. */
    private fun availableHeight(viewHeight: Int = height): Float {
        val topInset = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout())?.top ?: 0
        val location = IntArray(2)
        getLocationInWindow(location)
        val topOverlap = (topInset - location[1]).coerceAtLeast(0)
        return (viewHeight - topOverlap).toFloat().coerceAtLeast(0f)
    }

    private val maxHeight: Float get() = detents.last()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(w, h)
        capPx = (availableHeight(h) - bottomInset.coerceAtLeast(0)).coerceAtLeast(0f)
        detents = listOf(0f, openHeight.coerceIn(0f, capPx))
        if (measureContent) {
            sheetContainer.measure(
                MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(maxHeight.toInt(), MeasureSpec.AT_MOST),
            )
            detents = listOf(0f, sheetContainer.measuredHeight.toFloat())
        }
        sheetContainer.measure(
            MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(maxHeight.toInt(), MeasureSpec.EXACTLY),
        )
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val w = right - left
        val h = bottom - top
        if (w <= 0 || h <= 0 || maxHeight <= 0f) return
        val panelBottom = h - bottomInset.coerceIn(0, h)
        sheetContainer.layout(0, panelBottom - maxHeight.toInt(), w, panelBottom)

        if (!hasLaidOut) {
            // Animate in from closed to the open detent.
            hasLaidOut = true
            laidOutHeight = maxHeight
            sheetContainer.translationY = translationY(CLOSED)
            emitPosition()
            snapToIndex(if (closeRequested) CLOSED else OPEN, 0f)
            return
        }
        if (laidOutHeight != maxHeight) {
            val delta = maxHeight - laidOutHeight
            laidOutHeight = maxHeight
            if (activeAnimation != null || isPanning) {
                sheetContainer.translationY = (sheetContainer.translationY + delta).coerceIn(0f, maxHeight)
                if (isPanning) activeDragRange = draggableRange()
                else snapToIndex(targetIndex, 0f)
                emitPosition()
            }
        }
        if (activeAnimation != null || isPanning) return
        sheetContainer.translationY = translationY(targetIndex)
        emitPosition()
    }

    override fun dispatchDraw(canvas: Canvas) {
        if (scrimProgress > 0.001f) {
            val alpha = (Color.alpha(scrimColor) * scrimProgress).toInt().coerceIn(0, 255)
            scrimPaint.color = Color.argb(alpha, Color.red(scrimColor), Color.green(scrimColor), Color.blue(scrimColor))
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), scrimPaint)
        }
        super.dispatchDraw(canvas)
    }

    // MARK: - Snap logic

    private fun translationY(index: Int): Float {
        val snapHeight = detents.getOrNull(index) ?: 0f
        return maxHeight - snapHeight
    }

    private fun draggableRange(): ClosedFloatingPointRange<Float> {
        val translations = detents.indices.map(::translationY)
        return translations.min()..translations.max()
    }

    private fun isAtMaxDragCandidate(): Boolean = sheetContainer.translationY <= draggableRange().start + 1f

    private fun currentSheetHeight(): Float = maxHeight - sheetContainer.translationY

    private fun emitPosition() {
        val open = maxHeight
        scrimProgress = if (open <= 0f) 0f else (currentSheetHeight() / open).coerceIn(0f, 1f)
        invalidate()
    }

    private fun snapToIndex(index: Int, velocity: Float) {
        targetIndex = index
        val targetTy = translationY(index)
        activeAnimation?.cancel()
        val currentTy = sheetContainer.translationY
        val range = draggableRange()
        val distance = targetTy - currentTy
        val velocityRatio = if (distance != 0f) velocity / distance else 0f
        val initialVelocity = velocityRatio.coerceIn(-5f, 5f) * distance

        val spring = SpringAnimation(sheetContainer, DynamicAnimation.TRANSLATION_Y, targetTy).apply {
            spring = SpringForce(targetTy).apply {
                dampingRatio = SpringForce.DAMPING_RATIO_NO_BOUNCY
                stiffness = SpringForce.STIFFNESS_MEDIUM
            }
            setMinValue(minOf(range.start, currentTy, targetTy))
            setMaxValue(maxOf(range.endInclusive, currentTy, targetTy))
            setStartVelocity(initialVelocity)
            addUpdateListener { _, _, _ -> emitPosition() }
            addEndListener { _, canceled, _, _ ->
                if (canceled) return@addEndListener
                activeAnimation = null
                emitPosition()
                if (index == CLOSED && !closedNotified) {
                    closedNotified = true
                    onClosed?.invoke(!closeRequested)
                }
            }
        }
        activeAnimation = spring
        spring.start()
    }

    private fun bestSnapIndex(currentHeight: Float, velocity: Float): Int {
        val flickThreshold = 600f * density
        val candidates = detents.indices.toList()
        if (velocity < -flickThreshold) return candidates.firstOrNull { detents[it] > currentHeight } ?: candidates.last()
        if (velocity > flickThreshold) return candidates.lastOrNull { detents[it] < currentHeight } ?: candidates.first()
        return candidates.minBy { abs(detents[it] - currentHeight) }
    }

    // MARK: - Touch handling

    /** Compose retains the pointer stream; only its nested-scroll deltas move this same native panel. */
    internal val nestedScrollDisplaced: Boolean get() = sheetContainer.translationY > 0f

    internal fun dragFromNestedScroll(delta: Float): Float {
        if (!interactionEnabled || !dismissible || closeRequested || closedNotified || !hasLaidOut) return 0f
        val before = sheetContainer.translationY
        val after = (before + delta).coerceIn(0f, maxHeight)
        if (after == before) return 0f
        activeAnimation?.cancel()
        activeAnimation = null
        nestedPanning = true
        isPanning = true
        activeDragRange = draggableRange()
        sheetContainer.translationY = after
        emitPosition()
        return after - before
    }

    /** Also accepts leftover downward fling velocity when a child reaches its top during a fling. */
    internal fun finishNestedScroll(velocity: Float, cancelled: Boolean = false): Boolean {
        val wasPanning = nestedPanning
        if (!wasPanning && (cancelled || velocity <= 0f)) return false
        nestedPanning = false
        if (wasPanning) {
            isPanning = false
            activeDragRange = null
        }
        if (cancellingTouch || closeRequested || closedNotified || !hasLaidOut || !isAttachedToWindow) return false
        if (cancelled || !interactionEnabled || !dismissible) {
            if (wasPanning) snapToIndex(OPEN, 0f)
            return false
        }
        // Once fully expanded, an upward fling belongs to the child, including
        // a gesture that first pulled down the sheet and then reversed direction.
        val consume = nestedScrollDisplaced || velocity > 0f
        settleUser(bestSnapIndex(currentSheetHeight(), if (consume) velocity else 0f), if (consume) velocity else 0f)
        return consume
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        // Covered and closing sheets must not deliver touches to their Compose/native children.
        if (!interactionEnabled || closeRequested || closedNotified) return true
        if (event.actionMasked == MotionEvent.ACTION_DOWN) discardTouchUntilDown = false
        else if (discardTouchUntilDown) return true
        lastTouchEvent?.recycle()
        lastTouchEvent = MotionEvent.obtain(event)
        return try {
            super.dispatchTouchEvent(event)
        } finally {
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                lastTouchEvent?.recycle()
                lastTouchEvent = null
            }
        }
    }

    /**
     * Complete cancellation before the dispatch gate starts swallowing the rest
     * of the gesture. Use ViewGroup dispatch so its real child touch target gets
     * CANCEL (including Compose), bypassing only our interaction gate.
     */
    private fun interruptTouch(cancelChild: Boolean) {
        if (cancellingTouch) return
        if (cancelChild) {
            discardTouchUntilDown = true
            val cancel = lastTouchEvent
            lastTouchEvent = null
            cancellingTouch = true
            try {
                cancel?.let {
                    it.action = MotionEvent.ACTION_CANCEL
                    super.dispatchTouchEvent(it)
                }
            } finally {
                cancel?.recycle()
                cancellingTouch = false
            }
        }
        isPanning = false
        nestedPanning = false
        activeDragRange = null
        activePointerId = MotionEvent.INVALID_POINTER_ID
        initialTouchX = 0f
        initialTouchY = 0f
        lastTouchY = 0f
        scrimPressed = false
        scrimTouchActive = false
        touchOwnedByContent = false
        velocityTracker?.recycle()
        velocityTracker = null
        if (cancelChild) super.requestDisallowInterceptTouchEvent(false)
        // An explicit dismiss owns its CLOSED target; coverage/non-dismissible
        // transitions instead restore the panel, including after uncover.
        if (!closeRequested && !closedNotified && hasLaidOut && nestedScrollDisplaced) {
            if (isAttachedToWindow) snapToIndex(OPEN, 0f)
            else {
                activeAnimation?.cancel()
                activeAnimation = null
                targetIndex = OPEN
                sheetContainer.translationY = translationY(OPEN)
                emitPosition()
            }
        }
    }

    private fun settleUser(index: Int, velocity: Float) {
        if (index == CLOSED) {
            if (!dismissible || !interactionEnabled) {
                snapToIndex(OPEN, 0f)
                return
            }
            onDismissRequest?.let { request ->
                request()
                if (!closeRequested) snapToIndex(OPEN, 0f)
                return
            }
        }
        snapToIndex(index, velocity)
    }

    override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        // A scroll requests exclusive ownership once it starts scrolling. Keep observing at this sheet so the same
        // pointer can transfer at the scroll's edge; ancestors still respect the child's request.
        if (disallowIntercept && !isPanning && !touchOwnedByContent && activePointerId != MotionEvent.INVALID_POINTER_ID &&
            isAtMaxDragCandidate() && findScrollableAtTouch() != null
        ) {
            parent?.requestDisallowInterceptTouchEvent(true)
            return
        }
        super.requestDisallowInterceptTouchEvent(disallowIntercept)
    }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (cancellingTouch) return false
        if (closeRequested || closedNotified) return true
        val sheetTop = sheetContainer.top + sheetContainer.translationY
        if (event.actionMasked == MotionEvent.ACTION_DOWN && event.y < sheetTop) {
            initialTouchX = event.x
            initialTouchY = event.y
            lastTouchY = event.y
            activePointerId = event.getPointerId(0)
            scrimPressed = true
            scrimTouchActive = true
            return true
        }

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                initialTouchX = event.x
                initialTouchY = event.y
                lastTouchY = event.y
                activePointerId = event.getPointerId(0)
                touchOwnedByContent = startsOnDragOwner()
            }
            MotionEvent.ACTION_MOVE -> {
                if (!dismissible || activePointerId == MotionEvent.INVALID_POINTER_ID || touchOwnedByContent) return false
                val pointerIndex = event.findPointerIndex(activePointerId)
                if (pointerIndex < 0) return false
                val y = event.getY(pointerIndex)
                val dx = event.getX(pointerIndex) - initialTouchX
                val dy = y - initialTouchY
                if (abs(dy) > touchSlop && abs(dy) > abs(dx)) {
                    // Below the open detent the sheet owns every vertical drag; at it, only a downward drag with the
                    // content scrolled to its top.
                    if (!isAtMaxDragCandidate() || (dy > 0 && isScrollViewAtTop())) {
                        lastTouchY = y
                        super.requestDisallowInterceptTouchEvent(true)
                        return true
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activePointerId = MotionEvent.INVALID_POINTER_ID
                scrimPressed = false
                scrimTouchActive = false
                touchOwnedByContent = false
            }
        }
        return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (cancellingTouch) return true
        if (closeRequested || closedNotified) return true
        if (scrimTouchActive) {
            when (event.actionMasked) {
                MotionEvent.ACTION_MOVE -> {
                    val sheetTop = sheetContainer.top + sheetContainer.translationY
                    if (event.y >= sheetTop || abs(event.y - initialTouchY) > touchSlop) scrimPressed = false
                }
                MotionEvent.ACTION_UP -> {
                    val shouldDismiss = scrimPressed
                    scrimPressed = false
                    scrimTouchActive = false
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                    if (shouldDismiss) settleUser(CLOSED, 0f)
                }
                MotionEvent.ACTION_CANCEL -> {
                    scrimPressed = false
                    scrimTouchActive = false
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                }
            }
            return true
        }

        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                if (!dismissible || touchOwnedByContent) return true
                if (!isPanning) beginPan(event)
                val pointerIndex = event.findPointerIndex(activePointerId)
                if (pointerIndex < 0) return true
                val y = event.getY(pointerIndex)
                velocityTracker?.addMovement(event)
                val dy = y - lastTouchY
                lastTouchY = y
                val range = activeDragRange ?: draggableRange()
                sheetContainer.translationY = (sheetContainer.translationY + dy).coerceIn(range.start, range.endInclusive)
                emitPosition()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                isPanning = false
                activePointerId = MotionEvent.INVALID_POINTER_ID
                val velocity = velocityTracker?.let { tracker ->
                    tracker.computeCurrentVelocity(1000)
                    tracker.yVelocity.also { tracker.recycle() }
                } ?: 0f
                velocityTracker = null
                activeDragRange = null
                settleUser(if (event.actionMasked == MotionEvent.ACTION_CANCEL) OPEN
                    else bestSnapIndex(currentSheetHeight(), velocity), velocity)
                return true
            }
            MotionEvent.ACTION_POINTER_UP -> {
                val actionIndex = event.actionIndex
                if (event.getPointerId(actionIndex) == activePointerId) {
                    val newPointerIndex = if (actionIndex == 0) 1 else 0
                    activePointerId = event.getPointerId(newPointerIndex)
                    lastTouchY = event.getY(newPointerIndex)
                    velocityTracker?.clear()
                }
                return true
            }
        }
        return true
    }

    private fun beginPan(event: MotionEvent) {
        isPanning = true
        activeDragRange = draggableRange()
        if (activePointerId == MotionEvent.INVALID_POINTER_ID) activePointerId = event.getPointerId(0)
        lastTouchY = event.getY(event.findPointerIndex(activePointerId).coerceAtLeast(0))
        velocityTracker?.recycle()
        velocityTracker = VelocityTracker.obtain().apply { addMovement(event) }
        activeAnimation?.cancel()
        activeAnimation = null
    }

    // MARK: - Scroll view helpers
    //
    // The sheet keeps checking a child scroll's edge even after that child disallows interception, and takes over
    // only for a downward drag at the top, so the content and the sheet share one continuous pointer sequence.

    private fun isScrollViewAtTop(): Boolean {
        val scrollView = findScrollableAtTouch() ?: return true
        return !scrollView.canScrollVertically(-1)
    }

    private fun findScrollableAtTouch(): View? {
        val x = initialTouchX - sheetContainer.left - sheetContainer.translationX
        val y = initialTouchY - sheetContainer.top - sheetContainer.translationY
        if (x < 0f || x >= sheetContainer.width || y < 0f || y >= sheetContainer.height) return null
        return findScrollableAtPoint(sheetContainer, x, y)
    }

    private fun startsOnDragOwner(): Boolean {
        val x = initialTouchX - sheetContainer.left - sheetContainer.translationX
        val y = initialTouchY - sheetContainer.top - sheetContainer.translationY
        if (x < 0f || x >= sheetContainer.width || y < 0f || y >= sheetContainer.height) return false
        return ownsDragAtPoint(sheetContainer, x, y)
    }

    private fun ownsDragAtPoint(view: View, x: Float, y: Float): Boolean {
        if (!view.isShown) return false
        if (view is OwnsVerticalDrags) return true
        if (view is VerticalDragOwnerAtPoint && view.ownsVerticalDragAt(x, y)) return true
        if (view !is ViewGroup) return false
        return (view.childCount - 1 downTo 0).map { view.getChildAt(it) }.any { child ->
            val childX = x - child.left - child.translationX
            val childY = y - child.top - child.translationY
            childX >= 0f && childX < child.width && childY >= 0f && childY < child.height && ownsDragAtPoint(child, childX, childY)
        }
    }

    private fun findScrollableAtPoint(view: View, x: Float, y: Float): View? {
        if (!view.isShown) return null
        if (view is ViewGroup) {
            for (i in view.childCount - 1 downTo 0) {
                val child = view.getChildAt(i)
                val childX = x - child.left - child.translationX
                val childY = y - child.top - child.translationY
                if (childX < 0f || childX >= child.width || childY < 0f || childY >= child.height) continue
                findScrollableAtPoint(child, childX, childY)?.let { return it }
            }
        }
        return view.takeIf { it.canScrollVertically(1) || it.canScrollVertically(-1) }
    }

    override fun onDetachedFromWindow() {
        interruptTouch(cancelChild = true)
        activeAnimation?.cancel()
        activeAnimation = null
        velocityTracker?.recycle()
        velocityTracker = null
        super.onDetachedFromWindow()
    }

    private val Int.dp: Int get() = (this * density).toInt()

    companion object {
        const val HANDLE_HEIGHT_DP = 24
        private const val CLOSED = 0
        private const val OPEN = 1
    }
}
