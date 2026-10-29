package io.valdiroutes.app

import android.content.Context
import android.view.MotionEvent
import android.widget.FrameLayout
import androidx.annotation.Keep
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.snap.valdi.attributes.AttributesBinder
import com.snap.valdi.attributes.AttributesBindingContext
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.views.ValdiTouchEventResult
import com.snap.valdi.views.ValdiTouchTarget
import io.nativeroutes.ui.ColumnPicker
import io.nativeroutes.ui.LocalUiAppearance
import io.nativeroutes.ui.PickerOption
import io.nativeroutes.ui.PickerPresentation
import io.nativeroutes.ui.TimePickMode
import io.nativeroutes.ui.TimePicker
import io.nativeroutes.ui.TreeNode
import io.nativeroutes.ui.TreePicker
import io.nativeroutes.ui.UiAppearance
import org.json.JSONArray
import org.json.JSONObject

/**
 * The native wheels a Valdi page embeds with `<custom-view>` (WheelPickers.tsx), drawn by io.nativeroutes.ui as
 * in the presented pickers. `config` is JSON, checked and normalized in TS (schemas.ts); `onChange` gets the selection as a
 * string only when the user settles the wheel. The Compose wheels also report their first selection, so nothing is
 * sent before a touch. A value the page passes back unchanged leaves the wheel as is, and so does one it passes back
 * late, after the wheel has moved on (isEcho).
 * Created by class name, so @Keep for R8; their binders are registered in ValdiHost.init.
 *
 * Valdi's root view dispatches touches itself: a native view only gets them as a ValdiTouchTarget. A wheel takes every
 * touch that starts on it, so neither a Valdi scroll view nor the sheet around the page (OwnsVerticalDrags) moves with it.
 */
abstract class ValdiWheelView(context: Context) : FrameLayout(context), ValdiTouchTarget, OwnsVerticalDrags {
    var onChange: ValdiFunction? = null
    /** Set by the first touch; until then a change is the wheel showing its config, not the user's choice. */
    private var touched = false
    /**
     * What emit sent that the page hasn't rendered back yet. The page passes each one back a JS round trip later; a
     * wheel turned through several rows meanwhile would be sent back to an earlier row by it.
     */
    private val unechoed = ArrayDeque<String>()
    private var echoed: String? = null
    private val compose = ComposeView(context).also { addView(it) }

    /** Valdi pages are light only. */
    protected fun setWheel(content: @Composable () -> Unit) {
        compose.setContent { CompositionLocalProvider(LocalUiAppearance provides UiAppearance.Light, content = content) }
    }

    abstract fun apply(config: JSONObject)

    protected fun emit(value: String) {
        if (!touched) return
        val function = onChange ?: return
        unechoed.addLast(value)
        ValdiMarshaller.use {
            it.pushString(value)
            function.perform(it)
        }
    }

    /**
     * Whether [value] (as emit sends it) is the page rendering back one of the wheel's own selections, which the wheel
     * shows already or has turned past; apply then leaves the wheel as is. Any other value is the page's own, which the
     * wheel follows.
     */
    protected fun isEcho(value: String): Boolean {
        val index = unechoed.indexOf(value)
        if (index >= 0) {
            repeat(index + 1) { unechoed.removeFirst() }
            echoed = value
            return true
        }
        // The page rendering again, for another reason, the last value it took from the wheel, while newer ones are on
        // their way.
        if (value == echoed && unechoed.isNotEmpty()) return true
        unechoed.clear()
        echoed = null
        return false
    }

    override fun processTouchEvent(event: MotionEvent): ValdiTouchEventResult {
        // Valdi cancels its own gestures; the views outside it (Compose's sheet) are told here.
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            touched = true
            parent?.requestDisallowInterceptTouchEvent(true)
        }
        dispatchTouchEvent(event)
        return ValdiTouchEventResult.ConsumeEventAndCancelOtherGestures
    }

    // Valdi sets this view's frame; the wheel fills it.
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val width = right - left
        val height = bottom - top
        compose.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        compose.layout(0, 0, width, height)
    }
}

