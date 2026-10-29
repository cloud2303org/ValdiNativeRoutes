package io.valdiroutes.app

import android.content.Context
import io.nativeroutes.wifi.WifiConnectionParams
import io.nativeroutes.wifi.WifiCore
import io.nativeroutes.wifi.WifiCredentialData
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.nativeroutes.wifi.WifiFuture
import io.nativeroutes.wifi.WifiNetworkInfo
import io.nativeroutes.wifi.WifiSession
import io.valdiroutes.pages.WifiConnectParams
import io.valdiroutes.pages.WifiCredential
import io.valdiroutes.pages.WifiHost
import io.valdiroutes.pages.WifiHostEvents
import io.valdiroutes.pages.WifiInfo
import io.valdiroutes.pages.WifiPermissionState

/**
 * `api`'s Wi-Fi on the app-owned WifiCore (wifi/WifiHost.ts). Capability only: wifi/wechat.ts owns the mini-program
 * rules. One session for the app's lifetime; its events go to the one WifiHostEvents JS gives at install time.
 */
class WifiHostImpl(context: Context) : WifiHost {
    private val core = WifiCore.install(context.applicationContext)
    private val session: WifiSession by lazy { core.createSession().also(::listen) }
    @Volatile private var events: WifiHostEvents? = null

    override fun setEvents(events: WifiHostEvents) {
        this.events = events
        session // Listen from now on, not from the first call.
    }

    private fun listen(session: WifiSession) {
        session.onWifiConnected { events?.wifiConnected?.invoke(it.toValdi()) }
        session.onGetWifiList { list -> events?.wifiList?.invoke(list.map { it.toValdi() }) }
    }

    /** A native Promise outlives the calling page: JS hands native no function that the page's teardown could drop. */
    private fun <T, R> WifiFuture<T>.promise(map: (T) -> R): Promise<R> = ResolvablePromise<R>().also { promise ->
        observe { result ->
            result.fold({ promise.fulfillSuccess(map(it)) }, { promise.fulfillFailure(Exception(it.message ?: it.toString())) })
        }
    }

    private fun <T> WifiFuture<T>.promise(): Promise<Unit> = promise { }

    private fun WifiNetworkInfo.toValdi() = WifiInfo(SSID, BSSID, secure, signalStrength, frequency)

    override fun startWifi(): Promise<Unit> = session.startWifi().promise()
    override fun stopWifi(): Promise<Unit> = session.stopWifi().promise()
    override fun connectWifi(params: WifiConnectParams): Promise<WifiInfo> =
        session.connectWifi(WifiConnectionParams(params.SSID, params.BSSID, params.password, params.maunal, params.partialInfo))
            .promise { it.toValdi() }
    override fun getWifiList(): Promise<Unit> = session.getWifiList().promise()
    override fun getConnectedWifi(partialInfo: Boolean): Promise<WifiInfo> =
        session.getConnectedWifi(partialInfo).promise { it.toValdi() }
    override fun setWifiList(wifiList: List<WifiCredential>): Promise<Unit> =
        session.setWifiList(wifiList.map { WifiCredentialData(it.SSID, it.BSSID, it.password) }).promise()
    override fun getLocationPermissionState(): Promise<WifiPermissionState> =
        session.getLocationPermissionState().promise { WifiPermissionState(it.status, it.canAskAgain) }
    override fun requestLocationPermission(): Promise<WifiPermissionState> =
        session.requestLocationPermission().promise { WifiPermissionState(it.status, it.canAskAgain) }
}
