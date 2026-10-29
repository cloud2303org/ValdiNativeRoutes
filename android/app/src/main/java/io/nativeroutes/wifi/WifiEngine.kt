// Copied from ExpoNativeRoutes android/native/wifi (io/nativeroutes/wifi/WifiEngine.kt).
package io.nativeroutes.wifi

import android.Manifest
import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.MacAddress
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.ScanResult
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.provider.Settings

/** Radio, request and process-routing ownership. All mutable state runs on the main thread. */
@SuppressLint("MissingPermission")
internal class WifiEngine(private val context: Context) {
    private val wifi by lazy { context.getSystemService(Context.WIFI_SERVICE) as WifiManager }
    private val connectivity by lazy { context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager }
    private val handler = WifiFuture.handler
    private val started = mutableMapOf<Long, WifiSession>()
    private val capabilities = mutableMapOf<Network, NetworkCapabilities>()
    private val emitted = mutableMapOf<Network, String>()
    private var receiver: BroadcastReceiver? = null
    private var observer: ConnectivityManager.NetworkCallback? = null
    private var lease: ConnectionLease? = null
    private val scanPending = mutableMapOf<Long, WifiFuture<Unit>>()
    private var scanTimeout: Runnable? = null
    private val infoReads = mutableSetOf<InfoRead>()

    private class InfoRead(val owner: Long, val network: Network?, val partialInfo: Boolean, val future: WifiFuture<WifiNetworkInfo>) {
        lateinit var callback: ConnectivityManager.NetworkCallback
        lateinit var timeout: Runnable
    }

    private class ConnectionLease(
        val owner: Long,
        val SSID: String,
        val BSSID: String,
        val partialInfo: Boolean,
        val future: WifiFuture<WifiNetworkInfo>,
        val previousBoundNetwork: Network?,
    ) {
        lateinit var callback: ConnectivityManager.NetworkCallback
        lateinit var timeout: Runnable
        var network: Network? = null
        var available = false
        var confirmed = false
        var bound = false
        var released = false
        var info: WifiNetworkInfo? = null
    }

