import Foundation
import ValdiRuntime

/// `api`'s Wi-Fi on the app-wide WifiCore (wifi/WifiHost.ts). Capability only: wifi/wechat.ts owns the mini-program
/// rules. One session for the app's lifetime; its events go to the one VRWifiHostEvents JS gives at install time.
final class WifiHostImpl: NSObject, VRWifiHost {
    /// Created on the main thread at startup; WifiCore.createSession would otherwise block the JS thread on main.
    private let session = WifiCore.shared.createSession()
    private var current: WifiSession { session }
    private var events: VRWifiHostEvents?

    /// The listener goes through the main queue, where the core keeps its state, rather than its main.sync: the JS
    /// thread must never wait on main. iOS has no public scan API, so the core never reports a Wi-Fi list.
    func setEventsWith(_ events: VRWifiHostEvents) {
        self.events = events
        let session = self.session
        DispatchQueue.main.async { [weak self] in
            _ = try? session.onWifiConnected { self?.events?.wifiConnected(Self.info($0)) }
        }
    }

    private static func message(_ error: Error) -> String {
        (error as NSError).localizedDescription
    }

    /// A native Promise outlives the calling page: JS hands native no function that the page's teardown could drop.
    private func promise<T, R: AnyObject>(_ future: WifiFuture<T>, _ map: @escaping (T) -> R) -> SCValdiPromise<R> {
        let promise = SCValdiResolvablePromise<R>()
        future.observe { result in
            switch result {
            case let .success(value): promise.fulfill(withSuccessValue: map(value))
            case let .failure(error):
                promise.fulfillWithError(NSError(domain: "WifiHost", code: 0, userInfo: [NSLocalizedDescriptionKey: Self.message(error)]))
            }
        }
        return promise
    }

    private func promise(_ future: WifiFuture<Void>) -> SCValdiPromise<SCValdiUndefinedValue> {
        ValdiVoidPromise.make { settle in
            future.observe { result in
                if case let .failure(error) = result { settle(Self.message(error)) } else { settle(nil) }
            }
        }
    }

    func startWifi() -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(current.startWifi())
    }

    func stopWifi() -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(current.stopWifi())
    }

    func connectWifi(with params: VRWifiConnectParams) -> SCValdiPromise<VRWifiInfo> {
        let params = WifiConnectionParams(SSID: params.ssid, BSSID: params.bssid, password: params.password,
                                          maunal: params.maunal, partialInfo: params.partialInfo)
        return promise(current.connectWifi(params: params), Self.info)
    }

    func getWifiList() -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(current.getWifiList())
    }

    func getConnectedWifi(withPartialInfo partialInfo: Bool) -> SCValdiPromise<VRWifiInfo> {
        return promise(current.getConnectedWifi(partialInfo: partialInfo), Self.info)
    }

    func setWifiListWithWifiList(_ wifiList: [VRWifiCredential]) -> SCValdiPromise<SCValdiUndefinedValue> {
        let list = wifiList.map { WifiCredentialModel(SSID: $0.ssid, BSSID: $0.bssid, password: $0.password) }
        return promise(current.setWifiList(wifiList: list))
    }

    func getLocationPermissionState() -> SCValdiPromise<VRWifiPermissionState> {
        return promise(current.getLocationPermissionState(), Self.permission)
    }

    func requestLocationPermission() -> SCValdiPromise<VRWifiPermissionState> {
        return promise(current.requestLocationPermission(), Self.permission)
    }

    private static func info(_ network: WifiNetworkInfo) -> VRWifiInfo {
        let info = VRWifiInfo(ssid: network.SSID)
        info.bssid = network.BSSID
        info.secure = network.secure.map(NSNumber.init(value:))
        info.signalStrength = network.signalStrength.map(NSNumber.init(value:))
        info.frequency = network.frequency.map(NSNumber.init(value:))
        return info
    }

    private static func permission(_ state: WifiLocationPermissionState) -> VRWifiPermissionState {
        VRWifiPermissionState(status: state.status, canAskAgain: state.canAskAgain)
    }
}
