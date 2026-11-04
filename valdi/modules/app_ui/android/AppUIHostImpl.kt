package io.valdiroutes.app_ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.snap.valdi.exceptions.PromiseRejectionException
import com.snap.valdi.exceptions.valdiErrorCode
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.valdiroutes.app_ui.ui.AttachmentCache
import io.valdiroutes.app_ui.appui.ActionSheetOptions
import io.valdiroutes.app_ui.appui.AppPresentationOptions
import io.valdiroutes.app_ui.appui.AppUI
import io.valdiroutes.app_ui.appui.BottomSheetOptions
import io.valdiroutes.app_ui.appui.DatePickerMode
import io.valdiroutes.app_ui.appui.DatePickerOptions
import io.valdiroutes.app_ui.appui.ImagePreviewOptions
import io.valdiroutes.app_ui.appui.LoadingOptions
import io.valdiroutes.app_ui.appui.ModalOptions
import io.valdiroutes.app_ui.appui.PickerItem
import io.valdiroutes.app_ui.appui.PickerOptions
import io.valdiroutes.app_ui.appui.ToastOptions
import io.valdiroutes.app_ui.ActionSheetRequest
import io.valdiroutes.app_ui.AppUIHost
import io.valdiroutes.app_ui.AttachmentAsset
import io.valdiroutes.app_ui.AttachmentSelection
import io.valdiroutes.app_ui.BottomSheetRequest
import io.valdiroutes.app_ui.DatePickerRequest
import io.valdiroutes.app_ui.ImagePreviewRequest
import io.valdiroutes.app_ui.LoadingRequest
import io.valdiroutes.app_ui.ModalReply
import io.valdiroutes.app_ui.ModalRequest
import io.valdiroutes.app_ui.PickerRequest
import io.valdiroutes.app_ui.PresentationReply
import io.valdiroutes.app_ui.ScanCodeReply
import io.valdiroutes.app_ui.ToastRequest
import kotlin.concurrent.thread

/**
 * App-wide typed Promise boundary. AppUI still owns the queue, page cancellation and closing animations;
 * only its native completion settles a presentation, without retaining a JS callback from the calling page.
 */
class AppUIHostImpl(context: Context) : AppUIHost {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    override fun showModal(request: ModalRequest): Promise<ModalReply> = onMain { promise ->
        AppUI.showModal(
            ModalOptions(
                request.title, request.content, request.showCancel, request.confirmText, request.cancelText,
                request.editable, request.placeholderText, request.defaultText,
            ),
        ) { result -> AppUIPromise.complete(promise, result) { ModalReply(it.confirm, it.cancel, it.content) } }
    }

    override fun showActionSheet(request: ActionSheetRequest): Promise<PresentationReply> =
        present { ActionSheetOptions(request.itemList, request.title) }

    override fun showPicker(request: PickerRequest): Promise<PresentationReply> = present {
        PickerOptions(
            request.options.map { PickerItem(it.value, it.label) }, request.title, request.value,
            request.confirmText, request.cancelText,
        )
    }

    override fun showDatePicker(request: DatePickerRequest): Promise<PresentationReply> {
        val mode = when (request.mode) {
            "year" -> DatePickerMode.Year
            "year-month" -> DatePickerMode.YearMonth
            "date" -> DatePickerMode.Date
            "time" -> DatePickerMode.Time
            "datetime" -> DatePickerMode.DateTime
            else -> return AppUIPromise.reject(IllegalArgumentException("unsupported picker mode"))
        }
        return present {
            DatePickerOptions(
                request.title, mode, request.value, request.minYear.toInt(), request.maxYear.toInt(),
                request.confirmText, request.cancelText,
            )
        }
    }

    override fun showBottomSheet(request: BottomSheetRequest): Promise<PresentationReply> = present {
        BottomSheetOptions(
            request.title, request.content, request.confirmText, request.cancelText,
            request.showCancel, request.dismissible,
        )
    }

