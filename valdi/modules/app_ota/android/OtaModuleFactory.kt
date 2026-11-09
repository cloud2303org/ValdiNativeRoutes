package io.valdiroutes.app

import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import io.valdiroutes.ota.OtaHost
import io.valdiroutes.ota.OtaInfo
import io.valdiroutes.ota.OtaNativeModule
import io.valdiroutes.ota.OtaNativeModuleFactory
import kotlin.concurrent.thread

/** Registration and module loading do no OTA IO; each host operation settles from a worker. */
internal class OtaModuleFactory : OtaNativeModuleFactory() {
    private val host by lazy { OtaHostImpl() }
    private val module by lazy {
        object : OtaNativeModule {
            override fun getHost(): OtaHost = host
        }
    }

    override fun onLoadModule(): OtaNativeModule = module
}

private class OtaHostImpl : OtaHost {
    override fun getInfo(): Promise<OtaInfo> = onWorker { ValdiOta.getInfo() }

    override fun checkForUpdate(): Promise<OtaInfo> = onWorker { ValdiOta.checkForUpdateOrThrow() }

    private fun onWorker(action: () -> ValdiOtaClient.Info): Promise<OtaInfo> =
        ResolvablePromise<OtaInfo>().also { promise ->
            try {
                thread(name = "ValdiOta-js") {
                    try {
                        val info = action()
                        promise.fulfillSuccess(OtaInfo(
                            enabled = info.enabled,
                            appVersion = info.appVersion,
                            embeddedBundleVersion = info.embeddedBundleVersion,
                            bundleVersion = info.bundleVersion,
                            pendingBundleVersion = info.pendingBundleVersion,
                            isNewVersion = info.isNewVersion,
                            previousBundleVersion = info.previousBundleVersion,
                        ))
                    } catch (error: Throwable) {
                        promise.fulfillFailure(error)
                    }
                }
            } catch (error: Throwable) {
                promise.fulfillFailure(error)
            }
        }
}
