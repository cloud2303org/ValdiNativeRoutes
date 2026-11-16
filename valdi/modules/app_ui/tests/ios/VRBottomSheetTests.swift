import XCTest
import UIKit

final class VRBottomSheetTests: XCTestCase {

    private let sampleDetents: [VRBSDetentSpec] = [
        VRBSDetentSpec(
            height: 280,
            programmatic: false,
            insets: VRBSDetentInsets(left: 16, right: 16, bottom: 20),
            scrimOpacity: 0.4
        ),
        VRBSDetentSpec(
            height: 500,
            programmatic: true,
            insets: VRBSDetentInsets(left: 8, right: 8, bottom: 10),
            scrimOpacity: 0.7
        ),
        VRBSDetentSpec(
            height: 800,
            programmatic: false,
            insets: VRBSDetentInsets(left: 0, right: 0, bottom: 0),
            scrimOpacity: 1.0
        ),
    ]

    func testReleaseProjectionSkipsProgrammaticDetentsAndHonorsVelocity() {
        XCTAssertEqual(
            VRBSMath.resolveReleaseTargetIndex(
                detents: sampleDetents,
                currentOpenHeight: 490,
                velocityYPointsPerSec: 0,
                canDismissOrClose: false
            ),
            0
        )

        XCTAssertEqual(
            VRBSMath.resolveReleaseTargetIndex(
                detents: sampleDetents,
                currentOpenHeight: 490,
                velocityYPointsPerSec: -2000,
                canDismissOrClose: true
            ),
            2
        )

        XCTAssertEqual(
            VRBSMath.resolveReleaseTargetIndex(
                detents: sampleDetents,
                currentOpenHeight: 250,
                velocityYPointsPerSec: 1500,
                canDismissOrClose: true
            ),
            -1
        )
    }

    func testCriticalSpringSettlesMonotonicallyWithoutOvershoot() {
        let start = 1000.0
        let spring = VRBSCriticalSpring(
            current: 600,
            target: 200,
            initialVelocity: 0,
            settleDuration: 0.45,
            startTime: start
        )
        XCTAssertEqual(spring.omega, 8.0 / 0.45, accuracy: 0.001)

        var lastPos: CGFloat = 600
        for step in 1...30 {
            let eval = spring.evaluate(at: start + Double(step) * 0.02)
            XCTAssertLessThanOrEqual(eval.position, lastPos + 0.01)
            XCTAssertGreaterThanOrEqual(eval.position, 200 - 0.01)
            lastPos = eval.position
        }
        let finalEval = spring.evaluate(at: start + 1.0)
        XCTAssertTrue(finalEval.settled)
        XCTAssertEqual(finalEval.position, 200, accuracy: 0.001)
    }

    func testHostingViewResolvesDetentsGeometryAndCardHitTest() {
        let host = VRBottomSheetHostingView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        var latestGeometry: (Double, Double, Double, Double)?
        host.onGeometryChanged = { w, h, s, inset in
            latestGeometry = (w, h, s, inset)
        }
        host.animateIn = false
        host.modal = true
        host.setSurfaceCornerStyle(radii: [20, 20, 20, 20], curveString: "continuous")
        host.setRawDetents([
            VRBSRawDetentSpec(
                value: 300,
                kind: .points,
                insetLeft: 16,
                insetRight: 16,
                insetBottom: 24,
                widestCard: true,
                scrimOpacity: 0.5
            ),
        ])
        host.setRequestedIndex(0)
        host.layoutIfNeeded()

        XCTAssertTrue(host.isPresented)
        XCTAssertTrue(host.isModalPresented)
        XCTAssertEqual(host.openHeight, 324, accuracy: 0.5)
        XCTAssertNotNil(latestGeometry)
        XCTAssertEqual(latestGeometry?.0 ?? 0, 358, accuracy: 0.5)
        XCTAssertEqual(latestGeometry?.3 ?? 0, 16, accuracy: 0.5)

        // Center of presented card hits card; left gutter outside inset hits scrim, not card.
        XCTAssertTrue(host.isPointInPresentedCard(CGPoint(x: 195, y: 650)))
        XCTAssertFalse(host.isPointInPresentedCard(CGPoint(x: 8, y: 650)))
        XCTAssertTrue(host.isPointInteractive(CGPoint(x: 8, y: 200)))
    }

    func testPreLayoutCancelStillDispatchesSettleClosed() {
        let host = VRBottomSheetHostingView(frame: .zero)
        var settled: [Int] = []
        host.onSettleChanged = { settled.append($0) }
        host.modal = true
        host.setRawDetents([VRBSRawDetentSpec(value: 0, kind: .content)])
        host.setRequestedIndex(0)
        host.setRequestedIndex(-1)
        host.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        host.layoutIfNeeded()

        XCTAssertFalse(host.isPresented)
        XCTAssertEqual(settled, [-1])
    }

