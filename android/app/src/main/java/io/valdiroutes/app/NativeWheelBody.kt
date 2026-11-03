package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.widget.TextView

/** Shared native wheel layout for Valdi embeds and Compose-hosted popup bodies. */
open class NativeWheelBody(context: Context) : ViewGroup(context), OwnsVerticalDrags {
    private val wheels = mutableListOf<NativeWheelColumn>()
    private val segments = mutableListOf<TextView>()
    private val segmentTrack = GradientDrawable()
    protected val density: Float get() = resources.displayMetrics.density
    internal var palette = NativeWheelPalette()
        private set

    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    protected open fun onWheelInteraction() {}

    internal fun applyPalette(next: NativeWheelPalette) {
        if (palette == next) return
        palette = next
        wheels.forEach { it.applyPalette(next) }
        styleSegments()
        invalidate()
    }

    private fun styleSegments() {
        segments.forEach { button ->
            button.setTextColor(if (button.isSelected) palette.primary else palette.muted)
            button.background = GradientDrawable().apply {
                setColor(if (button.isSelected) palette.surface else Color.TRANSPARENT)
                cornerRadius = 10f * density
            }
        }
    }

    /** Snapshot before stopping or changing dependent columns on confirm or segment switches. */
    internal fun visibleValues(): List<String> = wheels.map { it.visibleValue() }

    internal fun clearBody() {
        stopWheels()
        wheels.forEach { it.onSelected = null; it.onInteraction = null }
        segments.forEach { it.setOnClickListener(null) }
        wheels.clear()
        segments.clear()
        removeAllViews()
        contentDescription = null
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        parent?.requestDisallowInterceptTouchEvent(false)
    }

    override fun onDetachedFromWindow() {
        stopWheels()
        parent?.requestDisallowInterceptTouchEvent(false)
        super.onDetachedFromWindow()
    }

    internal fun showColumns(options: List<List<WheelItem>>, selected: List<String>, descriptions: List<String>, changed: (Int, String) -> Unit) {
        importantForAccessibility = if (options.isEmpty()) IMPORTANT_FOR_ACCESSIBILITY_YES else IMPORTANT_FOR_ACCESSIBILITY_NO
        contentDescription = if (options.isEmpty()) "无可选项目" else null
        while (wheels.size > options.size) {
            val wheel = wheels.removeAt(wheels.lastIndex)
            wheel.stop()
            wheel.onSelected = null
            wheel.onInteraction = null
            removeView(wheel)
        }
        while (wheels.size < options.size) {
            wheels += NativeWheelColumn(context).also { addView(it) }
        }
        wheels.forEachIndexed { index, wheel ->
            wheel.applyPalette(palette)
            wheel.onInteraction = { onWheelInteraction() }
            wheel.onSelected = { changed(index, it) }
            wheel.configure(options[index], selected.getOrElse(index) { "" }, descriptions.getOrElse(index) { "第${index + 1}列" })
        }
        requestLayout()
    }

    internal fun stopWheels() { wheels.forEach { it.stop() } }

    internal fun showSegments(labels: List<String>, selected: Int, changed: (Int) -> Unit) {
        while (segments.size > labels.size) {
            val segment = segments.removeAt(segments.lastIndex)
            segment.setOnClickListener(null)
            removeView(segment)
        }
        while (segments.size < labels.size) {
            segments += TextView(context).apply {
                gravity = Gravity.CENTER
                textSize = 14f
                typeface = Typeface.create(Typeface.create("sans-serif", Typeface.NORMAL), 600, false)
                setPadding((8 * density).toInt(), 0, (8 * density).toInt(), 0)
                isClickable = true
                isFocusable = true
                importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
                setSingleLine()
                ellipsize = android.text.TextUtils.TruncateAt.END
                accessibilityDelegate = object : AccessibilityDelegate() {
                    override fun onInitializeAccessibilityNodeInfo(host: android.view.View, info: android.view.accessibility.AccessibilityNodeInfo) {
                        super.onInitializeAccessibilityNodeInfo(host, info)
                        info.className = "android.widget.Button"
                    }
                }
                addView(this)
            }
        }
        segments.forEachIndexed { index, button ->
            button.text = labels[index]
            button.contentDescription = labels[index]
            button.isSelected = index == selected
            button.setOnClickListener { changed(index) }
        }
        styleSegments()
        requestLayout()
    }

    // Valdi assigns the host frame directly. Measure native children from that frame in onLayout.
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(resolveSize(suggestedMinimumWidth, widthMeasureSpec),
            resolveSize(((if (segments.isEmpty()) 200 else 244) * density).toInt(), heightMeasureSpec))
    }

    override fun dispatchDraw(canvas: Canvas) {
        if (segments.isNotEmpty()) {
            segmentTrack.setColor(palette.subtle)
            segmentTrack.cornerRadius = 12f * density
            segmentTrack.setBounds(0, 0, width, (40 * density).toInt().coerceAtMost(height))
            segmentTrack.draw(canvas)
        }
        super.dispatchDraw(canvas)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val availableWidth = right - left
        val availableHeight = bottom - top
        val header = if (segments.isEmpty()) 0 else (44 * density).toInt()
        fun layoutChildren(children: List<android.view.View>, y: Int, height: Int, gap: Int, inset: Int = 0) {
            if (children.isEmpty()) return
            val contentWidth = (availableWidth - inset * 2 - gap * (children.size - 1)).coerceAtLeast(0)
            children.forEachIndexed { index, child ->
                val x = inset + contentWidth * index / children.size + gap * index
                val end = inset + contentWidth * (index + 1) / children.size + gap * index
                child.measure(MeasureSpec.makeMeasureSpec(end - x, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
                child.layout(x, y, end, y + height)
            }
        }
        val segmentInset = (2 * density).toInt()
        layoutChildren(segments, segmentInset,
            ((40 * density).toInt().coerceAtMost(availableHeight) - segmentInset * 2).coerceAtLeast(0), 0, segmentInset)
        layoutChildren(wheels, header, (200 * density).toInt().coerceAtMost((availableHeight - header).coerceAtLeast(0)), (4 * density).toInt())
    }
}
