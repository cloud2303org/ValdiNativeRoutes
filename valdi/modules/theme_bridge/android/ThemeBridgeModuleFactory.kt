package io.valdiroutes.app.modules.theme_bridge

import android.content.Context
import com.snap.valdi.modules.RegisterValdiModule
import java.io.FileNotFoundException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject

/**
 * The app's design tokens, owned here so pure native UI and Valdi pages read one source.
 * tokens.json ships in the app's assets and is parsed once on first access.
 * To add or change a token: edit tokens.json; both platforms and Valdi pick it up.
 * To access from pure native UI: ThemeTokensStore.instance (light/dark/shared).
 */
object ThemeTokensStore {
    var tokens: ThemeTokens = ThemeTokens(mapOf(), mapOf(), mapOf())
        private set

    fun initialize(context: Context) {
        if (tokens.light.isNotEmpty()) return
        val asset = try {
            context.assets.open("theme_bridge/tokens.json")
        } catch (_: FileNotFoundException) {
            context.assets.open("tokens.json")
        }
        val root = asset.bufferedReader().use {
            Json.parseToJsonElement(it.readText()).jsonObject
        }
        tokens = ThemeTokens(
            light = Json.decodeFromJsonElement<Map<String, String>>(root.getValue("light")),
            dark = Json.decodeFromJsonElement<Map<String, String>>(root.getValue("dark")),
            shared = Json.decodeFromJsonElement<Map<String, Map<String, Double>>>(root.getValue("shared")),
        )
    }
}

@RegisterValdiModule
class ThemeBridgeModuleFactoryImpl(private val context: Context) : ThemeBridgeModuleFactory() {
    private val module = object : ThemeBridgeModule {
        private val nativeHost = ThemeHost {
            ThemeTokensStore.initialize(context.applicationContext)
            ThemeTokensStore.tokens
        }
        override fun getHost(): ThemeHost = nativeHost
    }

    override fun onLoadModule(): ThemeBridgeModule = module
}
