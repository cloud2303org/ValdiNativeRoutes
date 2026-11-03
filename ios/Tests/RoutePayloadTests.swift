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
        canceled.accept(["ignored": "value"], canceled: true)
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
        let suite = RoutePayloadTests()
        let tests: [(String, () -> Void)] = [
            ("snapshots nested Foundation params", suite.testSnapshotsNestedFoundationParams),
            ("returned params cannot mutate stored graph", suite.testReturnedParamsCannotMutateTheStoredGraph),
            ("finish snapshots before delivery and first result wins", suite.testFinishSnapshotsBeforeDeferredDeliveryAndFirstResultWins),
            ("cancellation and successful empty result stay distinct", suite.testCancellationAndSuccessfulEmptyResultStayDistinct),
            ("Swift containers and Foundation scalars keep values", suite.testSwiftContainersAndFoundationScalarsKeepTheirValues),
        ]
        for (name, test) in tests {
            test()
            print("PASS: \(name)")
        }
        print("\(tests.count) native Foundation regressions passed")
    }
}
