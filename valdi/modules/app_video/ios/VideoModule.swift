import Foundation
import ValdiRuntime

private final class VideoModule: NSObject, VRVideoNativeModule {
    private let service: VRVideoService

    init(service: VRVideoService) {
        self.service = service
        super.init()
    }

    // Generated getHost can run on the JS thread. Returning this immutable reference needs no UI access.
    func getHost() -> any VRVideoHost { service }
}

@objc(VRVideoModuleFactory)
final class VideoModuleFactory: VRVideoNativeModuleFactory {
    private let module: VideoModule

    override init() {
        module = VideoModule(service: VRVideoService.registration())
        super.init()
    }

    override func onLoadModule() -> any VRVideoNativeModule { module }
}
