package io.valdiroutes.app_ui

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

/** Constructed eagerly on main at factory registration, before the first Activity resumes. */
@RegisterValdiModule
class AppUIModuleFactoryImpl(context: Context) : AppUINativeModuleFactory() {
    private val implementation = AppUIHostImpl(context.applicationContext)
    private val module = object : AppUINativeModule {
        override fun getHost(): AppUIHost = implementation
    }

    override fun onLoadModule(): AppUINativeModule = module
}
