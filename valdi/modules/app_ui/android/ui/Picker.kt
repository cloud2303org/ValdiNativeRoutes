package io.valdiroutes.app_ui.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Dialog as WindowDialog
import io.valdiroutes.app_ui.ui.NativeWheelPalette
import io.valdiroutes.app_ui.ui.WheelItem

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
    val state = remember(open, options, value) {
        NativeColumnPickerState(options.map { WheelItem(it.value, it.label) }, value)
    }
    val handle = remember { NativePickerHandle() }
    var revision by remember(state) { mutableIntStateOf(0) }
    val draft = remember(state, revision) { state.value }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(open, draft, options, presentation) {
        if (open || presentation == PickerPresentation.Content) changed?.invoke(draft)
    }
    PickerHost(open, title, description, confirmText, cancelText, presentation, { next, reason ->
        if (!next) handle.cancel()
        onOpenChange(next, reason)
    }, {
        handle.settle()
        onConfirm(state.value)
        handle.cancel()
        onOpenChange(false, SheetDismissReason.Back)
    }, onClosed = onClosed) {
        NativePickerBody(state, handle, open, presentation) { revision++ }
    }
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
    val tab = remember(open) { NativePickerSegment() }
    val state = remember(open, mode, value, minYear, maxYear) {
        NativeTimePickerState(mode, value, minYear, maxYear, tab = tab)
    }
    val handle = remember { NativePickerHandle() }
    var revision by remember(state) { mutableIntStateOf(0) }
    val draft = remember(state, revision) { state.value }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(open, mode, draft, presentation) {
        if (open || presentation == PickerPresentation.Content) changed?.invoke(draft)
    }
    PickerHost(open, title, description, confirmText, cancelText, presentation, { next, reason ->
        if (!next) handle.cancel()
        onOpenChange(next, reason)
    }, {
        handle.settle()
        onConfirm(state.value)
        handle.cancel()
        onOpenChange(false, SheetDismissReason.Back)
    }, onClosed = onClosed) {
        NativePickerBody(state, handle, open, presentation) { revision++ }
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
    val state = remember(open, data, value, columns, presentation) {
        NativeTreePickerState(data.map { it.nativeNode() }, value, columns, presentation == PickerPresentation.Page)
    }
    val handle = remember { NativePickerHandle() }
    var revision by remember(state) { mutableIntStateOf(0) }
    val draft = remember(state, revision) { state.value }
    val changed by rememberUpdatedState(onValueChange)
    LaunchedEffect(open, draft, data, columns, presentation) {
        if (open || presentation == PickerPresentation.Content) changed?.invoke(draft, state.complete)
    }
    PickerHost(open, title, description, confirmText, cancelText, presentation, { next, reason ->
        if (!next) handle.cancel()
        onOpenChange(next, reason)
    }, {
        handle.settle()
        onConfirm(state.value)
        handle.cancel()
        onOpenChange(false, SheetDismissReason.Back)
    }, state.complete) {
        NativePickerBody(state, handle, open, presentation) { revision++ }
    }
}

/** Compose only mounts and themes a native body; all picker controls are Android Views. */
@Composable
private fun NativePickerBody(
    state: NativePickerState<*>,
    handle: NativePickerHandle,
    open: Boolean,
    presentation: PickerPresentation,
    changed: () -> Unit,
) {
    val colors = uiColors()
    val palette = NativeWheelPalette(colors.text.toArgb(), colors.subtle.toArgb(), colors.border.toArgb(),
        colors.surface.toArgb(), colors.primary.toArgb(), colors.muted.toArgb(), colors.hairline.toArgb())
    val active = open || presentation == PickerPresentation.Content
    if (state is NativeTreePickerState && state.page) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { NativeTreePageView(it).also { view -> handle.body = view } },
            update = { it.bind(state, palette, active, changed) },
            onRelease = { handle.release(it) },
        )
    } else {
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(if (state.segments.isEmpty()) 200.dp else 244.dp)
                .ownsSheetVerticalDrags(),
            factory = { NativePopupWheelView(it).also { view -> handle.body = view } },
            update = { it.bind(state, palette, active, changed) },
            onRelease = { handle.release(it) },
        )
    }
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
                    // The full-screen picker keeps its theme's default bar-icon appearance; no override here.
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
