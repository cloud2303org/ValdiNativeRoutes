package io.valdiroutes.app

import android.content.Context
import android.view.MotionEvent
import androidx.annotation.Keep
import com.snap.valdi.attributes.AttributesBinder
import com.snap.valdi.attributes.AttributesBindingContext
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.utils.ValdiMarshallableObject
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.views.ValdiRecyclableView
import com.snap.valdi.views.ValdiTouchEventResult
import com.snap.valdi.views.ValdiTouchTarget
import io.valdiroutes.app_ui.ui.NativeWheelBody
import io.valdiroutes.app_ui.ui.WheelDate
import io.valdiroutes.app_ui.ui.WheelEcho
import io.valdiroutes.app_ui.ui.WheelItem
import io.valdiroutes.app_ui.ui.WheelNode
import io.valdiroutes.app_ui.ui.applyWheelConfigOrReset
import io.valdiroutes.app_ui.ui.normalizeWheelPath
import io.valdiroutes.app_ui.ui.replaceWheelPath
import io.valdiroutes.app_ui.ui.wheelSelection
import io.valdiroutes.app_ui.ui.wheelTreeColumns
import io.valdiroutes.pages.ColumnWheelConfig
import io.valdiroutes.pages.TimeWheelConfig
import io.valdiroutes.pages.TreeWheelConfig
import io.valdiroutes.pages.WheelTreeNode

/** AppUI owns the wheel controls; this adapter owns Valdi input, models, and callbacks. */
abstract class ValdiWheelView(context: Context) : NativeWheelBody(context), ValdiTouchTarget,
    ValdiRecyclableView {
    var onChange: ValdiFunction? = null
    private val echo = WheelEcho<Any>()
    override fun onWheelInteraction() { echo.touch() }

    /** The binder delegates to the actual view, so existing ValdiHost registrations remain valid. */
    abstract fun applyUntyped(config: Any?)
    protected abstract fun resetSelection()

    protected fun <T> applyDecoded(type: Class<T>, value: Any?, apply: (T) -> Unit) {
        applyWheelConfigOrReset(reset = {
            onChange = null
            resetConfig()
        }) {
            apply(ValdiMarshallableObject.fromUntyped(type, value))
        }
    }

    protected fun isEcho(value: Any): Boolean = echo.isEcho(value)
    protected fun emit(value: String) = emitValue(value) { it.pushString(value) }
    protected fun emit(value: List<String>) {
        val snapshot = value.toList()
        emitValue(snapshot) { marshaller -> marshaller.pushList(snapshot) { marshaller.pushString(it) } }
    }
    private fun emitValue(value: Any, push: (ValdiMarshaller) -> Unit) {
        if (!echo.touched) return
        val function = onChange ?: return
        echo.sent(value)
        ValdiMarshaller.use { push(it); function.perform(it) }
    }

    fun resetConfig() {
        clearBody()
        echo.reset()
        resetSelection()
        parent?.requestDisallowInterceptTouchEvent(false)
    }

    override fun prepareForRecycling() {
        resetConfig()
        onChange = null
    }

    override fun onDetachedFromWindow() {
        stopWheels()
        parent?.requestDisallowInterceptTouchEvent(false)
        // A temporary detach is not necessarily reuse. The recycler/config-reset clears echo state.
        super.onDetachedFromWindow()
    }

    override fun processTouchEvent(event: MotionEvent): ValdiTouchEventResult {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            echo.touch()
            parent?.requestDisallowInterceptTouchEvent(true)
        }
        dispatchTouchEvent(event)
        if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
            parent?.requestDisallowInterceptTouchEvent(false)
        }
        return ValdiTouchEventResult.ConsumeEventAndCancelOtherGestures
    }

}

class ValdiWheelBinder<T : ValdiWheelView>(override val viewClass: Class<T>) : AttributesBinder<T> {
    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<T>) {
        attributesBindingContext.bindUntypedAttribute("config", false,
            { view, value -> view.applyUntyped(value) }, { view -> view.resetConfig() })
        attributesBindingContext.bindFunctionAttribute("onChange", { view, function -> view.onChange = function }, { view -> view.onChange = null })
    }
}

@Keep
class ColumnWheelView(context: Context) : ValdiWheelView(context) {
    private var options = emptyList<WheelItem>()
    private var value = ""
    private var configured = false

