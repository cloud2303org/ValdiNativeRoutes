// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/Picker.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.core.view.WindowCompat
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.activity.compose.BackHandler
import androidx.compose.ui.window.Dialog as WindowDialog
import kotlin.math.abs
import kotlin.math.sin

/** Content embeds the native picker without creating a window, header or footer. */
enum class PickerPresentation { Sheet, Page, Content }

data class PickerOption(val value: String, val label: String)
data class TreeNode(val value: String, val label: String, val children: List<TreeNode> = emptyList())
enum class TimePickMode { Year, YearMonth, Date, Time, DateTime }

fun List<String>.asPickerOptions() = map { PickerOption(it, it) }

@Composable
fun ColumnPicker(
    open: Boolean,
    options: List<PickerOption>,
    value: String? = null,
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    onConfirm: (String) -> Unit,
    title: String? = null,
    description: String? = null,
    confirmText: String = "确定",
    cancelText: String = "取消",
    onClosed: (OverlayCloseReason) -> Unit = {},
    presentation: PickerPresentation = PickerPresentation.Sheet,
    onValueChange: ((String) -> Unit)? = null,
) {
    var draft by remember(open, options, value) { mutableStateOf(optionValue(options, value)) }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(draft, options) { changed?.invoke(draft) }
    PickerHost(open, title, description, confirmText, cancelText, presentation, onOpenChange, {
        onConfirm(draft)
        onOpenChange(false, SheetDismissReason.Back)
    }, onClosed = onClosed) { Wheel(options, draft) { draft = it } }
}

@Composable
fun TimePicker(
    open: Boolean,
    mode: TimePickMode = TimePickMode.DateTime,
    value: String? = null,
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    onConfirm: (String) -> Unit,
    title: String? = null,
    description: String? = null,
    minYear: Int? = null,
    maxYear: Int? = null,
    confirmText: String = "确定",
    cancelText: String = "取消",
    onClosed: (OverlayCloseReason) -> Unit = {},
    presentation: PickerPresentation = PickerPresentation.Sheet,
    onValueChange: ((String) -> Unit)? = null,
) {
    val year = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
    val start = minYear ?: year - 5
    val end = maxYear ?: year + 5
    var parts by remember(open, mode, value, start, end) {
        mutableStateOf(clamp(parseTime(value), start, end))
    }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(mode, parts) { changed?.invoke(formatTime(mode, parts)) }
    var timeTab by remember(open) { mutableStateOf(false) }
    PickerHost(open, title, description, confirmText, cancelText, presentation, onOpenChange, {
        onConfirm(formatTime(mode, parts))
        onOpenChange(false, SheetDismissReason.Back)
    }, onClosed = onClosed) {
        // Own the compact spacing rather than inheriting the generic sheet's 16dp gaps.
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (mode == TimePickMode.DateTime) {
                TimePickerSegments(timeTab, parts) { timeTab = it }
            }
            val wheelMode = if (mode == TimePickMode.DateTime) {
                if (timeTab) TimePickMode.Time else TimePickMode.Date
            } else mode
            key(wheelMode) {
                TimePickerWheels(wheelMode, parts, start, end) { index, next ->
                    parts = clamp(applyColumn(wheelMode, parts, index, next), start, end)
                }
            }
        }
    }
}

@Composable
private fun TimePickerWheels(mode: TimePickMode, parts: TimeParts, start: Int, end: Int, onChange: (Int, String) -> Unit) {
    val columns = timeColumns(mode, parts, start, end)
    val selected = selectedValues(mode, parts)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp)) {
        columns.forEachIndexed { index, column ->
            Wheel(column, selected[index], Modifier.weight(1f)) { next -> onChange(index, next) }
        }
    }
}

