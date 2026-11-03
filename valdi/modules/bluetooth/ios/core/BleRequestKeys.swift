import Foundation

typealias DeviceId = String

struct ServiceRequestKey: Hashable {
  let deviceId: DeviceId
  let serviceId: String
}

struct CharacteristicRequestKey: Hashable {
  let deviceId: DeviceId
  let serviceId: String
  let characteristicId: String
}
