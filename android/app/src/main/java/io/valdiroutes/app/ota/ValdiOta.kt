package io.valdiroutes.app

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import android.util.Log
import com.snap.valdi.bundle.IValdiCustomModuleProvider
import com.snap.valdi.exceptions.ValdiException
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import org.json.JSONArray
import org.json.JSONObject

/**
 * Over-the-air updates of the Valdi modules, packaged by scripts/ota.mjs (its header describes the server layout): a
 * signed manifest listing modules/<module>.valdimodule (+ .map.json) and the modules' images as
 * res/drawable-<density>/<module>_<name>.<ext>, each with its sha256.
 *
 * Valdi asks [Provider] for every module and every module image before looking in the APK, so a package replaces
 * code and images together. The package is chosen once per process in [start]: modules that Valdi unloads on low
 * memory reload from the same one, and a package downloaded meanwhile waits for the next cold start.
 *
 * A new package is pending until a launch confirms it ([confirmLaunch]); a pending package whose launch never
 * confirmed is rolled back and not downloaded again. Installing a new APK drops every package.
 */
object ValdiOta {
    private const val TAG = "ValdiOta"
    private const val MAX_PACKAGE_BYTES = 64L shl 20
    private val versionPattern = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
    private val filePattern = Regex("(modules|res)(/[A-Za-z0-9_@][A-Za-z0-9._@-]*)+")
    private val lock = Any()

    private lateinit var config: Config
    private lateinit var root: File
    private val packages get() = File(root, "packages")
    private var active: Package? = null

    /** Picks this process's package; call before the Valdi runtime starts and pass the result to it. */
    fun start(context: Context): IValdiCustomModuleProvider {
        config = Config.read(context)
        root = File(context.filesDir, "valdi-ota")
        // No update server (always so in debug builds): the APK's modules, not a package downloaded before.
        if (config.url.isEmpty()) {
            Log.i(TAG, "Valdi modules from the APK: updates are off")
            return Provider(null)
        }
        @Suppress("DEPRECATION")
        val installed = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        val binary = "${config.fingerprint}/$installed"
        synchronized(lock) {
            var state = State.read(root)
            if (state.binary != binary) {
                packages.deleteRecursively()
                state = State(binary)
            }
            var version = state.current
            state.pending?.let { pending ->
                if (state.pendingLaunched) {
                    Log.w(TAG, "Rolling back $pending: its launch never confirmed")
                    state = state.copy(pending = null, pendingLaunched = false, failed = state.failed + pending)
                } else {
                    state = state.copy(pendingLaunched = true)
                    version = pending
                }
            }
            active = version?.let { Package.open(File(packages, it), it, config, context.resources.displayMetrics.densityDpi) }
            if (version != null && active == null) {
                Log.w(TAG, "Dropping unreadable package $version")
                state = if (version == state.pending) {
                    state.copy(pending = null, pendingLaunched = false, failed = state.failed + version)
                } else {
                    state.copy(current = null)
                }
            }
            // Rolled back, superseded or half-installed packages.
            packages.listFiles()?.filter { it.name != state.current && it.name != state.pending }?.forEach { it.deleteRecursively() }
            state.write(root)
        }
        Log.i(TAG, "Valdi modules from ${active?.let { "package ${it.version}" } ?: "the APK"} (${config.appVersion}, fingerprint ${config.fingerprint})")
        return Provider(active)
    }

    /** The launch got through startApp: the package it runs becomes the current one. */
    fun confirmLaunch() {
        val version = active?.version ?: return
        synchronized(lock) {
            val state = State.read(root)
            if (state.pending != version) return
            state.current?.let { File(packages, it).deleteRecursively() }
            state.copy(current = version, pending = null, pendingLaunched = false).write(root)
        }
    }

    /** A module image from this process's package, for native views that show them (the tab bar); null for the APK's. */
    fun image(module: String, name: String): File? = active?.image(resourceName(module, name))

    /**
     * Downloads the package published for this app version (versionName), if there is a new one, to be used from the
     * next cold start. Blocking.
     */
    fun checkForUpdate() {
        if (config.url.isEmpty()) return
        try {
            update()
        } catch (e: Exception) {
            Log.w(TAG, "Update check failed", e)
        }
    }

