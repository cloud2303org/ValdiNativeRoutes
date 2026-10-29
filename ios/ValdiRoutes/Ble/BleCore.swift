import Foundation

protocol BlePeripheralLifecycle: AnyObject {
  func close()
  func getState() -> BleFuture<BleAdapterState>
  func release(owner: ObjectIdentifier)
}

public final class BleCore {
  var peripheralLifecycle: BlePeripheralLifecycle?
  var peripheralAdapterListeners: [Double: (BleAdapterState) -> Void] = [:]
  public static let shared = BleCore()
  let engine = BleEngine()
  private var adapterGeneration: UInt64 = 0
  private var deviceGenerations: [String: UInt64] = [:]
  private var queues: [String: [() -> Void]] = [:]
  private init() {}
  func main(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }
  func sync<T>(_ action: () throws -> T) rethrows -> T {
    if Thread.isMainThread { return try action() }
    return try DispatchQueue.main.sync(execute: action)
  }
  func submit<T>(_ session: BleSession, key: String?, _ action: @escaping (BleEngine) throws -> BleFuture<T>) -> BleFuture<T> {
    let output = BleFuture<T>()
    main {
      guard !session.released else { output.reject(withError: session.releaseError); return }
      let operationId = UUID()
      session.pending[operationId] = { output.reject(withError: session.releaseError) }
      let normalized = key?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let capturedAdapter = self.adapterGeneration
      let capturedDevice = normalized.map { self.deviceGenerations[$0] ?? 0 }
      let run = {
        guard !session.released, self.adapterGeneration == capturedAdapter, normalized.map({ self.deviceGenerations[$0] ?? 0 }) == capturedDevice else {
          output.reject(withError: NSError(domain: "BLE", code: 10000, userInfo: [NSLocalizedDescriptionKey: "E_BLE_NOT_INITIALIZED:Operation session ended"]))
          session.pending.removeValue(forKey: operationId); if let normalized { self.complete(normalized) }; return }
        do {
          try action(self.engine).observe { result in self.main {
            session.pending.removeValue(forKey: operationId)
            switch result {
            case .success(let value): output.resolve(withResult: value)
            case .failure(let error): output.reject(withError: error)
            }
            if let normalized { self.complete(normalized) }
          } }
        } catch {
          session.pending.removeValue(forKey: operationId)
          output.reject(withError: error)
          if let normalized { self.complete(normalized) }
        }
      }
      if let normalized {
        self.queues[normalized, default: []].append(run)
        if self.queues[normalized]?.count == 1 { run() }
      } else { run() }
    }
    return output
  }
  private func complete(_ key: String) {
    guard var queue = queues[key], !queue.isEmpty else { return }
    queue.removeFirst()
    queues[key] = queue.isEmpty ? nil : queue
    queue.first?()
  }
  private var leases: [String: Set<ObjectIdentifier>] = [:]
  private var leaseCleanup: [String: (String, (BleEngine) throws -> BleFuture<Void>)] = [:]
  private var scanSignature: String?
  private lazy var maintenance = BleSession(core: self)
  fileprivate func resource(_ session: BleSession, resource: String, queue: String, signature: String? = nil, enable: Bool = true,
    action: @escaping (BleEngine) throws -> BleFuture<Void>, cleanup: @escaping (BleEngine) throws -> BleFuture<Void>) -> BleFuture<Void> {
    submit(session, key: queue) { engine in
      if resource == "@scan", enable, let active = self.scanSignature, active != signature {
        throw NSError(domain: "BLE", code: 10008, userInfo: [NSLocalizedDescriptionKey: "E_BLE_OPERATE_FAILED:A different discovery request is active"])
      }
      let id = ObjectIdentifier(session)
      if !enable {
        self.leases[resource]?.remove(id)
        if self.leases[resource]?.isEmpty == false {
          let result = BleFuture<Void>(); result.resolve(withResult: ()); return result
        }
      }
      let result = try action(engine)
      result.observe { outcome in self.main {
        if case .success = outcome {
          if enable && !session.released {
            self.leases[resource, default: []].insert(id)
            self.leaseCleanup[resource] = (queue, cleanup)
            if resource == "@scan" { self.scanSignature = signature }
          } else if self.leases[resource]?.isEmpty != false {
            self.leases.removeValue(forKey: resource)
            self.leaseCleanup.removeValue(forKey: resource)
            if resource == "@scan" { self.scanSignature = nil }
            if enable { _ = self.submit(self.maintenance, key: queue, cleanup) }
          }
        }
      } }
      return result
    }
  }
  fileprivate func releaseResources(_ session: BleSession) {
    let id = ObjectIdentifier(session)
    for resource in Array(leases.keys) {
      leases[resource]?.remove(id)
      if leases[resource]?.isEmpty == true {
        leases.removeValue(forKey: resource)
        let cleanup = leaseCleanup.removeValue(forKey: resource)
        if resource == "@scan" { scanSignature = nil }
        if let cleanup { _ = submit(maintenance, key: cleanup.0, cleanup.1) }
      }
    }
  }
  fileprivate func invalidate(deviceId: String? = nil) {
    if let deviceId {
      let key = deviceId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      deviceGenerations[key, default: 0] += 1
      for resource in Array(leases.keys).filter({ $0.hasPrefix("notify:\(key):") }) {
        leases.removeValue(forKey: resource); leaseCleanup.removeValue(forKey: resource)
      }
    } else {
      adapterGeneration += 1
      leases.removeAll(); leaseCleanup.removeAll(); scanSignature = nil
    }
  }
  public func createSession() -> BleSession { BleSession(core: self) }
}

