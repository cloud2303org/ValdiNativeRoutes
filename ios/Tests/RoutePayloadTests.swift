import Foundation
import CoreFoundation

final class RoutePayloadTests {
    func testSnapshotsNestedFoundationParams() {
        let text = NSMutableString(string: "路由 👋")
        let nested = NSMutableDictionary(dictionary: ["text": text, "enabled": NSNumber(value: true), "null": NSNull()])
        let list = NSMutableArray(array: [nested, NSNumber(value: 7), NSNull()])
        let original = NSMutableDictionary(dictionary: ["list": list])
        let payload = RoutePayload(["params": original])

        text.append(" changed")
        nested["enabled"] = NSNumber(value: false)
        nested["null"] = "changed"
        list.add("added")
        original["new"] = "added"

        let params = payload.value["params"] as! [String: Any]
        let items = params["list"] as! [Any]
        let first = items[0] as! [String: Any]
        expectNil(params["new"])
        expectEqual(items.count, 3)
        expectEqual(first["text"] as? String, "路由 👋")
        expectEqual((first["enabled"] as? NSNumber)?.boolValue, true)
        expectEqual(CFGetTypeID(first["enabled"] as! NSNumber), CFBooleanGetTypeID())
        expect(first["null"] is NSNull)
        expectEqual((items[1] as? NSNumber)?.intValue, 7)
        expectNotEqual(CFGetTypeID(items[1] as! NSNumber), CFBooleanGetTypeID())
        expect(items[2] is NSNull)
    }

    func testReturnedParamsCannotMutateTheStoredGraph() {
        let payload = RoutePayload(["map": NSMutableDictionary(dictionary: [
            "list": NSMutableArray(array: [NSMutableDictionary(dictionary: ["value": "original"])])
        ])])
        var returned = payload.value
        var map = returned["map"] as! [String: Any]
        var list = map["list"] as! [Any]
        var item = list[0] as! [String: Any]
        item["value"] = "changed"
        list[0] = item
        map["list"] = list
        returned["map"] = map

        let storedMap = payload.value["map"] as! [String: Any]
        let storedList = storedMap["list"] as! [Any]
        expectEqual((storedList[0] as! [String: Any])["value"] as? String, "original")
        expectFalse(payload.value["map"] is NSMutableDictionary)
        expectFalse(storedMap["list"] is NSMutableArray)
        expectFalse(storedList[0] is NSMutableDictionary)
    }

    func testFinishSnapshotsBeforeDeferredDeliveryAndFirstResultWins() {
        let nested = NSMutableDictionary(dictionary: ["value": "accepted"])
        let list = NSMutableArray(array: [nested, NSNumber(value: true), NSNull()])
        var completion = RouteResultState()
        completion.accept(["list": list], canceled: false)

        nested["value"] = "changed after finish"
        list.removeAllObjects()
        completion.accept(["other": "second finish"], canceled: false)
        completion.accept(["ignored": NSNumber(value: Double.nan)], canceled: false)
        completion.accept(nil, canceled: true)

        let reply = completion.result
        let accepted = reply.value["list"] as! [Any]
        expectFalse(reply.canceled)
        expectEqual(accepted.count, 3)
        expectEqual((accepted[0] as! [String: Any])["value"] as? String, "accepted")
        expectEqual(CFGetTypeID(accepted[1] as! NSNumber), CFBooleanGetTypeID())
        expect(accepted[2] is NSNull)
        expectNil(reply.value["other"])
    }

    func testCancellationAndSuccessfulEmptyResultStayDistinct() {
        var canceled = RouteResultState()
        canceled.accept(["ignored": NSNumber(value: Double.infinity)], canceled: true)
        canceled.accept(["late": "finish"], canceled: false)
        expect(canceled.result.canceled)
        expect(canceled.result.value.isEmpty)

        var finished = RouteResultState()
        finished.accept([:], canceled: false)
        finished.accept(nil, canceled: true)
        expectFalse(finished.result.canceled)
        expect(finished.result.value.isEmpty)

        let removedWithoutFinish = RouteResultState()
        expect(removedWithoutFinish.result.canceled)
        expect(removedWithoutFinish.result.value.isEmpty)
    }

    func testSwiftContainersAndFoundationScalarsKeepTheirValues() {
        let payload = RoutePayload(["values": [
            ["number": NSNumber(value: 42), "false": NSNumber(value: false), "null": NSNull()],
            ["unicode": "中文 👋", "nested": ["empty": [Any]()]]
        ]])
        let values = payload.value["values"] as! [[String: Any]]
        expectEqual((values[0]["number"] as? NSNumber)?.intValue, 42)
        expectEqual(CFGetTypeID(values[0]["false"] as! NSNumber), CFBooleanGetTypeID())
        expectFalse((values[0]["false"] as! NSNumber).boolValue)
        expect(values[0]["null"] is NSNull)
        expectEqual(values[1]["unicode"] as? String, "中文 👋")
        expect(((values[1]["nested"] as! [String: Any])["empty"] as! [Any]).isEmpty)
    }

    func testFiniteNumberEdgesKeepTheirValuesAndTypes() {
        let numbers: [NSNumber] = [
            NSNumber(value: 0.0), NSNumber(value: -0.0),
            NSNumber(value: Double.leastNonzeroMagnitude), NSNumber(value: Double.greatestFiniteMagnitude),
            NSNumber(value: 1.25), NSNumber(value: -4),
            NSNumber(value: Float.leastNonzeroMagnitude), NSNumber(value: Float.greatestFiniteMagnitude),
            NSNumber(value: Int64.max), NSNumber(value: UInt64.max),
            NSNumber(value: true), NSNumber(value: false),
        ]
        let payload = RoutePayload(["nested": [["numbers": numbers]]])
        let nested = (payload.value["nested"] as! [[String: Any]])[0]
        let copied = nested["numbers"] as! [NSNumber]
        expectEqual(copied, numbers)
        for (original, snapshot) in zip(numbers, copied) {
            expectEqual(String(cString: snapshot.objCType), String(cString: original.objCType))
            expectEqual(CFGetTypeID(snapshot), CFGetTypeID(original))
        }
        expectEqual(copied[1].doubleValue.sign, .minus)
    }

