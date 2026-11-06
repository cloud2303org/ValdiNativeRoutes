package io.valdiroutes.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        StartupTrace.section("application.onCreate") {
            StartupTrace.section("application.super.onCreate") { super.onCreate() }
            // previewImage's pages load through the shared Coil loader, as in ExpoNativeRoutes' MainApplication.
            StartupTrace.section("application.images.create_and_install") {
                io.valdiroutes.app_ui.ui.NativeImages.install(
                    StartupTrace.section("application.images.create_loader") { AppImages.createLoader(this) },
                )
            }
            StartupTrace.section("application.native_screens.register") { NativeScreens.registerDefaults() }
            StartupTrace.section("application.valdi_host.init") { ValdiHost.init(this) }
        }
    }
}
