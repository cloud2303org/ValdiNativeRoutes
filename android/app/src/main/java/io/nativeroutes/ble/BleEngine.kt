package io.nativeroutes.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.welie.blessed.BluetoothCentralManager
import com.welie.blessed.BluetoothCentralManagerCallback
import com.welie.blessed.BluetoothPeripheral
import com.welie.blessed.BluetoothPeripheralCallback
import com.welie.blessed.BondState
import com.welie.blessed.ConnectionState
import com.welie.blessed.GattStatus
import com.welie.blessed.HciStatus
import com.welie.blessed.ScanMode
import com.welie.blessed.WriteType
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import java.util.Locale

@SuppressLint("MissingPermission")
internal class BleEngine(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val managerLock = Any()
    internal val peripheral = BlePeripheralEngine(context) { available -> emitAdapterState(available) }

    @Volatile
    private var centralManager: BluetoothCentralManager? = null

    private val connectPromises = PromiseStore<Unit>()
    private val disconnectPromises = PromiseStore<Unit>()
    private val rssiPromises = PromiseStore<BleDeviceRSSI>()
    private val readPromises = PromiseStore<Unit>()
    private val writePromises = PromiseStore<Unit>()
    private val notifyPromises = PromiseStore<Unit>()
    private val mtuPromises = PromiseStore<BleMTU>()
    private val pairPromises = PromiseStore<Unit>()
    private val pairingPins = java.util.concurrent.ConcurrentHashMap<String, ByteArray>()
    private val notifyTargets = java.util.concurrent.ConcurrentHashMap<String, Boolean>()
    private val discoveredDevices = java.util.concurrent.ConcurrentHashMap<String, BleDevice>()

    private val deviceFoundListeners = ListenerList<BleDevice>()
    private val adapterStateListeners = ListenerList<BleAdapterState>()
    private val connectStateListeners = ListenerList<BleConnectStateChange>()
    private val characteristicListeners = ListenerList<BleCharacteristicValue>()
    private val mtuListeners = ListenerList<BleMTUChange>()

    @Volatile
    private var pairingReceiverRegistered = false

    private val pairingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != BluetoothDevice.ACTION_PAIRING_REQUEST) return
            val device = IntentCompat.getParcelableExtra(
                intent,
                BluetoothDevice.EXTRA_DEVICE,
                BluetoothDevice::class.java,
            ) ?: return
            val key = device.address.normalizedDeviceId()
            val pin = pairingPins[key] ?: return
            if (device.setPin(pin)) {
                if (isOrderedBroadcast) abortBroadcast()
            } else {
                pairingPins.remove(key)
                pairPromises.reject(
                    key,
                    BleOperationException("E_BLE_PAIR_FAILED:Failed to submit Bluetooth PIN"),
                )
            }
        }
    }

    private val centralCallback = object : BluetoothCentralManagerCallback() {
        override fun onDiscovered(peripheral: BluetoothPeripheral, scanResult: ScanResult) {
            val device = peripheral.toDevice(scanResult)
            discoveredDevices[device.deviceId.normalizedDeviceId()] = device
            deviceFoundListeners.notify(device)
        }

        override fun onConnected(peripheral: BluetoothPeripheral) {
            val deviceId = peripheral.address.normalizedDeviceId()
            connectPromises.resolve(deviceId, Unit)
            emitConnectState(deviceId, true)
        }

        override fun onDisconnected(peripheral: BluetoothPeripheral, status: HciStatus) {
            val deviceId = peripheral.address.normalizedDeviceId()
            val error = BleOperationException(
                "E_BLE_NOT_CONNECTED:BleDevice $deviceId disconnected ($status)",
            )
            connectPromises.reject(deviceId, error)
            if (status == HciStatus.SUCCESS) {
                disconnectPromises.resolve(deviceId, Unit)
            } else {
                disconnectPromises.reject(deviceId, error)
            }
            rejectDeviceOperations(deviceId, error)
            emitConnectState(deviceId, false)
        }

        override fun onConnectionFailed(peripheral: BluetoothPeripheral, status: HciStatus) {
            val deviceId = peripheral.address.normalizedDeviceId()
            val error = BleOperationException(
                "E_BLE_CONNECTION_FAILED:Failed to connect to $deviceId ($status)",
            )
            connectPromises.reject(deviceId, error)
            disconnectPromises.reject(deviceId, error)
            rejectDeviceOperations(deviceId, error)
            emitConnectState(deviceId, false)
        }

        override fun onBluetoothAdapterStateChanged(state: Int) {
            if (state != BluetoothAdapter.STATE_ON) {
                rejectAllOperations(
                    BleOperationException("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is off"),
                )
            }
            emitAdapterState(state == BluetoothAdapter.STATE_ON)
        }
    }

    private val peripheralCallback = object : BluetoothPeripheralCallback() {
        override fun onCharacteristicUpdate(
            peripheral: BluetoothPeripheral,
            value: ByteArray,
            characteristic: BluetoothGattCharacteristic,
            status: GattStatus,
        ) {
            val key = characteristicKey(peripheral, characteristic)
            if (status == GattStatus.SUCCESS) {
                readPromises.resolve(key, Unit)
                characteristicListeners.notify(
                    BleCharacteristicValue(
                        deviceId = peripheral.address,
                        serviceId = characteristic.service.uuid.toNormalizedString(),
                        characteristicId = characteristic.uuid.toNormalizedString(),
                        value = value.copyOf(),
                    ),
                )
            } else {
                readPromises.reject(
                    key,
                    BleOperationException("E_BLE_READ_FAILED:Read failed ($status)"),
                )
            }
        }

        override fun onCharacteristicWrite(
            peripheral: BluetoothPeripheral,
            value: ByteArray,
            characteristic: BluetoothGattCharacteristic,
            status: GattStatus,
        ) {
            val key = characteristicKey(peripheral, characteristic)
            if (status == GattStatus.SUCCESS) {
                writePromises.resolve(key, Unit)
            } else {
                writePromises.reject(
                    key,
                    BleOperationException("E_BLE_WRITE_FAILED:Write failed ($status)"),
                )
            }
        }

        override fun onNotificationStateUpdate(
            peripheral: BluetoothPeripheral,
            characteristic: BluetoothGattCharacteristic,
            status: GattStatus,
        ) {
            val key = characteristicKey(peripheral, characteristic)
            val expectedState = notifyTargets.remove(key)
            if (
                status == GattStatus.SUCCESS &&
                expectedState != null &&
                peripheral.isNotifying(characteristic) == expectedState
            ) {
                notifyPromises.resolve(key, Unit)
            } else {
                notifyPromises.reject(
                    key,
                    BleOperationException("E_BLE_NOTIFY_FAILED:Notify update failed ($status)"),
                )
            }
        }

        override fun onReadRemoteRssi(
            peripheral: BluetoothPeripheral,
            rssi: Int,
            status: GattStatus,
        ) {
            val deviceId = peripheral.address.normalizedDeviceId()
            if (status == GattStatus.SUCCESS) {
                rssiPromises.resolve(deviceId, BleDeviceRSSI(rssi.toDouble()))
            } else {
                rssiPromises.reject(
                    deviceId,
                    BleOperationException("E_BLE_RSSI_FAILED:RSSI read failed ($status)"),
                )
            }
        }

        override fun onMtuChanged(
            peripheral: BluetoothPeripheral,
            mtu: Int,
            status: GattStatus,
        ) {
            val deviceId = peripheral.address.normalizedDeviceId()
            if (status == GattStatus.SUCCESS) {
                val result = BleMTU(mtu.toDouble())
                mtuPromises.resolve(deviceId, result)
                mtuListeners.notify(BleMTUChange(deviceId = deviceId, mtu = mtu.toDouble()))
            } else {
                mtuPromises.reject(
                    deviceId,
                    BleOperationException("E_BLE_MTU_FAILED:BleMTU request failed ($status)"),
                )
            }
        }

        override fun onBondingSucceeded(peripheral: BluetoothPeripheral) {
            val key = peripheral.address.normalizedDeviceId()
            pairingPins.remove(key)
            pairPromises.resolve(key, Unit)
        }

        override fun onBondingFailed(peripheral: BluetoothPeripheral) {
            val key = peripheral.address.normalizedDeviceId()
            pairingPins.remove(key)
            pairPromises.reject(
                key,
                BleOperationException("E_BLE_PAIR_FAILED:Bluetooth pairing failed"),
            )
        }

        override fun onBondLost(peripheral: BluetoothPeripheral) {
            val key = peripheral.address.normalizedDeviceId()
            pairingPins.remove(key)
            pairPromises.reject(
                key,
                BleOperationException("E_BLE_PAIR_FAILED:Bluetooth bond was lost"),
            )
        }
    }

    fun openBluetoothAdapter(mode: String? = null): BleFuture<Unit> = BleFuture.async {
        if (mode == "peripheral") {
            peripheral.open()
            return@async
        }
        if (mode != null && mode != "central") {
            throw BleOperationException("E_BLE_INVALID_DATA:Unknown Bluetooth adapter mode $mode")
        }
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            throw BleOperationException("E_BLE_SYSTEM_NOT_SUPPORTED:BLE is unsupported")
        }
        ensureScanPermissions()
        ensureConnectPermission()
        synchronized(managerLock) {
            if (centralManager == null) {
                discoveredDevices.clear()
                centralManager = BluetoothCentralManager(context, centralCallback, mainHandler)
            }
        }
        requireReadyManager()
        registerPairingReceiver()
    }

    fun closeBluetoothAdapter(): BleFuture<Unit> = BleFuture.async {
        peripheral.close()
        val manager = synchronized(managerLock) {
            val current = centralManager
            centralManager = null
            current
        }
        manager?.stopScan()
        manager?.getConnectedPeripherals()?.forEach { manager.cancelConnection(it) }
        manager?.close()
        unregisterPairingReceiver()
        discoveredDevices.clear()
        pairingPins.clear()
        rejectAllOperations(BleOperationException("E_BLE_NOT_INITIALIZED:Bluetooth adapter closed"))
        emitAdapterState(false)
    }

    fun getBluetoothAdapterState(): BleFuture<BleAdapterState> = BleFuture.async {
        val manager = centralManager
        if (manager == null && !peripheral.isOpen) requireManager()
        BleAdapterState(
            available = manager?.isBluetoothEnabled ?: peripheral.isAvailable,
            discovering = manager?.isScanning == true,
        )
    }

    fun startBluetoothDevicesDiscovery(params: BleScanParams): BleFuture<Unit> = BleFuture.async {
        ensureScanPermissions()
        val manager = requireReadyManager()
        manager.setScanMode(
            when (params.powerLevel) {
                "low" -> ScanMode.LOW_POWER
                "medium", null -> ScanMode.BALANCED
                "high" -> ScanMode.LOW_LATENCY
                else -> throw BleOperationException(
                    "E_BLE_INVALID_DATA:Unknown power level ${params.powerLevel}",
                )
            },
        )
        val services = params.services?.map { it.toUuid() }?.toSet()
        if (services.isNullOrEmpty()) manager.scanForPeripherals()
        else manager.scanForPeripheralsWithServices(services)
        emitAdapterState(true)
    }

    fun startBluetoothDevicesDiscoveryWithAddresses(
        params: BleScanWithAddressesParams,
    ): BleFuture<Unit> = BleFuture.async {
        ensureScanPermissions()
        val manager = requireReadyManager()
        manager.scanForPeripheralsWithAddresses(
            params.peripheralAddresses.map { it.normalizedDeviceId() }.toSet(),
        )
        emitAdapterState(true)
    }

    fun startBluetoothDevicesDiscoveryWithNames(
        params: BleScanWithNameParams,
    ): BleFuture<Unit> = BleFuture.async {
        ensureScanPermissions()
        val manager = requireReadyManager()
        manager.scanForPeripheralsWithNames(params.peripheralNames.toSet())
        emitAdapterState(true)
    }

    fun stopBluetoothDevicesDiscovery(): BleFuture<Unit> = BleFuture.async {
        centralManager?.stopScan()
        emitAdapterState(centralManager?.isBluetoothEnabled == true)
    }

    fun getBluetoothDevices(): BleFuture<BleDeviceList> = BleFuture.async {
        requireManager()
        BleDeviceList(discoveredDevices.values.toTypedArray())
    }

    fun createBLEConnection(deviceId: String, timeout: Double = 15_000.0): BleFuture<Unit> {
        ensureConnectPermission()
        val manager = requireReadyManager()
        val peripheral = getPeripheral(deviceId)
        val key = peripheral.address.normalizedDeviceId()
        when (peripheral.getState()) {
            ConnectionState.CONNECTED -> return BleFuture.async {
                throw BleOperationException("E_BLE_ALREADY_CONNECTED:BleDevice $key is already connected")
            }
            ConnectionState.DISCONNECTING -> return BleFuture.async {
                throw BleOperationException("E_BLE_CONNECTION_FAILED:BleDevice $key is disconnecting")
            }
            ConnectionState.CONNECTING -> {
                connectPromises.get(key)?.let { return it }
            }
            ConnectionState.DISCONNECTED -> Unit
        }
        val promise = BleFuture<Unit>()
        val active = connectPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        try {
            manager.connect(peripheral, peripheralCallback)
        } catch (error: Throwable) {
            connectPromises.reject(key, error)
        }
        mainHandler.postDelayed({
            if (connectPromises.get(key) === promise) {
                val error = BleOperationException("E_BLE_CONNECTION_TIMEOUT:Connection timed out")
                runCatching { manager.cancelConnection(peripheral) }
                connectPromises.reject(key, error)
                rejectDeviceOperations(key, error)
            }
        }, timeout.coerceAtLeast(1.0).coerceAtMost(120_000.0).toLong())
        return promise
    }

    fun closeBLEConnection(deviceId: String): BleFuture<Unit> {
        ensureConnectPermission()
        val manager = requireManager()
        val peripheral = getPeripheral(deviceId)
        val key = peripheral.address.normalizedDeviceId()
        when (peripheral.getState()) {
            ConnectionState.DISCONNECTED -> return BleFuture.async { }
            ConnectionState.DISCONNECTING -> {
                disconnectPromises.get(key)?.let { return it }
            }
            ConnectionState.CONNECTED, ConnectionState.CONNECTING -> Unit
        }
        val promise = BleFuture<Unit>()
        val active = disconnectPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        try {
            manager.cancelConnection(peripheral)
        } catch (error: Throwable) {
            disconnectPromises.reject(key, error)
        }
        return promise
    }

    fun makeBluetoothPair(params: BlePairParams): BleFuture<Unit> {
        ensureConnectPermission()
        val manager = requireReadyManager()
        val peripheral = getPeripheral(params.deviceId)
        val key = peripheral.address.normalizedDeviceId()
        if (peripheral.bondState == BondState.BONDED) return BleFuture.async { }
        if (peripheral.bondState == BondState.BONDING) {
            pairPromises.get(key)?.let { return it }
            return BleFuture.async {
                throw BleOperationException("E_BLE_PAIR_FAILED:BleDevice $key is already pairing")
            }
        }
        val pin = try {
            Base64.decode(params.pin, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            return BleFuture.async {
                throw BleOperationException("E_BLE_INVALID_DATA:pin is not valid Base64")
            }
        }
        pairingPins[key] = pin
        val promise = BleFuture<Unit>()
        val active = pairPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        try {
            manager.createBond(peripheral, peripheralCallback)
            mainHandler.postDelayed(
                {
                    pairPromises.reject(
                        key,
                        BleOperationException("E_BLE_PAIR_TIMEOUT:Bluetooth pairing timed out"),
                    )
                    pairingPins.remove(key)
                },
                params.timeout.toLong(),
            )
        } catch (error: Throwable) {
            pairingPins.remove(key)
            pairPromises.reject(key, error)
        }
        return promise
    }

    fun isBluetoothDevicePaired(deviceId: String): BleFuture<Unit> = BleFuture.async {
        ensureConnectPermission()
        val peripheral = getPeripheral(deviceId)
        if (peripheral.bondState != BondState.BONDED) {
            throw BleOperationException("E_BLE_NOT_PAIRED:BleDevice ${peripheral.address} is not paired")
        }
    }

    fun getBLEDeviceServices(deviceId: String): BleFuture<BleServiceList> = BleFuture.async {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(deviceId)
        BleServiceList(peripheral.services.map { it.toServiceModel() }.toTypedArray())
    }

    fun getBLEDeviceCharacteristics(
        params: BleDeviceServiceParams,
    ): BleFuture<BleCharacteristicList> = BleFuture.async {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        val service = peripheral.getService(params.serviceId.toUuid())
            ?: throw BleOperationException(
                "E_BLE_SERVICE_NOT_FOUND:BleService ${params.serviceId} not found",
            )
        BleCharacteristicList(service.characteristics.map { it.toCharacteristicModel() }.toTypedArray())
    }

    fun getBLEDeviceRSSI(deviceId: String): BleFuture<BleDeviceRSSI> {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(deviceId)
        val key = peripheral.address.normalizedDeviceId()
        val promise = BleFuture<BleDeviceRSSI>()
        val active = rssiPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        if (!peripheral.readRemoteRssi()) {
            rssiPromises.reject(key, BleOperationException("E_BLE_RSSI_FAILED:Failed to queue RSSI read"))
        }
        return promise
    }

    fun notifyBLECharacteristicValueChange(params: BleNotifyParams): BleFuture<Unit> {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        val characteristic = requireCharacteristic(peripheral, params.serviceId, params.characteristicId)
        val forceIndications = if (params.state) {
            requestedForceIndications(characteristic, params.type)
        } else {
            false
        }
        val key = characteristicKey(peripheral, characteristic)
        if (peripheral.isNotifying(characteristic) == params.state) return BleFuture.async { }
        val promise = BleFuture<Unit>()
        val active = notifyPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        notifyTargets[key] = params.state
        val queued = if (params.state) {
            peripheral.startNotify(characteristic, forceIndications)
        } else {
            peripheral.stopNotify(characteristic)
        }
        if (!queued) {
            notifyTargets.remove(key)
            notifyPromises.reject(
                key,
                BleOperationException("E_BLE_NOTIFY_FAILED:Failed to queue notify update"),
            )
        }
        return promise
    }

    fun writeBLECharacteristicValue(params: BleWriteParams): BleFuture<Unit> {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        val characteristic = requireCharacteristic(peripheral, params.serviceId, params.characteristicId)
        val key = characteristicKey(peripheral, characteristic)
        val value = params.value.copyOf()
        val writeType = when (params.writeType) {
            "write" -> WriteType.WITH_RESPONSE
            "writeNoResponse" -> WriteType.WITHOUT_RESPONSE
            null -> WriteType.WITH_RESPONSE
            else -> return BleFuture.async {
                throw BleOperationException("E_BLE_INVALID_DATA:Unknown write type ${params.writeType}")
            }
        }
        val requiredProperty = when (writeType) {
            WriteType.WITH_RESPONSE -> BluetoothGattCharacteristic.PROPERTY_WRITE
            WriteType.WITHOUT_RESPONSE -> BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE
            else -> 0
        }
        if (characteristic.properties and requiredProperty == 0) return BleFuture.async {
            throw BleOperationException("E_BLE_PROPERTY_NOT_SUPPORTED:Requested write type is unsupported")
        }
        if (value.size > peripheral.getMaximumWriteValueLength(writeType)) return BleFuture.async {
            throw BleOperationException("E_BLE_WRITE_FAILED:Value exceeds maximum write length")
        }
        val promise = BleFuture<Unit>()
        val active = writePromises.putIfAbsent(key, promise)
        if (active !== promise) return BleFuture.async {
            throw BleOperationException("E_BLE_WRITE_FAILED:A write is already pending")
        }
        try {
            if (!peripheral.writeCharacteristic(characteristic, value, writeType)) {
                writePromises.reject(
                    key,
                    BleOperationException("E_BLE_WRITE_FAILED:Failed to queue characteristic write"),
                )
            }
        } catch (error: Throwable) {
            writePromises.reject(key, error)
        }
        return promise
    }

    fun readBLECharacteristicValue(params: BleReadParams): BleFuture<Unit> {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        val characteristic = requireCharacteristic(peripheral, params.serviceId, params.characteristicId)
        val key = characteristicKey(peripheral, characteristic)
        val promise = BleFuture<Unit>()
        val active = readPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        try {
            if (!peripheral.readCharacteristic(characteristic)) {
                readPromises.reject(
                    key,
                    BleOperationException("E_BLE_READ_FAILED:Failed to queue characteristic read"),
                )
            }
        } catch (error: Throwable) {
            readPromises.reject(key, error)
        }
        return promise
    }

    fun setBLEMTU(params: BleMTUParams): BleFuture<BleMTU> {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        val key = peripheral.address.normalizedDeviceId()
        val mtu = params.mtu.toInt()
        if (mtu !in 23..511) return BleFuture.async {
            throw BleOperationException("E_BLE_INVALID_DATA:BleMTU must be between 23 and 511")
        }
        if (peripheral.currentMtu == mtu) return BleFuture.async { BleMTU(mtu.toDouble()) }
        val promise = BleFuture<BleMTU>()
        val active = mtuPromises.putIfAbsent(key, promise)
        if (active !== promise) return active
        if (!peripheral.requestMtu(mtu)) {
            mtuPromises.reject(key, BleOperationException("E_BLE_MTU_FAILED:Failed to queue BleMTU request"))
        }
        return promise
    }

    fun getBLEMTU(params: BleDeviceIdParams): BleFuture<BleMTU> = BleFuture.async {
        ensureConnectPermission()
        val peripheral = requireConnectedPeripheral(params.deviceId)
        BleMTU(peripheral.currentMtu.toDouble())
    }

    fun getConnectedBluetoothDevices(
        params: BleConnectedDevicesParams,
    ): BleFuture<BleConnectedDevicesResult> = BleFuture.async {
        ensureConnectPermission()
        val manager = requireManager()
        val services = params.services.map { it.toUuid() }.toSet()
        BleConnectedDevicesResult(
            manager.getConnectedPeripherals().filter { peripheral ->
                peripheral.services.any { it.uuid in services }
            }.map {
                BleConnectedDeviceItem(deviceId = it.address, name = it.name)
            }.toTypedArray(),
        )
    }

    fun onBluetoothDeviceFound(cb: (BleDevice) -> Unit): Double = deviceFoundListeners.add(cb)
    fun removeBluetoothDeviceFoundListener(subscriptionId: Double) {
        deviceFoundListeners.remove(subscriptionId)
    }

    fun onAdapterStateChange(cb: (BleAdapterState) -> Unit): Double = adapterStateListeners.add(cb)
    fun removeAdapterStateListener(subscriptionId: Double) {
        adapterStateListeners.remove(subscriptionId)
    }

    fun onConnectStateChange(cb: (BleConnectStateChange) -> Unit): Double = connectStateListeners.add(cb)
    fun removeConnectStateListener(subscriptionId: Double) {
        connectStateListeners.remove(subscriptionId)
    }

    fun onCharacteristicUpdate(cb: (BleCharacteristicValue) -> Unit): Double =
        characteristicListeners.add(cb)
    fun removeCharacteristicListener(subscriptionId: Double) {
        characteristicListeners.remove(subscriptionId)
    }

    fun onMtuChange(cb: (BleMTUChange) -> Unit): Double = mtuListeners.add(cb)
    fun removeMtuListener(subscriptionId: Double) {
        mtuListeners.remove(subscriptionId)
    }

    private fun requireManager(): BluetoothCentralManager = centralManager
        ?: throw BleOperationException("E_BLE_NOT_INITIALIZED:Call openBluetoothAdapter first")

    private fun requireReadyManager(): BluetoothCentralManager {
        val manager = requireManager()
        if (!manager.isBluetoothEnabled) {
            throw BleOperationException("E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is off")
        }
        return manager
    }

    private fun getPeripheral(deviceId: String): BluetoothPeripheral {
        val normalized = deviceId.normalizedDeviceId()
        if (!ANDROID_DEVICE_ID.matches(normalized)) {
            throw BleOperationException("E_BLE_INVALID_DATA:Invalid Android device id $deviceId")
        }
        return requireManager().getPeripheral(normalized)
    }

    private fun requireConnectedPeripheral(deviceId: String): BluetoothPeripheral {
        val peripheral = getPeripheral(deviceId)
        if (peripheral.getState() != ConnectionState.CONNECTED) {
            throw BleOperationException("E_BLE_NOT_CONNECTED:BleDevice ${peripheral.address} is not connected")
        }
        return peripheral
    }

    private fun requestedForceIndications(
        characteristic: BluetoothGattCharacteristic,
        type: String?,
    ): Boolean {
        val supportsNotify =
            characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0
        val supportsIndicate =
            characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
        return when (type) {
            null -> when {
                supportsNotify -> false
                supportsIndicate -> true
                else -> throw BleOperationException(
                    "E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported",
                )
            }
            "notification" -> {
                if (!supportsNotify) {
                    throw BleOperationException(
                        "E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported",
                    )
                }
                false
            }
            "indication" -> {
                if (!supportsIndicate) {
                    throw BleOperationException(
                        "E_BLE_PROPERTY_NOT_SUPPORTED:Requested notify type is unsupported",
                    )
                }
                true
            }
            else -> throw BleOperationException("E_BLE_INVALID_DATA:Unknown notify type $type")
        }
    }

    private fun requireCharacteristic(
        peripheral: BluetoothPeripheral,
        serviceId: String,
        characteristicId: String,
    ): BluetoothGattCharacteristic = peripheral.getCharacteristic(
        serviceId.toUuid(),
        characteristicId.toUuid(),
    ) ?: throw BleOperationException(
        "E_BLE_CHARACTERISTIC_NOT_FOUND:BleCharacteristic $characteristicId not found",
    )

    private fun characteristicKey(
        peripheral: BluetoothPeripheral,
        characteristic: BluetoothGattCharacteristic,
    ): String = listOf(
        peripheral.address.normalizedDeviceId(),
        characteristic.service.uuid.toNormalizedString(),
        characteristic.uuid.toNormalizedString(),
    ).joinToString("|")

    private fun rejectDeviceOperations(deviceId: String, error: Throwable) {
        val prefix = "${deviceId.normalizedDeviceId()}|"
        readPromises.rejectMatching({ it.startsWith(prefix) }, error)
        writePromises.rejectMatching({ it.startsWith(prefix) }, error)
        notifyPromises.rejectMatching({ it.startsWith(prefix) }, error)
        rssiPromises.reject(deviceId.normalizedDeviceId(), error)
        mtuPromises.reject(deviceId.normalizedDeviceId(), error)
        pairPromises.reject(deviceId.normalizedDeviceId(), error)
        pairingPins.remove(deviceId.normalizedDeviceId())
        notifyTargets.keys.removeAll { it.startsWith(prefix) }
    }

    private fun rejectAllOperations(error: Throwable) {
        connectPromises.clear(error)
        disconnectPromises.clear(error)
        rssiPromises.clear(error)
        readPromises.clear(error)
        writePromises.clear(error)
        notifyPromises.clear(error)
        mtuPromises.clear(error)
        pairPromises.clear(error)
        pairingPins.clear()
        notifyTargets.clear()
    }

    private fun emitAdapterState(available: Boolean) {
        adapterStateListeners.notify(
            BleAdapterState(
                available = available,
                discovering = centralManager?.isScanning == true,
            ),
        )
    }

    private fun emitConnectState(deviceId: String, connected: Boolean) {
        connectStateListeners.notify(BleConnectStateChange(deviceId = deviceId, connected = connected))
    }

    private fun ensureScanPermissions() = ensurePermissions(*getRequiredScanPermissions())
    private fun ensureConnectPermission() = ensurePermissions(*getRequiredConnectPermissions())

    private fun registerPairingReceiver() {
        if (pairingReceiverRegistered) return
        val filter = IntentFilter(BluetoothDevice.ACTION_PAIRING_REQUEST).apply {
            priority = 1000
        }
        ContextCompat.registerReceiver(
            context,
            pairingReceiver,
            filter,
            ContextCompat.RECEIVER_EXPORTED,
        )
        pairingReceiverRegistered = true
    }

    private fun unregisterPairingReceiver() {
        if (!pairingReceiverRegistered) return
        context.unregisterReceiver(pairingReceiver)
        pairingReceiverRegistered = false
    }

    private fun ensurePermissions(vararg permissions: String) {
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            throw BleOperationException("E_BLE_PERMISSION:${missing.joinToString(",")}")
        }
    }

    private fun getRequiredScanPermissions(): Array<String> {
        val targetSdk = context.applicationInfo.targetSdkVersion
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && targetSdk >= Build.VERSION_CODES.S -> arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            )
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && targetSdk >= Build.VERSION_CODES.Q -> arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
            )
            else -> arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }

    private fun getRequiredConnectPermissions(): Array<String> {
        val targetSdk = context.applicationInfo.targetSdkVersion
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && targetSdk >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            emptyArray()
        }
    }
}

internal class BleOperationException(message: String) : RuntimeException(message)

private fun String.normalizedDeviceId(): String = trim().uppercase(Locale.US)

private val ANDROID_DEVICE_ID = Regex("^[0-9A-F]{2}(:[0-9A-F]{2}){5}$")
