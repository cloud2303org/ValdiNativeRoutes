import CryptoKit
import Foundation

private let fm = FileManager.default
private func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw TestError(message) }
}
private struct TestError: Error, CustomStringConvertible {
    let description: String
    init(_ value: String) { description = value }
}
private func write(_ data: Data, _ url: URL) throws {
    try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
}
private func json(_ object: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
}
private func digest(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func expectActivation(_ info: ValdiOtaClient.Info, isNewVersion: Bool,
                              previous: String?, _ context: String) throws {
    try expect(info.isNewVersion == isNewVersion,
               "\(context): isNewVersion expected \(isNewVersion), got \(info.isNewVersion)")
    try expect(info.previousBundleVersion == previous,
               "\(context): previousBundleVersion expected \(previous ?? "nil"), got \(info.previousBundleVersion ?? "nil")")
}

private final class Fixture {
    let http: URL
    let base: String
    let key = P256.Signing.PrivateKey()
    let root: URL
    let bundled: URL
    let modules: [String]
    var controls: [String: [String: Any]] = [:]
    init(http: URL, base: String, modules: [String] = ["app_foundation", "app_pages"]) throws {
        self.modules = modules
        self.http = http
        self.base = base
        root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        bundled = root.appendingPathComponent("bundle")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
    }
    deinit { try? fm.removeItem(at: root) }
    func config(url: String? = nil, appVersion: String = "0.1",
                bundleVersion: String = "pages-001") -> ValdiOtaClient.Configuration {
        ValdiOtaClient.Configuration(appVersion: appVersion, url: url ?? base,
                                    publicKey: key.publicKey.pemRepresentation, modules: modules,
                                    bundleVersion: bundleVersion)
    }
    func client(url: String? = nil, identity: String = "native/1", timeout: TimeInterval = 2,
                bundleVersion: String = "pages-001",
                codec: any ValdiOtaFileCodec = ValdiOtaNativeCodec()) throws -> ValdiOtaClient {
        var builtins: [String: URL] = [:]
        for name in modules {
            for suffix in [".valdimodule", ".map.json"] {
                builtins[name + suffix] = bundled.appendingPathComponent(name + suffix)
            }
        }
        return try ValdiOtaClient(configuration: config(url: url, bundleVersion: bundleVersion), root: root.appendingPathComponent("ota"),
                                  binaryIdentity: identity, bundledModules: builtins, timeout: timeout, codec: codec)
    }
    var stateURL: URL { root.appendingPathComponent("ota/state.json") }
    func state() throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: Data(contentsOf: stateURL)) as! [String: Any]
    }
    func saveState(_ state: [String: Any]) throws { try write(json(state), stateURL) }
    func files(_ marker: String = "one") -> [String: Data] {
        ["modules/app_foundation.valdimodule": Data("foundation".utf8),
         "modules/app_pages.valdimodule": Data("pages-\(marker)".utf8),
         "modules/app_pages.map.json": Data("map-\(marker)".utf8),
         "res/app_pages.bundle/icon@2x.png": Data("image-\(marker)".utf8)]
    }
    func publish(_ version: String, files: [String: Data]? = nil,
                 mutate: ((inout [String: Any]) -> Void)? = nil, sign: Bool = true) throws {
        let contents = files ?? self.files()
        var descriptors: [String: Any] = [:]
        for (path, bytes) in contents {
            descriptors[path] = ["sha256": digest(bytes), "size": bytes.count]
            try write(bytes, http.appendingPathComponent("ios/0.1/\(version)/\(path)"))
        }
        var manifest: [String: Any] = ["schemaVersion": 1, "platform": "ios", "appVersion": "0.1",
                                        "version": version, "files": descriptors]
        mutate?(&manifest)
        let bytes = try json(manifest)
        let signature = try key.signature(for: sign ? bytes : Data("different".utf8)).derRepresentation.base64EncodedString()
        try write(bytes, http.appendingPathComponent("ios/0.1/\(version)/manifest.json"))
        try write(Data(signature.utf8), http.appendingPathComponent("ios/0.1/\(version)/manifest.sig"))
        try latest(version)
    }
    func latest(_ version: String?) throws {
        try write(json(["version": version as Any? ?? NSNull()]), http.appendingPathComponent("ios/0.1/latest.json"))
    }
    func rule(_ path: String, _ rule: [String: Any]) throws {
        controls["/ios/0.1/" + path] = rule
        try write(json(controls), http.appendingPathComponent("controls.json"))
    }
    func resetNetwork() throws {
        controls = [:]
        try write(json(controls), http.appendingPathComponent("controls.json"))
        try write(Data(), http.appendingPathComponent("requests.jsonl"))
    }
    func requests() throws -> [[String: Any]] {
        let data = try String(contentsOf: http.appendingPathComponent("requests.jsonl"), encoding: .utf8)
        return try data.split(separator: "\n").map { try JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any] }
    }
    func package(_ version: String) -> URL { root.appendingPathComponent("ota/packages/\(version)") }
    func stage(_ version: String, files: [String: Data]? = nil) async throws {
        try publish(version, files: files)
        let client = try client()
        _ = try client.start()
        try await client.checkForUpdate()
    }
    func activated(_ version: String = "current") async throws -> ValdiOtaClient {
        try await stage(version)
        let client = try client()
        try expect(try client.start()?.version == version, "package selected on next start")
        return client
    }
}


// Fixture compression is independent of the client C encoder (Node's pinned default ZSTD).
private func zstdFixture(_ data: Data) throws -> Data {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    task.arguments = ["node", "-e", "const z=require('node:zlib');process.stdout.write(z.zstdCompressSync(require('node:fs').readFileSync(0)))"]
    let input = Pipe(), output = Pipe()
    task.standardInput = input; task.standardOutput = output
    try task.run()
    try input.fileHandleForWriting.write(contentsOf: data)
    try input.fileHandleForWriting.close()
    let bytes = output.fileHandleForReading.readDataToEndOfFile()
    task.waitUntilExit()
    try expect(task.terminationStatus == 0, "fixture default ZSTD")
    return bytes
}
private func packetFixture(_ entries: [(String, Data)]) -> Data {
    func word(_ value: UInt32) -> Data { var v = value.littleEndian; return withUnsafeBytes(of: &v) { Data($0) } }
    var body = Data()
    for (name, content) in entries {
        for bytes in [Data(name.utf8), content] {
            let pad = (4 - bytes.count % 4) % 4
            body.append(word(UInt32(bytes.count) | (pad > 0 ? 0x80000000 : 0)))
            body.append(bytes); body.append(Data(repeating: 0, count: pad))
        }
    }
    return word(0x0100c633) + word(UInt32(body.count)) + body
}
private func hdiffFixture(_ old: Data, _ target: Data) throws -> Data {
    let root = fm.temporaryDirectory.appendingPathComponent("ios-hdiff-" + UUID().uuidString)
    defer { try? fm.removeItem(at: root) }
    try write(old, root.appendingPathComponent("old"))
    try write(target, root.appendingPathComponent("new"))
    let task = Process()
    task.executableURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["VALDI_HDIFFZ"]!)
    task.arguments = ["-SD", "-s-64", "-c-zlib-6", "-p-1", root.appendingPathComponent("old").path, root.appendingPathComponent("new").path, root.appendingPathComponent("patch").path]
    task.standardOutput = FileHandle.nullDevice; task.standardError = FileHandle.nullDevice
    try task.run(); task.waitUntilExit()
    try expect(task.terminationStatus == 0, "real HDIFFSF20/zlib fixture creation")
    return try Data(contentsOf: root.appendingPathComponent("patch"))
}
private func hbcFixture(_ seed: UInt32) -> Data {
    var state = seed, data = Data([0x34, 0xc6, 0, 1, 0xc6, 0x1f, 0xbc, 3, 0xc1, 3, 0x19, 0x1f, 99, 0, 0, 0])
    for _ in 0..<(96 << 10) {
        state ^= state << 13; state ^= state >> 17; state ^= state << 5
        data.append(UInt8(truncatingIfNeeded: state))
    }
    return data
}
private struct FaultCodec: ValdiOtaFileCodec {
    enum Mode { case unavailable, encodeFailure, wrongCompression }
    let mode: Mode
    func decode(_ input: URL, to output: URL, maxOutput: Int) throws {
        if mode == .unavailable { throw TestError("codec not installed") }
        try ValdiOtaNativeCodec().decode(input, to: output, maxOutput: maxOutput)
    }
    func encode(_ input: URL, to output: URL, maxOutput: Int) throws {
        if mode == .encodeFailure { try write(Data("partial".utf8), output); throw TestError("encoder failed after partial output") }
        try ValdiOtaNativeCodec().encode(input, to: output, maxOutput: maxOutput)
        if mode == .wrongCompression {
            // Valid single-frame raw ZSTD with identical packet bytes, different compression.
            let bytes = try Data(contentsOf: input)
            var size = UInt32(bytes.count).littleEndian
            var block = UInt32((bytes.count << 3) | 1).littleEndian
            var frame = Data([0x28, 0xb5, 0x2f, 0xfd, 0xa0])
            frame.append(withUnsafeBytes(of: &size) { Data($0) })
            frame.append(withUnsafeBytes(of: &block) { Data($0.prefix(3)) })
            frame.append(bytes)
            try frame.write(to: output)
        }
    }
    func patch(_ old: URL, patch: URL, to output: URL, expectedSize: Int) throws {
        try ValdiOtaNativeCodec().patch(old, patch: patch, to: output, expectedSize: expectedSize)
    }
}
private struct SplitFixture {
    static let basicOld: [(String, Data)] = [("same.js", Data("same".utf8)), ("deleted.js", Data("delete".utf8)), ("res.assetcatalog", Data("old catalog".utf8))]
    static let basicNew: [(String, Data)] = [("res.assetcatalog", Data("new catalog".utf8)), ("same.js", Data("same".utf8)), ("new.js", Data("new".utf8)), ("hash", Data("new hash".utf8))]
    let oldEntries: [(String, Data)]
    let newEntries: [(String, Data)]
    let oldPacket: Data
    let old: Data
    let target: Data
    init(oldEntries: [(String, Data)] = basicOld, newEntries: [(String, Data)] = basicNew,
         oldPacket: Data? = nil, targetArchive: Data? = nil) throws {
        self.oldEntries = oldEntries
        self.newEntries = newEntries
        self.oldPacket = oldPacket ?? packetFixture(oldEntries)
        old = try zstdFixture(self.oldPacket)
        target = try targetArchive ?? zstdFixture(packetFixture(newEntries))
    }
    func publish(_ f: Fixture, version: String = "split", base: String = "pages-001",
                 mutate: ((inout [String: Any]) -> Void)? = nil,
                 fullMutate: ((inout [String: Any]) -> Void)? = nil, patch: Bool = false) throws {
        var entries: [[String: Any]] = []
        for (name, bytes) in newEntries {
            var entry: [String: Any] = ["name": name, "sha256": digest(bytes), "size": bytes.count]
            if oldEntries.contains(where: { $0.0 == name && $0.1 == bytes }) {
                entry["operation"] = "copy"
            } else {
                let compressed = try zstdFixture(bytes)
                var payload = compressed.count < bytes.count ? compressed : bytes
                var encoding = compressed.count < bytes.count ? "zstd" : "raw"
                var suffix = encoding == "zstd" ? "zst" : "bin"
                entry["operation"] = "full"
                if patch, let old = oldEntries.first(where: { $0.0 == name }), name.hasSuffix(".js") {
                    payload = try hdiffFixture(old.1, bytes)
                    encoding = "hdiffpatch-zlib"; suffix = "hdiff"
                    entry["operation"] = "patch"; entry["baseSha256"] = digest(old.1)
                }
                let path = "deltas/\(base)/payload/\(digest(payload)).\(suffix)"
                try write(payload, f.http.appendingPathComponent("ios/0.1/\(version)/\(path)"))
                entry["download"] = ["path": path, "sha256": digest(payload), "size": payload.count, "encoding": encoding]
            }
            entries.append(entry)
        }
        var metadata: [String: Any] = ["schemaVersion": 1, "algorithm": "hdiffpatch", "format": "HDIFFSF20", "compression": "zlib",
            "platform": "ios", "appVersion": "0.1", "baseVersion": base, "version": version,
            "baseSha256": digest(old), "targetSha256": digest(target),
            "basePacketSha256": digest(oldPacket), "targetPacketSha256": digest(packetFixture(newEntries)),
            "targetPacketSize": packetFixture(newEntries).count, "entries": entries]
        mutate?(&metadata)
        let data = try json(metadata)
        let path = "deltas/\(base)/manifest.json"
        try write(data, f.http.appendingPathComponent("ios/0.1/\(version)/\(path)"))
        try f.publish(version, files: ["modules/app_pages.valdimodule": target], mutate: {
            $0["deltas"] = [["baseVersion": base, "baseSha256": digest(old), "path": path, "sha256": digest(data), "size": data.count]]
            fullMutate?(&$0)
        })
    }
}

