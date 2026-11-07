import Foundation

/// The app's design tokens, owned here so pure native UI and Valdi pages read one source.
/// tokens.json ships with the app's resources and is parsed once on first access.
/// To add or change a token: edit tokens.json; both platforms and Valdi pick it up.
/// Pure native UI imports ThemeBridge and reads try ThemeTokensStore.shared.tokens.
public final class ThemeTokensStore {
    public static let shared = ThemeTokensStore()

    public var tokens: VRThemeTokens {
        get throws { try loaded.get() }
    }

    private let loaded: Result<VRThemeTokens, Error>

    private struct Payload: Decodable {
        let light: [String: String]
        let dark: [String: String]
        let shared: [String: [String: Double]]
    }

    private init() {
        loaded = Result {
            guard let url = Bundle(for: ThemeTokensStore.self).url(forResource: "tokens", withExtension: "json") else {
                throw CocoaError(.fileReadNoSuchFile)
            }
            let payload = try JSONDecoder().decode(Payload.self, from: Data(contentsOf: url))
            return VRThemeTokens(light: payload.light, dark: payload.dark, shared: payload.shared)
        }
    }
}
