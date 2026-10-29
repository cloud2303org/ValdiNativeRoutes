// After ExpoNativeRoutes' android/app AppModalHost.kt (AppPresentationHost): the action sheet, pickers, bottom sheet
// and image preview of `api`, drawn with the Compose controls ported into io.nativeroutes.ui.

package io.valdiroutes.app.appui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.sp
import io.nativeroutes.ui.ActionSheet
import io.nativeroutes.ui.ColumnPicker
import io.nativeroutes.ui.ImagePreview
import io.nativeroutes.ui.MenuActionItem
import io.nativeroutes.ui.OverlayCloseReason
import io.nativeroutes.ui.OverlayScope
import io.nativeroutes.ui.PickerOption
import io.nativeroutes.ui.PopupActionButtons
import io.nativeroutes.ui.ProvideOverlays
import io.nativeroutes.ui.ScrollBottomSheet
import io.nativeroutes.ui.TimePickMode
import io.nativeroutes.ui.TimePicker
import io.nativeroutes.ui.UiDesign
import io.nativeroutes.ui.uiColors

/** Draws [AppUI.presentation] while there is one. */
@Composable
fun AppPresentationHost() {
    val presentation = AppUI.presentation ?: return
    key(presentation.requestId) {
        // AppUI already decided the owner page and cancels on navigation, so this registration is always on top;
        // the scope only reports the attached window, to keep Toast and Loading above it.
        val scope = remember {
            OverlayScope(
                register = { _, _, event -> event("top"); true },
                update = { _, _, _ -> },
                remove = {},
                windowShown = { AppUI.overlayShown() },
            )
        }
        ProvideOverlays(scope) { PresentationContent(presentation) }
    }
}

@Composable
private fun PresentationContent(presentation: AppPresentation) {
    val close: (PresentationResult) -> Unit = { AppUI.closePresentation(presentation.requestId, it) }
    val closed: (OverlayCloseReason) -> Unit = { AppUI.presentationClosed(presentation.requestId) }
    when (val options = presentation.options) {
        is ActionSheetOptions -> ActionSheet(
            open = presentation.open,
            title = options.alertText.ifEmpty { null },
            actions = options.itemList.mapIndexed { index, title -> MenuActionItem(index.toString(), title) },
            onSelect = { close(PresentationResult(true, false, index = it.toInt())) },
            onOpenChange = { open, _ -> if (!open) close(PresentationResult.cancelled()) }, onClosed = closed,
        )
        is PickerOptions -> ColumnPicker(
            open = presentation.open,
            options = options.options.map { PickerOption(it.value, it.label) }, value = options.value.ifEmpty { null },
            title = options.title.ifEmpty { null }, confirmText = options.confirmText, cancelText = options.cancelText,
            onConfirm = { value -> close(PresentationResult(true, false, value, options.options.indexOfFirst { it.value == value })) },
            onOpenChange = { open, _ -> if (!open) close(PresentationResult.cancelled()) }, onClosed = closed,
        )
        is DatePickerOptions -> TimePicker(
            open = presentation.open,
            mode = when (options.mode) {
                DatePickerMode.Year -> TimePickMode.Year
                DatePickerMode.YearMonth -> TimePickMode.YearMonth
                DatePickerMode.Date -> TimePickMode.Date
                DatePickerMode.Time -> TimePickMode.Time
                DatePickerMode.DateTime -> TimePickMode.DateTime
            },
            value = options.value.ifEmpty { null }, minYear = options.minYear, maxYear = options.maxYear,
            title = options.title.ifEmpty { null }, confirmText = options.confirmText, cancelText = options.cancelText,
            onConfirm = { close(PresentationResult(true, false, it)) },
            onOpenChange = { open, _ -> if (!open) close(PresentationResult.cancelled()) }, onClosed = closed,
        )
        is BottomSheetOptions -> {
            val colors = uiColors()
            ScrollBottomSheet(
                open = presentation.open, title = options.title.ifEmpty { null }, dismissible = options.dismissible,
                onOpenChange = { open, _ -> if (!open) close(PresentationResult.cancelled()) }, onClosed = closed,
                footer = {
                    PopupActionButtons(
                        onCancel = { close(PresentationResult.cancelled()) },
                        onConfirm = { close(PresentationResult(true, false)) }, showCancel = options.showCancel,
                        confirmText = options.confirmText, cancelText = options.cancelText,
                    )
                },
            ) {
                if (options.content.isNotEmpty()) {
                    Text(options.content, color = colors.muted, fontSize = UiDesign.font.content.sp, lineHeight = UiDesign.font.contentLine.sp)
                }
            }
        }
        is ImagePreviewOptions -> {
            var index by remember { mutableIntStateOf(options.urls.indexOf(options.current).coerceAtLeast(0)) }
            // Closing is the normal end of a preview: it confirms with the image shown last.
            ImagePreview(
                open = presentation.open, sources = options.urls, index = index,
                onIndexChange = { index = it },
                onOpenChange = { open, _ -> if (!open) close(PresentationResult(true, false, options.urls[index], index)) },
                onClosed = closed,
            )
        }
    }
}
