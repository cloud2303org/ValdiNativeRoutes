import Foundation
import CoreFoundation

@main
struct StorageCodecTests {
    static func main() throws {
        precondition(!StorageCodec.decode(nil).found)
        let null = StorageCodec.decode("{\"value\":null}")
        precondition(null.found && null.payload["value"] is NSNull)
        let encodedNull = try StorageCodec.encode(null.payload)
        precondition(encodedNull == "{\"value\":null}")
        for value: Any in [true, false, "中文 👋", "", 1.25, ["x", NSNull(), true] as [Any]] {
            let stored = try StorageCodec.encode(["value": value])
            let read = StorageCodec.decode(stored)
            precondition(read.found && read.error.isEmpty)
            let expected = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])
            let actual = try JSONSerialization.data(withJSONObject: read.payload["value"]!, options: [.fragmentsAllowed, .sortedKeys])
            precondition(expected == actual)
        }
        let value: [String: Any] = ["__proto__": ["safe": true], "items": [NSNull(), false, "🧭", 3.5]]
        let read = StorageCodec.decode(try StorageCodec.encode(["value": value]))
        let map = read.payload["value"] as! [String: Any]
        let items = map["items"] as! [Any]
        precondition(items[0] is NSNull)
        precondition(CFGetTypeID(items[1] as! NSNumber) == CFBooleanGetTypeID())
        precondition((items[2] as! String) == "🧭")
        precondition((map["__proto__"] as! [String: Any])["safe"] as! Bool)
        for stored in ["", "{", "[1,", "{} trailing", "{}", "[]", "null"] {
            let invalid = StorageCodec.decode(stored)
            precondition(!invalid.found && !invalid.error.isEmpty)
        }
        do {
            _ = try StorageCodec.encode([:])
            preconditionFailure("missing envelope value must fail")
        } catch {}
        print("StorageCodecTests: passed structured scalars, arrays, maps, null/missing, booleans, Unicode, special keys and envelope validation")
    }
}
