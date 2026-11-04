// From ExpoNativeRoutes ios/native/wifi/Core/WifiModels.swift.
import Foundation

/// Information obtained from the platform. Unsupported fields are absent.
public struct WifiNetworkInfo: Codable, Sendable {
  public let SSID: String
  public let BSSID: String?
  public let secure: Bool?
  public let signalStrength: Double?
  public let frequency: Double?
  public init(SSID: String, BSSID: String? = nil, secure: Bool? = nil, signalStrength: Double? = nil, frequency: Double? = nil) {
    self.SSID = SSID; self.BSSID = BSSID; self.secure = secure
    self.signalStrength = signalStrength; self.frequency = frequency
  }
  func partial() -> WifiNetworkInfo { WifiNetworkInfo(SSID: SSID, BSSID: BSSID) }
}

public struct WifiConnectionParams: Codable, Sendable {
  public let SSID: String
  public let BSSID: String
  public let password: String
  /// The spelling follows wx.connectWifi.
  public let maunal: Bool
  public let partialInfo: Bool
  public init(SSID: String, BSSID: String = "", password: String = "", maunal: Bool = false, partialInfo: Bool = false) {
    self.SSID = SSID; self.BSSID = BSSID; self.password = password
    self.maunal = maunal; self.partialInfo = partialInfo
  }
  func sameConfiguration(as other: WifiConnectionParams) -> Bool {
    SSID == other.SSID && password == other.password && BSSID == other.BSSID
  }
}

public struct WifiCredentialModel: Codable, Sendable {
  public let SSID: String
  public let BSSID: String?
  public let password: String
  public init(SSID: String, BSSID: String? = nil, password: String = "") {
    self.SSID = SSID; self.BSSID = BSSID; self.password = password
  }
}

public struct WifiLocationPermissionState: Codable, Sendable {
  public let status: String
  public let canAskAgain: Bool
  public init(status: String, canAskAgain: Bool) { self.status = status; self.canAskAgain = canAskAgain }
}

func wifiError(_ code: Int, _ reason: String, _ message: String) -> NSError {
  NSError(domain: "Wifi", code: code, userInfo: [NSLocalizedDescriptionKey: "\(reason):\(message)"])
}
