import ThemeBridge

// Compiled as a separate module, with the same exported library used by the App.
@main
enum ThemeTokensAccessTests {
    static func main() throws {
        let store = ThemeTokensStore.shared
        let tokens: VRThemeTokens = try store.tokens
        precondition(store === ThemeTokensStore.shared)
        print(tokens.light.count, tokens.dark.count, tokens.shared.count)
    }
}