@Composable
private fun TimePickerSegments(timeTab: Boolean, parts: TimeParts, onSelect: (Boolean) -> Unit) {
    val colors = uiColors()
    val inset = 2.dp
    val trackRadius = UiDesign.radius.control.dp
    val trackShape = RoundedCornerShape(trackRadius)
    // Concentric corners keep the gap even around the selected thumb.
    val thumbShape = RoundedCornerShape((trackRadius - inset).coerceAtLeast(0.dp))
    BoxWithConstraints(Modifier.fillMaxWidth().height(40.dp)
        .clip(trackShape).background(colors.subtle, trackShape).padding(inset)) {
        val segmentWidth = maxWidth / 2
        val offset by animateDpAsState(if (timeTab) segmentWidth else 0.dp,
            tween(220, easing = FastOutSlowInEasing), label = "picker-tab-indicator")
        Box(Modifier.offset(x = offset).width(segmentWidth).fillMaxHeight()
            .clip(thumbShape).background(colors.surface, thumbShape))
        Row(Modifier.fillMaxSize()) {
            listOf(false, true).forEach { time ->
                val active = timeTab == time
                val textColor by animateColorAsState(if (active) colors.primary else colors.muted, tween(160), label = "picker-tab-text")
                Box(Modifier.weight(1f).fillMaxHeight().clip(thumbShape)
                    .semantics { selected = active }.clickable(role = Role.Tab,
                        interactionSource = remember { MutableInteractionSource() }, indication = null) { onSelect(time) }
                    .padding(horizontal = 8.dp),
                    contentAlignment = Alignment.Center) {
                    Text(if (time) "时间  ${formatTime(TimePickMode.Time, parts)}" else "日期  ${formatTime(TimePickMode.Date, parts)}",
                        color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
    }
}

@Composable
fun TreePicker(
    open: Boolean,
    data: List<TreeNode>,
    value: List<String> = emptyList(),
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    onConfirm: (List<String>) -> Unit,
    title: String? = null,
    description: String? = null,
    columns: Int = 3,
    presentation: PickerPresentation = PickerPresentation.Sheet,
    confirmText: String = "确定",
    cancelText: String = "取消",
    onValueChange: ((List<String>, Boolean) -> Unit)? = null,
) {
    var path by remember(open, data, value, columns) { mutableStateOf(if (presentation == PickerPresentation.Page) validPath(data, value, columns) else normalizePath(data, value, columns)) }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(path, data, columns) { changed?.invoke(path, path.isNotEmpty() && treeColumns(data, path, columns).size == path.size) }
    val body: @Composable ColumnScope.() -> Unit = {
        if (presentation == PickerPresentation.Page) {
            TreeCascade(open, data, path, columns) { path = it }
        } else {
            val visible = treeColumns(data, path, columns)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp)) {
                visible.forEachIndexed { index, column ->
                    Wheel(column, path.getOrElse(index) { "" }, Modifier.weight(1f)) { next ->
                        path = replacePath(data, path, index, next, columns)
                    }
                }
            }
        }
    }
    PickerHost(open, title, description, confirmText, cancelText, presentation, onOpenChange, {
        onConfirm(path)
        onOpenChange(false, SheetDismissReason.Back)
    }, path.isNotEmpty() && treeColumns(data, path, columns).size == path.size, content = body)
}

fun treeLabels(data: List<TreeNode>, path: List<String>): List<String> {
    val labels = mutableListOf<String>()
    var level = data
    for (value in path) {
        val node = level.find { it.value == value } ?: break
        labels += node.label
        level = node.children
    }
    return labels
}

@Composable
private fun PickerHost(
    open: Boolean,
    title: String?,
    description: String?,
    confirmText: String,
    cancelText: String,
    presentation: PickerPresentation,
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val actions = @Composable {
        PopupActionButtons(onCancel = { onOpenChange(false, SheetDismissReason.Cancel) }, onConfirm = onConfirm,
            cancelText = cancelText, confirmText = confirmText, confirmDisabled = !confirmEnabled)
    }
    if (presentation == PickerPresentation.Content) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(UiDesign.space.lg.dp), content = content)
    } else if (presentation == PickerPresentation.Page) {
        PickerPage(open, title, onOpenChange, confirmText, cancelText, confirmEnabled, onConfirm, onClosed, content)
    } else {
        BottomSheet(open = open, title = title, description = description, onOpenChange = onOpenChange,
            onClosed = onClosed, footer = actions, content = content)
    }
}

