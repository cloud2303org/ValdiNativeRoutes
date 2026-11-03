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
  private struct ConnectKey: Hashable {
    let device: String
    let timeout: Double
  }
  private class Work {
    let id = UUID()
    var sequence: UInt64 = 0
    let key: String?
    var adapter: UInt64
    let device: UInt64?
    let adapterClose: Bool
    let adapterOpen: Bool
    var started = false
    var run: (() -> Void)?
    init(key: String?, adapter: UInt64, device: UInt64?, adapterClose: Bool, adapterOpen: Bool) {
      self.key = key; self.adapter = adapter; self.device = device
      self.adapterClose = adapterClose; self.adapterOpen = adapterOpen
    }
    var hasWaiters: Bool { fatalError("abstract") }
    func reject(_ error: Error) { fatalError("abstract") }
    func take(_ session: BleSession) -> (() -> Void) { fatalError("abstract") }
  }
  private final class Operation<T>: Work {
    private var waiters: [ObjectIdentifier: (BleSession, [BleFuture<T>])] = [:]
    func add(_ session: BleSession, _ output: BleFuture<T>) {
      let id = ObjectIdentifier(session)
      if waiters[id] == nil { waiters[id] = (session, []) }
      waiters[id]!.1.append(output)
    }
    override var hasWaiters: Bool { !waiters.isEmpty }
    func finish(_ result: Result<T, Error>) {
      let pending = Array(waiters.values)
      waiters.removeAll()
      for (session, outputs) in pending {
        for output in outputs {
          if session.released { output.reject(withError: session.releaseError) }
          else {
            switch result {
            case .success(let value): output.resolve(withResult: value)
            case .failure(let error): output.reject(withError: error)
            }
          }
        }
      }
    }
    override func reject(_ error: Error) { finish(.failure(error)) }
    override func take(_ session: BleSession) -> (() -> Void) {
      let outputs = waiters.removeValue(forKey: ObjectIdentifier(session))?.1 ?? []
      return { outputs.forEach { $0.reject(withError: session.releaseError) } }
    }
  }
  private var queues: [String: [Work]] = [:]
  private var work: [UUID: Work] = [:]
  private var connects: [ConnectKey: Work] = [:]
  private var fences = 0
  private var pumping = false
  private var nextSequence: UInt64 = 0
  private init() {
    engine.willInvalidate = { [weak self] deviceId, error, preserveOpen in
      self?.beginInvalidation(deviceId: deviceId, error: error, preserveOpen: preserveOpen)
    }
    engine.didInvalidate = { [weak self] in
      guard let self else { return }
      self.fences -= 1
      self.pump()
    }
  }
  func main(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }
  func sync<T>(_ action: () throws -> T) rethrows -> T {
    if Thread.isMainThread { return try action() }
    return try DispatchQueue.main.sync(execute: action)
  }
  func submit<T>(_ session: BleSession, key: String?, connectTimeout: Double? = nil,
                 adapterClose: Bool = false, adapterOpen: Bool = false,
                 _ action: @escaping (BleEngine) throws -> BleFuture<T>) -> BleFuture<T> {
    let output = BleFuture<T>()
    main { [self] in
      guard !session.released else { output.reject(withError: session.releaseError); return }
      let normalized = key?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let connect = normalized.flatMap { device in connectTimeout.map { ConnectKey(device: device, timeout: $0) } }
      if let connect, let active = self.connects[connect] as? Operation<T> {
        active.add(session, output)
        return
      }
      let task = Operation<T>(key: normalized, adapter: self.adapterGeneration,
        device: normalized.map { self.deviceGenerations[$0] ?? 0 }, adapterClose: adapterClose, adapterOpen: adapterOpen)
      self.nextSequence += 1
      task.sequence = self.nextSequence
      task.add(session, output)
      task.run = { [weak self, weak task] in
        guard let self, let task else { return }
        do {
          try action(self.engine).observe { [weak self, weak task] result in self?.main {
            guard let self, let task, self.work[task.id] === task else { return }
            self.fences += 1
            self.detach(task)
            if self.current(task) { task.finish(result) }
            else { task.reject(self.staleError) }
            self.fences -= 1
            self.pump()
          } }
        } catch {
          guard self.work[task.id] === task else { return }
          self.fences += 1
          self.detach(task)
          task.reject(error)
          self.fences -= 1
          self.pump()
        }
      }
      self.work[task.id] = task
      if let connect { self.connects[connect] = task }
      if let normalized { self.queues[normalized, default: []].append(task) }
      self.pump()
    }
    return output
  }
  private var staleError: Error {
    NSError(domain: "BLE", code: 10000, userInfo: [NSLocalizedDescriptionKey: "E_BLE_NOT_INITIALIZED:Operation session ended"])
  }
  private func current(_ task: Work) -> Bool {
    task.adapterClose || (task.adapter == adapterGeneration &&
      task.key.map { deviceGenerations[$0] ?? 0 } == task.device)
  }
  private func detach(_ task: Work) {
    work.removeValue(forKey: task.id)
    task.run = nil
    if let key = task.key {
      queues[key]?.removeAll { $0 === task }
      if queues[key]?.isEmpty == true { queues.removeValue(forKey: key) }
    }
    for key in Array(connects.keys) where connects[key] === task { connects.removeValue(forKey: key) }
  }
  private func pump() {
    guard fences == 0, !pumping else { return }
    pumping = true
    defer { pumping = false }
    while fences == 0, let task = work.values.filter({
      !$0.started && ($0.key == nil || queues[$0.key!]?.first === $0)
    }).min(by: { $0.sequence < $1.sequence }) {
      if !current(task) {
        detach(task)
        task.reject(staleError)
        continue
      }
      task.started = true
      let run = task.run
      task.run = nil
      run?()
    }
  }
  fileprivate func release(_ session: BleSession) {
    fences += 1
    var cancel: [() -> Void] = []
    for task in Array(work.values) {
      cancel.append(task.take(session))
      // An active OS request still owns the device slot until it finishes.
      if !task.started && !task.hasWaiters { detach(task) }
    }
    releaseResources(session)
    cancel.forEach { $0() }
    fences -= 1
    pump()
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
      let adapter = self.adapterGeneration
      let key = queue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let device = self.deviceGenerations[key] ?? 0
      let result = try action(engine)
      result.observe { outcome in self.main {
        guard self.adapterGeneration == adapter, (self.deviceGenerations[key] ?? 0) == device else { return }
        if case .success = outcome {
          if enable && !session.released {
            self.leases[resource, default: []].insert(id)
            self.leaseCleanup[resource] = (queue, cleanup)
            if resource == "@scan" { self.scanSignature = signature }
          } else if self.leases[resource]?.isEmpty != false {
            self.leases.removeValue(forKey: resource)
            self.leaseCleanup.removeValue(forKey: resource)
            if resource == "@scan" { self.scanSignature = nil }
            if enable { self.scheduleCleanup(resource: resource, queue: queue, cleanup: cleanup) }
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
        if let cleanup { scheduleCleanup(resource: resource, queue: cleanup.0, cleanup: cleanup.1) }
      }
    }
  }
  private func scheduleCleanup(resource: String, queue: String,
                               cleanup: @escaping (BleEngine) throws -> BleFuture<Void>) {
    _ = submit(maintenance, key: queue) { engine in
      // Another session may acquire the resource before queued cleanup enters
      // the engine. Recheck owners while still holding the resource's FIFO slot.
      if self.leases[resource]?.isEmpty == false {
        let result = BleFuture<Void>(); result.resolve(withResult: ()); return result
      }
      return try cleanup(engine)
    }
  }
  private func beginInvalidation(deviceId: String?, error: Error, preserveOpen: Bool) {
    fences += 1
    let key = deviceId?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
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
    // CoreBluetooth may reset while first authorization/open is still pending.
    let opening = preserveOpen ? work.values.filter { $0.adapterOpen && $0.started } : []
    opening.forEach { $0.adapter = adapterGeneration }
    let cancelled = work.values.filter {
      !$0.adapterClose && !(preserveOpen && $0.adapterOpen && $0.started) && (key == nil || $0.key == key)
    }
    // Detach the entire old generation before any rejection can reenter.
    cancelled.forEach { detach($0) }
    cancelled.forEach { $0.reject(error) }
  }
  public func createSession() -> BleSession { BleSession(core: self) }
}

public final class BleSession {
  let core: BleCore
  var released = false
  private var cleanup: [String: () -> Void] = [:]
  var releaseError: Error { NSError(domain: "BLE", code: 0, userInfo: [NSLocalizedDescriptionKey: "E_BLE_SESSION_RELEASED:Session released"]) }
  fileprivate init(core: BleCore) { self.core = core }
  public func release() { core.main {
    guard !self.released else { return }
    self.released = true
    self.core.release(self)
    self.core.peripheralLifecycle?.release(owner: ObjectIdentifier(self))
    let cleanup = Array(self.cleanup.values); self.cleanup.removeAll()
    cleanup.forEach { $0() }
  } }
  public func openBluetoothAdapter() -> BleFuture<Void> {
    core.submit(self, key: "@adapter", adapterOpen: true) { try $0.openBluetoothAdapter() }
  }
  public func closeBluetoothAdapter() -> BleFuture<Void> {
    core.submit(self, key: nil, adapterClose: true) {
      try $0.closeBluetoothAdapter { self.core.peripheralLifecycle?.close() }
    }
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
    core.submit(self, key: deviceId, connectTimeout: timeout) { try $0.createBLEConnection(deviceId: deviceId, timeout: timeout) }
  }
  public func closeBLEConnection(deviceId: String) -> BleFuture<Void> {
    core.submit(self, key: nil) { try $0.closeBLEConnection(deviceId: deviceId) }
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
    let resource = "notify:\(params.deviceId.lowercased()):\(canonicalBluetoothUUID(params.serviceId)):\(canonicalBluetoothUUID(params.characteristicId))"
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
