import Foundation

// Field-only transport substitute for this Foundation parser probe.
// The independent iOS consumer separately checks the real generated model ABI.
public final class VRThemeTokens {
    public let light: [String: Any?]
    public let dark: [String: Any?]
    public let shared: [String: Any?]

    public init(light: [String: Any?], dark: [String: Any?], shared: [String: Any?]) {
        self.light = light
        self.dark = dark
        self.shared = shared
    }
}

@main
enum ThemeTokensStoreTests {
    static func main() throws {
        let scenario = CommandLine.arguments[1]
        if scenario == "valid" {
            let tokens = try ThemeTokensStore.shared.tokens
            precondition(tokens.light["surface"] as? String == "#ffffff")
            precondition(tokens.dark["surface"] as? String == "#1E1F23")
            precondition(!(tokens.shared.isEmpty))
            // A second access must use the cached model rather than read/decode again.
            let url = Bundle.main.url(forResource: "tokens", withExtension: "json")!
            try Data("{".utf8).write(to: url)
            let cached = try ThemeTokensStore.shared.tokens
            precondition(cached === tokens)
        } else {
            do {
                _ = try ThemeTokensStore.shared.tokens
                fatalError("Invalid or missing tokens must throw, not return empty palettes")
            } catch {
                if scenario == "malformed" {
                    precondition(error is DecodingError, "The original JSON decoder error must propagate")
                }
            }
        }
        print("PASS \(scenario)")
    }
}
