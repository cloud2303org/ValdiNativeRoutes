import UIKit
import ValdiRuntime

/// Runtime permissions for permissions/index.ts. Only openSettings is used on iOS: check and requestMultiple serve
/// Android, and every caller checks the platform first, so they just answer "not granted". iOS permissions are asked by
/// the native feature itself (Bluetooth on open, location in WifiCore, camera in the picker).
final class PermissionHostImpl: NSObject, VRPermissionHost {
    func check(withPermission permission: String) -> SCValdiPromise<NSNumber> {
        Self.resolved(NSNumber(value: false))
    }

    func requestMultiple(withPermissions permissions: [String]) -> SCValdiPromise<NSArray> {
        Self.resolved(permissions.map { VRPermissionGrant(permission: $0, result: "denied") } as NSArray)
    }

    /// A promise already settled with `value`. Written when the Valdi framework didn't export SCValdiPromise's class
    /// symbol; ValdiRuntime exports valdi_core's Objective-C API (valdi/.bazelrc), so Swift could name it now.
    private static func resolved<T: AnyObject>(_ value: T) -> SCValdiPromise<T> {
        let promise = SCValdiResolvablePromise<T>()
        promise.fulfill(withSuccessValue: value)
        return promise
    }

    /// A native Promise, so the answer outlives the page that asked.
    func openSettings() -> SCValdiPromise<SCValdiUndefinedValue> {
        ValdiVoidPromise.make { settle in
            DispatchQueue.main.async {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return settle("no settings URL") }
                UIApplication.shared.open(url) { opened in settle(opened ? nil : "could not open Settings") }
            }
        }
    }
}
