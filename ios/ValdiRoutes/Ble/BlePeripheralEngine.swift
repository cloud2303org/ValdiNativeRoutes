import CoreBluetooth
import CoreLocation
import Foundation

/// One app-owned manager, with services, advertising and requests scoped to logical server owners.
/// All access and delegate callbacks run on the main queue; the central role is independent.
final class BlePeripheralEngine: NSObject, BlePeripheralLifecycle, CBPeripheralManagerDelegate {
  private final class Characteristic {
    let native: CBMutableCharacteristic
    var value: Data
    var subscribers: [UUID: CBCentral] = [:]
    init(_ native: CBMutableCharacteristic, value: Data) { self.native = native; self.value = value }
  }
  private final class Service {
    let native: CBMutableService
    let characteristics: [CBUUID: Characteristic]
    var published = false
    var result: BleFuture<Void>?
    init(_ native: CBMutableService, characteristics: [CBUUID: Characteristic], result: BleFuture<Void>) {
      self.native = native; self.characteristics = characteristics; self.result = result
    }
  }
  private final class Server {
    let id: String
    let owner: ObjectIdentifier
    var services: [CBUUID: Service] = [:]
    var knownCentrals: Set<UUID> = []
    init(id: String, owner: ObjectIdentifier) { self.id = id; self.owner = owner }
  }
  private final class Batch {
    let serverId: String
    let requests: [CBATTRequest]
    let isRead: Bool
    let updates: [(Characteristic, Data)]
    var remaining: Set<Double> = []
    var replies: [BleFuture<Void>] = []
    init(serverId: String, requests: [CBATTRequest], isRead: Bool, updates: [(Characteristic, Data)] = []) {
      self.serverId = serverId; self.requests = requests; self.isRead = isRead; self.updates = updates
    }
  }
  private struct Request {
    let batch: Batch
    let native: CBATTRequest
  }
  private struct Notification {
    let id = UUID()
    let serverId: String
    let characteristic: Characteristic
    let centrals: [CBCentral]
    let value: Data
    let result: BleFuture<Void>
  }
  private struct Advertisement {
    let serverId: String
    let result: BleFuture<Void>
    var cancelled = false
  }

  private var manager: CBPeripheralManager?
  private var openResults: [BleFuture<Void>] = []
  private var servers: [String: Server] = [:]
  private var serviceOwners: [CBUUID: String] = [:]
  private var advertisingOwner: String?
  private var pendingAdvertisement: Advertisement?
  private var requests: [Double: Request] = [:]
  private var nextRequestId: Double = 1
  private var notifications: [Notification] = []
  private var nextListenerId: Double = 1
  private var reads: [Double: (ObjectIdentifier, (BlePeripheralReadRequest) -> Void)] = [:]
  private var writes: [Double: (ObjectIdentifier, (BlePeripheralWriteRequest) -> Void)] = [:]
  private var subscriptions: [Double: (ObjectIdentifier, (BlePeripheralSubscriptionEvent) -> Void)] = [:]
  private var unsubscriptions: [Double: (ObjectIdentifier, (BlePeripheralSubscriptionEvent) -> Void)] = [:]
  private var connections: [Double: (ObjectIdentifier, (BlePeripheralConnectionState) -> Void)] = [:]
  var onAdapterState: ((BleAdapterState) -> Void)?

  func open() -> BleFuture<Void> {
    let result = BleFuture<Void>()
    if let manager {
      switch manager.state {
      case .poweredOn: result.resolve(withResult: ())
      case .unknown, .resetting: openResults.append(result)
      default: result.reject(withError: stateError(manager.state))
      }
    } else {
      openResults.append(result)
      manager = CBPeripheralManager(delegate: self, queue: .main)
    }
    return result
  }

