import UIKit
import XCTest

@MainActor
final class ActionSheetMigrationTests: XCTestCase {
  private var window: UIWindow!
  private var controller: UIViewController!

  override func setUp() {
    super.setUp()
    window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    controller = UIViewController()
    window.rootViewController = controller
    window.makeKeyAndVisible()
    controller.view.frame = window.bounds
  }

  override func tearDown() {
    // Also exercises cleanup for any test that failed before explicitly closing.
    for view in window.subviews where view !== controller.view {
      if descendants(view).contains(where: { $0 is BottomSheet }) { view.removeFromSuperview() }
    }
    window.isHidden = true
    window.rootViewController = nil
    controller = nil
    window = nil
    super.tearDown()
  }

  private func descendants(_ view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(descendants)
  }

  private func sheet() throws -> ScrollBottomSheet {
    try XCTUnwrap(descendants(window).compactMap { $0 as? ScrollBottomSheet }.first)
  }

  private func shell() throws -> AppUISheetHostView {
    try XCTUnwrap(descendants(window).compactMap { $0 as? AppUISheetHostView }.first)
  }

  private func item(_ id: String) throws -> UIButton {
    try XCTUnwrap(descendants(window).compactMap { $0 as? UIButton }.first {
      $0.accessibilityIdentifier == "action-sheet-item-" + id
    })
  }

