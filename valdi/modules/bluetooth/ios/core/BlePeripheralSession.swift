import Foundation

extension BleCore {
  var peripheral: BlePeripheralEngine {
    if let existing = peripheralLifecycle as? BlePeripheralEngine { return existing }
    let engine = BlePeripheralEngine()
    engine.onAdapterState = { [weak self] state in
      guard let self else { return }
      // A central manager may remain open while the peripheral role changes state.
      let emit: (BleAdapterState) -> Void = { current in
        let event = BleAdapterState(available: current.available, discovering: current.discovering, peripheralAvailable: state.available)
        Array(self.peripheralAdapterListeners.values).forEach { $0(event) }
      }
      do {
        try self.engine.getBluetoothAdapterState().observe { outcome in
          if case .success(let central) = outcome { emit(BleAdapterState(available: central.available || state.available, discovering: central.discovering)) }
          else { emit(state) }
        }
      } catch { emit(state) }
    }
    peripheralLifecycle = engine
    return engine
  }
}

public extension BleSession {
  func openBluetoothAdapter(mode: String?) -> BleFuture<Void> {
    guard let mode, mode != "central" else { return openBluetoothAdapter() }
    return core.submit(self, key: nil) { _ in
      guard mode == "peripheral" else { throw NSError(domain: "BLE", code: 0, userInfo: [NSLocalizedDescriptionKey: "E_BLE_INVALID_DATA:Unknown adapter mode"]) }
      return self.core.peripheral.open()
    }
  }
  func createBLEPeripheralServer() -> BleFuture<BlePeripheralServerInfo> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.create(owner: ObjectIdentifier(self)) }
  }
  func addPeripheralService(params: BlePeripheralServiceParams) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.add(owner: ObjectIdentifier(self), params: params) }
  }
  func removePeripheralService(params: BlePeripheralRemoveServiceParams) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.remove(owner: ObjectIdentifier(self), params: params) }
  }
  func startPeripheralAdvertising(params: BlePeripheralAdvertisingParams) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.startAdvertising(owner: ObjectIdentifier(self), params: params) }
  }
  func stopPeripheralAdvertising(serverId: String) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.stopAdvertising(owner: ObjectIdentifier(self), serverId: serverId) }
  }
  func writePeripheralCharacteristicValue(params: BlePeripheralWriteParams) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.write(owner: ObjectIdentifier(self), params: params) }
  }
  func closeBLEPeripheralServer(serverId: String) -> BleFuture<Void> {
    core.submit(self, key: nil) { _ in try self.core.peripheral.closeServer(owner: ObjectIdentifier(self), serverId: serverId) }
  }
  func onPeripheralReadRequest(cb: @escaping (BlePeripheralReadRequest) -> Void) throws -> Double {
    try core.sync { guard !released else { throw releaseError }; return core.peripheral.onRead(owner: ObjectIdentifier(self)) { [weak self] in if self?.released == false { cb($0) } } }
  }
  func onPeripheralWriteRequest(cb: @escaping (BlePeripheralWriteRequest) -> Void) throws -> Double {
    try core.sync { guard !released else { throw releaseError }; return core.peripheral.onWrite(owner: ObjectIdentifier(self)) { [weak self] in if self?.released == false { cb($0) } } }
  }
  func onPeripheralSubscribed(cb: @escaping (BlePeripheralSubscriptionEvent) -> Void) throws -> Double {
    try core.sync { guard !released else { throw releaseError }; return core.peripheral.onSubscribe(owner: ObjectIdentifier(self)) { [weak self] in if self?.released == false { cb($0) } } }
  }
  func onPeripheralUnsubscribed(cb: @escaping (BlePeripheralSubscriptionEvent) -> Void) throws -> Double {
    try core.sync { guard !released else { throw releaseError }; return core.peripheral.onUnsubscribe(owner: ObjectIdentifier(self)) { [weak self] in if self?.released == false { cb($0) } } }
  }
  func onPeripheralConnectionStateChange(cb: @escaping (BlePeripheralConnectionState) -> Void) throws -> Double {
    try core.sync { guard !released else { throw releaseError }; return core.peripheral.onConnection(owner: ObjectIdentifier(self)) { [weak self] in if self?.released == false { cb($0) } } }
  }
  func removePeripheralReadRequestListener(subscriptionId: Double) { removePeripheralListener(subscriptionId) }
  func removePeripheralWriteRequestListener(subscriptionId: Double) { removePeripheralListener(subscriptionId) }
  func removePeripheralSubscribedListener(subscriptionId: Double) { removePeripheralListener(subscriptionId) }
  func removePeripheralUnsubscribedListener(subscriptionId: Double) { removePeripheralListener(subscriptionId) }
  func removePeripheralConnectionStateListener(subscriptionId: Double) { removePeripheralListener(subscriptionId) }
  private func removePeripheralListener(_ id: Double) { core.main { self.core.peripheral.removeListener(owner: ObjectIdentifier(self), id: id) } }
}
