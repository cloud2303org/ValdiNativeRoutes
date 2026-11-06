package io.valdiroutes.bluetooth

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class BluetoothModuleFactoryImpl(context: Context) : BluetoothNativeModuleFactory() {
    private val host = BleHostImpl(context.applicationContext)
    private val module = object : BluetoothNativeModule {
        override fun getHost(): BleHost = host
    }

    override fun onLoadModule(): BluetoothNativeModule = module
}
