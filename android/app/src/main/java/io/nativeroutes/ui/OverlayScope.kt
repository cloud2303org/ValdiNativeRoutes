// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/OverlayScope.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import android.view.View
import java.util.UUID
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** App adapter; NativeRoutesUI does not depend on a router or React Native. */
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
    val scope = LocalOverlayScope.current
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

/** Same reasons as the RN package. A sheet cannot tell a drag from a scrim tap. */
enum class SheetDismissReason { Gesture, Back, Navigation, CloseButton, Cancel, Confirm }
enum class DialogDismissReason { Backdrop, Back, Navigation, Cancel, Confirm }
enum class OverlayCloseReason { Dismissed, Navigation, Unmount }

internal val LocalOverlayScope = staticCompositionLocalOf<OverlayScope> { error("Install ProvideOverlays around the native page") }
/** Page-scoped imperative overlays, e.g. `LocalOverlays.current.confirm(...)`. */
val LocalOverlays = staticCompositionLocalOf<Overlays> { error("Install ProvideOverlays around the native page") }

@Composable
fun ProvideOverlays(scope: OverlayScope, content: @Composable () -> Unit) {
    val overlays = remember(scope) { Overlays() }
    DisposableEffect(overlays) { onDispose { overlays.dispose() } }
    CompositionLocalProvider(LocalOverlayScope provides scope, LocalOverlays provides overlays) {
        content()
        overlays.entries.forEach { entry -> key(entry.id) { ConfirmDialog(overlays, entry) } }
    }
}

/**
 * One page registration, retained until the exit animation calls [finish].
 * Reopening while closing starts a fresh registration after the old one finishes.
 */
@Stable
internal class Presentation<R>(private val scope: OverlayScope, private val back: R, private val navigation: R,
    private val dismissInputs: () -> Unit) {
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
internal fun <R> rememberPresentation(open: Boolean, dismissible: Boolean, back: R, navigation: R,
    onOpenChange: (Boolean, R) -> Unit, onClosed: (OverlayCloseReason) -> Unit): Presentation<R> {
    val scope = LocalOverlayScope.current
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

/** Back handler for an overlay window: the first Back only closes the keyboard, as in RN. */
@Composable
internal fun rememberOverlayBack(close: () -> Unit): () -> Unit {
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val keyboard = LocalSoftwareKeyboardController.current
    val latestClose by rememberUpdatedState(close)
    val visible by rememberUpdatedState(keyboardVisible)
    return remember(keyboard) { { if (visible) keyboard?.hide() else latestClose() } }
}

enum class ConfirmTone { Primary, Danger }
enum class ConfirmDismissReason { Cancel, Backdrop, Back, Navigation, Unmount }
sealed interface ConfirmResult {
    data object Confirmed : ConfirmResult
    data class Dismissed(val reason: ConfirmDismissReason) : ConfirmResult
}
internal class ConfirmOptions(val title: String?, val description: String?, val confirmText: String, val cancelText: String,
    val tone: ConfirmTone, val showCancel: Boolean, val dismissible: Boolean)

internal class ConfirmEntry(val id: Long, val options: ConfirmOptions, val resume: (ConfirmResult) -> Unit) {
    var open by mutableStateOf(true)
    var outcome: ConfirmResult? = null
}

/** Page-scoped confirmations. Each resumes exactly once, after its dialog has fully closed. */
class Overlays internal constructor() {
    internal val entries = mutableStateListOf<ConfirmEntry>()
    private var serial = 0L
    internal var disposed = false

    suspend fun confirm(title: String? = null, description: String? = null, confirmText: String = "确定",
        cancelText: String = "取消", tone: ConfirmTone = ConfirmTone.Primary, showCancel: Boolean = true,
        dismissible: Boolean = true): ConfirmResult {
        if (disposed) return ConfirmResult.Dismissed(ConfirmDismissReason.Unmount)
        val options = ConfirmOptions(title, description, confirmText, cancelText, tone, showCancel, dismissible)
        return suspendCancellableCoroutine { continuation ->
            val entry = ConfirmEntry(++serial, options) { if (continuation.isActive) continuation.resume(it) }
            entries.add(entry)
            // A cancelled caller no longer needs the answer; still animate the dialog out.
            continuation.invokeOnCancellation { entry.open = false }
        }
    }
    internal fun close(entry: ConfirmEntry, outcome: ConfirmResult) {
        if (!entry.open) return
        entry.open = false; entry.outcome = outcome
    }
    internal fun closed(entry: ConfirmEntry, reason: OverlayCloseReason) {
        if (!entries.remove(entry)) return
        entry.resume(when (reason) {
            OverlayCloseReason.Dismissed -> entry.outcome ?: ConfirmResult.Dismissed(ConfirmDismissReason.Back)
            OverlayCloseReason.Navigation -> ConfirmResult.Dismissed(ConfirmDismissReason.Navigation)
            OverlayCloseReason.Unmount -> ConfirmResult.Dismissed(ConfirmDismissReason.Unmount)
        })
    }
    internal fun dispose() {
        disposed = true
        entries.toList().forEach { closed(it, OverlayCloseReason.Unmount) }
    }
}

@Composable
private fun ConfirmDialog(overlays: Overlays, entry: ConfirmEntry) {
    val options = entry.options
    ScrollDialog(open = entry.open, dismissible = options.dismissible,
        onOpenChange = { open, reason ->
            if (!open) overlays.close(entry, when (reason) {
                DialogDismissReason.Confirm -> ConfirmResult.Confirmed
                DialogDismissReason.Backdrop -> ConfirmResult.Dismissed(ConfirmDismissReason.Backdrop)
                DialogDismissReason.Back -> ConfirmResult.Dismissed(ConfirmDismissReason.Back)
                DialogDismissReason.Navigation -> ConfirmResult.Dismissed(ConfirmDismissReason.Navigation)
                DialogDismissReason.Cancel -> ConfirmResult.Dismissed(ConfirmDismissReason.Cancel)
            })
        },
        onClosed = { overlays.closed(entry, it) },
        title = options.title, description = options.description,
        footer = {
            PopupActionButtons(
                onCancel = { overlays.close(entry, ConfirmResult.Dismissed(ConfirmDismissReason.Cancel)) },
                onConfirm = { overlays.close(entry, ConfirmResult.Confirmed) },
                cancelText = options.cancelText, confirmText = options.confirmText,
                confirmTone = options.tone, showCancel = options.showCancel,
            )
        })
}
