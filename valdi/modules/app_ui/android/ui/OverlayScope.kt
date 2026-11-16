// Overlay registration scope retained solely for fullscreen ImagePreview window presentation.
package io.valdiroutes.app_ui.ui

import android.view.View
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import java.util.UUID

/** App adapter for fullscreen overlay windows (`ImagePreview`). */
class OverlayScope(
    val register: (String, Boolean, (String) -> Unit) -> Boolean,
    val update: (String, Boolean, Boolean) -> Unit,
    val remove: (String) -> Unit,
    val windowShown: (String) -> Unit = {},
)

/** Notify the consumer after a separate Compose window actually attaches. */
@Composable
internal fun NotifyOverlayWindowAttached(id: String) {
    val view = LocalView.current
    val scope = checkNotNull(LocalOverlayScope.current) { "Install ProvideOverlays around the native page" }
    val notify by rememberUpdatedState(scope.windowShown)
    DisposableEffect(view, id) {
        var notified = false
        val attached = Runnable {
            if (!notified && view.isAttachedToWindow) { notified = true; notify(id) }
        }
        val listener = object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) { v.post(attached) }
            override fun onViewDetachedFromWindow(v: View) = Unit
        }
        view.addOnAttachStateChangeListener(listener)
        if (view.isAttachedToWindow) view.post(attached)
        onDispose { view.removeOnAttachStateChangeListener(listener); view.removeCallbacks(attached) }
    }
}

enum class DialogDismissReason { Backdrop, Back, Navigation, Cancel, Confirm }
enum class OverlayCloseReason { Dismissed, Navigation, Unmount }

internal val LocalOverlayScope = staticCompositionLocalOf<OverlayScope?> { null }

@Composable
fun ProvideOverlays(scope: OverlayScope, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalOverlayScope provides scope) {
        content()
    }
}

/**
 * One page registration, retained until the exit animation calls [finish].
 * Reopening while closing starts a fresh registration after the old one finishes.
 */
@Stable
internal class Presentation<R>(
    private val scope: OverlayScope,
    private val back: R,
    private val navigation: R,
    private val dismissInputs: () -> Unit,
) {
    var id by mutableStateOf<String?>(null); private set
    var top by mutableStateOf(false); private set
    var open = false
    var dismissible = true
    var onOpenChange: (Boolean, R) -> Unit = { _, _ -> }
    var onClosed: (OverlayCloseReason) -> Unit = {}
    val interactive get() = id != null && top && open

    fun begin() {
        if (id != null || !open) return
        dismissInputs()
        val next = UUID.randomUUID().toString()
        id = next; top = false
        val accepted = scope.register(next, dismissible) { event ->
            if (id == next) when (event) {
                "top" -> top = true
                "covered" -> top = false
                "close" -> requestClose(back)
                "removed" -> { id = null; onOpenChange(false, navigation); onClosed(OverlayCloseReason.Navigation) }
            }
        }
        if (!accepted) { id = null; onOpenChange(false, navigation); onClosed(OverlayCloseReason.Navigation) }
    }

    /** User close request; ignored while covered, closing or not dismissible. */
    fun requestClose(reason: R) { if (interactive && dismissible) onOpenChange(false, reason) }
    fun update() { id?.let { scope.update(it, dismissible, !open) } }
    fun finish(current: String) {
        if (id != current) return
        id = null; scope.remove(current); onClosed(OverlayCloseReason.Dismissed)
        begin()
    }
    fun dispose() { id?.let { id = null; scope.remove(it); onClosed(OverlayCloseReason.Unmount) } }
}

@Composable
internal fun <R> rememberPresentation(
    open: Boolean,
    dismissible: Boolean,
    back: R,
    navigation: R,
    onOpenChange: (Boolean, R) -> Unit,
    onClosed: (OverlayCloseReason) -> Unit,
): Presentation<R> {
    val scope = checkNotNull(LocalOverlayScope.current) { "Install ProvideOverlays around the native page" }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val dismissInputs = rememberUpdatedState<() -> Unit>({ focusManager.clearFocus(force = true); keyboard?.hide() })
    val presentation = remember(scope) { Presentation(scope, back, navigation) { dismissInputs.value() } }
    SideEffect {
        presentation.open = open; presentation.dismissible = dismissible
        presentation.onOpenChange = onOpenChange; presentation.onClosed = onClosed
    }
    LaunchedEffect(open) { presentation.begin() }
    LaunchedEffect(presentation.id, open, dismissible) { presentation.update() }
    DisposableEffect(presentation) { onDispose { presentation.dispose() } }
    return presentation
}

/** Back handler for an overlay window: the first Back only closes the keyboard. */
@Composable
internal fun rememberOverlayBack(close: () -> Unit): () -> Unit {
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val keyboard = LocalSoftwareKeyboardController.current
    val latestClose by rememberUpdatedState(close)
    val visible by rememberUpdatedState(keyboardVisible)
    return remember(keyboard) { { if (visible) keyboard?.hide() else latestClose() } }
}
