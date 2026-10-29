package io.valdiroutes.app.appui

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.nativeroutes.ui.AttachmentAsset
import io.nativeroutes.ui.AttachmentCache
import io.nativeroutes.ui.AttachmentPicker
import io.nativeroutes.ui.CodeScanner
import io.nativeroutes.ui.ScanCodeResult
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

// The native side of `api` (valdi/modules/app_pages/src/api.ts), after ExpoNativeRoutes' AppUI: Valdi pages reach it
// through AppUIHost, native pages call NativeApp.ui directly. Every page here is drawn by the host, so the modal is
// always the host's own dialog over whichever page is on top.

data class ModalOptions(
    val title: String = "", val content: String = "", val showCancel: Boolean = true,
    val confirmText: String = "确定", val cancelText: String = "取消", val editable: Boolean = false,
    val placeholderText: String = "", val defaultText: String = "",
)

data class ModalResult(val confirm: Boolean, val cancel: Boolean, val content: String = "") {
    val errMsg: String get() = "showModal:ok"

    companion object {
        fun cancelled() = ModalResult(confirm = false, cancel = true)
    }
}

data class ToastOptions(val title: String, val icon: String = "success", val duration: Long = 1500, val mask: Boolean = false)
data class LoadingOptions(val title: String, val mask: Boolean = false)
data class APISuccess(val errMsg: String)

class AppAPIError(method: String, cause: Throwable) : Exception("$method:fail ${cause.message ?: cause}", cause) {
    val errMsg: String get() = message!!
}

data class ActionSheetResult(val tapIndex: Int) {
    val errMsg: String get() = "showActionSheet:ok"
}

data class PickerResult(val confirm: Boolean, val cancel: Boolean, val value: String, val index: Int) {
    val errMsg: String get() = "showPicker:ok"
}

data class DatePickerResult(val confirm: Boolean, val cancel: Boolean, val value: String) {
    val errMsg: String get() = "showDatePicker:ok"
}

data class BottomSheetResult(val confirm: Boolean, val cancel: Boolean) {
    val errMsg: String get() = "showBottomSheet:ok"
}

/** Typed presentation data, as in ExpoNativeRoutes' AppPresentationOptions; the host picks the Compose controls. */
sealed interface AppPresentationOptions
data class ActionSheetOptions(val itemList: List<String>, val alertText: String = "") : AppPresentationOptions
data class PickerItem(val value: String, val label: String)
data class PickerOptions(
    val options: List<PickerItem>, val title: String = "", val value: String = "",
    val confirmText: String = "确定", val cancelText: String = "取消",
) : AppPresentationOptions
enum class DatePickerMode { Year, YearMonth, Date, Time, DateTime }
data class DatePickerOptions(
    val title: String = "", val mode: DatePickerMode = DatePickerMode.Date, val value: String = "",
    val minYear: Int = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR) - 5,
    val maxYear: Int = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR) + 5,
    val confirmText: String = "确定", val cancelText: String = "取消",
) : AppPresentationOptions
data class BottomSheetOptions(
    val title: String = "", val content: String = "", val confirmText: String = "确定",
    val cancelText: String = "取消", val showCancel: Boolean = true, val dismissible: Boolean = true,
) : AppPresentationOptions
data class ImagePreviewOptions(val urls: List<String>, val current: String = "") : AppPresentationOptions

/** Shared reply: the selection, the date, or for previewImage the image shown last. */
data class PresentationResult(val confirm: Boolean, val cancel: Boolean, val value: String = "", val index: Int = -1) {
    companion object {
        fun cancelled(value: String = "") = PresentationResult(false, true, value)
    }
}

/** What the Compose host renders; [open] goes false to animate it out, then [AppUI.modalClosed]. */
class ModalPresentation internal constructor(val requestId: String, val pageId: String, val options: ModalOptions) {
    var open by mutableStateOf(true)
        internal set
    internal var result: ModalResult? = null
}

/** Same lifecycle as [ModalPresentation], ending in [AppUI.presentationClosed]. */
class AppPresentation internal constructor(val requestId: String, val pageId: String, val options: AppPresentationOptions) {
    var open by mutableStateOf(true)
        internal set
    internal var result: PresentationResult? = null
}

/** Native callers: suspend functions with local types, errors as [AppAPIError]. */
object NativeApp {
    val ui = AppUIService
}

object AppUIService {
    private suspend fun <T> api(method: String, operation: suspend () -> T): T = try {
        operation()
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        throw AppAPIError(method, error)
    }

    suspend fun showModal(options: ModalOptions = ModalOptions()): ModalResult = api("showModal") {
        suspendCancellableCoroutine { continuation ->
            var requestId: String? = null
            AppUI.onMain {
                requestId = AppUI.showModal(options) { result ->
                    if (continuation.isActive) result.fold(continuation::resume, continuation::resumeWithException)
                }
            }
            continuation.invokeOnCancellation { AppUI.onMain { requestId?.let(AppUI::cancelRequest) } }
        }
    }

