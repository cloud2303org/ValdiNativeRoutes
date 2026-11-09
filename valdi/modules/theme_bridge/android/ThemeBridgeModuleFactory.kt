package io.valdiroutes.app.modules.theme_bridge

import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class ThemeBridgeModuleFactoryImpl : ThemeBridgeModuleFactory() {
    private val module = object : ThemeBridgeModule {
        private val nativeHost = ThemeHost { ThemeTokensStore.tokens }
        override fun getHost(): ThemeHost = nativeHost
    }

    override fun onLoadModule(): ThemeBridgeModule = module
}
