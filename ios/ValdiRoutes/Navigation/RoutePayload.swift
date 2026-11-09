import Foundation

/// Native callers may supply mutable Foundation collections. Store only recursively copied Swift containers and
/// immutable scalar values, so later input mutations and edits to a returned value cannot change a page's payload.
/// Invalid direct native input is a programmer error (precondition), matching the existing keys/cycles policy.
struct RoutePayload {
    private let storage: [String: Any]

    init(_ value: [String: Any]) {
        var ancestors = Set<ObjectIdentifier>()
        storage = Self.snapshot(value, ancestors: &ancestors) as! [String: Any]
    }

    var value: [String: Any] { storage }

    private static func snapshot(_ value: Any, ancestors: inout Set<ObjectIdentifier>) -> Any {
        if value is NSNull { return NSNull() }
        // Keep NSNumber as NSNumber: converting through Bool or Double changes boolean identity or numeric values.
        if let number = value as? NSNumber {
            precondition(number.doubleValue.isFinite, "Route numbers must be finite")
            return number.copy() as! NSNumber
        }
        if let string = value as? NSString { return string as String }
        if let dictionary = value as? NSDictionary {
            let identity = ObjectIdentifier(dictionary)
            precondition(ancestors.insert(identity).inserted, "Cyclic route payload")
            defer { ancestors.remove(identity) }
            var result: [String: Any] = [:]
            for key in dictionary.allKeys {
                guard let name = key as? String else { preconditionFailure("Route payload keys must be strings") }
                result[name] = snapshot(dictionary.object(forKey: key)!, ancestors: &ancestors)
            }
            return result
        }
        if let array = value as? NSArray {
            let identity = ObjectIdentifier(array)
            precondition(ancestors.insert(identity).inserted, "Cyclic route payload")
            defer { ancestors.remove(identity) }
            return array.map { snapshot($0, ancestors: &ancestors) }
        }
        preconditionFailure("Unsupported route payload value: \(type(of: value))")
    }
}

/// Acceptance happens before a pop or cover back completes; the first accepted outcome owns its snapshot.
struct RouteResultState {
    private var accepted: (payload: RoutePayload, canceled: Bool)?

    mutating func accept(_ result: [String: Any]?, canceled: Bool) {
        guard accepted == nil else { return }
        accepted = (RoutePayload(canceled ? [:] : result ?? [:]), canceled)
    }

    var result: (value: [String: Any], canceled: Bool) {
        guard let accepted else { return ([:], true) }
        return (accepted.payload.value, accepted.canceled)
    }
}
