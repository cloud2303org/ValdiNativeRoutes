import CoreFoundation
import CryptoKit
import Foundation

/// File-only boundary: the native core owns bounded ZSTD/HDiff IO and exclusive output creation.
protocol ValdiOtaFileCodec {
    func decode(_ input: URL, to output: URL, maxOutput: Int) throws
    func encode(_ input: URL, to output: URL, maxOutput: Int) throws
    func patch(_ old: URL, patch: URL, to output: URL, expectedSize: Int) throws
}

struct ValdiOtaNativeCodec: ValdiOtaFileCodec {
    func decode(_ input: URL, to output: URL, maxOutput: Int) throws {
        #if VALDI_OTA_NO_CODEC
        throw ValdiOtaError("OTA codec unavailable")
        #else
        guard vr_ota_zstd_decode(input.path, output.path, UInt64(maxOutput)) == 0 else {
            throw ValdiOtaError("OTA ZSTD decode failed")
        }
        #endif
    }
    func encode(_ input: URL, to output: URL, maxOutput: Int) throws {
        #if VALDI_OTA_NO_CODEC
        throw ValdiOtaError("OTA codec unavailable")
        #else
        guard vr_ota_zstd_encode(input.path, output.path, UInt64(maxOutput)) == 0 else {
            throw ValdiOtaError("OTA ZSTD encode failed")
        }
        #endif
    }
    func patch(_ old: URL, patch: URL, to output: URL, expectedSize: Int) throws {
        #if VALDI_OTA_NO_CODEC
        throw ValdiOtaError("OTA codec unavailable")
        #else
        guard vr_ota_hdiff_patch(old.path, patch.path, output.path, UInt64(expectedSize)) == 0 else {
            throw ValdiOtaError("OTA HDiff patch failed")
        }
        #endif
    }
}

/// An optimization under the authenticated full-file manifest. Any error escapes to full fallback.
/// Entry contents and packets are streamed in 64 KiB chunks, never collected into archive-sized Data.
enum ValdiOtaSplit {
    private static let limit = 64 << 20
    private static let metadataLimit = 1 << 20
    private static let fm = FileManager.default
    private struct Delta {
        let baseVersion: String
        let path: String
        let size: Int
    }
    private struct Download {
        let path: String
        let size: Int
        let encoding: String
    }
    private struct Entry {
        let name: String
        let size: Int
        let operation: String
        let download: Download?
    }
    private struct Source {
        let file: URL
        let size: Int
    }

