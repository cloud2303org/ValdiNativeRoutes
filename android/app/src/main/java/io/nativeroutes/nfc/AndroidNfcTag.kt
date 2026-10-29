// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/AndroidNfcTag.kt).
package io.nativeroutes.nfc

import android.nfc.FormatException
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.Tag
import android.nfc.TagLostException
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import android.nfc.tech.TagTechnology
import java.io.IOException

/** Cached NDEF discovery bytes are preserved; no vendor provisioning protocol is inferred. */
internal class AndroidNfcTag(private val tag: Tag) : NfcPlatformTag {
    override val id = tag.id.copyOf()
    override val techs = tag.techList.toList()
    override val messages: List<NfcRecord> = runCatching {
        Ndef.get(tag)?.cachedNdefMessage?.records?.map {
            NfcRecord(it.id.copyOf(), it.type.copyOf(), it.payload.copyOf(), it.tnf.toInt())
        } ?: emptyList()
    }.getOrDefault(emptyList())

    override fun technology(tech: NfcTech): NfcTechnology? {
        val value: TagTechnology = when (tech) {
            NfcTech.NfcA -> NfcA.get(tag)
            NfcTech.NfcB -> NfcB.get(tag)
            NfcTech.NfcF -> NfcF.get(tag)
            NfcTech.NfcV -> NfcV.get(tag)
            NfcTech.IsoDep -> IsoDep.get(tag)
            NfcTech.MifareClassic -> MifareClassic.get(tag)
            NfcTech.MifareUltralight -> MifareUltralight.get(tag)
            NfcTech.Ndef -> Ndef.get(tag)
        } ?: return null
        return AndroidNfcTechnology(tech, value)
    }
}

internal class AndroidNfcTechnology(override val name: NfcTech, private val technology: TagTechnology) : NfcTechnology {
    private fun <T> call(fallback: Int = 13017, action: () -> T): T {
        try { return action() }
        catch (error: NfcException) { throw error }
        catch (error: TagLostException) { throw NfcException(13013, "NFC tag left the reader field", error) }
        catch (error: SecurityException) { throw NfcException(13019, "NFC access is not authorized", error) }
        catch (error: FormatException) { throw NfcException(13012, "Malformed NDEF message", error) }
        catch (error: IllegalArgumentException) { throw NfcException(13011, "Invalid NFC argument", error) }
        catch (error: IOException) { throw NfcException(fallback, "NFC I/O failed", error) }
        catch (error: Throwable) { throw NfcException(fallback, "NFC platform operation failed", error) }
    }

    override val isConnected: Boolean get() = call { technology.isConnected }
    override fun connect() = call(13016) { technology.connect() }
    override fun close() = call { technology.close() }
    override val maxTransceiveLength: Int get() = call {
        when (val tech = technology) {
            is NfcA -> tech.maxTransceiveLength
            is NfcB -> tech.maxTransceiveLength
            is NfcF -> tech.maxTransceiveLength
            is NfcV -> tech.maxTransceiveLength
            is IsoDep -> tech.maxTransceiveLength
            is MifareClassic -> tech.maxTransceiveLength
            is MifareUltralight -> tech.maxTransceiveLength
            else -> throw NfcException(13024, "${name.name} has no transparent transceive")
        }
    }
    override fun transceive(data: ByteArray): ByteArray = call {
        when (val tech = technology) {
            is NfcA -> tech.transceive(data)
            is NfcB -> tech.transceive(data)
            is NfcF -> tech.transceive(data)
            is NfcV -> tech.transceive(data)
            is IsoDep -> tech.transceive(data)
            is MifareClassic -> tech.transceive(data)
            is MifareUltralight -> tech.transceive(data)
            else -> throw NfcException(13024, "${name.name} has no transparent transceive")
        }
    }
    override fun setTimeout(timeout: Int) = call {
        when (val tech = technology) {
            is NfcA -> tech.timeout = timeout
            is NfcF -> tech.timeout = timeout
            is IsoDep -> tech.timeout = timeout
            is MifareClassic -> tech.timeout = timeout
            is MifareUltralight -> tech.timeout = timeout
            else -> throw NfcException(13024, "${name.name} does not expose an Android timeout setter")
        }
        Unit
    }
    override fun atqa(): ByteArray = call {
        (technology as? NfcA)?.atqa?.copyOf() ?: throw NfcException(13024, "ATQA requires NfcA")
    }
    override fun sak(): Int = call {
        (technology as? NfcA)?.sak?.toInt()?.and(0xffff) ?: throw NfcException(13024, "SAK requires NfcA")
    }
    override fun historicalBytes(): ByteArray = call {
        val iso = technology as? IsoDep ?: throw NfcException(13024, "Historical bytes require IsoDep")
        // Android returns null for ISO-DEP over NFC-B; WeChat's result is an ArrayBuffer.
        iso.historicalBytes?.copyOf() ?: ByteArray(0)
    }
    override fun writeNdef(message: NfcNdefWrite) = call {
        val ndef = technology as? Ndef ?: throw NfcException(13014, "NDEF writing requires Ndef")
        if (!ndef.isWritable) throw NfcException(13024, "NDEF tag is read-only")
        val records = try {
            message.uris.map { NdefRecord.createUri(it) } +
                message.texts.map { NdefRecord.createTextRecord("en", it) } +
                message.records.map { NdefRecord(it.tnf.toShort(), it.type.copyOf(), it.id.copyOf(), it.payload.copyOf()) }
        } catch (error: IllegalArgumentException) {
            throw NfcException(13012, "NDEF records could not be parsed", error)
        }
        val output = try { NdefMessage(records.toTypedArray()) }
        catch (error: IllegalArgumentException) { throw NfcException(13012, "NDEF message could not be parsed", error) }
        if (output.toByteArray().size > ndef.maxSize) throw NfcException(13011, "NDEF message exceeds tag capacity")
        ndef.writeNdefMessage(output)
        Unit
    }
}
