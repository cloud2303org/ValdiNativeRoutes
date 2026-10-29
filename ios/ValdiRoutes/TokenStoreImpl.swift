import Foundation
import Security
import ValdiRuntime

/// auth.ts's TokenStore: one generic password in the Keychain, readable after the first unlock and never leaving this
/// device (no iCloud Keychain, not in backups restored elsewhere). Called on the JS thread; the Keychain is thread safe.
final class TokenStoreImpl {
    private let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "io.valdiroutes.app.session",
        kSecAttrAccount as String: "token",
    ]

    init() {
        // Keychain items outlive the app; UserDefaults don't. A reinstall starts signed out, as on Android.
        let installed = "TokenStore.installed"
        if !UserDefaults.standard.bool(forKey: installed) {
            clear()
            UserDefaults.standard.set(true, forKey: installed)
        }
    }

    lazy var store = VRTokenStore(
        has: { [unowned self] in !read().isEmpty },
        read: { [unowned self] in read() },
        write: { [unowned self] token in write(token) },
        clear: { [unowned self] in clear() }
    )

    private func read() -> String {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            if status != errSecItemNotFound { NSLog("TokenStore: read failed: %d", status) }
            return ""
        }
        return String(decoding: data, as: UTF8.self)
    }

    private func write(_ token: String) {
        let data = Data(token.utf8)
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status != errSecSuccess { NSLog("TokenStore: write failed: %d", status) }
    }

    private func clear() {
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound { NSLog("TokenStore: clear failed: %d", status) }
    }
}
