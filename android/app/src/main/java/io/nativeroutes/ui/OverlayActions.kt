// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/OverlayActions.kt).
package io.nativeroutes.ui

import androidx.compose.runtime.Composable

/** Custom content wins; confirmation is controlled by the caller, cancellation requests a close. */
internal fun overlayActions(footer: (@Composable () -> Unit)?, onConfirm: () -> Unit,
    onCancel: () -> Unit, showCancel: Boolean, confirmText: String,
    cancelText: String, confirmDisabled: Boolean, confirmTone: ConfirmTone): (@Composable () -> Unit)? {
    if (footer != null) return footer
    return { PopupActionButtons(onCancel = onCancel, onConfirm = onConfirm,
        showCancel = showCancel, confirmText = confirmText, cancelText = cancelText,
        confirmDisabled = confirmDisabled, confirmTone = confirmTone) }
}
