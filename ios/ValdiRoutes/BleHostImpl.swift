import Foundation
import ValdiRuntime

/// `api`'s Bluetooth on the app-wide BleCore (ble/BleHost.ts). Capability only: wechat.ts and peripheral.ts own the
/// mini-program rules on both platforms, so this maps calls and events and nothing else. iOS prompts for Bluetooth on
/// the first adapter open; ble/permission.ts asks only on Android.
final class BleHostImpl: NSObject, VRBleHost {
    /// One long-lived session for every page; created when the events arrive, which touches no radio.
    private lazy var session: BleSession = {
        let session = BleCore.shared.createSession()
        listen(session)
        return session
    }()
    private var events: VRBleHostEvents?

    /// The scan's own duplicate rules, applied before the bridge; wechat.ts applies them again and stays the authority.
    private let lock = NSLock()
    private var allowDuplicates = false
    private var intervalMs = 0.0
    private var lastSeen: [String: TimeInterval] = [:]

    private func message(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "\(error)"
    }

    /// A native Promise outlives the calling page: JS hands native no function that the page's teardown could drop.
    private func promise<T, R: AnyObject>(_ future: BleFuture<T>, _ map: @escaping (T) -> R) -> SCValdiPromise<R> {
        let promise = SCValdiResolvablePromise<R>()
        future.observe { [weak self] result in
            switch result {
            case let .success(value): promise.fulfill(withSuccessValue: map(value))
            case let .failure(error): promise.fulfillWithError(Self.nsError(self?.message(error) ?? "\(error)"))
            }
        }
        return promise
    }

    private func promise<T, E>(_ future: BleFuture<T>, _ map: @escaping (T) -> [E]) -> SCValdiPromise<NSArray> {
        promise(future) { map($0) as NSArray }
    }

    private func promise<T>(_ future: BleFuture<T>) -> SCValdiPromise<SCValdiUndefinedValue> {
        ValdiVoidPromise.make { settle in
            future.observe { [weak self] result in
                if case let .failure(error) = result { settle(self?.message(error) ?? "\(error)") } else { settle(nil) }
            }
        }
    }

    /// The JS Error's message is exactly `message`, so wechat.ts can read its E_BLE_ code.
    private static func nsError(_ message: String) -> NSError {
        NSError(domain: "BleHost", code: 0, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func resetScanFilter(allowDuplicates: Bool = false, intervalMs: Double = 0) {
        lock.lock()
        self.allowDuplicates = allowDuplicates
        self.intervalMs = intervalMs
        lastSeen.removeAll()
        lock.unlock()
    }

    /// Whether the scan's duplicate rules let this advertisement through.
    private func admits(_ deviceId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let key = deviceId.lowercased()
        let now = ProcessInfo.processInfo.systemUptime * 1000
        let admitted: Bool
        if let last = lastSeen[key] { admitted = allowDuplicates && now - last >= intervalMs } else { admitted = true }
        if admitted { lastSeen[key] = now }
        return admitted
    }

    func setEventsWith(_ events: VRBleHostEvents) {
        self.events = events
        _ = session // Listen from now on, not from the first call.
    }

    // MARK: - Adapter and discovery

    func openBluetoothAdapter(withMode mode: String?) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.openBluetoothAdapter(mode: mode))
    }

