package io.valdiroutes.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.KeyEvent
import android.view.View
import android.view.Window
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import io.valdiroutes.app_ui.appui.AppUI

internal data class CloseRequestInputState(
    val isPresented: Boolean,
    val hasCloseRequestHandler: Boolean,
    val isModal: Boolean,
) {
    val interceptsBack: Boolean
        get() = isPresented && (hasCloseRequestHandler || isModal)

    val handlesEscape: Boolean
        get() = isPresented && hasCloseRequestHandler

    fun resolveBackAction(): CloseRequestInputAction = when {
        !isPresented -> CloseRequestInputAction.PASS_THROUGH
        hasCloseRequestHandler -> CloseRequestInputAction.EMIT_CLOSE_REQUEST
        isModal -> CloseRequestInputAction.DISMISS_MODAL
        else -> CloseRequestInputAction.PASS_THROUGH
    }

    fun resolveEscapeAction(): CloseRequestInputAction =
        if (handlesEscape) CloseRequestInputAction.EMIT_CLOSE_REQUEST
        else CloseRequestInputAction.PASS_THROUGH
}

internal enum class CloseRequestInputAction {
    PASS_THROUGH,
    EMIT_CLOSE_REQUEST,
    DISMISS_MODAL,
}

internal class CloseRequestBackCallback(private val onBack: () -> Unit) :
    OnBackPressedCallback(false) {

    override fun handleOnBackPressed() {
        onBack()
    }
}

internal object EscapeCloseRequestDispatcher {
    fun shouldDispatch(keyCode: Int, event: KeyEvent, handlesEscape: Boolean): Boolean =
        handlesEscape &&
            keyCode == KeyEvent.KEYCODE_ESCAPE &&
            event.action == KeyEvent.ACTION_UP &&
            !event.isCanceled &&
            event.hasNoModifiers()
}

internal class CloseRequestPresentationTracker(initialPresented: Boolean = false) {
    var isPresented: Boolean = initialPresented
        private set

    fun update(nextPresented: Boolean): Boolean {
        if (isPresented == nextPresented) return false
        isPresented = nextPresented
        return true
    }
}

/**
 * Coordinates Back and Escape routing across stacked portal sheets in ascending `openOrder`.
 * The topmost sheet whose [CloseRequestInputState] intercepts Back / handles Escape wins.
 */
internal class PortalCloseRequestCoordinator<T : Any>(
    private val stateOf: (T) -> CloseRequestInputState,
    private val onEmitCloseRequest: (T) -> Unit,
    private val onDismissModal: (T) -> Unit,
) {
    val backCallback = CloseRequestBackCallback { handleBack() }
    private var orderedSheets: List<T> = emptyList()
    private var attachedDispatcher: OnBackPressedDispatcher? = null

    fun attach(dispatcher: OnBackPressedDispatcher?) {
        if (attachedDispatcher === dispatcher) {
            syncEnabled()
            return
        }
        backCallback.remove()
        attachedDispatcher = dispatcher
        dispatcher?.addCallback(backCallback)
        syncEnabled()
    }

    fun detach() {
        backCallback.remove()
        attachedDispatcher = null
    }

    fun updateSheets(sheetsInOpenOrder: List<T>) {
        orderedSheets = sheetsInOpenOrder
        syncEnabled()
    }

    fun syncEnabled() {
        backCallback.isEnabled = orderedSheets.asReversed().any { stateOf(it).interceptsBack }
    }

    fun handleBack(): Boolean {
        for (sheet in orderedSheets.asReversed()) {
            when (stateOf(sheet).resolveBackAction()) {
                CloseRequestInputAction.EMIT_CLOSE_REQUEST -> {
                    onEmitCloseRequest(sheet)
                    return true
                }
                CloseRequestInputAction.DISMISS_MODAL -> {
                    onDismissModal(sheet)
                    return true
                }
                CloseRequestInputAction.PASS_THROUGH -> continue
            }
        }
        return false
    }

    fun handleKeyEvent(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode != KeyEvent.KEYCODE_ESCAPE) return false
        for (sheet in orderedSheets.asReversed()) {
            val state = stateOf(sheet)
            if (EscapeCloseRequestDispatcher.shouldDispatch(keyCode, event, state.handlesEscape)) {
                onEmitCloseRequest(sheet)
                return true
            }
        }
        return false
    }
}

/**
 * Handles Back and Escape for a single `windowOverlay` `ComponentDialog`.
 */
internal class OverlayCloseRequestController(
    private val stateProvider: () -> CloseRequestInputState,
    private val onEmitCloseRequest: () -> Unit,
    private val onDismissModal: () -> Unit,
) {
    val backCallback = CloseRequestBackCallback { handleBack() }

    fun sync() {
        backCallback.isEnabled = stateProvider().interceptsBack
    }

    fun handleBack(): Boolean = when (stateProvider().resolveBackAction()) {
        CloseRequestInputAction.EMIT_CLOSE_REQUEST -> {
            onEmitCloseRequest()
            true
        }
        CloseRequestInputAction.DISMISS_MODAL -> {
            onDismissModal()
            true
        }
        CloseRequestInputAction.PASS_THROUGH -> false
    }

    fun handleKeyEvent(keyCode: Int, event: KeyEvent): Boolean {
        val state = stateProvider()
        if (EscapeCloseRequestDispatcher.shouldDispatch(keyCode, event, state.handlesEscape)) {
            onEmitCloseRequest()
            return true
        }
        return false
    }
}

internal fun View.resolveBackDispatcher(): OnBackPressedDispatcher? {
    findViewTreeOnBackPressedDispatcherOwner()?.onBackPressedDispatcher?.let { return it }
    var ctx: Context? = context
    while (ctx is ContextWrapper) {
        if (ctx is ComponentActivity) return ctx.onBackPressedDispatcher
        ctx = ctx.baseContext
    }
    return null
}

internal fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

internal fun View.findHostActivity(): Activity? {
    context.findActivity()?.let { return it }
    var current: View? = parent as? View
    while (current != null) {
        current.context.findActivity()?.let { return it }
        current = current.parent as? View
    }
    rootView?.context?.findActivity()?.let { return it }
    return AppUI.hostActivity
}

/**
 * Installs a delegating [Window.Callback] on the host window so hardware `Escape` keys reach
 * portal sheets even when focus is elsewhere in the window. Multiple portal hosts in the same
 * window share the chain cleanly.
 */
internal class WindowEscapeKeyInterceptor(
    private val window: Window,
    private val onEscapeKeyEvent: (KeyEvent) -> Boolean,
) {
    private var installed = false
    private var previousCallback: Window.Callback? = null

    fun install() {
        if (installed) return
        val current = window.callback ?: return
        previousCallback = current
        window.callback = DelegatingCallback(current)
        installed = true
    }

    fun uninstall() {
        if (!installed) return
        val current = window.callback
        if (current is DelegatingCallback && current.selfOwner === this) {
            window.callback = previousCallback
        }
        installed = false
        previousCallback = null
    }

    private inner class DelegatingCallback(private val delegate: Window.Callback) :
        Window.Callback by delegate {
        val selfOwner: WindowEscapeKeyInterceptor
            get() = this@WindowEscapeKeyInterceptor

        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            if (event.keyCode == KeyEvent.KEYCODE_ESCAPE && onEscapeKeyEvent(event)) {
                return true
            }
            return delegate.dispatchKeyEvent(event)
        }
    }
}
