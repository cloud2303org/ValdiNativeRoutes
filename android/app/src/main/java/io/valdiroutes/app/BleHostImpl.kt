package io.valdiroutes.app

import android.content.Context
import android.os.SystemClock
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.nativeroutes.ble.BleConnectedDevicesParams
import io.nativeroutes.ble.BleCore
import io.nativeroutes.ble.BleDeviceIdParams
import io.nativeroutes.ble.BleDeviceServiceParams
import io.nativeroutes.ble.BleFuture
import io.nativeroutes.ble.BleMTUParams
import io.nativeroutes.ble.BlePeripheralDescriptorPermissions
import io.nativeroutes.ble.BlePeripheralRemoveServiceParams
import io.nativeroutes.ble.BlePeripheralServiceParams
import io.nativeroutes.ble.BleScanWithAddressesParams
import io.nativeroutes.ble.BleScanWithNameParams
import io.nativeroutes.ble.BleSession
import io.valdiroutes.pages.BleAdapterState
import io.valdiroutes.pages.BleCharacteristic
import io.valdiroutes.pages.BleCharacteristicProperties
import io.valdiroutes.pages.BleCharacteristicValue
import io.valdiroutes.pages.BleConnectStateChange
import io.valdiroutes.pages.BleConnectedDevice
import io.valdiroutes.pages.BleDevice
import io.valdiroutes.pages.BleHost
import io.valdiroutes.pages.BleHostEvents
import io.valdiroutes.pages.BleMTUChange
import io.valdiroutes.pages.BleNotifyParams
import io.valdiroutes.pages.BlePairParams
import io.valdiroutes.pages.BlePeripheralAdvertisingParams
import io.valdiroutes.pages.BlePeripheralConnectionState
import io.valdiroutes.pages.BlePeripheralReadRequest
import io.valdiroutes.pages.BlePeripheralService
import io.valdiroutes.pages.BlePeripheralSubscriptionEvent
import io.valdiroutes.pages.BlePeripheralWriteParams
import io.valdiroutes.pages.BlePeripheralWriteRequest
import io.valdiroutes.pages.BleReadParams
import io.valdiroutes.pages.BleScanParams
import io.valdiroutes.pages.BleService
import io.valdiroutes.pages.BleServiceData
import io.valdiroutes.pages.BleWriteParams
import io.nativeroutes.ble.BleAdapterState as CoreAdapterState
import io.nativeroutes.ble.BleDevice as CoreDevice
import io.nativeroutes.ble.BleNotifyParams as CoreNotifyParams
import io.nativeroutes.ble.BlePairParams as CorePairParams
import io.nativeroutes.ble.BlePeripheralAdvertisingParams as CoreAdvertisingParams
import io.nativeroutes.ble.BlePeripheralBeacon as CoreBeacon
import io.nativeroutes.ble.BlePeripheralCharacteristic as CoreCharacteristic
import io.nativeroutes.ble.BlePeripheralDescriptor as CoreDescriptor
import io.nativeroutes.ble.BlePeripheralManufacturerData as CoreManufacturerData
import io.nativeroutes.ble.BlePeripheralPermissions as CorePermissions
import io.nativeroutes.ble.BlePeripheralProperties as CoreProperties
import io.nativeroutes.ble.BlePeripheralService as CoreService
import io.nativeroutes.ble.BlePeripheralWriteParams as CorePeripheralWriteParams
import io.nativeroutes.ble.BleReadParams as CoreReadParams
import io.nativeroutes.ble.BleScanParams as CoreScanParams
import io.nativeroutes.ble.BleWriteParams as CoreWriteParams

/**
 * `api`'s Bluetooth on the app-wide BleCore (ble/BleHost.ts). Capability only: wechat.ts and peripheral.ts own the
 * mini-program rules on both platforms, so this maps calls and events and nothing else. Permissions are asked by
 * ble/permission.ts through PermissionHost before the adapter opens.
 */
