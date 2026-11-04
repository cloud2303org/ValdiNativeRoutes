package io.valdiroutes.app_ui.ui

import java.util.Calendar
import kotlin.math.roundToInt

/** Immutable snapshots keep generated mutable models out of scrolling and equality checks. */
internal data class WheelItem(val value: String, val label: String)
internal data class WheelNode(val value: String, val label: String, val children: List<WheelNode> = emptyList())

/** Measures only requested (visible) rows and retains at most 32 labels across scroll frames. */
internal class WheelLabelCache {
    private val labels = LinkedHashMap<Int, String>(32, 0.75f, true)
    private var width = -1
    val size: Int get() = labels.size

    fun label(index: Int, width: Int, measure: () -> String): String {
        if (this.width != width) {
            clear()
            this.width = width
        }
        labels[index]?.let { return it }
        val label = measure()
        if (labels.size == 32) {
            val iterator = labels.entries.iterator()
            iterator.next()
            iterator.remove()
        }
        labels[index] = label
        return label
    }

    fun clear() {
        labels.clear()
        width = -1
    }
}

/** Failed attributes must not leave the previous interactive selection or callback installed. */
internal inline fun <T> applyWheelConfigOrReset(reset: () -> Unit, apply: () -> T): T {
    return try {
        apply()
    } catch (failure: Throwable) {
        try {
            reset()
        } catch (resetFailure: Throwable) {
            failure.addSuppressed(resetFailure)
        }
        throw failure
    }
}

internal fun wheelSelection(items: List<WheelItem>, value: String): Int =
    items.indexOfFirst { it.value == value }.coerceAtLeast(0)

internal fun wheelSnap(position: Float, count: Int): Int =
    if (count == 0) 0 else position.roundToInt().coerceIn(0, count - 1)

/** Consume delayed controlled-value echoes without rewinding a newer local selection. */
internal class WheelEcho<T> {
    private val pending = ArrayDeque<T>()
    private var echoed: T? = null
    var touched = false
        private set

    fun touch() { touched = true }
    fun sent(value: T) {
        pending.addLast(value)
    }
    fun isEcho(value: T): Boolean {
        val index = pending.indexOf(value)
        if (index >= 0) {
            repeat(index + 1) { pending.removeFirst() }
            echoed = value
            return true
        }
        if (value == echoed && pending.isNotEmpty()) return true
        pending.clear()
        echoed = null
        return false
    }
    fun reset() {
        pending.clear()
        echoed = null
        touched = false
    }
}

internal data class WheelDate(val year: Int, val month: Int, val day: Int, val hour: Int, val minute: Int) {
    fun clamp(start: Int, end: Int): WheelDate {
        val y = year.coerceIn(start, end)
        val m = month.coerceIn(1, 12)
        return copy(year = y, month = m, day = day.coerceIn(1, days(y, m)),
            hour = hour.coerceIn(0, 23), minute = minute.coerceIn(0, 59))
    }

    fun format(mode: String): String = when (mode) {
        "year" -> year.toString().padStart(4, '0')
        "year-month" -> "${format("year")}-${pad(month)}"
        "time" -> "${pad(hour)}:${pad(minute)}"
        "datetime" -> "${format("date")} ${format("time")}"
        else -> "${format("year-month")}-${pad(day)}"
    }

    fun change(mode: String, index: Int, value: Int, start: Int, end: Int): WheelDate =
        (if (mode == "time") {
            if (index == 0) copy(hour = value) else copy(minute = value)
        } else when (index) {
            0 -> copy(year = value)
            1 -> copy(month = value)
            else -> copy(day = value)
        }).clamp(start, end)

    /** Apply a snapshot of all visible columns before clamping dependent date parts. */
    fun settle(mode: String, values: List<String>, start: Int, end: Int): WheelDate {
        fun part(index: Int, fallback: Int) = values.getOrNull(index)?.toIntOrNull() ?: fallback
        val next = when (mode) {
            "time" -> copy(hour = part(0, hour), minute = part(1, minute))
            "year" -> copy(year = part(0, year))
            "year-month" -> copy(year = part(0, year), month = part(1, month))
            else -> copy(year = part(0, year), month = part(1, month), day = part(2, day))
        }
        return next.clamp(start, end)
    }

    fun selected(mode: String): List<String> = when (mode) {
        "year" -> listOf(year)
        "year-month" -> listOf(year, month)
        "time" -> listOf(hour, minute)
        else -> listOf(year, month, day)
    }.map(Int::toString)

    fun columns(mode: String, start: Int, end: Int): List<List<WheelItem>> {
        fun items(range: IntRange, suffix: String, padded: Boolean = false) = range.map {
            WheelItem(it.toString(), "${if (padded) pad(it) else it.toString()}$suffix")
        }
        return when (mode) {
            "time" -> listOf(items(0..23, "时", true), items(0..59, "分", true))
            "year" -> listOf(items(start..end, "年"))
            "year-month" -> listOf(items(start..end, "年"), items(1..12, "月"))
            else -> listOf(items(start..end, "年"), items(1..12, "月"), items(1..days(year, month), "日"))
        }
    }

    companion object {
        private fun pad(value: Int) = value.toString().padStart(2, '0')
        fun days(year: Int, month: Int): Int = when (month) {
            2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
            4, 6, 9, 11 -> 30
            else -> 31
        }
        fun now(): WheelDate = Calendar.getInstance().let {
            WheelDate(it.get(Calendar.YEAR), it.get(Calendar.MONTH) + 1, it.get(Calendar.DAY_OF_MONTH),
                it.get(Calendar.HOUR_OF_DAY), it.get(Calendar.MINUTE))
        }
        fun parse(value: String, fallback: WheelDate = now()): WheelDate {
            Regex("""^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$""").matchEntire(value)?.let {
                val g = it.groupValues
                return WheelDate(g[1].toInt(), g[2].toInt(), g[3].toInt(),
                    g[4].toIntOrNull() ?: fallback.hour, g[5].toIntOrNull() ?: fallback.minute)
            }
            Regex("""^(\d{4})(?:-(\d{2}))?$""").matchEntire(value)?.let {
                return fallback.copy(year = it.groupValues[1].toInt(),
                    month = it.groupValues[2].toIntOrNull() ?: fallback.month)
            }
            Regex("""^(\d{2}):(\d{2})$""").matchEntire(value)?.let {
                return fallback.copy(hour = it.groupValues[1].toInt(), minute = it.groupValues[2].toInt())
            }
            return fallback
        }
    }
}

internal fun normalizeWheelPath(data: List<WheelNode>, requested: List<String>, columns: Int): List<String> {
    val result = mutableListOf<String>()
    var level = data
    while (level.isNotEmpty() && result.size < columns) {
        val selected = level.find { it.value == requested.getOrNull(result.size) } ?: level.first()
        result += selected.value
        level = selected.children
    }
    return result
}

internal fun wheelTreeColumns(data: List<WheelNode>, path: List<String>, columns: Int): List<List<WheelItem>> {
    val result = mutableListOf<List<WheelItem>>()
    var level = data
    while (level.isNotEmpty() && result.size < columns) {
        val index = result.size
        result += level.map { WheelItem(it.value, it.label) }
        level = level.find { it.value == path.getOrNull(index) }?.children ?: break
    }
    return result
}

internal fun replaceWheelPath(data: List<WheelNode>, path: List<String>, index: Int, value: String, columns: Int) =
    normalizeWheelPath(data, path.take(index) + value, columns)
