import Foundation
import ValdiRuntime

/// Runtime-owned factories retain app capabilities without reaching through ValdiHost.shared.
enum AppNativeModules {
    static func register(_ runtime: SCValdiRuntime, navigationHost: VRNavigationHost) {
        runtime.registerNativeModuleFactory(AppContextModuleFactory(navigationHost: navigationHost))
        runtime.registerNativeModuleFactory(VisionModuleFactory())
        runtime.registerNativeModuleFactory(SplashScreenModuleFactory())
    }
}

private final class AppContextHostImpl: NSObject, VRAppContextHost {
    private let navigationHost: VRNavigationHost

    init(navigationHost: VRNavigationHost) {
        self.navigationHost = navigationHost
        super.init()
    }

    func getNavigationHost() -> VRNavigationHost { navigationHost }
}

private final class AppContextModule: NSObject, VRAppContextNativeModule {
    private let host: AppContextHostImpl

    init(navigationHost: VRNavigationHost) {
        host = AppContextHostImpl(navigationHost: navigationHost)
        super.init()
    }

    func getHost() -> any VRAppContextHost { host }
}

private final class AppContextModuleFactory: VRAppContextNativeModuleFactory {
    private let module: AppContextModule

    init(navigationHost: VRNavigationHost) {
        module = AppContextModule(navigationHost: navigationHost)
        super.init()
    }

    override func onLoadModule() -> any VRAppContextNativeModule { module }
}

private final class VisionModule: NSObject, VRVisionNativeModule {
    private lazy var host = VisionHostImpl()

    func getHost() -> any VRVisionHost { host }
}

private final class VisionModuleFactory: VRVisionNativeModuleFactory {
    private let module = VisionModule()

    override func onLoadModule() -> any VRVisionNativeModule { module }
}
