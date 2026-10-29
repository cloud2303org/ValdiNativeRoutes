// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/CodeScanner.kt).
package io.nativeroutes.ui

import android.os.Looper
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.ComponentDialog
import androidx.activity.addCallback
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.view.WindowCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner

data class ScanCodeResult(val result: String, val scanType: String)

/** One native camera presentation, shared by Kotlin callers and the RN API. Call on main. */
class CodeScanner(private val activity: ComponentActivity) : DefaultLifecycleObserver {
    private var dialog: ComponentDialog? = null
    private var content: ComposeView? = null
    private var completion: ((Result<ScanCodeResult>) -> Unit)? = null

    fun scanCode(completion: (Result<ScanCodeResult>) -> Unit) {
        check(Looper.myLooper() == Looper.getMainLooper()) { "scanCode must run on main" }
        if (active != null) { completion(Result.failure(IllegalStateException("scanner already open"))); return }
        if (activity.isFinishing || activity.isDestroyed || !activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            completion(Result.failure(IllegalStateException("no foreground activity"))); return
        }
        active = this
        this.completion = completion
        activity.lifecycle.addObserver(this)
        try {
            val window = ComponentDialog(activity, android.R.style.Theme_Material_NoActionBar)
            dialog = window
            val view = ComposeView(activity).apply {
                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
                setContent {
                    val density = LocalDensity.current
                    CompositionLocalProvider(LocalUiAppearance provides UiAppearance.Dark) {
                        MaterialTheme(colorScheme = darkColorScheme()) {
                            Scanner(active = true, onScan = { scan ->
                                val format = when (scan.type) {
                                    "qr" -> "QR_CODE"
                                    "ean13" -> "EAN_13"
                                    "ean8" -> "EAN_8"
                                    "code128" -> "CODE_128"
                                    "code39" -> "CODE_39"
                                    "upc_a" -> "UPC_A"
                                    else -> return@Scanner
                                }
                                finish(Result.success(ScanCodeResult(scan.value, format)))
                            }, onBack = ::cancel, modifier = Modifier.fillMaxSize(),
                                topInset = WindowInsets.systemBars.getTop(density) / density.density,
                                bottomInset = WindowInsets.systemBars.getBottom(density) / density.density)
                        }
                    }
                }
            }
            content = view
            window.setContentView(view)
            window.onBackPressedDispatcher.addCallback(window) { cancel() }
            window.setOnDismissListener { cancel() }
            window.show()
            window.window?.apply {
                setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                WindowCompat.setDecorFitsSystemWindows(this, false)
                WindowCompat.getInsetsController(this, decorView).apply {
                    isAppearanceLightStatusBars = false
                    isAppearanceLightNavigationBars = false
                }
            }
        } catch (error: Exception) { finish(Result.failure(error)) }
    }

    fun cancel() { finish(Result.failure(IllegalStateException("cancel"))) }
    override fun onDestroy(owner: LifecycleOwner) { cancel() }

    private fun finish(result: Result<ScanCodeResult>) {
        val callback = completion ?: return
        completion = null
        activity.lifecycle.removeObserver(this)
        // Release the camera before settling the API, so another call can start immediately.
        content?.disposeComposition()
        content = null
        dialog?.setOnDismissListener(null)
        dialog?.dismiss()
        dialog = null
        if (active === this) active = null
        callback(result)
    }

    private companion object { var active: CodeScanner? = null }
}
