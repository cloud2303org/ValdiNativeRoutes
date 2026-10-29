import Foundation
import MMKV
import ValdiRuntime

/// `api.*StorageSync` (storage.ts): one MMKV instance, in MMKV's default directory (Documents/mmkv), as ExpoNativeRoutes'
/// stores. Called on the JS thread; MMKV is thread safe. Values are JSON text, stored as strings.
final class StorageHostImpl {
    private let mmkv: MMKV

    init() {
        MMKV.initialize(rootDir: nil)
        guard let mmkv = MMKV(mmapID: "app") else { fatalError("MMKV: can't open the 'app' store") }
        self.mmkv = mmkv
    }

    lazy var host = VRStorageHost(
        get: { [unowned self] key in mmkv.string(forKey: key) ?? "" },
        set: { [unowned self] key, json in mmkv.set(json, forKey: key) },
        remove: { [unowned self] key in mmkv.removeValue(forKey: key) },
        clear: { [unowned self] in mmkv.clearAll() }
    )
}
