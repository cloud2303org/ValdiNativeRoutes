import Foundation
import ValdiRuntime

private final class WifiModule: NSObject, VRWifiNativeModule {
    private let implementation = WifiHostImpl()
    func getHost() -> any VRWifiHost { implementation }
}

@objc(VRWifiModuleFactory)
final class WifiModuleFactory: VRWifiNativeModuleFactory {
    private let module = WifiModule()
    override func onLoadModule() -> any VRWifiNativeModule { module }
}
