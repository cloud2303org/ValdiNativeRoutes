package io.valdiroutes.app_ui.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Bundle
import android.text.TextPaint
import android.text.TextUtils
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.OverScroller
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

internal data class NativeWheelPalette(
    val text: Int = 0xff172033.toInt(),
    val subtle: Int = 0xfff4f6f8.toInt(),
    val border: Int = 0xffe8ecf1.toInt(),
    val surface: Int = 0xffffffff.toInt(),
    val primary: Int = 0xff1e62d0.toInt(),
    val muted: Int = 0xff667085.toInt(),
    val hairline: Int = 0xffececec.toInt(),
)

/** A five-row wheel: only the visible labels are drawn, irrespective of the option count. */
internal class NativeWheelColumn(context: Context) : View(context) {
    private var palette = NativeWheelPalette()
    private val density = resources.displayMetrics.density
    private val rowHeight = 40f * density
    private val text = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 16f * resources.displayMetrics.scaledDensity
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        textAlign = Paint.Align.CENTER
        color = 0xff172033.toInt()
    }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bounds = RectF()
    private val scroller = OverScroller(context)
    private val configuration = ViewConfiguration.get(context)
    private var velocity: VelocityTracker? = null
    private var pointer = -1
    private var downY = 0f
    private var lastY = 0f
    private var dragging = false
    private var snapping = false
    private var animating = false
    private var position = 0f
    private var committed = 0
    private var items: List<WheelItem> = emptyList()
    private var columnDescription = "选择"
    private val labels = WheelLabelCache()
    var onSelected: ((String) -> Unit)? = null
    var onInteraction: (() -> Unit)? = null

    fun applyPalette(next: NativeWheelPalette) {
        if (palette == next) return
        palette = next
        text.color = next.text
        invalidate()
    }

    fun visibleValue(): String = items.getOrNull(wheelSnap(position, items.size))?.value.orEmpty()

    init {
        isFocusable = true
        isClickable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun configure(options: List<WheelItem>, value: String, description: String) {
        val selected = wheelSelection(options, value)
        columnDescription = description
        if (items != options || committed != selected) {
            stop()
            items = options
            committed = selected
            position = selected.toFloat()
            labels.clear()
            invalidate()
        }
        updateDescription()
    }

    private fun updateDescription() {
        contentDescription = if (items.isEmpty()) "$columnDescription，无选项" else
            "$columnDescription，${items[committed].label}，${committed + 1}/${items.size}"
    }

    /** Stop without delivering a stale callback; cancellation restores the last committed selection. */
    fun stop() {
        scroller.forceFinished(true)
        animating = false
        snapping = false
        velocity?.recycle()
        velocity = null
        pointer = -1
        dragging = false
        position = committed.toFloat()
        invalidate()
    }

    /** Segment switches commit the nearest visible row before changing date/time columns. */
    fun settleNow() {
        if (!animating && pointer == -1) return
        val selected = wheelSnap(position, items.size)
        stop()
        commit(selected)
    }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val center = height / 2f
        bounds.set(0f, center - rowHeight / 2, width.toFloat(), center + rowHeight / 2)
        paint.color = palette.subtle
        paint.style = Paint.Style.FILL
        canvas.drawRoundRect(bounds, 12f * density, 12f * density, paint)
        paint.color = palette.border
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = density / 2
        canvas.drawRoundRect(bounds, 12f * density, 12f * density, paint)
        val first = position.toInt() - 3
        val baseline = -(text.ascent() + text.descent()) / 2
        val radians = (Math.PI / 6).toFloat()
        for (index in first..first + 7) {
            if (index !in items.indices) continue
            val distance = index - position
            val angle = distance * radians
            if (abs(angle) >= Math.PI / 2) continue
            val label = labels.label(index, width) {
                TextUtils.ellipsize(items[index].label, text, (width - 12f * density).coerceAtLeast(0f),
                    TextUtils.TruncateAt.END).toString()
            }
            val scale = cos(angle)
            val y = center + rowHeight / radians * sin(angle)
            text.alpha = (255 * scale * scale * scale).toInt().coerceIn(0, 255)
            canvas.save()
            canvas.translate(width / 2f, y)
            canvas.scale(1f, scale)
            canvas.drawText(label, 0f, baseline, text)
            canvas.restore()
        }
        text.alpha = 255
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            parent?.requestDisallowInterceptTouchEvent(true)
            onInteraction?.invoke()
            scroller.forceFinished(true)
            animating = false
            snapping = false
            velocity?.recycle()
            velocity = VelocityTracker.obtain()
            pointer = event.getPointerId(0)
            downY = event.y
            lastY = event.y
            dragging = false
        }
        velocity?.addMovement(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                val index = event.findPointerIndex(pointer)
                if (index < 0) { stop(); return true }
                val y = event.getY(index)
                if (!dragging && abs(y - downY) > configuration.scaledTouchSlop) {
                    dragging = true
                    lastY = downY + if (y > downY) configuration.scaledTouchSlop else -configuration.scaledTouchSlop
                }
                if (dragging) {
                    position = (position + (lastY - y) / rowHeight).coerceIn(0f, (items.size - 1).coerceAtLeast(0).toFloat())
                    lastY = y
                    invalidate()
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                if (event.getPointerId(event.actionIndex) == pointer) {
                    val next = if (event.actionIndex == 0) 1 else 0
                    pointer = event.getPointerId(next)
                    lastY = event.getY(next)
                    downY = lastY
                    velocity?.clear()
                }
            }
            MotionEvent.ACTION_UP -> {
                if (pointer == -1) return true
                velocity?.computeCurrentVelocity(1000, configuration.scaledMaximumFlingVelocity.toFloat())
                val speed = -(velocity?.getYVelocity(pointer) ?: 0f)
                velocity?.recycle()
                velocity = null
                pointer = -1
                if (!dragging) {
                    performClick()
                    snap(wheelSnap(position + (event.y - height / 2f) / rowHeight, items.size))
                } else if (abs(speed) >= configuration.scaledMinimumFlingVelocity && items.isNotEmpty()) {
                    snapping = false
                    animating = true
                    scroller.fling(0, (position * rowHeight).toInt(), 0, speed.toInt(),
                        0, 0, 0, ((items.size - 1) * rowHeight).toInt())
                    postInvalidateOnAnimation()
                } else snap(wheelSnap(position, items.size))
                dragging = false
                parent?.requestDisallowInterceptTouchEvent(false)
            }
            MotionEvent.ACTION_CANCEL -> {
                stop()
                parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private fun snap(index: Int) {
        val target = wheelSnap(index.toFloat(), items.size)
        scroller.forceFinished(true)
        val start = (position * rowHeight).toInt()
        val end = (target * rowHeight).toInt()
        if (abs(end - start) <= 1) { animating = false; snapping = false; commit(target); return }
        snapping = true
        animating = true
        scroller.startScroll(0, start, 0, end - start, 160)
        postInvalidateOnAnimation()
    }

    override fun computeScroll() {
        if (!animating) return
        if (scroller.computeScrollOffset()) {
            position = (scroller.currY / rowHeight).coerceIn(0f, (items.size - 1).coerceAtLeast(0).toFloat())
            postInvalidateOnAnimation()
        } else {
            animating = false
            if (snapping) {
                snapping = false
                commit(wheelSnap(position, items.size))
            } else snap(wheelSnap(position, items.size))
        }
    }

    private fun commit(index: Int) {
        position = index.toFloat()
        invalidate()
        if (index == committed || items.isEmpty()) return
        committed = index
        updateDescription()
        sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_SELECTED)
        onSelected?.invoke(items[index].value)
    }

    private fun step(delta: Int): Boolean {
        if (items.isEmpty()) return false
        val next = (committed + delta).coerceIn(0, items.lastIndex)
        if (next == committed) return false
        onInteraction?.invoke()
        stop()
        commit(next)
        return true
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> step(-1)
        KeyEvent.KEYCODE_DPAD_DOWN -> step(1)
        else -> super.onKeyDown(keyCode, event)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.NumberPicker"
        info.isScrollable = items.size > 1
        if (items.isNotEmpty()) {
            info.rangeInfo = AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_INT,
                0f, items.lastIndex.toFloat(), committed.toFloat())
        }
        if (committed > 0) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)
        if (committed < items.lastIndex) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD)
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean = when (action) {
        AccessibilityNodeInfo.ACTION_SCROLL_FORWARD -> step(1)
        AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD -> step(-1)
        else -> super.performAccessibilityAction(action, arguments)
    }
}
