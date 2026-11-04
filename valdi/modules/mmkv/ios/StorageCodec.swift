import Foundation

/// Persist the structured envelope directly; no legacy value decoding or conversion.
enum StorageCodec {
    struct Read {
        let found: Bool
        let payload: [String: Any]
        var error: String = ""
    }

    static func decode(_ stored: String?) -> Read {
        guard let stored else { return Read(found: false, payload: [:]) }
        do {
            guard let payload = try JSONSerialization.jsonObject(with: Data(stored.utf8)) as? [String: Any],
                  payload.keys.contains("value") else {
                return Read(found: false, payload: [:], error: "Invalid storage envelope")
            }
            return Read(found: true, payload: payload)
        } catch {
            return Read(found: false, payload: [:], error: "Invalid stored value: \(error.localizedDescription)")
        }
    }

    static func encode(_ payload: [String: Any]) throws -> String {
        guard payload.keys.contains("value") else {
            throw NSError(domain: "StorageCodec", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Storage payload is missing value"])
        }
        let bytes = try JSONSerialization.data(withJSONObject: payload)
        return String(decoding: bytes, as: UTF8.self)
    }
}
