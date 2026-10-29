// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/SheetFrame.kt).
package io.nativeroutes.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.max

/** Internal body policies; callers choose a dedicated sheet component. */
internal enum class SheetLayout { Content, Scroll, List }

/** Page-scoped sheet matching the RN `BottomSheet`. Programmatic close keeps the Dialog until hide() completes. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SheetFrame(open: Boolean, onOpenChange: (Boolean, SheetDismissReason) -> Unit, dismissible: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {}, title: String? = null, description: String? = null,
    layout: SheetLayout = SheetLayout.Content, showHandle: Boolean = true,
    edgeToEdge: Boolean = false, showCloseButton: Boolean = false, footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit) {
    val presentation = rememberPresentation(open, dismissible, SheetDismissReason.Back, SheetDismissReason.Navigation, onOpenChange, onClosed)
    val current = presentation.id ?: return
    key(current) {
        val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { value ->
            value != SheetValue.Hidden || !presentation.open || (presentation.dismissible && presentation.top)
        })
        LaunchedEffect(open) {
            if (open) state.show() else { state.hide(); presentation.finish(current) }
        }
        val colors = uiColors()
        ModalBottomSheet(
            onDismissRequest = { presentation.requestClose(SheetDismissReason.Gesture) },
            sheetState = state,
            properties = ModalBottomSheetProperties(shouldDismissOnBackPress = false),
            containerColor = colors.surface,
            scrimColor = colors.scrim,
            shape = RoundedCornerShape(topStart = UiDesign.radius.sheet.dp, topEnd = UiDesign.radius.sheet.dp),
            dragHandle = null,
            contentWindowInsets = { WindowInsets(0) },
        ) {
            NotifyOverlayWindowAttached(current)
            // The top overlay always consumes Back, including while it cannot be dismissed.
            val back = rememberOverlayBack { presentation.requestClose(SheetDismissReason.Back) }
            BackHandler(onBack = back)
            SheetPanel(presentation.interactive, title, description, layout, showHandle, edgeToEdge, showCloseButton,
                { presentation.requestClose(SheetDismissReason.CloseButton) }, footer, content)
        }
    }
}

@Composable
private fun SheetPanel(interactive: Boolean, title: String?, description: String?, layout: SheetLayout,
    showHandle: Boolean, edgeToEdge: Boolean, showCloseButton: Boolean, onClose: () -> Unit,
    footer: (@Composable () -> Unit)?, content: @Composable ColumnScope.() -> Unit) {
    val density = LocalDensity.current
    // Material owns IME movement. The content cap only shrinks to the remaining
    // viewport; do not switch from 85% to 100% on the first non-zero IME frame.
    val window = LocalWindowInfo.current.containerSize.height - WindowInsets.statusBars.getTop(density)
    val ime = WindowInsets.ime.getBottom(density)
    val limit = with(density) { minOf(window * 0.85f, (window - ime).coerceAtLeast(0).toFloat()).toDp() }
    // Keep content geometry stable throughout IME animation. Switching this gap on the
    // first non-zero IME frame changes the sheet height and its expanded anchor abruptly.
    val bottom = with(density) { max(WindowInsets.navigationBars.getBottom(density).toDp(), UiDesign.space.lg.dp) }
    Box {
        Column(Modifier.fillMaxWidth()
            .then(if (layout == SheetLayout.List) Modifier.height(limit) else Modifier.heightIn(max = limit))
            .padding(bottom = if (edgeToEdge) 0.dp else bottom)
            .then(if (interactive) Modifier else Modifier.semantics { hideFromAccessibility() })) {
            if (showHandle || title != null || description != null) SheetHeader(title, description, showHandle)
            val spacing = Arrangement.spacedBy(UiDesign.space.lg.dp)
            when (layout) {
                SheetLayout.Content -> Column(Modifier.weight(1f, fill = false).padding(horizontal = if (edgeToEdge) 0.dp else UiDesign.space.content.dp),
                    verticalArrangement = spacing, content = content)
                SheetLayout.Scroll -> Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())
                    .padding(horizontal = if (edgeToEdge) 0.dp else UiDesign.space.content.dp), verticalArrangement = spacing, content = content)
                SheetLayout.List -> Column(Modifier.weight(1f), content = content)
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