  func getState() -> BleFuture<BleAdapterState> {
    let result = BleFuture<BleAdapterState>()
    guard let manager else { result.reject(withError: failure("E_BLE_NOT_INITIALIZED", "Open the adapter first")); return result }
    result.resolve(withResult: BleAdapterState(available: manager.state == .poweredOn, discovering: false))
    return result
  }

  func create(owner: ObjectIdentifier) throws -> BleFuture<BlePeripheralServerInfo> {
    _ = try ready()
    let id = UUID().uuidString
    servers[id] = Server(id: id, owner: owner)
    return done(BlePeripheralServerInfo(serverId: id))
  }

  func add(owner: ObjectIdentifier, params: BlePeripheralServiceParams) throws -> BleFuture<Void> {
    let manager = try ready(), server = try owned(params.serverId, by: owner)
    let serviceId = try uuid(params.service.uuid)
    guard serviceOwners[serviceId] == nil else { throw failure("E_BLE_INVALID_DATA", "Service UUID is already registered by an active server") }
    guard !params.service.characteristics.isEmpty else { throw failure("E_BLE_INVALID_DATA", "A service needs characteristics") }
    var characteristics: [CBUUID: Characteristic] = [:]
    for item in params.service.characteristics {
      let id = try uuid(item.uuid)
      guard characteristics[id] == nil, item.value.count <= 512 else { throw failure("E_BLE_INVALID_DATA", "Duplicate characteristic or value exceeds 512 bytes") }
      let p = item.properties, access = item.permission
      guard (!p.read || access.readable || access.readEncryptionRequired),
            (!(p.write || p.writeNoResponse) || access.writeable || access.writeEncryptionRequired) else {
        throw failure("E_BLE_INVALID_DATA", "Characteristic properties require matching permissions")
      }
      var properties: CBCharacteristicProperties = []
      if p.read { properties.insert(.read) }
      if p.write { properties.insert(.write) }
      if p.writeNoResponse { properties.insert(.writeWithoutResponse) }
      if p.notify { properties.insert(.notify) }
      if p.indicate { properties.insert(.indicate) }
      guard !properties.isEmpty else { throw failure("E_BLE_INVALID_DATA", "Characteristic needs at least one property") }
      var permissions: CBAttributePermissions = []
      if access.readEncryptionRequired { permissions.insert(.readEncryptionRequired) }
      else if access.readable { permissions.insert(.readable) }
      if access.writeEncryptionRequired { permissions.insert(.writeEncryptionRequired) }
      else if access.writeable { permissions.insert(.writeable) }
      let native = CBMutableCharacteristic(type: id, properties: properties, value: nil, permissions: permissions)
      var descriptorIds: Set<CBUUID> = []
      native.descriptors = try item.descriptors.map { descriptor in
        let descriptorId = try uuid(descriptor.uuid)
        guard descriptorIds.insert(descriptorId).inserted else { throw failure("E_BLE_INVALID_DATA", "Duplicate descriptor") }
        guard descriptor.permission.read && !descriptor.permission.write else { throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS only exposes read-only custom descriptors") }
        if descriptorId == CBUUID(string: "2901"), let value = String(data: descriptor.value, encoding: .utf8) {
          return CBMutableDescriptor(type: descriptorId, value: value)
        }
        if descriptorId == CBUUID(string: "2904"), descriptor.value.count == 7 {
          return CBMutableDescriptor(type: descriptorId, value: descriptor.value)
        }
        throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS supports only UTF-8 2901 and seven-byte 2904 descriptors; CCCD is managed by CoreBluetooth")
      }
      characteristics[id] = Characteristic(native, value: item.value)
    }
    let native = CBMutableService(type: serviceId, primary: true)
    native.characteristics = Array(characteristics.values).map(\.native)
    let result = BleFuture<Void>(), service = Service(native, characteristics: characteristics, result: result)
    server.services[serviceId] = service; serviceOwners[serviceId] = server.id
    manager.add(native)
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak service] in
      guard let self, let service, service.result != nil, self.servers[server.id]?.services[serviceId] === service else { return }
      service.result?.reject(withError: self.failure("E_BLE_CONNECTION_TIMEOUT", "Publishing the service timed out"))
      service.result = nil
      self.removeService(server: server, id: serviceId)
    }
    return result
  }

  func remove(owner: ObjectIdentifier, params: BlePeripheralRemoveServiceParams) throws -> BleFuture<Void> {
    _ = try ready()
    let server = try owned(params.serverId, by: owner), id = try uuid(params.serviceId)
    guard server.services[id] != nil else { throw failure("E_BLE_SERVICE_NOT_FOUND", "Service is not registered") }
    removeService(server: server, id: id)
    return done(())
  }

  func startAdvertising(owner: ObjectIdentifier, params: BlePeripheralAdvertisingParams) throws -> BleFuture<Void> {
    let manager = try ready(), server = try owned(params.serverId, by: owner)
    guard advertisingOwner == nil, pendingAdvertisement == nil else { throw failure("E_BLE_WRITE_FAILED", "Another advertisement is active or still stopping") }
    guard params.manufacturerData.isEmpty else { throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS does not support arbitrary manufacturer advertising data") }
    guard params.powerLevel == "medium" else { throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS does not expose advertising power level") }
    var data: [String: Any] = [:]
    if let beacon = params.beacon {
      guard params.deviceName.isEmpty, params.serviceUuids.isEmpty, !params.connectable,
            let beaconId = UUID(uuidString: beacon.uuid),
            beacon.major.isFinite, beacon.major.rounded() == beacon.major, (0...65535).contains(beacon.major),
            beacon.minor.isFinite, beacon.minor.rounded() == beacon.minor, (0...65535).contains(beacon.minor),
            beacon.measuredPower.isFinite, beacon.measuredPower.rounded() == beacon.measuredPower, (-128...127).contains(beacon.measuredPower) else {
        throw failure("E_BLE_INVALID_DATA", "Invalid beacon advertisement")
      }
      let region = CLBeaconRegion(uuid: beaconId, major: UInt16(beacon.major), minor: UInt16(beacon.minor), identifier: server.id)
      data = region.peripheralData(withMeasuredPower: NSNumber(value: beacon.measuredPower)) as? [String: Any] ?? [:]
    } else {
      guard params.connectable else { throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS cannot configure non-connectable GATT advertisements") }
      let advertised = try params.serviceUuids.map { value -> CBUUID in
        guard value.count != 8 else { throw failure("E_BLE_SYSTEM_NOT_SUPPORTED", "iOS does not advertise 32-bit service UUIDs") }
        let id = try uuid(value)
        guard server.services[id]?.published == true else { throw failure("E_BLE_SERVICE_NOT_FOUND", "Advertised service must belong to this server and be published") }
        return id
      }
      if !params.deviceName.isEmpty { data[CBAdvertisementDataLocalNameKey] = params.deviceName }
      if !advertised.isEmpty { data[CBAdvertisementDataServiceUUIDsKey] = advertised }
    }
    let result = BleFuture<Void>()
    advertisingOwner = server.id; pendingAdvertisement = Advertisement(serverId: server.id, result: result)
    manager.startAdvertising(data)
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak manager] in
      guard let self, let manager, self.manager === manager,
            self.pendingAdvertisement?.result === result else { return }
      // CoreBluetooth supplies no request ID for this callback. Retire this manager on timeout,
      // so a late completion cannot settle a later advertisement.
      self.close(error: self.failure("E_BLE_CONNECTION_TIMEOUT", "Starting advertisement timed out"))
    }
    return result
  }

  func stopAdvertising(owner: ObjectIdentifier, serverId: String) throws -> BleFuture<Void> {
    _ = try owned(serverId, by: owner)
    if advertisingOwner == serverId {
      manager?.stopAdvertising(); advertisingOwner = nil
      if pendingAdvertisement?.serverId == serverId {
        pendingAdvertisement?.cancelled = true
        pendingAdvertisement?.result.reject(withError: failure("E_BLE_WRITE_FAILED", "Advertisement was stopped"))
      }
    }
    return done(())
  }

  func write(owner: ObjectIdentifier, params: BlePeripheralWriteParams) throws -> BleFuture<Void> {
    let manager = try ready(), server = try owned(params.serverId, by: owner)
    let serviceId = try uuid(params.serviceId), characteristicId = try uuid(params.characteristicId)
    guard let service = server.services[serviceId], service.published else { throw failure("E_BLE_SERVICE_NOT_FOUND", "Service is not published") }
    guard let characteristic = service.characteristics[characteristicId] else { throw failure("E_BLE_CHARACTERISTIC_NOT_FOUND", "Characteristic is not registered") }
    guard params.value.count <= 512 else { throw failure("E_BLE_INVALID_DATA", "Value exceeds 512 bytes") }
    if let id = params.callbackId {
      guard !params.needNotify, let request = requests[id], request.batch.serverId == server.id,
            request.native.characteristic === characteristic.native else { throw failure("E_BLE_INVALID_DATA", "Unknown, completed or mismatched callbackId") }
      let result = BleFuture<Void>()
      let batch = request.batch
      if batch.isRead {
        requests.removeValue(forKey: id); batch.remaining.remove(id)
        guard request.native.offset <= params.value.count else {
          manager.respond(to: request.native, withResult: .invalidOffset)
          result.reject(withError: failure("E_BLE_INVALID_DATA", "Read offset exceeds value length")); return result
        }
        characteristic.value = params.value
        request.native.value = params.value.subdata(in: request.native.offset..<params.value.count)
        manager.respond(to: request.native, withResult: .success)
        result.resolve(withResult: ())
      } else {
        requests.removeValue(forKey: id); batch.remaining.remove(id); batch.replies.append(result)
        if batch.remaining.isEmpty {
          batch.updates.forEach { $0.0.value = $0.1 }
          manager.respond(to: batch.requests[0], withResult: .success)
          batch.replies.forEach { $0.resolve(withResult: ()) }
        }
      }
      return result
    }
    if !params.needNotify { characteristic.value = params.value; return done(()) }
    guard characteristic.native.properties.contains(.notify) || characteristic.native.properties.contains(.indicate) else { throw failure("E_BLE_PROPERTY_NOT_SUPPORTED", "Characteristic does not support notifications") }
    let centrals = Array(characteristic.subscribers.values)
    guard !centrals.isEmpty else { throw failure("E_BLE_NOT_CONNECTED", "No central has subscribed to this characteristic") }
    guard centrals.allSatisfy({ params.value.count <= $0.maximumUpdateValueLength }) else { throw failure("E_BLE_WRITE_FAILED", "Value exceeds a subscribed central's maximum update length") }
    guard notifications.count < 64 else { throw failure("E_BLE_WRITE_FAILED", "Notification queue is full") }
    let result = BleFuture<Void>()
    characteristic.value = params.value
    let notification = Notification(serverId: server.id, characteristic: characteristic, centrals: centrals, value: params.value, result: result)
    notifications.append(notification); flushNotifications()
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
      guard let self, let index = self.notifications.firstIndex(where: { $0.id == notification.id }) else { return }
      self.notifications.remove(at: index).result.reject(withError: self.failure("E_BLE_CONNECTION_TIMEOUT", "Notification queue timed out"))
      self.flushNotifications()
    }
    return result
  }

  func closeServer(owner: ObjectIdentifier, serverId: String) throws -> BleFuture<Void> {
    let server = try owned(serverId, by: owner)
    removeServer(server)
    return done(())
  }
  func release(owner: ObjectIdentifier) {
    Array(servers.values).filter { $0.owner == owner }.forEach(removeServer)
    reads = reads.filter { $0.value.0 != owner }; writes = writes.filter { $0.value.0 != owner }
    subscriptions = subscriptions.filter { $0.value.0 != owner }; unsubscriptions = unsubscriptions.filter { $0.value.0 != owner }
    connections = connections.filter { $0.value.0 != owner }
  }
  func close() { close(error: failure("E_BLE_NOT_INITIALIZED", "Bluetooth adapter closed")) }
  private func close(error: Error) {
    let pendingOpen = openResults; openResults.removeAll()
    pendingOpen.forEach { $0.reject(withError: error) }
    Array(servers.values).forEach(removeServer)
    pendingAdvertisement?.result.reject(withError: error); pendingAdvertisement = nil
    manager?.stopAdvertising(); manager?.removeAllServices(); manager?.delegate = nil; manager = nil
    advertisingOwner = nil
    onAdapterState?(BleAdapterState(available: false, discovering: false))
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    guard manager === peripheral else { return }
    if peripheral.state == .unknown { return }
    if peripheral.state != .poweredOn, pendingAdvertisement != nil {
      // Retire the delegate source when its untagged advertising completion is still outstanding.
      close(error: stateError(peripheral.state))
      return
    }
    if peripheral.state == .resetting {
      Array(servers.values).forEach(removeServer)
      pendingAdvertisement?.result.reject(withError: stateError(peripheral.state))
      pendingAdvertisement = nil; advertisingOwner = nil
      onAdapterState?(BleAdapterState(available: false, discovering: false))
      return
    }
    let opening = openResults; openResults.removeAll()
    if peripheral.state == .poweredOn { opening.forEach { $0.resolve(withResult: ()) } }
    else {
      let error = stateError(peripheral.state)
      opening.forEach { $0.reject(withError: error) }
      Array(servers.values).forEach(removeServer)
      pendingAdvertisement?.result.reject(withError: error); pendingAdvertisement = nil; advertisingOwner = nil
    }
    onAdapterState?(BleAdapterState(available: peripheral.state == .poweredOn, discovering: false))
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    guard manager === peripheral else { return }
    guard let serverId = serviceOwners[service.uuid], let server = servers[serverId],
          let ownService = server.services[service.uuid], ownService.native === service else {
      if let service = service as? CBMutableService { peripheral.remove(service) }; return
    }
    let result = ownService.result; ownService.result = nil
    if let error {
      server.services.removeValue(forKey: service.uuid); serviceOwners.removeValue(forKey: service.uuid)
      result?.reject(withError: failure("E_BLE_WRITE_FAILED", error.localizedDescription))
    } else { ownService.published = true; result?.resolve(withResult: ()) }
  }
  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    guard manager === peripheral, let pending = pendingAdvertisement else { return }
    pendingAdvertisement = nil
    if pending.cancelled { peripheral.stopAdvertising(); return }
    if let error {
      advertisingOwner = nil
      pending.result.reject(withError: failure("E_BLE_WRITE_FAILED", error.localizedDescription))
    } else { pending.result.resolve(withResult: ()) }
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard manager === peripheral else { return }
    guard requests.count < 64 else { peripheral.respond(to: request, withResult: .unlikelyError); return }
    guard let (server, entry) = lookup(request.characteristic), reads.values.contains(where: { $0.0 == server.owner }) else {
      peripheral.respond(to: request, withResult: .requestNotSupported); return
    }
    observeConnection(server: server, central: request.central)
    guard servers[server.id] === server, lookup(request.characteristic)?.1 === entry else {
      peripheral.respond(to: request, withResult: .unlikelyError); return
    }
    let batch = Batch(serverId: server.id, requests: [request], isRead: true)
    let id = register(request, batch: batch)
    let event = BlePeripheralReadRequest(serverId: server.id, serviceId: request.characteristic.service!.uuid.uuidString,
      characteristicId: request.characteristic.uuid.uuidString, callbackId: id, deviceId: request.central.identifier.uuidString, offset: Double(request.offset))
    for (listenerId, listener) in Array(reads).filter({ $0.value.0 == server.owner }) {
      // Native listeners can reply, remove a service, or release their session synchronously.
      guard servers[server.id] === server, requests[id]?.batch === batch, reads[listenerId]?.0 == server.owner else { continue }
      listener.1(event)
    }
    expire(batch)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite incoming: [CBATTRequest]) {
    guard manager === peripheral, let first = incoming.first else { return }
    guard incoming.count <= 64 - requests.count else { peripheral.respond(to: first, withResult: .unlikelyError); return }
    guard let (server, _) = lookup(first.characteristic), writes.values.contains(where: { $0.0 == server.owner }) else {
      peripheral.respond(to: first, withResult: .requestNotSupported); return
    }
    var updated: [ObjectIdentifier: (Characteristic, Data)] = [:]
    for request in incoming {
      guard let (requestServer, characteristic) = lookup(request.characteristic), requestServer === server,
            characteristic.native.properties.contains(.write) || characteristic.native.properties.contains(.writeWithoutResponse) else {
        peripheral.respond(to: first, withResult: .writeNotPermitted); return
      }
      let key = ObjectIdentifier(characteristic)
      var value = updated[key]?.1 ?? characteristic.value
      let payload = request.value ?? Data()
      guard request.offset <= value.count, request.offset + payload.count <= 512 else {
        peripheral.respond(to: first, withResult: request.offset > value.count ? .invalidOffset : .invalidAttributeValueLength); return
      }
      if request.offset == 0 { value = payload }
      else { value.replaceSubrange(request.offset..<min(value.count, request.offset + payload.count), with: payload) }
      updated[key] = (characteristic, value)
    }
    observeConnection(server: server, central: first.central)
    guard servers[server.id] === server, incoming.allSatisfy({ lookup($0.characteristic)?.0 === server }) else {
      peripheral.respond(to: first, withResult: .unlikelyError); return
    }
    let batch = Batch(serverId: server.id, requests: incoming, isRead: false, updates: Array(updated.values))
    // Register the entire batch before invoking user code, because native listeners can reply synchronously.
    let events = incoming.map { request in
      BlePeripheralWriteRequest(serverId: server.id, serviceId: request.characteristic.service!.uuid.uuidString,
        characteristicId: request.characteristic.uuid.uuidString, callbackId: register(request, batch: batch),
        deviceId: request.central.identifier.uuidString, offset: Double(request.offset), value: request.value ?? Data(), needResponse: true)
    }
    let callbacks = Array(writes).filter { $0.value.0 == server.owner }
    for event in events {
      for (listenerId, listener) in callbacks {
        guard servers[server.id] === server, requests[event.callbackId]?.batch === batch, writes[listenerId]?.0 == server.owner else { continue }
        listener.1(event)
      }
    }
    expire(batch)
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    guard manager === peripheral, let (server, entry) = lookup(characteristic) else { return }
    entry.subscribers[central.identifier] = central
    observeConnection(server: server, central: central)
    guard servers[server.id] === server, lookup(characteristic)?.1 === entry else { return }
    let event = subscription(server: server, characteristic: characteristic, central: central)
    for (listenerId, listener) in Array(subscriptions).filter({ $0.value.0 == server.owner }) {
      guard servers[server.id] === server, lookup(characteristic)?.1 === entry,
            entry.subscribers[central.identifier] === central, subscriptions[listenerId]?.0 == server.owner else { continue }
      listener.1(event)
    }
  }
  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
    guard manager === peripheral, let (server, entry) = lookup(characteristic) else { return }
    entry.subscribers.removeValue(forKey: central.identifier)
    let event = subscription(server: server, characteristic: characteristic, central: central)
    for (listenerId, listener) in Array(unsubscriptions).filter({ $0.value.0 == server.owner }) {
      guard servers[server.id] === server, lookup(characteristic)?.1 === entry,
            entry.subscribers[central.identifier] == nil, unsubscriptions[listenerId]?.0 == server.owner else { continue }
      listener.1(event)
    }
    // Unsubscribing is not a physical disconnect on iOS. Do not invent a disconnect event.
    flushNotifications()
  }
  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    guard manager === peripheral else { return }; flushNotifications()
  }

  private func register(_ request: CBATTRequest, batch: Batch) -> Double {
    let id = nextRequestId; nextRequestId += 1
    requests[id] = Request(batch: batch, native: request); batch.remaining.insert(id)
    return id
  }
  private func expire(_ batch: Batch) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak batch] in
      guard let self, let batch, !batch.remaining.isEmpty else { return }
      self.reject(batch, error: self.failure("E_BLE_CONNECTION_TIMEOUT", "ATT request reply timed out"))
    }
  }
  private func reject(_ batch: Batch, error: Error) {
    guard !batch.remaining.isEmpty else { return }
    batch.remaining.forEach { requests.removeValue(forKey: $0) }; batch.remaining.removeAll()
    if manager?.state == .poweredOn { manager?.respond(to: batch.requests[0], withResult: .unlikelyError) }
    batch.replies.forEach { $0.reject(withError: error) }; batch.replies.removeAll()
  }
  private func flushNotifications() {
    guard let manager, manager.state == .poweredOn else { return }
    while let pending = notifications.first {
      guard pending.centrals.allSatisfy({ pending.characteristic.subscribers[$0.identifier] != nil }) else {
        notifications.removeFirst().result.reject(withError: failure("E_BLE_NOT_CONNECTED", "Central unsubscribed before the value was submitted")); continue
      }
      guard manager.updateValue(pending.value, for: pending.characteristic.native, onSubscribedCentrals: pending.centrals) else { return }
      notifications.removeFirst().result.resolve(withResult: ())
    }
  }
  private func removeService(server: Server, id: CBUUID) {
    guard let service = server.services.removeValue(forKey: id) else { return }
    serviceOwners.removeValue(forKey: id)
    service.result?.reject(withError: failure("E_BLE_SERVICE_NOT_FOUND", "Service was removed")); service.result = nil
    let batches = requests.values.filter { $0.batch.serverId == server.id && $0.native.characteristic.service === service.native }.map(\.batch)
    batches.forEach { reject($0, error: failure("E_BLE_SERVICE_NOT_FOUND", "Service was removed")) }
    notifications = notifications.filter { pending in
      if pending.characteristic.native.service === service.native {
        pending.result.reject(withError: failure("E_BLE_SERVICE_NOT_FOUND", "Service was removed")); return false
      }; return true
    }
    if manager?.state == .poweredOn { manager?.remove(service.native) }
    flushNotifications()
  }
  private func removeServer(_ server: Server) {
    _ = try? stopAdvertising(owner: server.owner, serverId: server.id)
    Array(server.services.keys).forEach { removeService(server: server, id: $0) }
    servers.removeValue(forKey: server.id)
    // This signals the end of this logical server's connection lifetime, not a radio disconnect.
    for central in server.knownCentrals {
      let event = BlePeripheralConnectionState(serverId: server.id, deviceId: central.uuidString, connected: false)
      for (listenerId, listener) in Array(connections).filter({ $0.value.0 == server.owner }) {
        if connections[listenerId]?.0 == server.owner { listener.1(event) }
      }
    }
  }
  private func lookup(_ characteristic: CBCharacteristic) -> (Server, Characteristic)? {
    guard let service = characteristic.service, let id = serviceOwners[service.uuid], let server = servers[id],
          let entry = server.services[service.uuid]?.characteristics[characteristic.uuid], entry.native === characteristic else { return nil }
    return (server, entry)
  }
  private func observeConnection(server: Server, central: CBCentral) {
    guard server.knownCentrals.insert(central.identifier).inserted else { return }
    let event = BlePeripheralConnectionState(serverId: server.id, deviceId: central.identifier.uuidString, connected: true)
    for (listenerId, listener) in Array(connections).filter({ $0.value.0 == server.owner }) {
      guard servers[server.id] === server, connections[listenerId]?.0 == server.owner else { continue }
      listener.1(event)
    }
  }
  private func subscription(server: Server, characteristic: CBCharacteristic, central: CBCentral) -> BlePeripheralSubscriptionEvent {
    BlePeripheralSubscriptionEvent(serverId: server.id, serviceId: characteristic.service!.uuid.uuidString,
      characteristicId: characteristic.uuid.uuidString, deviceId: central.identifier.uuidString)
  }
  private func owned(_ id: String, by owner: ObjectIdentifier) throws -> Server {
    guard let server = servers[id], server.owner == owner else { throw failure("E_BLE_INVALID_DATA", "Server is closed or belongs to another session") }
    return server
  }
  private func ready() throws -> CBPeripheralManager {
    guard let manager else { throw failure("E_BLE_NOT_INITIALIZED", "Open the peripheral adapter first") }
    guard manager.state == .poweredOn else { throw stateError(manager.state) }
    return manager
  }
  private func done<T>(_ value: T) -> BleFuture<T> { let result = BleFuture<T>(); result.resolve(withResult: value); return result }
  private func failure(_ code: String, _ message: String) -> NSError {
    NSError(domain: "BLE", code: 0, userInfo: [NSLocalizedDescriptionKey: "\(code):\(message)"])
  }
  private func stateError(_ state: CBManagerState) -> NSError {
    switch state {
    case .unauthorized: return failure("E_BLE_PERMISSION", "bluetooth")
    case .unsupported: return failure("E_BLE_SYSTEM_NOT_SUPPORTED", "Peripheral role is unavailable")
    default: return failure("E_BLE_ADAPTER_NOT_AVAILABLE", "Bluetooth is not powered on")
    }
  }
  private func uuid(_ value: String) throws -> CBUUID {
    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard text.range(of: "^(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$", options: .regularExpression) != nil else {
      throw failure("E_BLE_INVALID_DATA", "Invalid Bluetooth UUID")
    }
    return CBUUID(string: text)
  }

  func onRead(owner: ObjectIdentifier, callback: @escaping (BlePeripheralReadRequest) -> Void) -> Double { let id = nextListenerId; nextListenerId += 1; reads[id] = (owner, callback); return id }
  func onWrite(owner: ObjectIdentifier, callback: @escaping (BlePeripheralWriteRequest) -> Void) -> Double { let id = nextListenerId; nextListenerId += 1; writes[id] = (owner, callback); return id }
  func onSubscribe(owner: ObjectIdentifier, callback: @escaping (BlePeripheralSubscriptionEvent) -> Void) -> Double { let id = nextListenerId; nextListenerId += 1; subscriptions[id] = (owner, callback); return id }
  func onUnsubscribe(owner: ObjectIdentifier, callback: @escaping (BlePeripheralSubscriptionEvent) -> Void) -> Double { let id = nextListenerId; nextListenerId += 1; unsubscriptions[id] = (owner, callback); return id }
  func onConnection(owner: ObjectIdentifier, callback: @escaping (BlePeripheralConnectionState) -> Void) -> Double { let id = nextListenerId; nextListenerId += 1; connections[id] = (owner, callback); return id }
  func removeListener(owner: ObjectIdentifier, id: Double) {
    if reads[id]?.0 == owner { reads.removeValue(forKey: id) }
    if writes[id]?.0 == owner { writes.removeValue(forKey: id) }
    if subscriptions[id]?.0 == owner { subscriptions.removeValue(forKey: id) }
    if unsubscriptions[id]?.0 == owner { unsubscriptions.removeValue(forKey: id) }
    if connections[id]?.0 == owner { connections.removeValue(forKey: id) }
  }
}
