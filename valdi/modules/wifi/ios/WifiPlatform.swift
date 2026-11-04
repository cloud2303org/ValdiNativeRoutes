// From ExpoNativeRoutes ios/native/wifi/Core/WifiPlatform.swift.
import Foundation
import CoreLocation
import Network
import NetworkExtension
import UIKit

/// Uses public iOS APIs only. No Hotspot Helper, private Settings URLs, or global network changes.
final class WifiPlatform: WifiSystem {
  private lazy var location = WifiLocationPermissions()
  func availabilityError() -> Error? {
    #if targetEnvironment(simulator)
    return wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", "Wi-Fi configuration requires a physical iPhone or iPad")
    #else
    return nil
    #endif
  }
  func fetchCurrent(_ completion: @escaping (WifiNetworkInfo?) -> Void) {
    NEHotspotNetwork.fetchCurrent { network in
      guard let network else { completion(nil); return }
      let secure: Bool?
      switch network.securityType.rawValue {
      case 0: secure = false
      case 1, 2, 3: secure = true
      default: secure = nil
      }
      // fetchCurrent populates SSID, BSSID, and security type only.
      completion(WifiNetworkInfo(SSID: network.ssid, BSSID: network.bssid.isEmpty ? nil : network.bssid, secure: secure))
    }
  }
  func configuredSSIDs(_ completion: @escaping ([String]) -> Void) {
    NEHotspotConfigurationManager.shared.getConfiguredSSIDs(completionHandler: completion)
  }
  func apply(_ params: WifiConnectionParams, completion: @escaping (Result<WifiApplyOutcome, Error>) -> Void) {
    guard UIApplication.shared.applicationState == .active else {
      completion(.failure(wifiError(12011, "E_WIFI_BACKGROUND", "Wi-Fi configuration requires the app in the foreground")))
      return
    }
    let configuration = params.password.isEmpty
      ? NEHotspotConfiguration(ssid: params.SSID)
      : NEHotspotConfiguration(ssid: params.SSID, passphrase: params.password, isWEP: false)
    // Device AP provisioning is temporary. The session removes only its own configuration.
    configuration.joinOnce = true
    NEHotspotConfigurationManager.shared.apply(configuration) { error in
      guard let error = error as NSError? else { completion(.success(.configured)); return }
      if error.domain == NEHotspotConfigurationErrorDomain, error.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
        completion(.success(.alreadyAssociated))
      } else { completion(.failure(Self.mapConfigurationError(error))) }
    }
  }
  func removeConfiguration(SSID: String) { NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: SSID) }
  func observeNetworkChanges(_ callback: @escaping () -> Void) -> () -> Void {
    let monitor = NWPathMonitor(requiredInterfaceType: .wifi)
    var active = true
    monitor.pathUpdateHandler = { _ in DispatchQueue.main.async { if active { callback() } } }
    monitor.start(queue: DispatchQueue(label: "io.nativeroutes.wifi.observation"))
    let notification = NotificationCenter.default.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { _ in
      if active { callback() }
    }
    // NWPath does not promise a callback on every SSID/BSSID change. Poll only during active sessions.
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 2, repeating: 2)
    timer.setEventHandler { if active, UIApplication.shared.applicationState == .active { callback() } }
    timer.resume()
    return {
      active = false
      monitor.pathUpdateHandler = nil; monitor.cancel()
      timer.setEventHandler {}; timer.cancel()
      NotificationCenter.default.removeObserver(notification)
    }
  }
  func getLocationPermissionState() -> WifiLocationPermissionState { location.state() }
  func requestLocationPermission() -> WifiFuture<WifiLocationPermissionState> { location.request() }
  func infoUnavailableError() -> Error {
    if !CLLocationManager.locationServicesEnabled() {
      return wifiError(12007, "E_WIFI_PERMISSION_DENIED", "Location Services are disabled; reading the current network may require precise location or an app-configured hotspot")
    }
    let state = location.state()
    if state.status == "undetermined" {
      guard let description = Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") as? String, !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return wifiError(12009, "E_WIFI_SYSTEM_CONFIG", "The host must set NSLocationWhenInUseUsageDescription before requesting location to read its current Wi-Fi")
      }
      return wifiError(12007, "E_WIFI_LOCATION_PERMISSION_REQUIRED", "Reading a Wi-Fi network not configured by this app requires precise location authorization")
    }
    if state.status != "granted" {
      return wifiError(12007, "E_WIFI_PERMISSION_DENIED", "Precise location is required to read a Wi-Fi network not configured by this app")
    }
    return wifiError(12010, "E_WIFI_GET_CONNECTED_INFO_FAILED", "No readable current Wi-Fi network; check association and the host's Access Wi-Fi Information entitlement")
  }
  private static func mapConfigurationError(_ error: NSError) -> Error {
    guard error.domain == NEHotspotConfigurationErrorDomain, let code = NEHotspotConfigurationError(rawValue: error.code) else {
      return wifiError(12010, "E_WIFI_SYSTEM_INTERNAL", "The system rejected the Wi-Fi configuration (code \(error.code))")
    }
    switch code {
    case .invalidSSID, .invalidSSIDPrefix: return wifiError(12008, "E_WIFI_INVALID_SSID", "The system rejected the SSID")
    case .invalidWPAPassphrase, .invalidWEPPassphrase: return wifiError(12014, "E_WIFI_INVALID_PASSWORD", "The system rejected the WPA/WEP password format")
    case .userDenied, .userUnauthorized: return wifiError(12007, "E_WIFI_PERMISSION_DENIED", "The user declined the Wi-Fi connection")
    case .pending: return wifiError(12004, "E_WIFI_DUPLICATE_REQUEST", "Another system Wi-Fi request is pending")
    case .systemConfiguration, .systemDenied: return wifiError(12009, "E_WIFI_SYSTEM_CONFIG", "System or managed configuration prevents this Wi-Fi connection")
    case .applicationIsNotInForeground: return wifiError(12011, "E_WIFI_BACKGROUND", "Wi-Fi configuration requires the app in the foreground")
    case .joinOnceNotSupported: return wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", "The system cannot temporarily join this Wi-Fi network")
    default: return wifiError(12010, "E_WIFI_SYSTEM_INTERNAL", "The system could not configure Wi-Fi (code \(error.code)); ensure the host enables Hotspot Configuration")
    }
  }
}

