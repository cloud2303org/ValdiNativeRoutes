import UIKit
import XCTest

/// Compiles the actual UIKit shell, presenter, layout and picker sources.
/// No Valdi runtime or application build is needed by this focused test target.
@MainActor
final class SheetHostMigrationTests: XCTestCase {
  private var window: UIWindow!
  private var root: UIView!
  private var event: ((String) -> Void)?
  private var removals = 0

  override func setUp() {
    super.setUp()
    window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let controller = UIViewController()
    window.rootViewController = controller
    window.makeKeyAndVisible()
    root = controller.view
    root.frame = window.bounds
    removals = 0
    OverlayScope(register: { [weak self] _, _, receive in
      self?.event = receive
      receive("top")
      return true
    }, update: { _, _, _ in }, remove: { [weak self] _ in
      self?.removals += 1
    }).install(on: root)
  }

  override func tearDown() {
    event?("removed")
    event = nil
    window.isHidden = true
    window.rootViewController = nil
    root = nil
    window = nil
    super.tearDown()
  }

  private func attach(_ view: UIView) {
    view.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: root.topAnchor),
      view.bottomAnchor.constraint(equalTo: root.bottomAnchor),
      view.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: root.trailingAnchor),
    ])
    root.layoutIfNeeded()
  }

  private func descendants(_ view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(descendants)
  }

  private func host(_ view: UIView) throws -> AppUISheetHostView {
    try XCTUnwrap(descendants(view).compactMap { $0 as? AppUISheetHostView }.first)
  }

  private func tapScrim(_ host: UIView) throws {
    try XCTUnwrap(host.subviews.compactMap { $0 as? UIControl }.first)
      .sendActions(for: .touchUpInside)
  }

  private func settle(_ host: UIView) async {
    let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      !self.descendants(host).contains { $0.layer.animation(forKey: "sheetSettle") != nil }
    }, object: nil)
    await fulfillment(of: [settled], timeout: 3)
  }

  private func addBody(_ sheet: BottomSheet, height: CGFloat) -> NSLayoutConstraint {
    let body = UIView()
    let constraint = body.heightAnchor.constraint(equalToConstant: height)
    constraint.isActive = true
    sheet.content.addArrangedSubview(body)
    return constraint
  }

  func testEntranceHitTestingTracksRenderedKeyframes() async throws {
    let shell = AppUISheetHostView()
    shell.openHeight = 500
    let content = UIView()
    let button = UIButton(frame: CGRect(x: 20, y: 20, width: 180, height: 90))
    content.addSubview(button)
    shell.setContent(content)
    attach(shell)
    let container = try XCTUnwrap(shell.subviews.first {
      $0.layer.animation(forKey: "sheetSettle") != nil
    })
    let animation = try XCTUnwrap(container.layer.animation(forKey: "sheetSettle") as? CAKeyframeAnimation)
    let values = try XCTUnwrap(animation.values as? [NSNumber])
    var checked = 0
    // Sample the actual render-server keyframes, independently of the shell's
    // analytical hit-test position. The target control is comfortably larger
    // than sub-frame interpolation error.
    for _ in 0..<10 {
      try await Task.sleep(nanoseconds: 15_000_000)
      let elapsed = container.layer.convertTime(CACurrentMediaTime(), from: nil) - animation.beginTime
      let sample = max(0, min(Double(values.count - 1), elapsed / animation.duration * Double(values.count - 1)))
      let index = min(Int(sample), values.count - 2)
      let fraction = sample - Double(index)
      let translation = values[index].doubleValue * (1 - fraction) + values[index + 1].doubleValue * fraction
      var visible = button.convert(CGPoint(x: button.bounds.midX, y: button.bounds.midY), to: shell)
      visible.y += CGFloat(translation) - container.transform.ty
      if shell.bounds.insetBy(dx: 0, dy: 10).contains(visible) {
        XCTAssertTrue(shell.hitTest(visible, with: nil) === button)
        checked += 1
      }
    }
    XCTAssertGreaterThan(checked, 0)
    shell.dismiss(animated: false)
  }

  func testControlledCloseWaitsForSpringAndKeepsShield() async throws {
    let sheet = BottomSheet()
    _ = addBody(sheet, height: 120)
    attach(sheet)
    sheet.open = true
    let shell = try host(sheet)
    await settle(shell)
    var requests = 0
    sheet.onOpenChange = { _, reason in
      if case .gesture = reason { requests += 1 }
    }
    try tapScrim(shell)
    await settle(shell)
    XCTAssertEqual(requests, 1)
    XCTAssertTrue(sheet.open, "A close request is controlled by the caller")
    XCTAssertEqual(removals, 0)
    let closed = expectation(description: "settled close")
    sheet.onClosed = { reason in
      if case .dismissed = reason { closed.fulfill() }
    }
    sheet.onOpenChange = { [weak sheet] value, _ in sheet?.open = value }
    try tapScrim(shell)
    XCTAssertFalse(sheet.open)
    XCTAssertEqual(removals, 0, "Registration survives the exit spring")
    XCTAssertTrue(sheet.hitTest(CGPoint(x: 10, y: 10), with: nil) === sheet)
    await fulfillment(of: [closed], timeout: 3)
    XCTAssertEqual(removals, 1)
    XCTAssertTrue(sheet.isHidden)
  }

  func testCoveredDismissibleAndReopenDuringExit() async throws {
    let sheet = BottomSheet()
    attach(sheet)
    sheet.open = true
    let shell = try host(sheet)
    await settle(shell)
    var requests = 0
    var closes = 0
    sheet.onOpenChange = { _, _ in requests += 1 }
    sheet.onClosed = { _ in closes += 1 }
    event?("covered")
    try tapScrim(shell)
    XCTAssertNil(sheet.hitTest(CGPoint(x: 10, y: 10), with: nil))
    event?("top")
    sheet.dismissible = false
    try tapScrim(shell)
    XCTAssertEqual(requests, 0)
    sheet.open = false // Programmatic dismissal still works when locked.
    sheet.open = true
    await settle(shell)
    XCTAssertEqual(closes, 0)
    XCTAssertEqual(removals, 0)
    XCTAssertFalse(sheet.isHidden)
    sheet.open = false
    event?("removed") // Navigation must interrupt an already-running exit.
    XCTAssertEqual(closes, 1)
    XCTAssertTrue(sheet.isHidden)
    await settle(shell)
    XCTAssertEqual(closes, 1)
  }

  func testContentFitScrollCapListAndIntrinsicResize() async throws {
    for sheet in [BottomSheet(), ScrollBottomSheet(), ListBottomSheet()] {
      let bodyHeight = addBody(sheet, height: 120)
      // A list owns its viewport; its body must be allowed to fill it.
      if sheet is ListBottomSheet { bodyHeight.isActive = false }
      attach(sheet)
      let shell = try host(sheet)
      XCTAssertFalse(descendants(shell).contains { $0.layer.animation(forKey: "sheetSettle") != nil },
                     "A mounted closed overlay must not start a spring")
      sheet.open = true
      await settle(shell)
      let cap = (sheet.bounds.height - sheet.safeAreaInsets.top) * 0.85
      if sheet is ListBottomSheet {
        XCTAssertEqual(shell.openHeight, cap, accuracy: 1)
        XCTAssertFalse(descendants(sheet).contains { $0 is UIScrollView })
      } else {
        let initialHeight = shell.openHeight
        XCTAssertGreaterThan(initialHeight, 120)
        XCTAssertLessThan(initialHeight, cap)
        bodyHeight.constant = sheet is ScrollBottomSheet ? 1200 : 220
        root.layoutIfNeeded()
        // The embedded column invalidates the full-screen owner's next layout.
        root.layoutIfNeeded()
        await settle(shell)
        if sheet is ScrollBottomSheet {
          XCTAssertEqual(shell.openHeight, cap, accuracy: 1)
        } else {
          XCTAssertEqual(shell.openHeight - initialHeight, 100, accuracy: 1)
        }
      }
      event?("removed")
      sheet.removeFromSuperview()
    }
  }

  func testPickersShareShellWithSingleHeaderHandle() throws {
    for picker in [ColumnPicker(frame: .zero), TimePicker(frame: .zero)] as [UIView] {
      attach(picker)
      XCTAssertEqual(descendants(picker).filter { $0 is AppUISheetHostView }.count, 1)
      XCTAssertFalse(try host(picker).showsHandle, "The existing header supplies the sole handle")
      picker.removeFromSuperview()
    }
  }

  func testKeyboardPaddingIsAppliedOnceOnlyToScrollableLayouts() async throws {
    for sheet in [BottomSheet(), ScrollBottomSheet()] {
      _ = addBody(sheet, height: 80)
      attach(sheet)
      sheet.open = true
      let shell = try host(sheet)
      await settle(shell)
      let initial = shell.openHeight
      let overlap: CGFloat = 240
      let frame = sheet.convert(CGRect(x: 0, y: sheet.bounds.height - overlap,
                                      width: sheet.bounds.width, height: overlap),
                                to: window.screen.coordinateSpace)
      NotificationCenter.default.post(name: UIResponder.keyboardWillChangeFrameNotification,
        object: nil, userInfo: [
          UIResponder.keyboardFrameEndUserInfoKey: frame,
          UIResponder.keyboardAnimationDurationUserInfoKey: 0.0,
        ])
      root.layoutIfNeeded()
      if sheet is ScrollBottomSheet {
        let expectedDelta = overlap + UiDesign.space.md - max(sheet.safeAreaInsets.bottom, UiDesign.space.lg)
        XCTAssertEqual(shell.openHeight - initial, expectedDelta, accuracy: 1)
      } else {
        XCTAssertEqual(shell.openHeight, initial, accuracy: 1)
      }
      NotificationCenter.default.post(name: UIResponder.keyboardWillHideNotification,
        object: nil, userInfo: [UIResponder.keyboardAnimationDurationUserInfoKey: 0.0])
      root.layoutIfNeeded()
      XCTAssertEqual(shell.openHeight, initial, accuracy: 1)
      event?("removed")
      sheet.removeFromSuperview()
    }
  }
}
