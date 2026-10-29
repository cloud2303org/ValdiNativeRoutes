import CryptoKit
import Foundation
import UIKit

/// Over-the-air updates of the Valdi modules, as ValdiOta.kt on Android: same server layout (scripts/ota.mjs), state and
/// rollback. Valdi asks the provider from `start()` for every module and module image before the app's own, so a package
/// replaces code and images together. The package is chosen once per process; one downloaded meanwhile waits for the
/// next cold start. A new package is pending until a launch confirms it; a pending package whose launch never confirmed
/// is rolled back and not downloaded again. A new build of the app drops every package.
enum ValdiOta {
    private static let maxPackageBytes = 64 << 20
    private static let versionPattern = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    private static let filePattern = try! NSRegularExpression(pattern: "^(modules|res)(/[A-Za-z0-9_@][A-Za-z0-9._@-]*)+$")
    private static let lock = NSLock()
    private static let files = FileManager.default

    private static var config: Config!
    private static var root: URL!
    private static var packages: URL { root.appendingPathComponent("packages", isDirectory: true) }
    private static var active: Package?

    /// Picks this process's package; call before the Valdi runtime starts and give the result to it.
    static func start() -> ValdiOtaModules {
        config = Config.read()
        root = files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("valdi-ota", isDirectory: true)
        let binary = "\(config.fingerprint)/\(buildIdentity())"
        locked {
            var state = State.read(root)
            if state.binary != binary {
                try? files.removeItem(at: packages)
                state = State(binary: binary)
            }
            var version = state.current
            if let pending = state.pending {
                if state.pendingLaunched {
                    NSLog("ValdiOta: rolling back %@: its launch never confirmed", pending)
                    state.dropPending()
                } else {
                    state.pendingLaunched = true
                    version = pending
                }
            }
            active = version.flatMap { Package.open(packages.appendingPathComponent($0), version: $0) }
            if let version, active == nil {
                NSLog("ValdiOta: dropping unreadable package %@", version)
                if version == state.pending { state.dropPending() } else { state.current = nil }
            }
            // Rolled back, superseded or half-installed packages.
            for dir in (try? files.contentsOfDirectory(at: packages, includingPropertiesForKeys: nil)) ?? []
            where dir.lastPathComponent != state.current && dir.lastPathComponent != state.pending {
                try? files.removeItem(at: dir)
            }
            state.write(root)
        }
        NSLog("ValdiOta: Valdi modules from %@ (%@, fingerprint %@)", active.map { "package \($0.version)" } ?? "the app",
              config.appVersion, config.fingerprint)
        return ValdiOtaModules(modules: active?.modules ?? [:], images: active?.images ?? [:])
    }

    /// The launch got through startApp: the package it runs becomes the current one.
    static func confirmLaunch() {
        guard let version = active?.version else { return }
        locked {
            var state = State.read(root)
            guard state.pending == version else { return }
            if let current = state.current { try? files.removeItem(at: packages.appendingPathComponent(current)) }
            state.current = version
            state.pending = nil
            state.pendingLaunched = false
            state.write(root)
        }
    }

    /// A module image from this process's package, for native views that show them (the tab bar); nil for the app's.
    static func image(module: String, name: String) -> UIImage? {
        guard let url = active?.images["\(module)/\(name)"].flatMap(URL.init(string:)) else { return nil }
        // contentsOfFile reads the @2x/@3x suffix as the image's scale.
        return UIImage(contentsOfFile: url.path)
    }

    /// Downloads the package published for this app version (CFBundleShortVersionString), if there is a new one, to be
    /// used from the next cold start.
    static func checkForUpdate() async {
        guard !config.url.isEmpty else { return }
        do {
            try await update()
        } catch {
            NSLog("ValdiOta: update check failed: %@", String(describing: error))
        }
    }

