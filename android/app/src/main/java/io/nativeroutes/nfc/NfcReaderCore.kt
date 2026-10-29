// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/NfcReaderCore.kt).
package io.nativeroutes.nfc

import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicLong

/**
 * One application reader owner and one physical I/O queue across native and JS sessions.
 * Control is serialized on the main dispatcher. Blocking tag calls run only on io.
 * cleanup closes a captured old connection off-thread to abort blocking connect/transceive.
 */
class NfcReaderCore internal constructor(
    private val platform: NfcReaderPlatform,
    private val control: Executor,
    private val io: Executor,
    private val cleanup: Executor
) {
    private val sessionIds = AtomicLong(0)
    private var owner: NfcSession? = null
    private var generation = 0L
    private var tag: TagContext? = null
    private val jobs = ArrayDeque<IoJob<*>>()
    private var active: IoJob<*>? = null
    private var closing = 0

    fun createSession(): NfcSession = NfcSession(this, sessionIds.incrementAndGet())

    private class TagContext(val owner: NfcSession, val generation: Long, val platformTag: NfcPlatformTag) {
        val handle = "${owner.id}:$generation"
        @Volatile var valid = true
        @Volatile var operationEpoch = 0L
        @Volatile var connection: NfcTechnology? = null
        val technologies = ConcurrentHashMap<NfcTech, NfcTechnology>()
    }

    private class IoJob<T>(
        val session: NfcSession,
        val context: TagContext,
        val tech: NfcTech,
        val operation: String,
        val epoch: Long,
        val result: NfcFuture<T>,
        val action: (IoJob<T>) -> T
    ) {
        @Volatile var cancelled: Throwable? = null
        fun check() {
            cancelled?.let { throw it }
            if (session.released) throw releasedError()
            if (!context.valid) throw NfcException(13013, "Tag handle is stale")
            if (context.operationEpoch != epoch) throw NfcException(13023, "Technology was closed")
        }
        fun cancel(error: Throwable) { cancelled = error; result.reject(error) }
        fun technology(): NfcTechnology {
            check()
            val technology = context.technologies[tech] ?: run {
                context.platformTag.technology(tech)?.also { context.technologies[tech] = it }
                    ?: throw NfcException(13015, "Tag/hardware does not provide ${tech.name}")
            }
            check()
            return technology
        }
        fun connected(): NfcTechnology {
            check()
            return context.connection?.takeIf { it.name == tech && it.isConnected }
                ?: throw NfcException(13023, "${tech.name} is not connected")
        }
    }

    private fun <T> onControl(session: NfcSession, action: () -> T): NfcFuture<T> {
        val result = NfcFuture<T>()
        control.execute {
            runCatching {
                if (session.released) throw releasedError()
                action()
            }.fold(result::resolve, result::reject)
        }
        return result
    }

    internal fun availability(session: NfcSession) = onControl(session) { platform.availability() }

    internal fun startDiscovery(session: NfcSession) = onControl(session) {
        val state = platform.availability()
        if (!state.supported) throw NfcException(13000, "Device has no NFC reader")
        if (!state.enabled) throw NfcException(13001, "System NFC switch is off")
        if (!state.permissionGranted) throw NfcException(13019, "android.permission.NFC is not declared/granted")
        if (!state.foreground) throw NfcException(13017, "A resumed foreground Activity is required")
        if (owner != null) throw NfcException(13021, "Another reader session is already active")
        generation += 1
        val readerGeneration = generation
        owner = session
        try {
            platform.startReader(
                { found -> control.execute { discovered(session, readerGeneration, found) } },
                { error -> control.execute { if (owner === session && generation == readerGeneration) endDiscovery(error) } }
            )
        } catch (error: Throwable) {
            owner = null
            generation += 1
            runCatching { platform.stopReader() }
            throw error
        }
        session.emitState(true)
        Unit
    }

    internal fun stopDiscovery(session: NfcSession) = onControl(session) {
        if (owner !== session) throw NfcException(13018, "This session has not started NFC discovery")
        endDiscovery(NfcException(13013, "Discovery stopped"))
        Unit
    }

    private fun endDiscovery(error: Throwable) {
        val previous = owner
        owner = null
        generation += 1
        invalidateTag(error)
        runCatching { platform.stopReader() }
        previous?.emitState(false)
    }

    private fun discovered(session: NfcSession, readerGeneration: Long, discovered: NfcPlatformTag) {
        if (session.released || owner !== session || readerGeneration != generation) return
        invalidateTag(NfcException(13013, "A newer tag replaced the previous handle"))
        // Each detection gets a unique handle even when two tags have the same UID.
        val context = TagContext(session, session.nextTagGeneration(), discovered)
        tag = context
        val event = NfcTagInfo(context.handle, discovered.id.copyOf(), discovered.techs.toList(), discovered.messages.map { it.snapshot() })
        session.emitDiscovered(event)
        pump()
    }

    private fun context(session: NfcSession, handle: NfcTechHandle): TagContext {
        if (session.released) throw releasedError()
        val current = tag
        if (owner !== session || current == null || !current.valid || current.owner !== session || current.handle != handle.tagHandle) {
            throw NfcException(13013, "Tag was not discovered by this session or its handle is stale")
        }
        if (handle.tech.androidName !in current.platformTag.techs) {
            throw NfcException(13015, "Tag does not advertise ${handle.tech.name}")
        }
        return current
    }

    private fun <T> enqueue(session: NfcSession, handle: NfcTechHandle, operation: String, action: (IoJob<T>) -> T): NfcFuture<T> {
        val result = NfcFuture<T>()
        control.execute {
            runCatching {
                val context = context(session, handle)
                jobs.add(IoJob(session, context, handle.tech, operation, context.operationEpoch, result, action))
                pump()
            }.onFailure(result::reject)
        }
        return result
    }

    private fun pump() {
        if (active != null || closing != 0) return
        while (jobs.isNotEmpty()) {
            val job = jobs.removeFirst()
            try { job.check() } catch (error: Throwable) { job.cancel(error); continue }
            active = job
            execute(job)
            return
        }
    }

    private fun <T> execute(job: IoJob<T>) {
        io.execute {
            val outcome = runCatching { job.check(); job.action(job).also { job.check() } }
            control.execute {
                val error = outcome.exceptionOrNull()
                if (error is NfcException && error.errCode == 13013 && tag === job.context) invalidateTag(error)
                if (job.cancelled == null) outcome.fold(job.result::resolve, job.result::reject)
                if (active === job) active = null
                pump()
            }
        }
    }

    private fun cancelJobs(context: TagContext, error: Throwable) {
        active?.takeIf { it.context === context }?.cancel(error)
        val pending = jobs.filter { it.context === context }
        jobs.removeAll(pending.toSet())
        pending.forEach { it.cancel(error) }
    }

    private fun closeAsync(connection: NfcTechnology?, done: ((Result<Unit>) -> Unit)? = null) {
        if (connection == null) { done?.invoke(Result.success(Unit)); return }
        closing += 1
        cleanup.execute {
            val outcome = runCatching { connection.close() }
            control.execute {
                closing -= 1
                done?.invoke(outcome)
                pump()
            }
        }
    }

    private fun invalidateTag(error: Throwable) {
        val previous = tag ?: return
        tag = null
        previous.valid = false
        cancelJobs(previous, error)
        val connection = previous.connection
        previous.connection = null
        closeAsync(connection)
    }

    internal fun connect(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "connect") { job ->
        if (job.context.connection != null) throw NfcException(13022, "A technology on this tag is already connected")
        val connection = job.technology()
        job.context.connection = connection
        try {
            job.check()
            connection.connect()
            job.check()
        } catch (error: Throwable) {
            if (job.context.connection === connection) job.context.connection = null
            runCatching { connection.close() }
            throw if (error is NfcException || error.message?.startsWith("E_NFC_SESSION_RELEASED:") == true) error
                else NfcException(13016, "Could not connect ${handle.tech.name}", error)
        }
        Unit
    }

    /** Close bypasses a blocked I/O call so it can cancel connect/transceive. */
    internal fun close(session: NfcSession, handle: NfcTechHandle): NfcFuture<Unit> {
        val result = NfcFuture<Unit>()
        control.execute {
            runCatching {
                val context = context(session, handle)
                val pendingConnect = (active?.let { it.context === context && it.tech == handle.tech && it.operation == "connect" } == true) ||
                    jobs.any { it.context === context && it.tech == handle.tech && it.operation == "connect" }
                if (context.connection?.name != handle.tech && !pendingConnect) throw NfcException(13023, "${handle.tech.name} is not connected")
                context.operationEpoch += 1
                cancelJobs(context, NfcException(13023, "Technology was closed"))
                val connection = context.connection
                context.connection = null
                closeAsync(connection) { it.fold(result::resolve, result::reject) }
            }.onFailure(result::reject)
        }
        return result
    }

    internal fun isConnected(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "isConnected") { job ->
        job.context.connection?.let { it.name == handle.tech && it.isConnected } == true
    }

    internal fun transceive(session: NfcSession, handle: NfcTechHandle, input: ByteArray): NfcFuture<ByteArray> {
        val data = input.copyOf()
        return enqueue(session, handle, "transceive") { job ->
            val connection = job.connected()
            if (data.isEmpty() || data.size > connection.maxTransceiveLength) throw NfcException(13011, "Command is empty or exceeds maxTransceiveLength")
            connection.transceive(data).copyOf()
        }
    }

    internal fun maxTransceiveLength(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "getMaxTransceiveLength") { it.technology().maxTransceiveLength }
    internal fun setTimeout(session: NfcSession, handle: NfcTechHandle, timeout: Int) = enqueue(session, handle, "setTimeout") {
        if (timeout <= 0) throw NfcException(13011, "timeout must be positive milliseconds")
        it.technology().setTimeout(timeout)
    }
    internal fun atqa(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "getAtqa") { it.technology().atqa().copyOf() }
    internal fun sak(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "getSak") { it.technology().sak() }
    internal fun historicalBytes(session: NfcSession, handle: NfcTechHandle) = enqueue(session, handle, "getHistoricalBytes") { it.technology().historicalBytes().copyOf() }
    internal fun writeNdef(session: NfcSession, handle: NfcTechHandle, input: NfcNdefWrite): NfcFuture<Unit> {
        val message = input.snapshot()
        return enqueue(session, handle, "writeNdefMessage") { job ->
            if (handle.tech != NfcTech.Ndef) throw NfcException(13014, "NDEF writing requires Ndef")
            if (message.records.isEmpty() && message.uris.isEmpty() && message.texts.isEmpty()) throw NfcException(13011, "NDEF message cannot be empty")
            if (message.records.any { it.tnf !in 0..7 }) throw NfcException(13011, "TNF must be from 0 to 7")
            job.connected().writeNdef(message)
        }
    }

    internal fun release(session: NfcSession) {
        control.execute {
            if (owner === session) endDiscovery(releasedError())
            val pending = jobs.filter { it.session === session }
            jobs.removeAll(pending.toSet())
            pending.forEach { it.cancel(releasedError()) }
            active?.takeIf { it.session === session }?.cancel(releasedError())
            pump()
        }
    }

    companion object {
        private fun releasedError() = IllegalStateException("E_NFC_SESSION_RELEASED:Session released")
    }
}

