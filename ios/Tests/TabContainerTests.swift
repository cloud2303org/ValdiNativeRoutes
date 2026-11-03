import UIKit
import XCTest
import ValdiRuntime

/// Source-only XCTest coverage for the parent build slot. Compile alongside the handwritten app sources/bindings.
final class TabContainerTests: XCTestCase {
    func testDefaultDeclarationAllowsOmittedOrExplicitDefaultMode() {
        let bar = makeBar()
        XCTAssertNil(RouteTable.tabBarError(bar))
        bar.mode = "default"
        XCTAssertNil(RouteTable.tabBarError(bar))
        bar.component = "AppTabBar@app_pages/src/AppTabBar"
        XCTAssertNotNil(RouteTable.tabBarError(bar))
    }

    func testCustomDeclarationRequiresCanonicalComponentAndKnownMode() {
        let bar = makeBar()
        bar.mode = "custom"
        for component: String? in [nil, "", "AppTabBar", "AppTabBar@app_pages", " AppTabBar@app_pages/src/AppTabBar"] {
            bar.component = component
            XCTAssertNotNil(RouteTable.tabBarError(bar), "Accepted invalid component \(component ?? "nil")")
        }
        bar.component = "AppTabBar@app_pages/src/AppTabBar"
        XCTAssertNil(RouteTable.tabBarError(bar))
        bar.mode = "unsupported"
        XCTAssertNotNil(RouteTable.tabBarError(bar))
    }

    func testEmptyViewportPassesThroughButVisualChildrenReceiveTouches() {
        let page = UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let pageButton = UIButton(frame: CGRect(x: 20, y: 100, width: 120, height: 44))
        page.addSubview(pageButton)
        let root = TabBarRootView()
        root.frame = page.bounds
        page.addSubview(root)
        let visualBar = SCValdiView(frame: CGRect(x: 0, y: 720, width: 400, height: 80))
        let tabButton = UIButton(frame: CGRect(x: 20, y: 0, width: 120, height: 44))
        visualBar.addSubview(tabButton)
        root.addSubview(visualBar)

        XCTAssertTrue(page.hitTest(CGPoint(x: 40, y: 120), with: nil) === pageButton)
        XCTAssertTrue(page.hitTest(CGPoint(x: 40, y: 740), with: nil) === tabButton)
        XCTAssertTrue(page.hitTest(CGPoint(x: 200, y: 780), with: nil) === visualBar)
        XCTAssertTrue(page.hitTest(CGPoint(x: 200, y: 400), with: nil) === page)
        XCTAssertNil(root.hitTest(CGPoint(x: 200, y: 400), with: nil))
    }

    func testHiddenOrDisabledBusinessChildrenDoNotBlockPageTouches() {
        let root = TabBarRootView()
        root.frame = CGRect(x: 0, y: 0, width: 400, height: 800)
        let bar = SCValdiView(frame: CGRect(x: 0, y: 720, width: 400, height: 80))
        root.addSubview(bar)
        bar.isHidden = true
        XCTAssertNil(root.hitTest(CGPoint(x: 20, y: 740), with: nil))
        bar.isHidden = false
        bar.isUserInteractionEnabled = false
        XCTAssertNil(root.hitTest(CGPoint(x: 20, y: 740), with: nil))
    }

    func testBusinessViewportPredicatePrunesOnlyTheAreaAboveItsBar() {
        let root = TabBarRootView()
        root.frame = CGRect(x: 0, y: 0, width: 400, height: 800)
        let businessRoot = SCValdiView(frame: root.bounds)
        businessRoot.valdiHitTest = SCValdiFunctionWithBlock({ marshaller in
            let event = SCValdiMarshallerGetUntyped(marshaller, 0) as? [String: Any]
            let y = (event?["y"] as? NSNumber)?.doubleValue ?? -1
            _ = SCValdiMarshallerPushBool(marshaller, y >= 720 && y < 800)
            return true
        })
        let button = UIButton(frame: CGRect(x: 20, y: 720, width: 120, height: 44))
        businessRoot.addSubview(button)
        root.addSubview(businessRoot)

        XCTAssertNil(root.hitTest(CGPoint(x: 40, y: 120), with: nil))
        XCTAssertTrue(root.hitTest(CGPoint(x: 40, y: 740), with: nil) === button)
        XCTAssertTrue(root.hitTest(CGPoint(x: 200, y: 780), with: nil) === businessRoot)
    }

    func testShellRetainsItsContextUntilRemovalAndCancelsItsPagesOnce() {
        let definition = VRRouteEntry(route: "$tabs", kind: "tabs", title: "Tabs")
        let shell = PageEntry(id: "shell", route: "$tabs", definition: definition, params: [:],
                              presentation: .push, onResult: nil)
        var completions = 0
        let child = PageEntry(id: "home", route: "home", definition: VRRouteEntry(route: "home", kind: "valdi", title: "Home"),
                              params: [:], presentation: .tab, onResult: { result, canceled in
            completions += 1
            XCTAssertTrue(canceled)
            XCTAssertTrue(result.isEmpty)
        })
        let other = PageEntry(id: "other", route: "other", definition: VRRouteEntry(route: "other", kind: "valdi", title: "Other"),
                              params: [:], presentation: .tab, onResult: nil)
        shell.tabPages = [child, other]
        child.shell = shell
        other.shell = shell
        shell.tabBarContext = VRTabBarContext(selectTab: { _ in })
        weak var context = shell.tabBarContext
        shell.selectedTab = "home"
        XCTAssertNotNil(context)
        shell.selectedTab = "other"
        XCTAssertNotNil(context)
        shell.remove()
        shell.remove()
        XCTAssertNil(context)
        XCTAssertNil(shell.tabBarContext)
        XCTAssertTrue(child.removed)
        XCTAssertEqual(completions, 1)
    }

    private func makeBar() -> VRRouteTabBar {
        VRRouteTabBar(route: "$tabs", initial: "home", tabs: [
            VRRouteTab(route: "home", text: "Home", icon: "home", selectedIcon: "home")
        ])
    }
}
