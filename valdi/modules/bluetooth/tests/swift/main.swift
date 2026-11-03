import CoreBluetooth
import Foundation

final class Observed<T> {
  var results: [Result<T, Error>] = []
  init(_ future: BleFuture<T>) { future.observe { self.results.append($0) } }
  var failed: Bool { if case .failure? = results.first { return true }; return false }
  var succeeded: Bool { if case .success? = results.first { return true }; return false }
  var message: String { if case .failure(let e)? = results.first { return e.localizedDescription }; return "" }
}

let core = BleCore.shared
let id = "00000000-0000-0000-0000-000000000001"
let otherId = "00000000-0000-0000-0000-000000000002"
var failures = 0
var caseIndex = 0
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
  if !condition() { failures += 1; print("FAIL \(message)") }
}
func fixture() -> (BleSession, CBCentralManager, CBPeripheral) {
  let session = core.createSession()
  _ = session.closeBluetoothAdapter()
  _ = session.openBluetoothAdapter()
  let manager = CBCentralManager.last!
  manager.delegate?.centralManagerDidUpdateState(manager)
  let peripheral = CBPeripheral(UUID(uuidString: id)!)
  peripheral.state = .connected
  manager.devices[peripheral.identifier] = peripheral
  manager.delegate?.centralManager(manager, didDiscover: peripheral, advertisementData: [:], rssi: -50)
  return (session, manager, peripheral)
}
func test(_ name: String, _ body: () throws -> Void) {
  caseIndex += 1
  if CommandLine.arguments.contains("--list") { print("CASE:\(caseIndex)"); return }
  if let selected = CommandLine.arguments.dropFirst().first, selected != "\(caseIndex)" { return }
  let before = failures
  do { try body() } catch { failures += 1; print("FAIL \(name): \(error)") }
  print("\(failures == before ? "PASS" : "FAILED") \(name)")
}

test("disconnect fences successor before engine rejection and event") {
  let (session, manager, peripheral) = fixture()
  let active = Observed(session.getBLEDeviceRSSI(deviceId: id))
  var dispatched = false
  let queued = Observed(core.submit(session, key: id) { _ -> BleFuture<Void> in
    dispatched = true; let result = BleFuture<Void>(); result.resolve(withResult: ()); return result
  })
  var cancelledBeforeEvent = false
  _ = try session.onConnectStateChange { event in
    if !event.connected { cancelledBeforeEvent = active.failed && queued.failed }
  }
  manager.disconnected(peripheral)
  expect(!dispatched, "disconnect dispatched old successor")
  expect(active.failed && queued.failed, "disconnect did not reject active and queued work")
  expect(cancelledBeforeEvent, "disconnect event preceded cancellation")
  session.release()
}

test("power loss cancels adapter and device queues before callbacks drain") {
  let (session, manager, _) = fixture()
  let active = Observed(session.getBLEDeviceRSSI(deviceId: id))
  let adapterGate = BleFuture<Void>()
  let adapter = Observed(core.submit(session, key: "@adapter") { _ in adapterGate })
  var dispatched = false
  let queued = Observed(core.submit(session, key: id) { _ -> BleFuture<Void> in
    dispatched = true; return BleFuture<Void>()
  })
  manager.poweredOff()
  expect(active.failed && adapter.failed && queued.failed, "power loss left a native operation pending")
  expect(!dispatched, "power loss dispatched an old generation")
  adapterGate.resolve(withResult: ())
  expect(adapter.results.count == 1 && adapter.failed, "late adapter success beat cancellation")
  session.release()
}

