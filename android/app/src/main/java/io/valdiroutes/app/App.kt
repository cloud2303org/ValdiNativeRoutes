package io.valdiroutes.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // previewImage's pages load through the shared Coil loader, as in ExpoNativeRoutes' MainApplication.
        io.valdiroutes.app_ui.ui.NativeImages.install(AppImages.createLoader(this))
        NativeScreens.registerDefaults()
        ValdiHost.init(this)
    }
}