    private static func update() async throws {
        guard let url = URL(string: config.url) else { throw OtaError("Bad update URL \(config.url)") }
        let base = url.appendingPathComponent("ios").appendingPathComponent(config.appVersion)
        let latest = try JSONDecoder().decode(Latest.self, from: try await download(base.appendingPathComponent("latest.json"), 64 << 10))
        let version = latest.version
        guard matches(versionPattern, version) else { throw OtaError("Bad version '\(version)'") }
        if locked({ State.read(root).knows(version) }) { return }

        // The manifest is checked before anything else is downloaded.
        let dir = base.appendingPathComponent(version)
        let manifest = try await download(dir.appendingPathComponent("manifest.json"), 1 << 20)
        let signature = try await download(dir.appendingPathComponent("manifest.sig"), 4096)
        let listed = try verify(manifest, signature, version)

        let work = root.appendingPathComponent("download", isDirectory: true)
        try? files.removeItem(at: work)
        defer { try? files.removeItem(at: work) }
        let unpacked = work.appendingPathComponent(version, isDirectory: true)
        var total = 0
        for (name, hash) in listed {
            let bytes = try await download(dir.appendingPathComponent(name), maxPackageBytes - total)
            total += bytes.count
            guard sha256(bytes) == hash else { throw OtaError("Bad hash: \(name)") }
            try write(bytes, to: unpacked.appendingPathComponent(name))
        }
        try write(manifest, to: unpacked.appendingPathComponent("manifest.json"))
        try write(signature, to: unpacked.appendingPathComponent("manifest.sig"))
        try locked {
            var state = State.read(root)
            if state.knows(version) { return }
            try files.createDirectory(at: packages, withIntermediateDirectories: true)
            try files.moveItem(at: unpacked, to: packages.appendingPathComponent(version))
            // A replaced pending package that this process runs stays until the next start cleans it up.
            if let pending = state.pending, pending != active?.version {
                try? files.removeItem(at: packages.appendingPathComponent(pending))
            }
            state.pending = version
            state.pendingLaunched = false
            state.write(root)
        }
        NSLog("ValdiOta: package %@ installed; used from the next cold start", version)
    }

    /// The package's files and their sha256, from a manifest signed with the app's key for this binary.
    private static func verify(_ manifestBytes: Data, _ signatureBytes: Data, _ version: String) throws -> [String: String] {
        guard let base64 = String(data: signatureBytes, encoding: .utf8),
              let der = Data(base64Encoded: base64.trimmingCharacters(in: .whitespacesAndNewlines)),
              let signature = try? P256.Signing.ECDSASignature(derRepresentation: der),
              config.publicKey.isValidSignature(signature, for: manifestBytes)
        else { throw OtaError("Bad signature on \(version)") }
        let manifest = try JSONDecoder().decode(Manifest.self, from: manifestBytes)
        guard manifest.platform == "ios" else { throw OtaError("Not an iOS package") }
        guard manifest.appVersion == config.appVersion else { throw OtaError("Package for \(manifest.appVersion)") }
        // pack checks it against the version's release record; this catches a binary whose native side differs anyway.
        guard manifest.fingerprint == config.fingerprint else {
            throw OtaError("Package for another native side of \(config.appVersion)")
        }
        guard manifest.version == version else { throw OtaError("Package is \(manifest.version), not \(version)") }
        guard manifest.files.keys.allSatisfy({ matches(filePattern, $0) }) else { throw OtaError("Bad file name in \(version)") }
        guard manifest.files.keys.contains(where: { $0.hasPrefix("modules/") && $0.hasSuffix(".valdimodule") })
        else { throw OtaError("Package has no module") }
        return manifest.files
    }