    func testSharedFoundationChildrenAreNotCycles() {
        let child = NSMutableDictionary(dictionary: ["enabled": NSNumber(value: true), "null": NSNull()])
        let list = NSMutableArray(array: [child, child])
        let payload = RoutePayload(["first": list, "second": list, "child": child])
        child["enabled"] = false
        list.removeAllObjects()
        for key in ["first", "second"] {
            let copied = payload.value[key] as! [[String: Any]]
            expectEqual(copied.count, 2)
            expectEqual((copied[0]["enabled"] as! NSNumber).boolValue, true)
            expect(copied[1]["null"] is NSNull)
        }
        expectEqual(((payload.value["child"] as! [String: Any])["enabled"] as! NSNumber).boolValue, true)
    }

    func testInvalidNativePayloadsFailWithExistingPreconditionPolicy() {
        for (name, message) in [
            ("nan", "Route numbers must be finite"),
            ("infinity", "Route numbers must be finite"),
            ("negative-infinity", "Route numbers must be finite"),
            ("float-nan", "Route numbers must be finite"),
            ("float-infinity", "Route numbers must be finite"),
            ("float-negative-infinity", "Route numbers must be finite"),
            ("decimal-nan", "Route numbers must be finite"),
            ("date", "Unsupported route payload value"),
            ("set", "Unsupported route payload value"),
            ("data", "Unsupported route payload value"),
            ("keys", "Route payload keys must be strings"),
            ("map-cycle", "Cyclic route payload"),
            ("list-cycle", "Cyclic route payload"),
        ] {
            let child = Process()
            child.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
            child.arguments = ["--invalid-payload", name]
            child.standardOutput = FileHandle.nullDevice
            let errors = Pipe()
            child.standardError = errors
            do {
                try child.run()
            } catch {
                preconditionFailure("Cannot run invalid-payload regression: \(error)")
            }
            let output = errors.fileHandleForReading.readDataToEndOfFile()
            child.waitUntilExit()
            expect(child.terminationStatus != 0)
            expect(String(decoding: output, as: UTF8.self).contains(message))
        }
    }
}

private func invalidNativePayload(_ name: String) -> Any {
    switch name {
    case "nan": return NSNumber(value: Double.nan)
    case "infinity": return NSNumber(value: Double.infinity)
    case "negative-infinity": return NSNumber(value: -Double.infinity)
    case "float-nan": return NSNumber(value: Float.nan)
    case "float-infinity": return NSNumber(value: Float.infinity)
    case "float-negative-infinity": return NSNumber(value: -Float.infinity)
    case "decimal-nan": return NSDecimalNumber.notANumber
    case "date": return Date()
    case "set": return NSSet(array: [1])
    case "data": return Data([1])
    case "keys": return NSDictionary(object: true, forKey: NSNumber(value: 1))
    case "map-cycle":
        let dictionary = NSMutableDictionary()
        dictionary["self"] = dictionary
        return dictionary
    case "list-cycle":
        let array = NSMutableArray()
        array.add(array)
        return array
    default: preconditionFailure("Unknown invalid-payload case")
    }
}

private func expect(_ value: Bool, file: StaticString = #file, line: UInt = #line) {
    precondition(value, "Expectation failed", file: file, line: line)
}

private func expectFalse(_ value: Bool, file: StaticString = #file, line: UInt = #line) {
    expect(!value, file: file, line: line)
}

private func expectNil(_ value: Any?, file: StaticString = #file, line: UInt = #line) {
    expect(value == nil, file: file, line: line)
}

private func expectEqual<T: Equatable>(_ value: T, _ expected: T, file: StaticString = #file, line: UInt = #line) {
    precondition(value == expected, "Expected \(expected), received \(value)", file: file, line: line)
}

private func expectNotEqual<T: Equatable>(_ value: T, _ other: T, file: StaticString = #file, line: UInt = #line) {
    expect(value != other, file: file, line: line)
}

@main
enum RoutePayloadTestRunner {
    static func main() {
        if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--invalid-payload" {
            _ = RoutePayload(["nested": [["value": invalidNativePayload(CommandLine.arguments[2])]]])
            return
        }
        let suite = RoutePayloadTests()
        let tests: [(String, () -> Void)] = [
            ("snapshots nested Foundation params", suite.testSnapshotsNestedFoundationParams),
            ("returned params cannot mutate stored graph", suite.testReturnedParamsCannotMutateTheStoredGraph),
            ("finish snapshots before delivery and first result wins", suite.testFinishSnapshotsBeforeDeferredDeliveryAndFirstResultWins),
            ("cancellation and successful empty result stay distinct", suite.testCancellationAndSuccessfulEmptyResultStayDistinct),
            ("Swift containers and Foundation scalars keep values", suite.testSwiftContainersAndFoundationScalarsKeepTheirValues),
            ("finite number edges keep values and types", suite.testFiniteNumberEdgesKeepTheirValuesAndTypes),
            ("shared Foundation children are not cycles", suite.testSharedFoundationChildrenAreNotCycles),
            ("invalid native payloads fail with existing preconditions", suite.testInvalidNativePayloadsFailWithExistingPreconditionPolicy),
        ]
        for (name, test) in tests {
            test()
            print("PASS: \(name)")
        }
        print("\(tests.count) native Foundation regressions passed")
    }
}
