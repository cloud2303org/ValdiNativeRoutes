// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/ImagePreview.kt).
package io.nativeroutes.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Dialog as WindowDialog

@Composable
fun ImagePreview(
    open: Boolean,
    sources: List<String>,
    index: Int = 0,
    onOpenChange: (Boolean, DialogDismissReason) -> Unit,
    onIndexChange: (Int) -> Unit = {},
    onClosed: (OverlayCloseReason) -> Unit = {},
) {
    val presentation = rememberPresentation(open, true, DialogDismissReason.Back, DialogDismissReason.Navigation, onOpenChange, onClosed)
    val currentId = presentation.id ?: return
    key(currentId) {
        LaunchedEffect(open) { if (!open) presentation.finish(currentId) }
        WindowDialog(onDismissRequest = {}, properties = DialogProperties(
            dismissOnBackPress = false, dismissOnClickOutside = false, usePlatformDefaultWidth = false, decorFitsSystemWindows = false,
        )) {
            NotifyOverlayWindowAttached(currentId)
            val back = rememberOverlayBack { presentation.requestClose(DialogDismissReason.Back) }
            BackHandler(onBack = back)
            val window = (LocalView.current.parent as? DialogWindowProvider)?.window
            SideEffect { window?.setDimAmount(0f); window?.setWindowAnimations(0) }
            val density = LocalDensity.current
            val topInset = WindowInsets.statusBars.getTop(density) / density.density
            AndroidView(
                factory = { ImagePreviewContentView(it) },
                modifier = Modifier.fillMaxSize(),
                update = { view ->
                    view.onIndexChange = onIndexChange
                    view.onRequestClose = { presentation.requestClose(DialogDismissReason.Backdrop) }
                    view.active = presentation.interactive
                    view.sources = sources
                    view.index = index
                    view.topInset = topInset
                },
            )
        }
    }
}
