// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/AndroidNfcPlatform.kt).
package io.nativeroutes.nfc

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.nfc.NfcManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/** Activity lifecycle and reader mode only; tag I/O belongs to the background scheduler. */
internal class AndroidNfcPlatform(private val application: Application, private val main: Handler) : NfcReaderPlatform {
    private val activityStates = WeakHashMap<Activity, Boolean>()
    private var foreground = WeakReference<Activity>(null)
    private var readerActivity = WeakReference<Activity>(null)
    private var readerRevision = 0L
    private var invalidated: ((NfcException) -> Unit)? = null
    private val adapter: NfcAdapter? by lazy {
        (application.getSystemService(Context.NFC_SERVICE) as? NfcManager)?.defaultAdapter
    }

    init {
        application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                activityStates[activity] = true
                foreground = WeakReference(activity)
            }
            override fun onActivityPaused(activity: Activity) {
                activityStates[activity] = false
                if (foreground.get() === activity) foreground.clear()
                if (readerActivity.get() === activity) invalidate(NfcException(13017, "Reader Activity left the foreground"))
            }
            override fun onActivityDestroyed(activity: Activity) {
                activityStates.remove(activity)
                if (foreground.get() === activity) foreground.clear()
                if (readerActivity.get() === activity) invalidate(NfcException(13017, "Reader Activity was destroyed"))
            }
            override fun onActivityCreated(activity: Activity, state: Bundle?) { activityStates[activity] = false }
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
        })
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == NfcAdapter.ACTION_ADAPTER_STATE_CHANGED && readerActivity.get() != null && adapter?.isEnabled != true) {
                    invalidate(NfcException(13001, "System NFC switch was turned off"))
                }
            }
        }
        val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) application.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else application.registerReceiver(receiver, filter)
    }

    fun offerForegroundActivity(activity: Activity) {
        val reference = WeakReference(activity)
        main.post {
            val candidate = reference.get() ?: return@post
            if (candidate.isFinishing || candidate.isDestroyed) return@post
            // Lifecycle evidence wins; window focus is only a bootstrap for late installation.
            val resumed = activityStates[candidate] ?: candidate.hasWindowFocus()
            if (resumed) {
                activityStates[candidate] = true
                foreground = WeakReference(candidate)
            }
        }
    }

    private fun currentActivity(): Activity? = foreground.get()?.takeIf {
        activityStates[it] == true && !it.isFinishing && !it.isDestroyed
    }

    override fun availability(): NfcAvailability {
        val hardware = application.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC) && adapter != null
        return NfcAvailability(
            supported = hardware,
            enabled = hardware && adapter?.isEnabled == true,
            foreground = currentActivity() != null,
            permissionGranted = application.checkSelfPermission(Manifest.permission.NFC) == PackageManager.PERMISSION_GRANTED
        )
    }

    override fun startReader(onTag: (NfcPlatformTag) -> Unit, onInvalidated: (NfcException) -> Unit) {
        val hardware = adapter ?: throw NfcException(13000, "No NFC reader is available")
        val activity = currentActivity() ?: throw NfcException(13017, "A resumed Activity is required")
        if (!hardware.isEnabled) throw NfcException(13001, "System NFC switch is off")
        val revision = ++readerRevision
        readerActivity = WeakReference(activity)
        invalidated = onInvalidated
        try {
            hardware.enableReaderMode(activity, { discovered ->
                val snapshot = AndroidNfcTag(discovered)
                main.post {
                    if (revision != readerRevision || readerActivity.get() == null || currentActivity() !== readerActivity.get()) return@post
                    if (!hardware.isEnabled) { invalidate(NfcException(13001, "System NFC switch is off")); return@post }
                    onTag(snapshot)
                }
            }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null)
        } catch (error: SecurityException) {
            stopReader()
            throw NfcException(13019, "android.permission.NFC is missing", error)
        } catch (error: Throwable) {
            stopReader()
            throw NfcException(13017, "Could not enable NFC reader mode", error)
        }
    }

    override fun stopReader() {
        readerRevision += 1
        val activity = readerActivity.get()
        readerActivity.clear()
        invalidated = null
        if (activity != null) runCatching { adapter?.disableReaderMode(activity) }
    }

    private fun invalidate(error: NfcException) {
        val callback = invalidated
        stopReader()
        callback?.invoke(error)
    }
}