test("late success cannot settle cancelled work or pop replacement queue") {
  let (session, manager, peripheral) = fixture()
  let oldGate = BleFuture<Void>()
  let old = Observed(core.submit(session, key: id) { _ in oldGate })
  manager.disconnected(peripheral)
  expect(old.failed, "disconnect did not immediately cancel synthetic active work")
  peripheral.state = .connected
  let newGate = BleFuture<Void>()
  let replacement = Observed(core.submit(session, key: id) { _ in newGate })
  var successor = false
  _ = core.submit(session, key: id) { _ -> BleFuture<Void> in successor = true; return BleFuture<Void>() }
  oldGate.resolve(withResult: ())
  expect(old.failed && old.results.count == 1, "late old success was delivered")
  expect(!successor && replacement.results.isEmpty, "late old completion advanced replacement queue")
  newGate.resolve(withResult: ())
  expect(successor, "replacement completion failed to advance its own queue")
  session.release()
}

test("identical admitted connects join across sessions; fresh connect rejects") {
  let (a, manager, peripheral) = fixture()
  let b = core.createSession()
  peripheral.state = .disconnected
  let first = Observed(a.createBLEConnection(deviceId: id))
  let second = Observed(b.createBLEConnection(deviceId: id.lowercased()))
  expect(manager.connects == 1, "duplicate connect reached OS twice")
  manager.connected(peripheral)
  expect(first.succeeded && second.succeeded, "duplicate native connect did not join")
  let fresh = Observed(b.createBLEConnection(deviceId: id))
  expect(fresh.failed && fresh.message.contains("ALREADY_CONNECTED"), "fresh already-connected call did not reject")
  a.release(); b.release()
}

test("release cancels one connect waiter without cancelling another session") {
  let (a, manager, peripheral) = fixture()
  let b = core.createSession()
  peripheral.state = .disconnected
  let first = Observed(a.createBLEConnection(deviceId: id))
  let second = Observed(b.createBLEConnection(deviceId: id))
  a.release()
  expect(first.failed && first.message.contains("SESSION_RELEASED"), "released connect waiter remained active")
  expect(second.results.isEmpty, "releasing first session cancelled other waiter")
  manager.connected(peripheral)
  expect(second.succeeded && first.results.count == 1, "other owner's connect did not complete")
  b.release()
}

test("explicit disconnect cancels a connecting attempt and queued old work") {
  let (session, manager, peripheral) = fixture()
  peripheral.state = .disconnected
  let connecting = Observed(session.createBLEConnection(deviceId: id))
  var dispatched = false
  let queued = Observed(core.submit(session, key: id) { _ -> BleFuture<Void> in
    dispatched = true; return BleFuture<Void>()
  })
  let closing = Observed(session.closeBLEConnection(deviceId: id))
  expect(connecting.failed && queued.failed && !dispatched, "explicit close did not cancel old work immediately")
  manager.disconnected(peripheral)
  expect(closing.succeeded, "hardware disconnect no longer completes")
  let reconnect = Observed(session.createBLEConnection(deviceId: id))
  manager.connected(peripheral)
  expect(reconnect.succeeded, "replacement connection was cancelled by old generation")
  session.release()
}

test("reentrant reconnect waits for disconnect cleanup before entering engine") {
  let (session, manager, peripheral) = fixture()
  let active = session.getBLEDeviceRSSI(deviceId: id)
  var reconnect: Observed<Void>?
  active.observe { _ in reconnect = Observed(session.createBLEConnection(deviceId: id)) }
  manager.disconnected(peripheral)
  expect(manager.connects == 1 && reconnect?.results.isEmpty == true, "reentrant connect was rejected or consumed by old cleanup")
  manager.connected(peripheral)
  expect(reconnect?.succeeded == true, "reentrant replacement failed")
  session.release()
}

