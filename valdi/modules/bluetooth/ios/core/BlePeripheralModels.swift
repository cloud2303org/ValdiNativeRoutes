import Foundation

public struct BlePeripheralServerInfo: Codable, Sendable {
  public let serverId: String
  public init(serverId: String) {
    self.serverId = serverId
  }
}

public struct BlePeripheralProperties: Codable, Sendable {
  public let read: Bool
  public let write: Bool
  public let writeNoResponse: Bool
  public let notify: Bool
  public let indicate: Bool
  public init(read: Bool, write: Bool, writeNoResponse: Bool, notify: Bool, indicate: Bool) {
    self.read = read
    self.write = write
    self.writeNoResponse = writeNoResponse
    self.notify = notify
    self.indicate = indicate
  }
}

public struct BlePeripheralPermissions: Codable, Sendable {
  public let readable: Bool
  public let writeable: Bool
  public let readEncryptionRequired: Bool
  public let writeEncryptionRequired: Bool
  public init(readable: Bool, writeable: Bool, readEncryptionRequired: Bool, writeEncryptionRequired: Bool) {
    self.readable = readable
    self.writeable = writeable
    self.readEncryptionRequired = readEncryptionRequired
    self.writeEncryptionRequired = writeEncryptionRequired
  }
}

public struct BlePeripheralDescriptorPermissions: Codable, Sendable {
  public let read: Bool
  public let write: Bool
  public init(read: Bool, write: Bool) {
    self.read = read
    self.write = write
  }
}

public struct BlePeripheralDescriptor: Codable, Sendable {
  public let uuid: String
  public let permission: BlePeripheralDescriptorPermissions
  public let value: Data
  public init(uuid: String, permission: BlePeripheralDescriptorPermissions, value: Data) {
    self.uuid = uuid
    self.permission = permission
    self.value = value
  }
}

public struct BlePeripheralCharacteristic: Codable, Sendable {
  public let uuid: String
  public let properties: BlePeripheralProperties
  public let permission: BlePeripheralPermissions
  public let value: Data
  public let descriptors: [BlePeripheralDescriptor]
  public init(uuid: String, properties: BlePeripheralProperties, permission: BlePeripheralPermissions, value: Data, descriptors: [BlePeripheralDescriptor]) {
    self.uuid = uuid
    self.properties = properties
    self.permission = permission
    self.value = value
    self.descriptors = descriptors
  }
}

public struct BlePeripheralService: Codable, Sendable {
  public let uuid: String
  public let characteristics: [BlePeripheralCharacteristic]
  public init(uuid: String, characteristics: [BlePeripheralCharacteristic]) {
    self.uuid = uuid
    self.characteristics = characteristics
  }
}

public struct BlePeripheralServiceParams: Codable, Sendable {
  public let serverId: String
  public let service: BlePeripheralService
  public init(serverId: String, service: BlePeripheralService) {
    self.serverId = serverId
    self.service = service
  }
}

public struct BlePeripheralRemoveServiceParams: Codable, Sendable {
  public let serverId: String
  public let serviceId: String
  public init(serverId: String, serviceId: String) {
    self.serverId = serverId
    self.serviceId = serviceId
  }
}

public struct BlePeripheralManufacturerData: Codable, Sendable {
  public let manufacturerId: Double
  public let manufacturerSpecificData: Data
  public init(manufacturerId: Double, manufacturerSpecificData: Data) {
    self.manufacturerId = manufacturerId
    self.manufacturerSpecificData = manufacturerSpecificData
  }
}

public struct BlePeripheralBeacon: Codable, Sendable {
  public let uuid: String
  public let major: Double
  public let minor: Double
  public let measuredPower: Double
  public init(uuid: String, major: Double, minor: Double, measuredPower: Double) {
    self.uuid = uuid
    self.major = major
    self.minor = minor
    self.measuredPower = measuredPower
  }
}

public struct BlePeripheralAdvertisingParams: Codable, Sendable {
  public let serverId: String
  public let connectable: Bool
  public let deviceName: String
  public let serviceUuids: [String]
  public let manufacturerData: [BlePeripheralManufacturerData]
  public let powerLevel: String
  public let beacon: BlePeripheralBeacon?
  public init(serverId: String, connectable: Bool, deviceName: String, serviceUuids: [String], manufacturerData: [BlePeripheralManufacturerData], powerLevel: String, beacon: BlePeripheralBeacon? = nil) {
    self.serverId = serverId
    self.connectable = connectable
    self.deviceName = deviceName
    self.serviceUuids = serviceUuids
    self.manufacturerData = manufacturerData
    self.powerLevel = powerLevel
    self.beacon = beacon
  }
}

public struct BlePeripheralWriteParams: Codable, Sendable {
  public let serverId: String
  public let serviceId: String
  public let characteristicId: String
  public let value: Data
  public let needNotify: Bool
  public let callbackId: Double?
  public init(serverId: String, serviceId: String, characteristicId: String, value: Data, needNotify: Bool, callbackId: Double? = nil) {
    self.serverId = serverId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.value = value
    self.needNotify = needNotify
    self.callbackId = callbackId
  }
}

public struct BlePeripheralReadRequest: Codable, Sendable {
  public let serverId: String
  public let serviceId: String
  public let characteristicId: String
  public let callbackId: Double
  public let deviceId: String
  public let offset: Double
  public init(serverId: String, serviceId: String, characteristicId: String, callbackId: Double, deviceId: String, offset: Double) {
    self.serverId = serverId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.callbackId = callbackId
    self.deviceId = deviceId
    self.offset = offset
  }
}

public struct BlePeripheralWriteRequest: Codable, Sendable {
  public let serverId: String
  public let serviceId: String
  public let characteristicId: String
  public let callbackId: Double
  public let deviceId: String
  public let offset: Double
  public let value: Data
  public let needResponse: Bool
  public init(serverId: String, serviceId: String, characteristicId: String, callbackId: Double, deviceId: String, offset: Double, value: Data, needResponse: Bool) {
    self.serverId = serverId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.callbackId = callbackId
    self.deviceId = deviceId
    self.offset = offset
    self.value = value
    self.needResponse = needResponse
  }
}

public struct BlePeripheralSubscriptionEvent: Codable, Sendable {
  public let serverId: String
  public let serviceId: String
  public let characteristicId: String
  public let deviceId: String
  public init(serverId: String, serviceId: String, characteristicId: String, deviceId: String) {
    self.serverId = serverId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.deviceId = deviceId
  }
}

public struct BlePeripheralConnectionState: Codable, Sendable {
  public let serverId: String
  public let deviceId: String
  public let connected: Bool
  public init(serverId: String, deviceId: String, connected: Bool) {
    self.serverId = serverId
    self.deviceId = deviceId
    self.connected = connected
  }
}
