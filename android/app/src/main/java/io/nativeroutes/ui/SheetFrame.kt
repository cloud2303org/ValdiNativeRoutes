// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/SheetFrame.kt).
package io.nativeroutes.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.max
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Dialog as WindowDialog
import androidx.core.view.WindowCompat
import io.valdiroutes.app.SheetHostView

/** Internal body policies; callers choose a dedicated sheet component. */
internal enum class SheetLayout { Content, Scroll, List }

/** Page-scoped window retained until the native sheet's closing spring settles. */
@Composable
internal fun SheetFrame(open: Boolean, onOpenChange: (Boolean, SheetDismissReason) -> Unit, dismissible: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {}, title: String? = null, description: String? = null,
    layout: SheetLayout = SheetLayout.Content, showHandle: Boolean = true,
    edgeToEdge: Boolean = false, showCloseButton: Boolean = false, footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit) {
    val presentation = rememberPresentation(open, dismissible, SheetDismissReason.Back, SheetDismissReason.Navigation, onOpenChange, onClosed)
    val current = presentation.id ?: return
    key(current) {
        WindowDialog(onDismissRequest = {}, properties = DialogProperties(
            dismissOnBackPress = false, dismissOnClickOutside = false,
            usePlatformDefaultWidth = false, decorFitsSystemWindows = false,
        )) {
            NotifyOverlayWindowAttached(current)
            val back = rememberOverlayBack { presentation.requestClose(SheetDismissReason.Back) }
            BackHandler(onBack = back)
            val view = LocalView.current
            val window = (view.parent as? DialogWindowProvider)?.window
            val colors = uiColors()
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
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val density = LocalDensity.current
                val safe = WindowInsets.statusBars.union(WindowInsets.displayCutout)
                val available = (constraints.maxHeight - safe.getTop(density)).coerceAtLeast(0)
                val keyboard = WindowInsets.ime.getBottom(density)
                // Keep the normal 85% cap while moving the panel above the IME. Only shrink
                // when the remaining viewport is smaller; the scrim still fills the window.
                val limitPx = minOf(available * 0.85f, (available - keyboard).coerceAtLeast(0).toFloat())
                val limit = with(density) { limitPx.toDp() }
                val composition = rememberCompositionContext()
                val dragOwners = remember { SheetDragOwners() }
                val panel = rememberUpdatedState<@Composable () -> Unit> {
                    SheetPanel(presentation.interactive, title, description, layout, showHandle, edgeToEdge,
                        showCloseButton, { presentation.requestClose(SheetDismissReason.CloseButton) }, footer, limit, content)
                }
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        SheetHostView(context).apply {
                            // The existing Compose header owns the only handle, including showHandle=false.
                            this.showHandle = false
                            measureContent = true
                            setContent(SheetComposeView(context, dragOwners, panel, this).apply {
                                setParentCompositionContext(composition)
                            })
                            onDismissRequest = { presentation.requestClose(SheetDismissReason.Gesture) }
                            this.onClosed = { presentation.finish(current) }
                        }
                    },
                    update = { host ->
                        host.surfaceColor = colors.surface.toArgb()
                        host.scrimColor = colors.scrim.toArgb()
                        host.cornerRadius = with(density) { UiDesign.radius.sheet.dp.toPx() }
                        host.openHeight = limitPx
                        host.bottomInset = keyboard
                        host.dismissible = dismissible && presentation.top
                        host.interactionEnabled = open && presentation.top
                        if (!open) host.dismiss()
                    },
                    onRelease = { host ->
                        host.onClosed = null
                        host.onDismissRequest = null
                        host.removeContent()
                    },
                )
            }
        }
    }
}

@Composable
private fun SheetPanel(interactive: Boolean, title: String?, description: String?, layout: SheetLayout,
    showHandle: Boolean, edgeToEdge: Boolean, showCloseButton: Boolean, onClose: () -> Unit,
    footer: (@Composable () -> Unit)?, limit: Dp, content: @Composable ColumnScope.() -> Unit) {
    val density = LocalDensity.current
    // Keep content geometry stable throughout IME animation. Switching this gap on the
    // first non-zero IME frame changes the sheet height and its expanded anchor abruptly.
    val bottom = with(density) { max(WindowInsets.navigationBars.getBottom(density).toDp(), UiDesign.space.lg.dp) }
    Box {
        Column(Modifier.fillMaxWidth()
            .then(if (layout == SheetLayout.List) Modifier.height(limit) else Modifier.heightIn(max = limit))
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
            .padding(bottom = if (edgeToEdge) 0.dp else bottom)
            .then(if (interactive) Modifier else Modifier.semantics { hideFromAccessibility() })) {
            if (showHandle || title != null || description != null) SheetHeader(title, description, showHandle)
            val spacing = Arrangement.spacedBy(UiDesign.space.lg.dp)
            when (layout) {
                SheetLayout.Content -> Column(Modifier.weight(1f, fill = false).padding(horizontal = if (edgeToEdge) 0.dp else UiDesign.space.content.dp),
                    verticalArrangement = spacing, content = content)
                SheetLayout.Scroll -> Column(Modifier.weight(1f, fill = false).sheetNestedScroll().verticalScroll(rememberScrollState())
                    .padding(horizontal = if (edgeToEdge) 0.dp else UiDesign.space.content.dp), verticalArrangement = spacing, content = content)
                SheetLayout.List -> Column(Modifier.weight(1f).sheetNestedScroll(), content = content)
            }
            footer?.let { Box(Modifier.padding(horizontal = if (edgeToEdge) 0.dp else UiDesign.space.content.dp).padding(top = if (edgeToEdge) 0.dp else UiDesign.space.lg.dp)) { it() } }
        }
        if (showCloseButton) Box(Modifier.align(Alignment.TopEnd).padding(UiDesign.component.overlay.closeInset.dp).size(UiDesign.component.overlay.closeSize.dp)
            .clip(CircleShape).background(uiColors().floatingCloseFill)
            .border(UiDesign.space.hairline.dp, uiColors().floatingCloseBorder, CircleShape)
            .clickable(enabled = interactive, onClick = onClose).semantics { contentDescription = "关闭展示" },
            contentAlignment = Alignment.Center) { UiIcon(UiIconKind.Close, tint = UiDesign.media.text,
                modifier = Modifier.size(UiDesign.component.overlay.closeIcon.dp)) }
        if (!interactive) Box(Modifier.matchParentSize().pointerInput(Unit) {
            awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } }
        })
    }
}
