// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/BottomSheet.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable

/** Content-sized sheet without an outer scroller. */
@Composable
fun BottomSheet(open: Boolean, onOpenChange: (Boolean, SheetDismissReason) -> Unit, dismissible: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {}, title: String? = null, description: String? = null,
    showHandle: Boolean = true, edgeToEdge: Boolean = false, showCloseButton: Boolean = false,
    footer: (@Composable () -> Unit)? = null,
    onConfirm: (() -> Unit)? = null, onCancel: (() -> Unit)? = null,
    showCancel: Boolean = true, confirmText: String = "确定",
    cancelText: String = "取消", confirmDisabled: Boolean = false, confirmTone: ConfirmTone = ConfirmTone.Primary,
    content: @Composable ColumnScope.() -> Unit) {
    SheetFrame(open, onOpenChange, dismissible, onClosed, title, description, SheetLayout.Content,
        showHandle, edgeToEdge, showCloseButton, overlayActions(footer, onConfirm ?: { onOpenChange(false, SheetDismissReason.Confirm) }, onCancel ?: { onOpenChange(false, SheetDismissReason.Cancel) },
            showCancel, confirmText, cancelText, confirmDisabled, confirmTone), content)
}