    private fun update() {
        val base = "${config.url.trimEnd('/')}/android/${config.appVersion}"
        val version = JSONObject(download("$base/latest.json", 64 * 1024).decodeToString()).getString("version")
        check(versionPattern.matches(version)) { "Bad version '$version'" }
        if (synchronized(lock) { State.read(root).knows(version) }) return

        // The manifest is checked before anything else is downloaded.
        val manifest = download("$base/$version/manifest.json", 1L shl 20)
        val signature = download("$base/$version/manifest.sig", 4096)
        val files = verify(manifest, signature, version)
        val work = File(root, "download").apply { deleteRecursively() }
        try {
            val unpacked = File(work, version)
            var total = 0L
            for ((name, hash) in files) {
                val bytes = download("$base/$version/$name", MAX_PACKAGE_BYTES - total)
                total += bytes.size
                check(sha256(bytes) == hash) { "Bad hash: $name" }
                File(unpacked, name).apply { parentFile!!.mkdirs() }.writeBytes(bytes)
            }
            File(unpacked, "manifest.json").writeBytes(manifest)
            File(unpacked, "manifest.sig").writeBytes(signature)
            synchronized(lock) {
                val state = State.read(root)
                if (state.knows(version)) return
                packages.mkdirs()
                check(unpacked.renameTo(File(packages, version))) { "Can't install $version" }
                // A replaced pending package that this process runs stays until the next start cleans it up.
                state.pending?.takeIf { it != active?.version }?.let { File(packages, it).deleteRecursively() }
                state.copy(pending = version, pendingLaunched = false).write(root)
            }
            Log.i(TAG, "Package $version installed; used from the next cold start")
        } finally {
            work.deleteRecursively()
        }
    }

    /** The package's files and their sha256, from a manifest signed with the app's key for this binary. */
    private fun verify(manifestBytes: ByteArray, signature: ByteArray, version: String): Map<String, String> {
        val verifier = Signature.getInstance("SHA256withECDSA").apply {
            initVerify(config.publicKey)
            update(manifestBytes)
        }
        check(verifier.verify(Base64.getMimeDecoder().decode(signature))) { "Bad signature on $version" }
        val manifest = JSONObject(manifestBytes.decodeToString())
        check(manifest.getString("platform") == "android") { "Not an Android package" }
        check(manifest.getString("appVersion") == config.appVersion) { "Package for ${manifest.getString("appVersion")}" }
        // pack checks it against the version's release record; this catches a binary whose native side differs anyway.
        check(manifest.getString("fingerprint") == config.fingerprint) { "Package for another native side of ${config.appVersion}" }
        check(manifest.getString("version") == version) { "Package is ${manifest.getString("version")}, not $version" }
        val files = manifest.getJSONObject("files").let { json -> json.keys().asSequence().associateWith(json::getString) }
        check(files.keys.all(filePattern::matches)) { "Bad file name in $version" }
        check(files.keys.any { it.startsWith("modules/") && it.endsWith(".valdimodule") }) { "Package has no module" }
        return files
    }

