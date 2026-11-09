import Foundation
import MMKV
import ValdiRuntime

/// `api.*StorageSync` (storage.ts): a dedicated string store in MMKV's default directory (Documents/mmkv). Values
/// are JSON text serialized by JS; the bridge carries strings only. Called on the JS thread; MMKV is thread safe.
final class StorageHostImpl {
    private let mmkv: MMKV

    init() {
        MMKV.initialize(rootDir: nil)
        guard let mmkv = MMKV(mmapID: "app-structured") else { fatalError("MMKV: can't open the structured store") }
        self.mmkv = mmkv
    }

    lazy var host = VRStorageHost(
        get: { [unowned self] key in
            let stored = mmkv.string(forKey: key)
            return VRStorageReadReply(found: stored != nil, value: stored ?? "")
        },
        set: { [unowned self] request in mmkv.set(request.value, forKey: request.key) },
        remove: { [unowned self] key in mmkv.removeValue(forKey: key) },
        clear: { [unowned self] in mmkv.clearAll() }
    )
}
