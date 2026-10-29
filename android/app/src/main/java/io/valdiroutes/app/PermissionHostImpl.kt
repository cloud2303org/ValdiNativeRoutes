package io.valdiroutes.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.valdiroutes.pages.PermissionGrant
import io.valdiroutes.pages.PermissionHost

/**
 * Runtime permissions for permissions/index.ts (BLE, Wi-Fi and NFC ask through it). The foreground activity lends its
 * RequestMultiplePermissions launcher; requests made without one wait for the next activity. Answers are native
 * Promises, so a prompt outlives the page that asked for it.
 */
class PermissionHostImpl(private val context: Context) : PermissionHost {
    private class Request(val permissions: List<String>, val promise: ResolvablePromise<List<PermissionGrant>>)

    private val main = Handler(Looper.getMainLooper())
    private val queue = ArrayDeque<Request>()
    private var inFlight: Request? = null
    private var activity: Activity? = null
    private var launcher: ActivityResultLauncher<Array<String>>? = null

    override fun check(permission: String): Promise<Boolean> = ResolvablePromise<Boolean>().also { it.fulfillSuccess(granted(permission)) }

    override fun requestMultiple(permissions: List<String>): Promise<List<PermissionGrant>> =
        ResolvablePromise<List<PermissionGrant>>().also { promise ->
            main.post {
                queue.addLast(Request(permissions.distinct(), promise))
                next()
            }
        }

    override fun openSettings(): Promise<Unit> = ResolvablePromise<Unit>().also { promise ->
        main.post {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            runCatching { (activity ?: context).startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.fold(
                { promise.fulfillSuccess(Unit) },
                { promise.fulfillFailure(Exception(it.message ?: it.toString())) },
            )
        }
    }

    fun attach(activity: Activity, launcher: ActivityResultLauncher<Array<String>>) {
        this.activity = activity
        this.launcher = launcher
        next()
    }

    fun detach(activity: Activity) {
        if (this.activity !== activity) return
        this.activity = null
        launcher = null
        // The prompt went with the activity; answer from the current state, queued requests wait for the next one.
        inFlight?.let { finish(it, emptyMap()) }
    }

    /** The launcher's result, on main. */
    fun onResult(grants: Map<String, Boolean>) {
        inFlight?.let { finish(it, grants) }
    }

    private fun next() {
        if (inFlight != null) return
        val launcher = launcher ?: return
        val request = queue.removeFirstOrNull() ?: return
        // Permissions already granted are answered without a prompt.
        val missing = request.permissions.filterNot(::granted)
        if (missing.isEmpty()) return finish(request, emptyMap())
        inFlight = request
        try {
            launcher.launch(missing.toTypedArray())
        } catch (error: Exception) {
            finish(request, emptyMap())
        }
    }

    private fun finish(request: Request, grants: Map<String, Boolean>) {
        if (inFlight === request) inFlight = null
        val activity = activity
        request.promise.fulfillSuccess(request.permissions.map { permission ->
            PermissionGrant(permission, when {
                grants[permission] ?: granted(permission) -> "granted"
                // No activity, no prompt was answered: still askable.
                activity == null || ActivityCompat.shouldShowRequestPermissionRationale(activity, permission) -> "denied"
                else -> "never_ask_again"
            })
        })
        main.post(::next)
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}
