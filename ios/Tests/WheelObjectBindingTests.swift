import UIKit
import XCTest
import ValdiRuntime

/// Uses the actual exported SDK, generated models, production binding blocks, and UIKit wheels.
/// The recorder only captures SDK-typed blocks; it does not implement a marshaller or generated ABI.
@MainActor
final class WheelObjectBindingTests: XCTestCase {
    private func bindings(_ type: ValdiWheelView.Type) -> VRWheelBindingRecorder {
        let recorder = VRWheelBindingRecorder()
        type.bindAttributes(recorder)
        return recorder
    }

    private func picker(in view: UIView) -> UIPickerView {
        if let picker = view as? UIPickerView { return picker }
        for child in view.subviews {
            if child is UIPickerView || child.subviews.contains(where: { $0 is UIPickerView }) {
                return picker(in: child)
            }
        }
        fatalError("Missing production picker")
    }

    private func select(_ row: Int, in view: UIView) {
        let picker = picker(in: view)
        picker.selectRow(row, inComponent: 0, animated: false)
        picker.delegate?.pickerView?(picker, didSelectRow: row, inComponent: 0)
    }

    private func column(_ value: String) -> [String: Any] {
        ["options": ["a", "b", "c"].map { ["value": $0, "label": "Label \($0)"] }, "value": value]
    }

    private func tree(_ path: [String]) -> [String: Any] {
        ["data": [
            ["value": "a", "label": "A", "children": [
                ["value": "a1", "label": "A1"], ["value": "a2", "label": "A2"]]],
            ["value": "b", "label": "B", "children": [["value": "b1", "label": "B1"]]],
            ["value": "c", "label": "C"]
        ], "value": path, "columns": 2]
    }

    func testGeneratedModelsDecodeBothDictionaryAndNativeObjects() throws {
        let column = try XCTUnwrap(
            VRWheelObjectBinding.decode(column("b"), as: VRColumnWheelConfig.self) as? VRColumnWheelConfig)
        XCTAssertEqual(column.options.map(\.value), ["a", "b", "c"])
        XCTAssertEqual(column.options[1].label, "Label b")
        let roundTrip = try XCTUnwrap(
            VRWheelObjectBinding.decode(column, as: VRColumnWheelConfig.self) as? VRColumnWheelConfig)
        XCTAssertEqual(roundTrip.value, "b")

        let tree = try XCTUnwrap(
            VRWheelObjectBinding.decode(tree(["a", "a2"]), as: VRTreeWheelConfig.self) as? VRTreeWheelConfig)
        XCTAssertEqual(tree.data[0].children?.map(\.value), ["a1", "a2"])
        XCTAssertNil(tree.data[2].children)
        XCTAssertEqual(tree.value, ["a", "a2"])
        XCTAssertEqual(tree.columns, 2)

        let time = try XCTUnwrap(VRWheelObjectBinding.decode(
            ["mode": "year", "value": "2024", "minYear": 2020, "maxYear": 2030],
            as: VRTimeWheelConfig.self) as? VRTimeWheelConfig)
        XCTAssertEqual(time.value, "2024")
        XCTAssertEqual(time.minYear, 2020)
    }

    func testMalformedObjectsReturnSwiftErrorsAndSubsequentDecodeStillWorks() throws {
        let malformed: [Any?] = [
            nil, NSNull(), "{}", 42, [:],
            ["options": "wrong", "value": "a"],
            ["options": [["value": 42, "label": "wrong"]], "value": "a"],
            ["options": [["value": "a"]], "value": ["wrong"]]
        ]
        for value in malformed {
            XCTAssertThrowsError(try VRWheelObjectBinding.decode(value, as: VRColumnWheelConfig.self))
        }
        XCTAssertThrowsError(try VRWheelObjectBinding.decode(
            ["data": [["value": "a", "label": "A", "children": "wrong"]], "value": [], "columns": 2],
            as: VRTreeWheelConfig.self))
        XCTAssertNotNil(try VRWheelObjectBinding.decode(column("a"), as: VRColumnWheelConfig.self))
    }