class BleHostImpl(context: Context) : BleHost {
    private val session: BleSession by lazy { BleCore.install(context.applicationContext).createSession().also(::listen) }
    @Volatile private var events: BleHostEvents? = null

    // The scan's own duplicate rules, applied before the bridge; wechat.ts applies them again and stays the authority.
    private val scan = Any()
    private var allowDuplicates = false
    private var intervalMs = 0.0
    private val lastSeen = HashMap<String, Long>()

    override fun setEvents(events: BleHostEvents) {
        this.events = events
        session // Listen from now on, not from the first call.
    }

    /** A native Promise outlives the calling page: JS hands native no function that the page's teardown could drop. */
    private fun <T, R> BleFuture<T>.promise(map: (T) -> R): Promise<R> = ResolvablePromise<R>().also { promise ->
        observe { result -> result.fold({ promise.fulfillSuccess(map(it)) }, { promise.fulfillFailure(Exception(message(it))) }) }
    }

    private fun BleFuture<Unit>.promise(): Promise<Unit> = promise { it }

    /** Synchronous failures (a released core, a bad argument) reject like asynchronous ones. */
    private inline fun <R> guarded(block: () -> Promise<R>): Promise<R> =
        try { block() } catch (error: Throwable) { ResolvablePromise<R>().also { it.fulfillFailure(Exception(message(error))) } }

    private fun message(error: Throwable) = error.message ?: error.toString()

    override fun openBluetoothAdapter(mode: String?): Promise<Unit> = guarded { session.openBluetoothAdapter(mode).promise() }
    override fun closeBluetoothAdapter(): Promise<Unit> = guarded { session.closeBluetoothAdapter().promise() }
    override fun getBluetoothAdapterState(): Promise<BleAdapterState> = guarded { session.getBluetoothAdapterState().promise(::adapterState) }

    override fun startBluetoothDevicesDiscovery(params: BleScanParams): Promise<Unit> = guarded {
        synchronized(scan) {
            allowDuplicates = params.allowDuplicatesKey == true
            intervalMs = params.interval ?: 0.0
            lastSeen.clear()
        }
        session.startBluetoothDevicesDiscovery(
            CoreScanParams(params.services?.toTypedArray(), params.allowDuplicatesKey, params.interval, params.powerLevel),
        ).promise()
    }
    override fun startBluetoothDevicesDiscoveryWithNames(names: List<String>): Promise<Unit> = guarded {
        resetScanFilter()
        session.startBluetoothDevicesDiscoveryWithNames(BleScanWithNameParams(names.toTypedArray())).promise()
    }
    override fun startBluetoothDevicesDiscoveryWithAddresses(addresses: List<String>): Promise<Unit> = guarded {
        resetScanFilter()
        session.startBluetoothDevicesDiscoveryWithAddresses(BleScanWithAddressesParams(addresses.toTypedArray())).promise()
    }
    override fun stopBluetoothDevicesDiscovery(): Promise<Unit> = guarded { session.stopBluetoothDevicesDiscovery().promise() }
    override fun getBluetoothDevices(): Promise<List<BleDevice>> =
        guarded { session.getBluetoothDevices().promise { list -> list.devices.map(::device) } }

    private fun resetScanFilter() = synchronized(scan) {
        allowDuplicates = false
        intervalMs = 0.0
        lastSeen.clear()
    }

    override fun createBLEConnection(deviceId: String, timeout: Double?): Promise<Unit> = guarded {
        (if (timeout != null) session.createBLEConnection(deviceId, timeout) else session.createBLEConnection(deviceId)).promise()
    }
    override fun closeBLEConnection(deviceId: String): Promise<Unit> = guarded { session.closeBLEConnection(deviceId).promise() }
    override fun makeBluetoothPair(params: BlePairParams): Promise<Unit> =
        guarded { session.makeBluetoothPair(CorePairParams(params.deviceId, params.pin, params.timeout)).promise() }
    override fun isBluetoothDevicePaired(deviceId: String): Promise<Unit> = guarded { session.isBluetoothDevicePaired(deviceId).promise() }