@Composable
private fun PickerPage(
    open: Boolean,
    title: String?,
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    confirmText: String,
    cancelText: String,
    confirmEnabled: Boolean,
    onConfirm: () -> Unit,
    onClosed: (OverlayCloseReason) -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val presentation = rememberPresentation(open, true, SheetDismissReason.Back, SheetDismissReason.Navigation, onOpenChange, onClosed)
    val currentId = presentation.id ?: return
    val colors = uiColors()
    key(currentId) {
        LaunchedEffect(open) { if (!open) presentation.finish(currentId) }
        WindowDialog(onDismissRequest = {}, properties = DialogProperties(
            dismissOnBackPress = false, dismissOnClickOutside = false, usePlatformDefaultWidth = false, decorFitsSystemWindows = false,
        )) {
            NotifyOverlayWindowAttached(currentId)
            val back = rememberOverlayBack { presentation.requestClose(SheetDismissReason.Back) }
            BackHandler(onBack = back)
            val view = LocalView.current
            val window = (view.parent as? DialogWindowProvider)?.window
            SideEffect {
                window?.let {
                    it.setDimAmount(0f)
                    it.setWindowAnimations(0)
                    WindowCompat.getInsetsController(it, view).apply {
                        isAppearanceLightStatusBars = colors.surface.luminance() > 0.5f
                        isAppearanceLightNavigationBars = colors.surface.luminance() > 0.5f
                    }
                }
            }
            Column(Modifier.fillMaxSize().background(colors.surface).windowInsetsPadding(WindowInsets.safeDrawing)) {
                Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = UiDesign.space.sm.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { presentation.requestClose(SheetDismissReason.Cancel) }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp)) {
                            UiIcon(UiIconKind.Back, tint = colors.muted, modifier = Modifier.size(16.dp))
                            Text(cancelText, color = colors.muted)
                        }
                    }
                    Text(title ?: "选择地区", Modifier.weight(1f), textAlign = TextAlign.Center, color = colors.text,
                        fontSize = UiDesign.font.subheading.sp, fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = onConfirm, enabled = confirmEnabled) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp)) {
                            UiIcon(UiIconKind.Check,
                                tint = if (confirmEnabled) colors.primary else colors.muted.copy(alpha = 0.45f),
                                modifier = Modifier.size(16.dp))
                            Text(confirmText, color = if (confirmEnabled) colors.primary else colors.muted.copy(alpha = 0.45f))
                        }
                    }
                }
                HorizontalDivider(thickness = 0.5.dp, color = colors.hairline)
                Column(Modifier.weight(1f).fillMaxWidth(), content = content)
            }
        }
    }
}

private val treeLevelHints = listOf("省份", "城市", "区县", "街道")

