import CoreBluetooth
import Foundation

final class BleEngine {
  private var centralManager: CBCentralManager?
  private var peripherals: [DeviceId: CBPeripheral] = [:]
  private var discoveredDevices: [DeviceId: BleDevice] = [:]
  private lazy var centralDelegate = CentralManagerDelegate(owner: self)
  private lazy var peripheralDelegate = PeripheralDelegate(owner: self)

  private var openPromises: [BleFuture<Void>] = []
  private var connectPromises: [DeviceId: BleFuture<Void>] = [:]
  private var disconnectPromises: [DeviceId: BleFuture<Void>] = [:]
  private var servicePromises: [DeviceId: BleFuture<BleServiceList>] = [:]
  private var dirtyServiceDevices: Set<DeviceId> = []
  private var serviceGenerations: [DeviceId: UInt64] = [:]
  private var serviceDiscoveryGenerations: [DeviceId: UInt64] = [:]
  private var characteristicPromises: [ServiceRequestKey: BleFuture<BleCharacteristicList>] = [:]
  private var notifyPromises: [CharacteristicRequestKey: BleFuture<Void>] = [:]
  private var notifyTargets: [CharacteristicRequestKey: Bool] = [:]
  private var readPromises: [CharacteristicRequestKey: BleFuture<Void>] = [:]
  private var writePromises: [CharacteristicRequestKey: BleFuture<Void>] = [:]
  private var rssiPromises: [DeviceId: BleFuture<BleDeviceRSSI>] = [:]
  private var pendingWritesWithoutResponse: [DeviceId: PendingWriteWithoutResponse] = [:]

  private var nameScanFilter: Set<String>?
  private var addressScanFilter: Set<String>?

  private var deviceFoundListeners: [Double: (BleDevice) -> Void] = [:]
  private var adapterStateListeners: [Double: (BleAdapterState) -> Void] = [:]
  private var connectStateListeners: [Double: (BleConnectStateChange) -> Void] = [:]
  private var characteristicListeners: [Double: (BleCharacteristicValue) -> Void] = [:]
  private var mtuListeners: [Double: (BleMTUChange) -> Void] = [:]
  private var nextListenerId: Double = 1

