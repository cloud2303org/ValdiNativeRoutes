package io.valdiroutes.wifi

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

/** Constructed eagerly on main at factory registration, before the first Activity resumes. */
@RegisterValdiModule
class WifiModuleFactoryImpl(context: Context) : WifiNativeModuleFactory() {
    private val implementation = WifiHostImpl(context.applicationContext)
    private val module = object : WifiNativeModule {
        override fun getHost(): WifiHost = implementation
    }

    override fun onLoadModule(): WifiNativeModule = module
}