test("session release preserves other session FIFO and scan lease") {
  let (a, manager, _) = fixture()
  let b = core.createSession()
  let params = BleScanParams()
  _ = a.startBluetoothDevicesDiscovery(params: params)
  _ = b.startBluetoothDevicesDiscovery(params: params)
  let stops = manager.scanStops
  let gate = BleFuture<Void>()
  let first = Observed(core.submit(a, key: id) { _ in gate })
  let otherGate = BleFuture<Void>()
  let other = Observed(core.submit(b, key: id) { _ in otherGate })
  a.release()
  expect(first.failed && other.results.isEmpty, "session release cancelled another owner")
  expect(manager.scanStops == stops, "release stopped another owner's scan")
  gate.resolve(withResult: ())
  otherGate.resolve(withResult: ())
  expect(other.succeeded && first.results.count == 1, "other owner could not continue")
  b.release()
  expect(manager.scanStops == stops + 1, "last-owner scan cleanup was lost")
}

test("different devices progress independently and disconnect only cancels its own device") {
  let (session, manager, peripheral) = fixture()
  let other = CBPeripheral(UUID(uuidString: otherId)!)
  other.state = .connected
  manager.devices[other.identifier] = other
  let first = Observed(session.getBLEDeviceRSSI(deviceId: id))
  let second = Observed(session.getBLEDeviceRSSI(deviceId: otherId))
  expect(peripheral.rssiReads == 1 && other.rssiReads == 1, "different devices blocked each other")
  manager.disconnected(peripheral)
  expect(first.failed && second.results.isEmpty, "disconnect cancelled another device")
  other.delegate?.peripheral(other, didReadRSSI: -40, error: nil)
  expect(second.succeeded, "other device could not complete")
  session.release()
}

test("release removes queued owner work without touching the active owner") {
  let (a, _, _) = fixture()
  let b = core.createSession()
  let gate = BleFuture<Void>()
  let active = Observed(core.submit(b, key: id) { _ in gate })
  var releasedDispatch = false
  let queued = Observed(core.submit(a, key: id) { _ -> BleFuture<Void> in
    releasedDispatch = true; return BleFuture<Void>()
  })
  var following = false
  _ = core.submit(b, key: id) { _ -> BleFuture<Void> in
    following = true; let result = BleFuture<Void>(); result.resolve(withResult: ()); return result
  }
  a.release()
  expect(queued.failed && active.results.isEmpty, "queued release touched the active owner")
  gate.resolve(withResult: ())
  expect(!releasedDispatch && following && active.succeeded, "released queued work was not skipped")
  b.release()
}

test("disconnect retires old notification lease before a new owner acquires it") {
  let (a, manager, peripheral) = fixture()
  let b = core.createSession()
  let service = CBService("180d")
  let characteristic = CBCharacteristic("2a37")
  characteristic.service = service
  service.characteristics = [characteristic]
  peripheral.services = [service]
  let params = BleNotifyParams(deviceId: id, serviceId: "180d", characteristicId: "2a37", state: true)
  _ = a.notifyBLECharacteristicValueChange(params: params)
  characteristic.isNotifying = true
  peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
  manager.disconnected(peripheral)
  peripheral.state = .connected
  characteristic.isNotifying = false
  _ = b.notifyBLECharacteristicValueChange(params: params)
  characteristic.isNotifying = true
  peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
  let changes = peripheral.notifyChanges
  b.release()
  expect(peripheral.notifyChanges == changes + 1, "old connection's lease blocked last-owner notification cleanup")
  characteristic.isNotifying = false
  peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
  a.release()
}

test("power loss retires scan signature so recovery can start another scan") {
  let (a, manager, _) = fixture()
  let b = core.createSession()
  _ = a.startBluetoothDevicesDiscovery(params: BleScanParams(services: ["180d"]))
  manager.poweredOff()
  manager.state = .poweredOn
  manager.delegate?.centralManagerDidUpdateState(manager)
  let recovery = Observed(b.startBluetoothDevicesDiscovery(params: BleScanParams(services: ["180f"])))
  expect(recovery.succeeded, "old scan signature survived power loss")
  a.release(); b.release()
}

