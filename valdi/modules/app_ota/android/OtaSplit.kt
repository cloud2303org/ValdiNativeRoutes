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
    private val download: (path: String, size: Long, output: File) -> Unit,
) {
    private data class Digest(val hash: String, val size: Long)
    private data class Field(val offset: Long, val size: Long)
    private data class Entry(val name: String, val size: Long, val operation: String, val payload: JsonObject?)

    fun rebuild(full: JsonObject, baseVersion: String,
        targetHash: String, targetSize: Long, work: File, output: File, baseSource: () -> InputStream?): Boolean {
        val deltas = full.getValue("deltas").jsonArray
        check(deltas.size <= 8) { "Too many delta descriptors" }
        val selected = deltas.firstOrNull { it.jsonObject.otaString("baseVersion") == baseVersion }?.jsonObject
            ?: return false
        check(validVersion(baseVersion) && selected.otaString("path") == "deltas/$baseVersion/manifest.json") { "Invalid delta path" }
        // Base candidates are confined to this process's snapshot or its embedded app_pages.
        val base = File(work, "base.zst")
        val stream = baseSource() ?: return false
        stream.use { input ->
            FileOutputStream(base).use { out -> transfer(input, out, LIMIT); out.fd.sync() }
        }
        val metadata = File(work, "manifest.json")
        val metadataSize = size(selected, METADATA_LIMIT)
        download(selected.otaString("path"), metadataSize, metadata)
        val json = parseOtaObject(metadata.readText(Charsets.UTF_8))
        // Split hashes and identity hints are informational. Only the signed full descriptor
        // authenticates the completed compressed archive; sizes here bound reconstruction IO.
        val rawEntries = json.getValue("entries").jsonArray
        check(rawEntries.size <= MAX_ENTRIES) { "Too many split entries" }
        val names = HashSet<String>()
        var packetSize = 8L
        var payloadSize = metadataSize
        val entries = (0 until rawEntries.size).map { index ->
            val entry = rawEntries[index].jsonObject
            val name = entry.otaString("name")
            check(validName(name) && names.add(name)) { "Invalid or duplicate archive name" }
            val entrySize = size(entry, LIMIT)
            packetSize += fieldSize(name.toByteArray(Charsets.UTF_8).size.toLong()) + fieldSize(entrySize)
            check(packetSize <= LIMIT) { "Split entries exceed packet limit" }
            val operation = entry.otaString("operation")
            val payload = if (entry.containsKey("download")) entry.getValue("download").jsonObject else null
            when (operation) {
                "copy" -> check(payload == null) { "Copy has a payload" }
                "full", "patch" -> {
                    check(payload != null) { "Missing split payload" }
                    val contentSize = size(payload, LIMIT)
                    payloadSize += contentSize
                    check(payloadSize <= LIMIT) { "Split payload budget exceeded" }
                    val encoding = payload.otaString("encoding")
                    val extension = when (encoding) {
                        "raw" -> { check(operation == "full"); "bin" }
                        "zstd" -> { check(operation == "full"); "zst" }
                        "hdiffpatch-zlib" -> { check(operation == "patch"); "hdiff" }
                        else -> error("Unsupported split payload encoding")
                    }
                    check(payload.otaString("path").matches(Regex("deltas/${Regex.escape(baseVersion)}/payload/[0-9a-f]{64}\\.$extension"))) {
                        "Invalid split payload path"
                    }
                    if (encoding == "raw") check(contentSize == entrySize) { "Raw payload length mismatch" }
                }
                else -> error("Unsupported split operation")
            }
            Entry(name, entrySize, operation, payload)
        }
        val oldPacket = File(work, "base.packet")
        check(codec.decode(base, oldPacket, LIMIT) == 0) { "Cannot decode base archive" }
        val old = index(oldPacket, names)
        val staged = entries.mapIndexed { index, entry ->
            val target = File(work, "entry-$index")
            when (entry.operation) {
                "copy" -> {
                    val field = old[entry.name] ?: error("Missing copy base")
                    check(field.size == entry.size) { "Copy length mismatch" }
                    extract(oldPacket, field, target)
                }
                "full", "patch" -> {
                    val payload = entry.payload!!
                    val encoded = File(work, "payload-$index")
                    download(payload.otaString("path"), size(payload, LIMIT), encoded)
                    when (payload.otaString("encoding")) {
                        "raw" -> check(encoded.renameTo(target)) { "Cannot stage raw entry" }
                        "zstd" -> check(codec.decode(encoded, target, entry.size) == 0) { "Cannot decode entry" }
                        else -> {
                            val field = old[entry.name] ?: error("Missing patch base")
                            val oldEntry = File(work, "old-$index")
                            extract(oldPacket, field, oldEntry)
                            check(isHbc(entry.name, oldEntry)) { "Only HBC entries can be patched" }
                            checkPatchHeader(encoded)
                            check(codec.patch(oldEntry, encoded, target, entry.size) == 0) { "Cannot apply patch" }
                            check(isHbc(entry.name, target)) { "Patch output is not HBC" }
                            oldEntry.delete()
                        }
                    }
                    encoded.delete()
                }
            }
            check(target.isFile && target.length() == entry.size) { "Split entry length mismatch" }
            target
        }
        val packet = File(work, "target.packet")
        FileOutputStream(packet).use { out ->
            uint32(out, MAGIC)
            uint32(out, packetSize - 8)
            entries.zip(staged).forEach { (entry, file) ->
                val name = entry.name.toByteArray(Charsets.UTF_8)
                fieldHeader(out, name.size.toLong())
                out.write(name)
                padding(out, name.size.toLong())
                fieldHeader(out, entry.size)
                file.inputStream().use { transfer(it, out, entry.size) }
                padding(out, entry.size)
            }
            out.fd.sync()
        }
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
        private val drivePattern = Regex("^[A-Za-z]:")
        private fun validVersion(value: String) = value.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")) &&
            !value.equals("latest.json", true)
        private fun validName(name: String) = name.isNotEmpty() && '\\' !in name && '\u0000' !in name &&
            !drivePattern.containsMatchIn(name) &&
            name.split('/').none { it.isEmpty() || it == "." || it == ".." }
        private fun integer(value: JsonElement): Long = value.otaLong()
        private fun size(json: JsonObject, limit: Long): Long {
            val size = integer(json.getValue("size"))
            check(size in 0..limit) { "Invalid split size" }
            return size
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
