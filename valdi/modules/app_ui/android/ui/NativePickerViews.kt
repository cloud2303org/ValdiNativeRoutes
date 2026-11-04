package io.valdiroutes.app_ui.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.BaseAdapter
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import io.valdiroutes.app_ui.ui.NativeWheelBody
import io.valdiroutes.app_ui.ui.NativeWheelPalette
import io.valdiroutes.app_ui.ui.WheelItem

/** Host disposal/cancellation never commits a moving wheel; confirm explicitly settles first. */
internal interface NativePickerContent {
    fun settle()
    fun cancel()
    fun release()
}

internal class NativePickerHandle {
    var body: NativePickerContent? = null
    fun settle() { body?.settle() }
    fun cancel() { body?.cancel() }
    fun release(view: NativePickerContent) {
        view.release()
        if (body === view) body = null
    }
}

internal class NativePopupWheelView(context: Context) : NativeWheelBody(context), NativePickerContent {
    private var state: NativePickerState<*>? = null
    private var changed: (() -> Unit)? = null
    private var active = false

    fun bind(state: NativePickerState<*>, palette: NativeWheelPalette, active: Boolean, changed: () -> Unit) {
        this.state = state
        this.changed = changed
        this.active = active
        applyPalette(palette)
        if (!active) stopWheels()
        render()
    }

    private fun render() {
        val state = state ?: return
        showSegments(state.segments, state.segment) { index ->
            if (active && index != state.segment) {
                settle()
                state.selectSegment(index)
                render()
            }
        }
        showColumns(state.options, state.selected, state.descriptions) { index, value ->
            if (active && state.select(index, value)) {
                render()
                changed?.invoke()
            }
        }
    }

    override fun settle() {
        val state = state ?: return
        if (!active) return
        val values = visibleValues()
        stopWheels()
        val updated = state.settle(values)
        render()
        if (updated) changed?.invoke()
    }
    override fun cancel() { active = false; stopWheels() }
    override fun release() { cancel(); changed = null; state = null; clearBody() }
    override fun dispatchTouchEvent(event: MotionEvent): Boolean = if (active) super.dispatchTouchEvent(event) else true
}

/** Native tabs and a recycled native list retain the page picker's partial-path workflow. */
internal class NativeTreePageView(context: Context) : LinearLayout(context), NativePickerContent {
    private val density = resources.displayMetrics.density
    private fun dp(value: Int) = (value * density).toInt()
    private var state: NativeTreePickerState? = null
    private var palette = NativeWheelPalette()
    private var changed: (() -> Unit)? = null
    private var active = false
    private var rows = emptyList<WheelItem>()
    private var renderedLevel = -1
    private val tabs = LinearLayout(context).apply { setPadding(dp(16), 0, dp(16), 0) }
    private val separator = View(context)
    private val hint = label(12f)
    private val count = label(12f).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL }
    private val list = ListView(context).apply {
        dividerHeight = 0
        cacheColorHint = Color.TRANSPARENT
    }
    private val empty = label(16f).apply { text = "这一级没有选项"; gravity = Gravity.CENTER }
    private val adapter = object : BaseAdapter() {
        override fun getCount() = rows.size
        override fun getItem(position: Int) = rows[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val row = (convertView as? LinearLayout) ?: LinearLayout(context).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(24), 0, dp(24), 0)
                minimumHeight = dp(56)
                layoutParams = android.widget.AbsListView.LayoutParams(LayoutParams.MATCH_PARENT, dp(56))
                addView(label(16f).apply {
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
                addView(label(20f).apply {
                    text = "✓"
                    gravity = Gravity.CENTER
                    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LayoutParams(dp(20), LayoutParams.WRAP_CONTENT))
            }
            val option = rows[position]
            val checked = option.value == state?.value?.getOrNull(state?.level ?: 0)
            row.contentDescription = option.label
            row.isSelected = checked
            (row.getChildAt(0) as TextView).apply {
                text = option.label
                setTextColor(if (checked) palette.primary else palette.text)
            }
            (row.getChildAt(1) as TextView).apply {
                visibility = if (checked) View.VISIBLE else View.INVISIBLE
                setTextColor(palette.primary)
            }
            return row
        }
    }

    init {
        orientation = VERTICAL
        addView(tabs, LayoutParams(LayoutParams.MATCH_PARENT, dp(48)))
        addView(separator, LayoutParams(LayoutParams.MATCH_PARENT, (density / 2).toInt().coerceAtLeast(1)))
        addView(LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(12))
            addView(hint, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(count, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(empty, LayoutParams(LayoutParams.MATCH_PARENT, dp(80)))
        addView(list, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        list.emptyView = empty
        list.adapter = adapter
        list.setOnItemClickListener { _, _, position, _ ->
            val state = state
            if (active && state != null) {
                val updated = state.select(state.level, rows[position].value)
                render()
                if (updated) changed?.invoke()
            }
        }
    }

    private fun label(size: Float) = TextView(context).apply {
        textSize = size
        setSingleLine()
        ellipsize = TextUtils.TruncateAt.END
    }

    fun bind(state: NativeTreePickerState, palette: NativeWheelPalette, active: Boolean, changed: () -> Unit) {
        if (this.state !== state) renderedLevel = -1
        this.state = state
        this.palette = palette
        this.active = active
        this.changed = changed
        if (!active) list.smoothScrollBy(0, 0)
        render()
    }

    private fun render() {
        val state = state ?: return
        val columns = state.options
        setBackgroundColor(palette.surface)
        separator.setBackgroundColor(palette.hairline)
        tabs.removeAllViews()
        columns.forEachIndexed { index, column ->
            val selected = index == state.level
            val title = column.find { it.value == state.value.getOrNull(index) }?.label ?: "请选择"
            tabs.addView(LinearLayout(context).apply {
                orientation = VERTICAL
                isSelected = selected
                isClickable = true
                isFocusable = true
                contentDescription = title
                importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
                accessibilityDelegate = object : AccessibilityDelegate() {
                    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                        super.onInitializeAccessibilityNodeInfo(host, info)
                        info.className = "android.widget.Button"
                    }
                }
                addView(label(14f).apply {
                    text = title
                    gravity = Gravity.CENTER
                    setPadding(dp(8), 0, dp(8), 0)
                    setTextColor(if (selected) palette.primary else palette.muted)
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
                addView(View(context).apply { setBackgroundColor(if (selected) palette.primary else Color.TRANSPARENT) },
                    LayoutParams(LayoutParams.MATCH_PARENT, dp(2)))
                setOnClickListener { if (active) { state.visit(index); render() } }
            }, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        }
        val next = columns.getOrElse(state.level) { emptyList() }
        val resetScroll = renderedLevel != state.level || rows != next
        rows = next
        renderedLevel = state.level
        hint.text = "选择" + listOf("省份", "城市", "区县", "街道").getOrElse(state.level) { "地区" }
        count.text = "${rows.size} 项"
        hint.setTextColor(palette.muted)
        count.setTextColor(palette.muted)
        empty.setTextColor(palette.muted)
        list.divider = GradientDrawable().apply { setColor(palette.border) }
        list.dividerHeight = (density / 2).toInt().coerceAtLeast(1)
        adapter.notifyDataSetChanged()
        if (resetScroll) list.setSelection(0)
    }

    override fun settle() {}
    override fun cancel() { active = false; list.smoothScrollBy(0, 0) }
    override fun release() { cancel(); changed = null; state = null; rows = emptyList(); tabs.removeAllViews(); list.adapter = null }
    override fun onDetachedFromWindow() { list.smoothScrollBy(0, 0); super.onDetachedFromWindow() }
}
