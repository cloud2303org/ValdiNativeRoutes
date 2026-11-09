package io.valdiroutes.app.modules.theme_bridge

fun main(args: Array<String>) {
    val tokens = ThemeTokensStore.tokens
    check(tokens.light.surface == "#ffffff")
    check(tokens.dark.canvas == "#121316")
    check(tokens.shared.radius.pill == 999.0)
    check(tokens.shared.motion.pressedOpacity == 0.82)
    check(tokens === ThemeTokensStore.tokens)
    val module = ThemeBridgeModuleFactoryImpl().onLoadModule()
    val host = module.getHost()
    check(host === module.getHost())
    check(host.getTokens() === tokens)
    check(host.getTokens().shared === tokens.shared)
    println("PASS typed native store and bridge share one token tree")
}
