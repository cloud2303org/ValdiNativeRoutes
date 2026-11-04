import Foundation
import ValdiRuntime

private final class AppUIModule: NSObject, VRAppUINativeModule {
    private let implementation = AppUIHostImpl()
    func getHost() -> any VRAppUIHost { implementation }
}

@objc(VRAppUIModuleFactory)
final class AppUIModuleFactory: VRAppUINativeModuleFactory {
    private let module = AppUIModule()

    /// Host constructs factories on main at registration, before pages can focus a text input.
    override init() {
        super.init()
        AppUIKeyboardObserver.shared.prepare()
    }

    override func onLoadModule() -> any VRAppUINativeModule { module }
}
