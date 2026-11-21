package io.valdiroutes.app_ui.appui

import android.graphics.Color as AndroidColor
import android.graphics.drawable.ColorDrawable
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.annotation.Keep
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import android.view.inputmethod.InputMethodManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog as WindowDialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import kotlinx.coroutines.delay
import com.snap.valdi.RenderBackend
import com.snap.valdi.ValdiContextConfiguration
import com.snap.valdi.views.ValdiRootView
import com.snap.valdi.views.ValdiView
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
    var cardView: View? = null
    var lastOpen: Boolean? = null
    var lastTopInsetDp: Double = Double.NaN
    var lastBottomInsetDp: Double = Double.NaN
    var topInsetDp: Double = 0.0
    var bottomInsetDp: Double = 0.0
    var imeBottomPx: Int = 0
    var safeTopPx: Int = 0
    var navBottomPx: Int = 0
    var closing: Boolean = false
    private var layoutListener: View.OnLayoutChangeListener? = null

    fun attachRoot(view: ValdiRootView) {
        rootView = view
        val listener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            applyCardKeyboardLift()
        }
        layoutListener = listener
        view.addOnLayoutChangeListener(listener)
    }

    fun applyCardKeyboardLift() {
        // Freeze the card's vertical offset while closing so the fading modal doesn't chase the collapsing IME.
        if (closing) return
        val root = rootView ?: return
        val card = resolveCardView(root) ?: return
        if (root.height <= 0 || card.height <= 0) return

        val density = root.resources.displayMetrics.density
        val topMarginPx = 24f * density
        val keyboardClearancePx = 16f * density
        val minTop = safeTopPx + topMarginPx
        val visibleBottom = root.height - maxOf(navBottomPx + topMarginPx, imeBottomPx + keyboardClearancePx)
        val desiredLift = if (imeBottomPx > 0 && visibleBottom > minTop) {
            val restingTop = offsetTopInAncestor(card, root)
            val restingBottom = restingTop + card.height
            if (restingBottom > visibleBottom) {
                val targetTop = (visibleBottom - card.height).coerceAtLeast(minTop)
                (targetTop - restingTop).coerceAtMost(0f)
            } else {
                0f
            }
        } else {
            0f
        }
        if (card.translationY != desiredLift) {
            card.translationY = desiredLift
        }
    }

    private fun resolveCardView(root: View): View? {
        val cached = cardView
        if (cached != null && cached.isAttachedToWindow) return cached
        val found = findModalCard(root)
        cardView = found
        return found
    }

    fun destroy() {
        val view = rootView
        val listener = layoutListener
        layoutListener = null
        cardView = null
        rootView = null
        if (view != null && listener != null) {
            view.removeOnLayoutChangeListener(listener)
        }
        view?.destroy()
    }
}

private fun findModalCard(view: View): View? {
    if (view is ValdiView && view.valdiViewNode?.getAttribute("accessibilityId") == "app-modal-card") {
        return view
    }
    if (view is ViewGroup) {
        for (i in 0 until view.childCount) {
            findModalCard(view.getChildAt(i))?.let { return it }
        }
    }
    return null
}

private fun offsetTopInAncestor(descendant: View, ancestor: View): Float {
    var top = 0f
    var current: View? = descendant
    while (current != null && current !== ancestor) {
        top += current.top.toFloat()
        if (current !== descendant) {
            top += current.translationY
        }
        current = current.parent as? View
    }
    return top
}

@Composable
private fun ValdiModalDialog(modal: ModalPresentation) {
    val runtime = checkNotNull(AppUI.runtime) { "E_NO_VALDI_RUNTIME:Configure AppUI.runtime before presenting modals" }
    val requestId = modal.requestId

    var overlayDismissed by remember(requestId) { mutableStateOf(false) }

    // Ensure the host Activity doesn't retain stale focus/IME ownership behind the modal Dialog.
    LaunchedEffect(requestId) {
        AppUI.clearHostFocusAndHideKeyboard()
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
                        overlayDismissed = true
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
            window?.let { win ->
                win.setDimAmount(0f)
                win.setWindowAnimations(0)
                win.setBackgroundDrawable(ColorDrawable(AndroidColor.TRANSPARENT))
                win.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
                @Suppress("DEPRECATION")
                win.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
                syncOverlayWindowSystemBars(win, win.decorView, AppUI.hostWindow)
            }
        }

        val density = LocalDensity.current
        val safeTopInsets = WindowInsets.statusBars.union(WindowInsets.displayCutout)
        val safeTopPx = safeTopInsets.getTop(density)
        val navBottomPx = WindowInsets.navigationBars.getBottom(density)
        val imeBottomPx = WindowInsets.ime.getBottom(density)
        val topInsetDp = (safeTopPx / density.density).toDouble()
        val bottomInsetDp = (navBottomPx / density.density).toDouble()
        val open = modal.open

        val dialogFocusManager = LocalFocusManager.current
        val dialogKeyboard = LocalSoftwareKeyboardController.current
        LaunchedEffect(open) {
            session.closing = !open
            if (!open) {
                dialogFocusManager.clearFocus(force = true)
                val target = session.rootView ?: dialogView
                target.findFocus()?.clearFocus()
                if (target.hasFocus()) {
                    target.clearFocus()
                }
                val token = target.windowToken ?: dialogView.windowToken
                if (token != null) {
                    target.context.getSystemService(InputMethodManager::class.java)
                        ?.hideSoftInputFromWindow(token, 0)
                }
                dialogKeyboard?.hide()
            }
        }

        // Wait for the IME hide animation inside the Dialog window to finish before tearing down
        // the Dialog; otherwise WindowManager cancels the hide animation mid-flight and transfers
        // IME control back to MainActivity, briefly flashing the keyboard over the page behind it.
        LaunchedEffect(overlayDismissed, imeBottomPx) {
            if (!overlayDismissed) return@LaunchedEffect
            if (imeBottomPx > 0) {
                delay(350L)
            }
            AppUI.modalClosed(requestId)
        }

        AndroidView(
            factory = { ctx ->
                session.closing = !open
                session.topInsetDp = topInsetDp
                session.bottomInsetDp = bottomInsetDp
                session.lastTopInsetDp = topInsetDp
                session.lastBottomInsetDp = bottomInsetDp
                session.safeTopPx = safeTopPx
                session.navBottomPx = navBottomPx
                session.imeBottomPx = imeBottomPx
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
                    session.attachRoot(this)
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
            modifier = Modifier.fillMaxSize(),
            update = { view ->
                session.closing = !open
                session.safeTopPx = safeTopPx
                session.navBottomPx = navBottomPx
                session.imeBottomPx = imeBottomPx
                session.topInsetDp = topInsetDp
                session.bottomInsetDp = bottomInsetDp
                session.applyCardKeyboardLift()
                if (
                    session.lastOpen != open ||
                    session.lastTopInsetDp != topInsetDp ||
                    session.lastBottomInsetDp != bottomInsetDp
                ) {
                    session.lastOpen = open
                    session.lastTopInsetDp = topInsetDp
                    session.lastBottomInsetDp = bottomInsetDp
                    view.setViewModelUntyped(
                        buildModalOverlayViewModel(
                            modal.options,
                            open = open,
                            topInsetDp = topInsetDp,
                            bottomInsetDp = bottomInsetDp,
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
