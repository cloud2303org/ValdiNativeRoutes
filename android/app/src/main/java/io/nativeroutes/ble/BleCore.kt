package io.nativeroutes.ble

import android.content.Context
import android.os.Handler
import android.os.Looper

/** One application core and scheduler shared by native pages and every RN bridge. */
class BleCore private constructor(context: Context) {
    private val engine = BleEngine(context.applicationContext)
    private val handler = Handler(Looper.getMainLooper())
    private data class Work(val session: BleSession, val run: () -> Unit)
    private var adapterGeneration = 0L
    private val deviceGenerations = mutableMapOf<String, Long>()
    private val queues = mutableMapOf<String, ArrayDeque<Work>>()
    internal fun dispatch(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post(action)
    }
    internal fun <T> submit(session: BleSession, key: String?, action: (BleEngine) -> BleFuture<T>): BleFuture<T> {
        val output = BleFuture<T>()
        dispatch {
            if (session.released) { output.reject(IllegalStateException("E_BLE_SESSION_RELEASED:Session released")); return@dispatch }
            val capturedAdapter = adapterGeneration
            val capturedDevice = key?.lowercase()?.let { deviceGenerations[it] ?: 0L }
            val operationId = Any()
            session.pending[operationId] = { output.reject(IllegalStateException("E_BLE_SESSION_RELEASED:Session released")) }
            val run = {
                if (session.released || adapterGeneration != capturedAdapter || (key != null && (deviceGenerations[key.lowercase()] ?: 0L) != capturedDevice)) {
                    output.reject(IllegalStateException("E_BLE_NOT_INITIALIZED:Operation session ended"))
                    session.pending.remove(operationId)
                    if (key != null) complete(key)
                } else {
                    try { action(engine).observe { result -> dispatch {
                        session.pending.remove(operationId)
                        result.fold(output::resolve, output::reject)
                        if (key != null) complete(key)
                    } } } catch (error: Throwable) {
                        session.pending.remove(operationId)
                        output.reject(error)
                        if (key != null) complete(key)
                    }
                }
            }
            if (key == null) run() else {
                val queue = queues.getOrPut(key.lowercase()) { ArrayDeque() }
                queue.add(Work(session, run))
                if (queue.size == 1) run()
            }
        }
        return output
    }
    private fun complete(key: String) {
        val normalized = key.lowercase()
        val queue = queues[normalized] ?: return
        queue.removeFirstOrNull()
        if (queue.isEmpty()) queues.remove(normalized) else queue.first().run()
    }
    private val leases = mutableMapOf<String, MutableSet<BleSession>>()
    private val leaseCleanup = mutableMapOf<String, Pair<String, (BleEngine) -> BleFuture<Unit>>>()
    private var scanSignature: String? = null
    private val maintenance by lazy { BleSession(this) }
    internal fun resource(session: BleSession, resource: String, queue: String, signature: String? = null,
        enable: Boolean = true, action: (BleEngine) -> BleFuture<Unit>, cleanup: (BleEngine) -> BleFuture<Unit>): BleFuture<Unit> = submit(session, queue) { engine ->
        if (resource == "@scan" && enable && scanSignature != null && scanSignature != signature) {
            throw IllegalStateException("E_BLE_OPERATE_FAILED:A different discovery request is active")
        }
        val owners = leases.getOrPut(resource) { mutableSetOf() }
        if (!enable) {
            owners.remove(session)
            if (owners.isNotEmpty()) return@submit BleFuture.async { }
        }
        val result = action(engine)
        result.observe { outcome -> dispatch {
            if (outcome.isSuccess) {
                if (enable && !session.released) {
                    owners.add(session)
                    leaseCleanup[resource] = queue to cleanup
                    if (resource == "@scan") scanSignature = signature
                } else if (owners.isEmpty()) {
                    leases.remove(resource); leaseCleanup.remove(resource)
                    if (resource == "@scan") scanSignature = null
                    if (enable) submit(maintenance, queue, cleanup)
                }
            }
        } }
        result
    }
    internal fun releaseResources(session: BleSession) {
        leases.keys.toList().forEach { resource ->
            val owners = leases[resource] ?: return@forEach
            owners.remove(session)
            if (owners.isEmpty()) {
                leases.remove(resource)
                val cleanup = leaseCleanup.remove(resource)
                if (resource == "@scan") scanSignature = null
                if (cleanup != null) submit(maintenance, cleanup.first, cleanup.second)
            }
        }
    }
    internal fun invalidate(deviceId: String? = null) {
        if (deviceId == null) {
            adapterGeneration += 1
            leases.clear(); leaseCleanup.clear(); scanSignature = null
        } else {
            val key = deviceId.trim().lowercase()
            deviceGenerations[key] = (deviceGenerations[key] ?: 0L) + 1
            leases.keys.filter { it.startsWith("notify:$key:") }.forEach { leases.remove(it); leaseCleanup.remove(it) }
        }
    }
    fun createSession(): BleSession = BleSession(this)
    internal fun engine(): BleEngine = engine
    companion object {
        @Volatile private var installed: BleCore? = null
        fun install(context: Context): BleCore = installed ?: synchronized(this) {
            installed ?: BleCore(context).also { installed = it }
        }
        fun get(): BleCore = installed ?: error("Install BleCore with the application context first")
    }
}

