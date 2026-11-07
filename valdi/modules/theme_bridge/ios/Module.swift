import Foundation
import ValdiRuntime

final class ThemeBridgeImplementation: VRThemeBridgeNativeModule {
    private let host = VRThemeHost(getTokens: { ThemeTokensStore.shared.tokens })
    func getHost() -> VRThemeHost { host }
}

@objc(VRThemeBridgeModuleFactory)
final class ModuleFactory: VRThemeBridgeNativeModuleFactory {
    override func onLoadModule() -> any VRThemeBridgeNativeModule { ThemeBridgeImplementation() }
}