/** Public native facade. It can be called from Compose/Java/Kotlin without a JS runtime. */
class NfcSession internal constructor(private val core: NfcReaderCore, internal val id: Long) {
    @Volatile internal var released = false
        private set
    private val generations = AtomicLong(0)
    private val listenerIds = AtomicLong(0)
    private val listeners = mutableMapOf<Long, (NfcTagInfo) -> Unit>()
    private val stateListeners = mutableMapOf<Long, (Boolean) -> Unit>()

    internal fun nextTagGeneration() = generations.incrementAndGet()
    fun getAvailability(): NfcFuture<NfcAvailability> = core.availability(this)
    fun startDiscovery(): NfcFuture<Unit> = core.startDiscovery(this)
    fun stopDiscovery(): NfcFuture<Unit> = core.stopDiscovery(this)
    fun connect(handle: NfcTechHandle): NfcFuture<Unit> = core.connect(this, handle)
    fun close(handle: NfcTechHandle): NfcFuture<Unit> = core.close(this, handle)
    fun isConnected(handle: NfcTechHandle): NfcFuture<Boolean> = core.isConnected(this, handle)
    fun transceive(handle: NfcTechHandle, data: ByteArray): NfcFuture<ByteArray> = core.transceive(this, handle, data)
    fun getMaxTransceiveLength(handle: NfcTechHandle): NfcFuture<Int> = core.maxTransceiveLength(this, handle)
    fun setTimeout(handle: NfcTechHandle, timeout: Int): NfcFuture<Unit> = core.setTimeout(this, handle, timeout)
    fun getAtqa(handle: NfcTechHandle): NfcFuture<ByteArray> = core.atqa(this, handle)
    fun getSak(handle: NfcTechHandle): NfcFuture<Int> = core.sak(this, handle)
    fun getHistoricalBytes(handle: NfcTechHandle): NfcFuture<ByteArray> = core.historicalBytes(this, handle)
    fun writeNdefMessage(handle: NfcTechHandle, message: NfcNdefWrite): NfcFuture<Unit> = core.writeNdef(this, handle, message)

