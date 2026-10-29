// Copied from ExpoNativeRoutes android/native/wifi (io/nativeroutes/wifi/WifiModels.kt).
package io.nativeroutes.wifi

/** Typed native host contracts; these have no dependency on React Native or Nitro. */
data class WifiNetworkInfo(
    val SSID: String,
    val BSSID: String? = null,
    val secure: Boolean? = null,
    val signalStrength: Double? = null,
    val frequency: Double? = null,
)
data class WifiConnectionParams(
    val SSID: String,
    val BSSID: String = "",
    val password: String = "",
    val maunal: Boolean = false,
    val partialInfo: Boolean = false,
) {
    override fun toString(): String = "WifiConnectionParams(SSID=$SSID, BSSID=$BSSID, password=<redacted>, maunal=$maunal, partialInfo=$partialInfo)"
}
data class WifiCredentialData(val SSID: String, val BSSID: String? = null, val password: String = "") {
    override fun toString(): String = "WifiCredentialData(SSID=$SSID, BSSID=$BSSID, password=<redacted>)"
}
data class WifiLocationPermissionState(val status: String, val canAskAgain: Boolean)

class WifiException(val nativeCode: String, reason: String) : IllegalStateException("$nativeCode:$reason")
internal fun wifiError(code: String, reason: String) = WifiException(code, reason)
