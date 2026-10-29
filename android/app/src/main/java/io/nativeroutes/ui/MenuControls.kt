// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/MenuControls.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** A typed menu item shared by Compose callers and the Fabric bridge. */
data class MenuActionItem(
    val id: String,
    val title: String,
    val disabled: Boolean = false,
    val destructive: Boolean = false,
    val icon: String? = null,
)

/** A native TextButton anchor with a Compose DropdownMenu. */
@Composable
fun PopupMenuButton(
    items: List<MenuActionItem>,
    title: String = "更多",
    disabled: Boolean = false,
    modifier: Modifier = Modifier,
    accessibilityLabel: String = title,
    onSelect: (String) -> Unit,
) {
    val colors = uiColors()
    var expanded by remember { mutableStateOf(false) }
    val enabled = !disabled && items.isNotEmpty()
    Box(modifier) {
        TextButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxSize().semantics {
                contentDescription = accessibilityLabel
                role = Role.Button
                if (!enabled) disabled()
            },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(UiDesign.space.sm.dp)) {
                UiIcon(UiIconKind.More, tint = if (enabled) colors.primary else colors.muted, modifier = Modifier.size(18.dp))
                Text(title, color = if (enabled) colors.primary else colors.muted)
            }
        }
        DropdownMenu(
            expanded = expanded, onDismissRequest = { expanded = false },
            containerColor = colors.surface, tonalElevation = 0.dp,
        ) {
            items.forEach { item ->
                val itemTint = when {
                    item.disabled -> colors.muted
                    item.destructive -> colors.dangerText
                    else -> colors.text
                }
                val iconKind = uiIconKind(item.icon)
                val leadingIcon: (@Composable () -> Unit)? = iconKind?.let { kind ->
                    { UiIcon(kind, tint = itemTint, modifier = Modifier.size(18.dp)) }
                }
                DropdownMenuItem(
                    text = {
                        Text(item.title, color = itemTint)
                    },
                    leadingIcon = leadingIcon,
                    enabled = !item.disabled,
                    onClick = {
                        expanded = false
                        onSelect(item.id)
                    },
                )
            }
        }
    }
}

/**
 * A modal native action sheet. The result callback runs after the sheet has finished closing;
 * a selected action returns its id and Back, swipe, outside tap, or Cancel returns null.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ActionSheet(
    title: String? = null,
    description: String? = null,
    actions: List<MenuActionItem>,
    cancelText: String = "取消",
    onResult: (String?) -> Unit,
) {
    val colors = uiColors()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(true) }
    var closeStarted by remember { mutableStateOf(false) }
    val close: (String?) -> Unit = { result ->
        if (!closeStarted) {
            closeStarted = true
            scope.launch {
                sheetState.hide()
                open = false
                onResult(result)
            }
        }
    }
    if (open) {
        ModalBottomSheet(
            onDismissRequest = { close(null) }, sheetState = sheetState,
            shape = RoundedCornerShape(UiDesign.radius.sheet.dp), containerColor = colors.surface,
            contentColor = colors.text, scrimColor = colors.scrim,
            dragHandle = { SheetHeader(null, null) },
        ) { ActionSheetPanel(title, description, actions, cancelText, close) }
    }
}

/** Controlled form uses the same ActionSheet geometry, with page-owned Back and closing lifecycle. */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ActionSheet(
    open: Boolean,
    title: String? = null,
    description: String? = null,
    actions: List<MenuActionItem>,
    cancelText: String = "取消",
    onOpenChange: (Boolean, SheetDismissReason) -> Unit,
    onSelect: (String) -> Unit,
    onClosed: (OverlayCloseReason) -> Unit = {},
) {
    val presentation = rememberPresentation(open, true, SheetDismissReason.Back, SheetDismissReason.Navigation, onOpenChange, onClosed)
    val current = presentation.id ?: return
    key(current) {
        val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { value ->
            value != androidx.compose.material3.SheetValue.Hidden || !presentation.open || presentation.top
        })
        LaunchedEffect(open) {
            if (open) state.show() else { state.hide(); presentation.finish(current) }
        }
        val colors = uiColors()
        ModalBottomSheet(
            onDismissRequest = { presentation.requestClose(SheetDismissReason.Gesture) }, sheetState = state,
            properties = androidx.compose.material3.ModalBottomSheetProperties(shouldDismissOnBackPress = false),
            shape = RoundedCornerShape(UiDesign.radius.sheet.dp), containerColor = colors.surface,
            contentColor = colors.text, scrimColor = colors.scrim,
            dragHandle = { SheetHeader(null, null) },
        ) {
            NotifyOverlayWindowAttached(current)
            val back = rememberOverlayBack { presentation.requestClose(SheetDismissReason.Back) }
            androidx.activity.compose.BackHandler(onBack = back)
            Box {
                ActionSheetPanel(title, description, actions, cancelText, { result ->
                    if (presentation.interactive) {
                        if (result == null) presentation.requestClose(SheetDismissReason.Back) else onSelect(result)
                    }
                }, presentation.interactive)
                if (!presentation.interactive) Box(Modifier.matchParentSize().pointerInput(Unit) {
                    awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } }
                })
            }
        }
    }
}

/** One body for both imperative and controlled presentation; existing title/button spacing is preserved. */
@Composable
private fun ActionSheetPanel(title: String?, description: String?, actions: List<MenuActionItem>, cancelText: String,
    close: (String?) -> Unit, interactive: Boolean = true) {
    val colors = uiColors()
    Column(
        Modifier.fillMaxWidth().padding(horizontal = UiDesign.space.content.dp).padding(bottom = UiDesign.space.lg.dp)
            .then(if (interactive) Modifier else Modifier.semantics { hideFromAccessibility() }),
        verticalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp),
    ) {
        title?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = colors.text, fontSize = UiDesign.font.subheading.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth().padding(top = UiDesign.space.xs.dp, bottom = UiDesign.space.xs.dp))
        }
        description?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = colors.muted, fontSize = UiDesign.font.content.sp, lineHeight = UiDesign.font.contentLine.sp,
                modifier = Modifier.fillMaxWidth().padding(bottom = UiDesign.space.tight.dp))
        }
        actions.forEachIndexed { index, item ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 54.dp).alpha(if (item.disabled) 0.48f else 1f)
                    .clickable(enabled = !item.disabled && interactive, role = Role.Button) { close(item.id) }
                    .semantics {
                        contentDescription = item.title
                        role = Role.Button
                        if (item.disabled) disabled()
                    }.padding(horizontal = UiDesign.space.md.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                uiIconKind(item.icon)?.let {
                    UiIcon(it, tint = if (item.destructive) colors.dangerText else colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(16.dp))
                }
                Text(item.title, color = if (item.destructive) colors.dangerText else colors.text,
                    fontSize = UiDesign.font.control.sp, fontWeight = FontWeight.Medium)
            }
            if (index < actions.lastIndex) HorizontalDivider(color = colors.border)
        }
        HorizontalDivider(color = colors.border, modifier = Modifier.padding(top = UiDesign.space.xs.dp))
        TextButton(onClick = { close(null) }, enabled = interactive,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Text(cancelText, color = colors.muted, fontSize = UiDesign.font.control.sp)
        }
    }
}
