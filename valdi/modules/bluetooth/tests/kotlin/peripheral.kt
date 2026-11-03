// Peripheral execution/backpressure is outside this central-queue test's scope.
package io.nativeroutes.ble
import android.content.Context

internal class BlePeripheralEngine(context: Context, changed: (Boolean) -> Unit) {
    var isOpen = false
    val isAvailable get() = isOpen
    fun open() { isOpen = true }
    fun close() { isOpen = false }
    fun release(owner: Any) {}
    private fun unit() = BleFuture.async {}
    fun create(owner: Any) = BleFuture.async { BlePeripheralServerInfo("test") }
    fun addService(owner: Any, params: BlePeripheralServiceParams) = unit()
    fun removeService(owner: Any, params: BlePeripheralRemoveServiceParams) = unit()
    fun startAdvertising(owner: Any, params: BlePeripheralAdvertisingParams) = unit()
    fun stopAdvertising(owner: Any, id: String) = unit()
    fun write(owner: Any, params: BlePeripheralWriteParams) = unit()
    fun close(owner: Any, id: String) = unit()
    fun onRead(owner: Any, cb: (BlePeripheralReadRequest) -> Unit) = 0.0
    fun onWrite(owner: Any, cb: (BlePeripheralWriteRequest) -> Unit) = 0.0
    fun onSubscribed(owner: Any, cb: (BlePeripheralSubscriptionEvent) -> Unit) = 0.0
    fun onUnsubscribed(owner: Any, cb: (BlePeripheralSubscriptionEvent) -> Unit) = 0.0
    fun onConnection(owner: Any, cb: (BlePeripheralConnectionState) -> Unit) = 0.0
    fun removeRead(id: Double) {}
    fun removeWrite(id: Double) {}
    fun removeSubscribed(id: Double) {}
    fun removeUnsubscribed(id: Double) {}
    fun removeConnection(id: Double) {}
}
