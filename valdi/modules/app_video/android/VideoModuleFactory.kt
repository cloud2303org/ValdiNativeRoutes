package io.valdiroutes.video

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

/** The generated context constructor is called eagerly by registerFactories, before Activity attachment. */
@RegisterValdiModule
class VideoModuleFactoryImpl(context: Context) : VideoNativeModuleFactory() {
    private val host = initialize(context)
    private val module = object : VideoNativeModule {
        override fun getHost(): VideoHost = host
    }

    override fun onLoadModule(): VideoNativeModule = module

    companion object {
        // Application resource owner, not a JS runtime. Entries live until player release or Activity destruction.
        @Volatile private var installed: VideoHostImpl? = null

        @Synchronized private fun initialize(context: Context): VideoHostImpl =
            installed ?: VideoHostImpl(context.applicationContext).also { installed = it }

        @JvmStatic fun requireHost(): VideoHostImpl = checkNotNull(installed) {
            "Register the app_video module factory before using its loader or attaching the Activity"
        }
    }
}