    static func apply(manifest: Data, remote: URL,
                      baseVersion: String, baseFile: URL, baseDirectory: URL?,
                      target: URL, descriptor: ValdiOtaClient.Descriptor,
                      work: URL, codec: any ValdiOtaFileCodec, timeout: TimeInterval) async throws -> Bool {
        let deltas = try descriptors(manifest)
        guard let delta = deltas.first(where: { $0.baseVersion == baseVersion }) else { return false }
        try checkRegular(baseFile, inside: baseDirectory)
        _ = try fileSize(baseFile)
        let directory = work.appendingPathComponent(".delta-" + UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: directory) }
        let metadataFile = directory.appendingPathComponent("metadata.json")
        try await ValdiOtaDownloader.file(remote.appendingPathComponent(delta.path), limit: delta.size,
                                          to: metadataFile, timeout: timeout)
        let metadataHandle = try FileHandle(forReadingFrom: metadataFile)
        defer { try? metadataHandle.close() }
        let metadata = try metadataHandle.read(upToCount: metadataLimit + 1) ?? Data()
        guard metadata.count <= metadataLimit,
              let object = try JSONSerialization.jsonObject(with: metadata) as? [String: Any],
              let rawEntries = object["entries"] as? [[String: Any]], rawEntries.count <= 4096 else {
            throw ValdiOtaError("Invalid split entries")
        }
        let (entries, packetSize) = try parseEntries(rawEntries, baseVersion: baseVersion, metadataSize: metadata.count)
        let oldPacket = directory.appendingPathComponent("base.packet")
        try codec.decode(baseFile, to: oldPacket, maxOutput: limit)
        let old = try extract(oldPacket, size: fileSize(oldPacket), into: directory)
        let targetPacket = directory.appendingPathComponent("target.packet")
        let writer = try output(targetPacket)
        defer { try? writer.close() }
        try writer.write(contentsOf: word(0x0100c633) + word(UInt32(packetSize - 8)))
        for (index, entry) in entries.enumerated() {
            let outputFile = directory.appendingPathComponent("target-entry-\(index)")
            switch entry.operation {
            case "copy":
                guard let source = old[entry.name], source.size == entry.size else {
                    throw ValdiOtaError("Split copy base mismatch")
                }
                try fm.copyItem(at: source.file, to: outputFile)
            case "full", "patch":
                let download = entry.download!
                let payload = directory.appendingPathComponent("payload-\(index)")
                try await ValdiOtaDownloader.file(remote.appendingPathComponent(download.path), limit: download.size,
                                                  to: payload, timeout: timeout)
                if entry.operation == "patch" {
                    guard let source = old[entry.name],
                          try hbc(source.file, name: entry.name) else { throw ValdiOtaError("Split patch base/envelope mismatch") }
                    try codec.patch(source.file, patch: payload, to: outputFile, expectedSize: entry.size)
                    guard try hbc(outputFile, name: entry.name) else { throw ValdiOtaError("Split patch target is not HBC") }
                } else if download.encoding == "zstd" {
                    try codec.decode(payload, to: outputFile, maxOutput: entry.size)
                } else {
                    try fm.moveItem(at: payload, to: outputFile)
                }
            default: throw ValdiOtaError("Invalid split operation")
            }
            guard try fileSize(outputFile) == entry.size else { throw ValdiOtaError("Split entry length mismatch") }
            try field(Data(entry.name.utf8), to: writer)
            try writer.write(contentsOf: fieldHeader(entry.size))
            let reader = try FileHandle(forReadingFrom: outputFile)
            do { try stream(reader, to: writer, count: entry.size); try reader.close() }
            catch { try? reader.close(); throw error }
            try writer.write(contentsOf: Data(repeating: 0, count: padding(entry.size)))
            // Keep at most the old entries and one newly assembled entry on disk.
            try fm.removeItem(at: outputFile)
            let payload = directory.appendingPathComponent("payload-\(index)")
            if fm.fileExists(atPath: payload.path) { try fm.removeItem(at: payload) }
        }
        try writer.synchronize()
        try writer.close()
        let archive = directory.appendingPathComponent("target.zst")
        // Bound recompression by the package cap, then authenticate the exact final compressed bytes.
        try codec.encode(targetPacket, to: archive, maxOutput: limit)
        // Equivalent decompressed bytes are insufficient. The full signed compressed descriptor wins.
        try verify(archive, descriptor)
        try fm.moveItem(at: archive, to: target)
        return true
    }

    private static func descriptors(_ bytes: Data) throws -> [Delta] {
        guard let manifest = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw ValdiOtaError("Invalid full manifest") }
        guard let raw = manifest["deltas"] else { return [] }
        guard let array = raw as? [[String: Any]], array.count <= 8 else { throw ValdiOtaError("Invalid deltas array") }
        var versions = Set<String>()
        return try array.map { object in
            guard let version = object["baseVersion"] as? String, validVersion(version), versions.insert(version).inserted,
                  let path = object["path"] as? String, path == "deltas/\(version)/manifest.json",
                  let size = integer(object["size"]), size <= metadataLimit else {
                throw ValdiOtaError("Invalid signed delta descriptor")
            }
            return Delta(baseVersion: version, path: path, size: size)
        }
    }

    private static func parseEntries(_ objects: [[String: Any]], baseVersion: String,
                                     metadataSize: Int) throws -> ([Entry], Int) {
        var names = Set<String>(), total = 8, downloaded = metadataSize
        let entries = try objects.map { object -> Entry in
            guard let name = object["name"] as? String, validName(name), names.insert(name).inserted,
                  let size = integer(object["size"]), let operation = object["operation"] as? String else {
                throw ValdiOtaError("Invalid split entry")
            }
            let nameSize = name.utf8.count
            let addition = 8 + nameSize + padding(nameSize) + size + padding(size)
            guard addition <= limit - total else { throw ValdiOtaError("Split entry packet size exceeds bound") }
            total += addition
            var download: Download?
            if operation != "copy" {
                guard operation == "full" || operation == "patch",
                      let raw = object["download"] as? [String: Any],
                      let payloadSize = integer(raw["size"]), let path = raw["path"] as? String,
                      let encoding = raw["encoding"] as? String else { throw ValdiOtaError("Invalid split download") }
                let prefix = "deltas/\(baseVersion)/payload/"
                guard path.hasPrefix(prefix) else { throw ValdiOtaError("Split payload escaped base") }
                let suffix: String
                if operation == "patch" {
                    guard name.hasSuffix(".js"), encoding == "hdiffpatch-zlib" else { throw ValdiOtaError("Invalid patch descriptor") }
                    suffix = ".hdiff"
                } else {
                    guard encoding == "raw" || encoding == "zstd" else { throw ValdiOtaError("Invalid full encoding") }
                    suffix = encoding == "raw" ? ".bin" : ".zst"
                    if encoding == "raw" && payloadSize != size { throw ValdiOtaError("Raw entry length mismatch") }
                }
                let tail = String(path.dropFirst(prefix.count))
                guard tail.hasSuffix(suffix), hashValid(String(tail.dropLast(suffix.count))),
                      payloadSize <= limit - downloaded else { throw ValdiOtaError("Invalid payload path/budget") }
                downloaded += payloadSize
                download = Download(path: path, size: payloadSize, encoding: encoding)
            }
            return Entry(name: name, size: size, operation: operation, download: download)
        }
        return (entries, total)
    }

    private static func extract(_ packet: URL, size: Int, into directory: URL) throws -> [String: Source] {
        let reader = try FileHandle(forReadingFrom: packet)
        defer { try? reader.close() }
        var offset = 0
        func read(_ count: Int) throws -> Data {
            guard count >= 0, count <= size - offset else { throw ValdiOtaError("Truncated Valdi packet") }
            let bytes = try exact(reader, count: count)
            offset += count
            return bytes
        }
        func uint() throws -> UInt32 { try read(4).enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << ($1.offset * 8) } }
        func fieldSize() throws -> (Int, Int) {
            let raw = try uint(), count = Int(raw & 0x7fffffff)
            let pad = raw & 0x80000000 == 0 ? 0 : padding(count)
            guard count <= size - offset, pad <= size - offset - count else { throw ValdiOtaError("Valdi packet field exceeds bound") }
            return (count, pad)
        }
        guard size >= 8, try uint() == 0x0100c633, try uint() == UInt32(size - 8) else { throw ValdiOtaError("Invalid Valdi packet header") }
        var entries: [String: Source] = [:]
        while offset < size {
            guard entries.count < 4096 else { throw ValdiOtaError("Too many base packet entries") }
            let (nameSize, namePad) = try fieldSize()
            guard nameSize <= metadataLimit, let name = String(data: try read(nameSize), encoding: .utf8),
                  validName(name), entries[name] == nil,
                  try read(namePad).allSatisfy({ $0 == 0 }) else { throw ValdiOtaError("Invalid base archive name/padding") }
            let (count, pad) = try fieldSize()
            let file = directory.appendingPathComponent("base-entry-\(entries.count)")
            let writer = try output(file)
            do {
                try stream(reader, to: writer, count: count)
                offset += count
                try writer.close()
            } catch { try? writer.close(); throw error }
            guard try read(pad).allSatisfy({ $0 == 0 }) else { throw ValdiOtaError("Invalid base archive padding") }
            entries[name] = Source(file: file, size: count)
        }
        return entries
    }

    private static func hbc(_ file: URL, name: String) throws -> Bool {
        guard name.hasSuffix(".js") else { return false }
        let reader = try FileHandle(forReadingFrom: file)
        defer { try? reader.close() }
        let bytes = try reader.read(upToCount: 16) ?? Data()
        // Valdi precompiled .js envelope followed by Hermes bytecode magic and its version word.
        return bytes.count == 16 && bytes.prefix(12) == Data([0x34, 0xc6, 0x00, 0x01, 0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f])
    }

    private static func output(_ file: URL) throws -> FileHandle {
        guard !fm.fileExists(atPath: file.path), fm.createFile(atPath: file.path, contents: nil) else { throw ValdiOtaError("Cannot create split output") }
        return try FileHandle(forWritingTo: file)
    }
    private static func exact(_ handle: FileHandle, count: Int) throws -> Data {
        var data = Data()
        while data.count < count {
            guard let chunk = try handle.read(upToCount: min(64 << 10, count - data.count)), !chunk.isEmpty else { throw ValdiOtaError("Truncated split input") }
            data.append(chunk)
        }
        return data
    }
    private static func stream(_ reader: FileHandle, to writer: FileHandle, count: Int) throws {
        var left = count
        while left > 0 {
            let chunk = try exact(reader, count: min(left, 64 << 10))
            try writer.write(contentsOf: chunk)
            left -= chunk.count
        }
    }
    private static func word(_ value: UInt32) -> Data {
        var value = value.littleEndian
        return withUnsafeBytes(of: &value) { Data($0) }
    }
    private static func padding(_ size: Int) -> Int { (4 - size % 4) % 4 }
    private static func fieldHeader(_ size: Int) -> Data { word(UInt32(size) | (padding(size) > 0 ? 0x80000000 : 0)) }
    private static func field(_ bytes: Data, to writer: FileHandle) throws {
        try writer.write(contentsOf: fieldHeader(bytes.count))
        try writer.write(contentsOf: bytes)
        try writer.write(contentsOf: Data(repeating: 0, count: padding(bytes.count)))
    }
    private static func integer(_ raw: Any?) -> Int? {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
              n.doubleValue >= 0, n.doubleValue <= Double(limit), n.doubleValue.rounded() == n.doubleValue else { return nil }
        return n.intValue
    }
    private static func hashValid(_ hash: String) -> Bool { hash.utf8.count == 64 && hash.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) } }
    private static func validVersion(_ version: String) -> Bool {
        guard version.lowercased() != "latest.json", let range = version.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", options: .regularExpression) else { return false }
        return range == version.startIndex..<version.endIndex
    }
    private static func validName(_ name: String) -> Bool {
        !name.contains("\0") && !name.contains("\\") && name.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }
    }
    private static func checkRegular(_ file: URL, inside directory: URL?) throws {
        var entry = file
        while true {
            let values = try entry.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true, entry == file ? values.isRegularFile == true : values.isDirectory == true else { throw ValdiOtaError("Split source is not a private regular file") }
            guard let directory, entry.standardizedFileURL != directory.standardizedFileURL else { return }
            let parent = entry.deletingLastPathComponent()
            guard parent != entry else { throw ValdiOtaError("Split source escaped directory") }
            entry = parent
        }
    }
    private static func verify(_ file: URL, _ expected: ValdiOtaClient.Descriptor) throws {
        try checkRegular(file, inside: nil)
        let reader = try FileHandle(forReadingFrom: file)
        defer { try? reader.close() }
        var hash = SHA256(), size = 0
        while let chunk = try reader.read(upToCount: 64 << 10), !chunk.isEmpty {
            guard chunk.count <= limit - size else { throw ValdiOtaError("Split file exceeds limit") }
            hash.update(data: chunk); size += chunk.count
        }
        guard size == expected.size,
              hash.finalize().map({ String(format: "%02x", $0) }).joined() == expected.sha256 else {
            throw ValdiOtaError("Split SHA256/length mismatch")
        }
    }
    private static func fileSize(_ file: URL) throws -> Int {
        guard let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size >= 0, size <= limit else {
            throw ValdiOtaError("Split file exceeds limit")
        }
        return size
    }
}
