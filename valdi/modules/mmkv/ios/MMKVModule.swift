import Foundation
import ValdiRuntime

private final class MMKVModule: NSObject, VRMMKVNativeModule {
    private let implementation = StorageHostImpl()
    func getHost() -> VRStorageHost { implementation.host }
}

@objc(VRMMKVModuleFactory)
final class MMKVModuleFactory: VRMMKVNativeModuleFactory {
    private let module = MMKVModule()
    override func onLoadModule() -> any VRMMKVNativeModule { module }
}
