import Foundation
import ValdiRuntime

/// Loading the JS module only creates lightweight bridge objects. The app's startup path
/// owns package selection; disk and network work begin on a worker when JS asks for them.
final class OtaModuleFactory: VROtaNativeModuleFactory {
    private let lock = NSLock()
    private var module: OtaModule?

    override func onLoadModule() -> any VROtaNativeModule {
        lock.lock()
        defer { lock.unlock() }
        if let module { return module }
        let result = OtaModule()
        module = result
        return result
    }
}

private final class OtaModule: NSObject, VROtaNativeModule {
    private let host = OtaHostImpl()

    func getHost() -> any VROtaHost { host }
}

private final class OtaHostImpl: NSObject, VROtaHost {
    func getInfo() -> SCValdiPromise<VROtaInfo> {
        promise { try ValdiOta.getInfo() }
    }

    func checkForUpdate() -> SCValdiPromise<VROtaInfo> {
        promise { try await ValdiOta.checkForUpdateOrThrow() }
    }

    private func promise(_ work: @escaping @Sendable () async throws -> ValdiOtaClient.Info)
        -> SCValdiPromise<VROtaInfo> {
        let promise = SCValdiResolvablePromise<VROtaInfo>()
        Task.detached(priority: .utility) {
            do {
                let info = try await work()
                let model = VROtaInfo(enabled: info.enabled, appVersion: info.appVersion,
                                      embeddedBundleVersion: info.embeddedBundleVersion,
                                      bundleVersion: info.bundleVersion)
                model.pendingBundleVersion = info.pendingBundleVersion
                promise.fulfill(withSuccessValue: model)
            } catch {
                let message = (error as? ValdiOtaError)?.description ?? error.localizedDescription
                promise.fulfillWithError(NSError(domain: "OtaHost", code: 0,
                                                userInfo: [NSLocalizedDescriptionKey: message]))
            }
        }
        return promise
    }
}
