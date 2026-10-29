// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/ScrollDialog.kt).
package io.nativeroutes.ui

import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp

/** Dialog with a scrolling body and pinned title/footer. */
@Composable
fun ScrollDialog(open: Boolean, onOpenChange: (Boolean, DialogDismissReason) -> Unit, dismissible: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {}, title: String? = null, description: String? = null,
    footer: (@Composable () -> Unit)? = null,
    onConfirm: (() -> Unit)? = null, onCancel: (() -> Unit)? = null,
    showCancel: Boolean = true, confirmText: String = "确定",
    cancelText: String = "取消", confirmDisabled: Boolean = false, confirmTone: ConfirmTone = ConfirmTone.Primary,
    maxHeight: Dp = UiDesign.size.dialogMaxHeight.dp, content: (@Composable ColumnScope.() -> Unit)? = null) {
    DialogFrame(open, onOpenChange, dismissible, onClosed, title, description, true, overlayActions(footer, onConfirm ?: { onOpenChange(false, DialogDismissReason.Confirm) }, onCancel ?: { onOpenChange(false, DialogDismissReason.Cancel) },
            showCancel, confirmText, cancelText, confirmDisabled, confirmTone), maxHeight, content)
}
