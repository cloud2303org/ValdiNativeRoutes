package io.valdiroutes.mmkv

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

/** Constructed eagerly on main at factory registration, before the first Activity resumes. */
@RegisterValdiModule
class MMKVModuleFactoryImpl(context: Context) : MMKVNativeModuleFactory() {
    private val implementation = StorageHostImpl(context.applicationContext)
    private val module = object : MMKVNativeModule {
        override fun getHost(): StorageHost = implementation.host
    }

    override fun onLoadModule(): MMKVNativeModule = module
}