    private suspend fun present(options: AppPresentationOptions): PresentationResult = suspendCancellableCoroutine { continuation ->
        var requestId: String? = null
        AppUI.onMain {
            if (!continuation.isActive) return@onMain
            try {
                requestId = AppUI.showPresentation(options) { result ->
                    if (continuation.isActive) result.fold(continuation::resume, continuation::resumeWithException)
                }
            } catch (error: Throwable) {
                if (continuation.isActive) continuation.resumeWithException(error)
            }
        }
        continuation.invokeOnCancellation { AppUI.onMain { requestId?.let(AppUI::cancelRequest) } }
    }

    suspend fun showActionSheet(options: ActionSheetOptions) = api("showActionSheet") {
        val result = present(options)
        check(!result.cancel) { "cancel" }
        ActionSheetResult(result.index)
    }

    suspend fun showPicker(options: PickerOptions) = api("showPicker") {
        val result = present(options)
        PickerResult(result.confirm, result.cancel, result.value, result.index)
    }

    suspend fun showDatePicker(options: DatePickerOptions = DatePickerOptions()) = api("showDatePicker") {
        val result = present(options)
        DatePickerResult(result.confirm, result.cancel, result.value)
    }

    suspend fun showBottomSheet(options: BottomSheetOptions = BottomSheetOptions()) = api("showBottomSheet") {
        val result = present(options)
        BottomSheetResult(result.confirm, result.cancel)
    }

    suspend fun previewImage(options: ImagePreviewOptions) = api("previewImage") {
        present(options)
        APISuccess("previewImage:ok")
    }

    suspend fun showToast(options: ToastOptions) = api("showToast") { run { AppUI.showToast(options) }; APISuccess("showToast:ok") }
    suspend fun hideToast() = api("hideToast") { run { AppUI.hideToast() }; APISuccess("hideToast:ok") }
    suspend fun showLoading(options: LoadingOptions) =
        api("showLoading") { run { AppUI.showLoading(options) }; APISuccess("showLoading:ok") }
    suspend fun hideLoading() = api("hideLoading") { run { AppUI.hideLoading() }; APISuccess("hideLoading:ok") }

    private suspend fun run(action: () -> Unit): Unit = suspendCancellableCoroutine { continuation ->
        AppUI.onMain {
            if (!continuation.isActive) return@onMain
            runCatching(action).fold({ continuation.resume(Unit) }, continuation::resumeWithException)
        }
    }
}

/**
 * Main-thread, Activity-owned presentation state. Modals and the other presentations share one serial queue, as in
 * ExpoNativeRoutes' AppUIDispatcher: each is owned by the page on top when it is shown and is cancelled when that page
 * is covered or removed, and resolves only after it has finished closing. Toast and Loading have their own slots.
 */
object AppUI {
    private class Request(val id: String, val payload: Any, val done: (Result<PresentationResult>) -> Unit) {
        /** What a cancel answers: no value, pickers included, as in ExpoNativeRoutes. */
        fun cancelled() = PresentationResult.cancelled()
    }

    private val main = Handler(Looper.getMainLooper())
    private var activity: ComponentActivity? = null
    private var feedback: AppFeedbackHost? = null
    private var topPageId: String? = null
    private val pending = ArrayDeque<Request>()
    private var active: Request? = null
    private var scanner: CodeScanner? = null
    private var picker: AttachmentPicker? = null

    /** The modal to draw, if any. */
    var modal by mutableStateOf<ModalPresentation?>(null)
        private set

    /** The action sheet, picker, bottom sheet or image preview to draw, if any. */
    var presentation by mutableStateOf<AppPresentation?>(null)
        private set

    fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    fun attach(activity: ComponentActivity) {
        this.activity = activity
        feedback = AppFeedbackHost(activity)
        schedule()
    }

    fun detach(activity: ComponentActivity) {
        if (this.activity !== activity) return
        feedback?.clear()
        feedback = null
        this.activity = null
        pending.toList().forEach { pending.remove(it); it.done(Result.success(it.cancelled())) }
        active?.let { finish(it, it.cancelled()) }
        scanner?.cancel()
        picker?.dispose()
    }

    /**
     * The camera scanner over the whole activity, outside the presentation queue, as in ExpoNativeRoutes'
     * UIRuntimeModule; closing it fails with "cancel". Call on main.
     */
    fun scanCode(done: (Result<ScanCodeResult>) -> Unit) {
        val host = activity ?: return done(Result.failure(IllegalStateException("No foreground activity")))
        if (scanner != null) return done(Result.failure(IllegalStateException("scanner already open")))
        val presenter = CodeScanner(host)
        scanner = presenter
        presenter.scanCode { result ->
            if (scanner === presenter) scanner = null
            done(result)
        }
    }

