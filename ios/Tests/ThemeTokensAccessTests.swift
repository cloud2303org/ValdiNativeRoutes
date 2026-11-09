import ThemeBridge

// An independent consumer of the actual generated models and native store.
@main
enum ThemeTokensAccessTests {
    static func main() throws {
        let store = ThemeTokensStore.shared
        let tokens: VRThemeTokens = store.tokens
        let light: VRThemeColorTokens = tokens.light
        let radius: VRThemeRadiusTokens = tokens.shared.radius
        precondition(store === ThemeTokensStore.shared)
        precondition(store.tokens === tokens)
        precondition(light.surface == "#ffffff")
        precondition(radius.pill == 999)
        print(light.surface, radius.pill)
    }
}