    override fun applyUntyped(config: Any?) = applyDecoded(ColumnWheelConfig::class.java, config, ::apply)
    fun apply(config: ColumnWheelConfig) {
        val next = config.options.map { WheelItem(it.value, it.label) }
        val echoed = isEcho(config.value)
        if (configured && options == next && (value == config.value || echoed)) return
        stopWheels()
        options = next
        configured = true
        val requested = if (echoed) value else config.value
        value = options.getOrNull(wheelSelection(options, requested))?.value.orEmpty()
        showColumns(listOf(options), listOf(value), listOf("选项")) { _, nextValue ->
            if (nextValue != value) { value = nextValue; emit(value) }
        }
    }
    override fun resetSelection() { options = emptyList(); value = ""; configured = false }
}

@Keep
class TimeWheelView(context: Context) : ValdiWheelView(context) {
    private var mode = "date"
    private var start = 1
    private var end = 9999
    private var parts = WheelDate.now()
    private var timeTab = false
    private var configured = false

    override fun applyUntyped(config: Any?) = applyDecoded(TimeWheelConfig::class.java, config, ::apply)
    fun apply(config: TimeWheelConfig) {
        val nextMode = config.mode.takeIf { it in setOf("year", "year-month", "date", "time", "datetime") } ?: "date"
        val nextStart = config.minYear.toInt().coerceIn(1, 9999)
        val nextEnd = config.maxYear.toInt().coerceIn(nextStart, 9999)
        val echoed = isEcho(config.value)
        if (configured && mode == nextMode && start == nextStart && end == nextEnd &&
            (echoed || config.value == parts.format(mode))) return
        stopWheels()
        if (mode != nextMode) timeTab = false
        mode = nextMode
        start = nextStart
        end = nextEnd
        parts = (if (echoed) parts else WheelDate.parse(config.value, parts)).clamp(start, end)
        configured = true
        render()
    }

    private fun render() {
        val wheelMode = if (mode == "datetime") { if (timeTab) "time" else "date" } else mode
        showSegments(if (mode == "datetime") listOf("日期  ${parts.format("date")}", "时间  ${parts.format("time")}") else emptyList(),
            if (timeTab) 1 else 0) { tab ->
            if (timeTab != (tab == 1)) {
                val values = visibleValues()
                stopWheels()
                val next = parts.settle(wheelMode, values, start, end)
                val changed = next != parts
                parts = next
                timeTab = tab == 1
                render()
                if (changed) emit(parts.format(mode))
            }
        }
        val descriptions = if (wheelMode == "time") listOf("小时", "分钟") else listOf("年份", "月份", "日期")
        showColumns(parts.columns(wheelMode, start, end), parts.selected(wheelMode), descriptions) { index, value ->
            val next = parts.change(wheelMode, index, value.toInt(), start, end)
            if (next != parts) {
                parts = next
                render()
                emit(parts.format(mode))
            }
        }
    }
    override fun resetSelection() {
        mode = "date"; start = 1; end = 9999; parts = WheelDate.now(); timeTab = false; configured = false
    }
}

@Keep
class TreeWheelView(context: Context) : ValdiWheelView(context) {
    private var data = emptyList<WheelNode>()
    private var columns = 3
    private var path = emptyList<String>()
    private var configured = false

    override fun applyUntyped(config: Any?) = applyDecoded(TreeWheelConfig::class.java, config, ::apply)
    fun apply(config: TreeWheelConfig) {
        fun snapshot(node: WheelTreeNode): WheelNode = WheelNode(node.value, node.label, node.children?.map(::snapshot).orEmpty())
        val nextData = config.data.map(::snapshot)
        val nextColumns = config.columns.toInt().coerceAtLeast(1)
        val echoed = isEcho(config.value)
        if (configured && data == nextData && columns == nextColumns && (path == config.value || echoed)) return
        stopWheels()
        data = nextData
        columns = nextColumns
        path = normalizeWheelPath(data, if (echoed) path else config.value, columns)
        configured = true
        render()
    }

    private fun render() {
        val options = wheelTreeColumns(data, path, columns)
        showColumns(options, path, options.indices.map { "第${it + 1}级" }) { index, value ->
            val next = replaceWheelPath(data, path, index, value, columns)
            if (next != path) { path = next; render(); emit(path) }
        }
    }
    override fun resetSelection() { data = emptyList(); columns = 3; path = emptyList(); configured = false }
}
