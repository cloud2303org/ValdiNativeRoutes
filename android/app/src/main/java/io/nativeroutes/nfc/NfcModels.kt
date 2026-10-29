// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/NfcModels.kt).
package io.nativeroutes.nfc

/** Public native models contain no React Native, Nitro, navigation or example types. */
enum class NfcTech(val androidName: String) {
    NfcA("android.nfc.tech.NfcA"),
    NfcB("android.nfc.tech.NfcB"),
    NfcF("android.nfc.tech.NfcF"),
    NfcV("android.nfc.tech.NfcV"),
    IsoDep("android.nfc.tech.IsoDep"),
    MifareClassic("android.nfc.tech.MifareClassic"),
    MifareUltralight("android.nfc.tech.MifareUltralight"),
    Ndef("android.nfc.tech.Ndef")
}

data class NfcAvailability(
    val supported: Boolean,
    val enabled: Boolean,
    val foreground: Boolean,
    val permissionGranted: Boolean
)

data class NfcRecord(val id: ByteArray, val type: ByteArray, val payload: ByteArray, val tnf: Int = 1) {
    internal fun snapshot() = NfcRecord(id.copyOf(), type.copyOf(), payload.copyOf(), tnf)
}

data class NfcTagInfo(
    val tagHandle: String,
    val id: ByteArray,
    val techs: List<String>,
    val messages: List<NfcRecord>
) {
    fun technology(tech: NfcTech) = NfcTechHandle(tagHandle, tech)
    internal fun snapshot() = NfcTagInfo(tagHandle, id.copyOf(), techs.toList(), messages.map { it.snapshot() })
}

data class NfcTechHandle(val tagHandle: String, val tech: NfcTech)
data class NfcNdefMessage(val id: ByteArray, val messages: List<NfcRecord>)
data class NfcNdefWrite(val records: List<NfcRecord> = emptyList(), val uris: List<String> = emptyList(), val texts: List<String> = emptyList()) {
    internal fun snapshot() = NfcNdefWrite(records.map { it.snapshot() }, uris.toList(), texts.toList())
}

class NfcException(val errCode: Int, detail: String, cause: Throwable? = null) :
    Exception("E_NFC_$errCode:$detail", cause)

/** Platform interface used by the native scheduler and deterministic behavioral tests. */
internal interface NfcReaderPlatform {
    fun availability(): NfcAvailability
    fun startReader(onTag: (NfcPlatformTag) -> Unit, onInvalidated: (NfcException) -> Unit)
    fun stopReader()
}

internal interface NfcPlatformTag {
    val id: ByteArray
    val techs: List<String>
    val messages: List<NfcRecord>
    fun technology(tech: NfcTech): NfcTechnology?
}

internal interface NfcTechnology {
    val name: NfcTech
    val isConnected: Boolean
    fun connect()
    fun close()
    val maxTransceiveLength: Int get() = throw NfcException(13024, "${name.name} has no transparent transceive")
    fun transceive(data: ByteArray): ByteArray = throw NfcException(13024, "${name.name} has no transparent transceive")
    fun setTimeout(timeout: Int): Unit = throw NfcException(13024, "${name.name} has no Android timeout setter")
    fun atqa(): ByteArray = throw NfcException(13024, "ATQA requires NfcA")
    fun sak(): Int = throw NfcException(13024, "SAK requires NfcA")
    fun historicalBytes(): ByteArray = throw NfcException(13024, "Historical bytes require IsoDep")
    fun writeNdef(message: NfcNdefWrite): Unit = throw NfcException(13024, "NDEF writing requires Ndef")
}