    fun onDiscovered(callback: (NfcTagInfo) -> Unit): Long = synchronized(listeners) {
        check(!released) { "E_NFC_SESSION_RELEASED:Session released" }
        listenerIds.incrementAndGet().also { listeners[it] = callback }
    }
    fun removeDiscoveredListener(id: Long) { synchronized(listeners) { listeners.remove(id) } }
    fun onNdefMessage(callback: (NfcNdefMessage) -> Unit): Long = onDiscovered { tag ->
        if (NfcTech.Ndef.androidName in tag.techs) callback(NfcNdefMessage(tag.id, tag.messages))
    }
    fun removeNdefMessageListener(id: Long) = removeDiscoveredListener(id)
    fun onDiscoveryStateChange(callback: (Boolean) -> Unit): Long = synchronized(listeners) {
        check(!released) { "E_NFC_SESSION_RELEASED:Session released" }
        listenerIds.incrementAndGet().also { stateListeners[it] = callback }
    }
    fun removeDiscoveryStateListener(id: Long) { synchronized(listeners) { stateListeners.remove(id) } }

    internal fun emitDiscovered(event: NfcTagInfo) {
        val snapshot = synchronized(listeners) { listeners.values.toList() }
        snapshot.forEach { callback -> if (!released) runCatching { callback(event.snapshot()) } }
    }
    internal fun emitState(discovering: Boolean) {
        val snapshot = synchronized(listeners) { stateListeners.values.toList() }
        snapshot.forEach { callback -> if (!released) runCatching { callback(discovering) } }
    }
    fun release() {
        synchronized(listeners) {
            if (released) return
            released = true
            listeners.clear()
            stateListeners.clear()
        }
        core.release(this)
    }
}
