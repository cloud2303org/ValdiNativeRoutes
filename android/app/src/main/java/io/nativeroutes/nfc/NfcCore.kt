// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/NfcCore.kt).
package io.nativeroutes.nfc

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/** Application-owned facade, shared by native hosts and React Native adapters. */
object NfcCore {
    private var core: NfcReaderCore? = null
    private var platform: AndroidNfcPlatform? = null

    @JvmStatic
    @Synchronized
    fun install(context: Context): NfcReaderCore {
        val existing = core
        if (existing != null) {
            if (context is Activity) platform?.offerForegroundActivity(context)
            return existing
        }
        val application = context.applicationContext as? Application
            ?: throw NfcException(13017, "An Android Application context is required")
        val handler = Handler(Looper.getMainLooper())
        val control = Executor { handler.post(it) }
        val driver = AndroidNfcPlatform(application, handler)
        val reader = NfcReaderCore(
            driver,
            control,
            Executors.newSingleThreadExecutor { task -> Thread(task, "NfcTagIO").apply { isDaemon = true } },
            Executors.newSingleThreadExecutor { task -> Thread(task, "NfcTagClose").apply { isDaemon = true } }
        )
        platform = driver
        core = reader
        if (context is Activity) driver.offerForegroundActivity(context)
        return reader
    }

    /** Only needed when first installation happens after this Activity has already resumed. */
    @JvmStatic
    @Synchronized
    fun offerForegroundActivity(activity: Activity) { platform?.offerForegroundActivity(activity) }
}
