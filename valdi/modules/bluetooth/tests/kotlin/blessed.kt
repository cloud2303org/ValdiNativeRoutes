// External OS/library boundary only. Production BleCore/BleEngine perform all scheduling.
package com.welie.blessed
import android.bluetooth.*
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Handler
import java.util.UUID

enum class BondState { BONDED, BONDING, NONE }
enum class ConnectionState { CONNECTED, CONNECTING, DISCONNECTED, DISCONNECTING }
enum class GattStatus { SUCCESS, FAILURE }
enum class HciStatus { SUCCESS, FAILURE }
enum class ScanMode { LOW_POWER, BALANCED, LOW_LATENCY }
enum class WriteType { WITH_RESPONSE, WITHOUT_RESPONSE }
open class BluetoothCentralManagerCallback {
    open fun onDiscovered(peripheral: BluetoothPeripheral, scanResult: ScanResult) {}
    open fun onConnected(peripheral: BluetoothPeripheral) {}
    open fun onDisconnected(peripheral: BluetoothPeripheral, status: HciStatus) {}
    open fun onConnectionFailed(peripheral: BluetoothPeripheral, status: HciStatus) {}
    open fun onBluetoothAdapterStateChanged(state: Int) {}
}
open class BluetoothPeripheralCallback {
    open fun onCharacteristicUpdate(peripheral: BluetoothPeripheral, value: ByteArray, characteristic: BluetoothGattCharacteristic, status: GattStatus) {}
    open fun onCharacteristicWrite(peripheral: BluetoothPeripheral, value: ByteArray, characteristic: BluetoothGattCharacteristic, status: GattStatus) {}
    open fun onNotificationStateUpdate(peripheral: BluetoothPeripheral, characteristic: BluetoothGattCharacteristic, status: GattStatus) {}
    open fun onReadRemoteRssi(peripheral: BluetoothPeripheral, rssi: Int, status: GattStatus) {}
    open fun onMtuChanged(peripheral: BluetoothPeripheral, mtu: Int, status: GattStatus) {}
    open fun onBondingSucceeded(peripheral: BluetoothPeripheral) {}
    open fun onBondingFailed(peripheral: BluetoothPeripheral) {}
    open fun onBondLost(peripheral: BluetoothPeripheral) {}
}
class BluetoothPeripheral(val address: String, private val onBond: () -> Unit = {}) {
    val name = "test"
    var connectionState = ConnectionState.DISCONNECTED
    var bondState = BondState.NONE
    var currentMtu = 23
    val services = mutableListOf<BluetoothGattService>()
    var callback: BluetoothPeripheralCallback? = BluetoothPeripheralCallback()
    var peripheralCallback: BluetoothPeripheralCallback
        get() = callback!!
        set(value) { callback = value }
    var acceptsBond = true
    fun createBond(): Boolean {
        if (!acceptsBond) return false
        onBond()
        bondState = BondState.BONDING
        return true
    }
    fun deferredBondTerminal(kind: String): () -> Unit {
        bondState = if (kind == "success") BondState.BONDED else BondState.NONE
        // Blessed reads the mutable callback field when the posted lambda runs.
        return {
            when (kind) {
                "success" -> callback?.onBondingSucceeded(this)
                "lost" -> callback?.onBondLost(this)
                else -> callback?.onBondingFailed(this)
            }
        }
    }
    var rssiReads = 0
    var notifyChanges = 0
    var notifying = false
    fun getState() = connectionState
    fun readRemoteRssi(): Boolean { rssiReads++; return true }
    fun getService(id: UUID) = services.find { it.uuid == id }
    fun getCharacteristic(service: UUID, characteristic: UUID) =
        getService(service)?.characteristics?.find { it.uuid == characteristic }
    fun isNotifying(characteristic: BluetoothGattCharacteristic) = notifying
    fun startNotify(characteristic: BluetoothGattCharacteristic, indications: Boolean): Boolean { notifyChanges++; return true }
    fun stopNotify(characteristic: BluetoothGattCharacteristic): Boolean { notifyChanges++; return true }
    fun getMaximumWriteValueLength(type: WriteType) = 20
    fun writeCharacteristic(characteristic: BluetoothGattCharacteristic, value: ByteArray, type: WriteType) = true
    fun readCharacteristic(characteristic: BluetoothGattCharacteristic) = true
    fun requestMtu(mtu: Int) = true
}
class BluetoothCentralManager(context: Context, val callback: BluetoothCentralManagerCallback, handler: Handler) {
    companion object { lateinit var last: BluetoothCentralManager }
    init { last = this }
    val devices = mutableMapOf<String, BluetoothPeripheral>()
    var isBluetoothEnabled = true
    var isScanning = false
    var connects = 0
    var bonds = 0
    val cancellations = mutableListOf<BluetoothPeripheral>()
    var scanStarts = 0
    var scanStops = 0
    fun getPeripheral(address: String) = devices.getOrPut(address) { BluetoothPeripheral(address) { bonds++ } }
    fun getConnectedPeripherals() = devices.values.filter { it.connectionState == ConnectionState.CONNECTED }
    fun connect(peripheral: BluetoothPeripheral, callback: BluetoothPeripheralCallback) {
        connects++; peripheral.connectionState = ConnectionState.CONNECTING; peripheral.callback = callback
    }
    fun cancelConnection(peripheral: BluetoothPeripheral) {
        cancellations.add(peripheral)
        peripheral.connectionState = ConnectionState.DISCONNECTING
    }
    fun close() {}
    fun stopScan() { isScanning = false; scanStops++ }
    fun setScanMode(mode: ScanMode) {}
    fun scanForPeripherals() { isScanning = true; scanStarts++ }
    fun scanForPeripheralsWithServices(services: Set<UUID>) = scanForPeripherals()
    fun scanForPeripheralsWithNames(names: Set<String>) = scanForPeripherals()
    fun scanForPeripheralsWithAddresses(addresses: Set<String>) = scanForPeripherals()
    fun createBond(peripheral: BluetoothPeripheral, callback: BluetoothPeripheralCallback) {
        if (peripheral.connectionState == ConnectionState.CONNECTED ||
            peripheral.connectionState == ConnectionState.CONNECTING) return
        peripheral.peripheralCallback = callback
        peripheral.createBond()
    }
    fun connected(peripheral: BluetoothPeripheral) {
        peripheral.connectionState = ConnectionState.CONNECTED; callback.onConnected(peripheral)
    }
    fun disconnected(peripheral: BluetoothPeripheral) {
        peripheral.connectionState = ConnectionState.DISCONNECTED; callback.onDisconnected(peripheral, HciStatus.SUCCESS)
    }
    // Blessed removes the old object from its address cache before posting the
    // central callback. A reconnect in that interval obtains a distinct object.
    fun deferredDisconnect(peripheral: BluetoothPeripheral): () -> Unit {
        peripheral.connectionState = ConnectionState.DISCONNECTED
        if (devices[peripheral.address] === peripheral) devices.remove(peripheral.address)
        return { callback.onDisconnected(peripheral, HciStatus.SUCCESS) }
    }
    fun poweredOff() {
        isBluetoothEnabled = false; callback.onBluetoothAdapterStateChanged(10)
    }
}