    fun requireStarted(session: WifiSession) {
        if (!started.containsKey(session.id)) throw wifiError("E_WIFI_NOT_INITIALIZED", "Call startWifi first")
    }
    fun start(session: WifiSession): WifiFuture<Unit> = WifiFuture.value {
        if (started.containsKey(session.id)) return@value Unit
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI)) throw wifiError("E_WIFI_SYSTEM_NOT_SUPPORTED", "Wi-Fi hardware unavailable")
        if (started.isEmpty()) registerObservers()
        started[session.id] = session
    }
    fun stop(session: WifiSession) {
        started.remove(session.id)
        infoReads.filter { it.owner == session.id }.toList().forEach { finishInfoRead(it, error = wifiError("E_WIFI_SESSION_RELEASED", "Session stopped")) }
        scanPending.remove(session.id)?.reject(wifiError("E_WIFI_SESSION_RELEASED", "Session stopped"))
        if (scanPending.isEmpty()) clearScan()
        lease?.takeIf { it.owner == session.id }?.let { releaseLease(it, wifiError("E_WIFI_SESSION_RELEASED", "Session stopped")) }
        if (started.isEmpty()) unregisterObservers()
    }

    fun locationPermissionState(): WifiLocationPermissionState =
        if (hasFineLocation()) WifiLocationPermissionState("granted", true) else WifiLocationPermissionState("undetermined", false)

    private fun permission(permission: String): Boolean = Build.VERSION.SDK_INT < 23 || context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    private fun hasFineLocation(): Boolean = permission(Manifest.permission.ACCESS_FINE_LOCATION)
    private fun locationEnabled(): Boolean {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled
        else manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
    private fun requireInfoAccess() {
        if (!hasFineLocation()) throw wifiError("E_WIFI_LOCATION_PERMISSION_REQUIRED", "Precise location permission is required to read SSID/BSSID")
        if (!locationEnabled()) throw wifiError("E_WIFI_LOCATION_DISABLED", "Location services must be enabled to read Wi-Fi information")
    }
    private fun requireWifiOn() {
        if (!wifi.isWifiEnabled) throw wifiError("E_WIFI_WIFI_DISABLED", "Enable Wi-Fi in system settings")
    }
    private fun requireForeground() {
        val state = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(state)
        if (state.importance > ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE) throw wifiError("E_WIFI_BACKGROUND", "Wi-Fi provisioning requires a visible app")
    }

    fun connect(session: WifiSession, params: WifiConnectionParams): WifiFuture<WifiNetworkInfo> {
        val future = WifiFuture<WifiNetworkInfo>()
        try {
            requireStarted(session)
            requireForeground()
            if (params.maunal) {
                val action = if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
                context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                // The panel has opened. It has not confirmed any SSID connection.
                future.resolve(WifiNetworkInfo(SSID = ""))
                return future
            }
            requireWifiOn()
            if (Build.VERSION.SDK_INT < 29) throw wifiError("E_WIFI_SYSTEM_NOT_SUPPORTED", "Programmatic provisioning requires Android 10; use maunal to choose a network safely")
            if (Build.VERSION.SDK_INT >= 33 && !permission(Manifest.permission.NEARBY_WIFI_DEVICES)) throw wifiError("E_WIFI_PERMISSION_DENIED", "Nearby Wi-Fi devices permission is required")
            if (Build.VERSION.SDK_INT < 33 || !params.partialInfo) requireInfoAccess()
            if (params.SSID.isEmpty() || params.SSID.indexOf('\u0000') >= 0 || params.SSID.toByteArray(Charsets.UTF_8).size > 32) throw wifiError("E_WIFI_INVALID_SSID", "SSID must contain 1 to 32 UTF-8 bytes")
            if (params.BSSID.isNotEmpty() && !Regex("([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}").matches(params.BSSID)) throw wifiError("E_WIFI_SYSTEM_CONFIG", "Invalid BSSID")
            if (params.password.isNotEmpty() && (params.password.length !in 8..63 || params.password.any { it.code !in 32..126 })) throw wifiError("E_WIFI_SYSTEM_CONFIG", "Android provisioning supports open APs or WPA2 personal passphrases of 8 to 63 ASCII characters")
            if (lease != null) throw wifiError("E_WIFI_DUPLICATE_REQUEST", "A Wi-Fi session already owns the device connection; stop or release its session first")
            val specifier = try {
                WifiNetworkSpecifier.Builder().setSsid(params.SSID).also { builder ->
                    if (params.BSSID.isNotEmpty()) builder.setBssid(MacAddress.fromString(params.BSSID))
                    if (params.password.isNotEmpty()) builder.setWpa2Passphrase(params.password)
                }.build()
            } catch (_: IllegalArgumentException) { throw wifiError("E_WIFI_SYSTEM_CONFIG", "Wi-Fi configuration was rejected") }
            val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).setNetworkSpecifier(specifier).build()
            // No password is retained by the session after constructing the platform request.
            val current = ConnectionLease(session.id, params.SSID, params.BSSID, params.partialInfo, future, connectivity.boundNetworkForProcess)
            current.callback = makeCallback(
                available = { network ->
                    if (lease === current && !current.released) {
                        current.network = network
                        current.available = true
                        connectivity.getNetworkCapabilities(network)?.let { acceptConnection(current, network, it) }
                    }
                },
                changed = { network, info ->
                    if (lease === current && !current.released && current.network == network) acceptConnection(current, network, info)
                },
                lost = { network -> if (lease === current && current.network == network) releaseLease(current, wifiError("E_WIFI_CONNECTION_LOST", "Device AP connection lost")) },
                unavailable = { if (lease === current) releaseLease(current, wifiError("E_WIFI_CONNECTION_UNAVAILABLE", "Connection unavailable; Android does not distinguish rejection from authentication failure")) },
            )
            current.timeout = Runnable {
                if (lease === current && !current.confirmed) releaseLease(current,
                    if (current.available) wifiError("E_WIFI_INFO_UNAVAILABLE", "Connected network information could not be verified")
                    else wifiError("E_WIFI_CONNECTION_TIMEOUT", "Connection approval or association timed out"))
            }
            lease = current
            handler.postDelayed(current.timeout, 30_000)
            try { connectivity.requestNetwork(request, current.callback, handler) }
            catch (_: SecurityException) { releaseLease(current, wifiError("E_WIFI_PERMISSION_DENIED", "Required Wi-Fi permission is missing")) }
            catch (_: Exception) { releaseLease(current, wifiError("E_WIFI_SYSTEM_INTERNAL", "System could not start the Wi-Fi request")) }
        } catch (error: Throwable) { future.reject(error) }
        return future
    }

    private fun acceptConnection(current: ConnectionLease, network: Network, info: NetworkCapabilities) {
        if (!current.available || !info.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return
        val actual = networkInfo(info)
        if (actual != null && (actual.SSID != current.SSID || (current.BSSID.isNotEmpty() && actual.BSSID != null && !actual.BSSID.equals(current.BSSID, true)))) {
            releaseLease(current, wifiError("E_WIFI_SYSTEM_CONFIG", "Available Wi-Fi network does not match the requested SSID/BSSID"))
            return
        }
        // Android guarantees exact SSID/BSSID matching for this owned specifier.
        // When location fields are redacted, partial mode uses the satisfied request's SSID.
        val result = if (current.partialInfo) WifiNetworkInfo(SSID = current.SSID) else actual ?: return
        current.info = result
        if (current.confirmed) return
        if (connectivity.boundNetworkForProcess != current.previousBoundNetwork) {
            releaseLease(current, wifiError("E_WIFI_CONNECTION_OWNED", "Another owner changed process network binding while approval was pending"))
            return
        }
        if (!runCatching { connectivity.bindProcessToNetwork(network) }.getOrDefault(false)) {
            releaseLease(current, wifiError("E_WIFI_SYSTEM_INTERNAL", "System refused process routing to the device AP"))
            return
        }
        current.bound = true
        current.confirmed = true
        handler.removeCallbacks(current.timeout)
        current.future.resolve(result)
        if (lease === current && !current.released) emitConnected(network, result)
    }

    private fun releaseLease(current: ConnectionLease, error: Throwable? = null) {
        if (current.released) return
        current.released = true
        if (lease === current) lease = null
        handler.removeCallbacks(current.timeout)
        // Restore only the binding that is still ours. A later app owner wins.
        if (current.bound && connectivity.boundNetworkForProcess == current.network) {
            val restored = runCatching { connectivity.bindProcessToNetwork(current.previousBoundNetwork) }.getOrDefault(false)
            if (!restored && connectivity.boundNetworkForProcess == current.network) runCatching { connectivity.bindProcessToNetwork(null) }
        }
        runCatching { connectivity.unregisterNetworkCallback(current.callback) }
        current.network?.let { capabilities.remove(it); emitted.remove(it) }
        if (error != null) current.future.reject(error)
    }

    fun connectedWifi(session: WifiSession, partialInfo: Boolean): WifiFuture<WifiNetworkInfo> {
        val future = WifiFuture<WifiNetworkInfo>()
        try {
            requireStarted(session)
            requireWifiOn()
            val own = lease?.takeIf { it.owner == session.id && it.confirmed && !it.released }
            if (partialInfo && own != null) { future.resolve(WifiNetworkInfo(SSID = own.SSID)); return future }
            requireInfoAccess()
            val network = own?.network ?: connectivity.allNetworks.firstOrNull { connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
            val info = network?.let { networkInfo(capabilities[it] ?: connectivity.getNetworkCapabilities(it)) }
            if (info != null) future.resolve(if (partialInfo) WifiNetworkInfo(SSID = info.SSID) else info)
            else if (Build.VERSION.SDK_INT >= 31) {
                // getNetworkCapabilities always redacts location data. A callback registered
                // before a permission grant can also cache redacted info, so take a fresh
                // FLAG_INCLUDE_LOCATION_INFO snapshot without requesting a new connection.
                val read = InfoRead(session.id, network, partialInfo, future)
                read.callback = makeCallback(changed = { candidate, cap ->
                    if (infoReads.contains(read) && cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && (read.network == null || candidate == read.network)) {
                        runCatching { requireInfoAccess(); networkInfo(cap) }.fold({ value ->
                            if (value != null) { capabilities[candidate] = cap; finishInfoRead(read, value) }
                        }, { error -> finishInfoRead(read, error = error) })
                    }
                }, lost = { candidate -> if (read.network == candidate) finishInfoRead(read, error = wifiError("E_WIFI_INFO_UNAVAILABLE", "Wi-Fi connection lost while reading information")) })
                read.timeout = Runnable { finishInfoRead(read, error = wifiError("E_WIFI_INFO_UNAVAILABLE", "No Wi-Fi is connected or SSID is unavailable")) }
                infoReads.add(read)
                handler.postDelayed(read.timeout, 5_000)
                try { connectivity.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), read.callback, handler) }
                catch (_: SecurityException) { finishInfoRead(read, error = wifiError("E_WIFI_PERMISSION_DENIED", "Wi-Fi information permission is missing")) }
                catch (_: Exception) { finishInfoRead(read, error = wifiError("E_WIFI_SYSTEM_INTERNAL", "System could not read current Wi-Fi information")) }
            } else future.reject(wifiError("E_WIFI_INFO_UNAVAILABLE", "No Wi-Fi is connected or SSID is unavailable"))
        } catch (error: Throwable) { future.reject(error) }
        return future
    }
    private fun finishInfoRead(read: InfoRead, info: WifiNetworkInfo? = null, error: Throwable? = null) {
        if (!infoReads.remove(read)) return
        handler.removeCallbacks(read.timeout)
        runCatching { connectivity.unregisterNetworkCallback(read.callback) }
        if (error != null) read.future.reject(error)
        else if (info != null) read.future.resolve(if (read.partialInfo) WifiNetworkInfo(SSID = info.SSID) else info)
    }
    private fun networkInfo(cap: NetworkCapabilities?): WifiNetworkInfo? {
        val transport = if (Build.VERSION.SDK_INT >= 29) cap?.transportInfo as? WifiInfo else null
        // On Android 12 dual-STA, WifiManager.connectionInfo can describe the unrelated STA.
        val raw = transport ?: if (Build.VERSION.SDK_INT < 31 && cap?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) wifi.connectionInfo else return null
        return wifiInfo(raw)
    }
    private fun wifiInfo(raw: WifiInfo?): WifiNetworkInfo? {
        raw ?: return null
        val ssid = raw.ssid?.removeSurrounding("\"")?.takeIf { it.isNotEmpty() && it != WifiManager.UNKNOWN_SSID } ?: return null
        val bssid = raw.bssid?.takeIf { it != "02:00:00:00:00:00" && it != "00:00:00:00:00:00" }
        val security = if (Build.VERSION.SDK_INT >= 31) raw.currentSecurityType.takeIf { it != WifiInfo.SECURITY_TYPE_UNKNOWN }?.let { it != WifiInfo.SECURITY_TYPE_OPEN }
            else bssid?.let { address -> runCatching { wifi.scanResults.firstOrNull { it.BSSID.equals(address, true) }?.let(::secureScan) }.getOrNull() }
        return WifiNetworkInfo(ssid, bssid, security,
            raw.rssi.takeIf { it != -127 }?.let { WifiManager.calculateSignalLevel(it, 101).toDouble() },
            raw.frequency.takeIf { it > 0 }?.toDouble())
    }

    fun scan(session: WifiSession): WifiFuture<Unit> {
        val future = WifiFuture<Unit>()
        try {
            requireStarted(session)
            requireForeground()
            requireWifiOn()
            requireInfoAccess()
            if (scanPending.containsKey(session.id)) throw wifiError("E_WIFI_DUPLICATE_REQUEST", "A scan is already pending for this session")
            val first = scanPending.isEmpty()
            scanPending[session.id] = future
            if (first) {
                val timeout = Runnable { failScan(wifiError("E_WIFI_SYSTEM_INTERNAL", "Wi-Fi scan result timed out")) }
                scanTimeout = timeout
                handler.postDelayed(timeout, 15_000)
                if (!wifi.startScan()) failScan(wifiError("E_WIFI_SYSTEM_INTERNAL", "Wi-Fi scan request was throttled or refused"))
            }
        } catch (_: SecurityException) {
            if (scanPending[session.id] === future) scanPending.remove(session.id)
            future.reject(wifiError("E_WIFI_PERMISSION_DENIED", "Wi-Fi scan permission is missing"))
            if (scanPending.isEmpty()) clearScan()
        } catch (error: Throwable) {
            if (scanPending[session.id] === future) scanPending.remove(session.id)
            future.reject(error)
            if (scanPending.isEmpty()) clearScan()
        }
        return future
    }
    private fun secureScan(result: ScanResult): Boolean = Regex("WEP|WPA|SAE|EAP|OWE|WAPI", RegexOption.IGNORE_CASE).containsMatchIn(result.capabilities)
    private fun scanResults(updated: Boolean) {
        if (scanPending.isEmpty()) return
        if (!updated) { failScan(wifiError("E_WIFI_SYSTEM_INTERNAL", "Wi-Fi scan returned no fresh results")); return }
        try {
            requireInfoAccess()
            val results = wifi.scanResults.mapNotNull { result ->
                val ssid = if (Build.VERSION.SDK_INT >= 33) result.wifiSsid?.toString()?.removeSurrounding("\"") ?: result.SSID else result.SSID
                if (ssid.isEmpty() || ssid == WifiManager.UNKNOWN_SSID) null
                else WifiNetworkInfo(ssid, result.BSSID, secureScan(result), WifiManager.calculateSignalLevel(result.level, 101).toDouble(), result.frequency.toDouble())
            }.distinctBy { it.BSSID ?: it.SSID }.sortedByDescending { it.signalStrength }
            val pending = scanPending.values.toList()
            scanPending.clear()
            clearScan()
            started.values.toList().forEach { it.emitList(results) }
            pending.forEach { it.resolve(Unit) }
        } catch (_: SecurityException) { failScan(wifiError("E_WIFI_PERMISSION_DENIED", "Wi-Fi scan result permission is missing")) }
        catch (error: Throwable) { failScan(error) }
    }
    private fun failScan(error: Throwable) {
        val pending = scanPending.values.toList()
        scanPending.clear()
        clearScan()
        pending.forEach { it.reject(error) }
    }
    private fun clearScan() { scanTimeout?.let(handler::removeCallbacks); scanTimeout = null }

    private fun emitConnected(network: Network, info: WifiNetworkInfo) {
        if (emitted[network] == info.SSID) return
        emitted[network] = info.SSID
        started.values.toList().forEach { it.emitConnected(info) }
    }
    private fun registerObservers() {
        val broadcast = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                WifiFuture.onMain {
                    when (intent.action) {
                        WifiManager.SCAN_RESULTS_AVAILABLE_ACTION -> scanResults(intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false))
                        WifiManager.WIFI_STATE_CHANGED_ACTION -> if (!wifi.isWifiEnabled) {
                            lease?.let { releaseLease(it, wifiError("E_WIFI_WIFI_DISABLED", "Wi-Fi disabled")) }
                            failScan(wifiError("E_WIFI_WIFI_DISABLED", "Wi-Fi disabled"))
                        }
                    }
                }
            }
        }
        val filter = IntentFilter().apply { addAction(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION); addAction(WifiManager.WIFI_STATE_CHANGED_ACTION) }
        val callback = makeCallback(changed = { network, info ->
            capabilities[network] = info
            if (info.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) networkInfo(info)?.let { emitConnected(network, it) }
        }, lost = { network -> capabilities.remove(network); emitted.remove(network) })
        try {
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(broadcast, filter, Context.RECEIVER_EXPORTED) else context.registerReceiver(broadcast, filter)
            receiver = broadcast
            val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
            if (Build.VERSION.SDK_INT >= 26) connectivity.registerNetworkCallback(request, callback, handler) else connectivity.registerNetworkCallback(request, callback)
            observer = callback
        } catch (_: Exception) {
            runCatching { context.unregisterReceiver(broadcast) }
            receiver = null
            throw wifiError("E_WIFI_SYSTEM_INTERNAL", "System could not initialize Wi-Fi observers")
        }
    }
    private fun unregisterObservers() {
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        observer?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        receiver = null
        observer = null
        capabilities.clear()
        emitted.clear()
    }
    private fun makeCallback(
        available: (Network) -> Unit = {},
        changed: (Network, NetworkCapabilities) -> Unit = { _, _ -> },
        lost: (Network) -> Unit = {},
        unavailable: () -> Unit = {},
    ): ConnectivityManager.NetworkCallback = if (Build.VERSION.SDK_INT >= 31) object : ConnectivityManager.NetworkCallback(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO) {
        override fun onAvailable(network: Network) { WifiFuture.onMain { available(network) } }
        override fun onCapabilitiesChanged(network: Network, info: NetworkCapabilities) { WifiFuture.onMain { changed(network, info) } }
        override fun onLost(network: Network) { WifiFuture.onMain { lost(network) } }
        override fun onUnavailable() { WifiFuture.onMain(unavailable) }
    } else object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { WifiFuture.onMain { available(network) } }
        override fun onCapabilitiesChanged(network: Network, info: NetworkCapabilities) { WifiFuture.onMain { changed(network, info) } }
        override fun onLost(network: Network) { WifiFuture.onMain { lost(network) } }
        override fun onUnavailable() { WifiFuture.onMain(unavailable) }
    }
}