@Composable
private fun TreeCascade(open: Boolean, data: List<TreeNode>, path: List<String>, maxColumns: Int, onChange: (List<String>) -> Unit) {
    val colors = uiColors()
    val columns = treeColumns(data, path, maxColumns)
    val labels = treeLabels(data, path)
    val last = (columns.size - 1).coerceAtLeast(0)
    var level by remember(open, last) { mutableIntStateOf(last) }
    val current = level.coerceAtMost(last)
    val options = columns.getOrElse(current) { emptyList() }
    val selected = path.getOrElse(current) { "" }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(colors.surface).padding(horizontal = UiDesign.space.lg.dp)) {
            columns.forEachIndexed { index, _ ->
                val active = index == current
                Box(Modifier.weight(1f, fill = false).width(88.dp).height(48.dp).clickable { level = index }) {
                    Text(labels.getOrElse(index) { "请选择" },
                        Modifier.align(Alignment.Center).padding(horizontal = UiDesign.space.sm.dp),
                        color = if (active) colors.primary else colors.muted,
                        fontSize = UiDesign.font.content.sp, lineHeight = UiDesign.font.contentLine.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(2.dp)
                        .background(if (active) colors.primary else Color.Transparent))
                }
            }
        }
        HorizontalDivider(thickness = 0.5.dp, color = colors.hairline)
        Row(Modifier.fillMaxWidth().padding(start = UiDesign.space.content.dp, end = UiDesign.space.content.dp, top = UiDesign.space.content.dp, bottom = UiDesign.space.md.dp),
            horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp)) {
                UiIcon(UiIconKind.Location, tint = colors.muted, modifier = Modifier.size(14.dp))
                Text("选择" + treeLevelHints.getOrElse(current) { "地区" }, color = colors.muted, fontSize = UiDesign.font.body.sp)
            }
            Text("${options.size} 项", color = colors.muted, fontSize = UiDesign.font.body.sp)
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth().background(colors.surface)) {
            if (options.isEmpty()) {
                item {
                    Text("这一级没有选项", Modifier.fillMaxWidth().padding(vertical = UiDesign.space.wide.dp),
                        color = colors.muted, textAlign = TextAlign.Center)
                }
            }
            items(options.size, key = { options[it].value }) { row ->
                val option = options[row]
                val checked = option.value == selected
                Row(Modifier.fillMaxWidth().clickable {
                    val next = validPath(data, path.take(current) + option.value, maxColumns)
                    onChange(next)
                    if (current + 1 < treeColumns(data, next, maxColumns).size) level = current + 1
                }.padding(horizontal = UiDesign.space.content.dp).height(56.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(option.label, Modifier.weight(1f), color = if (checked) colors.primary else colors.text,
                        fontSize = UiDesign.font.control.sp, lineHeight = UiDesign.font.valueLine.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                        overflow = TextOverflow.Ellipsis)
                    if (checked) UiIcon(UiIconKind.Check, tint = colors.primary, modifier = Modifier.size(20.dp))
                }
                HorizontalDivider(thickness = 0.5.dp, color = colors.border)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Wheel(options: List<PickerOption>, value: String, modifier: Modifier = Modifier, rows: Int = 5, onChange: (String) -> Unit) {
    val colors = uiColors()
    val index = options.indexOfFirst { it.value == value }.coerceAtLeast(0)
    val state = rememberLazyListState(index)
    val latestOptions by rememberUpdatedState(options)
    val latestValue by rememberUpdatedState(value)
    val changed by rememberUpdatedState(onChange)
    val pad = 40.dp * ((rows - 1) / 2)
    LaunchedEffect(index, options) { state.scrollToItem(index) }
    LaunchedEffect(state.isScrollInProgress) {
        if (!state.isScrollInProgress) {
            val next = state.firstVisibleItemIndex.coerceIn(0, (options.size - 1).coerceAtLeast(0))
            options.getOrNull(next)?.let { if (it.value != value) onChange(it.value) }
        }
    }
    DisposableEffect(state) {
        onDispose {
            // A tab transition may remove a wheel before its snap finishes. Preserve
            // the closest visible row rather than reverting to the previous draft.
            if (state.isScrollInProgress) {
                val rowHeight = state.layoutInfo.visibleItemsInfo.firstOrNull()?.size ?: 0
                val extra = if (rowHeight > 0 && state.firstVisibleItemScrollOffset >= rowHeight / 2) 1 else 0
                latestOptions.getOrNull(state.firstVisibleItemIndex + extra)?.let {
                    if (it.value != latestValue) changed(it.value)
                }
            }
        }
    }
    // A wheel owns its drags: one that reaches the first row stops there instead of pulling the sheet down.
    Box(modifier.height(40.dp * rows).nestedScroll(WheelOwnsDrags)) {
        Box(Modifier.align(Alignment.Center).fillMaxWidth().height(40.dp)
            .clip(RoundedCornerShape(UiDesign.radius.control.dp)).background(colors.subtle).border(0.5.dp, colors.border, RoundedCornerShape(UiDesign.radius.control.dp)))
        LazyColumn(Modifier.fillMaxSize()
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithCache {
                // A continuous viewport mask, like UIPickerView's fading edges.
                // DstIn preserves the surface beneath it in either appearance.
                val fade = Brush.verticalGradient(
                    0f to Color.Transparent, 0.34f to Color.Black.copy(alpha = 0.45f),
                    0.45f to Color.Black, 0.55f to Color.Black,
                    0.66f to Color.Black.copy(alpha = 0.45f), 1f to Color.Transparent,
                    startY = 0f, endY = size.height,
                )
                onDrawWithContent {
                    drawContent()
                    drawRect(fade, blendMode = BlendMode.DstIn)
                }
            }, state, contentPadding = PaddingValues(vertical = pad),
            flingBehavior = rememberSnapFlingBehavior(state), horizontalAlignment = Alignment.CenterHorizontally) {
            items(options.size, key = { options[it].value }) { row ->
                val option = options[row]
                Box(Modifier.fillMaxWidth().height(40.dp).graphicsLayer {
                    // Project the continuous scroll position onto a cylinder. Reading scroll
                    // state here updates the layer without recomposing every row each frame.
                    val itemHeight = 40.dp.toPx()
                    val distance = (row - state.firstVisibleItemIndex) * itemHeight - state.firstVisibleItemScrollOffset
                    val radiansPerRow = (Math.PI / 6).toFloat()
                    val angle = distance / itemHeight * radiansPerRow
                    val radius = itemHeight / radiansPerRow
                    rotationX = -angle * (180 / Math.PI).toFloat()
                    translationY = radius * sin(angle) - distance
                    cameraDistance = itemHeight * 8
                    alpha = if (abs(angle) >= Math.PI / 2) 0f else 1f
                }, contentAlignment = Alignment.Center) {
                    Text(option.label, color = colors.text,
                        fontSize = UiDesign.font.control.sp, lineHeight = UiDesign.font.valueLine.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

private data class TimeParts(val year: Int, val month: Int, val day: Int, val hour: Int, val minute: Int)

private fun pad(value: Int) = value.toString().padStart(2, '0')
private fun daysInMonth(year: Int, month: Int) = java.util.Calendar.getInstance().apply {
    set(year, month - 1, 1); add(java.util.Calendar.MONTH, 1); add(java.util.Calendar.DAY_OF_MONTH, -1)
}.get(java.util.Calendar.DAY_OF_MONTH)

private fun parseTime(value: String?): TimeParts {
    val now = java.util.Calendar.getInstance()
    val fallback = TimeParts(now.get(java.util.Calendar.YEAR), now.get(java.util.Calendar.MONTH) + 1,
        now.get(java.util.Calendar.DAY_OF_MONTH), now.get(java.util.Calendar.HOUR_OF_DAY), now.get(java.util.Calendar.MINUTE))
    if (value.isNullOrEmpty()) return fallback
    val dateTime = Regex("""^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$""").matchEntire(value)
    if (dateTime != null) {
        val g = dateTime.groupValues
        return TimeParts(g[1].toInt(), g[2].toInt(), g[3].toInt(), g.getOrNull(4)?.toIntOrNull() ?: fallback.hour,
            g.getOrNull(5)?.toIntOrNull() ?: fallback.minute)
    }
    val yearMonth = Regex("""^(\d{4})-(\d{2})$""").matchEntire(value)
    if (yearMonth != null) return fallback.copy(year = yearMonth.groupValues[1].toInt(), month = yearMonth.groupValues[2].toInt())
    val year = Regex("""^(\d{4})$""").matchEntire(value)
    if (year != null) return fallback.copy(year = year.groupValues[1].toInt())
    val time = Regex("""^(\d{2}):(\d{2})$""").matchEntire(value)
    return if (time != null) fallback.copy(hour = time.groupValues[1].toInt(), minute = time.groupValues[2].toInt()) else fallback
}

private fun formatTime(mode: TimePickMode, parts: TimeParts) = when (mode) {
    TimePickMode.Year -> "${parts.year}"
    TimePickMode.YearMonth -> "${parts.year}-${pad(parts.month)}"
    TimePickMode.Date -> "${parts.year}-${pad(parts.month)}-${pad(parts.day)}"
    TimePickMode.Time -> "${pad(parts.hour)}:${pad(parts.minute)}"
    TimePickMode.DateTime -> "${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}"
}

private fun clamp(parts: TimeParts, minYear: Int, maxYear: Int): TimeParts {
    val year = parts.year.coerceIn(minYear, maxYear)
    val month = parts.month.coerceIn(1, 12)
    return parts.copy(year = year, month = month, day = parts.day.coerceIn(1, daysInMonth(year, month)))
}

private fun timeColumns(mode: TimePickMode, parts: TimeParts, minYear: Int, maxYear: Int): List<List<PickerOption>> {
    val years = (minYear..maxYear).map { PickerOption("$it", "${it}年") }
    val months = (1..12).map { PickerOption("$it", "${it}月") }
    val days = (1..daysInMonth(parts.year, parts.month)).map { PickerOption("$it", "${it}日") }
    val hours = (0..23).map { PickerOption("$it", "${pad(it)}时") }
    val minutes = (0..59).map { PickerOption("$it", "${pad(it)}分") }
    return when (mode) {
        TimePickMode.Year -> listOf(years)
        TimePickMode.YearMonth -> listOf(years, months)
        TimePickMode.Date -> listOf(years, months, days)
        TimePickMode.Time -> listOf(hours, minutes)
        TimePickMode.DateTime -> listOf(years, months, days, hours, minutes)
    }
}

private fun selectedValues(mode: TimePickMode, parts: TimeParts) = when (mode) {
    TimePickMode.Year -> listOf("${parts.year}")
    TimePickMode.YearMonth -> listOf("${parts.year}", "${parts.month}")
    TimePickMode.Date -> listOf("${parts.year}", "${parts.month}", "${parts.day}")
    TimePickMode.Time -> listOf("${parts.hour}", "${parts.minute}")
    TimePickMode.DateTime -> listOf("${parts.year}", "${parts.month}", "${parts.day}", "${parts.hour}", "${parts.minute}")
}

private fun applyColumn(mode: TimePickMode, parts: TimeParts, index: Int, value: String): TimeParts {
    val parsed = value.toInt()
    return if (mode == TimePickMode.Time) {
        if (index == 0) parts.copy(hour = parsed) else parts.copy(minute = parsed)
    } else when (index) {
        0 -> parts.copy(year = parsed)
        1 -> parts.copy(month = parsed)
        2 -> parts.copy(day = parsed)
        3 -> parts.copy(hour = parsed)
        else -> parts.copy(minute = parsed)
    }
}

private fun optionValue(options: List<PickerOption>, value: String?) =
    options.firstOrNull { it.value == value }?.value ?: options.firstOrNull()?.value.orEmpty()

private fun treeColumns(data: List<TreeNode>, path: List<String>, maxColumns: Int = 3): List<List<PickerOption>> {
    val columns = mutableListOf<List<PickerOption>>()
    var level = data
    var depth = 0
    while (level.isNotEmpty() && columns.size < maxColumns) {
        columns += level.map { PickerOption(it.value, it.label) }
        val selected = level.find { it.value == path.getOrNull(depth) } ?: break
        depth += 1
        level = selected.children
    }
    return columns
}

private fun normalizePath(data: List<TreeNode>, path: List<String>, maxColumns: Int = 3): List<String> {
    val next = mutableListOf<String>()
    var level = data
    var depth = 0
    while (level.isNotEmpty() && next.size < maxColumns) {
        val selected = level.find { it.value == path.getOrNull(depth) } ?: level.first()
        next += selected.value
        depth += 1
        level = selected.children
    }
    return next
}

private fun replacePath(data: List<TreeNode>, path: List<String>, index: Int, value: String, maxColumns: Int = 3) =
    normalizePath(data, path.take(index) + value, maxColumns)

private fun validPath(data: List<TreeNode>, path: List<String>, maxColumns: Int): List<String> {
    val next = mutableListOf<String>()
    var options = data
    for (value in path.take(maxColumns.coerceAtLeast(0))) {
        val node = options.find { it.value == value } ?: break
        next += value
        options = node.children
    }
    return next
}

/** Keeps a wheel's leftover scroll and fling from its parents (the sheet's nested scroll). */
private val WheelOwnsDrags = object : NestedScrollConnection {
    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource) = available
    override suspend fun onPostFling(consumed: Velocity, available: Velocity) = available
}
