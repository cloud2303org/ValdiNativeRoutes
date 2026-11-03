package io.nativeroutes.ui

import io.valdiroutes.app.WheelDate
import io.valdiroutes.app.WheelItem
import io.valdiroutes.app.WheelNode
import io.valdiroutes.app.normalizeWheelPath
import io.valdiroutes.app.replaceWheelPath
import io.valdiroutes.app.wheelSelection
import io.valdiroutes.app.wheelTreeColumns

/** Pure selection state shared by the host callbacks and native bodies. */
internal abstract class NativePickerState<T> {
    abstract val value: T
    open val complete: Boolean get() = true
    abstract val options: List<List<WheelItem>>
    abstract val selected: List<String>
    abstract val descriptions: List<String>
    open val segments: List<String> get() = emptyList()
    open val segment: Int get() = 0
    abstract fun select(index: Int, value: String): Boolean
    abstract fun settle(values: List<String>): Boolean
    open fun selectSegment(index: Int) {}
}

internal class NativeColumnPickerState(val items: List<WheelItem>, requested: String?) : NativePickerState<String>() {
    override var value = items.getOrNull(wheelSelection(items, requested.orEmpty()))?.value.orEmpty()
        private set
    override val options get() = listOf(items)
    override val selected get() = listOf(value)
    override val descriptions get() = listOf("选项")
    override fun select(index: Int, value: String): Boolean {
        if (value == this.value || items.none { it.value == value }) return false
        this.value = value
        return true
    }
    override fun settle(values: List<String>) = values.firstOrNull()?.let { select(0, it) } ?: false
}

/** The active segment survives controlled value updates, and resets for a new opening. */
internal class NativePickerSegment(var selected: Int = 0)

internal class NativeTimePickerState(
    val mode: TimePickMode,
    requested: String?,
    minYear: Int?,
    maxYear: Int?,
    fallback: WheelDate = WheelDate.now(),
    private val tab: NativePickerSegment = NativePickerSegment(),
) : NativePickerState<String>() {
    val start = (minYear ?: fallback.year - 5).coerceIn(1, 9999)
    val end = (maxYear ?: fallback.year + 5).coerceIn(start, 9999)
    var parts = WheelDate.parse(requested.orEmpty(), fallback).clamp(start, end)
        private set
    private val formatMode get() = when (mode) {
        TimePickMode.Year -> "year"
        TimePickMode.YearMonth -> "year-month"
        TimePickMode.Date -> "date"
        TimePickMode.Time -> "time"
        TimePickMode.DateTime -> "datetime"
    }
    private val wheelMode get() = if (mode == TimePickMode.DateTime) {
        if (tab.selected == 1) "time" else "date"
    } else formatMode
    override val value get() = parts.format(formatMode)
    override val options get() = parts.columns(wheelMode, start, end)
    override val selected get() = parts.selected(wheelMode)
    override val descriptions get() = if (wheelMode == "time") listOf("小时", "分钟") else listOf("年份", "月份", "日期")
    override val segments get() = if (mode == TimePickMode.DateTime)
        listOf("日期  ${parts.format("date")}", "时间  ${parts.format("time")}") else emptyList()
    override val segment get() = tab.selected
    override fun selectSegment(index: Int) { tab.selected = index.coerceIn(0, 1) }
    override fun select(index: Int, value: String): Boolean {
        val parsed = value.toIntOrNull() ?: return false
        return update(parts.change(wheelMode, index, parsed, start, end))
    }
    override fun settle(values: List<String>): Boolean =
        update(parts.settle(wheelMode, values, start, end))
    private fun update(next: WheelDate): Boolean {
        if (parts == next) return false
        parts = next
        return true
    }
}

internal class NativeTreePickerState(
    val data: List<WheelNode>, requested: List<String>, val columns: Int, val page: Boolean,
) : NativePickerState<List<String>>() {
    override var value = if (page) validPath(requested) else normalizeWheelPath(data, requested, columns)
        private set
    override val options get() = wheelTreeColumns(data, value, columns)
    override val selected get() = value
    override val descriptions get() = options.indices.map { "第${it + 1}级" }
    override val complete get() = value.isNotEmpty() && options.size == value.size
    var level = (options.size - 1).coerceAtLeast(0)
        private set

    fun visit(index: Int) { level = index.coerceIn(0, (options.size - 1).coerceAtLeast(0)) }
    override fun select(index: Int, value: String): Boolean {
        if (options.getOrNull(index)?.none { it.value == value } != false) return false
        val next = if (page) validPath(this.value.take(index) + value)
            else replaceWheelPath(data, this.value, index, value, columns)
        val changed = next != this.value
        this.value = next
        if (page) visit(index + 1)
        return changed
    }
    override fun settle(values: List<String>): Boolean {
        // An ancestor change invalidates its old descendants, even if two branches
        // happen to reuse a child value. Normalize the new branch from that point.
        val index = values.indices.firstOrNull { values[it] != value.getOrNull(it) } ?: return false
        return select(index, values[index])
    }
    private fun validPath(requested: List<String>): List<String> {
        val result = mutableListOf<String>()
        var nodes = data
        for (value in requested.take(columns.coerceAtLeast(0))) {
            val node = nodes.find { it.value == value } ?: break
            result += value
            nodes = node.children
        }
        return result
    }
}

internal fun TreeNode.nativeNode(): WheelNode = WheelNode(value, label, children.map { it.nativeNode() })