  func openBluetoothAdapter() throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      if let manager = self.centralManager {
        manager.delegate = self.centralDelegate
        self.completeOpen(promise, manager: manager)
        return
      }
      self.openPromises.append(promise)
      self.centralManager = CBCentralManager(delegate: self.centralDelegate, queue: .main)
    }
    return promise
  }

  func closeBluetoothAdapter() throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      let error = self.makeError("E_BLE_NOT_INITIALIZED:Bluetooth adapter closed")
      self.centralManager?.stopScan()
      let disconnectingPeripherals = self.peripherals.values.filter { $0.state != .disconnected }
      for peripheral in disconnectingPeripherals {
        self.centralManager?.cancelPeripheralConnection(peripheral)
      }
      self.peripherals.values.forEach { $0.delegate = nil }
      self.centralManager?.delegate = nil
      self.centralManager = nil
      self.peripherals.removeAll()
      self.discoveredDevices.removeAll()
      self.nameScanFilter = nil
      self.addressScanFilter = nil
      self.rejectAllPending(error: error)
      // The delegate is detached above, so CoreBluetooth's asynchronous
      // disconnect callbacks cannot deliver these final connection events.
      for peripheral in disconnectingPeripherals {
        self.emitConnectState(deviceId: peripheral.identifier.uuidString, connected: false)
      }
      self.notify(self.adapterStateListeners, value: BleAdapterState(available: false, discovering: false))
      promise.resolve(withResult: ())
    }
    return promise
  }

  func getBluetoothAdapterState() throws -> BleFuture<BleAdapterState> {
    let promise = BleFuture<BleAdapterState>()
    runOnMain {
      guard let manager = self.centralManager else {
        promise.reject(withError: self.makeError("E_BLE_NOT_INITIALIZED:Call openBluetoothAdapter first"))
        return
      }
      promise.resolve(
        withResult: BleAdapterState(
          available: manager.state == .poweredOn,
          discovering: manager.isScanning
        )
      )
    }
    return promise
  }

  func startBluetoothDevicesDiscovery(params: BleScanParams) throws -> BleFuture<Void> {
    performWithReadyManager { manager in
      self.nameScanFilter = nil
      self.addressScanFilter = nil
      let services = params.services?.map { CBUUID(string: $0) }
      manager.scanForPeripherals(
        withServices: services?.isEmpty == true ? nil : services,
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: params.allowDuplicatesKey == true]
      )
      self.emitAdapterState()
    }
  }

  func startBluetoothDevicesDiscoveryWithNames(params: BleScanWithNameParams) throws -> BleFuture<Void> {
    performWithReadyManager { manager in
      self.nameScanFilter = Set(params.peripheralNames)
      self.addressScanFilter = nil
      manager.scanForPeripherals(withServices: nil, options: nil)
      self.emitAdapterState()
    }
  }

  func startBluetoothDevicesDiscoveryWithAddresses(params: BleScanWithAddressesParams) throws -> BleFuture<Void> {
    performWithReadyManager { manager in
      self.addressScanFilter = Set(params.peripheralAddresses.compactMap(self.canonicalDeviceId))
      self.nameScanFilter = nil
      manager.scanForPeripherals(withServices: nil, options: nil)
      self.emitAdapterState()
    }
  }

  func stopBluetoothDevicesDiscovery() throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      self.centralManager?.stopScan()
      self.nameScanFilter = nil
      self.addressScanFilter = nil
      self.emitAdapterState()
      promise.resolve(withResult: ())
    }
    return promise
  }

  func getBluetoothDevices() throws -> BleFuture<BleDeviceList> {
    let promise = BleFuture<BleDeviceList>()
    runOnMain {
      do {
        _ = try self.requireManager()
        promise.resolve(withResult: BleDeviceList(devices: Array(self.discoveredDevices.values)))
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func createBLEConnection(deviceId: String, timeout: Double = 15_000) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        let manager = try self.requireReadyManager()
        let key = try self.requireDeviceId(deviceId)
        if let active = self.connectPromises[key] {
          active.chain(to: promise)
          return
        }
        guard let peripheral = self.findPeripheral(deviceId: key) else {
          throw self.makeError("E_BLE_DEVICE_NOT_FOUND:BleDevice \(key) not found")
        }
        peripheral.delegate = self.peripheralDelegate
        switch peripheral.state {
        case .connected:
          throw self.makeError("E_BLE_ALREADY_CONNECTED:BleDevice \(key) is already connected")
        case .connecting:
          self.connectPromises[key] = promise
        case .disconnecting:
          throw self.makeError("E_BLE_CONNECTION_FAILED:BleDevice \(key) is disconnecting")
        case .disconnected:
          self.connectPromises[key] = promise
          manager.connect(peripheral, options: nil)
        @unknown default:
          throw self.makeError("E_BLE_CONNECTION_FAILED:Unknown state for \(key)")
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + min(max(timeout, 1), 120_000) / 1000) {
      guard let key = self.canonicalDeviceId(deviceId), self.connectPromises[key] === promise else { return }
      let error = self.makeError("E_BLE_CONNECTION_TIMEOUT:Connection timed out")
      if let peripheral = self.peripherals[key] { self.centralManager?.cancelPeripheralConnection(peripheral) }
      self.connectPromises.removeValue(forKey: key)?.reject(withError: error)
      self.rejectPendingRequests(for: key, error: error)
    }
    return promise
  }

  func closeBLEConnection(deviceId: String) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        let manager = try self.requireManager()
        let key = try self.requireDeviceId(deviceId)
        if let active = self.disconnectPromises[key] {
          active.chain(to: promise)
          return
        }
        guard let peripheral = self.findPeripheral(deviceId: key) else {
          promise.resolve(withResult: ())
          return
        }
        switch peripheral.state {
        case .disconnected:
          promise.resolve(withResult: ())
        case .disconnecting:
          self.disconnectPromises[key] = promise
        case .connected, .connecting:
          self.disconnectPromises[key] = promise
          manager.cancelPeripheralConnection(peripheral)
        @unknown default:
          promise.resolve(withResult: ())
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func makeBluetoothPair(params: BlePairParams) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    promise.reject(
      withError: makeError("E_BLE_SYSTEM_NOT_SUPPORTED:Bluetooth pairing is Android-only")
    )
    return promise
  }

  func isBluetoothDevicePaired(deviceId: String) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    promise.reject(
      withError: makeError("E_BLE_SYSTEM_NOT_SUPPORTED:Bluetooth pairing is Android-only")
    )
    return promise
  }

  func getBLEDeviceServices(deviceId: String) throws -> BleFuture<BleServiceList> {
    let promise = BleFuture<BleServiceList>()
    runOnMain {
      do {
        let peripheral = try self.requireConnectedPeripheral(deviceId)
        let key = peripheral.identifier.uuidString
        if let active = self.servicePromises[key] {
          active.chain(to: promise)
        } else if let services = peripheral.services, !services.isEmpty,
                  !self.dirtyServiceDevices.contains(key) {
          promise.resolve(withResult: self.makeServiceList(services))
        } else {
          self.servicePromises[key] = promise
          self.serviceDiscoveryGenerations[key] = self.serviceGenerations[key] ?? 0
          peripheral.discoverServices(nil)
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func getBLEDeviceCharacteristics(params: BleDeviceServiceParams) throws -> BleFuture<BleCharacteristicList> {
    let promise = BleFuture<BleCharacteristicList>()
    runOnMain {
      do {
        let peripheral = try self.requireConnectedPeripheral(params.deviceId)
        guard let service = peripheral.services?.first(where: { $0.uuid.matches(params.serviceId) }) else {
          throw self.makeError("E_BLE_SERVICE_NOT_FOUND:BleService \(params.serviceId) not found")
        }
        if let characteristics = service.characteristics {
          promise.resolve(withResult: self.makeCharacteristicList(characteristics))
          return
        }
        let key = ServiceRequestKey(
          deviceId: peripheral.identifier.uuidString,
          serviceId: service.uuid.normalizedString
        )
        if let active = self.characteristicPromises[key] {
          active.chain(to: promise)
        } else {
          self.characteristicPromises[key] = promise
          peripheral.discoverCharacteristics(nil, for: service)
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func getBLEDeviceRSSI(deviceId: String) throws -> BleFuture<BleDeviceRSSI> {
    let promise = BleFuture<BleDeviceRSSI>()
    runOnMain {
      do {
        let peripheral = try self.requireConnectedPeripheral(deviceId)
        let key = peripheral.identifier.uuidString
        if let active = self.rssiPromises[key] {
          active.chain(to: promise)
        } else {
          self.rssiPromises[key] = promise
          peripheral.readRSSI()
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func notifyBLECharacteristicValueChange(params: BleNotifyParams) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        let (peripheral, characteristic) = try self.characteristicAndPeripheral(
          deviceId: params.deviceId,
          serviceId: params.serviceId,
          characteristicId: params.characteristicId
        )
        if params.state {
          try self.ensureNotifyTypeSupported(params.type, characteristic: characteristic)
        }
        if characteristic.isNotifying == params.state {
          promise.resolve(withResult: ())
          return
        }
        let key = self.characteristicKey(peripheral, characteristic)
        if let active = self.notifyPromises[key] {
          active.chain(to: promise)
        } else {
          self.notifyPromises[key] = promise
          self.notifyTargets[key] = params.state
          peripheral.setNotifyValue(params.state, for: characteristic)
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func writeBLECharacteristicValue(params: BleWriteParams) throws -> BleFuture<Void> {
    let data = params.value
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        let (peripheral, characteristic) = try self.characteristicAndPeripheral(
          deviceId: params.deviceId,
          serviceId: params.serviceId,
          characteristicId: params.characteristicId
        )
        let withResponse: Bool
        switch params.writeType {
        case "write":
          withResponse = true
        case "writeNoResponse":
          withResponse = false
        case nil:
          withResponse = true
        default:
          throw self.makeError("E_BLE_INVALID_DATA:Unknown write type \(params.writeType!)")
        }
        let writeType: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse
        let requiredProperty: CBCharacteristicProperties = withResponse ? .write : .writeWithoutResponse
        guard characteristic.properties.contains(requiredProperty) else {
          throw self.makeError("E_BLE_PROPERTY_NOT_SUPPORTED:Requested write type is unsupported")
        }
        guard data.count <= peripheral.maximumWriteValueLength(for: writeType) else {
          throw self.makeError("E_BLE_WRITE_FAILED:Value exceeds maximum write length")
        }
        let key = self.characteristicKey(peripheral, characteristic)
        if withResponse {
          guard self.writePromises[key] == nil else {
            throw self.makeError("E_BLE_WRITE_FAILED:A write is already pending")
          }
          self.writePromises[key] = promise
          peripheral.writeValue(data, for: characteristic, type: .withResponse)
        } else if peripheral.canSendWriteWithoutResponse {
          peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
          promise.resolve(withResult: ())
        } else {
          let deviceKey = peripheral.identifier.uuidString
          guard self.pendingWritesWithoutResponse[deviceKey] == nil else {
            throw self.makeError("E_BLE_WRITE_FAILED:A write is already waiting for backpressure")
          }
          self.pendingWritesWithoutResponse[deviceKey] = PendingWriteWithoutResponse(
            data: data,
            characteristic: characteristic,
            promise: promise
          )
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func readBLECharacteristicValue(params: BleReadParams) throws -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        let (peripheral, characteristic) = try self.characteristicAndPeripheral(
          deviceId: params.deviceId,
          serviceId: params.serviceId,
          characteristicId: params.characteristicId
        )
        guard characteristic.properties.contains(.read) else {
          throw self.makeError("E_BLE_PROPERTY_NOT_SUPPORTED:BleCharacteristic is not readable")
        }
        let key = self.characteristicKey(peripheral, characteristic)
        if let active = self.readPromises[key] {
          active.chain(to: promise)
        } else {
          self.readPromises[key] = promise
          peripheral.readValue(for: characteristic)
        }
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func setBLEMTU(params: BleMTUParams) throws -> BleFuture<BleMTU> {
    let promise = BleFuture<BleMTU>()
    runOnMain {
      do {
        let peripheral = try self.requireConnectedPeripheral(params.deviceId)
        promise.resolve(withResult: BleMTU(mtu: self.currentMtu(for: peripheral)))
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func getBLEMTU(params: BleDeviceIdParams) throws -> BleFuture<BleMTU> {
    let promise = BleFuture<BleMTU>()
    runOnMain {
      do {
        let peripheral = try self.requireConnectedPeripheral(params.deviceId)
        let writeType: CBCharacteristicWriteType
        switch params.writeType ?? "write" {
        case "write":
          writeType = .withResponse
        case "writeNoResponse":
          writeType = .withoutResponse
        default:
          throw self.makeError("E_BLE_INVALID_DATA:Unknown write type \(params.writeType ?? "")")
        }
        promise.resolve(withResult: BleMTU(mtu: self.currentMtu(for: peripheral, writeType: writeType)))
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func getConnectedBluetoothDevices(params: BleConnectedDevicesParams) throws -> BleFuture<BleConnectedDevicesResult> {
    let promise = BleFuture<BleConnectedDevicesResult>()
    runOnMain {
      do {
        let manager = try self.requireManager()
        let services = params.services.map(CBUUID.init(string:))
        let connected = manager.retrieveConnectedPeripherals(withServices: services)
        connected.forEach { self.peripherals[$0.identifier.uuidString] = $0 }
        let devices = connected
        .map {
          BleConnectedDeviceItem(
            deviceId: $0.identifier.uuidString,
            name: $0.name ?? ""
          )
        }
        promise.resolve(withResult: BleConnectedDevicesResult(devices: devices))
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  func onBluetoothDeviceFound(cb: @escaping (BleDevice) -> Void) throws -> Double {
    addListenerOnMain(cb, to: &deviceFoundListeners)
  }

  func removeBluetoothDeviceFoundListener(subscriptionId: Double) throws {
    removeListenerOnMain(subscriptionId, from: &deviceFoundListeners)
  }

  func onAdapterStateChange(cb: @escaping (BleAdapterState) -> Void) throws -> Double {
    addListenerOnMain(cb, to: &adapterStateListeners)
  }

  func removeAdapterStateListener(subscriptionId: Double) throws {
    removeListenerOnMain(subscriptionId, from: &adapterStateListeners)
  }

  func onConnectStateChange(cb: @escaping (BleConnectStateChange) -> Void) throws -> Double {
    addListenerOnMain(cb, to: &connectStateListeners)
  }

  func removeConnectStateListener(subscriptionId: Double) throws {
    removeListenerOnMain(subscriptionId, from: &connectStateListeners)
  }

  func onCharacteristicUpdate(cb: @escaping (BleCharacteristicValue) -> Void) throws -> Double {
    addListenerOnMain(cb, to: &characteristicListeners)
  }

  func removeCharacteristicListener(subscriptionId: Double) throws {
    removeListenerOnMain(subscriptionId, from: &characteristicListeners)
  }

  func onMtuChange(cb: @escaping (BleMTUChange) -> Void) throws -> Double {
    addListenerOnMain(cb, to: &mtuListeners)
  }

  func removeMtuListener(subscriptionId: Double) throws {
    removeListenerOnMain(subscriptionId, from: &mtuListeners)
  }

  private func performWithReadyManager(
    _ action: @escaping (CBCentralManager) throws -> Void
  ) -> BleFuture<Void> {
    let promise = BleFuture<Void>()
    runOnMain {
      do {
        try action(try self.requireReadyManager())
        promise.resolve(withResult: ())
      } catch {
        promise.reject(withError: error)
      }
    }
    return promise
  }

  private func requireManager() throws -> CBCentralManager {
    guard let manager = centralManager else {
      throw makeError("E_BLE_NOT_INITIALIZED:Call openBluetoothAdapter first")
    }
    return manager
  }

  private func requireReadyManager() throws -> CBCentralManager {
    let manager = try requireManager()
    try ensureBluetoothAuthorization(for: manager)
    guard manager.state == .poweredOn else {
      throw makeError("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is not powered on")
    }
    return manager
  }

  private func requireConnectedPeripheral(_ deviceId: String) throws -> CBPeripheral {
    let key = try requireDeviceId(deviceId)
    guard let peripheral = findPeripheral(deviceId: key) else {
      throw makeError("E_BLE_DEVICE_NOT_FOUND:BleDevice \(key) not found")
    }
    guard peripheral.state == .connected else {
      throw makeError("E_BLE_NOT_CONNECTED:BleDevice \(key) is not connected")
    }
    peripheral.delegate = peripheralDelegate
    return peripheral
  }

  private func findPeripheral(deviceId: String) -> CBPeripheral? {
    if let peripheral = peripherals[deviceId] {
      return peripheral
    }
    guard let manager = centralManager, let uuid = UUID(uuidString: deviceId) else {
      return nil
    }
    guard let peripheral = manager.retrievePeripherals(withIdentifiers: [uuid]).first else {
      return nil
    }
    peripherals[peripheral.identifier.uuidString] = peripheral
    return peripheral
  }

  private func characteristicAndPeripheral(
    deviceId: String,
    serviceId: String,
    characteristicId: String
  ) throws -> (CBPeripheral, CBCharacteristic) {
    let peripheral = try requireConnectedPeripheral(deviceId)
    guard let service = peripheral.services?.first(where: { $0.uuid.matches(serviceId) }) else {
      throw makeError("E_BLE_SERVICE_NOT_FOUND:BleService \(serviceId) not found")
    }
    guard let characteristic = service.characteristics?.first(where: { $0.uuid.matches(characteristicId) }) else {
      throw makeError("E_BLE_CHARACTERISTIC_NOT_FOUND:BleCharacteristic \(characteristicId) not found")
    }
    return (peripheral, characteristic)
  }

  private func ensureNotifyTypeSupported(
    _ type: String?,
    characteristic: CBCharacteristic
  ) throws {
    let supportsNotify = characteristic.properties.contains(.notify)
    let supportsIndicate = characteristic.properties.contains(.indicate)
    switch type {
    case nil:
      guard supportsNotify || supportsIndicate else {
        throw makeError("E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported")
      }
    case "notification":
      guard supportsNotify else {
        throw makeError("E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported")
      }
    case "indication":
      guard supportsIndicate else {
        throw makeError("E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported")
      }
    default:
      throw makeError("E_BLE_INVALID_DATA:Unknown notify type \(type ?? "")")
    }
  }

  private func characteristicKey(
    _ peripheral: CBPeripheral,
    _ characteristic: CBCharacteristic
  ) -> CharacteristicRequestKey {
    CharacteristicRequestKey(
      deviceId: peripheral.identifier.uuidString,
      serviceId: characteristic.service?.uuid.normalizedString ?? "",
      characteristicId: characteristic.uuid.normalizedString
    )
  }

  private func requireDeviceId(_ value: String) throws -> String {
    guard let canonical = canonicalDeviceId(value) else {
      throw makeError("E_BLE_INVALID_DATA:Invalid iOS device id \(value)")
    }
    return canonical
  }

  private func canonicalDeviceId(_ value: String) -> String? {
    UUID(uuidString: value)?.uuidString
  }

  private func makeServiceList(_ services: [CBService]) -> BleServiceList {
    BleServiceList(
      services: services.map {
        BleService(uuid: $0.uuid.normalizedString, isPrimary: $0.isPrimary)
      }
    )
  }

  private func makeCharacteristicList(_ characteristics: [CBCharacteristic]) -> BleCharacteristicList {
    BleCharacteristicList(
      characteristics: characteristics.map { characteristic in
        let properties = characteristic.properties
        return BleCharacteristic(
          uuid: characteristic.uuid.normalizedString,
          properties: BleCharacteristicProperties(
            read: properties.contains(.read),
            write: properties.contains(.write) || properties.contains(.writeWithoutResponse),
            writeDefault: properties.contains(.write),
            writeNoResponse: properties.contains(.writeWithoutResponse),
            notify: properties.contains(.notify),
            indicate: properties.contains(.indicate)
          )
        )
      }
    )
  }

  private func currentMtu(for peripheral: CBPeripheral) -> Double {
    let payloadLength = max(
      peripheral.maximumWriteValueLength(for: .withResponse),
      peripheral.maximumWriteValueLength(for: .withoutResponse)
    )
    return Double(payloadLength + 3)
  }

  private func currentMtu(
    for peripheral: CBPeripheral,
    writeType: CBCharacteristicWriteType
  ) -> Double {
    Double(peripheral.maximumWriteValueLength(for: writeType) + 3)
  }

  private func makeDevice(
    peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi: NSNumber
  ) -> BleDevice {
    let manufacturerBytes =
      (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data)?.map(Double.init) ?? []
    var serviceData: [String: Data] = [:]
    if let rawServiceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
      for (uuid, data) in rawServiceData {
        if let buffer = Optional(data) {
          serviceData[uuid.normalizedString] = buffer
        }
      }
    }
    let serviceUUIDs =
      (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map(\.normalizedString) ?? []
    return BleDevice(
      RSSI: rssi.doubleValue,
      advertisData: manufacturerBytes,
      advertisServiceUUIDs: serviceUUIDs,
      deviceId: peripheral.identifier.uuidString,
      localName: advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "",
      name: peripheral.name ?? "",
      serviceData: serviceData,
      connectable: advertisementData[CBAdvertisementDataIsConnectable] as? Bool
    )
  }

  private func completeOpen(_ promise: BleFuture<Void>, manager: CBCentralManager) {
    do {
      try ensureBluetoothAuthorization(for: manager)
      switch manager.state {
      case .poweredOn:
        promise.resolve(withResult: ())
      case .unknown, .resetting:
        openPromises.append(promise)
      case .poweredOff:
        promise.reject(withError: makeError("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable"))
      case .unsupported:
        promise.reject(withError: makeError("E_BLE_SYSTEM_NOT_SUPPORTED:Bluetooth is unsupported"))
      case .unauthorized:
        promise.reject(withError: makeError("E_BLE_PERMISSION:bluetooth"))
      @unknown default:
        promise.reject(withError: makeError("E_BLE_ADAPTER_NOT_AVAILABLE:Unknown Bluetooth state"))
      }
    } catch {
      promise.reject(withError: error)
    }
  }

  private func resolveOpenPromises(for manager: CBCentralManager) {
    let pending = openPromises
    openPromises.removeAll()
    pending.forEach { completeOpen($0, manager: manager) }
  }

  private func rejectPendingRequests(for deviceId: DeviceId, error: Error) {
    let services = servicePromises.removeValue(forKey: deviceId)
    dirtyServiceDevices.remove(deviceId)
    serviceGenerations.removeValue(forKey: deviceId)
    serviceDiscoveryGenerations.removeValue(forKey: deviceId)
    services?.reject(withError: error)
    rssiPromises.removeValue(forKey: deviceId)?.reject(withError: error)
    pendingWritesWithoutResponse.removeValue(forKey: deviceId)?.promise.reject(withError: error)
    rejectMatching(&characteristicPromises, deviceId: deviceId, error: error)
    rejectMatching(&notifyPromises, deviceId: deviceId, error: error)
    notifyTargets.keys
      .filter { $0.deviceId == deviceId }
      .forEach { notifyTargets.removeValue(forKey: $0) }
    rejectMatching(&readPromises, deviceId: deviceId, error: error)
    rejectMatching(&writePromises, deviceId: deviceId, error: error)
  }

  private func rejectMatching<Value>(
    _ store: inout [CharacteristicRequestKey: BleFuture<Value>],
    deviceId: DeviceId,
    error: Error
  ) {
    for key in store.keys.filter({ $0.deviceId == deviceId }) {
      store.removeValue(forKey: key)?.reject(withError: error)
    }
  }

  private func rejectMatching<Value>(
    _ store: inout [ServiceRequestKey: BleFuture<Value>],
    deviceId: DeviceId,
    error: Error
  ) {
    for key in store.keys.filter({ $0.deviceId == deviceId }) {
      store.removeValue(forKey: key)?.reject(withError: error)
    }
  }

  private func rejectAllPending(error: Error) {
    dirtyServiceDevices.removeAll()
    serviceGenerations.removeAll()
    serviceDiscoveryGenerations.removeAll()
    openPromises.forEach { $0.reject(withError: error) }
    openPromises.removeAll()
    rejectAll(&connectPromises, error: error)
    rejectAll(&disconnectPromises, error: error)
    rejectAll(&servicePromises, error: error)
    rejectAll(&characteristicPromises, error: error)
    rejectAll(&notifyPromises, error: error)
    notifyTargets.removeAll()
    rejectAll(&readPromises, error: error)
    rejectAll(&writePromises, error: error)
    rejectAll(&rssiPromises, error: error)
    pendingWritesWithoutResponse.values.forEach { $0.promise.reject(withError: error) }
    pendingWritesWithoutResponse.removeAll()
  }

  private func rejectAll<Key, Value>(
    _ store: inout [Key: BleFuture<Value>],
    error: Error
  ) {
    store.values.forEach { $0.reject(withError: error) }
    store.removeAll()
  }

  fileprivate func makeError(_ message: String) -> Error {
    NSError(domain: "BLE", code: 0, userInfo: [NSLocalizedDescriptionKey: message])
  }

  fileprivate func operationError(_ nativeCode: String, _ error: Error?, _ details: String) -> Error {
    let message = error?.localizedDescription ?? details
    return makeError("\(nativeCode):\(message)")
  }

  private func ensureBluetoothAuthorization(for manager: CBCentralManager) throws {
    if #available(iOS 13.0, *) {
      let authorization = CBCentralManager.authorization
      if authorization == .denied || authorization == .restricted {
        throw makeError("E_BLE_PERMISSION:bluetooth")
      }
    }
    if manager.state == .unauthorized {
      throw makeError("E_BLE_PERMISSION:bluetooth")
    }
  }

  private func emitAdapterState() {
    let state = BleAdapterState(
      available: centralManager?.state == .poweredOn,
      discovering: centralManager?.isScanning == true
    )
    notify(adapterStateListeners, value: state)
  }

  private func emitConnectState(deviceId: String, connected: Bool) {
    notify(connectStateListeners, value: BleConnectStateChange(deviceId: deviceId, connected: connected))
  }

  private func runOnMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread { block() }
    else { DispatchQueue.main.async(execute: block) }
  }

  private func runOnMainSync<T>(_ block: () -> T) -> T {
    if Thread.isMainThread { return block() }
    return DispatchQueue.main.sync(execute: block)
  }

  private func addListenerOnMain<T>(
    _ callback: @escaping (T) -> Void,
    to store: inout [Double: (T) -> Void]
  ) -> Double {
    runOnMainSync {
      let id = nextListenerId
      nextListenerId += 1
      store[id] = callback
      return id
    }
  }

  private func removeListenerOnMain<T>(
    _ id: Double,
    from store: inout [Double: (T) -> Void]
  ) {
    _ = runOnMainSync { store.removeValue(forKey: id) }
  }

  private func notify<T>(_ store: [Double: (T) -> Void], value: T) {
    for listener in Array(store.values) {
      listener(value)
    }
  }
}

extension BleEngine {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    resolveOpenPromises(for: central)
    emitAdapterState()
    if central.state != .poweredOn {
      let error = makeError("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable")
      rejectAll(&connectPromises, error: error)
      rejectAll(&disconnectPromises, error: error)
      for deviceId in peripherals.keys {
        rejectPendingRequests(for: deviceId, error: error)
      }
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let deviceId = peripheral.identifier.uuidString
    if let filter = addressScanFilter, !filter.contains(deviceId) { return }
    if let filter = nameScanFilter {
      let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
      let names = [peripheral.name, localName].compactMap { $0 }
      if !names.contains(where: filter.contains) { return }
    }
    let device = makeDevice(peripheral: peripheral, advertisementData: advertisementData, rssi: RSSI)
    peripherals[deviceId] = peripheral
    discoveredDevices[deviceId] = device
    notify(
      deviceFoundListeners,
      value: device
    )
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    let deviceId = peripheral.identifier.uuidString
    peripheral.delegate = peripheralDelegate
    connectPromises.removeValue(forKey: deviceId)?.resolve(withResult: ())
    emitConnectState(deviceId: deviceId, connected: true)
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    let deviceId = peripheral.identifier.uuidString
    let failure = operationError(
      "E_BLE_CONNECTION_FAILED",
      error,
      "Failed to connect to \(deviceId)"
    )
    connectPromises.removeValue(forKey: deviceId)?.reject(withError: failure)
    rejectPendingRequests(for: deviceId, error: failure)
    emitConnectState(deviceId: deviceId, connected: false)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    let deviceId = peripheral.identifier.uuidString
    connectPromises.removeValue(forKey: deviceId)?.reject(
      withError: operationError("E_BLE_CONNECTION_FAILED", error, "Connection cancelled")
    )
    if let promise = disconnectPromises.removeValue(forKey: deviceId) {
      if error != nil {
        promise.reject(
          withError: operationError("E_BLE_CONNECTION_FAILED", error, "Failed to disconnect")
        )
      }
      else { promise.resolve(withResult: ()) }
    }
    let disconnectError = operationError(
      "E_BLE_NOT_CONNECTED",
      error,
      "BleDevice \(deviceId) disconnected"
    )
    rejectPendingRequests(for: deviceId, error: disconnectError)
    emitConnectState(deviceId: deviceId, connected: false)
  }
}

extension BleEngine {
  func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
    let deviceId = peripheral.identifier.uuidString
    guard peripherals[deviceId] === peripheral, peripheral.state == .connected else { return }
    // CoreBluetooth invalidates the supplied service objects. Remaining services
    // can still make its cache nonempty, so the next explicit query must discover.
    dirtyServiceDevices.insert(deviceId)
    serviceGenerations[deviceId, default: 0] += 1
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    let deviceId = peripheral.identifier.uuidString
    guard peripherals[deviceId] === peripheral, peripheral.state == .connected,
          let promise = servicePromises[deviceId] else { return }
    if serviceDiscoveryGenerations[deviceId] != (serviceGenerations[deviceId] ?? 0) {
      // Finish the old system request before reissuing it. All callers keep one
      // pending result; an empty discovery result alone never causes this retry.
      serviceDiscoveryGenerations[deviceId] = serviceGenerations[deviceId] ?? 0
      peripheral.discoverServices(nil)
      return
    }
    servicePromises.removeValue(forKey: deviceId)
    serviceDiscoveryGenerations.removeValue(forKey: deviceId)
    if error != nil {
      promise.reject(
        withError: operationError("E_BLE_SERVICE_NOT_FOUND", error, "BleService discovery failed")
      )
    }
    else {
      dirtyServiceDevices.remove(deviceId)
      promise.resolve(withResult: makeServiceList(peripheral.services ?? []))
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    let key = ServiceRequestKey(
      deviceId: peripheral.identifier.uuidString,
      serviceId: service.uuid.normalizedString
    )
    guard let promise = characteristicPromises.removeValue(forKey: key) else { return }
    if error != nil {
      promise.reject(
        withError: operationError(
          "E_BLE_CHARACTERISTIC_NOT_FOUND",
          error,
          "BleCharacteristic discovery failed"
        )
      )
    }
    else { promise.resolve(withResult: makeCharacteristicList(service.characteristics ?? [])) }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let key = characteristicKey(peripheral, characteristic)
    if let promise = readPromises.removeValue(forKey: key) {
      if error != nil {
        promise.reject(withError: operationError("E_BLE_READ_FAILED", error, "Read failed"))
      }
      else { promise.resolve(withResult: ()) }
    }
    guard error == nil, let data = characteristic.value,
          let buffer = Optional(data) else { return }
    notify(
      characteristicListeners,
      value: BleCharacteristicValue(
        deviceId: peripheral.identifier.uuidString,
        serviceId: characteristic.service?.uuid.normalizedString ?? "",
        characteristicId: characteristic.uuid.normalizedString,
        value: buffer
      )
    )
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let key = characteristicKey(peripheral, characteristic)
    guard let promise = writePromises.removeValue(forKey: key) else { return }
    if error != nil {
      promise.reject(withError: operationError("E_BLE_WRITE_FAILED", error, "Write failed"))
    }
    else { promise.resolve(withResult: ()) }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateNotificationStateFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let key = characteristicKey(peripheral, characteristic)
    guard let promise = notifyPromises.removeValue(forKey: key) else { return }
    let expectedState = notifyTargets.removeValue(forKey: key)
    if error != nil {
      promise.reject(
        withError: operationError("E_BLE_NOTIFY_FAILED", error, "Notify update failed")
      )
    } else if expectedState == characteristic.isNotifying {
      promise.resolve(withResult: ())
    } else {
      promise.reject(withError: makeError("E_BLE_NOTIFY_FAILED:Notification state did not change"))
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
    let deviceId = peripheral.identifier.uuidString
    guard let promise = rssiPromises.removeValue(forKey: deviceId) else { return }
    if error != nil {
      promise.reject(withError: operationError("E_BLE_RSSI_FAILED", error, "RSSI read failed"))
    }
    else { promise.resolve(withResult: BleDeviceRSSI(RSSI: RSSI.doubleValue)) }
  }

  func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    let deviceId = peripheral.identifier.uuidString
    guard peripheral.canSendWriteWithoutResponse,
          let pending = pendingWritesWithoutResponse.removeValue(forKey: deviceId) else { return }
    peripheral.writeValue(pending.data, for: pending.characteristic, type: .withoutResponse)
    pending.promise.resolve(withResult: ())
  }
}

private struct PendingWriteWithoutResponse {
  let data: Data
  let characteristic: CBCharacteristic
  let promise: BleFuture<Void>
}

private extension BleFuture {
  func chain(to target: BleFuture<T>) {
    observe { result in
      switch result {
      case .success(let value): target.resolve(withResult: value)
      case .failure(let error): target.reject(withError: error)
      }
    }
  }
}

private extension CBCharacteristicProperties {
  func contains(_ other: CBCharacteristicProperties) -> Bool {
    rawValue & other.rawValue != 0
  }
}

private extension CBUUID {
  var normalizedString: String {
    canonicalBluetoothUUID(uuidString)
  }

  func matches(_ value: String) -> Bool {
    normalizedString == canonicalBluetoothUUID(value)
  }
}

private func canonicalBluetoothUUID(_ value: String) -> String {
  let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  switch normalized.count {
  case 4:
    return "0000\(normalized)-0000-1000-8000-00805f9b34fb"
  case 8:
    return "\(normalized)-0000-1000-8000-00805f9b34fb"
  default:
    return normalized
  }
}
