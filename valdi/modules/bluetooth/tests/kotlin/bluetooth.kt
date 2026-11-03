package android.bluetooth
import java.util.UUID

object BluetoothAdapter { const val STATE_ON = 12 }
class BluetoothDevice(val address: String = "") {
    val submittedPins = mutableListOf<ByteArray>()
    fun setPin(pin: ByteArray): Boolean { submittedPins.add(pin.copyOf()); return true }
    companion object {
        const val ACTION_PAIRING_REQUEST = "pair"
        const val EXTRA_DEVICE = "device"
    }
}
class BluetoothGattService(val uuid: UUID) {
    val type = 0
    val characteristics = mutableListOf<BluetoothGattCharacteristic>()
    companion object { const val SERVICE_TYPE_PRIMARY = 0 }
}
class BluetoothGattCharacteristic(val uuid: UUID, val service: BluetoothGattService) {
    val properties = PROPERTY_READ or PROPERTY_WRITE or PROPERTY_NOTIFY
    companion object {
        const val PROPERTY_READ = 2
        const val PROPERTY_WRITE = 8
        const val PROPERTY_WRITE_NO_RESPONSE = 4
        const val PROPERTY_NOTIFY = 16
        const val PROPERTY_INDICATE = 32
    }
}