    func closeBluetoothAdapter() -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.closeBluetoothAdapter())
    }

    func getBluetoothAdapterState() -> SCValdiPromise<VRBleAdapterState> {
        promise(session.getBluetoothAdapterState(), Self.adapterState)
    }

    func startBluetoothDevicesDiscovery(with params: VRBleScanParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        resetScanFilter(allowDuplicates: params.allowDuplicatesKey?.boolValue ?? false, intervalMs: params.interval?.doubleValue ?? 0)
        return promise(session.startBluetoothDevicesDiscovery(params: BleScanParams(
            services: params.services, allowDuplicatesKey: params.allowDuplicatesKey?.boolValue,
            interval: params.interval?.doubleValue, powerLevel: params.powerLevel
        )))
    }

    func startBluetoothDevicesDiscoveryWithNames(withNames names: [String]) -> SCValdiPromise<SCValdiUndefinedValue> {
        resetScanFilter()
        return promise(session.startBluetoothDevicesDiscoveryWithNames(params: BleScanWithNameParams(peripheralNames: names)))
    }

    func startBluetoothDevicesDiscoveryWithAddresses(withAddresses addresses: [String]) -> SCValdiPromise<SCValdiUndefinedValue> {
        resetScanFilter()
        return promise(session.startBluetoothDevicesDiscoveryWithAddresses(params: BleScanWithAddressesParams(peripheralAddresses: addresses)))
    }

    func stopBluetoothDevicesDiscovery() -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.stopBluetoothDevicesDiscovery())
    }

    func getBluetoothDevices() -> SCValdiPromise<NSArray> {
        return promise(session.getBluetoothDevices()) { $0.devices.map(Self.device) }
    }

    // MARK: - Connection and GATT

    func createBLEConnection(withDeviceId deviceId: String, timeout: NSNumber?) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.createBLEConnection(deviceId: deviceId, timeout: timeout?.doubleValue ?? 15_000))
    }

    func closeBLEConnection(withDeviceId deviceId: String) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.closeBLEConnection(deviceId: deviceId))
    }

    func makeBluetoothPair(with params: VRBlePairParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.makeBluetoothPair(params: BlePairParams(deviceId: params.deviceId, pin: params.pin, timeout: params.timeout)))
    }

    func isBluetoothDevicePaired(withDeviceId deviceId: String) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.isBluetoothDevicePaired(deviceId: deviceId))
    }

    func getBLEDeviceServices(withDeviceId deviceId: String) -> SCValdiPromise<NSArray> {
        return promise(session.getBLEDeviceServices(deviceId: deviceId)) { list in
            list.services.map { VRBleService(uuid: $0.uuid, isPrimary: $0.isPrimary) }
        }
    }

    func getBLEDeviceRSSI(withDeviceId deviceId: String) -> SCValdiPromise<NSNumber> {
        return promise(session.getBLEDeviceRSSI(deviceId: deviceId)) { NSNumber(value: $0.RSSI) }
    }

    func getBLEDeviceCharacteristics(withDeviceId deviceId: String, serviceId: String) -> SCValdiPromise<NSArray> {
        return promise(session.getBLEDeviceCharacteristics(params: BleDeviceServiceParams(deviceId: deviceId, serviceId: serviceId))) { list in
            list.characteristics.map {
                let p = $0.properties
                return VRBleCharacteristic(uuid: $0.uuid, properties: VRBleCharacteristicProperties(
                    read: p.read, write: p.write, writeDefault: p.writeDefault, writeNoResponse: p.writeNoResponse,
                    notify: p.notify, indicate: p.indicate
                ))
            }
        }
    }

    func notifyBLECharacteristicValueChange(with params: VRBleNotifyParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.notifyBLECharacteristicValueChange(params: BleNotifyParams(
            deviceId: params.deviceId, serviceId: params.serviceId, characteristicId: params.characteristicId,
            state: params.state, type: params.type
        )))
    }

    func writeBLECharacteristicValue(with params: VRBleWriteParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.writeBLECharacteristicValue(params: BleWriteParams(
            deviceId: params.deviceId, serviceId: params.serviceId, characteristicId: params.characteristicId,
            value: params.value, writeType: params.writeType
        )))
    }

    func readBLECharacteristicValue(with params: VRBleReadParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.readBLECharacteristicValue(params: BleReadParams(
            deviceId: params.deviceId, serviceId: params.serviceId, characteristicId: params.characteristicId
        )))
    }

    func setBLEMTUWithDeviceId(_ deviceId: String, mtu: Double) -> SCValdiPromise<NSNumber> {
        return promise(session.setBLEMTU(params: BleMTUParams(deviceId: deviceId, mtu: mtu))) { NSNumber(value: $0.mtu) }
    }

    func getBLEMTUWithDeviceId(_ deviceId: String, writeType: String?) -> SCValdiPromise<NSNumber> {
        return promise(session.getBLEMTU(params: BleDeviceIdParams(deviceId: deviceId, writeType: writeType))) { NSNumber(value: $0.mtu) }
    }

    func getConnectedBluetoothDevices(withServices services: [String]) -> SCValdiPromise<NSArray> {
        return promise(session.getConnectedBluetoothDevices(params: BleConnectedDevicesParams(services: services))) { result in
            result.devices.map { VRBleConnectedDevice(deviceId: $0.deviceId, name: $0.name) }
        }
    }

    // MARK: - Peripheral

    func createBLEPeripheralServer() -> SCValdiPromise<NSString> {
        return promise(session.createBLEPeripheralServer()) { $0.serverId as NSString }
    }

    func addPeripheralService(withServerId serverId: String, service: VRBlePeripheralService) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.addPeripheralService(params: BlePeripheralServiceParams(serverId: serverId, service: Self.peripheralService(service))))
    }

    func removePeripheralService(withServerId serverId: String, serviceId: String) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.removePeripheralService(params: BlePeripheralRemoveServiceParams(serverId: serverId, serviceId: serviceId)))
    }

    func startPeripheralAdvertising(with params: VRBlePeripheralAdvertisingParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.startPeripheralAdvertising(params: BlePeripheralAdvertisingParams(
            serverId: params.serverId, connectable: params.connectable, deviceName: params.deviceName,
            serviceUuids: params.serviceUuids,
            manufacturerData: params.manufacturerData.map {
                BlePeripheralManufacturerData(manufacturerId: $0.manufacturerId, manufacturerSpecificData: $0.manufacturerSpecificData)
            },
            powerLevel: params.powerLevel,
            beacon: params.beacon.map {
                BlePeripheralBeacon(uuid: $0.uuid, major: $0.major, minor: $0.minor, measuredPower: $0.measuredPower)
            }
        )))
    }

    func stopPeripheralAdvertising(withServerId serverId: String) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.stopPeripheralAdvertising(serverId: serverId))
    }

    func writePeripheralCharacteristicValue(with params: VRBlePeripheralWriteParams) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.writePeripheralCharacteristicValue(params: BlePeripheralWriteParams(
            serverId: params.serverId, serviceId: params.serviceId, characteristicId: params.characteristicId,
            value: params.value, needNotify: params.needNotify, callbackId: params.callbackId?.doubleValue
        )))
    }

    func closeBLEPeripheralServer(withServerId serverId: String) -> SCValdiPromise<SCValdiUndefinedValue> {
        return promise(session.closeBLEPeripheralServer(serverId: serverId))
    }

    // MARK: - Events

    /// Registered once, for the app's lifetime. A listener the core refuses (a released core) is skipped.
    private func listen(_ session: BleSession) {
        _ = try? session.onBluetoothDeviceFound { [weak self] in
            guard let self, self.admits($0.deviceId) else { return }
            self.events?.deviceFound(Self.device($0))
        }
        _ = try? session.onAdapterStateChange { [weak self] in self?.events?.adapterStateChange(Self.adapterState($0)) }
        _ = try? session.onConnectStateChange { [weak self] in
            self?.events?.connectStateChange(VRBleConnectStateChange(deviceId: $0.deviceId, connected: $0.connected))
        }
        _ = try? session.onCharacteristicUpdate { [weak self] in
            self?.events?.characteristicUpdate(VRBleCharacteristicValue(deviceId: $0.deviceId, serviceId: $0.serviceId,
                                                                         characteristicId: $0.characteristicId, value: $0.value))
        }
        _ = try? session.onMtuChange { [weak self] in self?.events?.mtuChange(VRBleMTUChange(deviceId: $0.deviceId, mtu: $0.mtu)) }
        _ = try? session.onPeripheralReadRequest { [weak self] in
            self?.events?.peripheralReadRequest(VRBlePeripheralReadRequest(
                serverId: $0.serverId, serviceId: $0.serviceId, characteristicId: $0.characteristicId,
                callbackId: $0.callbackId, deviceId: $0.deviceId, offset: $0.offset))
        }
        _ = try? session.onPeripheralWriteRequest { [weak self] in
            self?.events?.peripheralWriteRequest(VRBlePeripheralWriteRequest(
                serverId: $0.serverId, serviceId: $0.serviceId, characteristicId: $0.characteristicId, callbackId: $0.callbackId,
                deviceId: $0.deviceId, offset: $0.offset, value: $0.value, needResponse: $0.needResponse))
        }
        _ = try? session.onPeripheralSubscribed { [weak self] in self?.events?.peripheralSubscribed(Self.subscription($0)) }
        _ = try? session.onPeripheralUnsubscribed { [weak self] in self?.events?.peripheralUnsubscribed(Self.subscription($0)) }
        _ = try? session.onPeripheralConnectionStateChange { [weak self] in
            self?.events?.peripheralConnectionStateChange(
                VRBlePeripheralConnectionState(serverId: $0.serverId, deviceId: $0.deviceId, connected: $0.connected))
        }
    }

    // MARK: - Conversions

    private static func adapterState(_ state: BleAdapterState) -> VRBleAdapterState {
        let result = VRBleAdapterState(available: state.available, discovering: state.discovering)
        result.peripheralAvailable = state.peripheralAvailable.map { NSNumber(value: $0) }
        return result
    }

    private static func device(_ source: BleDevice) -> VRBleDevice {
        let result = VRBleDevice(
            rssi: source.RSSI, advertisData: Data(source.advertisData.map { UInt8(truncatingIfNeeded: Int($0)) }),
            advertisServiceUUIDs: source.advertisServiceUUIDs, deviceId: source.deviceId, localName: source.localName,
            name: source.name, serviceData: source.serviceData.map { VRBleServiceData(uuid: $0.key, data: $0.value) }
        )
        result.connectable = source.connectable.map { NSNumber(value: $0) }
        return result
    }

    private static func subscription(_ event: BlePeripheralSubscriptionEvent) -> VRBlePeripheralSubscriptionEvent {
        VRBlePeripheralSubscriptionEvent(serverId: event.serverId, serviceId: event.serviceId,
                                         characteristicId: event.characteristicId, deviceId: event.deviceId)
    }

    private static func peripheralService(_ service: VRBlePeripheralService) -> BlePeripheralService {
        BlePeripheralService(uuid: service.uuid, characteristics: service.characteristics.map { c in
            BlePeripheralCharacteristic(
                uuid: c.uuid,
                properties: BlePeripheralProperties(read: c.properties.read, write: c.properties.write,
                                                    writeNoResponse: c.properties.writeNoResponse, notify: c.properties.notify,
                                                    indicate: c.properties.indicate),
                permission: BlePeripheralPermissions(readable: c.permission.readable, writeable: c.permission.writeable,
                                                     readEncryptionRequired: c.permission.readEncryptionRequired,
                                                     writeEncryptionRequired: c.permission.writeEncryptionRequired),
                value: c.value,
                descriptors: c.descriptors.map {
                    BlePeripheralDescriptor(uuid: $0.uuid, permission: BlePeripheralDescriptorPermissions(read: $0.read, write: $0.write),
                                            value: $0.value)
                }
            )
        })
    }
}
