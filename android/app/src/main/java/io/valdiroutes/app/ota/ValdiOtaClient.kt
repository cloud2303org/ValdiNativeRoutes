package io.valdiroutes.app

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.channels.FileChannel
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** File/HTTP engine, deliberately independent of Android and the Valdi runtime. */
internal class ValdiOtaClient(
    root: File,
    private val config: Config,
    private val binary: String,
    // Module and map asset names, without "modules/". Resources may simply return null.
    private val bundled: (String) -> InputStream? = { null },
    private val stateWriter: (File, ByteArray) -> Unit = ::writeStateAtomically,
    private val log: (String, Exception) -> Unit = { _, _ -> },
    private val codec: OtaFileCodec = NativeOtaFileCodec,
) {
    class Config(val appVersion: String, val url: String, private val publicKeyPem: String, modules: Set<String>,
        val bundleVersion: String = "pages-001") {
        val modules: Set<String> = modules.toSet()
        val publicKey by lazy {
            val encoded = publicKeyPem.lines().filterNot { it.startsWith("-----") }.joinToString("").filterNot(Char::isWhitespace)
            val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(encoded)))
            val ec = key as? ECPublicKey ?: error("OTA key must be EC P-256")
            val parameters = java.security.AlgorithmParameters.getInstance("EC").apply {
                init(ECGenParameterSpec("secp256r1"))
            }.getParameterSpec(java.security.spec.ECParameterSpec::class.java)
            check(ec.params.curve == parameters.curve && ec.params.generator == parameters.generator &&
                ec.params.order == parameters.order && ec.params.cofactor == parameters.cofactor) { "OTA key must be P-256" }
            key
        }

        init {
            check(appVersion.isNotEmpty() && appVersion != "." && appVersion != "..") { "Invalid app version" }
            check(validVersion(bundleVersion)) { "Invalid embedded bundle version" }
            check(this.modules.isNotEmpty() && this.modules.size <= MAX_FILES &&
                this.modules.all { modulePattern.matches(it) && it != "." && it != ".." }) { "Invalid module inventory" }
        }
    }

    class Snapshot internal constructor(val version: String, val directory: File, files: Set<String>) {
        val files: Set<String> = files.toSet()
        // Return declared paths even when missing; the provider must fail instead of mixing in bundled code.
        fun module(path: String): File? = if ("modules/$path" in files) File(directory, "modules/$path") else null
    }

    data class Info(
        val enabled: Boolean,
        val appVersion: String,
        val embeddedBundleVersion: String,
        val bundleVersion: String,
        val pendingBundleVersion: String?,
        val isNewVersion: Boolean = false,
        val previousBundleVersion: String? = null,
    )

    private data class Descriptor(val sha256: String, val size: Long)
    private data class State(
        val binary: String,
        val current: String? = null,
        val pending: String? = null,
    ) {
        fun knows(version: String) = current == version || pending == version
    }

    private val lock = Any()
    private var checking: FutureTask<Boolean>? = null
    private val root = root.canonicalFile
    private val packages = File(this.root, "packages")
    private var started = false
    private var active: Snapshot? = null
    private var activatedFrom: String? = null

    /** Selection is immutable for this client/process. All state errors propagate to the platform adapter. */
    fun start(): Snapshot? = synchronized(lock) {
        if (started) return@synchronized active
        if (config.url.isEmpty()) {
            started = true
            return@synchronized null
        }
        val previous = readState()
        var state = if (previous.binary == binary) previous else State(binary)
        var selected: Snapshot? = null
        var promotedFrom: String? = null
        state.pending?.let { pending ->
            selected = openPackage(pending)
            if (selected == null) {
                state = state.copy(pending = null)
            } else {
                val previousVersion = state.current ?: config.bundleVersion
                if (pending != previousVersion) promotedFrom = previousVersion
                state = state.copy(current = pending, pending = null)
            }
        }
        if (selected == null) {
            selected = state.current?.let(::openPackage)
            if (selected == null) state = state.copy(current = null)
        }
        // Promotion/reset must be durable before exposing the snapshot or deleting previous packages.
        if (state != previous) writeState(state)
        active = selected
        activatedFrom = promotedFrom
        started = true
        cleanup(state)
        // Only this first start owns abandoned work. No check can create live work before this lock releases.
        root.listFiles()?.filter { it.name.startsWith(".work-") || it.name == "download" }?.forEach { deleteTree(it) }
        selected
    }

    /** Active selection is immutable; pending is read from durable state under the same lock as staging. */
    fun getInfo(): Info = synchronized(lock) {
        check(started) { "OTA client has not started" }
        val enabled = config.url.isNotEmpty()
        val pending = if (enabled) {
            val state = readState()
            check(state.binary == binary) { "Installed binary changed" }
            state.pending
        } else null
        Info(enabled, config.appVersion, config.bundleVersion, active?.version ?: config.bundleVersion, pending,
            isNewVersion = activatedFrom != null, previousBundleVersion = activatedFrom)
    }

    /** Blocking, single-flight. All concurrent callers receive the same staged result or failure. */
    fun checkForUpdate(): Boolean {
        if (config.url.isEmpty()) return false
        val (flight, owner) = synchronized(lock) {
            checking?.let { it to false } ?: FutureTask { checkForUpdateOnce() }.let {
                checking = it
                it to true
            }
        }
        try {
            // The owner runs network work outside the state lock; joiners wait on the same outcome.
            if (owner) flight.run()
            return flight.get()
        } catch (error: ExecutionException) {
            throw error.cause ?: error
        } finally {
            if (owner) synchronized(lock) { checking = null }
        }
    }

    private fun checkForUpdateOnce(): Boolean {
        synchronized(lock) { check(started) { "OTA client has not started" } }
        val appVersion = URLEncoder.encode(config.appVersion, "UTF-8").replace("+", "%20")
        val base = "${config.url.trimEnd('/')}/android/$appVersion"
        val running = synchronized(lock) { active?.version ?: config.bundleVersion }
        val queryVersion = URLEncoder.encode(running, "UTF-8").replace("+", "%20")
        val latest = parseOtaObject(metadata("$base/latest.json?platform=android&appVersion=$appVersion&bundleVersion=$queryVersion", LATEST_LIMIT).decodeToString())
        val offered = latest.getValue("version")
        if (offered == JsonNull) return false
        val version = offered.otaString()
        check(validVersion(version)) { "Invalid latest version" }
        if (version == config.bundleVersion || version == running) return false
        val sources = synchronized(lock) {
            val state = readState()
            check(state.binary == binary) { "Installed binary changed" }
            if (state.knows(version)) return false
            listOfNotNull(active?.version, state.current, state.pending).distinct().map { File(packages, it) }
        }
        val manifest = metadata("$base/$version/manifest.json", MANIFEST_LIMIT)
        val signature = metadata("$base/$version/manifest.sig", SIGNATURE_LIMIT)
        val descriptors = verify(manifest, signature, version)
        check(root.mkdirs() || root.isDirectory) { "Cannot create OTA root" }
        val work = File(root, ".work-${UUID.randomUUID()}")
        check(work.mkdir()) { "Cannot create download directory" }
        try {
            for ((path, descriptor) in descriptors) {
                val target = File(work, path)
                check(target.parentFile!!.mkdirs() || target.parentFile!!.isDirectory) { "Cannot create package directory" }
                val reused = sources.any { source ->
                    val candidate = File(source, path)
                    candidate.isFile && tryCopy(target, descriptor) { candidate.inputStream() }
                } || (path.startsWith("modules/") && tryCopy(target, descriptor) { bundled(path.removePrefix("modules/")) })
                val split = !reused && path == "modules/app_pages.valdimodule" &&
                    trySplit(manifest, base, version, running, work, target, descriptor)
                if (!reused && !split) {
                    request("$base/$version/$path", descriptor.size) { input ->
                        copyVerified(input, target, descriptor)
                    }
                }
            }
            writeSynced(File(work, "manifest.json"), manifest)
            writeSynced(File(work, "manifest.sig"), signature)
            // Persist every directory level before publishing the completed tree.
            work.walkBottomUp().filter { it.isDirectory }.forEach(::syncDirectory)
            synchronized(lock) {
                val state = readState()
                check(state.binary == binary) { "Installed binary changed" }
                if (state.knows(version)) return false
                check(packages.mkdirs() || packages.isDirectory) { "Cannot create packages directory" }
                val destination = File(packages, version)
                // An orphan from an interrupted move is safe to discard; never replace a referenced directory.
                check(destination != active?.directory) { "Cannot replace active package" }
                check(deleteTree(destination)) { "Cannot remove orphan package" }
                check(work.renameTo(destination)) { "Cannot install package" }
                try {
                    syncDirectory(packages)
                    val staged = state.copy(pending = version)
                    writeState(staged)
                    cleanup(staged)
                } catch (error: Exception) {
                    // A write may fail after its atomic rename (directory fsync). Retain any referenced output.
                    val durable = try { readState() } catch (_: Exception) { null }
                    if (durable != null && durable.current != version && durable.pending != version) {
                        deleteTree(destination)
                    }
                    throw error
                }
            }
            return true
        } finally {
            deleteTree(work)
        }
    }

    private fun trySplit(manifest: ByteArray, base: String, version: String, running: String,
        work: File, target: File, descriptor: Descriptor): Boolean {
        val json = parseOtaObject(manifest.decodeToString())
        if (!json.containsKey("deltas")) return false
        val split = File(work, ".split-${UUID.randomUUID()}")
        return try {
            check(split.mkdir()) { "Cannot create split work directory" }
            OtaSplit(codec) { path, hash, size, output ->
                request("$base/$version/$path", size) { copyVerified(it, output, Descriptor(hash, size)) }
            }.rebuild(json, config.appVersion, running, version, descriptor.sha256, descriptor.size, split, target) {
                val snapshot = synchronized(lock) { active }
                if (snapshot != null) snapshot.module("app_pages.valdimodule")?.inputStream()
                else bundled("app_pages.valdimodule")
            }
        } catch (error: Exception) {
            target.delete()
            log("Split OTA failed; downloading full app_pages", error)
            false
        } catch (error: LinkageError) {
            target.delete()
            log("Split OTA codec unavailable; downloading full app_pages", IOException(error))
            false
        } finally {
            deleteTree(split)
        }
    }

    private fun openPackage(version: String): Snapshot? = try {
        val dir = File(packages, version)
        check(dir.isDirectory && dir.canonicalFile == dir.absoluteFile) { "Unsafe package directory" }
        val manifest = localMetadata(File(dir, "manifest.json"), MANIFEST_LIMIT)
        val signature = localMetadata(File(dir, "manifest.sig"), SIGNATURE_LIMIT)
        val descriptors = verify(manifest, signature, version)
        for ((path, descriptor) in descriptors) {
            val file = File(dir, path)
            check(file.canonicalFile == file.absoluteFile) { "Unsafe package file: $path" }
            check(file.isFile && file.length() == descriptor.size) { "Missing or wrong size: $path" }
            file.inputStream().use { checkDigest(it, descriptor) }
        }
        Snapshot(version, dir, descriptors.keys)
    } catch (error: Exception) {
        log("Cannot open OTA package $version", error)
        null
    }

    private fun verify(bytes: ByteArray, signature: ByteArray, version: String): Map<String, Descriptor> {
        val verifier = Signature.getInstance("SHA256withECDSA").apply {
            initVerify(config.publicKey)
            update(bytes)
        }
        val encoded = signature.decodeToString().filterNot(Char::isWhitespace)
        check(verifier.verify(Base64.getDecoder().decode(encoded))) { "Invalid OTA signature" }
        val json = parseOtaObject(bytes.decodeToString())
        check(integer(json.getValue("schemaVersion")) == 1L) { "Unsupported manifest schema" }
        check(json.otaString("platform") == "android") { "Wrong manifest platform" }
        check(json.otaString("appVersion") == config.appVersion) { "Wrong manifest app version" }
        check(json.otaString("version") == version && validVersion(version)) { "Wrong manifest version" }
        val files = json.getValue("files").jsonObject
        check(files.size in 1..MAX_FILES) { "Invalid file count" }
        var total = 0L
        val foundModules = mutableSetOf<String>()
        val result = linkedMapOf<String, Descriptor>()
        for (path in files.keys) {
            check(filePattern.matches(path) && path.split('/').none { it == "." || it == ".." }) { "Invalid file path" }
            if (path.startsWith("modules/")) {
                val filename = path.removePrefix("modules/")
                val module = when {
                    filename.endsWith(".valdimodule") -> filename.removeSuffix(".valdimodule").also { foundModules.add(it) }
                    filename.endsWith(".map.json") -> filename.removeSuffix(".map.json")
                    else -> error("Unknown module file")
                }
                check(module in config.modules) { "Unknown module or map" }
            } else {
                check(config.modules.any { path.substringAfterLast('/').startsWith("${it}_") }) { "Foreign module resource" }
            }
            val descriptor = files.getValue(path).jsonObject
            val hash = descriptor.otaString("sha256")
            check(hashPattern.matches(hash)) { "Invalid SHA256" }
            val size = integer(descriptor.getValue("size"))
            check(size >= 0 && size <= MAX_PACKAGE_BYTES - total) { "Invalid package size" }
            total += size
            result[path] = Descriptor(hash, size)
        }
        check(foundModules == config.modules) { "Incomplete module inventory" }
        return result
    }

    private fun tryCopy(target: File, descriptor: Descriptor, input: () -> InputStream?): Boolean = try {
        val stream = input()
        if (stream == null) false else stream.use { copyVerified(it, target, descriptor); true }
    } catch (error: Exception) {
        log("Cannot reuse OTA file ${target.name}", error)
        false
    }

    private fun copyVerified(input: InputStream, target: File, descriptor: Descriptor) {
        val partial = File(target.parentFile, ".${target.name}.${UUID.randomUUID()}.part")
        try {
            FileOutputStream(partial).use { output ->
                checkDigest(input, descriptor) { buffer, count -> output.write(buffer, 0, count) }
                output.fd.sync()
            }
            check(partial.renameTo(target)) { "Cannot complete package file" }
        } finally {
            partial.delete()
        }
    }

    private fun checkDigest(input: InputStream, descriptor: Descriptor, consume: (ByteArray, Int) -> Unit = { _, _ -> }) {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(64 * 1024)
        var count = 0L
        while (true) {
            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), descriptor.size - count + 1).toInt())
            if (read < 0) break
            check(read > 0) { "Empty stream read" }
            count += read
            check(count <= descriptor.size) { "File exceeds declared size" }
            digest.update(buffer, 0, read)
            consume(buffer, read)
        }
        check(count == descriptor.size) { "File shorter than declared size" }
        check(hex(digest.digest()) == descriptor.sha256) { "File SHA256 mismatch" }
    }

    private fun metadata(url: String, limit: Int): ByteArray = request(url, null, limit) { bounded(it, limit) }

    private fun <T> request(url: String, expectedSize: Long?, limit: Int? = null, read: (InputStream) -> T): T {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Accept-Encoding", "identity")
        connection.setRequestProperty("Cache-Control", "no-cache, no-store")
        connection.setRequestProperty("Pragma", "no-cache")
        try {
            check(connection.responseCode == 200) { "OTA HTTP status ${connection.responseCode}" }
            check(connection.contentEncoding.isNullOrEmpty() || connection.contentEncoding.equals("identity", true)) {
                "Unsupported OTA content encoding"
            }
            val length = connection.contentLengthLong
            if (expectedSize != null && length >= 0) check(length == expectedSize) { "Wrong HTTP content length" }
            if (limit != null && length >= 0) check(length <= limit) { "OTA metadata exceeds limit" }
            return connection.inputStream.use(read)
        } finally {
            connection.disconnect()
        }
    }

    private fun readState(): State {
        val file = File(root, "state.json")
        if (!file.exists()) return State("")
        val json = parseOtaObject(localMetadata(file, MANIFEST_LIMIT).decodeToString())
        fun version(name: String): String? {
            val value = json.getValue(name)
            if (value == JsonNull) return null
            val version = value.otaString()
            check(validVersion(version)) { "Invalid cached version" }
            return version
        }
        return State(json.otaString("binary"), version("current"), version("pending"))
    }

    private fun writeState(state: State) {
        val bytes = buildJsonObject {
            put("binary", state.binary)
            put("current", state.current?.let(::JsonPrimitive) ?: JsonNull)
            put("pending", state.pending?.let(::JsonPrimitive) ?: JsonNull)
        }.toString().toByteArray(Charsets.UTF_8)
        check(bytes.size <= MANIFEST_LIMIT) { "OTA state exceeds limit" }
        stateWriter(File(root, "state.json"), bytes)
    }

    private fun cleanup(state: State) {
        val retained = setOfNotNull(state.current, state.pending, active?.version)
        packages.listFiles()?.filter { it.name !in retained }?.forEach { deleteTree(it) }
    }

    /** FileTreeWalk/deleteRecursively follows directory symlinks, including links to retained packages. */
    private fun deleteTree(file: File): Boolean {
        if (!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) return true
        return try {
            Files.walkFileTree(file.toPath(), object : SimpleFileVisitor<Path>() {
                override fun visitFile(path: Path, attributes: BasicFileAttributes): FileVisitResult {
                    Files.delete(path)
                    return FileVisitResult.CONTINUE
                }
                override fun postVisitDirectory(path: Path, error: IOException?): FileVisitResult {
                    if (error != null) throw error
                    Files.delete(path)
                    return FileVisitResult.CONTINUE
                }
            })
            true
        } catch (error: IOException) {
            log("Cannot clean OTA output ${file.name}", error)
            false
        }
    }

    companion object {
        private const val MAX_PACKAGE_BYTES = 64L shl 20
        private const val MAX_FILES = 4096
        private const val LATEST_LIMIT = 64 * 1024
        private const val MANIFEST_LIMIT = 1024 * 1024
        private const val SIGNATURE_LIMIT = 4096
        private val versionPattern = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
        private fun validVersion(version: String) = versionPattern.matches(version) && !version.equals("latest.json", true)
        private val modulePattern = Regex("[A-Za-z0-9_@][A-Za-z0-9._@-]*")
        private val filePattern = Regex("(modules|res)(/[A-Za-z0-9_@][A-Za-z0-9._@-]*)+")
        private val hashPattern = Regex("[0-9a-f]{64}")
        private fun integer(value: JsonElement): Long = value.otaLong()
        private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
        private fun localMetadata(file: File, limit: Int) = file.inputStream().use { bounded(it, limit) }
        private fun bounded(input: InputStream, limit: Int): ByteArray {
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer, 0, minOf(buffer.size, limit - output.size() + 1))
                if (read < 0) return output.toByteArray()
                check(read > 0 && output.size() + read <= limit) { "OTA metadata exceeds limit" }
                output.write(buffer, 0, read)
            }
        }
        private fun writeSynced(file: File, bytes: ByteArray) {
            FileOutputStream(file).use { it.write(bytes); it.fd.sync() }
        }
        private fun syncDirectory(directory: File) {
            FileChannel.open(directory.toPath(), StandardOpenOption.READ).use { it.force(true) }
        }
        internal fun writeStateAtomically(file: File, bytes: ByteArray) {
            check(file.parentFile!!.mkdirs() || file.parentFile!!.isDirectory) { "Cannot create OTA state directory" }
            val temp = File(file.parentFile, ".state-${UUID.randomUUID()}.part")
            try {
                writeSynced(temp, bytes)
                Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
                syncDirectory(file.parentFile!!)
            } finally {
                temp.delete()
            }
        }
    }
}