class ValdiWheelBinder<T : ValdiWheelView>(override val viewClass: Class<T>) : AttributesBinder<T> {
    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<T>) {
        attributesBindingContext.bindStringAttribute("config", false, { view, value, _ -> view.apply(JSONObject(value)) }, { _, _ -> })
        attributesBindingContext.bindFunctionAttribute("onChange", { view, function -> view.onChange = function }, { view -> view.onChange = null })
    }
}

/** `{options: [{value, label}], value}`; reports the chosen value. */
@Keep
class ColumnWheelView(context: Context) : ValdiWheelView(context) {
    private var options by mutableStateOf(emptyList<PickerOption>())
    private var value by mutableStateOf("")

    init {
        setWheel {
            ColumnPicker(true, options, value, { _, _ -> }, {}, presentation = PickerPresentation.Content, onValueChange = ::changed)
        }
    }

    private fun changed(next: String) {
        if (next == value) return
        value = next
        emit(next)
    }

    override fun apply(config: JSONObject) {
        val items = config.optJSONArray("options") ?: JSONArray()
        val options = (0 until items.length()).map { items.getJSONObject(it) }.map {
            val value = it.getString("value")
            PickerOption(value, it.optString("label", value))
        }
        val requested = config.optString("value")
        val echo = isEcho(requested)
        if (options == this.options && (requested == value || echo)) return
        this.options = options
        if (!echo) value = requested
    }
}

/** `{mode, value, minYear, maxYear}` with the modes of api.showDatePicker; reports the formatted value. */
@Keep
class TimeWheelView(context: Context) : ValdiWheelView(context) {
    private var mode by mutableStateOf(TimePickMode.Date)
    private var minYear by mutableStateOf<Int?>(null)
    private var maxYear by mutableStateOf<Int?>(null)
    private var value by mutableStateOf("")

    init {
        setWheel {
            TimePicker(true, mode, value, { _, _ -> }, {}, minYear = minYear, maxYear = maxYear,
                presentation = PickerPresentation.Content, onValueChange = ::changed)
        }
    }

    private fun changed(next: String) {
        if (next == value) return
        value = next
        emit(next)
    }

    override fun apply(config: JSONObject) {
        mode = when (config.optString("mode")) {
            "year" -> TimePickMode.Year
            "year-month" -> TimePickMode.YearMonth
            "time" -> TimePickMode.Time
            "datetime" -> TimePickMode.DateTime
            else -> TimePickMode.Date
        }
        minYear = if (config.has("minYear")) config.getInt("minYear") else null
        maxYear = if (config.has("maxYear")) config.getInt("maxYear") else null
        val requested = config.optString("value")
        if (!isEcho(requested)) value = requested
    }
}

/** `{data: [{value, label, children}], value: [String], columns}`; reports the path as a JSON array. */
@Keep
class TreeWheelView(context: Context) : ValdiWheelView(context) {
    private var data by mutableStateOf(emptyList<TreeNode>())
    private var columns by mutableStateOf(3)
    private var path by mutableStateOf(emptyList<String>())

    init {
        setWheel {
            TreePicker(true, data, path, { _, _ -> }, {}, columns = columns, presentation = PickerPresentation.Content,
                onValueChange = { next, _ -> changed(next) })
        }
    }

    private fun changed(next: List<String>) {
        if (next == path) return
        path = next
        emit(JSONArray(next).toString())
    }

    override fun apply(config: JSONObject) {
        fun nodes(items: JSONArray?): List<TreeNode> = (0 until (items?.length() ?: 0)).map { items!!.getJSONObject(it) }.map {
            val value = it.getString("value")
            TreeNode(value, it.optString("label", value), nodes(it.optJSONArray("children")))
        }
        data = nodes(config.optJSONArray("data"))
        columns = config.optInt("columns", 3)
        val values = config.optJSONArray("value") ?: JSONArray()
        val requested = (0 until values.length()).map { values.getString(it) }
        if (!isEcho(JSONArray(requested).toString())) path = requested
    }
}
