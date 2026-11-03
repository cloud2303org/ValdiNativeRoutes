import Foundation

public struct BleMTU {
  public let mtu: Double
  public init(mtu: Double) {
    self.mtu = mtu
  }
}

public struct BleNotifyParams {
  public let deviceId: String
  public let serviceId: String
  public let characteristicId: String
  public let state: Bool
  public let type: String?
  public init(deviceId: String, serviceId: String, characteristicId: String, state: Bool, type: String? = nil) {
    self.deviceId = deviceId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.state = state
    self.type = type
  }
}

public struct BleMTUParams {
  public let deviceId: String
  public let mtu: Double
  public init(deviceId: String, mtu: Double) {
    self.deviceId = deviceId
    self.mtu = mtu
  }
}

public struct BleScanWithAddressesParams {
  public let peripheralAddresses: [String]
  public init(peripheralAddresses: [String]) {
    self.peripheralAddresses = peripheralAddresses
  }
}

public struct BleDeviceServiceParams {
  public let deviceId: String
  public let serviceId: String
  public init(deviceId: String, serviceId: String) {
    self.deviceId = deviceId
    self.serviceId = serviceId
  }
}

public struct BleConnectedDevicesResult {
  public let devices: [BleConnectedDeviceItem]
  public init(devices: [BleConnectedDeviceItem]) {
    self.devices = devices
  }
}

public struct BleCharacteristicProperties {
  public let read: Bool
  public let write: Bool
  public let writeDefault: Bool
  public let writeNoResponse: Bool
  public let notify: Bool
  public let indicate: Bool
  public init(read: Bool, write: Bool, writeDefault: Bool, writeNoResponse: Bool, notify: Bool, indicate: Bool) {
    self.read = read
    self.write = write
    self.writeDefault = writeDefault
    self.writeNoResponse = writeNoResponse
    self.notify = notify
    self.indicate = indicate
  }
}

public struct BleWriteParams {
  public let deviceId: String
  public let serviceId: String
  public let characteristicId: String
  public let value: Data
  public let writeType: String?
  public init(deviceId: String, serviceId: String, characteristicId: String, value: Data, writeType: String? = nil) {
    self.deviceId = deviceId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.value = value
    self.writeType = writeType
  }
}

public struct BleCharacteristicValue {
  public let deviceId: String
  public let serviceId: String
  public let characteristicId: String
  public let value: Data
  public init(deviceId: String, serviceId: String, characteristicId: String, value: Data) {
    self.deviceId = deviceId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
    self.value = value
  }
}

public struct BleCharacteristicList {
  public let characteristics: [BleCharacteristic]
  public init(characteristics: [BleCharacteristic]) {
    self.characteristics = characteristics
  }
}

public struct BleDeviceList {
  public let devices: [BleDevice]
  public init(devices: [BleDevice]) {
    self.devices = devices
  }
}

public struct BleReadParams {
  public let deviceId: String
  public let serviceId: String
  public let characteristicId: String
  public init(deviceId: String, serviceId: String, characteristicId: String) {
    self.deviceId = deviceId
    self.serviceId = serviceId
    self.characteristicId = characteristicId
  }
}

public struct BleDeviceIdParams {
  public let deviceId: String
  public let writeType: String?
  public init(deviceId: String, writeType: String? = nil) {
    self.deviceId = deviceId
    self.writeType = writeType
  }
}

public struct BleConnectStateChange {
  public let deviceId: String
  public let connected: Bool
  public init(deviceId: String, connected: Bool) {
    self.deviceId = deviceId
    self.connected = connected
  }
}

public struct BleService {
  public let uuid: String
  public let isPrimary: Bool
  public init(uuid: String, isPrimary: Bool) {
    self.uuid = uuid
    self.isPrimary = isPrimary
  }
}

public struct BleAdapterState {
  public let available: Bool
  public let discovering: Bool
  public let peripheralAvailable: Bool?
  public init(available: Bool, discovering: Bool, peripheralAvailable: Bool? = nil) {
    self.available = available
    self.discovering = discovering
    self.peripheralAvailable = peripheralAvailable
  }
}

public struct BlePairParams {
  public let deviceId: String
  public let pin: String
  public let timeout: Double
  public init(deviceId: String, pin: String, timeout: Double) {
    self.deviceId = deviceId
    self.pin = pin
    self.timeout = timeout
  }
}

public struct BleCharacteristic {
  public let uuid: String
  public let properties: BleCharacteristicProperties
  public init(uuid: String, properties: BleCharacteristicProperties) {
    self.uuid = uuid
    self.properties = properties
  }
}

public struct BleMTUChange {
  public let deviceId: String
  public let mtu: Double
  public init(deviceId: String, mtu: Double) {
    self.deviceId = deviceId
    self.mtu = mtu
  }
}

public struct BleDeviceRSSI {
  public let RSSI: Double
  public init(RSSI: Double) {
    self.RSSI = RSSI
  }
}

public struct BleConnectedDevicesParams {
  public let services: [String]
  public init(services: [String]) {
    self.services = services
  }
}

public struct BleServiceList {
  public let services: [BleService]
  public init(services: [BleService]) {
    self.services = services
  }
}

public struct BleDevice {
  public let RSSI: Double
  public let advertisData: [Double]
  public let advertisServiceUUIDs: [String]
  public let deviceId: String
  public let localName: String
  public let name: String
  public let serviceData: Dictionary<String, Data>
  public let connectable: Bool?
  public init(RSSI: Double, advertisData: [Double], advertisServiceUUIDs: [String], deviceId: String, localName: String, name: String, serviceData: Dictionary<String, Data>, connectable: Bool? = nil) {
    self.RSSI = RSSI
    self.advertisData = advertisData
    self.advertisServiceUUIDs = advertisServiceUUIDs
    self.deviceId = deviceId
    self.localName = localName
    self.name = name
    self.serviceData = serviceData
    self.connectable = connectable
  }
}

public struct BleScanParams {
  public let services: [String]?
  public let allowDuplicatesKey: Bool?
  public let interval: Double?
  public let powerLevel: String?
  public init(services: [String]? = nil, allowDuplicatesKey: Bool? = nil, interval: Double? = nil, powerLevel: String? = nil) {
    self.services = services
    self.allowDuplicatesKey = allowDuplicatesKey
    self.interval = interval
    self.powerLevel = powerLevel
  }
}

public struct BleScanWithNameParams {
  public let peripheralNames: [String]
  public init(peripheralNames: [String]) {
    self.peripheralNames = peripheralNames
  }
}

public struct BleConnectedDeviceItem {
  public let deviceId: String
  public let name: String
  public init(deviceId: String, name: String) {
    self.deviceId = deviceId
    self.name = name
  }
}