    override fun getBLEDeviceServices(deviceId: String): Promise<List<BleService>> = guarded {
        session.getBLEDeviceServices(deviceId).promise { list -> list.services.map { BleService(it.uuid, it.isPrimary) } }
    }
    override fun getBLEDeviceRSSI(deviceId: String): Promise<Double> =
        guarded { session.getBLEDeviceRSSI(deviceId).promise { it.RSSI } }
    override fun getBLEDeviceCharacteristics(deviceId: String, serviceId: String): Promise<List<BleCharacteristic>> =
        guarded {
            session.getBLEDeviceCharacteristics(BleDeviceServiceParams(deviceId, serviceId)).promise { list ->
                list.characteristics.map {
                    val p = it.properties
                    BleCharacteristic(it.uuid, BleCharacteristicProperties(p.read, p.write, p.writeDefault, p.writeNoResponse, p.notify, p.indicate))
                }
            }
        }
    override fun notifyBLECharacteristicValueChange(params: BleNotifyParams): Promise<Unit> = guarded {
        session.notifyBLECharacteristicValueChange(
            CoreNotifyParams(params.deviceId, params.serviceId, params.characteristicId, params.state, params.type),
        ).promise()
    }
    override fun writeBLECharacteristicValue(params: BleWriteParams): Promise<Unit> = guarded {
        session.writeBLECharacteristicValue(
            CoreWriteParams(params.deviceId, params.serviceId, params.characteristicId, params.value, params.writeType),
        ).promise()
    }
    override fun readBLECharacteristicValue(params: BleReadParams): Promise<Unit> =
        guarded { session.readBLECharacteristicValue(CoreReadParams(params.deviceId, params.serviceId, params.characteristicId)).promise() }
    override fun setBLEMTU(deviceId: String, mtu: Double): Promise<Double> =
        guarded { session.setBLEMTU(BleMTUParams(deviceId, mtu)).promise { it.mtu } }
    override fun getBLEMTU(deviceId: String, writeType: String?): Promise<Double> =
        guarded { session.getBLEMTU(BleDeviceIdParams(deviceId, writeType)).promise { it.mtu } }
    override fun getConnectedBluetoothDevices(services: List<String>): Promise<List<BleConnectedDevice>> =
        guarded {
            session.getConnectedBluetoothDevices(BleConnectedDevicesParams(services.toTypedArray())).promise { result ->
                result.devices.map { BleConnectedDevice(it.deviceId, it.name) }
            }
        }

    override fun createBLEPeripheralServer(): Promise<String> =
        guarded { session.createBLEPeripheralServer().promise { it.serverId } }
    override fun addPeripheralService(serverId: String, service: BlePeripheralService): Promise<Unit> =
        guarded { session.addPeripheralService(BlePeripheralServiceParams(serverId, peripheralService(service))).promise() }
    override fun removePeripheralService(serverId: String, serviceId: String): Promise<Unit> =
        guarded { session.removePeripheralService(BlePeripheralRemoveServiceParams(serverId, serviceId)).promise() }
    override fun startPeripheralAdvertising(params: BlePeripheralAdvertisingParams): Promise<Unit> = guarded {
        session.startPeripheralAdvertising(
            CoreAdvertisingParams(
                params.serverId, params.connectable, params.deviceName, params.serviceUuids.toTypedArray(),
                params.manufacturerData.map { CoreManufacturerData(it.manufacturerId, it.manufacturerSpecificData) }.toTypedArray(),
                params.powerLevel,
                params.beacon?.let { CoreBeacon(it.uuid, it.major, it.minor, it.measuredPower) },
            ),
        ).promise()
    }
    override fun stopPeripheralAdvertising(serverId: String): Promise<Unit> = guarded { session.stopPeripheralAdvertising(serverId).promise() }
    override fun writePeripheralCharacteristicValue(params: BlePeripheralWriteParams): Promise<Unit> = guarded {
        session.writePeripheralCharacteristicValue(
            CorePeripheralWriteParams(params.serverId, params.serviceId, params.characteristicId, params.value, params.needNotify, params.callbackId),
        ).promise()
    }
    override fun closeBLEPeripheralServer(serverId: String): Promise<Unit> = guarded { session.closeBLEPeripheralServer(serverId).promise() }

