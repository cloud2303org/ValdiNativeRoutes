import UIKit
import ValdiRuntime

/// The native wheels a Valdi page embeds with `<custom-view>` (WheelPickers.tsx), drawn by NativeRoutesUI as in
/// the presented pickers. `config` is JSON, checked and normalized in TS (schemas.ts); `onChange` gets the selection as a string
/// only when the user settles the wheel, never while attributes are applied. A value the page passes back unchanged
/// leaves the wheel as is, and so does one it passes back late, after the wheel has moved on (isEcho).
/// Valdi binds each class's own attributes, so the subclasses inherit these two.
class ValdiWheelView: UIView {
    private var onChange: (any SCValdiFunction)?
    /// What emit sent that the page hasn't rendered back yet. The page passes each one back a JS round trip later; a
    /// wheel turned through several rows meanwhile would be sent back to an earlier row by it.
    private var unechoed: [String] = []
    private var echoed: String?

    override init(frame: CGRect) {
        super.init(frame: frame)
        // Valdi pages are light only.
        overrideUserInterfaceStyle = .light
    }

    required init?(coder: NSCoder) { fatalError() }

    /// Fills the view with the wheel, which sizes itself with constraints.
    func embed(_ wheel: UIView) {
        addSubview(wheel)
        NSLayoutConstraint.activate([
            wheel.topAnchor.constraint(equalTo: topAnchor), wheel.bottomAnchor.constraint(equalTo: bottomAnchor),
            wheel.leadingAnchor.constraint(equalTo: leadingAnchor), wheel.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
    }

    func apply(_ config: [String: Any]) {}

    func emit(_ value: String) {
        guard let onChange else { return }
        unechoed.append(value)
        let marshaller = SCValdiMarshallerCreate()
        SCValdiMarshallerPushString(marshaller, value)
        // As SCValdiIndexPicker. Written when the Valdi framework didn't export SCValdiFunctionSafePerform; ValdiRuntime
        // does (valdi/.bazelrc), so it could be used now.
        onChange.perform(with: marshaller)
        SCValdiMarshallerDestroy(marshaller)
    }

    /// Whether `value` (as emit sends it) is the page rendering back one of the wheel's own selections, which the wheel
    /// shows already or has turned past; apply then leaves the wheel as is. Any other value is the page's own, which the
    /// wheel follows.
    func isEcho(_ value: String) -> Bool {
        if let index = unechoed.firstIndex(of: value) {
            unechoed.removeFirst(index + 1)
            echoed = value
            return true
        }
        // The page rendering again, for another reason, the last value it took from the wheel, while newer ones are on
        // their way.
        if value == echoed && !unechoed.isEmpty { return true }
        unechoed.removeAll()
        echoed = nil
        return false
    }

    override class func bindAttributes(_ attributesBinder: any SCValdiAttributesBinderProtocol) {
        attributesBinder.bindAttribute("config", invalidateLayoutOnChange: false, withStringBlock: { view, value, _ in
            guard let view = view as? ValdiWheelView, let value,
                  let config = (try? JSONSerialization.jsonObject(with: Data(value.utf8))) as? [String: Any] else { return false }
            view.apply(config)
            return true
        }, resetBlock: { _, _ in })
        attributesBinder.bindAttribute("onChange", withFunctionBlock: { view, function in
            (view as? ValdiWheelView)?.onChange = function
        }, resetBlock: { view in
            (view as? ValdiWheelView)?.onChange = nil
        })
    }
}

/// `{options: [{value, label}], value}`; reports the chosen value.
@objc(VRColumnWheelView)
final class ColumnWheelView: ValdiWheelView {
    private let wheel = WheelView(columns: [[]], values: [""])
    private var options: [PickerOption] = []
    private var value = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        embed(wheel)
        wheel.onChange = { [weak self] values in
            guard let self, let next = values.first, next != value else { return }
            value = next
            emit(next)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func apply(_ config: [String: Any]) {
        let options = (config["options"] as? [[String: Any]] ?? []).compactMap { item -> PickerOption? in
            guard let value = item["value"] as? String else { return nil }
            return PickerOption(value, label: item["label"] as? String)
        }
        let requested = config["value"] as? String ?? ""
        let echo = isEcho(requested)
        guard options != self.options || (requested != value && !echo) else { return }
        self.options = options
        if !echo { value = requested }
        wheel.reload(columns: [options], values: [value])
    }
}

/// `{mode, value, minYear, maxYear}` with the modes of api.showDatePicker; reports the formatted value.
@objc(VRTimeWheelView)
final class TimeWheelHostView: ValdiWheelView {
    private let wheel = TimeWheelView(mode: .date, value: "", minYear: 2000, maxYear: 2100)
    private var configured: (mode: TimePickMode, minYear: Int, maxYear: Int)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        embed(wheel)
        wheel.onChange = { [weak self] value in self?.emit(value) }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func apply(_ config: [String: Any]) {
        let modes: [String: TimePickMode] = ["year": .year, "year-month": .yearMonth, "date": .date, "time": .time,
                                             "datetime": .datetime]
        let mode = modes[config["mode"] as? String ?? ""] ?? .date
        let year = Calendar.current.component(.year, from: Date())
        let minYear = config["minYear"] as? Int ?? year - 5
        let maxYear = config["maxYear"] as? Int ?? year + 5
        let requested = config["value"] as? String ?? ""
        let echo = isEcho(requested)
        // Reconfiguring would also send a datetime wheel back to its date tab.
        if let configured, configured == (mode, minYear, maxYear), requested == wheel.value || echo { return }
        configured = (mode, minYear, maxYear)
        wheel.configure(mode: mode, value: echo ? wheel.value : requested, minYear: minYear, maxYear: maxYear)
    }
}

/// `{data: [{value, label, children}], value: [String], columns}`; reports the path as a JSON array.
@objc(VRTreeWheelView)
final class TreeWheelHostView: ValdiWheelView {
    private let wheel = TreeWheelView(data: [], path: [])
    private var data: [TreeNode] = []
    private var columns = 3

    override init(frame: CGRect) {
        super.init(frame: frame)
        embed(wheel)
        wheel.onChange = { [weak self] path in self?.emit(Self.json(path)) }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func apply(_ config: [String: Any]) {
        func nodes(_ value: Any?) -> [TreeNode] {
            (value as? [[String: Any]] ?? []).compactMap { item in
                guard let value = item["value"] as? String else { return nil }
                return TreeNode(value, label: item["label"] as? String, children: nodes(item["children"]))
            }
        }
        let data = nodes(config["data"])
        let columns = config["columns"] as? Int ?? 3
        let requested = config["value"] as? [String] ?? []
        let echo = isEcho(Self.json(requested))
        guard data != self.data || columns != self.columns || (requested != wheel.path && !echo) else { return }
        self.data = data
        self.columns = columns
        wheel.configure(data: data, path: echo ? wheel.path : requested, maxColumns: columns)
    }

    private static func json(_ path: [String]) -> String {
        String(data: try! JSONSerialization.data(withJSONObject: path), encoding: .utf8)!
    }
}
