import CoreFoundation
import CryptoKit
import Foundation

/// Foundation-only signed OTA client. The adapter owns UIKit/provider construction.
/// All state transitions and snapshot selection share the lock; network work runs outside it.
final class ValdiOtaClient: @unchecked Sendable {
    struct Info: Sendable {
        let enabled: Bool
        let appVersion: String
        let embeddedBundleVersion: String
        let bundleVersion: String
        let pendingBundleVersion: String?
    }

    struct Configuration: Decodable {
        let appVersion: String
        let url: String
        let publicKey: String
        let modules: [String]
        let bundleVersion: String

        init(appVersion: String, url: String, publicKey: String, modules: [String],
             bundleVersion: String = "pages-001") {
            self.appVersion = appVersion
            self.url = url
            self.publicKey = publicKey
            self.modules = modules
            self.bundleVersion = bundleVersion
        }

        private enum CodingKeys: String, CodingKey { case appVersion, url, publicKey, modules, bundleVersion }
        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            self.init(appVersion: try values.decode(String.self, forKey: .appVersion),
                      url: try values.decode(String.self, forKey: .url),
                      publicKey: try values.decode(String.self, forKey: .publicKey),
                      modules: try values.decode([String].self, forKey: .modules),
                      bundleVersion: try values.decodeIfPresent(String.self, forKey: .bundleVersion) ?? "pages-001")
        }
    }
    struct Descriptor {
        let sha256: String
        let size: Int
    }
    struct Snapshot {
        let version: String
        let directory: URL
        let files: [String: Descriptor]
        let modules: [String: URL]
    }
    private struct State: Codable {
        var binary: String
        var current: String?
        var pending: String?
        func knows(_ version: String) -> Bool {
            current == version || pending == version
        }
    }
    private let configuration: Configuration
    private let root: URL
    private let binaryIdentity: String
    private let bundledModules: [String: URL]
    private let timeout: TimeInterval
    private let codec: any ValdiOtaFileCodec
    private let publicKey: P256.Signing.PublicKey?
    private let lock = NSLock()
    private let fm = FileManager.default
    private var packages: URL { root.appendingPathComponent("packages", isDirectory: true) }
    private var started = false
    private var startupError: Error?
    private var active: Snapshot?
    private var flight: (id: UUID, task: Task<Void, Error>)?
    private static let packageLimit = 64 << 20

    init(configuration: Configuration, root: URL, binaryIdentity: String,
         bundledModules: [String: URL], timeout: TimeInterval = 30,
         codec: any ValdiOtaFileCodec = ValdiOtaNativeCodec()) throws {
        self.configuration = configuration
        self.root = root
        self.binaryIdentity = binaryIdentity
        self.bundledModules = bundledModules
        self.timeout = timeout
        self.codec = codec
        guard Self.validVersion(configuration.appVersion), Self.validVersion(configuration.bundleVersion),
              timeout > 0, timeout.isFinite,
              !configuration.modules.isEmpty,
              Set(configuration.modules).count == configuration.modules.count,
              configuration.modules.allSatisfy({ Self.matches("^[A-Za-z0-9_][A-Za-z0-9_@.-]*$", $0) }) else {
            throw ValdiOtaError("Invalid OTA configuration/inventory")
        }
        publicKey = configuration.url.isEmpty ? nil : try P256.Signing.PublicKey(pemRepresentation: configuration.publicKey)
    }

    /// Repeated calls return the same snapshot. A failed durable selection stays bundled in this process.
    func start() throws -> Snapshot? {
        try locked {
            if started {
                if let startupError { throw startupError }
                return active
            }
            started = true
            guard !configuration.url.isEmpty else { return nil }
            do {
                // A terminated process cannot execute its staging defer. Run once,
                // before this client's update work can create any live attempt.
                let staging = root.appendingPathComponent("staging", isDirectory: true)
                if fm.fileExists(atPath: staging.path) { try fm.removeItem(at: staging) }
                var state = try readState()
                if state.binary != binaryIdentity { state = State(binary: binaryIdentity) }
                var selected: Snapshot?
                if let pending = state.pending {
                    if let package = try? open(pending) {
                        selected = package
                        state.current = pending
                    }
                    state.pending = nil
                }
                if selected == nil, let current = state.current {
                    selected = try? open(current)
                    if selected == nil { state.current = nil }
                }
                // No package is exposed and no previous package is removed before this succeeds.
                try persist(state)
                active = selected
                cleanup(state)
                return active
            } catch {
                startupError = error
                throw error
            }
        }
    }

    func checkForUpdate() async throws {
        guard !configuration.url.isEmpty else { return }
        let shared = locked { () -> (id: UUID, task: Task<Void, Error>) in
            if let flight { return flight }
            let id = UUID()
            let task = Task { try await self.update() }
            let value = (id: id, task: task)
            flight = value
            return value
        }
        defer { locked { if flight?.id == shared.id { flight = nil } } }
        try await shared.task.value
    }

    /// Running selection is fixed at startup; only pending comes from the durable state.
    /// Disabled clients never consult cached OTA state.
    func getInfo() throws -> Info {
        try locked {
            if let startupError { throw startupError }
            guard started else { throw ValdiOtaError("OTA client has not started") }
            let enabled = !configuration.url.isEmpty
            var pending: String?
            if enabled {
                let state = try readState()
                guard state.binary == binaryIdentity else {
                    throw ValdiOtaError("Native installation changed during OTA info read")
                }
                pending = state.pending
            }
            return Info(enabled: enabled, appVersion: configuration.appVersion,
                        embeddedBundleVersion: configuration.bundleVersion,
                        bundleVersion: active?.version ?? configuration.bundleVersion,
                        pendingBundleVersion: pending)
        }
    }

    private func update() async throws {
        _ = try start()
        guard let url = URL(string: configuration.url), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
            throw ValdiOtaError("Invalid OTA base URL")
        }
        let base = url.appendingPathComponent("ios").appendingPathComponent(configuration.appVersion)
        var query = URLComponents(url: base.appendingPathComponent("latest.json"), resolvingAgainstBaseURL: false)!
        query.queryItems = [
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "appVersion", value: configuration.appVersion),
            URLQueryItem(name: "bundleVersion", value: locked { active?.version ?? configuration.bundleVersion })
        ]
        let latest = try await ValdiOtaDownloader.metadata(query.url!,
                                                          limit: 64 << 10, timeout: timeout)
        guard let object = try JSONSerialization.jsonObject(with: latest) as? [String: Any],
              let offered = object["version"] else { throw ValdiOtaError("Invalid latest response") }
        if offered is NSNull { return }
        guard let version = offered as? String, Self.validVersion(version) else {
            throw ValdiOtaError("Invalid offered version")
        }
        if version == configuration.bundleVersion { return }
        if try locked({ try readState().knows(version) || active?.version == version }) { return }
        let remote = base.appendingPathComponent(version)
        let manifest = try await ValdiOtaDownloader.metadata(remote.appendingPathComponent("manifest.json"),
                                                            limit: 1 << 20, timeout: timeout)
        let signature = try await ValdiOtaDownloader.metadata(remote.appendingPathComponent("manifest.sig"),
                                                             limit: 4096, timeout: timeout)
        let descriptors = try verifyManifest(manifest, signature, version: version)
        // Delta bases follow what this process actually runs. Pending/current caches remain
        // eligible for exact full-file reuse below, but never identify a different running base.
        let deltaBase: (version: String, file: URL?, directory: URL?) = locked {
            if let active {
                return (active.version, active.modules["app_pages.valdimodule"], active.directory)
            }
            return (configuration.bundleVersion, bundledModules["app_pages.valdimodule"], nil)
        }
        let candidates: [URL] = try locked {
            let state = try readState()
            let versions = [active?.version, state.current, state.pending].compactMap { $0 }
            return versions.map { packages.appendingPathComponent($0, isDirectory: true) }
        }
        // Each target is assembled in a fresh private directory, never by modifying a live package.
        let work = root.appendingPathComponent("staging", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: work) }
        for path in descriptors.keys.sorted() {
            let descriptor = descriptors[path]!
            let target = work.appendingPathComponent(path)
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            var sources = candidates.map { ($0.appendingPathComponent(path), Optional($0)) }
            if path.hasPrefix("modules/"), let bundled = bundledModules[String(path.dropFirst("modules/".count))] {
                sources.append((bundled, nil))
            }
            var reused = false
            for (source, directory) in sources {
                guard (try? verifyFile(source, descriptor, inside: directory)) != nil else { continue }
                do {
                    try fm.copyItem(at: source, to: target)
                    // Validate the independent copy too, including any source race during copying.
                    try verifyFile(target, descriptor, inside: work)
                    reused = true
                    break
                } catch { try? fm.removeItem(at: target) }
            }
            if !reused, path == "modules/app_pages.valdimodule", let source = deltaBase.file {
                // apply owns and removes every delta temporary. Failure leaves target absent,
                // so the original authenticated full artifact remains the authoritative fallback.
                do {
                    reused = try await ValdiOtaSplit.apply(
                        manifest: manifest, remote: remote, appVersion: configuration.appVersion, version: version,
                        baseVersion: deltaBase.version, baseFile: source, baseDirectory: deltaBase.directory,
                        target: target, descriptor: descriptor, work: work, codec: codec, timeout: timeout)
                } catch {
                    NSLog("ValdiOta: split failed; downloading full module: %@", String(describing: error))
                }
            }
            if !reused {
                let partial = target.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).part")
                defer { try? fm.removeItem(at: partial) }
                try await ValdiOtaDownloader.file(remote.appendingPathComponent(path), descriptor: descriptor,
                                                   to: partial, timeout: timeout)
                try fm.moveItem(at: partial, to: target)
            }
        }
        try manifest.write(to: work.appendingPathComponent("manifest.json"))
        try signature.write(to: work.appendingPathComponent("manifest.sig"))
        // Re-read and verify the complete directory before committing it.
        _ = try openDirectory(work, version: version)
        try locked {
            var state = try readState()
            guard state.binary == binaryIdentity else { throw ValdiOtaError("Native installation changed during OTA check") }
            if state.knows(version) || active?.version == version { return }
            try fm.createDirectory(at: packages, withIntermediateDirectories: true)
            let destination = packages.appendingPathComponent(version, isDirectory: true)
            if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
            try fm.moveItem(at: work, to: destination)
            state.pending = version
            do { try persist(state) }
            catch {
                try? fm.removeItem(at: destination)
                throw error
            }
            cleanup(state)
        }
    }

    private func verifyManifest(_ data: Data, _ signatureBytes: Data, version: String) throws -> [String: Descriptor] {
        guard let publicKey, let encoded = String(data: signatureBytes, encoding: .utf8),
              let der = Data(base64Encoded: encoded.trimmingCharacters(in: .whitespacesAndNewlines)),
              let signature = try? P256.Signing.ECDSASignature(derRepresentation: der),
              publicKey.isValidSignature(signature, for: data) else { throw ValdiOtaError("Invalid OTA signature") }
        // Parse descriptors only after authenticating the exact bytes.
        guard let manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Self.integer(manifest["schemaVersion"]) == 1,
              manifest["platform"] as? String == "ios",
              manifest["appVersion"] as? String == configuration.appVersion,
              manifest["version"] as? String == version, Self.validVersion(version),
              let files = manifest["files"] as? [String: Any], files.count <= 4096 else {
            throw ValdiOtaError("Invalid OTA manifest schema/compatibility")
        }
        var result: [String: Descriptor] = [:]
        var inventory = Set<String>()
        let enabled = Set(configuration.modules)
        var total = 0
        for (path, raw) in files {
            let parts = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            guard parts.allSatisfy({ Self.matches("^[A-Za-z0-9_@][A-Za-z0-9._@-]*$", $0) && $0 != "." && $0 != ".." }),
                  let object = raw as? [String: Any], let hash = object["sha256"] as? String,
                  Self.matches("^[0-9a-f]{64}$", hash),
                  let size = Self.integer(object["size"]), size >= 0, size <= Self.packageLimit - total else {
                throw ValdiOtaError("Invalid OTA file descriptor")
            }
            if parts.count == 2, parts[0] == "modules" {
                let name = parts[1]
                let module: String
                if name.hasSuffix(".valdimodule") {
                    module = String(name.dropLast(".valdimodule".count))
                    inventory.insert(module)
                } else if name.hasSuffix(".map.json") {
                    module = String(name.dropLast(".map.json".count))
                } else { throw ValdiOtaError("Unknown module artifact") }
                guard enabled.contains(module) else { throw ValdiOtaError("Unknown module/map") }
            } else if parts.count == 3, parts[0] == "res", parts[1].hasSuffix(".bundle") {
                let module = String(parts[1].dropLast(".bundle".count))
                guard enabled.contains(module) else { throw ValdiOtaError("Unknown resource module") }
            } else { throw ValdiOtaError("Unknown OTA file layout") }
            total += size
            result[path] = Descriptor(sha256: hash, size: size)
        }
        guard inventory == enabled else { throw ValdiOtaError("Incomplete OTA module inventory") }
        return result
    }

    private func open(_ version: String) throws -> Snapshot {
        try openDirectory(packages.appendingPathComponent(version, isDirectory: true), version: version)
    }

    private func openDirectory(_ directory: URL, version: String) throws -> Snapshot {
        let manifest = try readMetadata(directory.appendingPathComponent("manifest.json"), limit: 1 << 20, inside: directory)
        let signature = try readMetadata(directory.appendingPathComponent("manifest.sig"), limit: 4096, inside: directory)
        let descriptors = try verifyManifest(manifest, signature, version: version)
        var modules: [String: URL] = [:]
        for (path, descriptor) in descriptors {
            let file = directory.appendingPathComponent(path)
            try verifyFile(file, descriptor, inside: directory)
            if path.hasPrefix("modules/") { modules[String(path.dropFirst("modules/".count))] = file }
        }
        return Snapshot(version: version, directory: directory, files: descriptors, modules: modules)
    }

    private func checkRegular(_ file: URL, inside directory: URL?) throws {
        var entry = file
        while true {
            let values = try entry.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true,
                  entry == file ? values.isRegularFile == true : values.isDirectory == true else {
                throw ValdiOtaError("OTA entry is not a private regular file/directory")
            }
            guard let directory, entry.standardizedFileURL != directory.standardizedFileURL else { return }
            let parent = entry.deletingLastPathComponent()
            guard parent != entry else { throw ValdiOtaError("OTA file escaped directory") }
            entry = parent
        }
    }

    private func verifyFile(_ file: URL, _ descriptor: Descriptor, inside directory: URL?) throws {
        try checkRegular(file, inside: directory)
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var count = 0
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 64 << 10), !chunk.isEmpty {
            guard chunk.count <= descriptor.size - count else { throw ValdiOtaError("Cached OTA length mismatch") }
            count += chunk.count
            hash.update(data: chunk)
        }
        guard count == descriptor.size,
              hash.finalize().map({ String(format: "%02x", $0) }).joined() == descriptor.sha256 else {
            throw ValdiOtaError("Cached OTA SHA256/length mismatch")
        }
    }

    private func readMetadata(_ file: URL, limit: Int, inside directory: URL? = nil) throws -> Data {
        try checkRegular(file, inside: directory)
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: limit + 1) ?? Data()
        guard data.count <= limit else { throw ValdiOtaError("Cached OTA metadata exceeds limit") }
        return data
    }

    private func readState() throws -> State {
        let file = root.appendingPathComponent("state.json")
        guard fm.fileExists(atPath: file.path) else { return State(binary: "") }
        let state = try JSONDecoder().decode(State.self, from: readMetadata(file, limit: 1 << 20))
        guard [state.current, state.pending].compactMap({ $0 }).allSatisfy(Self.validVersion),
              state.current == nil || state.current != state.pending else {
            throw ValdiOtaError("Invalid OTA state")
        }
        return state
    }

    private func persist(_ state: State) throws {
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: root.appendingPathComponent("state.json"), options: .atomic)
    }

    private func cleanup(_ state: State) {
        let protected = Set([state.current, state.pending, active?.version].compactMap { $0 })
        for entry in (try? fm.contentsOfDirectory(at: packages, includingPropertiesForKeys: nil)) ?? []
        where !protected.contains(entry.lastPathComponent) {
            try? fm.removeItem(at: entry)
        }
    }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    private static func validVersion(_ version: String) -> Bool {
        version.lowercased() != "latest.json" && matches("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", version)
    }
    private static func matches(_ pattern: String, _ text: String) -> Bool {
        // \z (via full range equality) rejects trailing newlines, unlike $ alone.
        guard let range = text.range(of: pattern, options: .regularExpression) else { return false }
        return range == text.startIndex..<text.endIndex
    }
    private static func integer(_ raw: Any?) -> Int? {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= 0, number.doubleValue <= Double(packageLimit) else { return nil }
        return number.intValue
    }
}