  private func settle(_ shell: AppUISheetHostView) async {
    let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      !self.descendants(shell).contains { $0.layer.animation(forKey: "sheetSettle") != nil }
    }, object: nil)
    await fulfillment(of: [settled], timeout: 3)
  }

  func testSelectionUsesSharedShellAndCompletesAfterExit() async throws {
    let closed = expectation(description: "selected after exit")
    var calls = 0
    _ = NativeActionSheet.present(from: controller, title: "Actions", description: "Choose",
      actions: [
        MenuActionItem(id: "disabled", title: "Disabled", disabled: true),
        MenuActionItem(id: "delete", title: "Delete", destructive: true, icon: .delete),
      ], dark: true) { selection, reason in
        calls += 1
        XCTAssertEqual(selection, "delete")
        XCTAssertEqual(reason, .dismissed)
        XCTAssertFalse(self.descendants(self.window).contains { $0 is BottomSheet })
        closed.fulfill()
      }
    XCTAssertNil(controller.presentedViewController)
    let shell = try self.shell()
    let sheet = try self.sheet()
    XCTAssertEqual(descendants(window).filter { $0 is AppUISheetHostView }.count, 1)
    XCTAssertEqual(sheet.traitCollection.userInterfaceStyle, .dark)
    await settle(shell)
    let disabled = try item("disabled")
    XCTAssertFalse(disabled.isEnabled)
    disabled.sendActions(for: .primaryActionTriggered)
    XCTAssertTrue(sheet.open)
    XCTAssertEqual(calls, 0)
    let destructive = try item("delete")
    XCTAssertNotNil(destructive.configuration?.image)
    XCTAssertEqual(destructive.configuration?.baseForegroundColor, UiTheme.danger)
    destructive.sendActions(for: .primaryActionTriggered)
    XCTAssertFalse(sheet.open)
    XCTAssertEqual(calls, 0)
    XCTAssertTrue(sheet.hitTest(CGPoint(x: 10, y: 10), with: nil) === sheet)
    await fulfillment(of: [closed], timeout: 3)
    XCTAssertEqual(calls, 1)
  }

  func testCancellationHandlePreservesReasonsAndCompletesOnce() async throws {
    for reason in [OverlayCloseReason.dismissed, .navigation, .unmount] {
      let closed = expectation(description: "cancel \(reason)")
      var calls = 0
      let cancel = NativeActionSheet.present(from: controller,
        actions: [MenuActionItem(id: "one", title: "One")]) { selection, actualReason in
          calls += 1
          XCTAssertNil(selection)
          XCTAssertEqual(actualReason, reason)
          closed.fulfill()
        }
      let shell = try self.shell()
      await settle(shell)
      cancel(reason)
      if reason == .dismissed { XCTAssertEqual(calls, 0) }
      cancel(reason)
      await fulfillment(of: [closed], timeout: 3)
      XCTAssertEqual(calls, 1)
      XCTAssertFalse(descendants(window).contains { $0 is BottomSheet })
    }
  }

  func testScopeCoverageAndNavigationSupersedePendingSelection() async throws {
    var receive: ((String) -> Void)?
    var closingUpdates = 0
    var removals = 0
    let scope = OverlayScope(register: { _, _, callback in
      receive = callback
      callback("top")
      return true
    }, update: { _, _, closing in
      if closing { closingUpdates += 1 }
    }, remove: { _ in removals += 1 })
    let closed = expectation(description: "navigation")
    var calls = 0
    _ = NativeActionSheet.present(from: controller,
      actions: [MenuActionItem(id: "one", title: "One")], scope: scope) { selection, reason in
        calls += 1
        XCTAssertNil(selection)
        XCTAssertEqual(reason, .navigation)
        closed.fulfill()
      }
    let shell = try self.shell()
    let sheet = try self.sheet()
    await settle(shell)
    receive?("covered")
    XCTAssertNil(sheet.hitTest(CGPoint(x: 10, y: 10), with: nil))
    try item("one").sendActions(for: .primaryActionTriggered)
    XCTAssertTrue(sheet.open)
    receive?("top")
    try item("one").sendActions(for: .primaryActionTriggered)
    XCTAssertGreaterThan(closingUpdates, 0)
    XCTAssertEqual(calls, 0)
    receive?("removed")
    await fulfillment(of: [closed], timeout: 3)
    XCTAssertEqual(calls, 1)
    XCTAssertEqual(removals, 0, "Navigation removal is owned by the supplied scope")
  }

  func testRejectedScopeCompletesWithoutLeavingPresentation() {
    var calls = 0
    let scope = OverlayScope(register: { _, _, _ in false }, update: { _, _, _ in },
                             remove: { _ in XCTFail("Rejected registration must not be removed") })
    let cancel = NativeActionSheet.present(from: controller,
      actions: [MenuActionItem(id: "one", title: "One")], scope: scope) { selection, reason in
        calls += 1
        XCTAssertNil(selection)
        XCTAssertEqual(reason, .navigation)
      }
    XCTAssertEqual(calls, 1)
    XCTAssertFalse(descendants(window).contains { $0 is BottomSheet })
    cancel(.unmount)
    XCTAssertEqual(calls, 1)
  }

  func testAsyncOverloadResolvesNilAfterScrimDismissal() async throws {
    let resolved = expectation(description: "async cancellation")
    var completed = false
    let task = Task { @MainActor in
      let result = await NativeActionSheet.present(from: self.controller,
        actions: [MenuActionItem(id: "one", title: "One")])
      XCTAssertNil(result)
      completed = true
      resolved.fulfill()
    }
    let mounted = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      self.descendants(self.window).contains { $0 is AppUISheetHostView }
    }, object: nil)
    await fulfillment(of: [mounted], timeout: 3)
    let shell = try self.shell()
    await settle(shell)
    try XCTUnwrap(shell.subviews.compactMap { $0 as? UIControl }.first)
      .sendActions(for: .touchUpInside)
    XCTAssertFalse(completed)
    await fulfillment(of: [resolved], timeout: 3)
    await task.value
  }

  func testLongListKeepsCancelFooterAndScopedBackClosesAfterExit() async throws {
    for useFooter in [true, false] {
      var receive: ((String) -> Void)?
      var removals = 0
      let scope = OverlayScope(register: { _, _, callback in
        receive = callback
        callback("top")
        return true
      }, update: { _, _, _ in }, remove: { _ in removals += 1 })
      let closed = expectation(description: "footer or back")
      _ = NativeActionSheet.present(from: controller,
        actions: (0..<40).map { MenuActionItem(id: "\($0)", title: "Action \($0)") },
        cancelText: "Never mind", scope: scope) { selection, reason in
          XCTAssertNil(selection)
          XCTAssertEqual(reason, .dismissed)
          closed.fulfill()
        }
      let shell = try self.shell()
      let sheet = try self.sheet()
      await settle(shell)
      XCTAssertEqual(shell.openHeight, (sheet.bounds.height - sheet.safeAreaInsets.top) * 0.85, accuracy: 1)
      let cancel = try XCTUnwrap(sheet.footer as? ActionButton)
      XCTAssertEqual(cancel.title, "Never mind")
      XCTAssertFalse(descendants(sheet.content).contains { $0 === cancel })
      if useFooter { cancel.sendActions(for: .touchUpInside) }
      else { receive?("close") }
      XCTAssertEqual(removals, 0)
      await fulfillment(of: [closed], timeout: 3)
      XCTAssertEqual(removals, 1)
    }
  }
}
