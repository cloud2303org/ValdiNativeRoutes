package io.valdiroutes.app

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.InetSocketAddress
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.BeforeClass
import org.junit.Test

class ValdiOtaSplitTest {
    internal class Fixture(fixtureName: String = "") : AutoCloseable {
        val root = Files.createTempDirectory("ota-split-").toFile()
        val fixture = File(File(System.getenv("OTA_SPLIT_FIXTURES")), fixtureName)
        val data = Json.parseToJsonElement(File(fixture, "fixture.json").readText()).jsonObject
        val key = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
        val pem = Base64.getEncoder().encodeToString(key.public.encoded)
        val bodies = ConcurrentHashMap<String, ByteArray>()
        val hits = ConcurrentHashMap<String, AtomicInteger>()
        val responses = ConcurrentHashMap<String, (HttpExchange) -> Unit>()
        val executor = Executors.newCachedThreadPool()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            this.executor = this@Fixture.executor
            createContext("/") { exchange ->
                val path = exchange.requestURI.path.removePrefix("/android/0.1/")
                hits.computeIfAbsent(path) { AtomicInteger() }.incrementAndGet()
                try {
                    val response = responses[path]
                    if (response != null) response(exchange)
                    else {
                        val body = bodies[path]
                        exchange.sendResponseHeaders(if (body == null) 404 else 200, body?.size?.toLong() ?: -1)
                        exchange.responseBody.use { if (body != null) it.write(body) }
                    }
                } finally { exchange.close() }
            }
            start()
        }
        val url = "http://127.0.0.1:${server.address.port}"
        var baseArchiveOverride: ByteArray? = null
        val base get() = baseArchiveOverride ?: File(fixture, "base.zst").readBytes()
        val target get() = File(fixture, "target.zst").readBytes()
        var bundled: ByteArray? = base
        var failWrites = false
        val logs = mutableListOf<String>()
        fun client(codec: OtaFileCodec = NativeOtaFileCodec) = ValdiOtaClient(root, ValdiOtaClient.Config("0.1", url, pem, setOf("app_pages")), "binary",
            bundled = { if (it == "app_pages.valdimodule") bundled?.inputStream() else null },
            stateWriter = { file, bytes ->
                if (failWrites) throw IOException("state failure")
                ValdiOtaClient.writeStateAtomically(file, bytes)
            }, log = { message, error -> logs += "$message: ${error.message}" }, codec = codec)
        fun sign(bytes: ByteArray) = Base64.getEncoder().encode(Signature.getInstance("SHA256withECDSA").run {
            initSign(key.private); update(bytes); sign()
        })
        fun publish(version: String, archive: ByteArray, delta: JsonObject? = null, edit: (JsonObject) -> JsonObject = { it }) {
            val manifest = buildJsonObject {
                put("schemaVersion", 1)
                put("platform", "android")
                put("appVersion", "0.1")
                put("version", version)
                putJsonObject("files") { put(MODULE, descriptor(archive)) }
                if (delta != null) {
                    val bytes = delta.toString().toByteArray()
                    val baseVersion = delta.getValue("baseVersion").jsonPrimitive.content
                    val path = "deltas/$baseVersion/manifest.json"
                    bodies["$version/$path"] = bytes
                    putJsonArray("deltas") {
                        add(descriptor(bytes).withFields {
                            put("path", path)
                            put("baseVersion", baseVersion)
                            put("baseSha256", hash(base))
                        })
                    }
                }
            }
            val bytes = edit(manifest).toString().toByteArray()
            bodies["$version/manifest.json"] = bytes
            bodies["$version/manifest.sig"] = sign(bytes)
            bodies["$version/$MODULE"] = archive
            bodies["latest.json"] = buildJsonObject { put("version", version) }.toString().toByteArray()
        }
        fun delta(baseVersion: String = "pages-001", version: String = "target"): JsonObject = data.withFields {
            put("baseVersion", baseVersion)
            put("version", version)
            put("entries", JsonArray(data.getValue("entries").jsonArray.map { value ->
                val entry = value.jsonObject
                if ("download" in entry) {
                    entry.editObject("download") { download ->
                        val filename = download.getValue("path").jsonPrimitive.content.substringAfterLast('/')
                        val path = "deltas/$baseVersion/payload/$filename"
                        bodies["$version/$path"] = File(fixture, filename).readBytes()
                        download.withFields { put("path", path) }
                    }
                } else entry
            }))
        }
        fun count(path: String) = hits[path]?.get() ?: 0
        fun output(version: String = "target") = File(root, "packages/$version/$MODULE")
        fun noWork() = assertFalse(root.walkTopDown().any { it.name.startsWith(".work-") || it.name.endsWith(".part") })
        override fun close() { server.stop(0); executor.shutdownNow(); root.deleteRecursively() }
    }

    @Test fun bundledSplitRebuildsExactPacketOrderWithChangedNewAndDeletedEntries() = Fixture().use { f ->
        val client = f.client()
        assertNull(client.start())
        f.publish("target", f.target, f.delta())
        assertTrue(client.checkForUpdate())
        assertArrayEquals(f.target, f.output().readBytes())
        assertEquals("Split must avoid full module download", 0, f.count("target/$MODULE"))
        assertEquals(1, f.count("target/deltas/pages-001/manifest.json"))
        assertNull(client.start())
        repeat(3) {
            val next = f.client()
            val selected = next.start()!!
            assertEquals("target", selected.version)
            assertArrayEquals(f.target, selected.module("app_pages.valdimodule")!!.readBytes())
            assertFalse(next.checkForUpdate())
            val state = Json.parseToJsonElement(File(f.root, "state.json").readText()).jsonObject
            assertEquals("target", state.getValue("current").jsonPrimitive.content)
            assertEquals(JsonNull, state.getValue("pending"))
        }
        assertEquals(1, f.count("target/manifest.json"))
        assertEquals(1, f.count("target/deltas/pages-001/manifest.json"))
        assertEquals(0, f.count("target/$MODULE"))
        f.noWork()
    }

    @Test fun activeSplitNeverPatchesTheActiveSnapshotAndNeverUsesPendingAsBase() = Fixture().use { f ->
        val first = f.client()
        first.start()
        f.publish("base", f.base)
        assertTrue(first.checkForUpdate())
        f.bundled = null
        val client = f.client()
        val active = client.start()!!
        val oldBytes = active.module("app_pages.valdimodule")!!.readBytes()
        f.publish("target", f.target, f.delta("base"))
        assertTrue(client.checkForUpdate())
        assertEquals(0, f.count("target/$MODULE"))
        assertSame(active, client.start())
        assertArrayEquals(oldBytes, active.module("app_pages.valdimodule")!!.readBytes())
        f.publish("next", f.target, f.delta("target", "next"))
        // Full artifact reuse from pending remains allowed, but pending must not be a split base.
        assertTrue(client.checkForUpdate())
        assertEquals(0, f.count("next/deltas/target/manifest.json"))
        assertArrayEquals(oldBytes, active.module("app_pages.valdimodule")!!.readBytes())
        f.noWork()
    }

    @Test fun inaccurateOrAbsentIntermediateChecksumsStillStageTheExactRealCodecResult() {
        for (mode in listOf("inaccurate", "absent")) Fixture().use { f ->
            fun informational(json: JsonObject, keys: Set<String>): JsonObject =
                if (mode == "absent") JsonObject(json - keys) else json.withFields {
                    keys.forEach { put(it, "not-a-checksum") }
                    put("futureMetadata", buildJsonObject { put("ignored", true) })
                }
            val delta = informational(f.delta(), setOf(
                "baseSha256", "targetSha256", "basePacketSha256", "targetPacketSha256",
            )).editArrayEntries { entry ->
                informational(entry, setOf("sha256", "baseSha256")).let {
                    if ("download" in it) it.editObject("download") { payload ->
                        informational(payload, setOf("sha256"))
                    } else it
                }
            }
            val patchPath = delta.getValue("entries").jsonArray[5].jsonObject
                .getValue("download").jsonObject.otaString("path")
            val client = f.client(); client.start()
            f.publish("target", f.target, delta) { manifest ->
                manifest.editEntry("deltas", 0) { descriptor ->
                    informational(descriptor, setOf("sha256", "baseSha256"))
                }
            }
            assertTrue(mode, client.checkForUpdate())
            assertEquals("$mode: ${f.logs}", 0, f.count("target/$MODULE"))
            assertEquals("Real HDiff payload must be consumed", 1, f.count("target/$patchPath"))
            assertArrayEquals(mode, f.target, f.output().readBytes())
            assertEquals("target", client.getInfo().pendingBundleVersion)
            assertEquals("pages-001", client.getInfo().bundleVersion)
            f.noWork()
        }
    }

    @Test fun splitMetadataNeedsOnlyFieldsUsedForReconstruction() = Fixture().use { f ->
        val delta = buildJsonObject { put("entries", f.delta().getValue("entries")) }
        val client = f.client(); client.start()
        f.publish("target", f.target, f.delta()) { manifest ->
            f.bodies["target/deltas/pages-001/manifest.json"] = delta.toString().toByteArray()
            manifest.editEntry("deltas", 0) { it.withFields { put("size", delta.toString().toByteArray().size) } }
        }
        assertTrue(client.checkForUpdate())
        assertEquals(f.logs.toString(), 0, f.count("target/$MODULE"))
        assertArrayEquals(f.target, f.output().readBytes())
        f.noWork()
    }

    @Test fun signedFullDescriptorAndSignatureRemainRequiredForSplitStaging() {
        for (fault in listOf("signature", "final-sha", "final-size")) Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("target", f.target, f.delta()) { manifest ->
                if (fault == "signature") manifest else manifest.editObject("files") { files ->
                    files.editObject(MODULE) { descriptor ->
                        descriptor.withFields {
                            if (fault == "final-sha") put("sha256", "0".repeat(64))
                            else put("size", f.target.size + 1)
                        }
                    }
                }
            }
            if (fault == "signature") f.bodies["target/manifest.sig"] = "AAAA".toByteArray()
            expectFailure { client.checkForUpdate() }
            assertFalse(fault, f.output().exists())
            assertNull(client.getInfo().pendingBundleVersion)
            assertEquals(fault, if (fault == "signature") 0 else 1, f.count("target/deltas/pages-001/manifest.json"))
            assertEquals(fault, if (fault == "signature") 0 else 1, f.count("target/$MODULE"))
            if (fault != "signature") assertTrue(f.logs.toString(), f.logs.any { it.contains("hash/size mismatch") })
            f.noWork()
        }
    }

    @Test fun informationalSplitMetadataDoesNotForceFullDownload() {
        val edits = listOf<Pair<String, (JsonObject) -> JsonObject>>(
            "schema" to { it.withFields { put("schemaVersion", 2) } },
            "algorithm" to { it.withFields { put("algorithm", "other") } },
            "format" to { it.withFields { put("format", "HDIFF13") } },
            "compression" to { it.withFields { put("compression", "lzma") } },
            "platform" to { it.withFields { put("platform", "ios") } },
            "appVersion" to { it.withFields { put("appVersion", "other") } },
            "version" to { it.withFields { put("version", "other") } },
            "base archive" to { it.withFields { put("baseSha256", "0".repeat(64)) } },
            "target archive" to { it.withFields { put("targetSha256", "0".repeat(64)) } },
            "base packet" to { it.withFields { put("basePacketSha256", "0".repeat(64)) } },
            "target packet" to { it.withFields { put("targetPacketSha256", "0".repeat(64)) } },
            "packet size" to { it.withFields { put("targetPacketSize", 64L * 1024 * 1024 + 1) } },
            "packet size type" to { it.withFields { put("targetPacketSize", "100") } },
            "packet size short" to { it.withFields { put("targetPacketSize", 8) } },
            "entry hash" to { it.editEntry("entries", 0) { entry -> entry.withFields { put("sha256", "0".repeat(64)) } } },
            "patch base hash" to { it.editEntry("entries", 5) { entry -> entry.withFields { put("baseSha256", "0".repeat(64)) } } },
            "missing patch base hash" to { it.editEntry("entries", 5) { entry -> JsonObject(entry - "baseSha256") } },
            "patch target hash" to { it.editEntry("entries", 5) { entry -> entry.withFields { put("sha256", "0".repeat(64)) } } },
            "payload hash" to { it.editEntry("entries", 0) { entry ->
                entry.editObject("download") { payload -> payload.withFields { put("sha256", "0".repeat(64)) } }
            } },
            "extra keys" to { json -> json.withFields {
                put("future", buildJsonObject { put("any", JsonArray(listOf(JsonNull, JsonPrimitive(42)))) })
            } },
        )
        for ((label, edit) in edits) Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("target", f.target, edit(f.delta()))
            assertTrue(label, client.checkForUpdate())
            assertEquals("$label: ${f.logs}", 0, f.count("target/$MODULE"))
            assertArrayEquals(label, f.target, f.output().readBytes())
            f.noWork()
        }
    }

    @Test fun malformedSplitMetadataAlwaysDownloadsTheSignedFullArtifact() {
        val edits = listOf<Pair<String, (JsonObject) -> JsonObject>>(
            "entry size" to { it.editEntry("entries", 0) { entry -> entry.withFields { put("size", -1) } } },
            "entry size limit" to { it.editEntry("entries", 0) { entry -> entry.withFields { put("size", (64L shl 20) + 1) } } },
            "computed packet limit" to { it.editEntry("entries", 0) { entry -> entry.withFields { put("size", 64L shl 20) } } },
            "payload budget" to { it.editEntry("entries", 0) { entry ->
                entry.editObject("download") { payload -> payload.withFields { put("size", 64L shl 20) } }
            } },
            "operation" to { it.editEntry("entries", 0) { entry -> entry.withFields { put("operation", "unknown") } } },
            "duplicate" to { json -> json.withFields {
                val entries = json.getValue("entries").jsonArray
                put("entries", JsonArray(entries + entries[0]))
            } },
            "count" to { json -> json.withFields {
                val entries = json.getValue("entries").jsonArray
                put("entries", JsonArray(entries + List(4097) { entries[0] }))
            } },
            "missing copy" to { it.editEntry("entries", 1) { entry -> entry.withFields { put("name", "miss") } } },
            "copy size" to { it.editEntry("entries", 1) { entry -> entry.withFields { put("size", 10) } } },
        ) + listOf("/absolute", "../escape", "a/../x", "a/./b", "a//b", "a\\b", "a\u0000b", "", "a/").map { name ->
            name to { json: JsonObject -> json.editEntry("entries", 0) { entry -> entry.withFields { put("name", name) } } }
        }
        for ((label, edit) in edits) Fixture().use { f ->
            val client = f.client()
            client.start()
            f.publish("target", f.target, edit(f.delta()))
            assertTrue(label, client.checkForUpdate())
            assertEquals(label, 1, f.count("target/$MODULE"))
            assertArrayEquals(label, f.target, f.output().readBytes())
            assertTrue(label, f.logs.any { it.startsWith("Split OTA failed") })
            f.noWork()
        }
    }

    @Test fun invalidSignedDeltaDescriptorsAreOptionalAndFallBackToFull() {
        val edits = listOf<(JsonObject) -> JsonObject>(
            { it.withFields { put("path", "deltas/pages-001/other.json") } },
            { it.withFields { put("baseVersion", "latest.json") } },
            { it.withFields { put("size", 1024 * 1024 + 1) } },
            { it.withFields { put("size", 1) } },
            { it.withFields { put("size", "1") } },
        )
        for ((index, edit) in edits.withIndex()) Fixture().use { f ->
            val client = f.client()
            client.start()
            f.publish("target", f.target, f.delta()) { json -> json.editEntry("deltas", 0, edit) }
            assertTrue("descriptor $index", client.checkForUpdate())
            assertEquals(1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
        Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("target", f.target, f.delta()) { json ->
                val array = json.getValue("deltas").jsonArray
                json.withFields { put("deltas", JsonArray(array + List(8) { array[0] })) }
            }
            assertTrue(client.checkForUpdate())
            assertEquals(0, f.count("target/deltas/pages-001/manifest.json"))
            assertEquals(1, f.count("target/$MODULE"))
            f.noWork()
        }
    }

    @Test fun signedDeltaSelectionUsesRunningVersionAndIgnoresInformationalHashes() {
        val edits = listOf<(JsonObject) -> JsonObject>(
            { it.withFields { put("baseSha256", "A".repeat(64)) } },
            { it.withFields { put("baseSha256", "0".repeat(64)) } },
            { it.withFields { put("sha256", "0".repeat(64)) } },
            { JsonObject(it - setOf("sha256", "baseSha256")) },
        )
        for ((index, edit) in edits.withIndex()) Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("target", f.target, f.delta()) { json -> json.editEntry("deltas", 0, edit) }
            assertTrue("descriptor $index", client.checkForUpdate())
            assertEquals(f.logs.toString(), 0, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
        Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("target", f.target, f.delta("other"))
            assertTrue(client.checkForUpdate())
            assertEquals(0, f.count("target/deltas/other/manifest.json"))
            assertEquals(1, f.count("target/$MODULE"))
            f.noWork()
        }
    }

    @Test fun corruptOversizedAndForeignPayloadsNeverEscapeFullFallback() {
        val edits = listOf<Pair<String, (JsonObject) -> JsonObject>>(
            "size" to { it.withFields { put("size", 64L * 1024 * 1024 + 1) } },
            "length" to { json -> json.withFields { put("size", json.getValue("size").jsonPrimitive.long + 1) } },
            "encoding" to { it.withFields { put("encoding", "gzip") } },
            "foreign path" to { json -> json.withFields { put("path", "deltas/other/payload/" + json.getValue("path").jsonPrimitive.content.substringAfterLast('/')) } },
            "traversal" to { it.withFields { put("path", "deltas/pages-001/payload/../manifest.json") } },
            "extension" to { json -> json.withFields { put("path", json.getValue("path").jsonPrimitive.content.replace(".bin", ".hdiff")) } },
        )
        for ((label, edit) in edits) Fixture().use { f ->
            val client = f.client(); client.start()
            val delta = f.delta().editEntry("entries", 0) { entry -> entry.editObject("download", edit) }
            f.publish("target", f.target, delta)
            assertTrue(label, client.checkForUpdate())
            assertEquals(label, 1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
        for (fault in listOf("corrupt", "oversize", "missing", "bad-zstd")) Fixture().use { f ->
            val client = f.client(); client.start()
            var delta = f.delta()
            val payload = delta.getValue("entries").jsonArray[3].jsonObject.getValue("download").jsonObject
            val path = "target/${payload.getValue("path").jsonPrimitive.content}"
            when (fault) {
                "missing" -> f.bodies.remove(path)
                "bad-zstd" -> {
                    val bad = "not zstd".toByteArray()
                    f.bodies[path] = bad
                    delta = delta.editEntry("entries", 3) { entry ->
                        entry.editObject("download") { download ->
                            download.withFields {
                                put("size", bad.size)
                                put("sha256", hash(bad))
                            }
                        }
                    }
                }
                "corrupt" -> f.bodies[path] = f.bodies[path]!!.copyOf().also { it[it.size - 1] = (it.last().toInt() xor 1).toByte() }
                else -> {
                    val payloadBytes = f.bodies[path]!!
                    f.responses[path] = { exchange ->
                        exchange.sendResponseHeaders(200, 0)
                        try { exchange.responseBody.use { it.write(payloadBytes); it.write(1) } } catch (_: IOException) {}
                    }
                }
            }
            f.publish("target", f.target, delta)
            assertTrue(fault, client.checkForUpdate())
            assertEquals(fault, 1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
    }

    @Test fun splitPacketsLargerThanJvmHeapAreIndexedAndRebuiltAsFiles() = Fixture("large").use { f ->
        assertTrue(f.data.getValue("targetPacketSize").jsonPrimitive.long > Runtime.getRuntime().maxMemory())
        val client = f.client(); client.start()
        f.publish("target", f.target, f.delta())
        assertTrue(client.checkForUpdate())
        assertEquals(f.logs.toString(), 0, f.count("target/$MODULE"))
        assertArrayEquals(f.target, f.output().readBytes())
        f.noWork()
    }

    @Test fun malformedBasePacketsAreRejectedBeforeRebuilding() {
        val examples = Json.parseToJsonElement(File(System.getenv("OTA_SPLIT_FIXTURES"), "bad-bases.json").readText()).jsonArray
        for (value in examples) Fixture().use { f ->
            val example = value.jsonObject
            f.baseArchiveOverride = File(f.fixture, example.getValue("file").jsonPrimitive.content).readBytes()
            f.bundled = f.base
            val client = f.client(); client.start()
            val delta = f.delta().withFields {
                put("baseSha256", hash(f.base))
                put("basePacketSha256", example.getValue("packetSha256"))
            }
            f.publish("target", f.target, delta)
            assertTrue(example.toString(), client.checkForUpdate())
            assertEquals(example.toString(), 1, f.count("target/$MODULE"))
            assertTrue(f.logs.toString(), f.logs.any { it.startsWith("Split OTA failed") })
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
    }

    @Test fun deletedBaseEntryNamesCannotAccumulateBeyondTheJvmHeap() = Fixture().use { f ->
        f.baseArchiveOverride = File(f.fixture, "many-names.zst").readBytes()
        f.bundled = f.base
        val client = f.client(); client.start()
        val delta = f.delta().withFields {
            put("baseSha256", hash(f.base))
            put("basePacketSha256", File(f.fixture, "many-names.sha256").readText())
        }
        f.publish("target", f.target, delta)
        assertTrue(client.checkForUpdate())
        assertEquals(f.logs.toString(), 0, f.count("target/$MODULE"))
        assertArrayEquals(f.target, f.output().readBytes())
        f.noWork()
    }

    @Test fun driveAbsoluteNamesAreRejectedEvenWhenPacketAndCompressedHashesMatch() = Fixture().use { f ->
        val archive = File(f.fixture, "drive-target.zst").readBytes()
        val delta = f.delta().withFields {
            put("targetSha256", hash(archive))
            put("targetPacketSha256", File(f.fixture, "drive-target.sha256").readText())
        }.editEntry("entries", 4) { entry -> entry.withFields { put("name", "C:/x") } }
        val client = f.client(); client.start()
        f.publish("target", archive, delta)
        assertTrue(client.checkForUpdate())
        assertEquals("Unsafe split names must use the original signed full artifact", 1, f.count("target/$MODULE"))
        assertArrayEquals(archive, f.output().readBytes())
        f.noWork()
    }

    @Test fun missingCodecBadBaseAndWrongCodecOutputFallBackToFull() {
        for (fault in listOf("missing-codec", "corrupt-base", "missing-base", "wrong-output", "wrong-recompression")) Fixture().use { f ->
            val codec = object : OtaFileCodec {
                override fun decode(input: File, output: File, maxOutput: Long): Int {
                    if (fault == "missing-codec") throw UnsatisfiedLinkError("missing test codec")
                    val status = NativeOtaFileCodec.decode(input, output, maxOutput)
                    if (fault == "wrong-output" && status == 0) output.appendBytes(byteArrayOf(1))
                    return status
                }
                override fun encode(input: File, output: File, maxOutput: Long): Int {
                    val status = NativeOtaFileCodec.encode(input, output, maxOutput)
                    if (fault == "wrong-recompression" && status == 0) {
                        RandomAccessFile(output, "rw").use {
                            it.seek(output.length() - 1)
                            val byte = it.read()
                            it.seek(output.length() - 1)
                            it.write(byte xor 1)
                        }
                    }
                    return status
                }
                override fun patch(old: File, patch: File, output: File, expectedSize: Long) =
                    NativeOtaFileCodec.patch(old, patch, output, expectedSize)
            }
            if (fault == "corrupt-base") f.bundled = "corrupt".toByteArray()
            if (fault == "missing-base") f.bundled = null
            val client = f.client(codec); client.start()
            f.publish("target", f.target, f.delta())
            assertTrue(fault, client.checkForUpdate())
            assertEquals(fault, 1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            if (fault == "wrong-recompression") assertTrue(f.logs.any { it.contains("hash/size mismatch") })
            f.noWork()
        }
    }

    @Test fun realHdiffPatchIsUsedAndInvalidPatchMetadataFallsBack() {
        Fixture().use { f ->
            val client = f.client(); client.start()
            val delta = f.delta()
            val patch = delta.getValue("entries").jsonArray[5].jsonObject
            assertEquals("patch", patch.getValue("operation").jsonPrimitive.content)
            f.publish("target", f.target, delta)
            assertTrue(client.checkForUpdate())
            assertEquals(1, f.count("target/${patch.getValue("download").jsonObject.getValue("path").jsonPrimitive.content}"))
            assertEquals(f.logs.toString(), 0, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
        val edits = listOf<Pair<String, (JsonObject) -> JsonObject>>(
            "non HBC" to { it.withFields { put("name", "entry.js") } },
            "non js" to { it.withFields { put("name", "keep") } },
            "target size" to { json -> json.withFields { put("size", json.getValue("size").jsonPrimitive.long + 4) } },
            "encoding" to { it.editObject("download") { download -> download.withFields { put("encoding", "raw") } } },
        )
        for ((label, edit) in edits) Fixture().use { f ->
            val client = f.client(); client.start()
            val delta = f.delta().editEntry("entries", 5, edit)
            f.publish("target", f.target, delta)
            assertTrue(label, client.checkForUpdate())
            assertEquals(label, 1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            f.noWork()
        }
        for (fault in listOf("format", "compression", "truncated", "wrong-size", "wrong-output", "step-memory")) Fixture().use { f ->
            val client = f.client(); client.start()
            val originalDelta = f.delta()
            val download = originalDelta.getValue("entries").jsonArray[5].jsonObject.getValue("download").jsonObject
            val path = "target/${download.getValue("path").jsonPrimitive.content}"
            val original = f.bodies[path]!!
            val changed = when (fault) {
                "format" -> original.copyOf().also { it[8] = '1'.code.toByte() }
                "compression" -> original.copyOf().also { it[10] = 'x'.code.toByte() }
                "truncated" -> original.copyOf(original.size - 1)
                "wrong-output" -> File(f.fixture, "wrong-output.hdiff").readBytes()
                else -> mutatePatchHeader(original, if (fault == "step-memory") 3 else 0,
                    if (fault == "step-memory") 32L * 1024 * 1024 + 1 else 1)
            }
            f.bodies[path] = changed
            val delta = originalDelta.editEntry("entries", 5) { entry ->
                entry.editObject("download") { payload ->
                    payload.withFields {
                        put("sha256", hash(changed))
                        put("size", changed.size)
                    }
                }
            }
            f.publish("target", f.target, delta)
            assertTrue(fault, client.checkForUpdate())
            assertEquals(fault, 1, f.count("target/$MODULE"))
            assertArrayEquals(f.target, f.output().readBytes())
            if (fault == "wrong-output") assertTrue(f.logs.toString(), f.logs.any { it.contains("hash/size mismatch") })
            f.noWork()
        }
    }

    @Test fun interruptedSplitAndStateFailurePreserveActiveAndRemoveNewWork() = Fixture().use { f ->
        val first = f.client(); first.start()
        f.publish("base", f.base)
        assertTrue(first.checkForUpdate())
        f.bundled = null
        val client = f.client()
        val active = client.start()!!
        val before = File(f.root, "state.json").readBytes()
        f.publish("target", f.target, f.delta("base"))
        // Both delta and full are unavailable: leave the running snapshot intact.
        val entry = f.data.getValue("entries").jsonArray[0].jsonObject.getValue("download").jsonObject
        val payloadPath = "target/deltas/base/payload/${entry.getValue("path").jsonPrimitive.content.substringAfterLast('/')}"
        val payload = f.bodies[payloadPath]!!
        f.responses[payloadPath] = { exchange ->
            exchange.sendResponseHeaders(200, payload.size.toLong())
            try { exchange.responseBody.use { it.write(payload, 0, payload.size / 2) } } catch (_: IOException) {}
        }
        f.bodies.remove("target/$MODULE")
        expectFailure { client.checkForUpdate() }
        assertArrayEquals(before, File(f.root, "state.json").readBytes())
        assertArrayEquals(f.base, active.module("app_pages.valdimodule")!!.readBytes())
        f.noWork()
        f.responses.remove(payloadPath)
        f.publish("target", f.target, f.delta("base"))
        f.failWrites = true
        expectFailure { client.checkForUpdate() }
        assertArrayEquals(before, File(f.root, "state.json").readBytes())
        assertFalse(f.output().exists())
        assertEquals("The second attempt rebuilt via split before the state write failed", 1, f.count("target/$MODULE"))
        assertArrayEquals(f.base, active.module("app_pages.valdimodule")!!.readBytes())
        f.noWork()
    }

    companion object {
        @BeforeClass
        @JvmStatic
        fun requireSplitFixtures() {
            assumeTrue("Split OTA fixtures require ValdiOtaRun.py", System.getenv("OTA_SPLIT_FIXTURES") != null)
        }

        private const val MODULE = "modules/app_pages.valdimodule"
        private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        private fun descriptor(bytes: ByteArray) = buildJsonObject {
            put("sha256", hash(bytes))
            put("size", bytes.size)
        }
        private fun JsonObject.editArrayEntries(edit: (JsonObject) -> JsonObject) = withFields {
            put("entries", JsonArray(getValue("entries").jsonArray.map { edit(it.jsonObject) }))
        }
        private fun expectFailure(block: () -> Unit) {
            try { block() } catch (_: Exception) { return }
            fail("Expected failure")
        }
        private fun mutatePatchHeader(bytes: ByteArray, index: Int, value: Long): ByteArray {
            var offset = bytes.indexOf(0) + 1
            val prefix = bytes.copyOf(offset)
            val values = (0 until 6).map {
                var result = 0L
                do {
                    val byte = bytes[offset++].toInt() and 255
                    result = (result shl 7) or (byte and 127).toLong()
                } while (byte >= 128)
                result
            }.toMutableList()
            values[index] = value
            val packed = values.flatMap {
                var rest = it
                val list = mutableListOf((rest and 127).toByte())
                rest = rest ushr 7
                while (rest > 0) {
                    list.add(((rest and 127) or 128).toByte())
                    rest = rest ushr 7
                }
                list.reversed()
            }.toByteArray()
            return prefix + packed + bytes.copyOfRange(offset, bytes.size)
        }
    }
}

/** Executed in a separate JVM whose java.library.path contains no codec library. */
class ValdiOtaNoCodecTest {
    companion object {
        @BeforeClass
        @JvmStatic
        fun requireSplitFixtures() {
            assumeTrue("Split OTA fixtures require ValdiOtaRun.py", System.getenv("OTA_SPLIT_FIXTURES") != null)
        }
    }

    @Test fun realMissingJniLibraryPreservesBundledStartupAndSignedFullFallback() = ValdiOtaSplitTest.Fixture().use { f ->
        val client = f.client()
        assertNull(client.start())
        f.publish("target", f.target, f.delta())
        assertTrue(client.checkForUpdate())
        assertEquals(1, f.count("target/modules/app_pages.valdimodule"))
        assertArrayEquals(f.target, f.output().readBytes())
        assertTrue(f.logs.toString(), f.logs.any { it.contains("codec unavailable") })
        assertNull(client.start())
        f.noWork()
    }
}
