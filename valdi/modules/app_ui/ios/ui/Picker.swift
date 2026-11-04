// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/Picker.swift (ColumnPicker, TimePicker and the tree wheel;
// the tree pickers' sheet and page hosts left out). The wheels are also embedded in Valdi pages (WheelViews.swift).
import UIKit

public struct PickerOption: Equatable {
  public let value: String
  public let label: String
  public init(_ value: String, label: String? = nil) { self.value = value; self.label = label ?? value }
}

public enum TimePickMode { case year, yearMonth, date, time, datetime }

public struct TreeNode: Equatable {
  public let value: String
  public let label: String
  public let children: [TreeNode]
  public init(_ value: String, label: String? = nil, children: [TreeNode] = []) {
    self.value = value; self.label = label ?? value; self.children = children
  }
}

public final class ColumnPicker: UIView {
  public var title: String? { get { sheet.title } set { sheet.title = newValue } }
  public var message: String? { get { sheet.message } set { sheet.message = newValue } }
  public var options: [PickerOption] = [] { didSet { if !sheet.open { apply(options: options, value: value) } } }
  public var value: String = "" { didSet { if !sheet.open { apply(options: options, value: value) } } }
  public var cancelText = "取消" { didSet { updateActions() } }
  public var confirmText = "确定" { didSet { updateActions() } }
  public var onConfirm: (String) -> Void = { _ in }
  public var onOpenChange: (Bool, SheetDismissReason) -> Void {
    get { sheet.onOpenChange } set { sheet.onOpenChange = newValue }
  }
  /// Reports actual dismissal, including navigation and unmount cleanup.
  public var onClosed: (OverlayCloseReason) -> Void { get { sheet.onClosed } set { sheet.onClosed = newValue } }
  public var open: Bool {
    get { sheet.open }
    set {
      if newValue { apply(options: options, value: value) }
      sheet.open = newValue
    }
  }
  private let sheet = BottomSheet()
  private let wheel = WheelView(columns: [[]], values: [""])
  private var draft = ""

  public override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false
    updateActions()
    wheel.onChange = { [weak self] values in self?.draft = values[0] }
    sheet.content.addArrangedSubview(wheel)
    embed(sheet)
  }

  private func apply(options: [PickerOption], value: String) {
    draft = options.first(where: { $0.value == value })?.value ?? options.first?.value ?? ""
    wheel.reload(columns: [options], values: [draft])
  }

  private func updateActions() {
    sheet.footer = PopupActionButtons(cancelText: cancelText, confirmText: confirmText,
      onCancel: { [weak self] in
        guard let self else { return }
        self.onOpenChange(false, .cancel)
        self.open = false
      }, onConfirm: { [weak self] in
        guard let self else { return }
        self.onConfirm(self.draft)
        self.open = false
      })
  }

  // The public picker is a full-page host. Only its presented child may consume touches.
  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

public final class TimePicker: UIView {
  public var title: String? { get { sheet.title } set { sheet.title = newValue } }
  public var message: String? { get { sheet.message } set { sheet.message = newValue } }
  public var mode: TimePickMode = .datetime { didSet { if !sheet.open { apply() } } }
  public var value: String = "" { didSet { if !sheet.open { apply() } } }
  public var minYear: Int?
  public var maxYear: Int?
  public var cancelText = "取消" { didSet { updateActions() } }
  public var confirmText = "确定" { didSet { updateActions() } }
  public var onConfirm: (String) -> Void = { _ in }
  public var onOpenChange: (Bool, SheetDismissReason) -> Void {
    get { sheet.onOpenChange } set { sheet.onOpenChange = newValue }
  }
  /// Reports actual dismissal, including navigation and unmount cleanup.
  public var onClosed: (OverlayCloseReason) -> Void { get { sheet.onClosed } set { sheet.onClosed = newValue } }
  public var open: Bool {
    get { sheet.open }
    set {
      if newValue { apply() }
      sheet.open = newValue
    }
  }
  private let sheet = BottomSheet()
  private let wheel = TimeWheelView(mode: .datetime, value: "", minYear: 2000, maxYear: 2100)
  private var draft = ""