    func testColumnBindingEmitsOnlyUserStringsAndProtectsDelayedEchoes() {
        let view = ColumnWheelView(frame: .zero)
        let binder = bindings(ColumnWheelView.self)
        var values: [String] = []
        binder.changeBlock(view, SCValdiFunctionWithBlock { marshaller in
            XCTAssertEqual(SCValdiMarshallerGetCount(marshaller), 1)
            XCTAssertTrue(SCValdiMarshallerIsString(marshaller, 0))
            values.append(SCValdiMarshallerGetString(marshaller, 0))
            return false
        })
        XCTAssertTrue(binder.configBlock(view, column("a"), nil))
        XCTAssertTrue(values.isEmpty)
        select(1, in: view)
        select(2, in: view)
        XCTAssertEqual(values, ["b", "c"])
        XCTAssertTrue(binder.configBlock(view, column("b"), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 2)
        XCTAssertTrue(binder.configBlock(view, column("b"), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 2)
        XCTAssertTrue(binder.configBlock(view, column("c"), nil))
        XCTAssertTrue(binder.configBlock(view, column("a"), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 0)
        XCTAssertEqual(values, ["b", "c"])
    }

    func testTreeCallbackIsOneNativeArrayAndEchoComparisonUsesPaths() {
        let view = TreeWheelHostView(frame: .zero)
        let binder = bindings(TreeWheelHostView.self)
        var values: [[String]] = []
        binder.changeBlock(view, SCValdiFunctionWithBlock { marshaller in
            XCTAssertEqual(SCValdiMarshallerGetCount(marshaller), 1)
            XCTAssertFalse(SCValdiMarshallerIsString(marshaller, 0))
            values.append(SCValdiMarshallerGetUntyped(marshaller, 0) as! [String])
            return false
        })
        XCTAssertTrue(binder.configBlock(view, tree(["a", "a1"]), nil))
        XCTAssertTrue(values.isEmpty)
        select(1, in: view)
        select(2, in: view)
        XCTAssertEqual(values, [["b", "b1"], ["c"]])
        XCTAssertTrue(binder.configBlock(view, tree(["b", "b1"]), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 2)
        XCTAssertTrue(binder.configBlock(view, tree(["c"]), nil))
        XCTAssertTrue(binder.configBlock(view, tree(["a", "a2"]), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 1), 1)
        XCTAssertEqual(values.count, 2)
    }

    func testTimeBindingAndNumericValidation() {
        let view = TimeWheelHostView(frame: .zero)
        let binder = bindings(TimeWheelHostView.self)
        var values: [String] = []
        binder.changeBlock(view, SCValdiFunctionWithBlock { marshaller in
            values.append(SCValdiMarshallerGetString(marshaller, 0))
            return false
        })
        let config: [String: Any] = ["mode": "year", "value": "2024", "minYear": 2020, "maxYear": 2030]
        XCTAssertTrue(binder.configBlock(view, config, nil))
        XCTAssertTrue(values.isEmpty)
        select(5, in: view)
        XCTAssertEqual(values, ["2025"])
        for year in [Double.nan, .infinity, 2020.5, 999.0, 10000.0] {
            var invalid = config
            invalid["minYear"] = year
            XCTAssertFalse(binder.configBlock(view, invalid, nil))
            XCTAssertFalse(view.hasConfig)
        }
        XCTAssertTrue(binder.configBlock(view, config, nil))
        XCTAssertEqual(values, ["2025"])
    }

    func testResetAndInvalidConfigDiscardOldEchoesAndCallbacks() {
        let view = ColumnWheelView(frame: .zero)
        let binder = bindings(ColumnWheelView.self)
        var calls = 0
        let callback = SCValdiFunctionWithBlock { _ in calls += 1; return false }
        binder.changeBlock(view, callback)
        XCTAssertTrue(binder.configBlock(view, column("a"), nil))
        select(1, in: view)
        binder.configReset(view, nil)
        XCTAssertFalse(view.hasConfig)
        XCTAssertFalse(view.isUserInteractionEnabled)
        view.emit("stale")
        XCTAssertEqual(calls, 1)
        XCTAssertTrue(binder.configBlock(view, column("b"), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 1)
        select(2, in: view)
        XCTAssertFalse(binder.configBlock(view, ["options": "bad"], nil))
        view.emit("stale")
        XCTAssertEqual(calls, 2)
        XCTAssertTrue(binder.configBlock(view, column("c"), nil))
        XCTAssertEqual(picker(in: view).selectedRow(inComponent: 0), 2)
        binder.changeReset(view)
        select(0, in: view)
        XCTAssertEqual(calls, 2)
        binder.changeBlock(view, callback)
        XCTAssertTrue(binder.configBlock(view, column("a"), nil))
        select(1, in: view)
        XCTAssertEqual(calls, 3)
    }

    func testRegistrationNamesRemainStable() {
        XCTAssertTrue(NSClassFromString("VRColumnWheelView") === ColumnWheelView.self)
        XCTAssertTrue(NSClassFromString("VRTimeWheelView") === TimeWheelHostView.self)
        XCTAssertTrue(NSClassFromString("VRTreeWheelView") === TreeWheelHostView.self)
    }
}
