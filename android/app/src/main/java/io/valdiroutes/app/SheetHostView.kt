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

/**
 * A modal bottom sheet in the current window: a scrim plus a panel that snaps between detents. Dragging follows the
 * finger and hands over to the content's scroll: a downward drag moves the sheet only once the scroll under the
 * finger is at its top.
 */
class SheetHostView(context: Context) : ViewGroup(context) {

    /** Called once the sheet has settled closed. [byUser] is false for [dismiss]. */
    var onClosed: ((byUser: Boolean) -> Unit)? = null

    /** Height of the open detent in px, before clamping to the space below the status bar. Changes apply immediately. */
    var openHeight = 0f
        set(value) {
            if (field == value) return
            field = value
            requestLayout()
        }

    private val density = context.resources.displayMetrics.density
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val scrimColor = Color.argb(0x66, 0, 0, 0)
    private val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val cornerRadius = 20 * density

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

    // Detent heights in px, ascending; index 0 is closed.
    private var detents = listOf(0f, 0f)
    private var targetIndex = 0
    private var hasLaidOut = false
    private var closeRequested = false
    private var closedNotified = false

    private var activeAnimation: SpringAnimation? = null
    private var velocityTracker: VelocityTracker? = null
    private var isPanning = false
    private var activeDragRange: ClosedFloatingPointRange<Float>? = null
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var lastTouchY = 0f
    private var activePointerId = MotionEvent.INVALID_POINTER_ID
    private var scrimPressed = false
    private var scrimTouchActive = false
    private var scrimProgress = 0f
    private var capPx = Float.NaN

    init {
        setWillNotDraw(false)
        val handle = View(context).apply {
            background = GradientDrawable().apply {
                setColor(Color.rgb(0xD1, 0xD5, 0xDB))
                cornerRadius = 2 * density
            }
        }
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
        capPx = availableHeight(h)
        detents = listOf(0f, openHeight.coerceIn(0f, capPx))
        sheetContainer.measure(
            MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(maxHeight.toInt(), MeasureSpec.EXACTLY),
        )
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val w = right - left
        val h = bottom - top
        if (w <= 0 || h <= 0 || maxHeight <= 0f) return
        sheetContainer.layout(0, h - maxHeight.toInt(), w, h)

        if (!hasLaidOut) {
            // Animate in from closed to the open detent.
            hasLaidOut = true
            sheetContainer.translationY = translationY(CLOSED)
            emitPosition()
            snapToIndex(OPEN, 0f)
            return
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

    override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        // A scroll requests exclusive ownership once it starts scrolling. Keep observing at this sheet so the same
        // pointer can transfer at the scroll's edge; ancestors still respect the child's request.
        if (disallowIntercept && !isPanning && activePointerId != MotionEvent.INVALID_POINTER_ID &&
            isAtMaxDragCandidate() && findScrollableAtTouch() != null
        ) {
            parent?.requestDisallowInterceptTouchEvent(true)
            return
        }
        super.requestDisallowInterceptTouchEvent(disallowIntercept)
    }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
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
            }
            MotionEvent.ACTION_MOVE -> {
                if (activePointerId == MotionEvent.INVALID_POINTER_ID) return false
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
            }
        }
        return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
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
                    if (shouldDismiss) snapToIndex(CLOSED, 0f)
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
                snapToIndex(bestSnapIndex(currentSheetHeight(), velocity), velocity)
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
