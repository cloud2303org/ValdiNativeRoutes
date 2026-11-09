package io.valdiroutes.app

import android.app.Application
import com.snap.valdi.modules.ModuleFactoryRegistry
import io.valdiroutes.pages.AppContextHost
import io.valdiroutes.pages.AppContextNativeModule
import io.valdiroutes.pages.AppContextNativeModuleFactory
import io.valdiroutes.pages.NavigationHost

/** Registered before any runtime is created; factories retain the app's capabilities. */
internal object AppNativeModules {
    fun register(app: Application, navigationHost: NavigationHost) {
        val appContext = AppContextModuleFactoryImpl(navigationHost)
        ModuleFactoryRegistry.registerModuleFactory { appContext }
        val splash = SplashScreenModuleFactoryImpl()
        ModuleFactoryRegistry.registerModuleFactory { splash }
    }
}

private class AppContextHostImpl(
    private val navigationHost: NavigationHost,
) : AppContextHost {
    override fun getNavigationHost(): NavigationHost = navigationHost
}

private class AppContextModuleFactoryImpl(navigationHost: NavigationHost) :
    AppContextNativeModuleFactory() {
    private val host = AppContextHostImpl(navigationHost)
    private val module = object : AppContextNativeModule {
        override fun getHost(): AppContextHost = host
    }

    override fun onLoadModule(): AppContextNativeModule = module
}