    private static func download(_ url: URL, _ maxBytes: Int) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(from: url)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw OtaError("GET \(url): \(status)") }
        guard data.count <= maxBytes else { throw OtaError("\(url) is larger than \(maxBytes) bytes") }
        return data
    }

    private static func write(_ data: Data, to url: URL) throws {
        try files.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
    }

    /// The app's build: a reinstall from Xcode keeps CFBundleVersion but rewrites the executable.
    private static func buildIdentity() -> String {
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let executable = Bundle.main.executableURL.flatMap { try? files.attributesOfItem(atPath: $0.path)[.modificationDate] as? Date }
        return "\(build)/\(executable?.timeIntervalSince1970 ?? 0)"
    }

    private static func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    private static func matches(_ pattern: NSRegularExpression, _ string: String) -> Bool {
        pattern.firstMatch(in: string, range: NSRange(string.startIndex..., in: string)) != nil
    }

    private static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private struct OtaError: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    private struct Latest: Decodable { let version: String }

    private struct Manifest: Decodable {
        let platform: String
        let appVersion: String
        let fingerprint: String
        let version: String
        let files: [String: String]
    }

    private struct Package {
        let version: String
        /// Module file name (app_pages.valdimodule) → file.
        let modules: [String: URL]
        /// "<module>/<image name>" → file URL string of the scale closest above the screen's.
        let images: [String: String]

        /// Files were verified when the package was downloaded; here only that they are all still there.
        static func open(_ dir: URL, version: String) -> Package? {
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("manifest.json")),
                  let manifest = try? JSONDecoder().decode(Manifest.self, from: data),
                  manifest.appVersion == config.appVersion, manifest.fingerprint == config.fingerprint,
                  manifest.files.keys.allSatisfy({ files.fileExists(atPath: dir.appendingPathComponent($0).path) })
            else { return nil }
            var modules: [String: URL] = [:]
            var variants: [String: [(scale: Int, url: URL)]] = [:]
            for path in manifest.files.keys {
                let parts = path.split(separator: "/").map(String.init)
                if parts.count == 2, parts[0] == "modules" {
                    modules[parts[1]] = dir.appendingPathComponent(path)
                } else if parts.count == 3, parts[0] == "res", parts[1].hasSuffix(".bundle") {
                    // res/<module>.bundle/<name>[@<scale>x].<ext>, as in the app's resources.
                    let module = String(parts[1].dropLast(".bundle".count))
                    var name = (parts[2] as NSString).deletingPathExtension
                    var scale = 1
                    if let at = name.range(of: "@", options: .backwards), name.hasSuffix("x"),
                       let value = Int(name[at.upperBound...].dropLast()) {
                        scale = value
                        name = String(name[..<at.lowerBound])
                    }
                    variants["\(module)/\(name)", default: []].append((scale, dir.appendingPathComponent(path)))
                }
            }
            let screen = Int(UIScreen.main.scale.rounded(.up))
            let images = variants.mapValues { options -> String in
                let sorted = options.sorted { $0.scale < $1.scale }
                return (sorted.first { $0.scale >= screen } ?? sorted.last!).url.absoluteString
            }
            return Package(version: version, modules: modules, images: images)
        }
    }

    /// valdi_ota.json in the app, written by the build (ios/project.yml, `ota.mjs app-info`).
    private struct Config {
        let appVersion: String
        let fingerprint: String
        let url: String
        let publicKey: P256.Signing.PublicKey

        static func read() -> Config {
            struct Json: Decodable { let appVersion: String; let fingerprint: String; let url: String; let publicKey: String }
            guard let file = Bundle.main.url(forResource: "valdi_ota", withExtension: "json"),
                  let json = try? JSONDecoder().decode(Json.self, from: Data(contentsOf: file)),
                  let key = try? P256.Signing.PublicKey(pemRepresentation: json.publicKey)
            else { preconditionFailure("valdi_ota.json missing or invalid; the build writes it (ios/project.yml)") }
            return Config(appVersion: json.appVersion, fingerprint: json.fingerprint, url: json.url, publicKey: key)
        }
    }

    private struct State: Codable {
        var binary: String
        var current: String?
        var pending: String?
        var pendingLaunched = false
        var failed: [String] = []

        func knows(_ version: String) -> Bool { version == current || version == pending || failed.contains(version) }

        mutating func dropPending() {
            if let pending { failed.append(pending) }
            pending = nil
            pendingLaunched = false
        }

        func write(_ root: URL) {
            try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            try? JSONEncoder().encode(self).write(to: root.appendingPathComponent("state.json"), options: .atomic)
        }

        static func read(_ root: URL) -> State {
            (try? JSONDecoder().decode(State.self, from: Data(contentsOf: root.appendingPathComponent("state.json"))))
                ?? State(binary: "")
        }
    }
}