private func editEntry(_ metadata: inout [String: Any], _ index: Int, _ body: (inout [String: Any]) -> Void) {
    var entries = metadata["entries"] as! [[String: Any]]
    body(&entries[index]); metadata["entries"] = entries
}
private func editDelta(_ manifest: inout [String: Any], _ body: (inout [String: Any]) -> Void) {
    var deltas = manifest["deltas"] as! [[String: Any]]
    body(&deltas[0]); manifest["deltas"] = deltas
}

@main
private enum Tests {
    static var passed = 0
    static var results: [String] = []
    static var networkEvidence: [[String: Any]] = []
    static var fallbackEvidence: [[String: Any]] = []
    static var splitEvidence: [[String: Any]] = []
    static func test(_ name: String, http: URL, base: String, modules: [String] = ["app_foundation", "app_pages"], _ body: (Fixture) async throws -> Void) async throws {
        if let filter = ProcessInfo.processInfo.environment["OTA_TEST_FILTER"], !name.contains(filter) { return }
        let fixture = try Fixture(http: http, base: base, modules: modules)
        try fixture.resetNetwork()
        try await body(fixture)
        networkEvidence.append(["scenario": name, "requests": try fixture.requests()])
        passed += 1
        results.append("PASS \(name)")
        print(results.last!)
    }
    @discardableResult
    static func rejects(_ body: () async throws -> Void) async throws -> Error {
        do { try await body() } catch { return error }
        throw TestError("expected rejection")
    }
    static func assertFullFallback(_ f: Fixture, client: ValdiOtaClient, version: String, target: Data) async throws {
        try await client.checkForUpdate()
        try expect(try f.requests().contains { ($0["path"] as! String) == "/ios/0.1/\(version)/modules/app_pages.valdimodule" }, "original full module fallback: \(version)")
        try expect(try Data(contentsOf: f.package(version).appendingPathComponent("modules/app_pages.valdimodule")) == target, "exact signed full artifact: \(version)")
        let stage = f.root.appendingPathComponent("ota/staging")
        try expect(try fm.contentsOfDirectory(atPath: stage.path).isEmpty, "all delta and staging temporaries removed: \(version)")
        fallbackEvidence.append(["version": version, "requests": try f.requests()])
        // Each fault must exercise delta/fallback again, rather than exact reuse of the
        // preceding case's identical verified pending artifact.
        var state = try f.state()
        state.removeValue(forKey: "pending")
        try f.saveState(state)
        try fm.removeItem(at: f.package(version))
    }
    static func assertSplitStaged(_ f: Fixture, client: ValdiOtaClient, version: String, target: Data) async throws {
        try await client.checkForUpdate()
        try expect(try f.requests().contains { ($0["path"] as! String).contains("/deltas/") }, "split actually attempted: \(version)")
        try expect(try f.requests().allSatisfy { !(($0["path"] as! String).hasSuffix(".valdimodule")) }, "no full module download: \(version)")
        try expect(try Data(contentsOf: f.package(version).appendingPathComponent("modules/app_pages.valdimodule")) == target, "exact signed split artifact: \(version)")
        try expect(try client.getInfo().pendingBundleVersion == version, "durable pending: \(version)")
        try expect(try fm.contentsOfDirectory(atPath: f.root.appendingPathComponent("ota/staging").path).isEmpty, "split temporaries removed: \(version)")
        splitEvidence.append(["version": version, "requests": try f.requests()])
        var state = try f.state()
        state.removeValue(forKey: "pending")
        try f.saveState(state)
        try fm.removeItem(at: f.package(version))
    }
    static func main() async {
        let http = URL(fileURLWithPath: CommandLine.arguments[1])
        let base = CommandLine.arguments[2]
        let output = URL(fileURLWithPath: CommandLine.arguments[3])
        do {
            #if VALDI_OTA_ADAPTER_TESTS
            try await test("adapter reports unavailable instead of success before startup", http: http, base: base) { f in
                let infoError = try await rejects { _ = try ValdiOta.getInfo() }
                let updateError = try await rejects { _ = try await ValdiOta.checkForUpdateOrThrow() }
                try expect(String(describing: infoError).contains("unavailable"), "info rejects absent client")
                try expect(String(describing: updateError).contains("unavailable"), "manual check rejects absent client")
                await ValdiOta.checkForUpdate()
                try expect(try f.requests().isEmpty, "unavailable adapter uses no network")
            }
            #endif
            try await test("activation bundled to new uses configured embedded previous and remains stable", http: http, base: base) { f in
                let bundled = try f.client(bundleVersion: "embedded-custom")
                _ = try bundled.start()
                try expectActivation(try bundled.getInfo(), isNewVersion: false, previous: nil, "first install")
                try f.publish("new")
                try await bundled.checkForUpdate()
                try expectActivation(try bundled.getInfo(), isNewVersion: false, previous: nil, "staging alone")
                let client = try f.client(bundleVersion: "embedded-custom")
                try expect(try client.start()?.version == "new", "verified pending selected")
                let initial = try client.getInfo()
                try expectActivation(initial, isNewVersion: true, previous: "embedded-custom", "bundled promotion")
                let durable = try f.state()
                try expect(durable["current"] as? String == "new" && durable["pending"] == nil, "promotion persisted")
                try expect(Set(durable.keys) == ["binary", "current"], "no persisted seen or acknowledgement flags")
                for _ in 0..<3 {
                    try expect(try client.start()?.version == "new", "repeated start stays selected")
                    try expectActivation(try client.getInfo(), isNewVersion: true, previous: "embedded-custom", "repeated info")
                }
                try f.publish("later", files: f.files("later"))
                try await client.checkForUpdate()
                try expectActivation(try client.getInfo(), isNewVersion: true, previous: "embedded-custom", "later pending")
                let later = try f.client(bundleVersion: "embedded-custom")
                _ = try later.start()
                try expectActivation(try later.getInfo(), isNewVersion: true, previous: "new", "later instance")
                try expect(try client.start()?.version == "new", "other instance cannot change running selection")
                try expectActivation(try client.getInfo(), isNewVersion: true, previous: "embedded-custom", "other instance promoted")
                try expectActivation(initial, isNewVersion: true, previous: "embedded-custom", "immutable info value")
            }
            try await test("activation current to new uses same binary durable current", http: http, base: base) { f in
                let current = try await f.activated("old")
                try f.publish("new", files: f.files("new"))
                try await current.checkForUpdate()
                let next = try f.client()
                try expect(try next.start()?.version == "new", "new package selected")
                try expectActivation(try next.getInfo(), isNewVersion: true, previous: "old", "current promotion")
                try expect(Set(try f.state().keys) == ["binary", "current"], "state protocol unchanged")
                try expect(!fm.fileExists(atPath: f.package("old").path), "old current cleaned after promotion")
            }
            try await test("activation fresh instance with already current has no activation", http: http, base: base) { f in
                let promoted = try await f.activated("current")
                try expectActivation(try promoted.getInfo(), isNewVersion: true, previous: "pages-001", "first engine")
                for _ in 0..<3 {
                    let fresh = try f.client()
                    try expect(try fresh.start()?.version == "current", "already current selected")
                    try expectActivation(try fresh.getInfo(), isNewVersion: false, previous: nil, "fresh engine")
                    _ = try fresh.start()
                    try expectActivation(try fresh.getInfo(), isNewVersion: false, previous: nil, "fresh repeated start")
                }
                try expectActivation(try promoted.getInfo(), isNewVersion: true, previous: "pages-001", "original engine")
            }
            try await test("activation verified pending remembers durable current even if old package is corrupt", http: http, base: base) { f in
                let current = try await f.activated("old")
                try f.publish("new")
                try await current.checkForUpdate()
                try write(Data("corrupt old".utf8), f.package("old").appendingPathComponent("manifest.sig"))
                let next = try f.client()
                try expect(try next.start()?.version == "new", "valid pending selected without reopening old current")
                try expectActivation(try next.getInfo(), isNewVersion: true, previous: "old", "durable previous")
            }
            try await test("activation unchanged selected version never claims a new version", http: http, base: base) { f in
                let staging = try f.client(bundleVersion: "older-embedded")
                _ = try staging.start()
                try f.publish("pages-001")
                try await staging.checkForUpdate()
                let next = try f.client()
                try expect(try next.start()?.version == "pages-001", "verified pending equal to embedded selected")
                try expectActivation(try next.getInfo(), isNewVersion: false, previous: nil, "equal version promotion")
                let fresh = try f.client()
                _ = try fresh.start()
                try expectActivation(try fresh.getInfo(), isNewVersion: false, previous: nil, "already current equal version")
            }
            try await test("activation first install and reset without promotion have no activation", http: http, base: base) { f in
                let first = try f.client()
                _ = try first.start()
                try expectActivation(try first.getInfo(), isNewVersion: false, previous: nil, "first install")
                try f.publish("orphan")
                try await first.checkForUpdate()
                try fm.removeItem(at: f.stateURL)
                let reset = try f.client()
                try expect(try reset.start() == nil, "missing state discards orphan pending")
                try expectActivation(try reset.getInfo(), isNewVersion: false, previous: nil, "state reset")
                try expect(Set(try f.state().keys) == ["binary"], "reset state remains minimal")
            }
            try await test("activation changed binary identity discards current and pending", http: http, base: base) { f in
                let current = try await f.activated("old")
                try f.publish("pending")
                try await current.checkForUpdate()
                let next = try f.client(identity: "native/2")
                try expect(try next.start() == nil, "new binary stays embedded")
                try expectActivation(try next.getInfo(), isNewVersion: false, previous: nil, "binary identity reset")
                try expect(try f.state()["binary"] as? String == "native/2", "new identity persisted")
                try expect(Set(try f.state().keys) == ["binary"], "no old activation state crosses binary identity")
            }
            try await test("activation disabled URL ignores valid pending and corrupt state", http: http, base: base) { f in
                try await f.stage("pending")
                for corrupt in [false, true] {
                    if corrupt { try write(Data("invalid state".utf8), f.stateURL) }
                    let before = try Data(contentsOf: f.stateURL)
                    try f.resetNetwork()
                    let disabled = try f.client(url: "")
                    try expect(try disabled.start() == nil, "disabled stays embedded")
                    try await disabled.checkForUpdate()
                    try expectActivation(try disabled.getInfo(), isNewVersion: false, previous: nil, "disabled")
                    try expect(try Data(contentsOf: f.stateURL) == before, "disabled does not persist")
                    try expect(try f.requests().isEmpty, "disabled does not use network")
                }
            }
            try await test("activation corrupt pending fallback to current has no activation", http: http, base: base) { f in
                let current = try await f.activated("old")
                try f.publish("pending", files: f.files("pending"))
                try await current.checkForUpdate()
                try write(Data("corrupt".utf8), f.package("pending").appendingPathComponent("modules/app_pages.valdimodule"))
                let next = try f.client()
                try expect(try next.start()?.version == "old", "corrupt pending falls back to verified current")
                try expectActivation(try next.getInfo(), isNewVersion: false, previous: nil, "current fallback")
                try expect(try f.state()["pending"] == nil, "bad pending cleared durably")
                try expect(Set(try f.state().keys) == ["binary", "current"], "fallback creates no blacklist")
            }
            try await test("activation corrupt pending fallback to bundled has no activation", http: http, base: base) { f in
                try await f.stage("pending")
                try write(Data("bad signature".utf8), f.package("pending").appendingPathComponent("manifest.sig"))
                let next = try f.client()
                try expect(try next.start() == nil, "invalid pending falls back bundled")
                try expectActivation(try next.getInfo(), isNewVersion: false, previous: nil, "bundled fallback")
                try expect(Set(try f.state().keys) == ["binary"], "bad pending cleared without activation state")
            }
            for hasCurrent in [false, true] {
                try await test("activation atomic promotion write failure never exposes success current=\(hasCurrent)", http: http, base: base) { f in
                    let source = hasCurrent ? try await f.activated("old") : try f.client()
                    _ = try source.start()
                    try f.publish("pending", files: f.files("pending"))
                    try await source.checkForUpdate()
                    let saved = try Data(contentsOf: f.stateURL)
                    let ota = f.stateURL.deletingLastPathComponent()
                    try fm.removeItem(at: ota.appendingPathComponent("staging"))
                    defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path) }
                    try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                    let failed = try f.client()
                    let startup = try await rejects { _ = try failed.start() }
                    try expect((startup as NSError).userInfo[NSFilePathErrorKey] as? String == f.stateURL.path,
                               "failure reaches atomic promotion write: \(startup)")
                    try expect(try Data(contentsOf: f.stateURL) == saved, "failed write preserves durable selection")
                    try expect(fm.fileExists(atPath: f.package("pending").path), "pending preserved for fresh retry")
                    try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                    for _ in 0..<2 {
                        let infoError = try await rejects { _ = try failed.getInfo() }
                        let startError = try await rejects { _ = try failed.start() }
                        try expect(String(describing: infoError) == String(describing: startup), "failed info exposes only sticky error")
                        try expect(String(describing: startError) == String(describing: startup), "failed startup stays failed")
                    }
                    let recovered = try f.client()
                    try expect(try recovered.start()?.version == "pending", "fresh engine retries promotion")
                    try expectActivation(try recovered.getInfo(), isNewVersion: true,
                                         previous: hasCurrent ? "old" : "pages-001", "recovered promotion")
                    let fresh = try f.client()
                    _ = try fresh.start()
                    try expectActivation(try fresh.getInfo(), isNewVersion: false, previous: nil, "fresh after recovery")
                }
            }
            try await test("info reports embedded without network and requires successful startup", http: http, base: base) { f in
                let client = try f.client()
                try await rejects { _ = try client.getInfo() }
                _ = try client.start()
                let info = try client.getInfo()
                try expect(info.enabled, "configured URL enables OTA")
                try expect(info.appVersion == "0.1", "native compatibility version")
                try expect(info.embeddedBundleVersion == "pages-001", "embedded version")
                try expect(info.bundleVersion == "pages-001", "running embedded version")
                try expect(info.pendingBundleVersion == nil, "no pending package")
                try expect(try f.requests().isEmpty, "info does not access network")
            }
            try await test("info disabled ignores cached and corrupt state with zero network", http: http, base: base) { f in
                try await f.stage("cached")
                try write(Data("unreadable state".utf8), f.stateURL)
                let state = try Data(contentsOf: f.stateURL)
                try f.resetNetwork()
                let client = try f.client(url: "")
                _ = try client.start()
                try await client.checkForUpdate()
                let info = try client.getInfo()
                try expect(!info.enabled, "disabled URL")
                try expect(info.appVersion == "0.1" && info.embeddedBundleVersion == "pages-001", "disabled versions accurate")
                try expect(info.bundleVersion == "pages-001" && info.pendingBundleVersion == nil, "disabled runs embedded only")
                try expect(try Data(contentsOf: f.stateURL) == state, "disabled info does not touch disk state")
                try expect(try f.requests().isEmpty, "disabled info/check use no network")
            }
            try await test("info keeps running snapshot and reads durable pending without promotion", http: http, base: base) { f in
                let client = try await f.activated("running")
                let before = try client.getInfo()
                try f.publish("pending", files: f.files("pending"))
                try await client.checkForUpdate()
                try f.resetNetwork()
                let state = try Data(contentsOf: f.stateURL)
                let info = try client.getInfo()
                try expect(before.pendingBundleVersion == nil && before.bundleVersion == "running", "info is a value snapshot")
                try expect(info.bundleVersion == "running" && info.embeddedBundleVersion == "pages-001", "pending does not become running")
                try expect(info.pendingBundleVersion == "pending", "durable pending visible")
                try expect(try Data(contentsOf: f.stateURL) == state, "info does not promote or persist")
                try expect(try f.requests().isEmpty, "cached info is network free")
                let next = try f.client()
                _ = try next.start()
                let nextInfo = try next.getInfo()
                try expect(nextInfo.bundleVersion == "pending" && nextInfo.pendingBundleVersion == nil, "fresh start promotes pending")
                try expect(try client.getInfo().bundleVersion == "running", "original process snapshot stays immutable")
            }
            try await test("info surfaces corrupt durable state and sticky startup failure", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                try write(Data("invalid state".utf8), f.stateURL)
                try await rejects { _ = try client.getInfo() }
                let failed = try f.client()
                let startup = try await rejects { _ = try failed.start() }
                let infoError = try await rejects { _ = try failed.getInfo() }
                try expect(String(describing: startup) == String(describing: infoError), "startup failure preserved")
                try expect(try f.requests().isEmpty, "state error does not start network")
            }
            try await test("info after manual joins automatic success returns durable pending", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                try f.publish("joined")
                try f.rule("latest.json", ["delay": 0.3])
                let automatic = Task { try await client.checkForUpdate() }
                let deadline = Date().addingTimeInterval(2)
                while try f.requests().isEmpty {
                    try expect(Date() < deadline, "automatic request started")
                    try await Task.sleep(nanoseconds: 1_000_000)
                }
                try expect(try client.getInfo().pendingBundleVersion == nil, "info during flight does not prematurely stage")
                let manual = Task {
                    try await client.checkForUpdate()
                    return try client.getInfo()
                }
                let info = try await manual.value
                try await automatic.value
                try expect(info.bundleVersion == "pages-001" && info.pendingBundleVersion == "joined", "manual waits for durable commit")
                try expect(try f.requests().filter { ($0["path"] as! String).hasSuffix("latest.json") }.count == 1, "manual joins automatic flight")
            }
            try await test("info manual joins automatic error and subsequent check retries", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                try f.latest(nil)
                try f.rule("latest.json", ["delay": 0.3, "status": 503])
                let automatic = Task { try await client.checkForUpdate() }
                let deadline = Date().addingTimeInterval(2)
                while try f.requests().isEmpty {
                    try expect(Date() < deadline, "automatic failing request started")
                    try await Task.sleep(nanoseconds: 1_000_000)
                }
                let manualError = try await rejects {
                    try await client.checkForUpdate()
                    _ = try client.getInfo()
                }
                let automaticError = try await rejects { try await automatic.value }
                try expect(String(describing: manualError) == String(describing: automaticError), "joined manual propagates automatic error")
                try expect(try client.getInfo().pendingBundleVersion == nil, "failure does not invent pending")
                try expect(try f.requests().count == 1, "failed flight shared")
                try f.resetNetwork()
                try await client.checkForUpdate()
                try expect(try f.requests().count == 1, "completed error clears shared task for retry")
            }
            try await test("promotion on start survives repeated fresh starts without redundant downloads", http: http, base: base) { f in
                try await f.stage("v1")
                for launch in 1...4 {
                    let client = try f.client()
                    let selected = try client.start()?.version
                    print("Fresh start \(launch): selected \(selected ?? "bundled")")
                    try expect(selected == "v1", "fresh start \(launch) keeps promoted v1 without confirmation; got \(selected ?? "bundled")")
                    try f.resetNetwork()
                    try await client.checkForUpdate()
                    try expect(try f.requests().count == 1, "fresh start \(launch) only checks latest for already running version")
                    try expect(try f.requests().first!["query"] as? [String: [String]] == [
                        "platform": ["ios"], "appVersion": ["0.1"], "bundleVersion": ["v1"]
                    ], "fresh start \(launch) reports running v1")
                }
                let state = try f.state()
                try expect(state["current"] as? String == "v1" && state["pending"] == nil, "promotion durable without confirmation")
                try expect(Set(state.keys) == ["binary", "current"], "state contains only binary/current/pending")
            }
            try await test("legacy launched pending promotes and obsolete state fields are discarded", http: http, base: base) { f in
                let current = try await f.activated()
                try f.publish("pending", files: f.files("two"))
                try await current.checkForUpdate()
                var legacy = try f.state()
                legacy["pendingLaunched"] = true
                legacy["failed"] = ["pending", "old-failure"]
                try f.saveState(legacy)
                let next = try f.client()
                try expect(try next.start()?.version == "pending", "legacy launched flag cannot invalidate verified pending")
                let migrated = try f.state()
                try expect(migrated["current"] as? String == "pending" && migrated["pending"] == nil, "legacy pending durably promoted")
                try expect(Set(migrated.keys) == ["binary", "current"], "obsolete fields removed on persistence")
                try expect(!fm.fileExists(atPath: f.package("current").path), "old current cleaned after promotion")
                try expect(try f.client().start()?.version == "pending", "migrated package survives another fresh start")
                // Obsolete fields are ignored without decoding or validating their contents.
                var extras = migrated
                extras["pendingLaunched"] = "obsolete"
                extras["failed"] = ["../invalid": true]
                try f.saveState(extras)
                try expect(try f.client().start()?.version == "pending", "obsolete field types and values ignored")
                try expect(Set(try f.state().keys) == ["binary", "current"], "minimal state decodes without legacy fields")
            }
            try await test("legacy failed version can be offered and downloaded again", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                var legacy = try f.state()
                legacy["pendingLaunched"] = false
                legacy["failed"] = ["retry"]
                try f.saveState(legacy)
                try f.publish("retry")
                try await client.checkForUpdate()
                try expect(try f.requests().contains { ($0["path"] as! String) == "/ios/0.1/retry/modules/app_pages.valdimodule" }, "old failed list does not suppress signed download")
                let staged = try f.state()
                try expect(staged["pending"] as? String == "retry", "previously failed offer staged")
                try expect(Set(staged.keys) == ["binary", "pending"], "stage drops obsolete fields")
                try expect(try client.start() == nil, "retry remains next-start only")
                try expect(try f.client().start()?.version == "retry", "previously failed offer promotes")
            }
            #if VALDI_OTA_NO_CODEC
            try await test("codec absent build preserves bundled startup and uses signed full fallback", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client()
                try expect(try client.start() == nil, "bundled startup needs no codec symbols")
                try split.publish(f, version: "absent-codec")
                try await assertFullFallback(f, client: client, version: "absent-codec", target: split.target)
                try expect(try client.start() == nil, "full staging does not change bundled provider")
            }
            #endif
            for mode in ["inaccurate", "absent", "extra-keys", "minimal-metadata", "inaccurate-hints"] {
                try await test("split accepts \(mode) informational hashes with real patch/full/copy", http: http, base: base, modules: ["app_pages"]) { f in
                    let old = hbcFixture(471)
                    var changed = old; changed[24000] ^= 17
                    let split = try SplitFixture(
                        oldEntries: [("main.js", old), ("same.bin", Data("same".utf8))],
                        newEntries: [("main.js", changed), ("same.bin", Data("same".utf8)),
                                     ("new.txt", Data(repeating: 65, count: 4096)), ("hash", Data("new".utf8))])
                    try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                    let client = try f.client(); _ = try client.start()
                    func informational(_ object: inout [String: Any], hashes: [String]) {
                        if mode == "extra-keys" {
                            object["futureField"] = ["ignored": true]
                        } else {
                            for hash in hashes {
                                if mode == "absent" || mode == "minimal-metadata" { object.removeValue(forKey: hash) }
                                else { object[hash] = "inaccurate informational hash" }
                            }
                        }
                    }
                    try split.publish(f, mutate: { metadata in
                        informational(&metadata, hashes: ["baseSha256", "targetSha256", "basePacketSha256", "targetPacketSha256"])
                        var entries = metadata["entries"] as! [[String: Any]]
                        for index in entries.indices {
                            informational(&entries[index], hashes: ["sha256", "baseSha256"])
                            if var download = entries[index]["download"] as? [String: Any] {
                                informational(&download, hashes: ["sha256"])
                                entries[index]["download"] = download
                            }
                        }
                        metadata["entries"] = entries
                        if mode == "minimal-metadata" { metadata = ["entries": entries] }
                        if mode == "inaccurate-hints" {
                            for key in ["schemaVersion", "algorithm", "format", "compression", "platform", "appVersion", "baseVersion", "version", "targetPacketSize"] {
                                metadata[key] = ["ignored": true]
                            }
                        }
                    }, fullMutate: { manifest in
                        editDelta(&manifest) { informational(&$0, hashes: ["sha256", "baseSha256"]) }
                    }, patch: true)
                    try await client.checkForUpdate()
                    let requests = try f.requests().map { $0["path"] as! String }
                    // Save the regression's requests even when RED exits before the suite report.
                    try write(json(try f.requests()), output.appendingPathComponent("informational-\(mode)-requests.json"))
                    try expect(!requests.contains { $0.hasSuffix(".valdimodule") }, "\(mode) informational hashes must stage split without full download")
                    try expect(requests.contains { $0.hasSuffix(".hdiff") } && requests.contains { $0.hasSuffix(".zst") } &&
                               requests.contains { $0.hasSuffix(".bin") }, "real patch, compressed and raw entry downloads")
                    try expect(try Data(contentsOf: f.package("split").appendingPathComponent("modules/app_pages.valdimodule")) == split.target,
                               "exact final compressed bytes with \(mode) informational hashes")
                    try expect(try client.getInfo().pendingBundleVersion == "split", "split durably staged")
                    try expect(try client.start() == nil, "staging leaves running provider embedded")
                    try expect(try f.client().start()?.version == "split", "startup still authenticates and verifies staged package")
                }
            }
            try await test("split built-in copy/full, new/deleted entries, exact final archive", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client()
                _ = try client.start()
                try split.publish(f)
                try await client.checkForUpdate()
                let requested = try f.requests().map { $0["path"] as! String }
                try expect(requested.contains("/ios/0.1/split/deltas/pages-001/manifest.json"), "applicable built-in split metadata requested")
                try expect(!requested.contains("/ios/0.1/split/modules/app_pages.valdimodule"), "split reconstructed instead of full module")
                try expect(try Data(contentsOf: f.package("split").appendingPathComponent("modules/app_pages.valdimodule")) == split.target, "final exact default-ZSTD archive")
                try expect(try client.start() == nil, "staging never changes process provider")
                try expect(try f.client().start()?.version == "split", "complete signed package opens on cold start")
            }
            try await test("split selects baseVersion with changed unused base bytes; copied corruption uses full fallback", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                let client = try f.client(); _ = try client.start()
                for (entry, version) in [("deleted.js", "unused-base-bytes"), ("same.js", "copied-base-corrupt")] {
                    let changed = SplitFixture.basicOld.map {
                        ($0.0, $0.0 == entry ? Data(repeating: 88, count: $0.1.count) : $0.1)
                    }
                    try write(zstdFixture(packetFixture(changed)), f.bundled.appendingPathComponent("app_pages.valdimodule"))
                    try f.resetNetwork(); try split.publish(f, version: version)
                    if entry == "deleted.js" {
                        try await assertSplitStaged(f, client: client, version: version, target: split.target)
                    } else {
                        try await assertFullFallback(f, client: client, version: version, target: split.target)
                    }
                }
            }
            try await test("split source symlinks rejected before metadata IO", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                let outside = f.root.appendingPathComponent("outside.zst")
                try write(split.old, outside)
                try fm.createDirectory(at: f.bundled, withIntermediateDirectories: true)
                try fm.createSymbolicLink(at: f.bundled.appendingPathComponent("app_pages.valdimodule"), withDestinationURL: outside)
                let client = try f.client(); _ = try client.start()
                try split.publish(f, version: "linked-base")
                try await assertFullFallback(f, client: client, version: "linked-base", target: split.target)
                try expect(try f.requests().allSatisfy { !(($0["path"] as! String).contains("/deltas/")) }, "symlink base never opened for split")
            }
            try await test("split active HBC patch plus zstd/full/copy, retains current across pending replacement", http: http, base: base, modules: ["app_pages"]) { f in
                let bytecode = hbcFixture(471)
                var changed = bytecode; changed[24000] ^= 17
                let old: [(String, Data)] = [("src/main.js", bytecode), ("same.bin", hbcFixture(891)), ("deleted", Data("gone".utf8))]
                let target: [(String, Data)] = [("hash", Data("hash-2".utf8)), ("res.assetcatalog", Data("catalog-2".utf8)), ("src/main.js", changed), ("new.txt", Data(repeating: 65, count: 4096)), ("empty", Data()), ("same.bin", old[1].1)]
                let split = try SplitFixture(oldEntries: old, newEntries: target)
                try await f.stage("current", files: ["modules/app_pages.valdimodule": split.old])
                let current = try f.client()
                let selected = try current.start()!
                try f.resetNetwork()
                try split.publish(f, base: "current", patch: true)
                try await current.checkForUpdate()
                let requests = try f.requests().map { $0["path"] as! String }
                try expect(requests.contains { $0.hasSuffix(".hdiff") }, "real Cdecoder patch fetched")
                try expect(requests.contains { $0.hasSuffix(".zst") }, "default-zstd full entry fetched")
                try expect(!requests.contains { $0.hasSuffix(".valdimodule") }, "patch path avoids full archive")
                try expect(try Data(contentsOf: f.package("split").appendingPathComponent("modules/app_pages.valdimodule")) == split.target, "target order and all packet bytes exact")
                try expect(try Data(contentsOf: selected.modules["app_pages.valdimodule"]!) == split.old, "active source immutable")
                let second = try SplitFixture(oldEntries: old, newEntries: target + [("added", Data([3, 4, 5]))])
                try f.resetNetwork()
                try second.publish(f, version: "split-2", base: "current", patch: true)
                try await current.checkForUpdate()
                try expect(try f.requests().first!["query"] as? [String: [String]] == ["platform": ["ios"], "appVersion": ["0.1"], "bundleVersion": ["current"]], "second delta uses active query with split pending")
                try expect(try f.requests().allSatisfy { !(($0["path"] as! String).hasSuffix(".valdimodule")) }, "delta base stays current instead of pending split")
                try expect(try current.start()?.version == "current", "selected provider snapshot remains fixed")
                try expect(!fm.fileExists(atPath: f.package("split").path), "old pending removed after durable replacement")
                try expect(try f.client().start()?.version == "split-2", "split result reopens under original signed schema1")
                try expect(try f.client().start()?.version == "split-2", "promoted split persists across fresh starts")
                try expect(try f.state()["current"] as? String == "split-2", "split promotion durable without confirmation")
            }
            try await test("split malformed reconstruction entries fall back to original full module", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client(); _ = try client.start()
                let bad = String(repeating: "f", count: 64)
                let cases: [(String, (inout [String: Any]) -> Void)] = [
                    ("entries-missing", { $0.removeValue(forKey: "entries") }),
                    ("entries-type", { $0["entries"] = "not-array" }),
                    ("packet-bound", { $0["entries"] = [
                        ["name": "a", "size": 32 << 20, "operation": "copy"],
                        ["name": "b", "size": 32 << 20, "operation": "copy"]] }),
                    ("entry-count", { $0["entries"] = Array(repeating: ($0["entries"] as! [[String: Any]])[0], count: 4097) }),
                    ("duplicate", { var e = $0["entries"] as! [[String: Any]]; e[1]["name"] = e[0]["name"]; $0["entries"] = e }),
                    ("entry-size", { editEntry(&$0, 0) { $0["size"] = (64 << 20) + 1 } }),
                    ("entry-size-bool", { editEntry(&$0, 0) { $0["size"] = true } }),
                    ("entry-size-fraction", { editEntry(&$0, 0) { $0["size"] = 1.5 } }),
                    ("copy-missing", { editEntry(&$0, 1) { $0["name"] = "absent" } }),
                    ("operation", { editEntry(&$0, 0) { $0["operation"] = "unknown" } }),
                    ("encoding", { editEntry(&$0, 0) { var d = $0["download"] as! [String: Any]; d["encoding"] = "gzip"; $0["download"] = d } }),
                    ("payload-path", { editEntry(&$0, 0) { var d = $0["download"] as! [String: Any]; d["path"] = "deltas/other/payload/" + bad + ".bin"; $0["download"] = d } }),
                    ("payload-size", { editEntry(&$0, 0) { var d = $0["download"] as! [String: Any]; d["size"] = 1; $0["download"] = d } }),
                    ("target-order", { $0["entries"] = Array(($0["entries"] as! [[String: Any]]).reversed()) })
                ]
                for (name, mutation) in cases {
                    let version = "bad-" + name
                    try f.resetNetwork(); try split.publish(f, version: version, mutate: mutation)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
                for (index, path) in ["/abs", "a//b", "a/../b", "a/./b", "a\\b", "a\0b"].enumerated() {
                    let version = "path-\(index)"
                    try f.resetNetwork()
                    try split.publish(f, version: version, mutate: { editEntry(&$0, 0) { $0["name"] = path } })
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
            }
            try await test("split legacy informational mutation cases reconstruct without full download", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client(); _ = try client.start()
                let bad = String(repeating: "f", count: 64)
                // These were negative mutation cases before intermediate checks were intentionally removed.
                let metadataCases: [(String, (inout [String: Any]) -> Void)] = [
                    ("schema", { $0["schemaVersion"] = 2 }), ("schema-bool", { $0["schemaVersion"] = true }),
                    ("algorithm", { $0["algorithm"] = "other" }), ("format", { $0["format"] = "HDIFF13" }),
                    ("compression", { $0["compression"] = "lzma" }), ("platform", { $0["platform"] = "android" }),
                    ("app-version", { $0["appVersion"] = "other" }), ("target-version", { $0["version"] = "other" }),
                    ("base-version", { $0["baseVersion"] = "other" }),
                    ("packet-size", { $0["targetPacketSize"] = (64 << 20) + 1 }), ("packet-fraction", { $0["targetPacketSize"] = 8.5 }),
                    ("packet-bool", { $0["targetPacketSize"] = true }), ("packet-length", { $0["targetPacketSize"] = 9 }),
                    ("base-sha", { $0["baseSha256"] = bad }),
                    ("target-sha", { $0["targetSha256"] = bad }),
                    ("base-packet", { $0["basePacketSha256"] = bad }),
                    ("target-packet", { $0["targetPacketSha256"] = bad }),
                    ("entry-hash", { editEntry(&$0, 0) { $0["sha256"] = bad } }),
                    ("copy-sha", { editEntry(&$0, 1) { $0["sha256"] = bad } }),
                    ("payload-sha", { editEntry(&$0, 0) { var d = $0["download"] as! [String: Any]; d["sha256"] = bad; $0["download"] = d } })
                ]
                for (name, mutation) in metadataCases {
                    let version = "informational-" + name
                    try f.resetNetwork(); try split.publish(f, version: version, mutate: mutation)
                    try await assertSplitStaged(f, client: client, version: version, target: split.target)
                }
                let descriptorCases: [(String, (inout [String: Any]) -> Void)] = [
                    ("sha", { editDelta(&$0) { $0["sha256"] = String(repeating: "0", count: 64) } }),
                    ("extra", { editDelta(&$0) { $0["unsigned"] = "extra" } }),
                    ("base", { editDelta(&$0) { $0["baseSha256"] = String(repeating: "1", count: 64) } })
                ]
                for (name, mutation) in descriptorCases {
                    let version = "informational-descriptor-" + name
                    try f.resetNetwork(); try split.publish(f, version: version, fullMutate: mutation)
                    try await assertSplitStaged(f, client: client, version: version, target: split.target)
                }
            }
            try await test("signed delta descriptor limits, invalid base bytes and unavailable source", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                let bundled = f.bundled.appendingPathComponent("app_pages.valdimodule")
                try write(split.old, bundled)
                let client = try f.client(); _ = try client.start()
                let cases: [(String, (inout [String: Any]) -> Void)] = [
                    ("count", { $0["deltas"] = Array(repeating: ($0["deltas"] as! [[String: Any]])[0], count: 9) }),
                    ("type", { $0["deltas"] = "not-array" }), ("null", { $0["deltas"] = NSNull() }),
                    ("duplicate", { $0["deltas"] = Array(repeating: ($0["deltas"] as! [[String: Any]])[0], count: 2) }),
                    ("path", { editDelta(&$0) { $0["path"] = "../manifest.json" } }),
                    ("reserved", { editDelta(&$0) { $0["baseVersion"] = "LATEST.JSON" } }),
                    ("size", { editDelta(&$0) { $0["size"] = (1 << 20) + 1 } })
                ]
                for (name, mutation) in cases {
                    let version = "descriptor-" + name
                    try f.resetNetwork(); try split.publish(f, version: version, fullMutate: mutation)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
                for (index, source) in [Data("corrupt".utf8), Data()].enumerated() {
                    try write(source, bundled)
                    let version = "base-corrupt-\(index)"
                    try f.resetNetwork(); try split.publish(f, version: version)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
                try fm.removeItem(at: bundled)
                try f.resetNetwork(); try split.publish(f, version: "base-missing")
                try await assertFullFallback(f, client: client, version: "base-missing", target: split.target)
            }
            try await test("missing codec, partial recompression failure, and equivalent different compressed bytes use full fallback", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let packet = f.root.appendingPathComponent("equivalent.packet")
                let alternate = f.root.appendingPathComponent("equivalent.zst")
                let decoded = f.root.appendingPathComponent("equivalent.decoded")
                try write(packetFixture(split.newEntries), packet)
                try FaultCodec(mode: .wrongCompression).encode(packet, to: alternate, maxOutput: 64 << 20)
                try ValdiOtaNativeCodec().decode(alternate, to: decoded, maxOutput: 64 << 20)
                try expect(try Data(contentsOf: decoded) == Data(contentsOf: packet), "alternate compression really decodes to identical packet with real core")
                try expect(try Data(contentsOf: alternate) != split.target, "alternate valid frame is byte-different from signed default")
                for (index, mode) in [FaultCodec.Mode.unavailable, .encodeFailure, .wrongCompression].enumerated() {
                    let client = try f.client(codec: FaultCodec(mode: mode)); _ = try client.start()
                    let version = "codec-\(index)"
                    try f.resetNetwork(); try split.publish(f, version: version)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
            }
            try await test("split signature authentication precedes metadata; corrupt payload and interrupted metadata fall back", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client(); _ = try client.start()
                try split.publish(f, version: "unsigned")
                try write(Data("invalid".utf8), f.http.appendingPathComponent("ios/0.1/unsigned/manifest.sig"))
                try await rejects { try await client.checkForUpdate() }
                try expect(try f.requests().count == 3, "unauthenticated delta never fetched")
                let modes: [(String, [String: Any])] = [("interrupted", ["interrupt": true]), ("oversized", ["length": (1 << 20) + 1]), ("malformed-metadata", [:]), ("metadata-length", ["omitLength": true])]
                for (version, rule) in modes {
                    try f.resetNetwork(); try split.publish(f, version: version)
                    let path = "\(version)/deltas/pages-001/manifest.json"
                    if version == "malformed-metadata" {
                        let url = f.http.appendingPathComponent("ios/0.1/" + path)
                        var data = try Data(contentsOf: url); data[0] ^= 1; try data.write(to: url)
                    } else if version == "metadata-length" {
                        try write(Data(repeating: 65, count: (1 << 20) + 1), f.http.appendingPathComponent("ios/0.1/" + path))
                    }
                    try f.rule(path, rule)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
                try f.resetNetwork(); try split.publish(f, version: "payload-corrupt")
                let data = try Data(contentsOf: f.http.appendingPathComponent("ios/0.1/payload-corrupt/deltas/pages-001/manifest.json"))
                let metadata = try JSONSerialization.jsonObject(with: data) as! [String: Any]
                let entry = (metadata["entries"] as! [[String: Any]])[0]["download"] as! [String: Any]
                try write(Data(repeating: 0, count: entry["size"] as! Int), f.http.appendingPathComponent("ios/0.1/payload-corrupt/" + (entry["path"] as! String)))
                try await assertFullFallback(f, client: client, version: "payload-corrupt", target: split.target)
            }
            try await test("split aggregate download budget includes bounded metadata", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client(); _ = try client.start()
                try split.publish(f, version: "aggregate-budget", mutate: { metadata in
                    editEntry(&metadata, 0) { entry in
                        var download = entry["download"] as! [String: Any]
                        download["size"] = (64 << 20) - 11; download["encoding"] = "zstd"
                        download["path"] = "deltas/pages-001/payload/" + String(repeating: "1", count: 64) + ".zst"
                        entry["download"] = download
                    }
                })
                try await assertFullFallback(f, client: client, version: "aggregate-budget", target: split.target)
                try expect(try f.requests().allSatisfy { !(($0["path"] as! String).contains("/payload/")) }, "metadata plus payload exceeding 64MiB rejected before payload request")
            }
            try await test("malformed bounded base packets fall back before entry payload IO", http: http, base: base, modules: ["app_pages"]) { f in
                let good = packetFixture(SplitFixture.basicOld)
                var magic = good; magic[0] ^= 1
                var length = good; length[4] ^= 1
                var field = good; field.replaceSubrange(8..<12, with: [255, 255, 255, 255])
                var padding = good; padding[19] = 1
                let cases: [(String, Data)] = [
                    ("magic", magic), ("length", length), ("field", field), ("padding", padding),
                    ("truncated", good.dropLast()), ("trailing", good + Data([1])),
                    ("duplicate", packetFixture([("same.js", Data("same".utf8)), ("same.js", Data("same".utf8))])),
                    ("path", packetFixture([("../escape", Data())])),
                    ("count", packetFixture((0..<4097).map { ("x\($0)", Data()) }))
                ]
                let client = try f.client(); _ = try client.start()
                for (name, packet) in cases {
                    let split = try SplitFixture(oldPacket: packet)
                    try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                    let version = "packet-" + name
                    try f.resetNetwork(); try split.publish(f, version: version)
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                    try expect(try f.requests().allSatisfy { !(($0["path"] as! String).contains("/payload/")) }, "invalid base packet rejected before entry payloads: \(name)")
                }
            }
            try await test("real HDiff patch rejects wrong base, corrupted format/output and non-HBC envelopes", http: http, base: base, modules: ["app_pages"]) { f in
                let old = hbcFixture(717)
                var target = old; target[30000] ^= 16
                let split = try SplitFixture(oldEntries: [("main.js", old)], newEntries: [("main.js", target)])
                try write(split.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                let client = try f.client(); _ = try client.start()
                // Informational hash mutations now succeed; actual patch and base byte damage still fails.
                for name in ["base-sha", "target-sha"] {
                    let version = "informational-patch-" + name
                    try f.resetNetwork()
                    try split.publish(f, version: version, mutate: { metadata in
                        editEntry(&metadata, 0) { $0[name == "base-sha" ? "baseSha256" : "sha256"] = String(repeating: "0", count: 64) }
                    }, patch: true)
                    try await assertSplitStaged(f, client: client, version: version, target: split.target)
                }
                let cases = ["wrong-base-bytes", "patch-format", "patch-output", "patch-size"]
                for name in cases {
                    let version = "patch-" + name
                    try f.resetNetwork()
                    var baseBytes = old
                    if name == "wrong-base-bytes" { baseBytes[50000] ^= 32 }
                    try write(zstdFixture(packetFixture([("main.js", baseBytes)])), f.bundled.appendingPathComponent("app_pages.valdimodule"))
                    var modificationError: Error?
                    try split.publish(f, version: version, mutate: { metadata in
                        if name == "patch-size" { metadata["targetPacketSize"] = (metadata["targetPacketSize"] as! Int) + 4 }
                        editEntry(&metadata, 0) { entry in
                            if name == "patch-size" { entry["size"] = (entry["size"] as! Int) + 1 }
                            else if name != "wrong-base-bytes" {
                                do {
                                    var download = entry["download"] as! [String: Any]
                                    let oldPath = download["path"] as! String
                                    var bytes = try Data(contentsOf: f.http.appendingPathComponent("ios/0.1/\(version)/" + oldPath))
                                    if name == "patch-format" { bytes[0] ^= 1 }
                                    else { bytes[bytes.count - 1] ^= 1 }
                                    let path = "deltas/pages-001/payload/" + digest(bytes) + ".hdiff"
                                    try write(bytes, f.http.appendingPathComponent("ios/0.1/\(version)/" + path))
                                    download["path"] = path; download["sha256"] = digest(bytes)
                                    entry["download"] = download
                                } catch { modificationError = error }
                            }
                        }
                    }, patch: true)
                    if let modificationError { throw modificationError }
                    try await assertFullFallback(f, client: client, version: version, target: split.target)
                }
                for (index, oldBytes, newBytes) in [(0, Data("ordinary javascript".utf8), target), (1, old, Data("ordinary javascript".utf8))] {
                    let wrong = try SplitFixture(oldEntries: [("main.js", oldBytes)], newEntries: [("main.js", newBytes)])
                    try write(wrong.old, f.bundled.appendingPathComponent("app_pages.valdimodule"))
                    let version = "patch-envelope-\(index)"
                    try f.resetNetwork(); try wrong.publish(f, version: version, patch: true)
                    try await assertFullFallback(f, client: client, version: version, target: wrong.target)
                }
            }
            try await test("split state write failure retains active/current and previous pending, interrupted delta cleanup", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try await f.stage("current", files: ["modules/app_pages.valdimodule": split.old])
                let client = try f.client(); _ = try client.start()
                try split.publish(f, version: "previous", base: "current")
                try await client.checkForUpdate()
                let saved = try Data(contentsOf: f.stateURL)
                let next = try SplitFixture(newEntries: SplitFixture.basicNew + [("extra", Data([1]))])
                try next.publish(f, version: "failed-write", base: "current")
                try f.resetNetwork()
                let ota = f.stateURL.deletingLastPathComponent()
                defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path) }
                try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                let error = try await rejects { try await client.checkForUpdate() }
                try expect((error as NSError).userInfo[NSFilePathErrorKey] as? String == f.stateURL.path, "split reaches atomic pending-state write")
                try expect(try f.requests().allSatisfy { !(($0["path"] as! String).hasSuffix(".valdimodule")) }, "real split completed before state failure")
                try expect(try Data(contentsOf: f.stateURL) == saved, "state unchanged after split stage failure")
                try expect(!fm.fileExists(atPath: f.package("failed-write").path), "split stage orphan removed")
                try expect(fm.fileExists(atPath: f.package("previous").path), "previous pending retained")
                try expect(try Data(contentsOf: f.package("current").appendingPathComponent("modules/app_pages.valdimodule")) == split.old, "current bytes retained")
                try expect(try fm.contentsOfDirectory(atPath: ota.appendingPathComponent("staging").path).isEmpty, "delta temporary removed on state failure")
                try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                let abandoned = ota.appendingPathComponent("staging/interrupted/.delta-123/base.packet")
                try write(Data("interrupted".utf8), abandoned)
                let cold = try f.client(); _ = try cold.start()
                try expect(!fm.fileExists(atPath: abandoned.path), "cold start reclaims interrupted delta work")
            }
            try await test("configuration bundleVersion default decode, explicit identity, reserved versions and production inventory", http: http, base: base, modules: ["app_pages"]) { f in
                let old: [String: Any] = ["appVersion": "0.1", "url": f.base, "publicKey": f.key.publicKey.pemRepresentation, "modules": ["app_pages"]]
                let config = try JSONDecoder().decode(ValdiOtaClient.Configuration.self, from: json(old))
                try expect(config.bundleVersion == "pages-001", "old fixtures default embedded version")
                var explicit = old; explicit["bundleVersion"] = "embedded-42"
                let configured = try JSONDecoder().decode(ValdiOtaClient.Configuration.self, from: json(explicit))
                let client = try ValdiOtaClient(configuration: configured, root: f.root.appendingPathComponent("ota"), binaryIdentity: "native/1", bundledModules: [:])
                _ = try client.start(); try f.latest(nil); try await client.checkForUpdate()
                try expect(try f.requests().last!["query"] as? [String: [String]] == ["platform": ["ios"], "appVersion": ["0.1"], "bundleVersion": ["embedded-42"]], "configured embedded identity in query")
                for version in ["latest.json", "LATEST.JSON", "Latest.Json"] {
                    try f.latest(version)
                    try await rejects { try await client.checkForUpdate() }
                }
                try f.publish("foreign", files: ["modules/app_pages.valdimodule": Data("pages".utf8), "modules/app_foundation.valdimodule": Data("foreign".utf8)])
                try f.resetNetwork(); try await rejects { try await client.checkForUpdate() }
                try expect(try f.requests().count == 3, "production app_pages inventory rejects foreign OTA before files")
            }
            try await test("delta failure then interrupted full fallback retains active/current and previous pending", http: http, base: base, modules: ["app_pages"]) { f in
                let split = try SplitFixture()
                try await f.stage("current", files: ["modules/app_pages.valdimodule": split.old])
                let client = try f.client(); _ = try client.start()
                try f.publish("previous", files: ["modules/app_pages.valdimodule": split.old])
                try await client.checkForUpdate()
                let saved = try Data(contentsOf: f.stateURL)
                try split.publish(f, version: "both-failed", base: "current", mutate: { $0["entries"] = Array(($0["entries"] as! [[String: Any]]).reversed()) })
                try f.resetNetwork()
                try f.rule("both-failed/modules/app_pages.valdimodule", ["interrupt": true])
                try await rejects { try await client.checkForUpdate() }
                try expect(try f.requests().contains { ($0["path"] as! String) == "/ios/0.1/both-failed/modules/app_pages.valdimodule" }, "delta error attempts original full fallback")
                try expect(try Data(contentsOf: f.stateURL) == saved, "double failure leaves state intact")
                try expect(try Data(contentsOf: f.package("current").appendingPathComponent("modules/app_pages.valdimodule")) == split.old, "double failure leaves active/current bytes intact")
                try expect(fm.fileExists(atPath: f.package("previous").path), "double failure keeps previous pending")
                try expect(!fm.fileExists(atPath: f.package("both-failed").path), "double failure never commits package")
                try expect(try client.start()?.version == "current", "double failure keeps immutable snapshot")
                try expect(try fm.contentsOfDirectory(atPath: f.root.appendingPathComponent("ota/staging").path).isEmpty, "both delta and full partials removed")
            }
            try await test("latest query uses embedded then active, never pending", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                try f.latest(nil)
                try await client.checkForUpdate()
                let query = try f.requests().last!["query"] as! [String: [String]]
                try expect(query == ["platform": ["ios"], "appVersion": ["0.1"], "bundleVersion": ["pages-001"]], "latest query carries actual embedded version")
                try f.publish("v1")
                try await client.checkForUpdate()
                let active = try f.client()
                _ = try active.start()
                try f.publish("v2", files: f.files("two"))
                try await active.checkForUpdate()
                try f.resetNetwork()
                try f.latest(nil)
                try await active.checkForUpdate()
                let activeQuery = try f.requests().last!["query"] as! [String: [String]]
                try expect(activeQuery["bundleVersion"] == ["v1"], "query uses immutable active, not pending v2")
                try f.resetNetwork()
                try f.latest("pages-001")
                try await active.checkForUpdate()
                try expect(try f.requests().count == 1, "embedded version is never offered")
            }
            try await test("cold startup reclaims interrupted staging once", http: http, base: base) { f in
                _ = try await f.activated()
                let abandoned = f.root.appendingPathComponent("ota/staging/terminated-attempt/file.part")
                try write(Data(repeating: 1, count: 4096), abandoned)
                let unrelated = f.root.appendingPathComponent("ota/keep.txt")
                try write(Data("keep".utf8), unrelated)
                let client = try f.client()
                try expect(try client.start()?.version == "current", "current survives staging cleanup")
                try expect(!fm.fileExists(atPath: abandoned.path), "interrupted staging reclaimed")
                try expect(fm.fileExists(atPath: unrelated.path), "unrelated files preserved")
                let live = f.root.appendingPathComponent("ota/staging/live-attempt/file.part")
                try write(Data("live".utf8), live)
                _ = try client.start()
                try expect(fm.fileExists(atPath: live.path), "repeated start does not delete in-process staging")
            }
            try await test("complete signed package, no fingerprint, fixed snapshot, promotion on start", http: http, base: base) { f in
                let client = try f.client()
                try expect(try client.start() == nil, "first start bundled")
                try f.publish("v1")
                try await client.checkForUpdate()
                try expect(try client.start() == nil, "snapshot stays bundled after staging")
                let next = try f.client()
                let snapshot = try next.start()
                try expect(snapshot?.version == "v1", "pending activated")
                try expect(snapshot?.modules.count == 3, "all modules/maps")
                for (path, bytes) in f.files() {
                    try expect(try Data(contentsOf: f.package("v1").appendingPathComponent(path)) == bytes, "complete file \(path)")
                }
                try expect(try f.state()["current"] as? String == "v1", "promotion durable")
                try expect(try f.state()["pending"] == nil, "promotion clears pending before snapshot returned")
                let declaredURL = snapshot!.modules["app_pages.valdimodule"]!
                try fm.removeItem(at: declaredURL)
                try expect(try next.start()?.modules["app_pages.valdimodule"] == declaredURL, "declared provider entry remains fixed when file disappears")
                try await rejects { _ = try Data(contentsOf: declaredURL) }
                try expect(try f.client().start() == nil, "missing declared file invalidates package on next start")
            }
            try await test("strict signed schema, compatibility, inventory and paths", http: http, base: base) { f in
                let cases: [(String, (inout [String: Any]) -> Void)] = [
                    ("schema", { $0["schemaVersion"] = 2 }),
                    ("schema-bool", { $0["schemaVersion"] = true }),
                    ("platform", { $0["platform"] = "android" }),
                    ("app", { $0["appVersion"] = "0.2" }),
                    ("version", { $0["version"] = "other" }),
                    ("missing", { var files = $0["files"] as! [String: Any]; files.removeValue(forKey: "modules/app_pages.valdimodule"); $0["files"] = files }),
                    ("unknown", { var files = $0["files"] as! [String: Any]; files["modules/extra.valdimodule"] = ["sha256": String(repeating: "a", count: 64), "size": 1]; $0["files"] = files }),
                    ("unknown-map", { var files = $0["files"] as! [String: Any]; files["modules/extra.map.json"] = ["sha256": String(repeating: "a", count: 64), "size": 1]; $0["files"] = files }),
                    ("old", { $0["files"] = ["modules/app_pages.valdimodule": String(repeating: "a", count: 64)] }),
                    ("negative", { $0["files"] = ["modules/app_pages.valdimodule": ["sha256": String(repeating: "a", count: 64), "size": -1]] }),
                    ("fraction", { $0["files"] = ["modules/app_pages.valdimodule": ["sha256": String(repeating: "a", count: 64), "size": 1.5]] }),
                    ("bool", { $0["files"] = ["modules/app_pages.valdimodule": ["sha256": String(repeating: "a", count: 64), "size": true]] }),
                    ("upper-hash", { $0["files"] = ["modules/app_pages.valdimodule": ["sha256": String(repeating: "A", count: 64), "size": 1]] }),
                    ("foreign-res", { var files = $0["files"] as! [String: Any]; files["res/foreign.bundle/icon.png"] = ["sha256": String(repeating: "a", count: 64), "size": 0]; $0["files"] = files }),
                    ("total", { var files = $0["files"] as! [String: Any]; files["res/app_pages.bundle/huge"] = ["sha256": String(repeating: "a", count: 64), "size": 64 << 20]; $0["files"] = files }),
                    ("count", { var files = $0["files"] as! [String: Any]; for i in 0..<4096 { files["res/f\(i)"] = ["sha256": String(repeating: "a", count: 64), "size": 0] }; $0["files"] = files })
                ]
                let client = try f.client()
                _ = try client.start()
                for (name, mutation) in cases {
                    try f.resetNetwork()
                    try f.publish(name, mutate: mutation)
                    try await rejects { try await client.checkForUpdate() }
                    try expect(!fm.fileExists(atPath: f.package(name).path), "rejected \(name)")
                    try expect(try f.requests().allSatisfy { !(($0["path"] as! String).contains("/modules/")) }, "reject descriptors before file requests: \(name)")
                }
                for path in ["res/../escape", "res//empty", "res/./dot", "res/a%20b", "res/a?b", "res/a\\b", "/res/abs", "modules/nested/app_pages.valdimodule"] {
                    try f.publish("bad-path", mutate: { manifest in
                        var files = manifest["files"] as! [String: Any]
                        files[path] = ["sha256": String(repeating: "a", count: 64), "size": 0]
                        manifest["files"] = files
                    })
                    try await rejects { try await client.checkForUpdate() }
                }
                try f.publish("bad-signature", sign: false)
                try await rejects { try await client.checkForUpdate() }
                for version in ["../escape", "", "a/b", String(repeating: "v", count: 65)] {
                    try f.latest(version)
                    try await rejects { try await client.checkForUpdate() }
                }
            }
            try await test("verified bundle/current/active/pending reuse without file requests", http: http, base: base) { f in
                for (path, bytes) in f.files() where path.hasPrefix("modules/") {
                    try write(bytes, f.bundled.appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent))
                }
                let active = try await f.activated("v1")
                try f.resetNetwork()
                try f.publish("v2")
                try await active.checkForUpdate()
                try expect(try f.requests().count == 3, "identical target uses only three metadata requests")
                try expect(try active.start()?.version == "v1", "snapshot fixed across pending replacement")
                // Change current resource after staging v2: v2 remains a verified candidate for v3.
                try write(Data("broken".utf8), f.package("v1").appendingPathComponent("res/app_pages.bundle/icon@2x.png"))
                try f.resetNetwork()
                try f.publish("v3")
                try await active.checkForUpdate()
                try expect(try f.requests().count == 3, "pending supplies corrupt-current resource")
                try expect(fm.fileExists(atPath: f.package("v1").path), "process-active package retained")
                try expect(!fm.fileExists(atPath: f.package("v2").path), "superseded pending cleaned after v3 committed")
            }
            try await test("reuse is copied and corrupted bundle requires network", http: http, base: base) { f in
                let contents = f.files()
                for (path, bytes) in contents where path.hasPrefix("modules/") {
                    try write(bytes, f.bundled.appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent))
                }
                try write(Data("bad".utf8), f.bundled.appendingPathComponent("app_pages.map.json"))
                try await f.stage("v1")
                let requests = try f.requests().map { $0["path"] as! String }
                try expect(requests.contains("/ios/0.1/v1/modules/app_pages.map.json"), "invalid bundled map downloaded")
                try expect(!requests.contains("/ios/0.1/v1/modules/app_pages.valdimodule"), "valid bundled module reused")
                try write(Data("mutated".utf8), f.bundled.appendingPathComponent("app_pages.valdimodule"))
                try expect(try Data(contentsOf: f.package("v1").appendingPathComponent("modules/app_pages.valdimodule")) == contents["modules/app_pages.valdimodule"], "copy independent")
            }
            try await test("business edit downloads only changed module/map/resource", http: http, base: base) { f in
                let client = try await f.activated()
                try f.resetNetwork()
                try f.publish("business", files: f.files("business"))
                try await client.checkForUpdate()
                let requested = Set(try f.requests().map { $0["path"] as! String })
                try expect(!requested.contains("/ios/0.1/business/modules/app_foundation.valdimodule"), "unchanged capability JS reused")
                for path in ["modules/app_pages.valdimodule", "modules/app_pages.map.json", "res/app_pages.bundle/icon@2x.png"] {
                    try expect(requested.contains("/ios/0.1/business/\(path)"), "changed file downloaded \(path)")
                }
                try expect(requested.count == 6, "three metadata plus three changed files")
            }
            try await test("empty files and symlink/corrupt-source rejection", http: http, base: base) { f in
                var contents = f.files()
                contents["modules/app_pages.map.json"] = Data()
                try await f.stage("zero", files: contents)
                let active = try f.client()
                try expect(try active.start()?.version == "zero", "zero-byte signed descriptor")
                let source = f.package("zero").appendingPathComponent("modules/app_foundation.valdimodule")
                let outside = f.root.appendingPathComponent("outside")
                try fm.copyItem(at: source, to: outside)
                try fm.removeItem(at: source)
                try fm.createSymbolicLink(at: source, withDestinationURL: outside)
                try f.resetNetwork()
                try f.publish("next", files: contents)
                try await active.checkForUpdate()
                try expect(try f.requests().contains { ($0["path"] as! String) == "/ios/0.1/next/modules/app_foundation.valdimodule" }, "symlink not reused")
                // Cached package selection also rejects links even if the target bytes match.
                var state = try f.state()
                state.removeValue(forKey: "pending")
                try f.saveState(state)
                try expect(try f.client().start() == nil, "symlink current rejected")
            }
            try await test("corrupt pending falls back current in same start", http: http, base: base) { f in
                let current = try await f.activated()
                try f.publish("pending", files: f.files("two"))
                try await current.checkForUpdate()
                try write(Data("corrupt".utf8), f.package("pending").appendingPathComponent("modules/app_pages.valdimodule"))
                let next = try f.client()
                try expect(try next.start()?.version == "current", "same-start current fallback")
                try expect(try f.state()["pending"] == nil, "bad pending removed durably")
                try expect(try f.state()["failed"] == nil, "corrupt selection creates no blacklist")
                try expect(!fm.fileExists(atPath: f.package("pending").path), "corrupt pending cleaned after fallback persisted")
                try f.resetNetwork()
                try await next.checkForUpdate()
                try expect(try f.requests().contains { ($0["path"] as! String) == "/ios/0.1/pending/modules/app_pages.valdimodule" }, "corrupt local version can download verified offer again")
                try expect(try f.client().start()?.version == "pending", "repaired pending promotes on next start")
            }
            try await test("signed cached metadata rejects corrupt pending and current with bundled fallback", http: http, base: base) { f in
                try await f.stage("pending")
                try write(Data("bad-signature".utf8), f.package("pending").appendingPathComponent("manifest.sig"))
                try expect(try f.client().start() == nil, "invalid pending without current falls back bundled")
                try expect(try f.state()["pending"] == nil, "invalid pending removed durably")
                _ = try await f.activated()
                try write(Data("bad-signature".utf8), f.package("current").appendingPathComponent("manifest.sig"))
                try expect(try f.client().start() == nil, "cached signature rechecked")
            }
            try await test("disabled URL ignores cached OTA and native identity resets state", http: http, base: base) { f in
                _ = try await f.activated()
                try f.resetNetwork()
                let stateBefore = try Data(contentsOf: f.stateURL)
                let disabled = try f.client(url: "")
                try expect(try disabled.start() == nil, "disabled built-in")
                try await disabled.checkForUpdate()
                try expect(try f.requests().isEmpty, "disabled no network")
                try expect(try Data(contentsOf: f.stateURL) == stateBefore, "disabled leaves state alone")
                let ota = f.stateURL.deletingLastPathComponent()
                defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path) }
                try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                try await rejects { _ = try f.client(identity: "native/2").start() }
                try expect(try Data(contentsOf: f.stateURL) == stateBefore, "failed native reset preserves old state")
                try expect(fm.fileExists(atPath: f.package("current").path), "failed native reset preserves old files")
                try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                let native = try f.client(identity: "native/2")
                try expect(try native.start() == nil, "new binary built-in")
                try expect(try f.state()["binary"] as? String == "native/2", "new identity durable")
            }
            try await test("null offer preserves current; cache bypass and singleflight", http: http, base: base) { f in
                let client = try await f.activated()
                try f.latest(nil)
                try await client.checkForUpdate()
                try expect(try f.state()["current"] as? String == "current", "null leaves current")
                try f.resetNetwork()
                try f.publish("next")
                try f.rule("latest.json", ["delay": 0.25])
                try await withThrowingTaskGroup(of: Void.self) { group in
                    for _ in 0..<16 { group.addTask { try await client.checkForUpdate() } }
                    try await group.waitForAll()
                }
                let requests = try f.requests()
                try expect(requests.filter { ($0["path"] as! String).hasSuffix("latest.json") }.count == 1, "one shared flight")
                for request in requests {
                    let headers = request["headers"] as! [String: String]
                    try expect(headers["Accept-Encoding"] == "identity", "identity requested")
                    try expect(headers["Cache-Control"]?.contains("no-cache") == true, "cache bypass")
                }
            }
            try await test("stream failures: interrupted, oversized, hash, status, encoding, redirect, timeout", http: http, base: base) { f in
                let client = try f.client(timeout: 0.3)
                _ = try client.start()
                let path = "modules/app_pages.valdimodule"
                let cases: [(String, [String: Any])] = [
                    ("interrupted", ["interrupt": true]),
                    ("short", ["omitLength": true]),
                    ("oversized", ["omitLength": true]),
                    ("length", ["length": 999]),
                    ("status", ["status": 503]),
                    ("encoding", ["encoding": "gzip"]),
                    ("redirect", ["status": 302]),
                    ("timeout", ["delay": 0.8])
                ]
                for (version, rule) in cases {
                    try f.resetNetwork()
                    try f.publish(version)
                    if version == "oversized" {
                        try write(Data(repeating: 1, count: 2 << 20), f.http.appendingPathComponent("ios/0.1/\(version)/\(path)"))
                    } else if version == "short" {
                        try write(Data(), f.http.appendingPathComponent("ios/0.1/\(version)/\(path)"))
                    }
                    try f.rule("\(version)/\(path)", rule)
                    try await rejects { try await client.checkForUpdate() }
                    try expect(!fm.fileExists(atPath: f.package(version).path), "no partial commit \(version)")
                    let leftovers = fm.enumerator(at: f.root, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? []
                    try expect(!leftovers.contains { $0.pathExtension == "part" }, "partials cleaned \(version)")
                    try expect(try f.requests().allSatisfy { ($0["path"] as! String) != "/redirect-target" }, "redirect not followed")
                }
                try f.resetNetwork()
                try f.publish("hash")
                let bytes = f.files()[path]!
                try write(Data(repeating: 0, count: bytes.count), f.http.appendingPathComponent("ios/0.1/hash/\(path)"))
                try await rejects { try await client.checkForUpdate() }
            }
            try await test("metadata streaming limits", http: http, base: base) { f in
                let client = try f.client()
                _ = try client.start()
                for (name, limit) in [("latest.json", 64 << 10), ("large/manifest.json", 1 << 20), ("large/manifest.sig", 4096)] {
                    try f.resetNetwork()
                    try f.publish("large")
                    try write(Data(repeating: 65, count: limit + 1), f.http.appendingPathComponent("ios/0.1/" + name))
                    try f.rule(name, ["omitLength": true])
                    try await rejects { try await client.checkForUpdate() }
                }
            }
            try await test("state errors surfaced, pending orphan removed, promotion before cleanup", http: http, base: base) { f in
                let current = try await f.activated()
                try f.publish("previous-pending")
                try await current.checkForUpdate()
                let saved = try Data(contentsOf: f.stateURL)
                let ota = f.stateURL.deletingLastPathComponent()
                defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path) }
                try f.publish("failed-write")
                // staging/ and packages/ remain writable; only state.json's parent is read-only.
                // Assembly and the complete-directory rename succeed before atomic state replacement fails.
                try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                let stagingError = try await rejects { try await current.checkForUpdate() }
                try expect((stagingError as NSError).userInfo[NSFilePathErrorKey] as? String == f.stateURL.path,
                           "failure reaches atomic state write: \(stagingError)")
                print("EXPECTED state write failure: \((stagingError as NSError).domain) \((stagingError as NSError).code)")
                try expect(!fm.fileExists(atPath: f.package("failed-write").path), "failed stage orphan removed")
                try expect(fm.fileExists(atPath: f.package("current").path), "current preserved")
                try expect(fm.fileExists(atPath: f.package("previous-pending").path), "previous pending preserved")
                try expect(try Data(contentsOf: f.stateURL) == saved, "failed stage leaves atomic state intact")
                try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                try await current.checkForUpdate()
                let before = try Data(contentsOf: f.stateURL)
                let oldBytes = try Data(contentsOf: f.package("current").appendingPathComponent("modules/app_pages.valdimodule"))
                let pendingBytes = try Data(contentsOf: f.package("failed-write").appendingPathComponent("modules/app_pages.valdimodule"))
                let next = try f.client()
                // Reclamation needs a writable parent too. Remove the completed staging
                // directory first so this fault reaches the atomic promotion write.
                try fm.removeItem(at: ota.appendingPathComponent("staging"))
                try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                let promotionError = try await rejects { _ = try next.start() }
                try expect((promotionError as NSError).userInfo[NSFilePathErrorKey] as? String == f.stateURL.path,
                           "promotion fails at atomic state write: \(promotionError)")
                try expect(fm.fileExists(atPath: f.package("current").path), "old current survives failed promotion")
                try expect(fm.fileExists(atPath: f.package("failed-write").path), "pending survives failed promotion")
                try expect(try Data(contentsOf: f.package("current").appendingPathComponent("modules/app_pages.valdimodule")) == oldBytes, "old current bytes unchanged")
                try expect(try Data(contentsOf: f.package("failed-write").appendingPathComponent("modules/app_pages.valdimodule")) == pendingBytes, "pending bytes unchanged")
                try expect(try Data(contentsOf: f.stateURL) == before, "failed promotion leaves atomic state intact")
                try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                try f.resetNetwork()
                try await rejects { _ = try next.start() }
                try await rejects { try await next.checkForUpdate() }
                try expect(try f.requests().isEmpty, "failed startup never exposes pending or checks using it")
                try expect(try current.start()?.version == "current", "existing process snapshot unchanged")
                let recovered = try f.client()
                try expect(try recovered.start()?.version == "failed-write", "fresh process retries durable promotion")
                try expect(try f.state()["current"] as? String == "failed-write" && f.state()["pending"] == nil, "retry promotion durable")
                try expect(!fm.fileExists(atPath: f.package("current").path), "old package cleaned only after durable promotion")
                try expect(try f.client().start()?.version == "failed-write", "recovered promotion survives another fresh start")
            }
            try await test("durable promotion failure without current and corrupt state surface", http: http, base: base) { f in
                try await f.stage("pending")
                let before = try Data(contentsOf: f.stateURL)
                // A read-only directory fails atomic replace even if the state file is readable.
                let ota = f.stateURL.deletingLastPathComponent()
                try fm.removeItem(at: ota.appendingPathComponent("staging"))
                try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: ota.path)
                defer { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path) }
                let next = try f.client()
                let error = try await rejects { _ = try next.start() }
                try expect((error as NSError).userInfo[NSFilePathErrorKey] as? String == f.stateURL.path, "no-current promotion reaches atomic state write")
                try expect(try Data(contentsOf: f.stateURL) == before, "pending not promoted without atomic write")
                try expect(fm.fileExists(atPath: f.package("pending").path), "pending package preserved on failed promotion")
                try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: ota.path)
                try await rejects { _ = try next.start() }
                try expect(try f.client().start()?.version == "pending", "fresh start recovers pending with no previous current")
                try write(Data("invalid state".utf8), f.stateURL)
                try await rejects { _ = try f.client().start() }
                try expect(fm.fileExists(atPath: f.package("pending").path), "read error does not clean packages")
            }
            let report = results.joined(separator: "\n") + "\n\(passed) tests passed\n"
            try write(Data(report.utf8), output.appendingPathComponent("test-report.txt"))
            try write(json(networkEvidence), output.appendingPathComponent("loopback-requests.json"))
            try write(json(fallbackEvidence), output.appendingPathComponent("split-fallback-requests.json"))
            try write(json(splitEvidence), output.appendingPathComponent("split-success-requests.json"))
            print("\(passed) tests passed")
        } catch {
            print("FAIL: \(error)")
            exit(1)
        }
    }
}
