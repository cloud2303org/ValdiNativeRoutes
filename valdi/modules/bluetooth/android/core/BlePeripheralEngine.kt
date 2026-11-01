package io.nativeroutes.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import java.util.UUID

/** Application-owned peripheral transport. Each session owns only its own GATT servers. */
@SuppressLint("MissingPermission")
internal class BlePeripheralEngine(private val context: Context, private val adapterChanged: (Boolean) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private var manager: BluetoothManager? = null
    private var registered = false
    var isOpen = false
        private set
    val isAvailable: Boolean get() = isOpen && manager?.adapter?.isEnabled == true
    private fun dispatch(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post(action)
    }
    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = dispatch {
            if (intent.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
                val available = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR) == BluetoothAdapter.STATE_ON
                if (!available) closeServers(BleOperationException("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is off"))
                adapterChanged(available)
            }
        }
    }
    fun open() {
        ensurePermissions()
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:BLE is unsupported")
        }
        val candidate = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            ?: throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:Bluetooth manager unavailable")
        if (candidate.adapter?.isEnabled != true) throw BleOperationException("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is off")
        if (!registered) {
            ContextCompat.registerReceiver(context, stateReceiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_EXPORTED)
            registered = true
        }
        manager = candidate
        isOpen = true
        adapterChanged(true)
    }
    fun close() {
        closeServers(BleOperationException("E_BLE_NOT_INITIALIZED:Bluetooth adapter closed"))
        isOpen = false
        manager = null
        if (registered) { context.unregisterReceiver(stateReceiver); registered = false }
    }
    private fun requireReady(): BluetoothAdapter {
        ensurePermissions()
        if (!isOpen) throw BleOperationException("E_BLE_NOT_INITIALIZED:Open Bluetooth adapter in peripheral mode first")
        return manager?.adapter?.takeIf { it.isEnabled }
            ?: throw BleOperationException("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is off")
    }
    private fun ensurePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && context.applicationInfo.targetSdkVersion >= Build.VERSION_CODES.S) {
            val missing = arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE)
                .filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
            if (missing.isNotEmpty()) throw BleOperationException("E_BLE_PERMISSION:${missing.joinToString(",")}")
        }
    }
    private data class Owned<T>(val owner: Any, val event: T)
    private val reads = ListenerList<Owned<BlePeripheralReadRequest>>()
    private val writes = ListenerList<Owned<BlePeripheralWriteRequest>>()
    private val subscribed = ListenerList<Owned<BlePeripheralSubscriptionEvent>>()
    private val unsubscribed = ListenerList<Owned<BlePeripheralSubscriptionEvent>>()
    private val connections = ListenerList<Owned<BlePeripheralConnectionState>>()
    private val servers = mutableMapOf<String, Server>()
    private var advertisingServer: Server? = null
    private var nextCallback = 1L
    private data class Request(
        val id: Double, val device: BluetoothDevice, val requestId: Int,
        val characteristic: BluetoothGattCharacteristic, val offset: Int,
        val value: ByteArray?, val responseNeeded: Boolean, val timeout: Runnable,
    )
    private data class Notification(
        val characteristic: BluetoothGattCharacteristic, val value: ByteArray,
        val targets: ArrayDeque<Pair<BluetoothDevice, Boolean>>, val result: BleFuture<Unit>,
    )
    private class Server(val id: String, val owner: Any) {
        var gatt: BluetoothGattServer? = null
        val devices = mutableMapOf<String, BluetoothDevice>()
        val mtus = mutableMapOf<String, Int>()
        val subscriptions = mutableMapOf<String, MutableMap<String, Boolean>>()
        val requests = mutableMapOf<Double, Request>()
        var servicePending: Pair<BluetoothGattService, BleFuture<Unit>>? = null
        var advertiser: BluetoothLeAdvertiser? = null
        var advertiseCallback: AdvertiseCallback? = null
        var advertiseResult: BleFuture<Unit>? = null
        val notifications = ArrayDeque<Notification>()
        var notifyingDevice: String? = null
    }
    private fun active(server: Server): Boolean = servers[server.id] === server
    private fun callback(server: Server, action: () -> Unit) = dispatch {
        if (active(server)) runCatching(action).onFailure { closeServer(server, it) }
    }
    private fun requireServer(owner: Any, id: String): Server {
        requireReady()
        return servers[id]?.takeIf { it.owner === owner }
            ?: throw BleOperationException("E_BLE_INVALID_DATA:Peripheral server does not belong to this session or is closed")
    }
    fun create(owner: Any): BleFuture<BlePeripheralServerInfo> = BleFuture.async {
        requireReady()
        if (servers.size >= 16) throw BleOperationException("E_BLE_OPERATE_FAILED:Too many peripheral servers")
        val server = Server(UUID.randomUUID().toString(), owner)
        val gatt = manager!!.openGattServer(context, gattCallback(server))
            ?: throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:GATT server unavailable")
        server.gatt = gatt
        servers[server.id] = server
        BlePeripheralServerInfo(server.id)
    }
    fun release(owner: Any) {
        servers.values.filter { it.owner === owner }.toList().forEach {
            closeServer(it, BleOperationException("E_BLE_SESSION_RELEASED:Session released"))
        }
    }
    private fun closeServers(error: Throwable) { servers.values.toList().forEach { closeServer(it, error) } }
    fun close(owner: Any, id: String): BleFuture<Unit> = BleFuture.async {
        val server = servers[id]?.takeIf { it.owner === owner }
            ?: throw BleOperationException("E_BLE_INVALID_DATA:Peripheral server does not belong to this session or is closed")
        closeServer(server, BleOperationException("E_BLE_OPERATE_FAILED:Peripheral server closed"))
    }
    private fun closeServer(server: Server, error: Throwable) {
        if (!active(server)) return
        servers.remove(server.id)
        stopAdvertisement(server, error)
        server.servicePending?.second?.reject(error)
        server.servicePending = null
        server.requests.values.forEach { request ->
            handler.removeCallbacks(request.timeout)
            if (request.responseNeeded) runCatching { server.gatt?.sendResponse(request.device, request.requestId, BluetoothGatt.GATT_FAILURE, request.offset, null) }
        }
        server.requests.clear()
        server.notifications.forEach { it.result.reject(error) }; server.notifications.clear()
        // Android broadcasts device-wide connection events to registered GATT
        // servers. Observing a peer does not grant ownership of its physical
        // link: cancelConnection here can disconnect another server or central.
        server.devices.values.toList().forEach { device ->
            connections.notify(Owned(server.owner, BlePeripheralConnectionState(server.id, device.address, false)))
        }
        server.devices.clear(); server.mtus.clear(); server.subscriptions.clear()
        runCatching { server.gatt?.clearServices() }; runCatching { server.gatt?.close() }
        server.gatt = null
    }
    private fun bounded(server: Server, result: BleFuture<Unit>, label: String) {
        val timer = Runnable {
            if (active(server)) closeServer(server, BleOperationException("E_BLE_OPERATE_FAILED:$label timed out; peripheral server closed"))
        }
        handler.postDelayed(timer, 10_000)
        result.observe { handler.removeCallbacks(timer) }
    }
    fun addService(owner: Any, params: BlePeripheralServiceParams): BleFuture<Unit> {
        val server = requireServer(owner, params.serverId)
        if (server.servicePending != null) throw BleOperationException("E_BLE_OPERATE_FAILED:A service registration is pending")
        val service = makeService(params.service)
        if (server.gatt!!.getService(service.uuid) != null) throw BleOperationException("E_BLE_INVALID_DATA:Duplicate service UUID")
        val result = BleFuture<Unit>()
        server.servicePending = service to result
        try {
            if (!server.gatt!!.addService(service)) throw BleOperationException("E_BLE_OPERATE_FAILED:Failed to register service")
            bounded(server, result, "Service registration")
        } catch (error: Throwable) { server.servicePending = null; result.reject(error) }
        return result
    }
    fun removeService(owner: Any, params: BlePeripheralRemoveServiceParams): BleFuture<Unit> = BleFuture.async {
        val server = requireServer(owner, params.serverId)
        if (server.servicePending != null) throw BleOperationException("E_BLE_OPERATE_FAILED:A service registration is pending")
        val service = server.gatt!!.getService(params.serviceId.toUuid())
            ?: throw BleOperationException("E_BLE_SERVICE_NOT_FOUND:Peripheral service not found")
        if (server.notifications.any { it.characteristic.service.uuid == service.uuid }) {
            throw BleOperationException("E_BLE_OPERATE_FAILED:Service has pending notifications")
        }
        if (!server.gatt!!.removeService(service)) throw BleOperationException("E_BLE_OPERATE_FAILED:Failed to remove service")
        server.requests.values.filter { it.characteristic.service.uuid == service.uuid }.toList().forEach { failRequest(server, it, BluetoothGatt.GATT_FAILURE) }
        server.subscriptions.values.forEach { values -> values.keys.removeAll { it.startsWith("${service.uuid}|") } }
    }
    private fun makeService(model: BlePeripheralService): BluetoothGattService {
        if (model.characteristics.isEmpty()) throw BleOperationException("E_BLE_INVALID_DATA:Service requires characteristics")
        val service = BluetoothGattService(model.uuid.toUuid(), BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val characteristicIds = mutableSetOf<UUID>()
        for (item in model.characteristics) {
            val uuid = item.uuid.toUuid()
            if (!characteristicIds.add(uuid)) throw BleOperationException("E_BLE_INVALID_DATA:Duplicate characteristic UUID")
            val p = item.properties
            val properties = (if (p.read) BluetoothGattCharacteristic.PROPERTY_READ else 0) or
                (if (p.write) BluetoothGattCharacteristic.PROPERTY_WRITE else 0) or
                (if (p.writeNoResponse) BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE else 0) or
                (if (p.notify) BluetoothGattCharacteristic.PROPERTY_NOTIFY else 0) or
                (if (p.indicate) BluetoothGattCharacteristic.PROPERTY_INDICATE else 0)
            if (properties == 0) throw BleOperationException("E_BLE_INVALID_DATA:Characteristic requires properties")
            val permissions = (if (item.permission.readEncryptionRequired) BluetoothGattCharacteristic.PERMISSION_READ_ENCRYPTED else if (item.permission.readable) BluetoothGattCharacteristic.PERMISSION_READ else 0) or
                (if (item.permission.writeEncryptionRequired) BluetoothGattCharacteristic.PERMISSION_WRITE_ENCRYPTED else if (item.permission.writeable) BluetoothGattCharacteristic.PERMISSION_WRITE else 0)
            validateValue(item.value)
            val characteristic = BluetoothGattCharacteristic(uuid, properties, permissions)
            characteristic.value = item.value.copyOf()
            val descriptors = mutableSetOf<UUID>()
            for (descriptor in item.descriptors) {
                val descriptorId = descriptor.uuid.toUuid()
                if (!descriptors.add(descriptorId)) throw BleOperationException("E_BLE_INVALID_DATA:Duplicate descriptor UUID")
                if (descriptorId == CCCD) {
                    if (!p.notify && !p.indicate) throw BleOperationException("E_BLE_INVALID_DATA:CCCD requires notify or indicate")
                    if (descriptor.value.isNotEmpty() && !descriptor.value.contentEquals(byteArrayOf(0, 0))) throw BleOperationException("E_BLE_INVALID_DATA:CCCD must start disabled")
                    continue
                }
                validateValue(descriptor.value)
                val permission = (if (descriptor.permission.read) BluetoothGattDescriptor.PERMISSION_READ else 0) or
                    (if (descriptor.permission.write) BluetoothGattDescriptor.PERMISSION_WRITE else 0)
                characteristic.addDescriptor(BluetoothGattDescriptor(descriptorId, permission).apply { value = descriptor.value.copyOf() })
            }
            if (p.notify || p.indicate) characteristic.addDescriptor(BluetoothGattDescriptor(CCCD,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE).apply { value = byteArrayOf(0, 0) })
            if (!service.addCharacteristic(characteristic)) throw BleOperationException("E_BLE_OPERATE_FAILED:Failed to add characteristic")
        }
        return service
    }
    fun startAdvertising(owner: Any, params: BlePeripheralAdvertisingParams): BleFuture<Unit> {
        val server = requireServer(owner, params.serverId)
        if (advertisingServer != null) throw BleOperationException("E_BLE_OPERATE_FAILED:A peripheral advertisement is already active")
        val adapter = requireReady()
        val advertiser = adapter.bluetoothLeAdvertiser
            ?: throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:BLE advertising unavailable")
        if (params.deviceName.isNotEmpty() && params.deviceName != adapter.name) {
            throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:Android advertises the system Bluetooth name; custom deviceName is unsupported")
        }
        val settings = AdvertiseSettings.Builder().setConnectable(params.connectable).setTimeout(0)
            .setAdvertiseMode(when (params.powerLevel) {
                "low" -> AdvertiseSettings.ADVERTISE_MODE_LOW_POWER
                "medium" -> AdvertiseSettings.ADVERTISE_MODE_BALANCED
                "high" -> AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
                else -> throw BleOperationException("E_BLE_INVALID_DATA:Invalid advertising powerLevel")
            }).setTxPowerLevel(when (params.powerLevel) {
                "low" -> AdvertiseSettings.ADVERTISE_TX_POWER_LOW
                "high" -> AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
                else -> AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM
            }).build()
        val builder = AdvertiseData.Builder().setIncludeDeviceName(params.deviceName.isNotEmpty())
        if (params.beacon != null) {
            if (params.serviceUuids.isNotEmpty() || params.manufacturerData.isNotEmpty() || params.deviceName.isNotEmpty() || params.connectable) {
                throw BleOperationException("E_BLE_INVALID_DATA:Beacon advertising must be nonconnectable and cannot include other data")
            }
            val beacon = params.beacon
            val uuid = beacon.uuid.toUuid()
            fun ushort(value: Double): Int {
                if (!value.isFinite() || value % 1 != 0.0 || value < 0 || value > 65535) throw BleOperationException("E_BLE_INVALID_DATA:Invalid beacon identifier")
                return value.toInt()
            }
            val major = ushort(beacon.major); val minor = ushort(beacon.minor)
            if (!beacon.measuredPower.isFinite() || beacon.measuredPower % 1 != 0.0 || beacon.measuredPower < -128 || beacon.measuredPower > 127) throw BleOperationException("E_BLE_INVALID_DATA:Invalid beacon measuredPower")
            val data = java.nio.ByteBuffer.allocate(23).put(0x02).put(0x15)
                .putLong(uuid.mostSignificantBits).putLong(uuid.leastSignificantBits)
                .putShort(major.toShort()).putShort(minor.toShort()).put(beacon.measuredPower.toInt().toByte()).array()
            builder.addManufacturerData(0x004c, data)
        } else {
            params.serviceUuids.map { it.toUuid() }.distinct().forEach { builder.addServiceUuid(ParcelUuid(it)) }
            val manufacturerIds = mutableSetOf<Int>()
            params.manufacturerData.forEach {
                val id = it.manufacturerId
                if (!id.isFinite() || id % 1 != 0.0 || id < 0 || id > 65535 || !manufacturerIds.add(id.toInt())) {
                    throw BleOperationException("E_BLE_INVALID_DATA:Invalid or duplicate manufacturer ID")
                }
                builder.addManufacturerData(id.toInt(), it.manufacturerSpecificData.copyOf())
            }
        }
        val data = builder.build()
        val result = BleFuture<Unit>()
        val cb = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings) = callback(server) {
                if (server.advertiseCallback === this) { server.advertiseResult = null; result.resolve(Unit) }
            }
            override fun onStartFailure(errorCode: Int) = callback(server) {
                if (server.advertiseCallback === this) stopAdvertisement(server, BleOperationException("E_BLE_OPERATE_FAILED:Advertising failed ($errorCode)"))
            }
        }
        advertisingServer = server
        server.advertiser = advertiser; server.advertiseCallback = cb; server.advertiseResult = result
        try { advertiser.startAdvertising(settings, data, cb) }
        catch (error: Throwable) { stopAdvertisement(server, error) }
        val timer = Runnable {
            if (server.advertiseResult === result) stopAdvertisement(server, BleOperationException("E_BLE_CONNECTION_TIMEOUT:Advertising timed out"))
        }
        handler.postDelayed(timer, 10_000); result.observe { handler.removeCallbacks(timer) }
        return result
    }
    fun stopAdvertising(owner: Any, id: String): BleFuture<Unit> = BleFuture.async {
        stopAdvertisement(requireServer(owner, id), BleOperationException("E_BLE_OPERATE_FAILED:Advertising stopped"))
    }
    private fun stopAdvertisement(server: Server, error: Throwable) {
        val callback = server.advertiseCallback
        server.advertiseCallback = null
        if (advertisingServer === server) advertisingServer = null
        if (callback != null) runCatching { server.advertiser?.stopAdvertising(callback) }
        server.advertiser = null
        server.advertiseResult?.reject(error); server.advertiseResult = null
    }
    fun write(owner: Any, params: BlePeripheralWriteParams): BleFuture<Unit> {
        val server = requireServer(owner, params.serverId)
        validateValue(params.value)
        val characteristic = server.gatt!!.getService(params.serviceId.toUuid())?.getCharacteristic(params.characteristicId.toUuid())
            ?: throw BleOperationException("E_BLE_CHARACTERISTIC_NOT_FOUND:Peripheral characteristic not found")
        if (params.callbackId != null) {
            if (params.needNotify) throw BleOperationException("E_BLE_INVALID_DATA:Request responses cannot also notify")
            val request = server.requests[params.callbackId]
                ?: throw BleOperationException("E_BLE_INVALID_DATA:Request callback is unknown, expired or already answered")
            if (key(request.characteristic) != key(characteristic)) throw BleOperationException("E_BLE_INVALID_DATA:Callback characteristic does not match")
            val response = if (request.value == null) {
                if (request.offset > params.value.size) {
                    failRequest(server, request, BluetoothGatt.GATT_INVALID_OFFSET)
                    throw BleOperationException("E_BLE_INVALID_DATA:Read response offset exceeds value")
                }
                params.value.copyOfRange(request.offset, minOf(params.value.size, request.offset + (server.mtus[request.device.address] ?: 23) - 1))
            } else null
            server.requests.remove(request.id); handler.removeCallbacks(request.timeout)
            if (request.responseNeeded && !server.gatt!!.sendResponse(request.device, request.requestId, BluetoothGatt.GATT_SUCCESS, request.offset, response)) {
                throw BleOperationException("E_BLE_OPERATE_FAILED:Failed to send request response")
            }
            characteristic.value = (request.value ?: params.value).copyOf()
            return BleFuture.async { }
        }
        if (!params.needNotify) { characteristic.value = params.value.copyOf(); return BleFuture.async { } }
        val targets = ArrayDeque<Pair<BluetoothDevice, Boolean>>()
        server.subscriptions.forEach { (deviceId, values) ->
            val indication = values[key(characteristic)]
            if (indication != null) server.devices[deviceId]?.let { device ->
                if (params.value.size > (server.mtus[deviceId] ?: 23) - 3) throw BleOperationException("E_BLE_INVALID_DATA:Notification exceeds the subscribed device MTU")
                targets.add(device to indication)
            }
        }
        if (targets.isEmpty()) throw BleOperationException("E_BLE_NOT_CONNECTED:No subscribed central")
        if (server.notifications.size >= 64) throw BleOperationException("E_BLE_OPERATE_FAILED:Notification queue is full")
        val result = BleFuture<Unit>()
        characteristic.value = params.value.copyOf()
        server.notifications.add(Notification(characteristic, params.value.copyOf(), targets, result))
        bounded(server, result, "Notification")
        if (server.notifications.size == 1) sendNext(server)
        return result
    }
    private fun sendNext(server: Server) {
        if (!active(server)) return
        val notification = server.notifications.firstOrNull() ?: return
        if (notification.targets.isEmpty()) {
            server.notifications.removeFirst(); notification.result.resolve(Unit); sendNext(server); return
        }
        val (device, indication) = notification.targets.first()
        server.notifyingDevice = device.address
        try {
            if (server.devices[device.address] == null || server.subscriptions[device.address]?.get(key(notification.characteristic)) != indication) {
                throw BleOperationException("E_BLE_NOT_CONNECTED:Central disconnected or unsubscribed before notification")
            }
            val accepted = if (Build.VERSION.SDK_INT >= 33) {
                server.gatt!!.notifyCharacteristicChanged(device, notification.characteristic, indication, notification.value) == 0
            } else {
                notification.characteristic.value = notification.value.copyOf()
                server.gatt!!.notifyCharacteristicChanged(device, notification.characteristic, indication)
            }
            if (!accepted) throw BleOperationException("E_BLE_OPERATE_FAILED:System rejected notification")
        } catch (error: Throwable) {
            server.notifyingDevice = null; server.notifications.removeFirst(); notification.result.reject(error); sendNext(server)
        }
    }
    private fun validateValue(value: ByteArray) {
        if (value.size > 512) throw BleOperationException("E_BLE_INVALID_DATA:GATT value cannot exceed 512 bytes")
    }
    private fun key(characteristic: BluetoothGattCharacteristic): String = "${characteristic.service.uuid}|${characteristic.uuid}"
    private fun failRequest(server: Server, request: Request, status: Int) {
        server.requests.remove(request.id); handler.removeCallbacks(request.timeout)
        if (request.responseNeeded) server.gatt?.sendResponse(request.device, request.requestId, status, request.offset, null)
    }
    private fun request(server: Server, device: BluetoothDevice, requestId: Int, offset: Int,
        characteristic: BluetoothGattCharacteristic, value: ByteArray?, responseNeeded: Boolean) {
        if (server.requests.size >= 64) {
            if (responseNeeded) server.gatt!!.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
            return
        }
        val id = (nextCallback++).toDouble()
        val timer = Runnable { server.requests[id]?.let { failRequest(server, it, BluetoothGatt.GATT_FAILURE) } }
        server.requests[id] = Request(id, device, requestId, characteristic, offset, value?.copyOf(), responseNeeded, timer)
        handler.postDelayed(timer, 10_000)
        val serviceId = characteristic.service.uuid.toNormalizedString(); val characteristicId = characteristic.uuid.toNormalizedString()
        if (value == null) reads.notify(Owned(server.owner, BlePeripheralReadRequest(server.id, serviceId, characteristicId, id, device.address, offset.toDouble())))
        else writes.notify(Owned(server.owner, BlePeripheralWriteRequest(server.id, serviceId, characteristicId, id, device.address, offset.toDouble(), value.copyOf(), responseNeeded)))
    }
    private fun gattCallback(server: Server) = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService) = callback(server) {
            val pending = server.servicePending ?: return@callback
            if (pending.first.uuid != service.uuid) return@callback
            server.servicePending = null
            if (status == BluetoothGatt.GATT_SUCCESS) pending.second.resolve(Unit)
            else pending.second.reject(BleOperationException("E_BLE_OPERATE_FAILED:Service registration failed ($status)"))
        }
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) = callback(server) {
            val connected = status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED
            if (connected) { server.devices[device.address] = device; server.mtus[device.address] = 23 }
            else {
                server.devices.remove(device.address); server.mtus.remove(device.address)
                val subscriptions = server.subscriptions.remove(device.address)
                subscriptions?.keys?.forEach { id ->
                    val (serviceId, characteristicId) = id.split('|')
                    unsubscribed.notify(Owned(server.owner, BlePeripheralSubscriptionEvent(server.id, serviceId, characteristicId, device.address)))
                }
                server.requests.values.filter { it.device.address == device.address }.toList().forEach {
                    server.requests.remove(it.id); handler.removeCallbacks(it.timeout)
                }
                // A notification callback can still arrive after disconnect. Keep its slot until
                // callback or timeout so it cannot accidentally acknowledge the next notification.
            }
            if (newState == BluetoothProfile.STATE_CONNECTED || newState == BluetoothProfile.STATE_DISCONNECTED) {
                connections.notify(Owned(server.owner, BlePeripheralConnectionState(server.id, device.address, connected)))
            }
        }
        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) = callback(server) { server.mtus[device.address] = mtu.coerceIn(23, 517) }
        override fun onCharacteristicReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic) = callback(server) {
            if (offset < 0) server.gatt!!.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
            else request(server, device, requestId, offset, characteristic, null, true)
        }
        override fun onCharacteristicWriteRequest(device: BluetoothDevice, requestId: Int, characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray) = callback(server) {
            val status = when {
                preparedWrite -> BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED
                offset != 0 -> BluetoothGatt.GATT_INVALID_OFFSET
                value.size > 512 -> BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH
                else -> BluetoothGatt.GATT_SUCCESS
            }
            if (status != BluetoothGatt.GATT_SUCCESS) { if (responseNeeded) server.gatt!!.sendResponse(device, requestId, status, offset, null) }
            else request(server, device, requestId, offset, characteristic, value, responseNeeded)
        }
        override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) = callback(server) {
            server.gatt!!.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null)
        }
        override fun onDescriptorReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, descriptor: BluetoothGattDescriptor) = callback(server) {
            val value = if (descriptor.uuid == CCCD) {
                when (server.subscriptions[device.address]?.get(key(descriptor.characteristic))) {
                    true -> BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                    false -> BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    null -> BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
                }
            } else descriptor.value ?: byteArrayOf()
            if (offset < 0 || offset > value.size) server.gatt!!.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
            else server.gatt!!.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset,
                value.copyOfRange(offset, minOf(value.size, offset + (server.mtus[device.address] ?: 23) - 1)))
        }
        override fun onDescriptorWriteRequest(device: BluetoothDevice, requestId: Int, descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray) = callback(server) {
            val characteristic = descriptor.characteristic
            var status = when {
                preparedWrite -> BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED
                offset != 0 -> BluetoothGatt.GATT_INVALID_OFFSET
                value.size > 512 -> BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH
                else -> BluetoothGatt.GATT_SUCCESS
            }
            var mode: Boolean? = null
            if (status == BluetoothGatt.GATT_SUCCESS && descriptor.uuid == CCCD) {
                when {
                    value.contentEquals(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE) -> Unit
                    value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) && characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 -> mode = false
                    value.contentEquals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE) && characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 -> mode = true
                    else -> status = BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED
                }
            }
            if (responseNeeded && !server.gatt!!.sendResponse(device, requestId, status, offset, null)) return@callback
            if (status != BluetoothGatt.GATT_SUCCESS) return@callback
            if (descriptor.uuid != CCCD) { descriptor.value = value.copyOf(); return@callback }
            val values = server.subscriptions.getOrPut(device.address) { mutableMapOf() }
            val previous = values[key(characteristic)]
            if (mode == null) values.remove(key(characteristic)) else values[key(characteristic)] = mode
            server.devices[device.address] = device
            if (previous != mode) {
                val event = Owned(server.owner, BlePeripheralSubscriptionEvent(server.id, characteristic.service.uuid.toNormalizedString(), characteristic.uuid.toNormalizedString(), device.address))
                if (mode == null) unsubscribed.notify(event) else subscribed.notify(event)
            }
        }
        override fun onNotificationSent(device: BluetoothDevice, status: Int) = callback(server) {
            if (server.notifyingDevice != device.address) return@callback
            val notification = server.notifications.firstOrNull() ?: return@callback
            server.notifyingDevice = null
            if (status != BluetoothGatt.GATT_SUCCESS) {
                server.notifications.removeFirst(); notification.result.reject(BleOperationException("E_BLE_OPERATE_FAILED:Notification failed ($status)"))
            } else notification.targets.removeFirst()
            sendNext(server)
        }
    }
    fun onRead(owner: Any, cb: (BlePeripheralReadRequest) -> Unit): Double = reads.add { if (it.owner === owner) cb(it.event) }
    fun removeRead(id: Double) { reads.remove(id) }
    fun onWrite(owner: Any, cb: (BlePeripheralWriteRequest) -> Unit): Double = writes.add { if (it.owner === owner) cb(it.event) }
    fun removeWrite(id: Double) { writes.remove(id) }
    fun onSubscribed(owner: Any, cb: (BlePeripheralSubscriptionEvent) -> Unit): Double = subscribed.add { if (it.owner === owner) cb(it.event) }
    fun removeSubscribed(id: Double) { subscribed.remove(id) }
    fun onUnsubscribed(owner: Any, cb: (BlePeripheralSubscriptionEvent) -> Unit): Double = unsubscribed.add { if (it.owner === owner) cb(it.event) }
    fun removeUnsubscribed(id: Double) { unsubscribed.remove(id) }
    fun onConnection(owner: Any, cb: (BlePeripheralConnectionState) -> Unit): Double = connections.add { if (it.owner === owner) cb(it.event) }
    fun removeConnection(id: Double) { connections.remove(id) }
    companion object { private val CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb") }
}