private final class WifiLocationAuthorizationDelegate: NSObject, CLLocationManagerDelegate {
  weak var owner: WifiLocationPermissions?
  init(owner: WifiLocationPermissions) { self.owner = owner }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { owner?.authorizationChanged() }
}

/// A single lazy CLLocationManager. It never starts location updates.
private final class WifiLocationPermissions {
  private lazy var delegate = WifiLocationAuthorizationDelegate(owner: self)
  private lazy var manager: CLLocationManager = {
    let manager = CLLocationManager()
    manager.delegate = delegate
    return manager
  }()
  private var pending: WifiFuture<WifiLocationPermissionState>?
  private var cancelTimeout: (() -> Void)?
  func state() -> WifiLocationPermissionState {
    guard CLLocationManager.locationServicesEnabled() else { return WifiLocationPermissionState(status: "unavailable", canAskAgain: false) }
    switch manager.authorizationStatus {
    case .notDetermined: return WifiLocationPermissionState(status: "undetermined", canAskAgain: true)
    case .authorizedAlways, .authorizedWhenInUse:
      // Reduced accuracy cannot satisfy fetchCurrent's precise-location requirement.
      return WifiLocationPermissionState(status: manager.accuracyAuthorization == .fullAccuracy ? "granted" : "blocked", canAskAgain: false)
    case .denied: return WifiLocationPermissionState(status: "blocked", canAskAgain: false)
    case .restricted: return WifiLocationPermissionState(status: "unavailable", canAskAgain: false)
    @unknown default: return WifiLocationPermissionState(status: "unavailable", canAskAgain: false)
    }
  }
  func request() -> WifiFuture<WifiLocationPermissionState> {
    if let pending { return pending }
    let output = WifiFuture<WifiLocationPermissionState>()
    let before = state()
    guard before.status == "undetermined" else { output.resolve(withResult: before); return output }
    guard let description = Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") as? String, !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      output.reject(withError: wifiError(12009, "E_WIFI_SYSTEM_CONFIG", "The host must set NSLocationWhenInUseUsageDescription before requesting location"))
      return output
    }
    pending = output
    cancelTimeout = scheduleWifiWork(60) { [weak self] in
      // The OS prompt cannot be dismissed by us. Preserve the in-flight request until its decision arrives.
      self?.pending?.reject(withError: wifiError(12010, "E_WIFI_SYSTEM_TIMEOUT", "Location authorization did not finish before the deadline"))
    }
    manager.requestWhenInUseAuthorization()
    return output
  }
  func authorizationChanged() {
    guard let pending, manager.authorizationStatus != .notDetermined else { return }
    self.pending = nil
    cancelTimeout?(); cancelTimeout = nil
    pending.resolve(withResult: state())
  }
}
