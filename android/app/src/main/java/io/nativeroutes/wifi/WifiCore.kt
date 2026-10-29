// Copied from ExpoNativeRoutes android/native/wifi (io/nativeroutes/wifi/WifiCore.kt).
package io.nativeroutes.wifi

import android.content.Context
import java.util.concurrent.atomic.AtomicLong

/** One app-owned radio driver. Each caller gets an independently releasable session. */
class WifiCore private constructor(context: Context) {
    internal val engine = WifiEngine(context.applicationContext)
    private val nextSession = AtomicLong(0)
    fun createSession(): WifiSession = WifiSession(this, nextSession.incrementAndGet())
    companion object {
        @Volatile private var installed: WifiCore? = null
        @JvmStatic @Synchronized fun install(context: Context): WifiCore = installed ?: WifiCore(context).also { installed = it }
    }
}

class WifiSession internal constructor(private val core: WifiCore, internal val id: Long) : AutoCloseable {
    @Volatile private var released = false
    private var generation = 0L
    private var nextListener = 0L
    private val pending = mutableMapOf<Long, () -> Unit>()
    private var nextPending = 0L
    private val connected = mutableMapOf<Double, (WifiNetworkInfo) -> Unit>()
    private val lists = mutableMapOf<Double, (List<WifiNetworkInfo>) -> Unit>()

    private fun <T> operation(action: () -> WifiFuture<T>): WifiFuture<T> {
        val result = WifiFuture<T>()
        val token: Long
        val currentGeneration: Long
        synchronized(this) {
            if (released) { result.reject(wifiError("E_WIFI_SESSION_RELEASED", "Session released")); return result }
            currentGeneration = generation
            token = ++nextPending
            pending[token] = { result.reject(wifiError("E_WIFI_SESSION_RELEASED", "Session released or stopped")) }
        }
        WifiFuture.onMain {
            if (released || synchronized(this) { generation != currentGeneration }) return@onMain
            runCatching(action).fold({ input -> input.observe { value ->
                val active = synchronized(this) { pending.remove(token) != null && !released && generation == currentGeneration }
                if (active) value.fold(result::resolve, result::reject)
            } }, { error -> synchronized(this) { pending.remove(token) }; result.reject(error) })
        }
        return result
    }
    fun startWifi(): WifiFuture<Unit> = operation { core.engine.start(this) }
    fun stopWifi(): WifiFuture<Unit> {
        invalidatePending()
        return operation { core.engine.stop(this); WifiFuture.value { Unit } }
    }
    fun connectWifi(params: WifiConnectionParams): WifiFuture<WifiNetworkInfo> = operation { core.engine.connect(this, params) }
    fun getWifiList(): WifiFuture<Unit> = operation { core.engine.scan(this) }
    fun getConnectedWifi(partialInfo: Boolean = false): WifiFuture<WifiNetworkInfo> = operation { core.engine.connectedWifi(this, partialInfo) }
    fun setWifiList(@Suppress("UNUSED_PARAMETER") wifiList: List<WifiCredentialData>): WifiFuture<Unit> = operation {
        WifiFuture.value { core.engine.requireStarted(this); throw wifiError("E_WIFI_SET_WIFI_LIST_UNSUPPORTED", "WeChat iOS Wi-Fi picker is unavailable in an ordinary native app") }
    }
    fun getLocationPermissionState(): WifiFuture<WifiLocationPermissionState> = operation { WifiFuture.value { core.engine.locationPermissionState() } }
    fun requestLocationPermission(): WifiFuture<WifiLocationPermissionState> = operation {
        WifiFuture.value { throw wifiError("E_WIFI_SYSTEM_NOT_SUPPORTED", "A native Android host must request Wi-Fi permissions through its Activity") }
    }
    fun onWifiConnected(callback: (WifiNetworkInfo) -> Unit): Double = synchronized(this) {
        check(!released) { "E_WIFI_SESSION_RELEASED:Session released" }
        (++nextListener).toDouble().also { connected[it] = callback }
    }
    fun removeWifiConnectedListener(subscriptionId: Double) { synchronized(this) { connected.remove(subscriptionId) } }
    fun onGetWifiList(callback: (List<WifiNetworkInfo>) -> Unit): Double = synchronized(this) {
        check(!released) { "E_WIFI_SESSION_RELEASED:Session released" }
        (++nextListener).toDouble().also { lists[it] = callback }
    }
    fun removeGetWifiListListener(subscriptionId: Double) { synchronized(this) { lists.remove(subscriptionId) } }
    internal fun emitConnected(info: WifiNetworkInfo) {
        val snapshot = synchronized(this) { if (released) emptyList() else connected.toList() }
        snapshot.forEach { (key, callback) -> if (synchronized(this) { !released && connected[key] === callback }) runCatching { callback(info) } }
    }
    internal fun emitList(info: List<WifiNetworkInfo>) {
        val snapshot = synchronized(this) { if (released) emptyList() else lists.toList() }
        snapshot.forEach { (key, callback) -> if (synchronized(this) { !released && lists[key] === callback }) runCatching { callback(info) } }
    }
    private fun invalidatePending() {
        val callbacks = synchronized(this) { generation += 1; pending.values.toList().also { pending.clear() } }
        callbacks.forEach { it() }
    }
    fun release() {
        synchronized(this) { if (released) return; released = true; connected.clear(); lists.clear() }
        invalidatePending()
        WifiFuture.onMain { core.engine.stop(this) }
    }
    override fun close() = release()
}
