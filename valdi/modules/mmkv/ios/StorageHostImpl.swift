import Foundation
import MMKV
import ValdiRuntime

/// `api.*StorageSync` (storage.ts): a dedicated structured store in MMKV's default directory (Documents/mmkv).
/// Called on the JS thread; MMKV is thread safe. Only the persistence layer handles JSON text.
final class StorageHostImpl {
    private let mmkv: MMKV

    init() {
        MMKV.initialize(rootDir: nil)
        guard let mmkv = MMKV(mmapID: "app-structured") else { fatalError("MMKV: can't open the structured store") }
        self.mmkv = mmkv
    }

    lazy var host = VRStorageHost(
        get: { [unowned self] key in
            let read = StorageCodec.decode(mmkv.string(forKey: key))
            return VRStorageReadReply(found: read.found, payload: read.payload, error: read.error)
        },
        set: { [unowned self] request in
            guard let text = try? StorageCodec.encode(request.payload) else { return false }
            return mmkv.set(text, forKey: request.key)
        },
        remove: { [unowned self] key in mmkv.removeValue(forKey: key) },
        clear: { [unowned self] in mmkv.clearAll() }
    )
}
