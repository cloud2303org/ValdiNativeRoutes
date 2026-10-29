// Ported from ExpoNativeRoutes (android/native/ui/.../AppFeedbackHost.kt): Toast and Loading each get their own
// transparent Dialog window, so they sit above the page, the sheet and the modal dialog.

package io.valdiroutes.app.appui

import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.view.WindowCompat
import kotlin.math.roundToInt

/** Two independent slots, the timed toast above the loading. A mask swallows touches and Back. */
class AppFeedbackHost(private val activity: Activity) {
    private data class Feedback(val title: String, val icon: String, val mask: Boolean, val window: Dialog)

    private val handler = Handler(Looper.getMainLooper())
    private var toast: Feedback? = null
    private var loading: Feedback? = null
    private var expiry: Runnable? = null

    fun showToast(title: String, icon: String, duration: Long, mask: Boolean) {
        hideToast()
        val shown = create(title, icon, mask)
        toast = shown
        expiry = Runnable { if (toast === shown) hideToast() }.also { handler.postDelayed(it, duration) }
    }

    fun hideToast() {
        expiry?.let(handler::removeCallbacks)
        expiry = null
        toast?.window?.dismiss()
        toast = null
    }

    fun showLoading(title: String, mask: Boolean) {
        hideLoading()
        loading = create(title, "loading", mask)
        // The new loading window is on top; an existing toast goes back above it.
        toast?.let { shown -> handler.post { if (toast === shown) reattach(shown) } }
    }

    fun hideLoading() {
        loading?.window?.dismiss()
        loading = null
    }

    /** Puts both slots back above a window that was just shown, keeping their content and expiry. */
    fun raise() {
        handler.post {
            if (activity.isFinishing || activity.isDestroyed) return@post clear()
            listOfNotNull(loading, toast).forEach(::reattach)
        }
    }

    fun clear() {
        hideToast()
        hideLoading()
    }

    private fun reattach(feedback: Feedback) {
        feedback.window.dismiss()
        feedback.window.show()
        feedback.window.window?.setLayout(-1, -1)
    }

    private fun create(title: String, icon: String, mask: Boolean): Feedback {
        check(!activity.isFinishing && !activity.isDestroyed) { "No foreground activity" }
        val density = activity.resources.displayMetrics.density
        fun dp(value: Int) = (value * density).roundToInt()
        val dialog = Dialog(activity).apply {
            setCancelable(false)
            setCanceledOnTouchOutside(false)
            setOnKeyListener { _, keyCode, _ -> mask && keyCode == KeyEvent.KEYCODE_BACK }
        }
        val label = TextView(activity).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            includeFontPadding = false
            maxWidth = dp(280)
        }
        val panel = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(18), dp(20), dp(18))
            minimumWidth = dp(if (icon == "none") 48 else 136)
            minimumHeight = dp(if (icon == "none") 48 else 136)
            background = GradientDrawable().apply {
                setColor(Color.argb(240, 24, 28, 35))
                cornerRadius = dp(12).toFloat()
            }
            if (icon == "loading") {
                addView(ProgressBar(activity).apply {
                    isIndeterminate = true
                    indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
                }, LinearLayout.LayoutParams(dp(48), dp(48)))
            } else if (icon != "none") {
                addView(TextView(activity).apply {
                    text = if (icon == "error") "✕" else "✓"
                    setTextColor(Color.WHITE)
                    textSize = 36f
                    gravity = Gravity.CENTER
                }, LinearLayout.LayoutParams(dp(48), dp(48)))
            }
            addView(label, LinearLayout.LayoutParams(-2, -2).apply { if (icon != "none") topMargin = dp(12) })
        }
        dialog.setContentView(FrameLayout(activity).apply {
            if (mask) setOnTouchListener { _, _ -> true }
            addView(panel, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        })
        dialog.window!!.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setDimAmount(0f)
            // Edge to edge like the activity, drawing transparent bar backgrounds; otherwise the dialog window paints
            // the system bars black under whatever page is showing.
            WindowCompat.setDecorFitsSystemWindows(this, false)
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
            @Suppress("DEPRECATION")
            statusBarColor = Color.TRANSPARENT
            @Suppress("DEPRECATION")
            navigationBarColor = Color.TRANSPARENT
            if (Build.VERSION.SDK_INT >= 29) isNavigationBarContrastEnforced = false
            WindowCompat.getInsetsController(this, decorView).apply {
                isAppearanceLightStatusBars = true
                isAppearanceLightNavigationBars = true
            }
            addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)
            // Without a mask touches go through and the keyboard keeps its focus. A mask takes the focus (for Back) but
            // isn't the keyboard's target: it has nothing to type in, and the keyboard would show for it.
            if (!mask) addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)
            else addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM)
            attributes = attributes.apply {
                width = -1
                height = -1
                gravity = Gravity.CENTER
                windowAnimations = 0
            }
        }
        // A mask's window takes the focus, which the page's focused field would get back once the mask is dismissed,
        // and its keyboard with it (signing in: up again while the app navigates away). The field loses its focus
        // first (onEditEnd, as tapping elsewhere), and the keyboard goes down.
        if (mask) {
            activity.currentFocus?.let { focused ->
                focused.clearFocus()
                activity.getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(focused.windowToken, 0)
            }
        }
        // Android 13+ dispatches predictive Back without a KEYCODE_BACK event.
        if (mask && Build.VERSION.SDK_INT >= 33) {
            val callback = OnBackInvokedCallback { }
            dialog.setOnShowListener {
                dialog.onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback)
            }
            dialog.setOnDismissListener { dialog.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback) }
        }
        dialog.show()
        dialog.window!!.setLayout(-1, -1)
        return Feedback(title, icon, mask, dialog)
    }
}