test("connect failure cancels queued old-generation work before its event") {
  let (session, manager, peripheral) = fixture()
  peripheral.state = .disconnected
  let connecting = Observed(session.createBLEConnection(deviceId: id))
  var dispatched = false
  let queued = Observed(core.submit(session, key: id) { _ -> BleFuture<Void> in
    dispatched = true; return BleFuture<Void>()
  })
  peripheral.state = .disconnected
  manager.delegate?.centralManager(manager, didFailToConnect: peripheral, error: nil)
  expect(connecting.failed && queued.failed && !dispatched, "failed connect drained old work")
  session.release()
}

test("identical connects coalesce at admission while waiting behind other work") {
  let (a, manager, peripheral) = fixture()
  let b = core.createSession()
  peripheral.state = .disconnected
  let gate = BleFuture<Void>()
  _ = core.submit(a, key: id) { _ in gate }
  let first = Observed(a.createBLEConnection(deviceId: id))
  let second = Observed(b.createBLEConnection(deviceId: id))
  expect(manager.connects == 0, "connect bypassed active native work")
  gate.resolve(withResult: ())
  expect(manager.connects == 1, "queued duplicate connect reached OS twice")
  manager.connected(peripheral)
  expect(first.succeeded && second.succeeded, "queued identical connect did not join")
  a.release(); b.release()
}

test("explicit adapter close cancels unresolved work and still closes hardware") {
  let (session, _, _) = fixture()
  let gate = BleFuture<Void>()
  let active = Observed(core.submit(session, key: id) { _ in gate })
  let closed = Observed(session.closeBluetoothAdapter())
  expect(active.failed && closed.succeeded, "adapter close left active work unresolved or cancelled itself")
  gate.resolve(withResult: ())
  expect(active.failed && active.results.count == 1, "adapter close lost to late success")
  expect(Observed(session.getBluetoothAdapterState()).failed, "hardware close became session release")
  session.release()
}

test("pending adapter open survives transitional manager states") {
  let session = core.createSession()
  _ = session.closeBluetoothAdapter()
  CBCentralManager.initialState = .unknown
  let opening = Observed(session.openBluetoothAdapter())
  let manager = CBCentralManager.last!
  manager.delegate?.centralManagerDidUpdateState(manager)
  expect(opening.results.isEmpty, "unknown manager state cancelled pending open")
  manager.state = .resetting
  manager.delegate?.centralManagerDidUpdateState(manager)
  expect(opening.results.isEmpty, "resetting manager state cancelled pending open")
  manager.state = .poweredOn
  manager.delegate?.centralManagerDidUpdateState(manager)
  expect(opening.succeeded, "open did not complete when manager became ready")
  CBCentralManager.initialState = .poweredOn
  session.release()
}

test("unauthorized adapter open preserves the permission error") {
  let session = core.createSession()
  _ = session.closeBluetoothAdapter()
  CBCentralManager.initialState = .unknown
  let opening = Observed(session.openBluetoothAdapter())
  let manager = CBCentralManager.last!
  manager.state = .unauthorized
  manager.delegate?.centralManagerDidUpdateState(manager)
  expect(opening.failed && opening.message.contains("E_BLE_PERMISSION"), "permission failure became a generic adapter failure")
  CBCentralManager.initialState = .poweredOn
  session.release()
}

test("retired native delegate cannot resolve a replacement connection's RSSI request") {
  let (session, manager, peripheral) = fixture()
  let old = Observed(session.getBLEDeviceRSSI(deviceId: id))
  let retired = peripheral.delegate!
  manager.disconnected(peripheral)
  _ = session.createBLEConnection(deviceId: id)
  manager.connected(peripheral)
  let fresh = Observed(session.getBLEDeviceRSSI(deviceId: id))
  retired.peripheral(peripheral, didReadRSSI: -99, error: nil)
  expect(old.failed && fresh.results.isEmpty, "retired connection delegate completed fresh work")
  peripheral.delegate?.peripheral(peripheral, didReadRSSI: -40, error: nil)
  expect(fresh.succeeded, "current connection delegate could not complete fresh work")
  session.release()
}

