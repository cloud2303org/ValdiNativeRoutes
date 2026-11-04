import Foundation
import ValdiRuntime

private final class NfcModule: NSObject, VRNfcNativeModule {
    private let implementation = NfcHostImpl()
    func getHost() -> any VRNfcHost { implementation }
}

@objc(VRNfcModuleFactory)
final class NfcModuleFactory: VRNfcNativeModuleFactory {
    private let module = NfcModule()
    override func onLoadModule() -> any VRNfcNativeModule { module }
}
