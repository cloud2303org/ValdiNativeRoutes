package io.valdiroutes.app

import android.content.Context
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.nativeroutes.nfc.NfcCore
import io.nativeroutes.nfc.NfcException
import io.nativeroutes.nfc.NfcFuture
import io.nativeroutes.nfc.NfcNdefWrite
import io.nativeroutes.nfc.NfcReaderCore
import io.nativeroutes.nfc.NfcSession
import io.nativeroutes.nfc.NfcTech
import io.nativeroutes.nfc.NfcTechHandle
import io.valdiroutes.pages.NfcHandle
import io.valdiroutes.pages.NfcHost
import io.valdiroutes.pages.NfcHostEvents

// The Valdi side of ExpoNativeRoutes' HybridNFC. Core types are io.nativeroutes.nfc.*, Valdi ones get a V prefix.
private typealias VAvailability = io.valdiroutes.pages.NfcAvailability
private typealias VRecord = io.valdiroutes.pages.NfcRecord
private typealias VTag = io.valdiroutes.pages.NfcTag

/**
 * `api`'s NFC on the app-owned NfcCore (nfc/NfcHost.ts). Capability only: nfc/adapter.ts owns the mini-program rules.
 * The core is installed at startup (as AppNFC does) so it tracks the activity lifecycle before the first one resumes;
 * reader mode always runs on the resumed activity. One session for the app's lifetime; its events go to the one
 * NfcHostEvents JS gives at install time.
 */
class NfcHostImpl(context: Context) : NfcHost {
    private val core: NfcReaderCore = NfcCore.install(context.applicationContext)
    private val session: NfcSession by lazy { core.createSession().also(::listen) }
    @Volatile private var events: NfcHostEvents? = null

    override fun setEvents(events: NfcHostEvents) {
        this.events = events
        session // Listen from now on, not from the first call.
    }

    private fun listen(session: NfcSession) {
        session.onDiscovered { tag ->
            events?.discovered?.invoke(
                VTag(tag.tagHandle, tag.id, tag.techs, tag.messages.map { VRecord(it.id, it.type, it.payload, it.tnf.toDouble()) }),
            )
        }
        session.onDiscoveryStateChange { events?.discoveryStateChange?.invoke(it) }
    }

    private fun message(error: Throwable) = error.message ?: error.toString()

    /**
     * Bad arguments throw before the core runs; they reject like core errors. A native Promise outlives the calling
     * page: JS hands native no function that the page's teardown could drop.
     */
    private fun <T, R> bridge(action: () -> NfcFuture<T>, map: (T) -> R): Promise<R> = ResolvablePromise<R>().also { promise ->
        try {
            action().observe { result ->
                result.fold({ promise.fulfillSuccess(map(it)) }, { promise.fulfillFailure(Exception(message(it))) })
            }
        } catch (error: Throwable) {
            promise.fulfillFailure(Exception(message(error)))
        }
    }

    private fun bridge(action: () -> NfcFuture<Unit>): Promise<Unit> = bridge(action) { }

    override fun getAvailability(): Promise<VAvailability> =
        bridge({ session.getAvailability() }) { VAvailability(it.supported, it.enabled, it.foreground, it.permissionGranted) }
    override fun startDiscovery(): Promise<Unit> = bridge { session.startDiscovery() }
    override fun stopDiscovery(): Promise<Unit> = bridge { session.stopDiscovery() }
    override fun connect(handle: NfcHandle): Promise<Unit> = bridge { session.connect(handle.toCore()) }
    override fun close(handle: NfcHandle): Promise<Unit> = bridge { session.close(handle.toCore()) }
    override fun isConnected(handle: NfcHandle): Promise<Boolean> =
        bridge({ session.isConnected(handle.toCore()) }) { it }
    override fun transceive(handle: NfcHandle, data: ByteArray): Promise<ByteArray> =
        bridge({ session.transceive(handle.toCore(), data) }) { it }
    override fun getMaxTransceiveLength(handle: NfcHandle): Promise<Double> =
        bridge({ session.getMaxTransceiveLength(handle.toCore()) }) { it.toDouble() }
    override fun setTimeout(handle: NfcHandle, timeout: Double): Promise<Unit> = bridge {
        if (!timeout.isFinite() || timeout % 1.0 != 0.0 || timeout < 1.0 || timeout > Int.MAX_VALUE.toDouble()) {
            throw NfcException(13011, "timeout must be a positive Android integer")
        }
        session.setTimeout(handle.toCore(), timeout.toInt())
    }
    override fun getAtqa(handle: NfcHandle): Promise<ByteArray> = bridge({ session.getAtqa(handle.toCore()) }) { it }
    override fun getSak(handle: NfcHandle): Promise<Double> =
        bridge({ session.getSak(handle.toCore()) }) { it.toDouble() }
    override fun getHistoricalBytes(handle: NfcHandle): Promise<ByteArray> =
        bridge({ session.getHistoricalBytes(handle.toCore()) }) { it }
    override fun writeNdefMessage(handle: NfcHandle, records: List<VRecord>, uris: List<String>, texts: List<String>): Promise<Unit> =
        bridge { session.writeNdefMessage(handle.toCore(), NfcNdefWrite(records.map { it.toCore() }, uris, texts)) }
}

private fun NfcHandle.toCore() = NfcTechHandle(tagHandle, NfcTech.entries.find { it.name == tech }
    ?: throw NfcException(13014, "Unknown NFC technology: $tech"))

private fun VRecord.toCore(): io.nativeroutes.nfc.NfcRecord {
    if (!tnf.isFinite() || tnf % 1.0 != 0.0 || tnf !in 0.0..7.0) throw NfcException(13011, "tnf must be from 0 to 7")
    return io.nativeroutes.nfc.NfcRecord(id, type, payload, tnf.toInt())
}