    override fun previewImage(request: ImagePreviewRequest): Promise<PresentationReply> =
        present { ImagePreviewOptions(request.urls, request.current) }

    override fun scanCode(): Promise<ScanCodeReply> = onMain { promise ->
        AppUI.scanCode { result -> AppUIPromise.complete(promise, result) { ScanCodeReply(it.result, it.scanType) } }
    }

    override fun pickAttachments(source: String, limit: Double, mimeTypes: List<String>): Promise<AttachmentSelection> =
        onMain { promise ->
            AppUI.pickAttachments(source, limit.toInt(), mimeTypes) { result ->
                AppUIPromise.complete(promise, result) { assets ->
                    AttachmentSelection(assets.isEmpty(), assets.map {
                        AttachmentAsset(it.id, it.uri, it.name, it.mimeType, it.size)
                    })
                }
            }
        }

    override fun clearAttachmentCache(): Promise<Unit> =
        // File deletion stays off both the JS and the main thread.
        AppUIPromise.background({ thread(name = "attachment-cache", block = it) }) { AttachmentCache.clear(appContext) }

    override fun showToast(request: ToastRequest): Promise<Unit> = feedback {
        AppUI.showToast(ToastOptions(request.title, request.icon, request.duration.toLong(), request.mask))
    }

    override fun hideToast(): Promise<Unit> = feedback { AppUI.hideToast() }

    override fun showLoading(request: LoadingRequest): Promise<Unit> = feedback {
        AppUI.showLoading(LoadingOptions(request.title, request.mask))
    }

    override fun hideLoading(): Promise<Unit> = feedback { AppUI.hideLoading() }

    private fun present(options: () -> AppPresentationOptions): Promise<PresentationReply> = onMain { promise ->
        AppUI.showPresentation(options()) { result ->
            AppUIPromise.complete(promise, result) { PresentationReply(it.confirm, it.cancel, it.value, it.index.toDouble()) }
        }
    }

    private fun feedback(action: () -> Unit): Promise<Unit> = onMain { promise ->
        action()
        promise.fulfillSuccess(Unit)
    }

    /** Always enqueue, matching the original host even when called on main. */
    private fun <T> onMain(action: (ResolvablePromise<T>) -> Unit): Promise<T> =
        AppUIPromise.onMain({ main.post(it) }, action)
}

/** Only dispatch and settlement; AppUI retains sole ownership of presentation queuing and page cancellation. */
internal object AppUIPromise {
    fun <T> onMain(post: (() -> Unit) -> Boolean, action: (ResolvablePromise<T>) -> Unit): Promise<T> =
        ResolvablePromise<T>().also { promise ->
            try {
                check(post {
                    try {
                        action(promise)
                    } catch (error: Throwable) {
                        fail(promise, error)
                    }
                }) { "Main thread is unavailable" }
            } catch (error: Throwable) {
                fail(promise, error)
            }
        }

    fun <T, R> complete(promise: ResolvablePromise<R>, result: Result<T>, map: (T) -> R) {
        result.mapCatching(map).fold(promise::fulfillSuccess) { fail(promise, it) }
    }

    fun background(start: (() -> Unit) -> Unit, action: () -> Unit): Promise<Unit> =
        ResolvablePromise<Unit>().also { promise ->
            try {
                start { complete(promise, runCatching(action)) { } }
            } catch (error: Throwable) {
                fail(promise, error)
            }
        }

    fun <T> reject(error: Throwable): Promise<T> = Promise.reject(rejection(error))

    private fun <T> fail(promise: ResolvablePromise<T>, error: Throwable) {
        promise.fulfillFailure(rejection(error))
    }

    /** Match the former callback's public message, with a nonblank native failure and its original native code. */
    private fun rejection(error: Throwable) = PromiseRejectionException(
        (error.message ?: error.toString()).ifBlank { "AppUI operation failed" },
        error.valdiErrorCode(),
    )
}
