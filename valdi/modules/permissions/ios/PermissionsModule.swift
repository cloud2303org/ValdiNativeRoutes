import Foundation
import ValdiRuntime

private final class PermissionsModule: NSObject, VRPermissionsNativeModule {
    private let implementation = PermissionHostImpl()
    func getHost() -> any VRPermissionHost { implementation }
    func getAndroidSdk() -> Double { 0 }
}

@objc(VRPermissionsModuleFactory)
final class PermissionsModuleFactory: VRPermissionsNativeModuleFactory {
    private let module = PermissionsModule()
    override func onLoadModule() -> any VRPermissionsNativeModule { module }
}
