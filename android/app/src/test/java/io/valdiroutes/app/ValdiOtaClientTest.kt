package io.valdiroutes.app

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.io.IOException
import java.net.InetSocketAddress
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class ValdiOtaClientTest {
    @Test fun infoRequiresSuccessfulStart() = Fixture().use { f ->
        val client = f.client()
        assertThrows(IllegalStateException::class.java) { client.getInfo() }
        f.failWrites = true
        assertThrows(IOException::class.java) { client.start() }
        assertThrows(IllegalStateException::class.java) { client.getInfo() }
        f.failWrites = false
        client.start()
        assertInfo(client)
    }

    @Test fun infoTracksPendingWhileEmbeddedSelectionAndPriorInfoStayFixed() = Fixture().use { f ->
        val client = f.client()
        client.start()
        val before = client.getInfo()
        assertInfo(client)
        f.publish("v1")
        assertTrue(client.checkForUpdate())
        repeat(3) {
            assertNull(client.start())
            assertInfo(client, pending = "v1")
        }
        assertNull(before.pendingBundleVersion)
        val next = f.client()
        assertEquals("v1", next.start()!!.version)
        assertInfo(next, running = "v1", isNewVersion = true, previous = "pages-001")
    }

    @Test fun firstInstallInfoHasNoActivation() = Fixture().use { f ->
        val client = f.client()
        repeat(3) {
            assertNull(client.start())
            assertInfo(client)
        }
        val next = f.client()
        assertNull(next.start())
        assertInfo(next)
        assertEquals(setOf("binary", "current", "pending"), f.state().keys)
    }

    @Test fun bundledPromotionReportsConfiguredEmbeddedIdentity() = Fixture().use { f ->
        val staging = f.client(bundleVersion = "bundled-custom")
        assertNull(staging.start())
        f.publish("v1")
        assertTrue(staging.checkForUpdate())
        val client = f.client(bundleVersion = "bundled-custom")
        val selected = client.start()
        repeat(3) {
            assertSame(selected, client.start())
            assertInfo(client, embedded = "bundled-custom", running = "v1",
                isNewVersion = true, previous = "bundled-custom")
        }
        val next = f.client(bundleVersion = "bundled-custom")
        assertEquals("v1", next.start()!!.version)
        assertInfo(next, embedded = "bundled-custom", running = "v1")
        assertEquals(setOf("binary", "current", "pending"), f.state().keys)
    }

    @Test fun v1ToV2ActivationInfoStaysFixedForSessionWhilePendingChanges() = Fixture().use { f ->
        f.current("v1")
        f.stage("v2")
        val client = f.client()
        val selected = client.start()
        assertEquals("v2", selected!!.version)
        assertInfo(client, running = "v2", isNewVersion = true, previous = "v1")
        val before = client.getInfo()
        f.failWrites = true
        val next = f.client()
        assertEquals("v2", next.start()!!.version)
        assertInfo(next, running = "v2")
        repeat(3) {
            assertSame(selected, client.start())
            assertInfo(client, running = "v2", isNewVersion = true, previous = "v1")
        }
        f.failWrites = false
        f.publish("v3")
        assertTrue(client.checkForUpdate())
        f.offer(null)
        assertFalse(client.checkForUpdate())
        repeat(3) {
            assertSame(selected, client.start())
            assertInfo(client, running = "v2", pending = "v3", isNewVersion = true, previous = "v1")
        }
        assertEquals("v1", before.previousBundleVersion)
        assertTrue(before.isNewVersion)
        assertNull(before.pendingBundleVersion)
        assertEquals(setOf("binary", "current", "pending"), f.state().keys)
    }

    @Test fun activationUsesDurableCurrentIdentityEvenWhenOldPackageIsCorrupt() = Fixture().use { f ->
        f.current("v1")
        f.stage("v2")
        File(f.pkg("v1"), "modules/app.valdimodule").delete()
        val client = f.client()
        assertEquals("v2", client.start()!!.version)
        assertInfo(client, running = "v2", isNewVersion = true, previous = "v1")
    }

    @Test fun pendingMatchingEmbeddedIdentityIsNotANewVersion() = Fixture().use { f ->
        f.stage("v1")
        val client = f.client(bundleVersion = "v1")
        assertEquals("v1", client.start()!!.version)
        assertInfo(client, embedded = "v1", running = "v1")
        assertEquals(JsonNull, f.state().getValue("pending"))
    }

    @Test fun pendingMatchingCurrentIdentityIsNotANewVersion() = Fixture().use { f ->
        f.current("v1")
        File(f.root, "state.json").writeText(f.state().withFields { put("pending", "v1") }.toString())
        val client = f.client()
        assertEquals("v1", client.start()!!.version)
        assertInfo(client, running = "v1")
        assertEquals(JsonNull, f.state().getValue("pending"))
    }

    @Test fun sameEmbeddedAndCurrentOffersDoNotReportActivation() = Fixture().use { f ->
        f.current("v1")
        val client = f.client()
        val selected = client.start()
        for (version in listOf("pages-001", "v1")) {
            val requests = f.count("$version/manifest.json")
            f.publish(version)
            assertFalse(client.checkForUpdate())
            assertSame(selected, client.start())
            assertInfo(client, running = "v1")
            assertEquals(requests, f.count("$version/manifest.json"))
        }
    }

    @Test fun corruptPendingFallbackNeverReportsActivation() {
        for (hasCurrent in listOf(false, true)) {
            for (damage in listOf("body", "signature", "manifest", "missing")) Fixture().use { f ->
                if (hasCurrent) f.current("v1")
                f.stage("v2")
                when (damage) {
                    "body" -> File(f.pkg("v2"), "modules/app.valdimodule").writeText("evil")
                    "signature" -> File(f.pkg("v2"), "manifest.sig").writeText("AAAA")
                    "manifest" -> File(f.pkg("v2"), "manifest.json").appendText(" ")
                    else -> File(f.pkg("v2"), "modules/app.valdimodule").delete()
                }
                val client = f.client()
                assertEquals(if (hasCurrent) "v1" else null, client.start()?.version)
                assertInfo(client, running = if (hasCurrent) "v1" else "pages-001")
                assertEquals(JsonNull, f.state().getValue("pending"))
            }
        }
    }

    @Test fun changedBinaryDiscardsOldCurrentAndPendingWithoutActivation() = Fixture().use { f ->
        f.current("v1")
        f.stage("v2")
        val client = f.client(binary = "installed-2")
        repeat(3) {
            assertNull(client.start())
            assertInfo(client)
        }
        assertEquals("installed-2", f.state().getValue("binary").jsonPrimitive.content)
        assertFalse(f.pkg("v1").exists())
        assertFalse(f.pkg("v2").exists())
    }

    @Test fun disabledUrlDoesNotActivateVerifiedPending() = Fixture().use { f ->
        f.current("v1")
        f.stage("v2")
        val before = File(f.root, "state.json").readBytes()
        val requests = f.count("latest.json")
        f.failWrites = true
        val client = f.client(enabled = false)
        repeat(3) {
            assertNull(client.start())
            assertFalse(client.checkForUpdate())
            assertInfo(client, enabled = false)
        }
        assertArrayEquals(before, File(f.root, "state.json").readBytes())
        assertEquals(requests, f.count("latest.json"))
    }

    @Test fun failedPromotionExposesNoInfoAndSuccessfulRetryReportsActivation() {
        for (hasCurrent in listOf(false, true)) Fixture().use { f ->
            if (hasCurrent) f.current("v1")
            f.stage("v2")
            val before = File(f.root, "state.json").readBytes()
            val client = f.client()
            f.failWrites = true
            repeat(2) {
                assertThrows(IOException::class.java) { client.start() }
                assertThrows(IllegalStateException::class.java) { client.getInfo() }
            }
            assertArrayEquals(before, File(f.root, "state.json").readBytes())
            assertTrue(f.pkg("v2").isDirectory)
            if (hasCurrent) assertTrue(f.pkg("v1").isDirectory)
            f.failWrites = false
            assertEquals("v2", client.start()!!.version)
            repeat(3) {
                assertInfo(client, running = "v2", isNewVersion = true,
                    previous = if (hasCurrent) "v1" else "pages-001")
                assertEquals("v2", client.start()!!.version)
            }
            val next = f.client()
            assertEquals("v2", next.start()!!.version)
            assertInfo(next, running = "v2")
        }
    }

    @Test fun promotionWriteThrowingAfterCommitDoesNotLeakActivationOnRetry() {
        for (hasCurrent in listOf(false, true)) Fixture().use { f ->
            if (hasCurrent) f.current("v1")
            f.stage("v2")
            val client = f.client()
            f.failAfterWrites = true
            assertThrows(IOException::class.java) { client.start() }
            assertThrows(IllegalStateException::class.java) { client.getInfo() }
            assertEquals("v2", f.state().getValue("current").jsonPrimitive.content)
            assertEquals(JsonNull, f.state().getValue("pending"))
            f.failAfterWrites = false
            repeat(3) {
                assertEquals("v2", client.start()!!.version)
                assertInfo(client, running = "v2")
            }
            val next = f.client()
            assertEquals("v2", next.start()!!.version)
            assertInfo(next, running = "v2")
        }
    }

    @Test fun infoUsesProcessSnapshotInsteadOfDurableCurrentAndRetainsPendingAcrossChecks() = Fixture().use { f ->
        f.current()
        val client = f.client()
        val selected = client.start()
        assertInfo(client, running = "current")
        f.publish("next")
        assertTrue(client.checkForUpdate())
        f.offer(null)
        assertFalse(client.checkForUpdate())
        repeat(3) {
            assertSame(selected, client.start())
            assertInfo(client, running = "current", pending = "next")
        }
        // A durable current entry cannot replace the snapshot selected at the start of this process.
        val changed = f.state().withFields { put("current", "different") }
        File(f.root, "state.json").writeText(changed.toString())
        assertInfo(client, running = "current", pending = "next")
    }

    @Test fun disabledInfoIgnoresPendingAndBrokenStateWithoutNetworkOrWrites() = Fixture().use { f ->
        f.current()
        f.stage("pending")
        val state = File(f.root, "state.json")
        state.writeText("{broken")
        f.failWrites = true
        val client = f.client(enabled = false)
        repeat(3) {
            assertNull(client.start())
            assertFalse(client.checkForUpdate())
            assertInfo(client, enabled = false)
        }
        assertEquals("{broken", state.readText())
        assertEquals(2, f.count("latest.json"))
    }

    @Test fun infoPropagatesStateReadAndInstalledIdentityErrors(): Unit = Fixture().use { f ->
        val client = f.client(); client.start()
        val state = File(f.root, "state.json")
        val original = state.readText()
        state.writeText("{broken")
        assertThrows(Exception::class.java) { client.getInfo() }
        state.writeText(original)
        assertInfo(client)
        state.writeText(f.state().withFields { put("binary", "installed-2") }.toString())
        assertEquals("Installed binary changed",
            assertThrows(IllegalStateException::class.java) { client.getInfo() }.message)
        state.delete()
        assertThrows(IllegalStateException::class.java) { client.getInfo() }
    }

    @Test fun stagedPackageRemainsSelectedAcrossFreshClientsWithoutConfirmation() = Fixture().use { f ->
        f.stage("v1")
        repeat(4) { index ->
            val selected = f.client().start()
            assertEquals("Fresh start ${index + 1} must retain the staged package", "v1", selected?.version)
            assertEquals("code-v1", selected!!.module("app.valdimodule")!!.readText())
            assertEquals("v1", f.state().getValue("current").jsonPrimitive.content)
            assertEquals(JsonNull, f.state().getValue("pending"))
            assertEquals(setOf("binary", "current", "pending"), f.state().keys)
            // Once promoted, even an unavailable writer cannot undo selection on later starts.
            f.failWrites = true
        }
    }

    @Test fun updateIndexRequiresStrictJsonSyntax() = Fixture().use { f ->
        val client = f.client()
        client.start()
        f.publish("v1")
        for (invalid in listOf("{'version':'v1'}", "{version:\"v1\"}", "{\"version\":\"v1\",}")) {
            f.body("latest.json", invalid.toByteArray())
            assertThrows("Non-JSON update index must be rejected: $invalid", Exception::class.java) {
                client.checkForUpdate()
            }
            assertFalse(f.pkg("v1").exists())
        }
    }

    @Test fun obsoleteStateFieldsAreIgnoredRegardlessOfTheirJsonTypes() = Fixture().use { f ->
        f.current()
        for (obsolete in listOf<JsonElement>(JsonPrimitive("false"), JsonNull, buildJsonObject { put("old", true) })) {
            val state = f.state().withFields {
                put("pendingLaunched", obsolete)
                put("failed", obsolete)
            }
            File(f.root, "state.json").writeText(state.toString())
            assertEquals("current", f.client().start()!!.version)
        }
        assertTrue(f.pkg("current").isDirectory)
    }

    @Test fun legacyLaunchedPendingIsPromotedEvenIfAlsoInLegacyFailedList() = Fixture().use { f ->
        f.current(); f.stage("pending")
        val legacy = f.state().withFields {
            put("pendingLaunched", true)
            putJsonArray("failed") { add("pending") }
        }
        File(f.root, "state.json").writeText(legacy.toString())
        repeat(3) {
            assertEquals("pending", f.client().start()!!.version)
            assertEquals("pending", f.state().getValue("current").jsonPrimitive.content)
            assertEquals(JsonNull, f.state().getValue("pending"))
        }
        assertFalse(f.pkg("current").exists())
        assertEquals(setOf("binary", "current", "pending"), f.state().keys)
        assertEquals(1, f.count("pending/manifest.json"))
    }

    private class Fixture : AutoCloseable {
        val root = Files.createTempDirectory("valdi-ota-test-").toFile()
        val key = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
        val pem = "-----BEGIN PUBLIC KEY-----\n${Base64.getEncoder().encodeToString(key.public.encoded)}\n-----END PUBLIC KEY-----"
        val responses = ConcurrentHashMap<String, (HttpExchange) -> Unit>()
        val hits = ConcurrentHashMap<String, AtomicInteger>()
        val requests = ConcurrentHashMap<String, Map<String, String>>()
        val queries = mutableListOf<String>()
        val executor = Executors.newCachedThreadPool()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            this.executor = this@Fixture.executor
            createContext("/") { exchange ->
                val path = exchange.requestURI.path.removePrefix("/android/0.1/")
                hits.computeIfAbsent(path) { AtomicInteger() }.incrementAndGet()
                if (path == "latest.json") synchronized(queries) { queries += exchange.requestURI.rawQuery ?: "" }
                requests[path] = exchange.requestHeaders.entries.associate { it.key.lowercase() to it.value.joinToString(",") }
                try {
                    responses[path]?.invoke(exchange) ?: reply(exchange, 404, byteArrayOf())
                } finally {
                    exchange.close()
                }
            }
            start()
        }
        val url = "http://127.0.0.1:${server.address.port}"
        val bundled = mutableMapOf<String, ByteArray>()
        val logs = mutableListOf<String>()
        var failWrites = false
        var failAfterWrites = false
        fun client(binary: String = "installed-1", enabled: Boolean = true, modules: Set<String> = setOf("app"),
            bundleVersion: String = "pages-001") = ValdiOtaClient(
            root, ValdiOtaClient.Config("0.1", if (enabled) url else "", pem, modules, bundleVersion), binary,
            bundled = { bundled[it]?.inputStream() },
            stateWriter = { file, bytes ->
                if (failWrites) throw IOException("injected state write failure")
                ValdiOtaClient.writeStateAtomically(file, bytes)
                if (failAfterWrites) throw IOException("injected failure after state commit")
            },
            log = { message, error -> logs += "$message: ${error.message}" },
        )
        fun body(path: String, bytes: ByteArray, status: Int = 200) {
            responses[path] = { reply(it, status, bytes) }
        }
        fun offer(version: String?) {
            body("latest.json", buildJsonObject {
                put("version", version?.let(::JsonPrimitive) ?: JsonNull)
            }.toString().toByteArray())
        }
        fun manifest(version: String, files: Map<String, ByteArray>) = buildJsonObject {
            put("schemaVersion", 1)
            put("platform", "android")
            put("appVersion", "0.1")
            put("version", version)
            putJsonObject("files") {
                files.forEach { (path, bytes) ->
                    putJsonObject(path) {
                        put("sha256", hash(bytes))
                        put("size", bytes.size)
                    }
                }
            }
        }
        fun publish(version: String, files: Map<String, ByteArray> = module("code-$version"), edit: (JsonObject) -> JsonObject = { it }) {
            val json = edit(manifest(version, files))
            val manifest = json.toString().toByteArray()
            body("$version/manifest.json", manifest)
            body("$version/manifest.sig", sign(manifest))
            files.forEach { (path, bytes) -> body("$version/$path", bytes) }
            offer(version)
        }
        fun sign(bytes: ByteArray): ByteArray = Base64.getEncoder().encode(Signature.getInstance("SHA256withECDSA").run {
            initSign(key.private); update(bytes); sign()
        })
        fun stage(version: String, files: Map<String, ByteArray> = module("code-$version")) {
            val client = client()
            client.start()
            publish(version, files)
            assertTrue(client.checkForUpdate())
        }
        fun current(version: String = "current", files: Map<String, ByteArray> = module("good")) {
            stage(version, files)
            val next = client()
            assertEquals(version, next.start()!!.version)
        }
        fun state() = Json.parseToJsonElement(File(root, "state.json").readText()).jsonObject
        fun pkg(version: String) = File(root, "packages/$version")
        fun count(path: String) = hits[path]?.get() ?: 0
        fun noPartials() {
            assertFalse(root.walkTopDown().any { it.name.endsWith(".part") || it.name.startsWith(".work-") })
        }
        override fun close() {
            server.stop(0); executor.shutdownNow(); root.deleteRecursively()
        }
        companion object {
            fun reply(exchange: HttpExchange, status: Int, bytes: ByteArray) {
                exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
        }
    }

    @Test fun signedV1StagesWithoutFingerprintAndProviderIsFixedForProcess() = Fixture().use { f ->
        val client = f.client()
        assertNull(client.start())
        f.publish("v1")
        assertTrue(client.checkForUpdate())
        assertNull(client.start())
        val next = f.client()
        val selected = next.start()!!
        assertEquals("v1", selected.version)
        assertEquals("code-v1", selected.module("app.valdimodule")!!.readText())
        assertEquals("v1", f.state().getValue("current").jsonPrimitive.content)
        assertTrue((f.state()["pending"] == null || f.state()["pending"] == JsonNull))
        assertNull(selected.module("framework.valdimodule"))
        File(f.pkg("v1"), "modules/app.valdimodule").delete()
        expectFailure { selected.module("app.valdimodule")!!.readBytes() }
    }

    @Test fun checksCarryRunningVersionAndNeverPendingVersion() = Fixture().use { f ->
        val client = f.client()
        client.start()
        f.publish("pending")
        assertTrue(client.checkForUpdate())
        f.offer(null)
        assertFalse(client.checkForUpdate())
        assertEquals(listOf(
            "platform=android&appVersion=0.1&bundleVersion=pages-001",
            "platform=android&appVersion=0.1&bundleVersion=pages-001",
        ), f.queries)
        val next = f.client()
        next.start()
        f.publish("next")
        assertTrue(next.checkForUpdate())
        f.offer(null)
        assertFalse(next.checkForUpdate())
        assertEquals("platform=android&appVersion=0.1&bundleVersion=pending", f.queries.last())
    }

    @Test fun embeddedVersionIsNeverOfferedAndLatestNameIsReservedIgnoringCase() = Fixture().use { f ->
        val client = f.client()
        client.start()
        f.publish("pages-001")
        assertFalse("Do not stage the embedded business version", client.checkForUpdate())
        assertEquals(0, f.count("pages-001/manifest.json"))
        for (version in listOf("latest.json", "LATEST.JSON", "Latest.Json")) {
            f.publish(version)
            expectFailure(version) { client.checkForUpdate() }
        }
    }

    @Test fun productionPagesInventoryRejectsEveryForeignModuleMapAndResource() = Fixture().use { f ->
        val client = f.client(modules = setOf("app_pages"))
        client.start()
        val pages = mapOf("modules/app_pages.valdimodule" to "pages".toByteArray())
        f.publish("pages", pages)
        assertTrue(client.checkForUpdate())
        for ((index, foreign) in listOf(
            "modules/app_foundation.valdimodule", "modules/app_video.map.json", "res/drawable/app_video_icon.png",
        ).withIndex()) {
            f.publish("foreign$index", pages + (foreign to byteArrayOf(1)))
            expectFailure(foreign) { client.checkForUpdate() }
            assertEquals(0, f.count("foreign$index/modules/app_pages.valdimodule"))
        }
    }

    @Test fun manualEmbeddedBusinessVersionIsIndependentOfNativeAppVersion() = Fixture().use { f ->
        val client = ValdiOtaClient(f.root,
            ValdiOtaClient.Config("0.1", f.url, f.pem, setOf("app_pages"), bundleVersion = "pages-manual.42"), "binary")
        client.start()
        f.offer("pages-manual.42")
        assertFalse(client.checkForUpdate())
        assertEquals("platform=android&appVersion=0.1&bundleVersion=pages-manual.42", f.queries.single())
        for (version in listOf("", "../bad", "LATEST.JSON")) {
            expectFailure(version) { ValdiOtaClient.Config("0.1", f.url, f.pem, setOf("app_pages"), version) }
        }
    }

    @Test fun corruptPendingFallsBackToVerifiedCurrentInSameStart() = Fixture().use { f ->
        f.current()
        f.stage("pending")
        File(f.pkg("pending"), "modules/app.valdimodule").writeText("bad")
        assertEquals("current", f.client().start()!!.version)
        assertTrue((f.state()["pending"] == null || f.state()["pending"] == JsonNull))
        assertFalse(f.pkg("pending").exists())
        assertEquals(setOf("binary", "current", "pending"), f.state().keys)
        assertTrue(f.logs.any { it.contains("pending") })
        // File selection failure does not suppress a later offer for the same version.
        val client = f.client()
        client.start()
        assertTrue(client.checkForUpdate())
        assertEquals("pending", f.client().start()!!.version)
        assertEquals(2, f.count("pending/manifest.json"))
    }

    @Test fun legacyFailedVersionCanBeStagedAndOffersNeverRedownloadPendingOrCurrent() = Fixture().use { f ->
        f.current()
        File(f.root, "state.json").writeText(f.state().withFields {
            put("pendingLaunched", false)
            putJsonArray("failed") { add("offered") }
        }.toString())
        val client = f.client()
        val active = client.start()!!
        f.publish("offered")
        assertTrue(client.checkForUpdate())
        assertFalse(client.checkForUpdate())
        assertSame(active, client.start())
        assertEquals("current", active.version)
        val next = f.client()
        assertEquals("offered", next.start()!!.version)
        assertFalse(next.checkForUpdate())
        assertEquals("offered", f.client().start()!!.version)
        assertEquals(1, f.count("offered/manifest.json"))
        assertEquals(1, f.count("offered/manifest.sig"))
        assertEquals(1, f.count("offered/modules/app.valdimodule"))
    }

    @Test fun cachedSignaturesAndAllFilesAreReverified() {
        for (damage in listOf("body", "signature", "manifest", "missing")) Fixture().use { f ->
            f.current()
            when (damage) {
                "body" -> File(f.pkg("current"), "modules/app.valdimodule").writeText("evil")
                "signature" -> File(f.pkg("current"), "manifest.sig").writeText("AAAA")
                "manifest" -> File(f.pkg("current"), "manifest.json").appendText(" ")
                else -> File(f.pkg("current"), "modules/app.valdimodule").delete()
            }
            assertNull("damage=$damage", f.client().start())
            assertTrue((f.state()["current"] == null || f.state()["current"] == JsonNull))
        }
    }

    @Test fun corruptCurrentAndPendingFallBackToBundled() = Fixture().use { f ->
        f.current(); f.stage("pending")
        File(f.pkg("current"), "modules/app.valdimodule").delete()
        File(f.pkg("pending"), "manifest.sig").delete()
        assertNull(f.client().start())
    }

    @Test fun disabledUrlIgnoresCachedPackagesAndNeverTouchesNetwork() = Fixture().use { f ->
        f.current()
        val before = File(f.root, "state.json").readText()
        val client = f.client(enabled = false)
        assertNull(client.start())
        assertFalse(client.checkForUpdate())
        assertEquals(before, File(f.root, "state.json").readText())
        assertEquals(1, f.count("latest.json"))
    }

    @Test fun installedIdentityResetsStateBeforeDeletingOldPackages() = Fixture().use { f ->
        f.current()
        f.failWrites = true
        expectFailure { f.client(binary = "installed-2").start() }
        assertTrue(f.pkg("current").isDirectory)
        assertEquals("installed-1", f.state().getValue("binary").jsonPrimitive.content)
        f.failWrites = false
        assertNull(f.client(binary = "installed-2").start())
        assertFalse(f.pkg("current").exists())
    }

    @Test fun promotionMustBeDurableBeforeItCanBeReturned() = Fixture().use { f ->
        f.current(); f.stage("pending")
        val before = File(f.root, "state.json").readText()
        f.failWrites = true
        expectFailure { f.client().start() }
        assertEquals(before, File(f.root, "state.json").readText())
        assertTrue(f.pkg("current").exists())
        assertTrue(f.pkg("pending").exists())
        assertEquals("good", File(f.pkg("current"), "modules/app.valdimodule").readText())
        assertEquals("code-pending", File(f.pkg("pending"), "modules/app.valdimodule").readText())
        f.failWrites = false
        assertEquals("pending", f.client().start()!!.version)
    }

    @Test fun promotionWritesBeforeCleanupAndSameClientCanRetryFailedStart() = Fixture().use { f ->
        f.current(); f.stage("pending")
        val client = f.client()
        val before = File(f.root, "state.json").readBytes()
        val abandoned = File(f.root, ".work-dead").apply { mkdir() }
        f.failWrites = true
        repeat(2) { expectFailure { client.start() } }
        expectFailure { client.checkForUpdate() }
        assertArrayEquals(before, File(f.root, "state.json").readBytes())
        assertTrue(f.pkg("current").exists())
        assertTrue(f.pkg("pending").exists())
        assertTrue(abandoned.exists())
        f.failWrites = false
        val selected = client.start()!!
        assertEquals("pending", selected.version)
        assertEquals("pending", f.state().getValue("current").jsonPrimitive.content)
        assertEquals(JsonNull, f.state().getValue("pending"))
        assertSame(selected, client.start())
        assertFalse(f.pkg("current").exists())
        assertTrue(f.pkg("pending").exists())
        assertFalse(abandoned.exists())
        assertEquals(1, f.count("pending/manifest.json"))
    }

    @Test fun failedStagingWriteRemovesOnlyNewOutput() = Fixture().use { f ->
        f.current(); f.stage("old-pending")
        val client = f.client()
        assertEquals("old-pending", client.start()!!.version)
        f.publish("retained-pending")
        assertTrue(client.checkForUpdate())
        f.publish("new-pending")
        val before = File(f.root, "state.json").readText()
        f.failWrites = true
        expectFailure { client.checkForUpdate() }
        assertEquals(before, File(f.root, "state.json").readText())
        assertFalse(f.pkg("new-pending").exists())
        assertTrue(f.pkg("old-pending").exists())
        assertTrue(f.pkg("retained-pending").exists())
        f.noPartials()
    }

    @Test fun stagingNeverDeletesOrChangesActiveSnapshot() = Fixture().use { f ->
        f.current()
        val client = f.client()
        val active = client.start()!!
        f.publish("v2")
        assertTrue(client.checkForUpdate())
        assertSame(active, client.start())
        assertEquals("current", active.version)
        assertEquals("good", active.module("app.valdimodule")!!.readText())
        assertTrue(f.pkg("current").exists())
        assertTrue(f.pkg("v2").exists())
    }

    @Test fun supersedingPendingKeepsProcessCurrentAndOnlyNewestPromotesOnNextStart() = Fixture().use { f ->
        f.current(); f.stage("active")
        val client = f.client()
        val selected = client.start()!!
        f.publish("next")
        assertTrue(client.checkForUpdate())
        f.publish("newest")
        assertTrue(client.checkForUpdate())
        assertTrue(f.pkg("active").exists())
        assertFalse(f.pkg("next").exists())
        assertEquals("code-active", selected.module("app.valdimodule")!!.readText())
        assertSame(selected, client.start())
        assertEquals("active", f.state().getValue("current").jsonPrimitive.content)
        assertEquals("newest", f.state().getValue("pending").jsonPrimitive.content)
        assertEquals("newest", f.client().start()!!.version)
        assertEquals("newest", f.client().start()!!.version)
    }

    @Test fun verifiesAndCopiesReusableCurrentActivePendingAndBundledFiles() = Fixture().use { f ->
        val common = "resource".toByteArray()
        f.current(files = module("current") + ("res/drawable-mdpi/app_icon.png" to common))
        f.stage("active", module("active") + mapOf(
            "res/drawable-mdpi/app_icon.png" to common,
            "res/drawable-hdpi/app_other.png" to common,
        ))
        val client = f.client()
        client.start()
        f.publish("pending", module("pending") + ("res/drawable-xhdpi/app_third.png" to common))
        assertTrue(client.checkForUpdate())
        f.bundled["app.valdimodule"] = "bundled-code".toByteArray()
        f.bundled["app.map.json"] = "bundled-map".toByteArray()
        val target = module("bundled-code") + mapOf(
            "modules/app.map.json" to "bundled-map".toByteArray(),
            "res/drawable-mdpi/app_icon.png" to common,
            "res/drawable-hdpi/app_other.png" to common,
            "res/drawable-xhdpi/app_third.png" to common,
            "res/drawable-xxhdpi/app_changed.png" to "changed".toByteArray(),
        )
        f.publish("target", target)
        assertTrue(client.checkForUpdate())
        for ((path, bytes) in target) {
            assertArrayEquals(bytes, File(f.pkg("target"), path).readBytes())
            assertEquals(if (path.endsWith("changed.png")) 1 else 0, f.count("target/$path"))
        }
        File(f.pkg("active"), "res/drawable-mdpi/app_icon.png").writeText("mutated source")
        assertArrayEquals(common, File(f.pkg("target"), "res/drawable-mdpi/app_icon.png").readBytes())
    }

    @Test fun corruptReuseFallsThroughToNetworkAndWrongBundledBytesAreRejected() = Fixture().use { f ->
        f.current()
        val client = f.client()
        client.start()
        File(f.pkg("current"), "modules/app.valdimodule").writeText("wrong")
        f.bundled["app.valdimodule"] = "wrong".toByteArray()
        f.publish("target", module("good"))
        assertTrue(client.checkForUpdate())
        assertEquals(1, f.count("target/modules/app.valdimodule"))
        assertEquals("good", File(f.pkg("target"), "modules/app.valdimodule").readText())
    }

    @Test fun completeConfiguredInventoryIncludesNativeCapabilityJsAndReusesUnchangedArtifacts() = Fixture().use { f ->
        val modules = setOf("app_pages", "app_foundation", "app_video")
        val original = modules.flatMap { module -> listOf(
            "modules/$module.valdimodule" to "js-$module".toByteArray(),
            "modules/$module.map.json" to "map-$module".toByteArray(),
        ) }.toMap() + ("res/drawable-mdpi/app_pages_icon.png" to "icon".toByteArray())
        original.filterKeys { it.startsWith("modules/") }.forEach { (path, bytes) ->
            f.bundled[path.removePrefix("modules/")] = bytes
        }
        val first = f.client(modules = modules)
        first.start()
        f.publish("first", original)
        assertTrue(first.checkForUpdate())
        val next = f.client(modules = modules)
        val selected = next.start()!!
        val changed = original + mapOf(
            "modules/app_pages.valdimodule" to "changed page js".toByteArray(),
            "modules/app_pages.map.json" to "changed page map".toByteArray(),
        )
        f.publish("changed", changed)
        assertTrue(next.checkForUpdate())
        changed.forEach { (path, bytes) ->
            assertArrayEquals(bytes, File(f.pkg("changed"), path).readBytes())
            assertEquals(if (path.startsWith("modules/app_pages.")) 1 else 0, f.count("changed/$path"))
        }
        assertEquals("js-app_pages", selected.module("app_pages.valdimodule")!!.readText())
        f.publish("incomplete", changed.filterKeys { !it.contains("app_video") })
        expectFailure { next.checkForUpdate() }
        assertEquals(0, f.count("incomplete/modules/app_pages.valdimodule"))
    }

    @Test fun exactSizesHashesAndEncodingsAreEnforcedWithNoPartialOutput() {
        for (fault in listOf("short", "long", "hash", "gzip", "redirect", "status206", "zero-long")) Fixture().use { f ->
            val client = f.client(); client.start()
            val data = if (fault == "zero-long") byteArrayOf() else "good".toByteArray()
            f.publish("bad", mapOf("modules/app.valdimodule" to data))
            f.responses["bad/modules/app.valdimodule"] = { exchange ->
                when (fault) {
                    "redirect" -> {
                        exchange.responseHeaders.set("Location", "${f.url}/redirect-target")
                        Fixture.reply(exchange, 302, byteArrayOf())
                    }
                    "gzip" -> {
                        exchange.responseHeaders.set("Content-Encoding", "gzip")
                        Fixture.reply(exchange, 200, data)
                    }
                    "status206" -> Fixture.reply(exchange, 206, data)
                    else -> {
                        val body = when (fault) {
                            "short" -> "goo"
                            "long" -> "good!"
                            "hash" -> "evil"
                            else -> "!"
                        }.toByteArray()
                        // Chunked bodies prove enforcement while reading, independent of Content-Length.
                        exchange.sendResponseHeaders(200, 0)
                        exchange.responseBody.use { it.write(body) }
                    }
                }
            }
            expectFailure("fault=$fault") { client.checkForUpdate() }
            assertTrue((f.state()["pending"] == null || f.state()["pending"] == JsonNull))
            assertFalse(f.pkg("bad").exists())
            assertEquals(0, f.count("redirect-target"))
            f.noPartials()
        }
    }

    @Test fun metadataIsBoundedAndAllRequestsBypassCachesAndRedirects() = Fixture().use { f ->
        val client = f.client(); client.start()
        f.offer(null)
        assertFalse(client.checkForUpdate())
        f.publish("valid")
        assertTrue(client.checkForUpdate())
        f.requests.values.forEach {
            assertEquals("identity", it["accept-encoding"])
            assertTrue(it["cache-control"]!!.contains("no-cache"))
            assertEquals("no-cache", it["pragma"])
        }
        for ((path, limit) in listOf("latest.json" to 65536, "oversize/manifest.json" to 1048576, "oversize/manifest.sig" to 4096)) {
            f.publish("oversize")
            f.responses[path] = { exchange ->
                exchange.sendResponseHeaders(200, 0)
                try { exchange.responseBody.use { it.write(ByteArray(limit + 1) { 32 }) } } catch (_: IOException) {}
            }
            expectFailure(path) { client.checkForUpdate() }
        }
        f.responses["latest.json"] = { exchange ->
            exchange.responseHeaders.set("Location", "${f.url}/redirect-target")
            Fixture.reply(exchange, 302, byteArrayOf())
        }
        expectFailure { client.checkForUpdate() }
        assertEquals(0, f.count("redirect-target"))
        f.noPartials()
    }

    @Test fun nullLatestLeavesCurrentUnchangedAndInvalidVersionsAreRejected() = Fixture().use { f ->
        f.current()
        val client = f.client(); client.start()
        f.offer(null)
        val before = File(f.root, "state.json").readText()
        assertFalse(client.checkForUpdate())
        assertEquals(before, File(f.root, "state.json").readText())
        for (version in listOf("", "../evil", "a/b", "a".repeat(65), "%41", "a?b")) {
            f.offer(version)
            expectFailure(version) { client.checkForUpdate() }
        }
    }

    @Test fun signedManifestStrictlyValidatesSchemaInventoryPathsHashesSizesAndTotals() {
        val edits = listOf<(JsonObject) -> JsonObject>(
            { JsonObject(it - "schemaVersion") },
            { it.withFields { put("schemaVersion", 2) } },
            { it.withFields { put("schemaVersion", "1") } },
            { it.withFields { put("platform", "ios") } },
            { it.withFields { put("appVersion", "other") } },
            { it.withFields { put("version", "different") } },
            { it.editObject("files") { files -> files.withFields { put("modules/app.valdimodule", "0".repeat(64)) } } },
            { it.editObject("files") { files -> files.editObject("modules/app.valdimodule") { entry -> entry.withFields { put("sha256", "A".repeat(64)) } } } },
            { it.editObject("files") { files -> files.editObject("modules/app.valdimodule") { entry -> entry.withFields { put("size", -1) } } } },
            { it.editObject("files") { files -> files.editObject("modules/app.valdimodule") { entry -> entry.withFields { put("size", "4") } } } },
            { it.editObject("files") { files -> files.editObject("modules/app.valdimodule") { entry -> entry.withFields { put("size", 4.5) } } } },
            { it.editObject("files") { files -> files.editObject("modules/app.valdimodule") { entry -> entry.withFields { put("size", 64L * 1024 * 1024 + 1) } } } },
            { it.editObject("files") { files -> files.withFields { put("modules/extra.valdimodule", descriptor()) } } },
            { it.editObject("files") { files -> files.withFields { put("modules/extra.map.json", descriptor()) } } },
            { it.editObject("files") { files -> files.withFields { put("modules/app/extra", descriptor()) } } },
            { it.withFields { putJsonObject("files") { put("modules/app.map.json", descriptor()) } } },
            { it.editObject("files") { files -> files.withFields { put("res/drawable/app_icon.png", descriptor(64L * 1024 * 1024)) } } },
            { it.editObject("files") { files -> files.withFields {
                repeat(4096) { put("res/drawable/app_icon$it.png", descriptor()) }
            } } },
            { it.editObject("files") { files -> files.withFields { put("res/drawable/foreign_icon.png", descriptor()) } } },
        ) + listOf(
            "../escape", "res/../escape", "res/./escape", "res//escape", "/res/escape",
            "res/a\\b", "res/a%20b", "res/a?b", "res/a#b", "res/a/",
        ).map { path ->
            val edit: (JsonObject) -> JsonObject = { json ->
                json.editObject("files") { files -> files.withFields { put(path, descriptor()) } }
            }
            edit
        }
        for ((index, edit) in edits.withIndex()) Fixture().use { f ->
            val client = f.client(); client.start()
            f.publish("bad", edit = edit)
            expectFailure("edit=$index") { client.checkForUpdate() }
            assertEquals(0, f.count("bad/modules/app.valdimodule"))
            assertTrue((f.state()["pending"] == null || f.state()["pending"] == JsonNull))
            f.noPartials()
        }
    }

    @Test fun signatureMustVerifyBeforeAnyFileIsTrustedOrRequested() = Fixture().use { f ->
        val client = f.client(); client.start()
        f.publish("bad")
        f.body("bad/manifest.sig", "AAAA".toByteArray())
        expectFailure { client.checkForUpdate() }
        assertEquals(0, f.count("bad/modules/app.valdimodule"))
    }

    @Test fun appVersionUsesAnEncodedPathSegmentWithoutImposingUpdateVersionSyntax() = Fixture().use { f ->
        val client = ValdiOtaClient(f.root, ValdiOtaClient.Config("1.0+build", f.url, f.pem, setOf("app")), "binary")
        client.start()
        f.body("/android/1.0+build/latest.json", """{"version":null}""".toByteArray())
        assertFalse(client.checkForUpdate())
        assertEquals(1, f.count("/android/1.0+build/latest.json"))
    }

    @Test fun realAtomicStateWriteFailureLeavesPreviousBytesAndNoPartials() = Fixture().use { f ->
        val file = File(f.root, "directory-instead-of-state").apply { mkdir() }
        File(file, "keep").writeText("previous")
        expectFailure { ValdiOtaClient.writeStateAtomically(file, "new".toByteArray()) }
        assertEquals("previous", File(file, "keep").readText())
        f.noPartials()
    }

    @Test fun orphanSymlinksCannotDeleteRetainedPackagesOrFilesOutsideOtaRoot() = Fixture().use { f ->
        f.current()
        val outside = Files.createTempDirectory("valdi-ota-outside-").toFile()
        try {
            File(outside, "keep").writeText("outside")
            Files.createSymbolicLink(File(f.root, "packages/orphan").toPath(), f.pkg("current").toPath())
            Files.createSymbolicLink(File(f.root, ".work-orphan").toPath(), outside.toPath())
            val selected = f.client().start()!!
            assertEquals("good", selected.module("app.valdimodule")!!.readText())
            assertEquals("outside", File(outside, "keep").readText())
            assertFalse(Files.isSymbolicLink(File(f.root, "packages/orphan").toPath()))
            assertFalse(Files.isSymbolicLink(File(f.root, ".work-orphan").toPath()))
        } finally {
            outside.deleteRecursively()
        }
    }

    @Test fun coldStartReclaimsProcessDeathLeftoversOnceAndRepeatedStartPreservesLiveWork() = Fixture().use { f ->
        f.current()
        val abandoned = File(f.root, ".work-dead-process")
        val legacyDownload = File(f.root, "download")
        for (directory in listOf(abandoned, legacyDownload)) {
            File(directory, "modules/app.valdimodule.part").apply { parentFile.mkdirs(); writeText("incomplete") }
        }
        val client = f.client()
        val selected = client.start()!!
        assertEquals("current", selected.version)
        assertFalse(abandoned.exists())
        assertFalse(legacyDownload.exists())
        assertEquals("good", selected.module("app.valdimodule")!!.readText())

        f.publish("next")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        f.responses["next/modules/app.valdimodule"] = { exchange ->
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            Fixture.reply(exchange, 200, "code-next".toByteArray())
        }
        val executor = Executors.newSingleThreadExecutor()
        try {
            val download = executor.submit<Boolean> { client.checkForUpdate() }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            val live = f.root.listFiles()!!.single { it.name.startsWith(".work-") }
            assertSame(selected, client.start())
            assertTrue(live.isDirectory)
            release.countDown()
            assertTrue(download.get(5, TimeUnit.SECONDS))
            assertEquals("next", f.state().getValue("pending").jsonPrimitive.content)
            f.noPartials()
        } finally {
            release.countDown(); executor.shutdownNow()
        }
    }

    @Test fun emptyFilesAreAcceptedAndLargeBodiesStreamUnderSmallHeap() = Fixture().use { f ->
        val client = f.client(); client.start()
        val largeSize = 40 * 1024 * 1024
        val digest = MessageDigest.getInstance("SHA-256")
        val chunk = ByteArray(64 * 1024) { 17 }
        repeat(largeSize / chunk.size) { digest.update(chunk) }
        f.publish("large", module(""))
        val json = f.manifest("large", module("")).editObject("files") { files ->
            files.withFields {
                putJsonObject("res/drawable/app_big.bin") {
                    put("sha256", hex(digest.digest()))
                    put("size", largeSize)
                }
            }
        }.toString().toByteArray()
        f.body("large/manifest.json", json); f.body("large/manifest.sig", f.sign(json))
        f.responses["large/res/drawable/app_big.bin"] = { exchange ->
            exchange.sendResponseHeaders(200, largeSize.toLong())
            exchange.responseBody.use { output -> repeat(largeSize / chunk.size) { output.write(chunk) } }
        }
        assertTrue(client.checkForUpdate())
        assertEquals(largeSize.toLong(), File(f.pkg("large"), "res/drawable/app_big.bin").length())
        assertEquals(0, File(f.pkg("large"), "modules/app.valdimodule").length())
        f.noPartials()
    }

    @Test fun concurrentChecksJoinStagingSuccessWithoutDuplicateNetwork() = Fixture().use { f ->
        val client = f.client(); client.start(); f.publish("v1")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        f.responses["v1/modules/app.valdimodule"] = { exchange ->
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            Fixture.reply(exchange, 200, "code-v1".toByteArray())
        }
        joinedChecks(client, entered, release, expected = true) {
            // Reading info/repeated startup must remain available while network work is blocked.
            val reader = Executors.newSingleThreadExecutor()
            try {
                reader.submit {
                    assertInfo(client)
                    assertNull(client.start())
                }.get(2, TimeUnit.SECONDS)
            } finally {
                reader.shutdownNow()
            }
        }
        assertEquals(1, f.count("latest.json"))
        assertEquals(1, f.count("v1/modules/app.valdimodule"))
        assertEquals("v1", f.state().getValue("pending").jsonPrimitive.content)
        f.noPartials()
    }

    @Test fun concurrentChecksJoinNoUpdateWithoutDuplicateNetwork() = Fixture().use { f ->
        val client = f.client(); client.start()
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        f.responses["latest.json"] = { exchange ->
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            Fixture.reply(exchange, 200, """{"version":null}""".toByteArray())
        }
        joinedChecks(client, entered, release, expected = false)
        assertEquals(1, f.count("latest.json"))
    }

    @Test fun concurrentChecksShareHttpFailureAndAllowRetry() = Fixture().use { f ->
        val client = f.client(); client.start(); f.publish("v1")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        f.responses["latest.json"] = { exchange ->
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            Fixture.reply(exchange, 500, byteArrayOf())
        }
        joinedChecks(client, entered, release, failure = "OTA HTTP status 500")
        assertEquals(1, f.count("latest.json"))
        f.offer("v1")
        assertTrue(client.checkForUpdate())
        assertEquals(2, f.count("latest.json"))
    }

    @Test fun concurrentChecksShareDurableWriteFailureAndAllowRetry() = Fixture().use { f ->
        val client = f.client(); client.start(); f.publish("v1")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        f.responses["v1/modules/app.valdimodule"] = { exchange ->
            entered.countDown()
            check(release.await(5, TimeUnit.SECONDS))
            Fixture.reply(exchange, 200, "code-v1".toByteArray())
        }
        f.failWrites = true
        joinedChecks(client, entered, release, failure = "injected state write failure")
        assertEquals(1, f.count("latest.json"))
        assertEquals(JsonNull, f.state().getValue("pending"))
        f.failWrites = false
        assertTrue(client.checkForUpdate())
        f.noPartials()
    }

    private fun joinedChecks(
        client: ValdiOtaClient,
        entered: CountDownLatch,
        release: CountDownLatch,
        expected: Boolean = false,
        failure: String? = null,
        whileBlocked: () -> Unit = {},
    ) {
        val owner = FutureTask<Boolean> { client.checkForUpdate() }
        val joiners = List(3) { FutureTask<Boolean> { client.checkForUpdate() } }
        val threads = (listOf(owner) + joiners).mapIndexed { index, task -> Thread(task, "ota-check-$index") }
        try {
            threads.first().start()
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            whileBlocked()
            threads.drop(1).forEach { it.start() }
            for ((thread, task) in threads.drop(1).zip(joiners)) {
                val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
                while (!task.isDone && thread.state != Thread.State.WAITING && System.nanoTime() < deadline) {
                    Thread.yield()
                }
                assertFalse("Concurrent callers must wait until the existing check finishes", task.isDone)
                assertEquals("Concurrent caller must be waiting for the shared result", Thread.State.WAITING, thread.state)
            }
            release.countDown()
            if (failure == null) {
                (listOf(owner) + joiners).forEach { assertEquals(expected, it.get(5, TimeUnit.SECONDS)) }
            } else {
                val errors = (listOf(owner) + joiners).map { task ->
                    assertThrows(ExecutionException::class.java) { task.get(5, TimeUnit.SECONDS) }.cause!!
                }
                assertEquals(failure, errors.first().message)
                errors.drop(1).forEach { assertSame("Every caller receives the original failure", errors.first(), it) }
            }
        } finally {
            release.countDown()
            threads.forEach { it.join(5_000) }
        }
    }

    companion object {
        private fun assertInfo(client: ValdiOtaClient, enabled: Boolean = true, running: String = "pages-001",
            pending: String? = null, isNewVersion: Boolean = false, previous: String? = null,
            embedded: String = "pages-001") {
            assertEquals(ValdiOtaClient.Info(enabled, "0.1", embedded, running, pending, isNewVersion, previous),
                client.getInfo())
        }

        private fun module(text: String) = mapOf("modules/app.valdimodule" to text.toByteArray())
        private fun descriptor(size: Long = 0) = buildJsonObject {
            put("sha256", "0".repeat(64))
            put("size", size)
        }
        private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
        private fun hash(bytes: ByteArray) = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
        private fun expectFailure(label: String = "", block: () -> Unit) {
            try {
                block()
            } catch (_: Exception) {
                return
            }
            fail("Expected failure: $label")
        }
    }
}

/** Each fixture edit returns a new JSON value; the signed source object stays unchanged. */
internal fun JsonObject.withFields(fields: JsonObjectBuilder.() -> Unit): JsonObject = buildJsonObject {
    this@withFields.forEach { (key, value) -> put(key, value) }
    fields()
}

internal fun JsonObject.editObject(key: String, edit: (JsonObject) -> JsonObject): JsonObject =
    withFields { put(key, edit(this@editObject.getValue(key).jsonObject)) }

internal fun JsonObject.editEntry(key: String, index: Int, edit: (JsonObject) -> JsonObject): JsonObject =
    withFields {
        put(key, JsonArray(this@editEntry.getValue(key).jsonArray.mapIndexed { i, value ->
            if (i == index) edit(value.jsonObject) else value
        }))
    }