public final class BleSession {
  let core: BleCore
  var released = false
  fileprivate var pending: [UUID: () -> Void] = [:]
  private var cleanup: [String: () -> Void] = [:]
  var releaseError: Error { NSError(domain: "BLE", code: 0, userInfo: [NSLocalizedDescriptionKey: "E_BLE_SESSION_RELEASED:Session released"]) }
  fileprivate init(core: BleCore) { self.core = core }
  public func release() { core.main {
    guard !self.released else { return }
    self.released = true
    self.core.peripheralLifecycle?.release(owner: ObjectIdentifier(self))
    self.core.releaseResources(self)
    self.pending.values.forEach { $0() }; self.pending.removeAll()
    self.cleanup.values.forEach { $0() }; self.cleanup.removeAll()
  } }
  public func openBluetoothAdapter() -> BleFuture<Void> {
    core.submit(self, key: "@adapter") { try $0.openBluetoothAdapter() }
  }
  public func closeBluetoothAdapter() -> BleFuture<Void> {
    core.submit(self, key: nil) { self.core.invalidate(); self.core.peripheralLifecycle?.close(); return try $0.closeBluetoothAdapter() }
  }
  public func getBluetoothAdapterState() -> BleFuture<BleAdapterState> {
    core.submit(self, key: "@adapter") { engine in
      let result = BleFuture<BleAdapterState>()
      try engine.getBluetoothAdapterState().observe { outcome in
        switch outcome {
        case .success(let state): result.resolve(withResult: state)
        case .failure(let error):
          if let peripheral = self.core.peripheralLifecycle {
            peripheral.getState().observe { value in
              switch value {
              case .success(let state): result.resolve(withResult: state)
              case .failure(let error): result.reject(withError: error)
              }
            }
          } else { result.reject(withError: error) }
        }
      }
      return result
    }
  }
  public func startBluetoothDevicesDiscovery(params: BleScanParams) -> BleFuture<Void> {
    core.resource(self, resource: "@scan", queue: "@adapter", signature: "services:\(params.services?.map { $0.lowercased() }.sorted() ?? []);duplicates:\(params.allowDuplicatesKey ?? false);power:\(params.powerLevel ?? "medium")", action: { try $0.startBluetoothDevicesDiscovery(params: params) }, cleanup: { try $0.stopBluetoothDevicesDiscovery() })
  }
  public func startBluetoothDevicesDiscoveryWithNames(params: BleScanWithNameParams) -> BleFuture<Void> {
    core.resource(self, resource: "@scan", queue: "@adapter", signature: "names:\(params.peripheralNames.sorted())", action: { try $0.startBluetoothDevicesDiscoveryWithNames(params: params) }, cleanup: { try $0.stopBluetoothDevicesDiscovery() })
  }
  public func startBluetoothDevicesDiscoveryWithAddresses(params: BleScanWithAddressesParams) -> BleFuture<Void> {
    core.resource(self, resource: "@scan", queue: "@adapter", signature: "addresses:\(params.peripheralAddresses.map { $0.lowercased() }.sorted())", action: { try $0.startBluetoothDevicesDiscoveryWithAddresses(params: params) }, cleanup: { try $0.stopBluetoothDevicesDiscovery() })
  }
  public func stopBluetoothDevicesDiscovery() -> BleFuture<Void> {
    core.resource(self, resource: "@scan", queue: "@adapter", enable: false, action: { try $0.stopBluetoothDevicesDiscovery() }, cleanup: { try $0.stopBluetoothDevicesDiscovery() })
  }
  public func getBluetoothDevices() -> BleFuture<BleDeviceList> {
    core.submit(self, key: "@adapter") { try $0.getBluetoothDevices() }
  }
  public func createBLEConnection(deviceId: String, timeout: Double = 15_000) -> BleFuture<Void> {
    core.submit(self, key: deviceId) { try $0.createBLEConnection(deviceId: deviceId, timeout: timeout) }
  }
  public func closeBLEConnection(deviceId: String) -> BleFuture<Void> {
    core.submit(self, key: nil) { self.core.invalidate(deviceId: deviceId); return try $0.closeBLEConnection(deviceId: deviceId) }
  }
  public func makeBluetoothPair(params: BlePairParams) -> BleFuture<Void> {
    core.submit(self, key: params.deviceId) { try $0.makeBluetoothPair(params: params) }
  }
  public func isBluetoothDevicePaired(deviceId: String) -> BleFuture<Void> {
    core.submit(self, key: deviceId) { try $0.isBluetoothDevicePaired(deviceId: deviceId) }
  }
  public func getBLEDeviceServices(deviceId: String) -> BleFuture<BleServiceList> {
    core.submit(self, key: deviceId) { try $0.getBLEDeviceServices(deviceId: deviceId) }
  }
  public func getBLEDeviceRSSI(deviceId: String) -> BleFuture<BleDeviceRSSI> {
    core.submit(self, key: deviceId) { try $0.getBLEDeviceRSSI(deviceId: deviceId) }
  }
  public func getBLEDeviceCharacteristics(params: BleDeviceServiceParams) -> BleFuture<BleCharacteristicList> {
    core.submit(self, key: params.deviceId) { try $0.getBLEDeviceCharacteristics(params: params) }
  }
  public func notifyBLECharacteristicValueChange(params: BleNotifyParams) -> BleFuture<Void> {
    let resource = "notify:\(params.deviceId.lowercased()):\(params.serviceId.lowercased()):\(params.characteristicId.lowercased())"
    return core.resource(self, resource: resource, queue: params.deviceId, enable: params.state,
      action: { try $0.notifyBLECharacteristicValueChange(params: params) },
      cleanup: { try $0.notifyBLECharacteristicValueChange(params: BleNotifyParams(deviceId: params.deviceId, serviceId: params.serviceId, characteristicId: params.characteristicId, state: false, type: params.type)) })
  }
  public func writeBLECharacteristicValue(params: BleWriteParams) -> BleFuture<Void> {
    core.submit(self, key: params.deviceId) { try $0.writeBLECharacteristicValue(params: params) }
  }
  public func readBLECharacteristicValue(params: BleReadParams) -> BleFuture<Void> {
    core.submit(self, key: params.deviceId) { try $0.readBLECharacteristicValue(params: params) }
  }
  public func setBLEMTU(params: BleMTUParams) -> BleFuture<BleMTU> {
    core.submit(self, key: params.deviceId) { try $0.setBLEMTU(params: params) }
  }
  public func getBLEMTU(params: BleDeviceIdParams) -> BleFuture<BleMTU> {
    core.submit(self, key: params.deviceId) { try $0.getBLEMTU(params: params) }
  }
  public func getConnectedBluetoothDevices(params: BleConnectedDevicesParams) -> BleFuture<BleConnectedDevicesResult> {
    core.submit(self, key: "@adapter") { try $0.getConnectedBluetoothDevices(params: params) }
  }
  public func onBluetoothDeviceFound(cb: @escaping (_ d: BleDevice) -> Void) throws -> Double {
    return try core.sync {
    guard !released else { throw releaseError }
    let id = try core.engine.onBluetoothDeviceFound { if !self.released { cb($0) } }
    cleanup["onBluetoothDeviceFound\(id)"] = { try? self.core.engine.removeBluetoothDeviceFoundListener(subscriptionId: id) }
    return id
    }
  }
  public func removeBluetoothDeviceFoundListener(subscriptionId: Double) { core.main { self.cleanup.removeValue(forKey: "onBluetoothDeviceFound\(subscriptionId)")?() } }
  public func onAdapterStateChange(cb: @escaping (_ state: BleAdapterState) -> Void) throws -> Double {
    return try core.sync {
    guard !released else { throw releaseError }
    let id = try core.engine.onAdapterStateChange { if !self.released { cb($0) } }
    core.peripheralAdapterListeners[id] = { if !self.released { cb($0) } }
    cleanup["onAdapterStateChange\(id)"] = {
      self.core.peripheralAdapterListeners.removeValue(forKey: id)
      try? self.core.engine.removeAdapterStateListener(subscriptionId: id)
    }
    return id
    }
  }
  public func removeAdapterStateListener(subscriptionId: Double) { core.main { self.cleanup.removeValue(forKey: "onAdapterStateChange\(subscriptionId)")?() } }
  public func onConnectStateChange(cb: @escaping (_ event: BleConnectStateChange) -> Void) throws -> Double {
    return try core.sync {
    guard !released else { throw releaseError }
    let id = try core.engine.onConnectStateChange { if !self.released { cb($0) } }
    cleanup["onConnectStateChange\(id)"] = { try? self.core.engine.removeConnectStateListener(subscriptionId: id) }
    return id
    }
  }
  public func removeConnectStateListener(subscriptionId: Double) { core.main { self.cleanup.removeValue(forKey: "onConnectStateChange\(subscriptionId)")?() } }
  public func onCharacteristicUpdate(cb: @escaping (_ event: BleCharacteristicValue) -> Void) throws -> Double {
    return try core.sync {
    guard !released else { throw releaseError }
    let id = try core.engine.onCharacteristicUpdate { if !self.released { cb($0) } }
    cleanup["onCharacteristicUpdate\(id)"] = { try? self.core.engine.removeCharacteristicListener(subscriptionId: id) }
    return id
    }
  }
  public func removeCharacteristicListener(subscriptionId: Double) { core.main { self.cleanup.removeValue(forKey: "onCharacteristicUpdate\(subscriptionId)")?() } }
  public func onMtuChange(cb: @escaping (_ event: BleMTUChange) -> Void) throws -> Double {
    return try core.sync {
    guard !released else { throw releaseError }
    let id = try core.engine.onMtuChange { if !self.released { cb($0) } }
    cleanup["onMtuChange\(id)"] = { try? self.core.engine.removeMtuListener(subscriptionId: id) }
    return id
    }
  }
  public func removeMtuListener(subscriptionId: Double) { core.main { self.cleanup.removeValue(forKey: "onMtuChange\(subscriptionId)")?() } }
}
