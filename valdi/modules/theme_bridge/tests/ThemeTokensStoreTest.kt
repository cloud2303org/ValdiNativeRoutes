package io.valdiroutes.app.modules.theme_bridge

import android.content.Context
import android.content.res.AssetManager
import java.io.File

private const val PRIMARY = "theme_bridge/tokens.json"
private const val FALLBACK = "tokens.json"

private fun context(vararg files: Pair<String, String>) = Context(AssetManager(mapOf(*files)))
private fun document(canvas: String) = """{"light":{"canvas":"$canvas"},"dark":{},"shared":{}}"""

private fun load(context: Context): ThemeTokens {
    ThemeTokensStore.initialize(context)
    return ThemeTokensStore.tokens
}

private fun expectFailure(action: () -> Unit) {
    try {
        action()
    } catch (_: Exception) {
        return
    }
    error("Invalid theme must fail")
}

fun main(args: Array<String>) {
    when (val scenario = args[0]) {
        "actual-token-file" -> {
            val ctx = context(PRIMARY to File(args[1]).readText(), FALLBACK to document("wrong"))
            val tokens = load(ctx)
            check(tokens.light.size == 32 && tokens.dark.size == 32 && tokens.shared.size == 6)
            check(tokens.light["canvas"] == "#f5f7fb")
            check(tokens.dark["canvas"] == "#121316")
            check((tokens.shared["radius"] as Map<*, *>)["pill"] == 999.0)
            check((tokens.shared["motion"] as Map<*, *>)["pressedOpacity"] == 0.82)
            check(ctx.assets.opened == listOf(PRIMARY))
        }
        "fixed-structure" -> {
            val tokens = load(context(PRIMARY to """
                {"light":{"color":"#ffffff"},"dark":{"color":"#111111"},
                "shared":{"space":{"small":4},"motion":{"opacity":0.82}}}
            """.trimIndent()))
            check(tokens.light == mapOf("color" to "#ffffff"))
            check(tokens.dark == mapOf("color" to "#111111"))
            check(tokens.shared == mapOf("space" to mapOf("small" to 4.0), "motion" to mapOf("opacity" to 0.82)))
        }
        "missing-primary" -> {
            val ctx = context(FALLBACK to document("fallback"))
            check(load(ctx).light["canvas"] == "fallback")
            check(ctx.assets.opened == listOf(PRIMARY, FALLBACK))
        }
        "malformed-primary" -> {
            val ctx = context(PRIMARY to "{", FALLBACK to document("fallback"))
            expectFailure { load(ctx) }
            check(ctx.assets.opened == listOf(PRIMARY))
        }
        "malformed-fallback" -> expectFailure { load(context(FALLBACK to "{")) }
        "missing-all" -> expectFailure { load(context()) }
        "wrong-palette-type" -> expectFailure {
            load(context(PRIMARY to """{"light":{"color":42},"dark":{},"shared":{}}"""))
        }
        "nonobject-root" -> expectFailure { load(context(PRIMARY to "[]")) }
        "factory-lazy-cache" -> {
            val ctx = context(PRIMARY to document("original"))
            val module = ThemeBridgeModuleFactoryImpl(ctx).onLoadModule()
            check(ctx.assets.opened.isEmpty())
            val host = module.getHost()
            check(ctx.assets.opened.isEmpty())
            val first = host.getTokens()
            check(first.light["canvas"] == "original")
            check(host.getTokens() === first)
            val other = context(PRIMARY to document("changed"))
            check(load(other) === first && other.assets.opened.isEmpty())
            check(ctx.assets.opened == listOf(PRIMARY))
        }
        else -> error("Unknown scenario: $scenario")
    }
    println("PASS ${args[0]}")
}
