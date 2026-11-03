package android.bluetooth.le
import android.os.ParcelUuid
import android.util.SparseArray

class ScanRecord {
    val manufacturerSpecificData: SparseArray<ByteArray>? = null
    val serviceData: Map<ParcelUuid, ByteArray?>? = null
    val serviceUuids: List<ParcelUuid>? = null
    val deviceName: String? = null
}
class ScanResult {
    val scanRecord: ScanRecord? = null
    val rssi = -50
    val isConnectable = true
}
