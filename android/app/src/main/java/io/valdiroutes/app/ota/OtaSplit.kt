package io.valdiroutes.app

import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/** Split packets never enter a byte array: only metadata, names and 64KiB IO buffers do. */
internal class OtaSplit(
    private val codec: OtaFileCodec,
    private val download: (path: String, sha256: String, size: Long, output: File) -> Unit,
) {
    private data class Digest(val hash: String, val size: Long)
    private data class Field(val offset: Long, val size: Long)
    private data class Entry(val name: String, val digest: Digest, val operation: String,
        val baseHash: String?, val payload: JsonObject?)

    fun rebuild(full: JsonObject, appVersion: String, baseVersion: String, version: String,
        targetHash: String, targetSize: Long, work: File, output: File, baseSource: () -> InputStream?): Boolean {
        val deltas = full.getValue("deltas").jsonArray
        check(deltas.size <= 8) { "Too many delta descriptors" }
        val candidates = (0 until deltas.size).map { index ->
            deltas[index].jsonObject.also {
                val base = it.otaString("baseVersion")
                check(validVersion(base) && it.otaString("path") == "deltas/$base/manifest.json") { "Invalid delta path" }
                sha(it.getValue("baseSha256"))
                digest(it, METADATA_LIMIT)
            }
        }
        val applicable = candidates.filter { it.otaString("baseVersion") == baseVersion }
        if (applicable.isEmpty()) return false
        // Base candidates are confined to this process's snapshot or its embedded app_pages.
        val base = File(work, "base.zst")
        val stream = baseSource() ?: return false
        stream.use { input ->
            FileOutputStream(base).use { out -> transfer(input, out, LIMIT); out.fd.sync() }
        }
        val actualBase = digestFile(base, LIMIT)
        val selected = applicable.firstOrNull { it.otaString("baseSha256") == actualBase.hash } ?: return false
        val metadata = File(work, "manifest.json")
        val metadataDigest = digest(selected, METADATA_LIMIT)
        download(selected.otaString("path"), metadataDigest.hash, metadataDigest.size, metadata)
        verify(metadata, metadataDigest)
        val json = parseOtaObject(metadata.readText(Charsets.UTF_8))
        check(integer(json.getValue("schemaVersion")) == 1L &&
            json.otaString("algorithm") == "hdiffpatch" && json.otaString("format") == "HDIFFSF20" &&
            json.otaString("compression") == "zlib") { "Unsupported split format" }
        check(json.otaString("platform") == "android" && json.otaString("appVersion") == appVersion &&
            json.otaString("baseVersion") == baseVersion && json.otaString("version") == version) { "Split identity mismatch" }
        check(sha(json.getValue("baseSha256")) == actualBase.hash &&
            sha(json.getValue("targetSha256")) == targetHash) { "Split archive mismatch" }
        val basePacketHash = sha(json.getValue("basePacketSha256"))
        val targetPacket = Digest(sha(json.getValue("targetPacketSha256")), integer(json.getValue("targetPacketSize")))
        check(targetPacket.size in 8..LIMIT) { "Invalid target packet size" }

        val rawEntries = json.getValue("entries").jsonArray
        check(rawEntries.size <= MAX_ENTRIES) { "Too many split entries" }
        val names = HashSet<String>()
        var packetSize = 8L
        var payloadSize = metadataDigest.size
        val entries = (0 until rawEntries.size).map { index ->
            val entry = rawEntries[index].jsonObject
            val name = entry.otaString("name")
            check(validName(name) && names.add(name)) { "Invalid or duplicate archive name" }
            val value = digest(entry, LIMIT)
            packetSize += fieldSize(name.toByteArray(Charsets.UTF_8).size.toLong()) + fieldSize(value.size)
            check(packetSize <= targetPacket.size) { "Split entries exceed target packet" }
            val operation = entry.otaString("operation")
            val payload = if (entry.containsKey("download")) entry.getValue("download").jsonObject else null
            val baseHash = if (entry.containsKey("baseSha256")) sha(entry.getValue("baseSha256")) else null
            when (operation) {
                "copy" -> check(payload == null) { "Copy has a payload" }
                "full", "patch" -> {
                    check(payload != null) { "Missing split payload" }
                    val content = digest(payload, LIMIT)
                    payloadSize += content.size
                    check(payloadSize <= LIMIT) { "Split payload budget exceeded" }
                    val encoding = payload.otaString("encoding")
                    val extension = when (encoding) {
                        "raw" -> { check(operation == "full"); "bin" }
                        "zstd" -> { check(operation == "full"); "zst" }
                        "hdiffpatch-zlib" -> { check(operation == "patch" && baseHash != null); "hdiff" }
                        else -> error("Unsupported split payload encoding")
                    }
                    check(payload.otaString("path").matches(Regex("deltas/${Regex.escape(baseVersion)}/payload/[0-9a-f]{64}\\.$extension"))) {
                        "Invalid split payload path"
                    }
                    if (encoding == "raw") check(content == value) { "Raw payload descriptor mismatch" }
                }
                else -> error("Unsupported split operation")
            }
            Entry(name, value, operation, baseHash, payload)
        }
        check(packetSize == targetPacket.size) { "Split packet length mismatch" }
        val oldPacket = File(work, "base.packet")
        check(codec.decode(base, oldPacket, LIMIT) == 0) { "Cannot decode base archive" }
        check(digestFile(oldPacket, LIMIT).hash == basePacketHash) { "Base packet hash mismatch" }
        val old = index(oldPacket, names)
        val staged = entries.mapIndexed { index, entry ->
            val target = File(work, "entry-$index")
            when (entry.operation) {
                "copy" -> {
                    val field = old[entry.name] ?: error("Missing copy base")
                    check(field.size == entry.digest.size) { "Copy length mismatch" }
                    extract(oldPacket, field, target)
                    verify(target, entry.digest)
                    if (entry.baseHash != null) check(entry.baseHash == entry.digest.hash) { "Copy base hash mismatch" }
                }
                "full", "patch" -> {
                    val payload = entry.payload!!
                    val content = digest(payload, LIMIT)
                    val encoded = File(work, "payload-$index")
                    download(payload.otaString("path"), content.hash, content.size, encoded)
                    verify(encoded, content)
                    when (payload.otaString("encoding")) {
                        "raw" -> check(encoded.renameTo(target)) { "Cannot stage raw entry" }
                        "zstd" -> check(codec.decode(encoded, target, entry.digest.size) == 0) { "Cannot decode entry" }
                        else -> {
                            val field = old[entry.name] ?: error("Missing patch base")
                            val oldEntry = File(work, "old-$index")
                            extract(oldPacket, field, oldEntry)
                            check(digestFile(oldEntry, LIMIT).hash == entry.baseHash) { "Patch base hash mismatch" }
                            check(isHbc(entry.name, oldEntry)) { "Only HBC entries can be patched" }
                            checkPatchHeader(encoded)
                            check(codec.patch(oldEntry, encoded, target, entry.digest.size) == 0) { "Cannot apply patch" }
                            check(isHbc(entry.name, target)) { "Patch output is not HBC" }
                            oldEntry.delete()
                        }
                    }
                    verify(target, entry.digest)
                    encoded.delete()
                }
            }
            target
        }
        val packet = File(work, "target.packet")
        FileOutputStream(packet).use { out ->
            uint32(out, MAGIC)
            uint32(out, targetPacket.size - 8)
            entries.zip(staged).forEach { (entry, file) ->
                val name = entry.name.toByteArray(Charsets.UTF_8)
                fieldHeader(out, name.size.toLong())
                out.write(name)
                padding(out, name.size.toLong())
                fieldHeader(out, entry.digest.size)
                file.inputStream().use { transfer(it, out, entry.digest.size) }
                padding(out, entry.digest.size)
            }
            out.fd.sync()
        }
        verify(packet, targetPacket)
        val compressed = File(work, "target.zst")
        check(codec.encode(packet, compressed, targetSize) == 0) { "Cannot encode target archive" }
        verify(compressed, Digest(targetHash, targetSize))
        check(compressed.renameTo(output)) { "Cannot install rebuilt module" }
        return true
    }

    /** Index offsets, not contents; reject truncated lengths, unsafe UTF-8, duplicates and nonzero padding. */
    private fun index(file: File, needed: Set<String>): Map<String, Field> = RandomAccessFile(file, "r").use { input ->
        check(file.length() in 8..LIMIT && uint32(input) == MAGIC) { "Invalid base packet" }
        check(uint32(input) == file.length() - 8) { "Base packet length mismatch" }
        val result = linkedMapOf<String, Field>()
        // Deleted names may occupy most of a 64MiB old packet. Keep only fixed-size fingerprints
        // for uniqueness; retain names/offsets solely for entries present in the <=1MiB metadata.
        val seen = HashSet<String>()
        fun field(): Field {
            check(input.filePointer + 4 <= input.length()) { "Truncated packet field" }
            val raw = uint32(input)
            val size = raw and 0x7fffffff
            val start = input.filePointer
            val pad = if (raw and 0x80000000 != 0L) pad(size) else 0
            check(size <= input.length() - start - pad) { "Packet field exceeds input" }
            input.seek(start + size)
            repeat(pad) { check(input.read() == 0) { "Nonzero packet padding" } }
            return Field(start, size)
        }
        while (input.filePointer < input.length()) {
            check(seen.size < MAX_ENTRIES) { "Too many base entries" }
            val name = field()
            // Any target name is in <=1MiB metadata; cap base names at that same bounded allocation.
            check(name.size in 1..METADATA_LIMIT) { "Invalid base name length" }
            val afterName = input.filePointer
            val bytes = ByteArray(name.size.toInt())
            input.seek(name.offset)
            input.readFully(bytes)
            input.seek(afterName)
            val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
            val fingerprint = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            check(validName(text) && seen.add(fingerprint)) { "Invalid base name" }
            val content = field()
            if (text in needed) result[text] = content
        }
        result
    }

    private fun extract(packet: File, field: Field, output: File) {
        RandomAccessFile(packet, "r").use { input ->
            input.seek(field.offset)
            FileOutputStream(output).use { out ->
                val buffer = ByteArray(64 * 1024)
                var remaining = field.size
                while (remaining > 0) {
                    val count = input.read(buffer, 0, minOf(remaining, buffer.size.toLong()).toInt())
                    check(count > 0) { "Truncated entry" }
                    out.write(buffer, 0, count)
                    remaining -= count
                }
                out.fd.sync()
            }
        }
    }

    private fun isHbc(name: String, file: File): Boolean {
        if (!name.endsWith(".js") || file.length() < 16) return false
        return RandomAccessFile(file, "r").use {
            uint32(it) == 0x0100c634L && uint32(it) == 0x03bc1fc6L && uint32(it) == 0x1f1903c1L &&
                uint32(it) > 0
        }
    }

    private fun checkPatchHeader(file: File) {
        val expected = "HDIFFSF20&zlib\u0000".toByteArray(Charsets.US_ASCII)
        file.inputStream().use {
            val actual = ByteArray(expected.size)
            var offset = 0
            while (offset < actual.size) {
                val read = it.read(actual, offset, actual.size - offset)
                check(read > 0) { "Truncated HDiff header" }
                offset += read
            }
            check(actual.contentEquals(expected)) { "Unsupported HDiff header" }
        }
    }

    companion object {
        private const val LIMIT = 64L shl 20
        private const val METADATA_LIMIT = 1024L * 1024
        private const val MAX_ENTRIES = 4096
        private const val MAGIC = 0x0100c633L
        private val hashPattern = Regex("[0-9a-f]{64}")
        private val drivePattern = Regex("^[A-Za-z]:")
        private fun validVersion(value: String) = value.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) &&
            !value.equals("latest.json", true)
        private fun validName(name: String) = name.isNotEmpty() && '\\' !in name && '\u0000' !in name &&
            !drivePattern.containsMatchIn(name) &&
            name.split('/').none { it.isEmpty() || it == "." || it == ".." }
        private fun integer(value: JsonElement): Long = value.otaLong()
        private fun sha(value: JsonElement): String {
            val hash = value.otaString()
            check(hashPattern.matches(hash)) { "Invalid split SHA256" }
            return hash
        }
        private fun digest(json: JsonObject, limit: Long): Digest {
            val hash = sha(json.getValue("sha256"))
            val size = integer(json.getValue("size"))
            check(size in 0..limit) { "Invalid split size" }
            return Digest(hash, size)
        }
        private fun digestFile(file: File, limit: Long): Digest {
            check(file.isFile && file.length() <= limit) { "Split output exceeds limit" }
            val hash = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                var count = 0L
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    check(read > 0)
                    count += read
                    check(count <= limit) { "Split file exceeds limit" }
                    hash.update(buffer, 0, read)
                }
                return Digest(hash.digest().joinToString("") { "%02x".format(it) }, count)
            }
        }
        private fun verify(file: File, expected: Digest) {
            check(digestFile(file, expected.size) == expected) { "Split output hash/size mismatch" }
        }
        private fun transfer(input: InputStream, output: OutputStream, limit: Long) {
            val buffer = ByteArray(64 * 1024)
            var count = 0L
            while (true) {
                val read = input.read(buffer, 0, minOf(buffer.size.toLong(), limit - count + 1).toInt())
                if (read < 0) break
                check(read > 0)
                count += read
                check(count <= limit) { "Split stream exceeds limit" }
                output.write(buffer, 0, read)
            }
        }
        private fun pad(size: Long) = ((4 - size % 4) % 4).toInt()
        private fun fieldSize(size: Long) = 4 + size + pad(size)
        private fun uint32(input: RandomAccessFile) = Integer.toUnsignedLong(Integer.reverseBytes(input.readInt()))
        private fun uint32(output: OutputStream, value: Long) {
            repeat(4) { output.write((value ushr (it * 8)).toInt() and 255) }
        }
        private fun fieldHeader(output: OutputStream, size: Long) = uint32(output, size or if (pad(size) > 0) 0x80000000L else 0L)
        private fun padding(output: OutputStream, size: Long) { repeat(pad(size)) { output.write(0) } }
    }
}
