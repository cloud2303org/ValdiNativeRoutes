import UIKit
import ValdiRuntime

/// The native wheels a Valdi page embeds with `<custom-view>` (WheelPickers.tsx), drawn by NativeRoutesUI as in
/// the presented pickers. `config` is a generated object, checked and normalized in TS (schemas.ts); `onChange` gets a string or path array
/// only when the user settles the wheel, never while attributes are applied. A value the page passes back unchanged
/// leaves the wheel as is, and so does one it passes back late, after the wheel has moved on (isEcho).
/// Valdi binds each class's own attributes, so the subclasses inherit these two.
class ValdiWheelView: UIView {
    private var onChange: (any SCValdiFunction)?
    /// What emit sent that the page hasn't rendered back yet. The page passes each one back a JS round trip later; a
    /// wheel turned through several rows meanwhile would be sent back to an earlier row by it.
    private enum Selection: Equatable {
        case value(String)
        case path([String])
    }
    private var unechoed: [Selection] = []
    private var echoed: Selection?
    private(set) var hasConfig = false

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

    func apply(_ config: Any?) -> Bool { false }

    /// A recycled/invalid config must not retain pending echoes or emit old selections.
    func resetConfig() {
        hasConfig = false
        clearEchoes()
        isUserInteractionEnabled = false
    }

    private func clearEchoes() {
        unechoed.removeAll()
        echoed = nil
    }

    func emit(_ value: String) { emit(.value(value)) }
    func emit(_ path: [String]) { emit(.path(path)) }

    private func emit(_ selection: Selection) {
        guard hasConfig, let onChange else { return }
        unechoed.append(selection)
        let marshaller = SCValdiMarshallerCreate()
        defer { SCValdiMarshallerDestroy(marshaller) }
        switch selection {
        case .value(let value):
            SCValdiMarshallerPushString(marshaller, value)
        case .path(let path):
            let array = SCValdiMarshallerPushArray(marshaller, path.count)
            for (index, value) in path.enumerated() {
                SCValdiMarshallerPushString(marshaller, value)
                SCValdiMarshallerSetArrayItem(marshaller, array, index)
            }
        }
        SCValdiFunctionSafePerform(onChange, marshaller)
    }

    /// Whether `value` (as emit sends it) is the page rendering back one of the wheel's own selections, which the wheel
    /// shows already or has turned past; apply then leaves the wheel as is. Any other value is the page's own, which the
    /// wheel follows.
    func isEcho(_ value: String) -> Bool { isEcho(.value(value)) }
    func isEcho(_ path: [String]) -> Bool { isEcho(.path(path)) }

    private func isEcho(_ value: Selection) -> Bool {
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
        attributesBinder.bindAttribute("config", invalidateLayoutOnChange: false, withUntypedBlock: { view, value, _ in
            guard let view = view as? ValdiWheelView else { return false }
            guard view.apply(value) else {
                view.resetConfig()
                return false
            }
            view.hasConfig = true
            view.isUserInteractionEnabled = true
            return true
        }, resetBlock: { view, _ in
            (view as? ValdiWheelView)?.resetConfig()
        })
        attributesBinder.bindAttribute("onChange", withFunctionBlock: { view, function in
            (view as? ValdiWheelView)?.onChange = function
        }, resetBlock: { view in
            guard let view = view as? ValdiWheelView else { return }
            view.onChange = nil
            view.clearEchoes()
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

    override func apply(_ config: Any?) -> Bool {
        guard let config = try? VRWheelObjectBinding.decode(config, as: VRColumnWheelConfig.self) as? VRColumnWheelConfig
        else { return false }
        let options = config.options.map { PickerOption($0.value, label: $0.label) }
        let requested = config.value
        let echo = isEcho(requested)
        guard options != self.options || (requested != value && !echo) else { return true }
        self.options = options
        if !echo { value = requested }
        wheel.reload(columns: [options], values: [value])
        return true
    }

    override func resetConfig() {
        super.resetConfig()
        options = []
        value = ""
        wheel.reload(columns: [[]], values: [""])
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

    override func apply(_ config: Any?) -> Bool {
        guard let config = try? VRWheelObjectBinding.decode(config, as: VRTimeWheelConfig.self) as? VRTimeWheelConfig
        else { return false }
        let modes: [String: TimePickMode] = ["year": .year, "year-month": .yearMonth, "date": .date, "time": .time,
                                             "datetime": .datetime]
        guard let mode = modes[config.mode],
              let minYear = Int(exactly: config.minYear), let maxYear = Int(exactly: config.maxYear),
              (1000...9999).contains(minYear), (minYear...9999).contains(maxYear) else { return false }
        let requested = config.value
        let echo = isEcho(requested)
        // Reconfiguring would also send a datetime wheel back to its date tab.
        if let configured, configured == (mode, minYear, maxYear), requested == wheel.value || echo { return true }
        configured = (mode, minYear, maxYear)
        wheel.configure(mode: mode, value: echo ? wheel.value : requested, minYear: minYear, maxYear: maxYear)
        return true
    }

    override func resetConfig() {
        super.resetConfig()
        configured = nil
        wheel.configure(mode: .date, value: "", minYear: 2000, maxYear: 2100)
    }
}

/// `{data: [{value, label, children}], value: [String], columns}`; reports the path as a native string array.
@objc(VRTreeWheelView)
final class TreeWheelHostView: ValdiWheelView {
    private let wheel = TreeWheelView(data: [], path: [])
    private var data: [TreeNode] = []
    private var columns = 3

    override init(frame: CGRect) {
        super.init(frame: frame)
        embed(wheel)
        wheel.onChange = { [weak self] path in self?.emit(path) }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func apply(_ config: Any?) -> Bool {
        guard let config = try? VRWheelObjectBinding.decode(config, as: VRTreeWheelConfig.self) as? VRTreeWheelConfig,
              let columns = Int(exactly: config.columns), columns > 0 else { return false }
        func nodes(_ items: [VRWheelTreeNode]) -> [TreeNode] {
            items.map { TreeNode($0.value, label: $0.label, children: nodes($0.children ?? [])) }
        }
        let data = nodes(config.data)
        let requested = config.value
        let echo = isEcho(requested)
        guard data != self.data || columns != self.columns || (requested != wheel.path && !echo) else { return true }
        self.data = data
        self.columns = columns
        wheel.configure(data: data, path: echo ? wheel.path : requested, maxColumns: columns)
        return true
    }

    override func resetConfig() {
        super.resetConfig()
        data = []
        columns = 3
        wheel.configure(data: [], path: [], maxColumns: columns)
    }
}
