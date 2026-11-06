package io.valdiroutes.app

import android.app.Application
import android.content.Context
import com.snap.valdi.modules.ModuleFactoryRegistry
import io.valdiroutes.pages.AppContextHost
import io.valdiroutes.pages.AppContextNativeModule
import io.valdiroutes.pages.AppContextNativeModuleFactory
import io.valdiroutes.pages.NavigationHost
import io.valdiroutes.pages.TokenStore
import io.valdiroutes.pages.VisionHost
import io.valdiroutes.pages.VisionNativeModule
import io.valdiroutes.pages.VisionNativeModuleFactory

/** Registered before any runtime is created; factories retain the app's capabilities. */
internal object AppNativeModules {
    fun register(app: Application, navigationHost: NavigationHost) {
        val appContext = AppContextModuleFactoryImpl(app.applicationContext, navigationHost)
        val vision = VisionModuleFactoryImpl(app.applicationContext)
        ModuleFactoryRegistry.registerModuleFactory { appContext }
        ModuleFactoryRegistry.registerModuleFactory { vision }
        val splash = SplashScreenModuleFactoryImpl()
        ModuleFactoryRegistry.registerModuleFactory { splash }
    }
}

private class AppContextHostImpl(
    private val context: Context,
    private val navigationHost: NavigationHost,
) : AppContextHost {
    private val tokenStore by lazy {
        StartupTrace.section("hosts.token_store.create") { TokenStoreImpl(context) }
    }

    override fun getNavigationHost(): NavigationHost = navigationHost
    override fun getTokenStore(): TokenStore = tokenStore.store
}

private class AppContextModuleFactoryImpl(context: Context, navigationHost: NavigationHost) :
    AppContextNativeModuleFactory() {
    private val host = AppContextHostImpl(context, navigationHost)
    private val module = object : AppContextNativeModule {
        override fun getHost(): AppContextHost = host
    }

    override fun onLoadModule(): AppContextNativeModule = module
}

private class VisionModuleFactoryImpl(private val context: Context) : VisionNativeModuleFactory() {
    private val host by lazy {
        StartupTrace.section("hosts.vision.create") { VisionHostImpl(context) }
    }
    private val module = object : VisionNativeModule {
        override fun getHost(): VisionHost = host
    }

    override fun onLoadModule(): VisionNativeModule = module
}