/** Release cancels this caller's work/listeners; explicit closes retain application-wide meaning. */
class BleSession internal constructor(private val core: BleCore) {
    @Volatile internal var released = false
    internal val pending = mutableMapOf<Any, () -> Unit>()
    private val cleanup = mutableMapOf<String, () -> Unit>()
    fun release() = core.dispatch {
        if (!released) {
            synchronized(cleanup) { released = true }
            core.releaseResources(this)
            core.engine().peripheral.release(this)
            pending.values.toList().forEach { it() }; pending.clear()
            synchronized(cleanup) { cleanup.values.toList().also { cleanup.clear() } }.forEach { it() }
        }
    }
    fun openBluetoothAdapter(mode: String? = null): BleFuture<Unit> = core.submit(this, "@adapter") { it.openBluetoothAdapter(mode) }
    fun closeBluetoothAdapter(): BleFuture<Unit> = core.submit(this, null) { core.invalidate(); it.closeBluetoothAdapter() }
    fun getBluetoothAdapterState(): BleFuture<BleAdapterState> = core.submit(this, "@adapter") { it.getBluetoothAdapterState() }
    fun startBluetoothDevicesDiscovery(params: BleScanParams): BleFuture<Unit> = core.resource(this, "@scan", "@adapter", listOf(params.services?.map { it.lowercase() }?.sorted(), params.allowDuplicatesKey, params.interval, params.powerLevel).toString(), action = { it.startBluetoothDevicesDiscovery(params) }, cleanup = { it.stopBluetoothDevicesDiscovery() })
    fun startBluetoothDevicesDiscoveryWithNames(params: BleScanWithNameParams): BleFuture<Unit> = core.resource(this, "@scan", "@adapter", "names:" + params.peripheralNames.sorted().joinToString(), action = { it.startBluetoothDevicesDiscoveryWithNames(params) }, cleanup = { it.stopBluetoothDevicesDiscovery() })
    fun startBluetoothDevicesDiscoveryWithAddresses(params: BleScanWithAddressesParams): BleFuture<Unit> = core.resource(this, "@scan", "@adapter", "addresses:" + params.peripheralAddresses.map { it.lowercase() }.sorted().joinToString(), action = { it.startBluetoothDevicesDiscoveryWithAddresses(params) }, cleanup = { it.stopBluetoothDevicesDiscovery() })
    fun stopBluetoothDevicesDiscovery(): BleFuture<Unit> = core.resource(this, "@scan", "@adapter", enable = false, action = { it.stopBluetoothDevicesDiscovery() }, cleanup = { it.stopBluetoothDevicesDiscovery() })
    fun getBluetoothDevices(): BleFuture<BleDeviceList> = core.submit(this, "@adapter") { it.getBluetoothDevices() }
    fun createBLEConnection(deviceId: String, timeout: Double = 15_000.0): BleFuture<Unit> = core.submit(this, deviceId.trim()) { it.createBLEConnection(deviceId, timeout) }
    fun closeBLEConnection(deviceId: String): BleFuture<Unit> = core.submit(this, null) { core.invalidate(deviceId); it.closeBLEConnection(deviceId) }
    fun makeBluetoothPair(params: BlePairParams): BleFuture<Unit> = core.submit(this, params.deviceId.trim()) { it.makeBluetoothPair(params) }
    fun isBluetoothDevicePaired(deviceId: String): BleFuture<Unit> = core.submit(this, deviceId.trim()) { it.isBluetoothDevicePaired(deviceId) }
    fun getBLEDeviceServices(deviceId: String): BleFuture<BleServiceList> = core.submit(this, deviceId.trim()) { it.getBLEDeviceServices(deviceId) }
    fun getBLEDeviceRSSI(deviceId: String): BleFuture<BleDeviceRSSI> = core.submit(this, deviceId.trim()) { it.getBLEDeviceRSSI(deviceId) }
    fun getBLEDeviceCharacteristics(params: BleDeviceServiceParams): BleFuture<BleCharacteristicList> = core.submit(this, params.deviceId.trim()) { it.getBLEDeviceCharacteristics(params) }
    fun notifyBLECharacteristicValueChange(params: BleNotifyParams): BleFuture<Unit> {
        val resource = "notify:${params.deviceId.trim().lowercase()}:${params.serviceId.toUuid()}:${params.characteristicId.toUuid()}"
        return core.resource(this, resource, params.deviceId.trim(), enable = params.state,
            action = { it.notifyBLECharacteristicValueChange(params) },
            cleanup = { it.notifyBLECharacteristicValueChange(params.copy(state = false)) })
    }
    fun writeBLECharacteristicValue(params: BleWriteParams): BleFuture<Unit> = core.submit(this, params.deviceId.trim()) { it.writeBLECharacteristicValue(params) }
    fun readBLECharacteristicValue(params: BleReadParams): BleFuture<Unit> = core.submit(this, params.deviceId.trim()) { it.readBLECharacteristicValue(params) }
    fun setBLEMTU(params: BleMTUParams): BleFuture<BleMTU> = core.submit(this, params.deviceId.trim()) { it.setBLEMTU(params) }
    fun getBLEMTU(params: BleDeviceIdParams): BleFuture<BleMTU> = core.submit(this, params.deviceId.trim()) { it.getBLEMTU(params) }
    fun getConnectedBluetoothDevices(params: BleConnectedDevicesParams): BleFuture<BleConnectedDevicesResult> = core.submit(this, "@adapter") { it.getConnectedBluetoothDevices(params) }
    fun createBLEPeripheralServer(): BleFuture<BlePeripheralServerInfo> = core.submit(this, null) { it.peripheral.create(this) }
    fun addPeripheralService(params: BlePeripheralServiceParams): BleFuture<Unit> = core.submit(this, "@peripheral:${params.serverId}") { it.peripheral.addService(this, params) }
    fun removePeripheralService(params: BlePeripheralRemoveServiceParams): BleFuture<Unit> = core.submit(this, "@peripheral:${params.serverId}") { it.peripheral.removeService(this, params) }
    fun startPeripheralAdvertising(params: BlePeripheralAdvertisingParams): BleFuture<Unit> = core.submit(this, "@peripheral:${params.serverId}") { it.peripheral.startAdvertising(this, params) }
    // Stop and close bypass a pending start so callers can always cancel startup.
    fun stopPeripheralAdvertising(serverId: String): BleFuture<Unit> = core.submit(this, null) { it.peripheral.stopAdvertising(this, serverId) }
    fun writePeripheralCharacteristicValue(params: BlePeripheralWriteParams): BleFuture<Unit> = core.submit(this, null) { it.peripheral.write(this, params) }
    fun closeBLEPeripheralServer(serverId: String): BleFuture<Unit> = core.submit(this, null) { it.peripheral.close(this, serverId) }
    fun onPeripheralReadRequest(cb: (BlePeripheralReadRequest) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().peripheral.onRead(this) { if (!released) cb(it) }
        cleanup["peripheralReadRequest$id"] = { core.engine().peripheral.removeRead(id) }
        id
    }
    fun removePeripheralReadRequestListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("peripheralReadRequest$subscriptionId") }?.invoke()
    }
    fun onPeripheralWriteRequest(cb: (BlePeripheralWriteRequest) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().peripheral.onWrite(this) { if (!released) cb(it) }
        cleanup["peripheralWriteRequest$id"] = { core.engine().peripheral.removeWrite(id) }
        id
    }
    fun removePeripheralWriteRequestListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("peripheralWriteRequest$subscriptionId") }?.invoke()
    }
    fun onPeripheralSubscribed(cb: (BlePeripheralSubscriptionEvent) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().peripheral.onSubscribed(this) { if (!released) cb(it) }
        cleanup["peripheralSubscribed$id"] = { core.engine().peripheral.removeSubscribed(id) }
        id
    }
    fun removePeripheralSubscribedListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("peripheralSubscribed$subscriptionId") }?.invoke()
    }
    fun onPeripheralUnsubscribed(cb: (BlePeripheralSubscriptionEvent) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().peripheral.onUnsubscribed(this) { if (!released) cb(it) }
        cleanup["peripheralUnsubscribed$id"] = { core.engine().peripheral.removeUnsubscribed(id) }
        id
    }
    fun removePeripheralUnsubscribedListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("peripheralUnsubscribed$subscriptionId") }?.invoke()
    }
    fun onPeripheralConnectionStateChange(cb: (BlePeripheralConnectionState) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().peripheral.onConnection(this) { if (!released) cb(it) }
        cleanup["peripheralConnectionStateChange$id"] = { core.engine().peripheral.removeConnection(id) }
        id
    }
    fun removePeripheralConnectionStateListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("peripheralConnectionStateChange$subscriptionId") }?.invoke()
    }
    fun onBluetoothDeviceFound(cb: (BleDevice) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().onBluetoothDeviceFound { if (!released) cb(it) }
        synchronized(cleanup) { cleanup["onBluetoothDeviceFound$id"] = { core.engine().removeBluetoothDeviceFoundListener(id) } }
        id
    }
    fun removeBluetoothDeviceFoundListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("onBluetoothDeviceFound$subscriptionId") }?.invoke()
    }
    fun onAdapterStateChange(cb: (BleAdapterState) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().onAdapterStateChange { if (!released) cb(it) }
        synchronized(cleanup) { cleanup["onAdapterStateChange$id"] = { core.engine().removeAdapterStateListener(id) } }
        id
    }
    fun removeAdapterStateListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("onAdapterStateChange$subscriptionId") }?.invoke()
    }
    fun onConnectStateChange(cb: (BleConnectStateChange) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().onConnectStateChange { if (!released) cb(it) }
        synchronized(cleanup) { cleanup["onConnectStateChange$id"] = { core.engine().removeConnectStateListener(id) } }
        id
    }
    fun removeConnectStateListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("onConnectStateChange$subscriptionId") }?.invoke()
    }
    fun onCharacteristicUpdate(cb: (BleCharacteristicValue) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().onCharacteristicUpdate { if (!released) cb(it) }
        synchronized(cleanup) { cleanup["onCharacteristicUpdate$id"] = { core.engine().removeCharacteristicListener(id) } }
        id
    }
    fun removeCharacteristicListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("onCharacteristicUpdate$subscriptionId") }?.invoke()
    }
    fun onMtuChange(cb: (BleMTUChange) -> Unit): Double = synchronized(cleanup) {
        check(!released) { "E_BLE_SESSION_RELEASED:Session released" }
        val id = core.engine().onMtuChange { if (!released) cb(it) }
        synchronized(cleanup) { cleanup["onMtuChange$id"] = { core.engine().removeMtuListener(id) } }
        id
    }
    fun removeMtuListener(subscriptionId: Double) {
        synchronized(cleanup) { cleanup.remove("onMtuChange$subscriptionId") }?.invoke()
    }
}
