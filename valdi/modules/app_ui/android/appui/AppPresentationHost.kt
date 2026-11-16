package io.valdiroutes.app_ui.appui

import android.view.View
import androidx.activity.compose.BackHandler
import androidx.annotation.Keep
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
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
import com.snap.valdi.RenderBackend
import com.snap.valdi.ValdiContextConfiguration
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.app_ui.AppSheetOverlayContext
import io.valdiroutes.app_ui.AppSheetOverlayViewModel
import io.valdiroutes.app_ui.PickerOption as ValdiPickerOption
import io.valdiroutes.app_ui.ui.ImagePreview
import io.valdiroutes.app_ui.ui.OverlayScope
import io.valdiroutes.app_ui.ui.ProvideOverlays

private const val APP_SHEET_OVERLAY_COMPONENT = "AppSheetOverlay@app_ui/src/sheet_presenter/AppSheetOverlay"

/** Draws [AppUI.presentation] while there is one. */
@Composable
fun AppPresentationHost() {
    val presentation = AppUI.presentation ?: return
    key(presentation.requestId) {
        when (val options = presentation.options) {
            is ImagePreviewOptions -> ImagePreviewPresentation(presentation, options)
            is ActionSheetOptions,
            is PickerOptions,
            is DatePickerOptions -> ValdiSheetDialog(presentation)
        }
    }
}

@Composable
private fun ImagePreviewPresentation(presentation: AppPresentation, options: ImagePreviewOptions) {
    val scope = remember {
        OverlayScope(
            register = { _, _, event -> event("top"); true },
            update = { _, _, _ -> },
            remove = {},
            windowShown = { AppUI.overlayShown() },
        )
    }
    ProvideOverlays(scope) {
        var index by remember { mutableIntStateOf(options.urls.indexOf(options.current).coerceAtLeast(0)) }
        // Closing is the normal end of a preview: it confirms with the image shown last.
        ImagePreview(
            open = presentation.open,
            sources = options.urls,
            index = index,
            onIndexChange = { index = it },
            onOpenChange = { open, _ ->
                if (!open) {
                    AppUI.closePresentation(
                        presentation.requestId,
                        PresentationResult(true, false, options.urls[index], index),
                    )
                }
            },
            onClosed = { AppUI.presentationClosed(presentation.requestId) },
        )
    }
}

@Keep
private class ValdiSheetSession(
    @Keep val context: AppSheetOverlayContext,
) {
    var rootView: ValdiRootView? = null
    var lastOpen: Boolean? = null
    var lastBottomInsetDp: Double = Double.NaN

    fun destroy() {
        val view = rootView
        rootView = null
        view?.destroy()
    }
}

@Composable
private fun ValdiSheetDialog(presentation: AppPresentation) {
    val runtime = checkNotNull(AppUI.runtime) { "E_NO_VALDI_RUNTIME:Configure AppUI.runtime before presenting sheets" }
    val requestId = presentation.requestId

    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(requestId) {
        focusManager.clearFocus(force = true)
        keyboard?.hide()
    }

    val session = remember(requestId) {
        ValdiSheetSession(
            context = AppSheetOverlayContext(
                onSelect = { rawIndex ->
                    AppUI.onMain {
                        val idx = rawIndex.toInt()
                        val item = (presentation.options as ActionSheetOptions).itemList[idx]
                        AppUI.closePresentation(
                            requestId,
                            PresentationResult(confirm = true, cancel = false, value = item, index = idx),
                        )
                    }
                },
                onConfirm = { value, rawIndex ->
                    AppUI.onMain {
                        val idx = if (presentation.options is PickerOptions) rawIndex.toInt() else -1
                        AppUI.closePresentation(
                            requestId,
                            PresentationResult(confirm = true, cancel = false, value = value, index = idx),
                        )
                    }
                },
                onCancel = {
                    AppUI.onMain {
                        AppUI.closePresentation(requestId, PresentationResult.cancelled())
                    }
                },
                onDismissed = {
                    AppUI.onMain {
                        AppUI.presentationClosed(requestId)
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
            AppUI.closePresentation(requestId, PresentationResult.cancelled())
        }

        val window = (dialogView.parent as? DialogWindowProvider)?.window
        SideEffect {
            window?.setDimAmount(0f)
            window?.setWindowAnimations(0)
        }

        val density = LocalDensity.current
        val bottomInsetDp = (WindowInsets.navigationBars.getBottom(density) / density.density).toDouble()
        val open = presentation.open

        AndroidView(
            factory = { ctx ->
                val initialVm = buildSheetOverlayViewModel(presentation.options, open, bottomInsetDp)
                session.lastOpen = open
                session.lastBottomInsetDp = bottomInsetDp
                ValdiRootView(ctx).apply {
                    defaultFocusHighlightEnabled = false
                    setRetainsLayoutSpecsOnInvalidateLayout(true)
                    session.rootView = this
                    runtime.inflateViewAsync(
                        this,
                        APP_SHEET_OVERLAY_COMPONENT,
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
                if (session.lastOpen != open || session.lastBottomInsetDp != bottomInsetDp) {
                    session.lastOpen = open
                    session.lastBottomInsetDp = bottomInsetDp
                    view.setViewModelUntyped(
                        buildSheetOverlayViewModel(presentation.options, open, bottomInsetDp),
                    )
                }
            },
        )
    }
}

private fun buildSheetOverlayViewModel(
    options: AppPresentationOptions,
    open: Boolean,
    bottomInsetDp: Double,
): AppSheetOverlayViewModel = when (options) {
    is ActionSheetOptions -> AppSheetOverlayViewModel(
        open = open,
        kind = "actionSheet",
        title = options.alertText,
        confirmText = "",
        cancelText = "取消",
        items = options.itemList,
        options = emptyList(),
        value = "",
        dateMode = "date",
        minYear = 2000.0,
        maxYear = 2100.0,
        bottomInset = bottomInsetDp,
    )
    is PickerOptions -> AppSheetOverlayViewModel(
        open = open,
        kind = "picker",
        title = options.title,
        confirmText = options.confirmText,
        cancelText = options.cancelText,
        items = emptyList(),
        options = options.options.map { ValdiPickerOption(it.value, it.label) },
        value = options.value,
        dateMode = "date",
        minYear = 2000.0,
        maxYear = 2100.0,
        bottomInset = bottomInsetDp,
    )
    is DatePickerOptions -> AppSheetOverlayViewModel(
        open = open,
        kind = "datePicker",
        title = options.title,
        confirmText = options.confirmText,
        cancelText = options.cancelText,
        items = emptyList(),
        options = emptyList(),
        value = options.value,
        dateMode = when (options.mode) {
            DatePickerMode.Year -> "year"
            DatePickerMode.YearMonth -> "year-month"
            DatePickerMode.Date -> "date"
            DatePickerMode.Time -> "time"
            DatePickerMode.DateTime -> "datetime"
        },
        minYear = options.minYear.toDouble(),
        maxYear = options.maxYear.toDouble(),
        bottomInset = bottomInsetDp,
    )
    is ImagePreviewOptions -> error("ImagePreviewOptions uses ImagePreviewPresentation")
}
