// Deterministic OS boundary for the unchanged production BleCore/BleEngine.
// No scheduler, promise routing or invalidation policy is implemented here.
@_exported import Foundation

public enum CBManagerState { case unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn }
public enum CBManagerAuthorization { case notDetermined, restricted, denied, allowedAlways }
public enum CBPeripheralState { case disconnected, connecting, connected, disconnecting }
public enum CBCharacteristicWriteType { case withResponse, withoutResponse }
public struct CBCharacteristicProperties: OptionSet {
  public let rawValue: UInt
  public init(rawValue: UInt) { self.rawValue = rawValue }
  public static let read = Self(rawValue: 1)
  public static let write = Self(rawValue: 2)
  public static let writeWithoutResponse = Self(rawValue: 4)
  public static let notify = Self(rawValue: 8)
  public static let indicate = Self(rawValue: 16)
}
public final class CBUUID: Hashable {
  public let uuidString: String
  public init(string: String) { uuidString = string }
  public static func == (lhs: CBUUID, rhs: CBUUID) -> Bool { lhs.uuidString == rhs.uuidString }
  public func hash(into hasher: inout Hasher) { hasher.combine(uuidString) }
}
public protocol CBCentralManagerDelegate: AnyObject {
  func centralManagerDidUpdateState(_ central: CBCentralManager)
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber)
  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral)
  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?)
  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?)
}
public protocol CBPeripheralDelegate: AnyObject {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?)
  func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService])
  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?)
  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?)
  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?)
  func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?)
  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?)
  func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral)
}
public final class CBService {
  public let uuid: CBUUID
  public let isPrimary = true
  public var characteristics: [CBCharacteristic]?
  public init(_ uuid: String) { self.uuid = CBUUID(string: uuid) }
}
public final class CBCharacteristic {
  public let uuid: CBUUID
  public weak var service: CBService?
  public var properties: CBCharacteristicProperties = [.read, .write, .notify]
  public var isNotifying = false
  public var value: Data?
  public init(_ uuid: String) { self.uuid = CBUUID(string: uuid) }
}
public final class CBPeripheral {
  public let identifier: UUID
  public var name: String? = "test"
  public var state: CBPeripheralState = .disconnected
  public weak var delegate: CBPeripheralDelegate?
  public var services: [CBService]?
  public var canSendWriteWithoutResponse = true
  public var reads = 0
  public var rssiReads = 0
  public var discoveries = 0
  public var notifyChanges = 0
  public init(_ id: UUID) { identifier = id }
  public func discoverServices(_ uuids: [CBUUID]?) { discoveries += 1 }
  public func discoverCharacteristics(_ uuids: [CBUUID]?, for service: CBService) {}
  public func readRSSI() { rssiReads += 1 }
  public func readValue(for characteristic: CBCharacteristic) { reads += 1 }
  public func writeValue(_ data: Data, for characteristic: CBCharacteristic, type: CBCharacteristicWriteType) {}
  public func setNotifyValue(_ state: Bool, for characteristic: CBCharacteristic) { notifyChanges += 1 }
  public func maximumWriteValueLength(for type: CBCharacteristicWriteType) -> Int { 20 }
}
public final class CBCentralManager {
  public static var last: CBCentralManager!
  public static var initialState: CBManagerState = .poweredOn
  public static let authorization: CBManagerAuthorization = .allowedAlways
  public weak var delegate: CBCentralManagerDelegate?
  public var state: CBManagerState = .poweredOn
  public var isScanning = false
  public var devices: [UUID: CBPeripheral] = [:]
  public var connects = 0
  public var cancellations = 0
  public var scanStarts = 0
  public var scanStops = 0
  public init(delegate: CBCentralManagerDelegate?, queue: DispatchQueue?) {
    self.delegate = delegate
    self.state = Self.initialState
    Self.last = self
  }
  public func scanForPeripherals(withServices: [CBUUID]?, options: [String: Any]?) {
    isScanning = true; scanStarts += 1
  }
  public func stopScan() { isScanning = false; scanStops += 1 }
  public func retrievePeripherals(withIdentifiers ids: [UUID]) -> [CBPeripheral] { ids.compactMap { devices[$0] } }
  public func retrieveConnectedPeripherals(withServices: [CBUUID]) -> [CBPeripheral] {
    devices.values.filter { $0.state == .connected }
  }
  public func connect(_ peripheral: CBPeripheral, options: [String: Any]?) {
    connects += 1; peripheral.state = .connecting
  }
  public func cancelPeripheralConnection(_ peripheral: CBPeripheral) {
    cancellations += 1; peripheral.state = .disconnecting
  }
  public func connected(_ peripheral: CBPeripheral) {
    peripheral.state = .connected
    delegate?.centralManager(self, didConnect: peripheral)
  }
  public func disconnected(_ peripheral: CBPeripheral) {
    peripheral.state = .disconnected
    delegate?.centralManager(self, didDisconnectPeripheral: peripheral, error: nil)
  }
  public func poweredOff() {
    state = .poweredOff
    delegate?.centralManagerDidUpdateState(self)
  }
}
public let CBCentralManagerScanOptionAllowDuplicatesKey = "allowDuplicates"
public let CBAdvertisementDataManufacturerDataKey = "manufacturer"
public let CBAdvertisementDataServiceDataKey = "serviceData"
public let CBAdvertisementDataServiceUUIDsKey = "serviceUUIDs"
public let CBAdvertisementDataLocalNameKey = "localName"
public let CBAdvertisementDataIsConnectable = "connectable"
