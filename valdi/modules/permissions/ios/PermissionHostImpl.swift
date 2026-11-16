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
        Self.resolved(permissions.map { VRPermissionGrant(permission: $0, result: .denied) } as NSArray)
    }

    private static func resolved<T: AnyObject>(_ value: T) -> SCValdiPromise<T> {
        let promise = SCValdiResolvablePromise<T>()
        promise.fulfill(withSuccessValue: value)
        return promise
    }

    /// A native Promise, so the answer outlives the page that asked.
    func openSettings() -> SCValdiPromise<SCValdiUndefinedValue> {
        let promise = SCValdiResolvablePromise<SCValdiUndefinedValue>()
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                promise.fulfillWithError(NSError(domain: "PermissionHost", code: 0,
                                                 userInfo: [NSLocalizedDescriptionKey: "no settings URL"]))
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened {
                    promise.fulfill(withSuccessValue: SCValdiUndefinedValue.undefined()!)
                } else {
                    promise.fulfillWithError(NSError(domain: "PermissionHost", code: 0,
                                                     userInfo: [NSLocalizedDescriptionKey: "could not open Settings"]))
                }
            }
        }
        return promise
    }
}