    private fun download(url: String, maxBytes: Long): ByteArray {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        try {
            check(connection.responseCode == HttpURLConnection.HTTP_OK) { "GET $url: ${connection.responseCode}" }
            val out = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (out.size() + read > maxBytes) throw IOException("$url is larger than $maxBytes bytes")
                    out.write(buffer, 0, read)
                }
            }
            return out.toByteArray()
        } finally {
            connection.disconnect()
        }
    }

    /** As Valdi names a module image's Android drawable (ValdiImage.getImageIdentifier). */
    private fun resourceName(module: String, name: String) = "${module}_${name.replace('-', '_')}"

    private class Provider(private val pkg: Package?) : IValdiCustomModuleProvider {
        override fun getCustomModuleData(path: String): ByteArray? {
            val file = pkg?.module(path) ?: return null
            // A missing module must fail the launch (and roll the package back), not fall back to the APK's version.
            return try {
                file.readBytes()
            } catch (e: IOException) {
                throw ValdiException("Package ${pkg.version}: can't read $path", e)
            }
        }

        override fun resolveAssetUrl(moduleName: String, resourcePath: String): String? =
            pkg?.image(resourceName(moduleName, resourcePath))?.let { Uri.fromFile(it).toString() }
    }

    private class Package(val version: String, private val dir: File, files: Set<String>, densityDpi: Int) {
        private val modules = files.filter { it.startsWith("modules/") }.toSet()

        /** Drawable name → the file of the density Android would pick: the smallest at or above the screen's. */
        private val images: Map<String, File> = files
            .mapNotNull { path ->
                val parts = path.split('/')
                if (parts.size != 3 || parts[0] != "res") return@mapNotNull null
                val dpi = density(parts[1]) ?: return@mapNotNull null
                Triple(parts[2].substringBeforeLast('.'), dpi, File(dir, path))
            }
            .groupBy({ it.first }, { it.second to it.third })
            .mapValues { (_, variants) ->
                val sorted = variants.sortedBy { it.first }
                (sorted.firstOrNull { it.first >= densityDpi } ?: sorted.last()).second
            }

        fun module(path: String): File? = if ("modules/$path" in modules) File(dir, "modules/$path") else null

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

            /** Files were verified when the package was downloaded; here only that they are all still there. */
            fun open(dir: File, version: String, config: Config, densityDpi: Int): Package? = try {
                val manifest = JSONObject(File(dir, "manifest.json").readText())
                val files = manifest.getJSONObject("files").keys().asSequence().toSet()
                if (manifest.getString("appVersion") != config.appVersion || manifest.getString("fingerprint") != config.fingerprint ||
                    files.any { !File(dir, it).isFile }
                ) {
                    null
                } else {
                    Package(version, dir, files, densityDpi)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Can't open package $version", e)
                null
            }
        }
    }

    /** assets/valdi_ota.json, written by the Gradle build (ValdiOtaInfo in app/build.gradle.kts). */
    private class Config(val appVersion: String, val fingerprint: String, val url: String, publicKeyPem: String) {
        val publicKey = KeyFactory.getInstance("EC").generatePublic(
            X509EncodedKeySpec(
                Base64.getMimeDecoder().decode(publicKeyPem.lines().filterNot { it.startsWith("-----") }.joinToString("")),
            ),
        )

        companion object {
            fun read(context: Context): Config {
                val json = JSONObject(context.assets.open("valdi_ota.json").use { it.readBytes().decodeToString() })
                return Config(json.getString("appVersion"), json.getString("fingerprint"), json.getString("url"), json.getString("publicKey"))
            }
        }
    }

    private data class State(
        val binary: String,
        val current: String? = null,
        val pending: String? = null,
        val pendingLaunched: Boolean = false,
        val failed: Set<String> = emptySet(),
    ) {
        fun knows(version: String) = version == current || version == pending || version in failed

        fun write(root: File) {
            root.mkdirs()
            val json = JSONObject()
                .put("binary", binary)
                .put("current", current ?: JSONObject.NULL)
                .put("pending", pending ?: JSONObject.NULL)
                .put("pendingLaunched", pendingLaunched)
                .put("failed", JSONArray(failed.toList()))
            val file = AtomicFile(File(root, "state.json"))
            val out = file.startWrite()
            try {
                out.write(json.toString().toByteArray())
                file.finishWrite(out)
            } catch (e: IOException) {
                file.failWrite(out)
                throw e
            }
        }

        companion object {
            fun read(root: File): State = try {
                val json = JSONObject(AtomicFile(File(root, "state.json")).readFully().decodeToString())
                val failed = json.getJSONArray("failed")
                State(
                    json.getString("binary"),
                    json.optString("current").takeUnless { json.isNull("current") },
                    json.optString("pending").takeUnless { json.isNull("pending") },
                    json.getBoolean("pendingLaunched"),
                    (0 until failed.length()).map(failed::getString).toSet(),
                )
            } catch (e: Exception) {
                State("")
            }
        }
    }

    private fun sha256(bytes: ByteArray) =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