    func testCriticalSpringLandsExactlyOnTargetAtSettleDurationWithoutJump() {
        let start = 1000.0
        let settleDuration: CGFloat = 0.45
        let spring = VRBSCriticalSpring(
            current: 600,
            target: 200,
            initialVelocity: 0,
            settleDuration: settleDuration,
            startTime: start
        )
        XCTAssertEqual(spring.duration, 0.45, accuracy: 0.0001)

        // Sample at 120Hz right up to settleDuration: step size shrinks smoothly with no jump on final frame.
        let dt = 1.0 / 120.0
        let twoBefore = spring.evaluate(at: start + 0.45 - 2.0 * dt)
        let oneBefore = spring.evaluate(at: start + 0.45 - dt)
        let atDuration = spring.evaluate(at: start + 0.45)

        XCTAssertFalse(oneBefore.settled)
        XCTAssertTrue(atDuration.settled)
        XCTAssertEqual(atDuration.position, 200, accuracy: 0.0001)

        let prevStep = twoBefore.position - oneBefore.position
        let finalStep = oneBefore.position - atDuration.position
        XCTAssertGreaterThan(prevStep, 0)
        XCTAssertGreaterThan(finalStep, 0)
        XCTAssertLessThan(finalStep, 0.25)
        XCTAssertLessThan(finalStep, prevStep)
    }

    func testWideScreenMaxWidthAndPlacementConstrainGeometryAndHitTesting() {
        let host = VRBottomSheetHostingView(frame: CGRect(x: 0, y: 0, width: 1024, height: 768))
        var latestGeometry: (Double, Double, Double, Double)?
        host.onGeometryChanged = { w, h, s, inset in
            latestGeometry = (w, h, s, inset)
        }
        host.animateIn = false
        host.modal = false

        // 1. Centered 480pt column with 16pt side insets: columnLeft = (1024 - 480)/2 = 272 -> card [288..736], width=448.
        host.setRawDetents([
            VRBSRawDetentSpec(
                value: 320,
                kind: .points,
                insetLeft: 16,
                insetRight: 16,
                widestCard: true,
                maxWidth: 480,
                placementBias: 0.5
            ),
        ])
        host.setRequestedIndex(0)
        host.layoutIfNeeded()

        XCTAssertEqual(latestGeometry?.0 ?? 0, 448, accuracy: 0.5)
        XCTAssertEqual(latestGeometry?.3 ?? 0, 288, accuracy: 0.5)
        XCTAssertTrue(host.isPointInPresentedCard(CGPoint(x: 512, y: 600)))
        XCTAssertFalse(host.isPointInPresentedCard(CGPoint(x: 100, y: 600)))
        XCTAssertFalse(host.isPointInPresentedCard(CGPoint(x: 900, y: 600)))
        // Non-modal sheet passes through touches in the wide-screen side gutters!
        XCTAssertFalse(host.isPointInteractive(CGPoint(x: 100, y: 600)))

        // 2. End-placed 480pt column (placementBias = 1.0): columnLeft = 1024 - 480 = 544 -> card [560..1008], width=448.
        host.setRawDetents([
            VRBSRawDetentSpec(
                value: 320,
                kind: .points,
                insetLeft: 16,
                insetRight: 16,
                widestCard: true,
                maxWidth: 480,
                placementBias: 1.0
            ),
        ])
        XCTAssertEqual(latestGeometry?.0 ?? 0, 448, accuracy: 0.5)
        XCTAssertEqual(latestGeometry?.3 ?? 0, 560, accuracy: 0.5)
        XCTAssertFalse(host.isPointInPresentedCard(CGPoint(x: 400, y: 600)))
        XCTAssertTrue(host.isPointInPresentedCard(CGPoint(x: 800, y: 600)))
    }

    func testAnimatedOpenExposesIsSettlingDuringSpringAndSurvivesMidSettleLayout() {
        let host = VRBottomSheetHostingView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        host.animateIn = true
        host.modal = true
        host.setRawDetents([VRBSRawDetentSpec(value: 300, kind: .points, widestCard: true)])
        host.setRequestedIndex(0)
        host.layoutIfNeeded()

        XCTAssertTrue(host.isSettling)
        // Redundant layout pass with unchanged bounds during settling does not cancel or corrupt settling state.
        host.setNeedsLayout()
        host.layoutIfNeeded()
        XCTAssertTrue(host.isSettling)
    }
}