test("retired manager callback cannot cancel a replacement adapter queue") {
  let (session, retired, _) = fixture()
  _ = session.closeBluetoothAdapter()
  _ = session.openBluetoothAdapter()
  CBCentralManager.last.delegate?.centralManagerDidUpdateState(CBCentralManager.last)
  let gate = BleFuture<Void>()
  let fresh = Observed(core.submit(session, key: "@adapter") { _ in gate })
  retired.poweredOff()
  expect(fresh.results.isEmpty, "retired adapter callback invalidated replacement adapter")
  gate.resolve(withResult: ())
  expect(fresh.succeeded, "replacement adapter failed after retired callback")
  session.release()
}

test("session event tokens are removed independently") {
  let (a, manager, peripheral) = fixture()
  let b = core.createSession()
  var aEvents = 0
  var bEvents = 0
  _ = try a.onConnectStateChange { _ in aEvents += 1 }
  let token = try b.onConnectStateChange { _ in bEvents += 1 }
  a.release()
  manager.disconnected(peripheral)
  expect(aEvents == 0 && bEvents == 1, "one session's release removed another session's event token")
  b.removeConnectStateListener(subscriptionId: token)
  manager.disconnected(peripheral)
  expect(bEvents == 1, "removed event token remained live")
  b.release()
}

test("a read completion that closes hardware cannot emit an old value event") {
  let (session, manager, peripheral) = fixture()
  let service = CBService("180d")
  let characteristic = CBCharacteristic("2a37")
  characteristic.service = service
  characteristic.value = Data([1])
  service.characteristics = [characteristic]
  peripheral.services = [service]
  var values = 0
  _ = try session.onCharacteristicUpdate { _ in values += 1 }
  let read = session.readBLECharacteristicValue(params: BleReadParams(deviceId: id, serviceId: "180d", characteristicId: "2a37"))
  read.observe { _ in _ = session.closeBLEConnection(deviceId: id) }
  peripheral.delegate?.peripheral(peripheral, didUpdateValueFor: characteristic, error: nil)
  expect(values == 0, "read emitted a value after reentrant connection close")
  manager.disconnected(peripheral)
  session.release()
}

test("a connect completion that closes hardware cannot emit connected afterward") {
  let (session, manager, peripheral) = fixture()
  peripheral.state = .disconnected
  var connectedEvents = 0
  _ = try session.onConnectStateChange { if $0.connected { connectedEvents += 1 } }
  session.createBLEConnection(deviceId: id).observe { _ in _ = session.closeBLEConnection(deviceId: id) }
  manager.connected(peripheral)
  expect(connectedEvents == 0, "connect emitted connected after reentrant connection close")
  manager.disconnected(peripheral)
  session.release()
}

test("explicit close invalidates queued work even when OS already reports disconnected") {
  let (session, _, peripheral) = fixture()
  let gate = BleFuture<Void>()
  let active = Observed(core.submit(session, key: id) { _ in gate })
  var dispatched = false
  let queued = Observed(core.submit(session, key: id) { _ -> BleFuture<Void> in
    dispatched = true; return BleFuture<Void>()
  })
  peripheral.state = .disconnected
  let closed = Observed(session.closeBLEConnection(deviceId: id))
  expect(active.failed && queued.failed && closed.succeeded && !dispatched,
    "already-disconnected close bypassed native cancellation")
  gate.resolve(withResult: ())
  expect(active.results.count == 1 && !dispatched, "late success advanced a closed device")
  session.release()
}

