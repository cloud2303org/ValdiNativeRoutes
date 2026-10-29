// From ExpoNativeRoutes ios/native/wifi/Core/WifiSystem.swift.
import Foundation

enum WifiApplyOutcome { case configured, alreadyAssociated }

/// All operating-system effects sit behind this seam; the core owns their lifetime.
protocol WifiSystem: AnyObject {
  func availabilityError() -> Error?
  func fetchCurrent(_ completion: @escaping (WifiNetworkInfo?) -> Void)
  func configuredSSIDs(_ completion: @escaping ([String]) -> Void)
  func apply(_ params: WifiConnectionParams, completion: @escaping (Result<WifiApplyOutcome, Error>) -> Void)
  func removeConfiguration(SSID: String)
  func observeNetworkChanges(_ callback: @escaping () -> Void) -> () -> Void
  func infoUnavailableError() -> Error
  func getLocationPermissionState() -> WifiLocationPermissionState
  func requestLocationPermission() -> WifiFuture<WifiLocationPermissionState>
}

typealias WifiSchedule = (TimeInterval, @escaping () -> Void) -> (() -> Void)

func scheduleWifiWork(_ delay: TimeInterval, _ callback: @escaping () -> Void) -> () -> Void {
  let work = DispatchWorkItem(block: callback)
  DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  return { work.cancel() }
}