  public override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false
    sheet.iconName = "calendar"
    updateActions()
    wheel.onChange = { [weak self] value in self?.draft = value }
    sheet.content.addArrangedSubview(wheel)
    embed(sheet)
  }

  private func apply() {
    let year = Calendar.current.component(.year, from: Date())
    wheel.configure(mode: mode, value: value, minYear: minYear ?? year - 5, maxYear: maxYear ?? year + 5)
    draft = formatTime(mode, clamp(parseTime(value), wheel.minYear, wheel.maxYear))
  }

  private func updateActions() {
    sheet.footer = PopupActionButtons(cancelText: cancelText, confirmText: confirmText,
      onCancel: { [weak self] in
        guard let self else { return }
        self.onOpenChange(false, .cancel)
        self.open = false
      }, onConfirm: { [weak self] in
        guard let self else { return }
        self.onConfirm(self.draft)
        self.open = false
      })
  }

  // The public picker is a full-page host. Only its presented child may consume touches.
  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

extension UIView {
  fileprivate func embed(_ overlay: UIView) {
    addSubview(overlay)
    NSLayoutConstraint.activate([
      overlay.topAnchor.constraint(equalTo: topAnchor), overlay.bottomAnchor.constraint(equalTo: bottomAnchor),
      overlay.leadingAnchor.constraint(equalTo: leadingAnchor), overlay.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }
}

@MainActor
final class WheelView: UIView, UIPickerViewDataSource, UIPickerViewDelegate {
  var onChange: ([String]) -> Void = { _ in }
  private var columns: [[PickerOption]]
  private var values: [String]
  private let picker = UIPickerView()

  init(columns: [[PickerOption]], values: [String]) {
    self.columns = columns
    self.values = values
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    picker.dataSource = self
    picker.delegate = self
    picker.translatesAutoresizingMaskIntoConstraints = false
    picker.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    addSubview(picker)
    let preferredHeight = heightAnchor.constraint(equalToConstant: 200)
    preferredHeight.priority = UILayoutPriority(740)
    NSLayoutConstraint.activate([
      preferredHeight,
      heightAnchor.constraint(greaterThanOrEqualToConstant: 100),
      picker.topAnchor.constraint(equalTo: topAnchor), picker.bottomAnchor.constraint(equalTo: bottomAnchor),
      picker.leadingAnchor.constraint(equalTo: leadingAnchor), picker.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    select(animated: false)
  }

  func reload(columns: [[PickerOption]], values: [String]) {
    self.columns = columns
    self.values = values
    picker.reloadAllComponents()
    select(animated: false)
  }

  func numberOfComponents(in pickerView: UIPickerView) -> Int { columns.count }
  func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { columns[component].count }
  func pickerView(_ pickerView: UIPickerView, widthForComponent component: Int) -> CGFloat { equalComponentWidth(in: pickerView, count: columns.count) }
  func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat { 40 }
  func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
    centeredPickerLabel(columns[component][row].label, reusing: view)
  }
  func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
    values[component] = columns[component][row].value
    onChange(values)
  }

  private func select(animated: Bool) {
    for (index, column) in columns.enumerated() {
      if let row = column.firstIndex(where: { $0.value == values[safe: index] }) {
        picker.selectRow(row, inComponent: index, animated: animated)
      }
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

@MainActor
final class TimeWheelView: UIView, UIPickerViewDataSource, UIPickerViewDelegate {
  var onChange: (String) -> Void = { _ in }
  private(set) var mode: TimePickMode
  private(set) var minYear: Int
  private(set) var maxYear: Int
  private var parts: TimeParts
  private let picker = UIPickerView()
  private let timePicker = UIPickerView()
  private let segments = UIView()
  private let selection = UIView()
  private let dateButton = UIButton(type: .custom)
  private let timeButton = UIButton(type: .custom)
  private var pickerHeight: NSLayoutConstraint!
  private var pickerTop: NSLayoutConstraint!
  private var selectionLeft: NSLayoutConstraint!
  private let segmentInset: CGFloat = 2
  private var segmentWidth: CGFloat = 0
  private var activeSegment = 0

  private func wheelMode(for view: UIPickerView) -> TimePickMode {
    mode == .datetime ? (view === timePicker ? .time : .date) : mode
  }

  init(mode: TimePickMode, value: String, minYear: Int, maxYear: Int) {
    self.mode = mode
    self.minYear = minYear
    self.maxYear = maxYear
    self.parts = clamp(parseTime(value), minYear, maxYear)
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    for wheel in [picker, timePicker] {
      wheel.dataSource = self
      wheel.delegate = self
      wheel.translatesAutoresizingMaskIntoConstraints = false
      wheel.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
      addSubview(wheel)
    }
    segments.translatesAutoresizingMaskIntoConstraints = false
    segments.backgroundColor = UiTheme.subtle
    segments.layer.cornerRadius = UiDesign.radius.control
    segments.layer.cornerCurve = .continuous
    segments.clipsToBounds = true
    addSubview(segments)
    selection.translatesAutoresizingMaskIntoConstraints = false
    selection.backgroundColor = UiTheme.surface
    selection.layer.cornerRadius = max(0, UiDesign.radius.control - segmentInset)
    selection.layer.cornerCurve = .continuous
    selection.clipsToBounds = true
    segments.addSubview(selection)
    for button in [dateButton, timeButton] {
      button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
      button.titleLabel?.lineBreakMode = .byTruncatingTail
    }
    dateButton.addAction(UIAction { [weak self] _ in self?.selectSegment(0) }, for: .touchUpInside)
    timeButton.addAction(UIAction { [weak self] _ in self?.selectSegment(1) }, for: .touchUpInside)
    let buttons = UIStackView(arrangedSubviews: [dateButton, timeButton])
    buttons.axis = .horizontal
    buttons.distribution = .fillEqually
    buttons.translatesAutoresizingMaskIntoConstraints = false
    segments.addSubview(buttons)
    selectionLeft = selection.leadingAnchor.constraint(equalTo: segments.leadingAnchor, constant: segmentInset)
    pickerHeight = heightAnchor.constraint(equalToConstant: 244)
    pickerHeight.priority = UILayoutPriority(740)
    pickerTop = picker.topAnchor.constraint(equalTo: topAnchor, constant: 44)
    NSLayoutConstraint.activate([
      pickerHeight, pickerTop,
      heightAnchor.constraint(greaterThanOrEqualToConstant: 120),
      segments.topAnchor.constraint(equalTo: topAnchor), segments.heightAnchor.constraint(equalToConstant: 40),
      segments.leadingAnchor.constraint(equalTo: leadingAnchor), segments.trailingAnchor.constraint(equalTo: trailingAnchor),
      selectionLeft, selection.topAnchor.constraint(equalTo: segments.topAnchor, constant: segmentInset),
      selection.bottomAnchor.constraint(equalTo: segments.bottomAnchor, constant: -segmentInset),
      selection.widthAnchor.constraint(equalTo: segments.widthAnchor, multiplier: 0.5, constant: -segmentInset),
      buttons.topAnchor.constraint(equalTo: segments.topAnchor, constant: segmentInset),
      buttons.bottomAnchor.constraint(equalTo: segments.bottomAnchor, constant: -segmentInset),
      buttons.leadingAnchor.constraint(equalTo: segments.leadingAnchor, constant: segmentInset),
      buttons.trailingAnchor.constraint(equalTo: segments.trailingAnchor, constant: -segmentInset),
      picker.bottomAnchor.constraint(equalTo: bottomAnchor),
      picker.leadingAnchor.constraint(equalTo: leadingAnchor), picker.trailingAnchor.constraint(equalTo: trailingAnchor),
      timePicker.topAnchor.constraint(equalTo: picker.topAnchor), timePicker.bottomAnchor.constraint(equalTo: picker.bottomAnchor),
      timePicker.leadingAnchor.constraint(equalTo: leadingAnchor), timePicker.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    reload(animated: false)
  }

  /// The selection, formatted for `mode`.
  var value: String { formatTime(mode, parts) }

  func configure(mode: TimePickMode, value: String, minYear: Int, maxYear: Int) {
    self.mode = mode
    self.minYear = minYear
    self.maxYear = maxYear
    parts = clamp(parseTime(value), minYear, maxYear)
    activeSegment = 0
    reload(animated: false)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let width = max(0, (segments.bounds.width - segmentInset * 2) / 2)
    if width != segmentWidth {
      segmentWidth = width
      selectionLeft.constant = segmentInset + width * CGFloat(activeSegment)
    }
  }

  private func columns(for view: UIPickerView) -> [[PickerOption]] { timeColumns(wheelMode(for: view), parts, minYear, maxYear) }

  func numberOfComponents(in pickerView: UIPickerView) -> Int { columns(for: pickerView).count }
  func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { columns(for: pickerView)[component].count }
  func pickerView(_ pickerView: UIPickerView, widthForComponent component: Int) -> CGFloat { equalComponentWidth(in: pickerView, count: columns(for: pickerView).count) }
  func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat { 40 }
  func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
    centeredPickerLabel(columns(for: pickerView)[component][row].label, reusing: view)
  }
  func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
    parts = clamp(applyColumn(wheelMode(for: pickerView), parts, component, columns(for: pickerView)[component][row].value), minYear, maxYear)
    reload(animated: false, source: pickerView)
    onChange(formatTime(mode, parts))
  }

  private func reload(animated: Bool, source: UIPickerView? = nil) {
    segments.isHidden = mode != .datetime
    pickerHeight.constant = mode == .datetime ? 244 : 200
    pickerTop.constant = mode == .datetime ? 44 : 0
    dateButton.setTitle("日期  " + formatTime(.date, parts), for: .normal)
    timeButton.setTitle("时间  " + formatTime(.time, parts), for: .normal)
    for wheel in [picker, timePicker] {
      if wheel === timePicker && mode != .datetime { continue }
      if let source, wheel !== source { continue }
      wheel.reloadAllComponents()
      let options = columns(for: wheel)
      for (index, value) in selectedValues(wheelMode(for: wheel), parts).enumerated() {
        if let row = options[index].firstIndex(where: { $0.value == value }) {
          wheel.selectRow(row, inComponent: index, animated: animated)
        }
      }
    }
    updateSegments(animated: false)
  }

  private func updateSegments(animated: Bool) {
    picker.isHidden = mode == .datetime && activeSegment != 0
    timePicker.isHidden = mode != .datetime || activeSegment != 1
    for (index, button) in [dateButton, timeButton].enumerated() {
      let selected = index == activeSegment
      let color = selected ? UiTheme.primary : UiTheme.muted
      button.setTitleColor(color, for: .normal)
      button.setTitleColor(color, for: .highlighted)
      button.accessibilityTraits = selected ? [.button, .selected] : [.button]
    }
    selectionLeft.constant = segmentInset + segmentWidth * CGFloat(activeSegment)
    if animated && !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction]) {
        self.segments.layoutIfNeeded()
      }
    } else {
      segments.layoutIfNeeded()
    }
  }

  private func selectSegment(_ next: Int) {
    guard mode == .datetime, next != activeSegment else { return }
    segments.layoutIfNeeded()
    activeSegment = next
    updateSegments(animated: true)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

@MainActor
final class TreeWheelView: UIView, UIPickerViewDataSource, UIPickerViewDelegate {
  var onChange: ([String]) -> Void = { _ in }
  private var data: [TreeNode]
  private(set) var path: [String]
  private var maxColumns: Int
  private let picker = UIPickerView()
  private var pickerHeight: NSLayoutConstraint!
  private var lastWidth: CGFloat = 0

  init(data: [TreeNode], path: [String], maxColumns: Int = 3) {
    self.data = data
    self.maxColumns = maxColumns
    self.path = normalizePath(data, path, maxColumns)
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    picker.dataSource = self
    picker.delegate = self
    picker.translatesAutoresizingMaskIntoConstraints = false
    picker.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    addSubview(picker)
    pickerHeight = heightAnchor.constraint(equalToConstant: 200)
    pickerHeight.priority = UILayoutPriority(740)
    NSLayoutConstraint.activate([
      pickerHeight,
      heightAnchor.constraint(greaterThanOrEqualToConstant: 100),
      picker.topAnchor.constraint(equalTo: topAnchor), picker.bottomAnchor.constraint(equalTo: bottomAnchor),
      picker.leadingAnchor.constraint(equalTo: leadingAnchor), picker.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    reload(animated: false)
  }

  func configure(data: [TreeNode], path: [String], maxColumns: Int) {
    self.data = data
    self.maxColumns = maxColumns
    self.path = normalizePath(data, path, maxColumns)
    reload(animated: false)
  }

  func setRows(_ rows: Int) {
    pickerHeight.constant = CGFloat(40 * rows)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, bounds.width != lastWidth else { return }
    lastWidth = bounds.width
    picker.reloadAllComponents()
    for (index, value) in path.enumerated() {
      if let row = columns[index].firstIndex(where: { $0.value == value }) {
        picker.selectRow(row, inComponent: index, animated: false)
      }
    }
  }

  private var columns: [[PickerOption]] { treeColumns(data, path, maxColumns) }

  func numberOfComponents(in pickerView: UIPickerView) -> Int { columns.count }
  func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { columns[component].count }
  func pickerView(_ pickerView: UIPickerView, widthForComponent component: Int) -> CGFloat { equalComponentWidth(in: pickerView, count: columns.count) }
  func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat { 40 }
  func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
    centeredPickerLabel(columns[component][row].label, reusing: view)
  }
  func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
    path = replacePath(data, path, component, columns[component][row].value, maxColumns)
    reload(animated: false)
    onChange(path)
  }

  private func reload(animated: Bool) {
    picker.reloadAllComponents()
    for (index, value) in path.enumerated() {
      if let row = columns[index].firstIndex(where: { $0.value == value }) {
        picker.selectRow(row, inComponent: index, animated: animated)
      }
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

private struct TimeParts { var year: Int; var month: Int; var day: Int; var hour: Int; var minute: Int }

private func pad(_ value: Int) -> String { String(format: "%02d", value) }

private func daysInMonth(_ year: Int, _ month: Int) -> Int {
  Calendar.current.range(of: .day, in: .month, for: Calendar.current.date(from: DateComponents(year: year, month: month))!)?.count ?? 30
}

private func parseTime(_ value: String?) -> TimeParts {
  let now = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: Date())
  let fallback = TimeParts(year: now.year!, month: now.month!, day: now.day!, hour: now.hour!, minute: now.minute!)
  guard let value else { return fallback }
  let date = value.prefix(10)
  if date.count == 10, let year = Int(date.prefix(4)), let month = Int(date.dropFirst(5).prefix(2)), let day = Int(date.suffix(2)) {
    let time = value.count >= 16 ? String(value.suffix(5)) : nil
    return TimeParts(year: year, month: month, day: day,
                     hour: time.flatMap { Int($0.prefix(2)) } ?? fallback.hour,
                     minute: time.flatMap { Int($0.suffix(2)) } ?? fallback.minute)
  }
  if value.count == 7, let year = Int(value.prefix(4)), let month = Int(value.suffix(2)) {
    return TimeParts(year: year, month: month, day: fallback.day, hour: fallback.hour, minute: fallback.minute)
  }
  if value.count == 4, let year = Int(value) {
    return TimeParts(year: year, month: fallback.month, day: fallback.day, hour: fallback.hour, minute: fallback.minute)
  }
  if value.count == 5, let hour = Int(value.prefix(2)), let minute = Int(value.suffix(2)) {
    return TimeParts(year: fallback.year, month: fallback.month, day: fallback.day, hour: hour, minute: minute)
  }
  return fallback
}

private func formatTime(_ mode: TimePickMode, _ parts: TimeParts) -> String {
  let date = "\(parts.year)-\(pad(parts.month))-\(pad(parts.day))"
  let time = "\(pad(parts.hour)):\(pad(parts.minute))"
  switch mode {
  case .year: return "\(parts.year)"
  case .yearMonth: return "\(parts.year)-\(pad(parts.month))"
  case .date: return date
  case .time: return time
  case .datetime: return "\(date) \(time)"
  }
}

private func clamp(_ parts: TimeParts, _ minYear: Int, _ maxYear: Int) -> TimeParts {
  var next = parts
  next.year = min(maxYear, max(minYear, parts.year))
  next.month = min(12, max(1, parts.month))
  next.day = min(daysInMonth(next.year, next.month), max(1, parts.day))
  return next
}

private func timeColumns(_ mode: TimePickMode, _ parts: TimeParts, _ minYear: Int, _ maxYear: Int) -> [[PickerOption]] {
  let years = (minYear...maxYear).map { PickerOption(String($0), label: "\($0)年") }
  let months = (1...12).map { PickerOption(String($0), label: "\($0)月") }
  let days = (1...daysInMonth(parts.year, parts.month)).map { PickerOption(String($0), label: "\($0)日") }
  let hours = (0...23).map { PickerOption(String($0), label: pad($0) + "时") }
  let minutes = (0...59).map { PickerOption(String($0), label: pad($0) + "分") }
  switch mode {
  case .year: return [years]
  case .yearMonth: return [years, months]
  case .date: return [years, months, days]
  case .time: return [hours, minutes]
  case .datetime: return [years, months, days, hours, minutes]
  }
}

private func selectedValues(_ mode: TimePickMode, _ parts: TimeParts) -> [String] {
  switch mode {
  case .year: return [String(parts.year)]
  case .yearMonth: return [String(parts.year), String(parts.month)]
  case .date: return [String(parts.year), String(parts.month), String(parts.day)]
  case .time: return [String(parts.hour), String(parts.minute)]
  case .datetime: return [String(parts.year), String(parts.month), String(parts.day), String(parts.hour), String(parts.minute)]
  }
}

private func applyColumn(_ mode: TimePickMode, _ parts: TimeParts, _ index: Int, _ value: String) -> TimeParts {
  var next = parts
  let parsed = Int(value) ?? 0
  if mode == .time {
    if index == 0 { next.hour = parsed } else { next.minute = parsed }
  } else if index == 0 { next.year = parsed }
  else if index == 1 { next.month = parsed }
  else if index == 2 { next.day = parsed }
  else if index == 3 { next.hour = parsed }
  else { next.minute = parsed }
  return next
}


private func treeColumns(_ data: [TreeNode], _ path: [String], _ maxColumns: Int = 3) -> [[PickerOption]] {
  var columns: [[PickerOption]] = []
  var level = data
  var depth = 0
  while !level.isEmpty && columns.count < maxColumns {
    columns.append(level.map { PickerOption($0.value, label: $0.label) })
    guard let selected = level.first(where: { $0.value == path[safe: depth] }) else { break }
    depth += 1
    level = selected.children
  }
  return columns
}

private func normalizePath(_ data: [TreeNode], _ path: [String], _ maxColumns: Int = 3) -> [String] {
  var next: [String] = []
  var level = data
  var depth = 0
  while !level.isEmpty && next.count < maxColumns {
    let selected = level.first(where: { $0.value == path[safe: depth] }) ?? level[0]
    next.append(selected.value)
    depth += 1
    level = selected.children
  }
  return next
}

private func replacePath(_ data: [TreeNode], _ path: [String], _ index: Int, _ value: String, _ maxColumns: Int = 3) -> [String] {
  normalizePath(data, Array(path.prefix(index)) + [value], maxColumns)
}

private func equalComponentWidth(in pickerView: UIPickerView, count: Int) -> CGFloat {
  pickerView.bounds.width / CGFloat(max(count, 1))
}

private func centeredPickerLabel(_ text: String, reusing view: UIView?) -> UILabel {
  let label = (view as? UILabel) ?? UILabel()
  label.text = text
  label.textAlignment = .center
  label.font = .systemFont(ofSize: UiDesign.font.control, weight: .semibold)
  label.adjustsFontSizeToFitWidth = true
  label.minimumScaleFactor = 0.65
  label.lineBreakMode = .byTruncatingTail
  label.backgroundColor = .clear
  return label
}

private extension Array {
  subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
