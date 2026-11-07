package io.valdiroutes.app

import android.content.Context
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import com.snap.valdi.bundle.IValdiCustomModuleProvider
import com.snap.valdi.exceptions.ValdiException
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import kotlinx.serialization.json.jsonArray

/** Android adapter for the signed full-file OTA engine. Selection is fixed for the process. */
object ValdiOta {
    private const val TAG = "ValdiOta"
    private val lock = Any()
    @Volatile private var client: ValdiOtaClient? = null
    @Volatile private var active: Package? = null
    private var provider: Provider? = null

    /** Picks this process's package before the Valdi runtime starts; state failures preserve bundled startup. */
    fun start(context: Context): IValdiCustomModuleProvider = synchronized(lock) {
        provider?.let { return@synchronized it }
        try {
            val app = context.applicationContext
            val config = readConfig(app)
            @Suppress("DEPRECATION")
            val installed = app.packageManager.getPackageInfo(app.packageName, 0)
            // Native install identity, not a native-source fingerprint. Reinstallation/build changes reset state.
            val versionCode = PackageInfoCompat.getLongVersionCode(installed)
            val binary = "${app.packageName}/${installed.versionName}/$versionCode/${installed.firstInstallTime}/${installed.lastUpdateTime}"
            val candidate = ValdiOtaClient(
                File(app.filesDir, "valdi-ota"), config, binary,
                bundled = { name ->
                    try { app.assets.open(name) } catch (_: IOException) { null }
                },
                log = { message, error -> Log.w(TAG, message, error) },
            )
            val snapshot = candidate.start()
            active = snapshot?.let { Package(it, app.resources.displayMetrics.densityDpi) }
            client = candidate
            Log.i(TAG, "Valdi modules from ${snapshot?.let { "package ${it.version}" } ?: "the APK"} (${config.appVersion})")
        } catch (error: Exception) {
            // Never let config, verification, or state IO errors prevent the bundled app from starting.
            Log.w(TAG, "OTA startup failed; using the APK's modules", error)
        }
        Provider(active).also { provider = it }
    }

    /** Blocking; newly staged packages are used only on a subsequent cold start. */
    fun checkForUpdate() {
        try {
            checkForUpdateOrThrow()
        } catch (error: Exception) {
            Log.w(TAG, "Update check failed", error)
        }
    }

    internal fun getInfo(): ValdiOtaClient.Info = requireClient().getInfo()

    /** Manual callers wait for any automatic/manual check already running and receive its failure. */
    internal fun checkForUpdateOrThrow(): ValdiOtaClient.Info {
        val current = requireClient()
        if (current.checkForUpdate()) Log.i(TAG, "OTA package staged for the next cold start")
        return current.getInfo()
    }

    private fun requireClient(): ValdiOtaClient = checkNotNull(client) { "OTA client is unavailable" }

    /** A module image for native views such as the tab bar; null means the APK's resource. */
    fun image(module: String, name: String): File? = active?.image(resourceName(module, name))

    private fun readConfig(context: Context): ValdiOtaClient.Config {
        val bytes = context.assets.open("valdi_ota.json").use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer, 0, minOf(buffer.size, 1024 * 1024 - output.size() + 1))
                if (read < 0) break
                check(read > 0 && output.size() + read <= 1024 * 1024) { "OTA config exceeds limit" }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
        val json = parseOtaObject(bytes.decodeToString())
        val modules = json.getValue("modules").jsonArray
        val names = modules.map { it.otaString() }
        check(names.size == names.toSet().size) { "Duplicate OTA module" }
        check(names == listOf("app_pages")) { "Only app_pages is OTA-owned" }
        return ValdiOtaClient.Config(
            json.otaString("appVersion"),
            if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) ""
            else json.otaString("url"),
            json.otaString("publicKey"),
            names.toSet(),
            json.otaString("bundleVersion"),
        )
    }

    /** As Valdi names a module image's Android drawable (ValdiImage.getImageIdentifier). */
    private fun resourceName(module: String, name: String) = "${module}_${name.replace('-', '_')}"

    private class Provider(private val pkg: Package?) : IValdiCustomModuleProvider {
        override fun getCustomModuleData(path: String): ByteArray? {
            val file = pkg?.module(path) ?: return null
            return try {
                file.readBytes()
            } catch (error: IOException) {
                throw ValdiException("Package ${pkg.version}: can't read $path", error)
            }
        }

        override fun resolveAssetUrl(moduleName: String, resourcePath: String): String? =
            pkg?.image(resourceName(moduleName, resourcePath))?.let { Uri.fromFile(it).toString() }
    }

    private class Package(private val snapshot: ValdiOtaClient.Snapshot, densityDpi: Int) {
        val version get() = snapshot.version

        /** Same density choice as before: smallest at or above the screen's, otherwise largest. */
        private val images: Map<String, File> = snapshot.files
            .mapNotNull { path ->
                val parts = path.split('/')
                if (parts.size != 3 || parts[0] != "res") return@mapNotNull null
                val dpi = density(parts[1]) ?: return@mapNotNull null
                Triple(parts[2].substringBeforeLast('.'), dpi, File(snapshot.directory, path))
            }
            .groupBy({ it.first }, { it.second to it.third })
            .mapValues { (_, variants) ->
                val sorted = variants.sortedBy { it.first }
                (sorted.firstOrNull { it.first >= densityDpi } ?: sorted.last()).second
            }

        fun module(path: String): File? = snapshot.module(path)
        fun image(resourceName: String): File? = images[resourceName]

        companion object {
            private val densities = mapOf(
                "ldpi" to 120, "mdpi" to 160, "hdpi" to 240, "xhdpi" to 320, "xxhdpi" to 480, "xxxhdpi" to 640,
            )

            private fun density(directory: String): Int? {
                if (directory == "drawable") return 160
                if (!directory.startsWith("drawable-")) return null
                return directory.removePrefix("drawable-").split('-').firstNotNullOfOrNull { densities[it] }
            }
        }
    }
}
