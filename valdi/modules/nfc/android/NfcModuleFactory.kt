package io.valdiroutes.nfc

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

/** Constructed eagerly on main at factory registration, before the first Activity resumes. */
@RegisterValdiModule
class NfcModuleFactoryImpl(context: Context) : NfcNativeModuleFactory() {
    private val implementation = NfcHostImpl(context.applicationContext)
    private val module = object : NfcNativeModule {
        override fun getHost(): NfcHost = implementation
    }

    override fun onLoadModule(): NfcNativeModule = module
}
