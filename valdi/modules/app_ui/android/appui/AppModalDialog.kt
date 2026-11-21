package io.valdiroutes.app_ui.appui

import android.view.View
import androidx.activity.compose.BackHandler
import androidx.annotation.Keep
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog as WindowDialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.snap.valdi.RenderBackend
import com.snap.valdi.ValdiContextConfiguration
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.app_ui.AppModalOverlayContext
import io.valdiroutes.app_ui.AppModalOverlayViewModel

private const val APP_MODAL_OVERLAY_COMPONENT = "AppModalOverlay@app_ui/src/modal_presenter/AppModalOverlay"

/** Draws [AppUI.modal] while there is one. */
@Composable
fun AppModalHost() {
    val modal = AppUI.modal ?: return
    key(modal.requestId) { ValdiModalDialog(modal) }
}

@Keep
private class ValdiModalSession(
    @Keep val context: AppModalOverlayContext,
) {
    var rootView: ValdiRootView? = null
    var lastOpen: Boolean? = null
    var topInsetDp: Double = 0.0
    var bottomInsetDp: Double = 0.0

    fun destroy() {
        val view = rootView
        rootView = null
        view?.destroy()
    }
}

@Composable
private fun ValdiModalDialog(modal: ModalPresentation) {
    val runtime = checkNotNull(AppUI.runtime) { "E_NO_VALDI_RUNTIME:Configure AppUI.runtime before presenting modals" }
    val requestId = modal.requestId

    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(modal.open) {
        if (!modal.open) {
            focusManager.clearFocus(force = true)
            keyboard?.hide()
        }
    }

    val session = remember(requestId) {
        ValdiModalSession(
            context = AppModalOverlayContext(
                onConfirm = { content ->
                    AppUI.onMain {
                        val value = if (modal.options.editable) content else ""
                        AppUI.close(requestId, ModalResult(confirm = true, cancel = false, content = value))
                    }
                },
                onCancel = {
                    AppUI.onMain {
                        AppUI.close(requestId, ModalResult.cancelled())
                    }
                },
                onDismissed = {
                    AppUI.onMain {
                        AppUI.modalClosed(requestId)
                    }
                },
            ),
        )
    }

    DisposableEffect(session) {
        onDispose { session.destroy() }
    }

    WindowDialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        val dialogView = LocalView.current
        DisposableEffect(dialogView, requestId) {
            var notified = false
            val attached = Runnable {
                if (!notified && dialogView.isAttachedToWindow) {
                    notified = true
                    AppUI.overlayShown()
                }
            }
            val listener = object : View.OnAttachStateChangeListener {
                override fun onViewAttachedToWindow(v: View) {
                    v.post(attached)
                }

                override fun onViewDetachedFromWindow(v: View) = Unit
            }
            dialogView.addOnAttachStateChangeListener(listener)
            if (dialogView.isAttachedToWindow) dialogView.post(attached)
            onDispose {
                dialogView.removeOnAttachStateChangeListener(listener)
                dialogView.removeCallbacks(attached)
            }
        }

        BackHandler {
            AppUI.close(requestId, ModalResult.cancelled())
        }

        val window = (dialogView.parent as? DialogWindowProvider)?.window
        SideEffect {
            window?.setDimAmount(0f)
            window?.setWindowAnimations(0)
        }

        val density = LocalDensity.current
        val safeTopInsets = WindowInsets.statusBars.union(WindowInsets.displayCutout)
        val initialTopInsetDp = (safeTopInsets.getTop(density) / density.density).toDouble()
        val initialBottomInsetDp = (WindowInsets.navigationBars.getBottom(density) / density.density).toDouble()
        val open = modal.open

        AndroidView(
            factory = { ctx ->
                session.topInsetDp = initialTopInsetDp
                session.bottomInsetDp = initialBottomInsetDp
                session.lastOpen = open
                val initialVm = buildModalOverlayViewModel(
                    modal.options,
                    open = open,
                    topInsetDp = session.topInsetDp,
                    bottomInsetDp = session.bottomInsetDp,
                )
                ValdiRootView(ctx).apply {
                    defaultFocusHighlightEnabled = false
                    setRetainsLayoutSpecsOnInvalidateLayout(true)
                    session.rootView = this
                    runtime.inflateViewAsync(
                        this,
                        APP_MODAL_OVERLAY_COMPONENT,
                        initialVm,
                        session.context,
                        null,
                        null,
                        ValdiContextConfiguration(renderBackend = RenderBackend.ANDROID),
                    )
                }
            },
            modifier = Modifier.fillMaxSize().imePadding(),
            update = { view ->
                if (session.lastOpen != open) {
                    session.lastOpen = open
                    view.setViewModelUntyped(
                        buildModalOverlayViewModel(
                            modal.options,
                            open = open,
                            topInsetDp = session.topInsetDp,
                            bottomInsetDp = session.bottomInsetDp,
                        ),
                    )
                }
            },
        )
    }
}

private fun buildModalOverlayViewModel(
    options: ModalOptions,
    open: Boolean,
    topInsetDp: Double,
    bottomInsetDp: Double,
): AppModalOverlayViewModel = AppModalOverlayViewModel(
    open = open,
    title = options.title,
    content = options.content,
    showCancel = options.showCancel,
    confirmText = options.confirmText,
    cancelText = options.cancelText,
    editable = options.editable,
    placeholderText = options.placeholderText,
    defaultText = options.defaultText,
    topInset = topInsetDp,
    bottomInset = bottomInsetDp,
)