    private fun peripheralService(service: BlePeripheralService) = CoreService(
        service.uuid,
        service.characteristics.map { c ->
            CoreCharacteristic(
                c.uuid,
                CoreProperties(c.properties.read, c.properties.write, c.properties.writeNoResponse, c.properties.notify, c.properties.indicate),
                CorePermissions(
                    c.permission.readable, c.permission.writeable, c.permission.readEncryptionRequired, c.permission.writeEncryptionRequired,
                ),
                c.value,
                c.descriptors.map { CoreDescriptor(it.uuid, BlePeripheralDescriptorPermissions(it.read, it.write), it.value) }.toTypedArray(),
            )
        }.toTypedArray(),
    )

    private fun adapterState(state: CoreAdapterState) = BleAdapterState(state.available, state.discovering, state.peripheralAvailable)

    private fun device(source: CoreDevice) = BleDevice(
        source.RSSI,
        ByteArray(source.advertisData.size) { source.advertisData[it].toInt().toByte() },
        source.advertisServiceUUIDs.toList(),
        source.deviceId,
        source.localName,
        source.name,
        source.serviceData.map { (uuid, data) -> BleServiceData(uuid, data) },
        source.connectable,
    )

    /** Whether the scan's duplicate rules let this advertisement through. */
    private fun admits(deviceId: String): Boolean = synchronized(scan) {
        val key = deviceId.lowercase()
        val now = SystemClock.elapsedRealtime()
        val last = lastSeen[key]
        when {
            last == null -> true
            !allowDuplicates -> false
            else -> now - last >= intervalMs
        }.also { if (it) lastSeen[key] = now }
    }

    /** Registered once, for the app's lifetime. */
    private fun listen(session: BleSession) {
        session.onBluetoothDeviceFound { if (admits(it.deviceId)) events?.deviceFound?.invoke(device(it)) }
        session.onAdapterStateChange { events?.adapterStateChange?.invoke(adapterState(it)) }
        session.onConnectStateChange { events?.connectStateChange?.invoke(BleConnectStateChange(it.deviceId, it.connected)) }
        session.onCharacteristicUpdate {
            events?.characteristicUpdate?.invoke(BleCharacteristicValue(it.deviceId, it.serviceId, it.characteristicId, it.value))
        }
        session.onMtuChange { events?.mtuChange?.invoke(BleMTUChange(it.deviceId, it.mtu)) }
        session.onPeripheralReadRequest {
            events?.peripheralReadRequest?.invoke(
                BlePeripheralReadRequest(it.serverId, it.serviceId, it.characteristicId, it.callbackId, it.deviceId, it.offset),
            )
        }
        session.onPeripheralWriteRequest {
            events?.peripheralWriteRequest?.invoke(
                BlePeripheralWriteRequest(
                    it.serverId, it.serviceId, it.characteristicId, it.callbackId, it.deviceId, it.offset, it.value, it.needResponse,
                ),
            )
        }
        session.onPeripheralSubscribed {
            events?.peripheralSubscribed?.invoke(BlePeripheralSubscriptionEvent(it.serverId, it.serviceId, it.characteristicId, it.deviceId))
        }
        session.onPeripheralUnsubscribed {
            events?.peripheralUnsubscribed?.invoke(BlePeripheralSubscriptionEvent(it.serverId, it.serviceId, it.characteristicId, it.deviceId))
        }
        session.onPeripheralConnectionStateChange {
            events?.peripheralConnectionStateChange?.invoke(BlePeripheralConnectionState(it.serverId, it.deviceId, it.connected))
        }
    }
}
