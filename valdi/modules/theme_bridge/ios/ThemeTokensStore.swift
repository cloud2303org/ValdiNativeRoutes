import Foundation

/// The app's design tokens, owned here so pure native UI and Valdi pages read one source.
/// tokens.json ships with the app's resources and is parsed once on first access.
/// To add or change a token: edit tokens.json; both platforms and Valdi pick it up.
/// To access from pure native UI: ThemeTokensStore.shared (light/dark/shared).
final class ThemeTokensStore {
    static let shared = ThemeTokensStore()

    let tokens: VRThemeTokens

    private init() {
        guard let url = Bundle(for: type(of: self)).url(forResource: "tokens", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let light = root["light"] as? [String: Any?],
              let dark = root["dark"] as? [String: Any?],
              let shared = root["shared"] as? [String: Any?]
        else {
            NSLog("ThemeBridge: tokens.json missing or invalid; native UI and Valdi fall back to empty palettes")
            tokens = VRThemeTokens(light: [:], dark: [:], shared: [:])
            return
        }
        tokens = VRThemeTokens(light: light, dark: dark, shared: shared)
    }
}