for releasedWhileEnabling in [false, true] {
  test("queued notification cleanup rechecks new owner after \(releasedWhileEnabling ? "pending enable" : "last lease") release") {
    let (a, _, peripheral) = fixture()
    let b = core.createSession()
    let service = CBService("180d")
    let characteristic = CBCharacteristic("2a37")
    characteristic.service = service
    service.characteristics = [characteristic]
    peripheral.services = [service]
    let params = BleNotifyParams(deviceId: id, serviceId: "180d", characteristicId: "2a37", state: true)
    let first = Observed(a.notifyBLECharacteristicValueChange(params: params))
    if !releasedWhileEnabling {
      characteristic.isNotifying = true
      peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
    }
    let busy = !releasedWhileEnabling ? Observed(a.getBLEDeviceRSSI(deviceId: id)) : nil
    let second = Observed(b.notifyBLECharacteristicValueChange(params: params))
    expect(second.results.isEmpty, "B enable did not queue behind the active operation")
    a.release()
    if releasedWhileEnabling {
      characteristic.isNotifying = true
      peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
    } else {
      peripheral.delegate?.peripheral(peripheral, didReadRSSI: -40, error: nil)
    }
    expect(second.succeeded && (busy == nil || busy!.failed), "B did not acquire the notification lease")
    expect(peripheral.notifyChanges == 1 && characteristic.isNotifying,
      "stale cleanup disabled notifications after B acquired the lease")
    expect(first.results.count == 1, "A enable settled more than once")
    b.release()
    expect(peripheral.notifyChanges == 2, "last current owner's release did not disable notifications")
    characteristic.isNotifying = false
    peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
  }
}

let uuidLeaseAliases = [
  ("short-to-expanded", "180d", "2a37", "0000180D-0000-1000-8000-00805F9B34FB", "00002A37-0000-1000-8000-00805F9B34FB"),
  ("expanded-to-short", "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", "180D", "2A37"),
  ("32bit-to-expanded", "0000180d", "00002a37", "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb"),
  ("expanded-to-32bit", "0000180d-0000-1000-8000-00805f9b34fb", "00002a37-0000-1000-8000-00805f9b34fb", "0000180D", "00002A37"),
]
for (alias, firstService, firstCharacteristic, secondService, secondCharacteristic) in uuidLeaseAliases {
  for disableFirst in [false, true] {
    test("notification \(alias) owners share one physical lease through \(disableFirst ? "alias disable" : "release")") {
      let (a, _, peripheral) = fixture()
      let b = core.createSession()
      let service = CBService("180d")
      let characteristic = CBCharacteristic("2a37")
      characteristic.service = service
      service.characteristics = [characteristic]
      peripheral.services = [service]
      let first = Observed(a.notifyBLECharacteristicValueChange(params: BleNotifyParams(
        deviceId: id, serviceId: firstService, characteristicId: firstCharacteristic, state: true)))
      characteristic.isNotifying = true
      peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
      let second = Observed(b.notifyBLECharacteristicValueChange(params: BleNotifyParams(
        deviceId: id, serviceId: secondService, characteristicId: secondCharacteristic, state: true)))
      expect(first.succeeded && second.succeeded && peripheral.notifyChanges == 1,
        "UUID aliases did not enable the same physical characteristic")
      if disableFirst {
        let disabled = Observed(a.notifyBLECharacteristicValueChange(params: BleNotifyParams(
          deviceId: id, serviceId: secondService, characteristicId: secondCharacteristic, state: false)))
        expect(disabled.succeeded, "A could not disable using the other UUID spelling")
      }
      a.release()
      expect(peripheral.notifyChanges == 1 && characteristic.isNotifying,
        "A alias release/disable stopped B's physical notification")
      b.release()
      expect(peripheral.notifyChanges == 2, "B's last-owner release did not disable exactly once")
      characteristic.isNotifying = false
      peripheral.delegate?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: nil)
      a.release(); b.release()
      expect(peripheral.notifyChanges == 2 && first.results.count == 1 && second.results.count == 1,
        "alias cleanup duplicated a disable or terminal result")
    }
  }
}

if !CommandLine.arguments.contains("--list") { print("Swift native queue failures: \(failures)") }
exit(failures == 0 ? 0 : 1)
