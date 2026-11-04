package io.valdiroutes.permissions

import android.content.Context
import android.os.Build
import com.snap.valdi.modules.RegisterValdiModule

/** Application-scoped permission queue exists before the Activity attaches, independent of JS module loading. */
@RegisterValdiModule
class PermissionModuleFactoryImpl(context: Context) : PermissionsNativeModuleFactory() {
    private val implementation = initialize(context.applicationContext)
    private val module = object : PermissionsNativeModule {
        override fun getHost(): PermissionHost = implementation
        override fun getAndroidSdk(): Double = Build.VERSION.SDK_INT.toDouble()
    }
    override fun onLoadModule(): PermissionsNativeModule = module

    companion object {
        @Volatile private var installed: PermissionHostImpl? = null

        @Synchronized private fun initialize(context: Context): PermissionHostImpl =
            installed ?: PermissionHostImpl(context).also { installed = it }

        /** Activity uses attach/onResult/detach on this host after registerFactories has run on main. */
        @JvmStatic fun requireHost(): PermissionHostImpl = checkNotNull(installed) {
            "Register the permissions module factory before attaching the Activity"
        }
    }
}
