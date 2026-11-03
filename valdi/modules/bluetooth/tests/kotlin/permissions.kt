package android.content.pm

class ApplicationInfo { val targetSdkVersion = 36 }
class PackageManager {
    fun hasSystemFeature(feature: String) = true
    companion object {
        const val PERMISSION_GRANTED = 0
        const val FEATURE_BLUETOOTH_LE = "ble"
    }
}