    /** Photo picker, camera or documents; an empty list means cancelled. Call on main. */
    fun pickAttachments(source: String, limit: Int, mimeTypes: List<String>, done: (Result<List<AttachmentAsset>>) -> Unit) {
        val host = activity ?: return done(Result.failure(IllegalStateException("No foreground activity")))
        if (picker != null) return done(Result.failure(IllegalStateException("附件选择器已打开")))
        val presenter = AttachmentPicker(host)
        picker = presenter
        presenter.pick(source, limit, mimeTypes) { result ->
            if (picker === presenter) picker = null
            presenter.dispose()
            done(result)
        }
    }

    /** The host reports the page on top: the stack's last page, or the sheet above it. */
    fun topPageChanged(pageId: String?) {
        if (topPageId == pageId) return
        topPageId = pageId
        modal?.takeIf { it.pageId != pageId }?.let { close(it.requestId, ModalResult.cancelled()) }
        presentation?.takeIf { it.pageId != pageId }?.let { closePresentation(it.requestId, requireActive(it.requestId).cancelled()) }
        schedule()
    }

    fun showModal(options: ModalOptions, done: (Result<ModalResult>) -> Unit): String =
        enqueue(options.copy()) { result -> done(result.map { ModalResult(it.confirm, it.cancel, it.value) }) }

    /**
     * Options arrive checked: `api` validates them once in TS (schemas.ts); native callers pass valid ones. The snapshot
     * fills in the initial selection.
     */
    fun showPresentation(options: AppPresentationOptions, done: (Result<PresentationResult>) -> Unit): String {
        val snapshot = when (options) {
            is ActionSheetOptions -> options.copy(itemList = options.itemList.toList())
            is PickerOptions -> options.copy(options = options.options.toList(), value = options.value.ifEmpty { options.options.first().value })
            is ImagePreviewOptions -> options.copy(urls = options.urls.toList(), current = options.current.ifEmpty { options.urls.first() })
            else -> options
        }
        return enqueue(snapshot, done)
    }

    private fun enqueue(payload: Any, done: (Result<PresentationResult>) -> Unit): String {
        check(Looper.myLooper() == Looper.getMainLooper())
        val request = Request(UUID.randomUUID().toString(), payload, done)
        if (activity == null) {
            done(Result.failure(IllegalStateException("No foreground activity")))
        } else {
            pending.addLast(request)
            schedule()
        }
        return request.id
    }

    fun cancelRequest(requestId: String) {
        pending.firstOrNull { it.id == requestId }?.let { pending.remove(it); it.done(Result.success(it.cancelled())) }
        modal?.takeIf { it.requestId == requestId }?.let { close(it.requestId, ModalResult.cancelled()) }
        presentation?.takeIf { it.requestId == requestId }?.let { closePresentation(it.requestId, requireActive(it.requestId).cancelled()) }
    }

    /** The dialog asks to close with a result; it animates out and then calls [modalClosed]. */
    fun close(requestId: String, result: ModalResult) {
        val presentation = modal?.takeIf { it.requestId == requestId && it.open } ?: return
        presentation.result = result
        presentation.open = false
    }

    /** Same for the other presentations, ending in [presentationClosed]. */
    fun closePresentation(requestId: String, result: PresentationResult) {
        val presentation = presentation?.takeIf { it.requestId == requestId && it.open } ?: return
        presentation.result = result
        presentation.open = false
    }

    fun modalClosed(requestId: String) {
        val request = active?.takeIf { it.id == requestId } ?: return
        val result = modal?.result ?: ModalResult.cancelled()
        finish(request, PresentationResult(result.confirm, result.cancel, result.content))
        feedback?.raise()
    }

    fun presentationClosed(requestId: String) {
        val request = active?.takeIf { it.id == requestId } ?: return
        finish(request, presentation?.result ?: request.cancelled())
        feedback?.raise()
    }

    /** A dialog or sheet window was attached: Toast and Loading go back above it. */
    fun overlayShown() {
        feedback?.raise()
    }

    fun showToast(options: ToastOptions) {
        requireFeedback().showToast(options.title, options.icon, options.duration, options.mask)
    }

    fun hideToast() {
        feedback?.hideToast()
    }

    fun showLoading(options: LoadingOptions) {
        requireFeedback().showLoading(options.title, options.mask)
    }

    fun hideLoading() {
        feedback?.hideLoading()
    }

    private fun requireFeedback() = checkNotNull(feedback) { "No foreground activity" }

    private fun requireActive(requestId: String) = checkNotNull(active?.takeIf { it.id == requestId })

    private fun schedule() = main.post(::dispatch)

    private fun dispatch() {
        if (active != null || pending.isEmpty() || activity == null) return
        val pageId = topPageId ?: return
        val request = pending.removeFirst()
        active = request
        when (val payload = request.payload) {
            is ModalOptions -> modal = ModalPresentation(request.id, pageId, payload)
            is AppPresentationOptions -> presentation = AppPresentation(request.id, pageId, payload)
        }
    }

    private fun finish(request: Request, result: PresentationResult) {
        if (active !== request) return
        active = null
        modal = null
        presentation = null
        request.done(Result.success(result))
        schedule()
    }
}
