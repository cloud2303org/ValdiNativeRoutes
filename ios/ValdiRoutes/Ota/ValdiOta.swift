import Foundation
import UIKit

/// The process chooses one complete signed package before the runtime starts. Updates staged
/// during this process are eligible only on a subsequent cold start.
enum ValdiOta {
    private static let lock = NSLock()
    private static var initialized = false
    private static var client: ValdiOtaClient?
    private static var provider: ValdiOtaModules?
    private static var images: [String: String] = [:]

    static func start() -> ValdiOtaModules {
        lock.lock()
        defer { lock.unlock() }
        if initialized { return provider! }
        initialized = true
        var modules: [String: URL] = [:]
        do {
            let configuration = try readConfiguration()
            let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("valdi-ota", isDirectory: true)
            var bundled: [String: URL] = [:]
            for module in configuration.modules {
                for suffix in [".valdimodule", ".map.json"] {
                    let name = module + suffix
                    if let url = Bundle.main.url(forResource: name, withExtension: nil) { bundled[name] = url }
                }
            }
            let candidate = try ValdiOtaClient(configuration: configuration, root: root,
                                               binaryIdentity: buildIdentity(), bundledModules: bundled)
            let snapshot = try candidate.start()
            client = candidate
            if let snapshot {
                modules = snapshot.modules
                images = imageURLs(snapshot)
            }
            NSLog("ValdiOta: Valdi modules from %@ (%@)", snapshot.map { "package \($0.version)" } ?? "the app",
                  configuration.appVersion)
        } catch {
            // State/config failures remain visible while allowing the bundled app to start.
            NSLog("ValdiOta: package selection failed; using the app: %@", String(describing: error))
        }
        let result = ValdiOtaModules(modules: modules, images: images)
        provider = result
        return result
    }

    static func checkForUpdate() async {
        do { _ = try await checkForUpdateOrThrow() }
        catch { NSLog("ValdiOta: update check failed: %@", String(describing: error)) }
    }

    static func getInfo() throws -> ValdiOtaClient.Info {
        try requireClient().getInfo()
    }

    static func checkForUpdateOrThrow() async throws -> ValdiOtaClient.Info {
        let client = try requireClient()
        try await client.checkForUpdate()
        return try client.getInfo()
    }

    static func image(module: String, name: String) -> UIImage? {
        lock.lock()
        let value = images["\(module)/\(name)"]
        lock.unlock()
        guard let url = value.flatMap(URL.init(string:)) else { return nil }
        return UIImage(contentsOfFile: url.path)
    }

    private static func requireClient() throws -> ValdiOtaClient {
        lock.lock()
        defer { lock.unlock() }
        guard let client else { throw ValdiOtaError("OTA client unavailable; package selection did not complete") }
        return client
    }

    private static func readConfiguration() throws -> ValdiOtaClient.Configuration {
        guard let file = Bundle.main.url(forResource: "valdi_ota", withExtension: "json") else {
            throw ValdiOtaError("valdi_ota.json missing; the build writes it")
        }
        let json = try JSONDecoder().decode(ValdiOtaClient.Configuration.self, from: Data(contentsOf: file))
        guard json.modules == ["app_pages"] else { throw ValdiOtaError("Only app_pages is OTA-owned") }
        #if DEBUG
        return ValdiOtaClient.Configuration(appVersion: json.appVersion, url: "",
                                           publicKey: json.publicKey, modules: json.modules,
                                           bundleVersion: json.bundleVersion)
        #else
        return json
        #endif
    }

    /// Version/build plus executable installation timestamp; no native source fingerprint.
    private static func buildIdentity() -> String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let executable = Bundle.main.executableURL.flatMap {
            try? FileManager.default.attributesOfItem(atPath: $0.path)[.modificationDate] as? Date
        }
        return "\(version)/\(build)/\(executable?.timeIntervalSince1970 ?? 0)"
    }

    /// Preserve res/<module>.bundle/<name>[@<scale>x].<ext> and the original nearest-above density choice.
    private static func imageURLs(_ snapshot: ValdiOtaClient.Snapshot) -> [String: String] {
        var variants: [String: [(scale: Int, url: URL)]] = [:]
        for path in snapshot.files.keys {
            let parts = path.split(separator: "/").map(String.init)
            guard parts.count == 3, parts[0] == "res", parts[1].hasSuffix(".bundle") else { continue }
            let module = String(parts[1].dropLast(".bundle".count))
            var name = (parts[2] as NSString).deletingPathExtension
            var scale = 1
            if let at = name.range(of: "@", options: .backwards), name.hasSuffix("x"),
               let value = Int(name[at.upperBound...].dropLast()) {
                scale = value
                name = String(name[..<at.lowerBound])
            }
            variants["\(module)/\(name)", default: []].append((scale, snapshot.directory.appendingPathComponent(path)))
        }
        let screen = Int(UIScreen.main.scale.rounded(.up))
        return variants.mapValues { options in
            let sorted = options.sorted { $0.scale < $1.scale }
            return (sorted.first { $0.scale >= screen } ?? sorted.last!).url.absoluteString
        }
    }
}
