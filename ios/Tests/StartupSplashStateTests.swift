import Foundation
import Dispatch

private func expect(_ value: Bool, file: StaticString = #file, line: UInt = #line) {
    precondition(value, "Expectation failed", file: file, line: line)
}

private func expectEqual<T: Equatable>(
    _ value: T, _ expected: T, file: StaticString = #file, line: UInt = #line
) {
    precondition(value == expected, "Expected \(expected), received \(value)", file: file, line: line)
}

private extension StartupSplashState {
    func draw(contentReady: Bool) -> Bool {
        takeDrawPermission(contentReady: contentReady, readinessRevision: readinessRevision())
    }
}

private final class StartupSplashStateTests {
    func automaticDismissalWaitsForFirstContentReadiness() {
        let state = StartupSplashState()
        expectEqual(state.readinessRevision(), 0)
        expect(!state.draw(contentReady: false))
        expect(state.draw(contentReady: true))
    }

    func manualHoldBlocksReadyContentUntilHide() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        expect(!state.draw(contentReady: true))
        state.hide()
        expect(state.draw(contentReady: true))
    }

    func earlyHideDoesNotBypassContentReadiness() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        state.hide()
        expect(!state.draw(contentReady: false))
        expect(state.draw(contentReady: true))
    }

    func repeatedPreventAndHideHaveIdempotentVisibility() {
        let state = StartupSplashState()
        for _ in 0..<3 { expect(state.preventAutoHide()) }
        expectEqual(state.readinessRevision(), 0)
        expect(!state.draw(contentReady: true))
        for revision in UInt64(1)...3 {
            state.hide()
            expectEqual(state.readinessRevision(), revision)
        }
        expect(state.draw(contentReady: true))
    }

    func manualHoldCanBeReappliedBeforeDismissal() {
        let state = StartupSplashState()
        state.hide()
        expect(!state.draw(contentReady: false))
        expect(state.preventAutoHide())
        state.hide()
        expect(state.preventAutoHide())
        expect(!state.draw(contentReady: true))
        state.hide()
        expect(state.draw(contentReady: true))
    }

    func preventAfterDismissalReturnsFalseAndCannotReshowSplash() {
        let state = StartupSplashState()
        expect(state.draw(contentReady: true))
        for _ in 0..<3 {
            expect(!state.preventAutoHide())
            state.hide()
            expect(state.draw(contentReady: false))
        }
    }

    func disposeUnblocksPendingHoldWithoutReadyContent() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        expect(!state.draw(contentReady: false))
        expect(state.dispose())
        expectEqual(state.readinessRevision(), 0)
        expect(state.draw(contentReady: false))
        expect(!state.preventAutoHide())
        expect(state.draw(contentReady: true))
    }

    func disposalIsTerminalAndIdempotentEvenBeforeAnyGate() {
        let state = StartupSplashState()
        for _ in 0..<3 {
            expect(state.dispose())
            state.hide()
            expect(!state.preventAutoHide())
            expect(state.draw(contentReady: false))
            expect(state.draw(contentReady: true))
        }
    }

    func readinessObservedWhileHeldIsNotCachedForAStaleRoot() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        expect(!state.draw(contentReady: true))
        state.hide()
        for _ in 0..<3 { expect(!state.draw(contentReady: false)) }
        expect(state.draw(contentReady: true))
    }

    func drawPermissionsRemainBlockedUntilFirstSuccessThenStayTrue() {
        let state = StartupSplashState()
        for _ in 0..<3 { expect(!state.draw(contentReady: false)) }
        expect(state.draw(contentReady: true))
        for _ in 0..<3 {
            expect(state.draw(contentReady: true))
            expect(state.draw(contentReady: false))
        }
    }

    func disposalAfterDismissalKeepsDrawPermissionGranted() {
        let state = StartupSplashState()
        expect(state.draw(contentReady: true))
        expect(state.dispose())
        expect(!state.preventAutoHide())
        state.hide()
        expect(state.draw(contentReady: false))
    }

    func synchronousHideRejectsReadinessCapturedBeforeItsReturn() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        let previous = state.readinessRevision()
        state.hide()
        expect(!state.takeDrawPermission(contentReady: true, readinessRevision: previous))
        expect(state.draw(contentReady: true))
    }

    func repeatedHideRequiresReadinessFromTheLatestRequest() {
        let state = StartupSplashState()
        let initial = state.readinessRevision()
        state.hide()
        let afterFirstHide = state.readinessRevision()
        state.hide()
        expect(!state.takeDrawPermission(contentReady: true, readinessRevision: initial))
        expect(!state.takeDrawPermission(contentReady: true, readinessRevision: afterFirstHide))
        expect(state.draw(contentReady: true))
    }

    func hideAfterDismissalCannotBlockAnExistingDrawPermission() {
        let state = StartupSplashState()
        let initial = state.readinessRevision()
        expect(state.takeDrawPermission(contentReady: true, readinessRevision: initial))
        state.hide()
        expect(state.takeDrawPermission(contentReady: false, readinessRevision: initial))
        expect(!state.preventAutoHide())
    }

    func staleFailureCannotDisposeTheLaunchAfterSynchronousHide() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        let previous = state.readinessRevision()
        state.hide()
        expect(!state.dispose(readinessRevision: previous))
        expect(!state.draw(contentReady: false))
        expect(state.preventAutoHide())
    }

    func currentFailureDisposesTheLaunchAndPreventsAnotherHold() {
        let state = StartupSplashState()
        expect(state.preventAutoHide())
        let revision = state.readinessRevision()
        expect(state.dispose(readinessRevision: revision))
        expectEqual(state.readinessRevision(), revision)
        expect(state.draw(contentReady: false))
        expect(!state.preventAutoHide())
    }

    func staleFailureCannotClearANewerManualHold() {
        let state = StartupSplashState()
        let previous = state.readinessRevision()
        state.hide()
        expect(state.preventAutoHide())
        expect(!state.dispose(readinessRevision: previous))
        expect(!state.draw(contentReady: true))
        state.hide()
        expect(state.draw(contentReady: true))
    }

    func staleFailureIsRejectedEvenAfterPermissionWasGranted() {
        let state = StartupSplashState()
        let previous = state.readinessRevision()
        expect(state.dispose(readinessRevision: previous))
        state.hide()
        expect(!state.dispose(readinessRevision: previous))
        expect(state.takeDrawPermission(contentReady: false, readinessRevision: previous))
        expect(state.dispose(readinessRevision: state.readinessRevision()))
        expect(!state.preventAutoHide())
    }

    func concurrentPreventAndDrawCannotBothClaimTheLaunch() {
        let queue = DispatchQueue(label: "StartupSplashStateTests.race", attributes: .concurrent)
        for _ in 0..<128 {
            let trial = RaceTrial()
            let start = DispatchSemaphore(value: 0)
            let group = DispatchGroup()
            queue.async(group: group) {
                expect(start.wait(timeout: .now() + 5) == .success)
                trial.recordFirst(trial.state.preventAutoHide())
            }
            queue.async(group: group) {
                expect(start.wait(timeout: .now() + 5) == .success)
                trial.recordSecond(
                    trial.state.takeDrawPermission(contentReady: true, readinessRevision: 0)
                )
            }
            start.signal()
            start.signal()
            expect(group.wait(timeout: .now() + 5) == .success)
            let (held, permitted) = trial.results()
            expect(held != permitted)
            if held {
                expect(!trial.state.draw(contentReady: true))
                trial.state.hide()
                expect(trial.state.draw(contentReady: true))
            } else {
                expect(!trial.state.preventAutoHide())
                expect(trial.state.draw(contentReady: false))
            }
        }
    }

    func concurrentHideAndFailureRespectRevisionOrdering() {
        let queue = DispatchQueue(label: "StartupSplashStateTests.failure", attributes: .concurrent)
        for _ in 0..<128 {
            let trial = RaceTrial()
            expect(trial.state.preventAutoHide())
            let start = DispatchSemaphore(value: 0)
            let group = DispatchGroup()
            queue.async(group: group) {
                expect(start.wait(timeout: .now() + 5) == .success)
                trial.state.hide()
            }
            queue.async(group: group) {
                expect(start.wait(timeout: .now() + 5) == .success)
                trial.recordSecond(trial.state.dispose(readinessRevision: 0))
            }
            start.signal()
            start.signal()
            expect(group.wait(timeout: .now() + 5) == .success)
            let (_, disposed) = trial.results()
            expectEqual(trial.state.readinessRevision(), 1)
            expectEqual(trial.state.draw(contentReady: false), disposed)
            expectEqual(trial.state.preventAutoHide(), !disposed)
        }
    }
}

/// Only the test harness crosses Dispatch's Sendable boundary. Policy calls and result
/// storage each synchronize their own state; no production conformance is needed.
private final class RaceTrial: @unchecked Sendable {
    let state = StartupSplashState()
    private let lock = NSLock()
    private var first = false
    private var second = false

    func recordFirst(_ value: Bool) {
        lock.lock()
        defer { lock.unlock() }
        first = value
    }

    func recordSecond(_ value: Bool) {
        lock.lock()
        defer { lock.unlock() }
        second = value
    }

    func results() -> (Bool, Bool) {
        lock.lock()
        defer { lock.unlock() }
        return (first, second)
    }
}

@main
private enum StartupSplashStateTestRunner {
    static func main() {
        let suite = StartupSplashStateTests()
        let tests: [(String, () -> Void)] = [
            ("automatic dismissal waits for initial content", suite.automaticDismissalWaitsForFirstContentReadiness),
            ("manual hold blocks ready content until hide", suite.manualHoldBlocksReadyContentUntilHide),
            ("early hide still requires ready content", suite.earlyHideDoesNotBypassContentReadiness),
            ("repeated prevent/hide keeps visibility idempotent and advances revision", suite.repeatedPreventAndHideHaveIdempotentVisibility),
            ("manual hold can be reapplied before dismissal", suite.manualHoldCanBeReappliedBeforeDismissal),
            ("late hold cannot reshow splash", suite.preventAfterDismissalReturnsFalseAndCannotReshowSplash),
            ("dispose unblocks a pending hold without content", suite.disposeUnblocksPendingHoldWithoutReadyContent),
            ("disposal is terminal for the state lifetime", suite.disposalIsTerminalAndIdempotentEvenBeforeAnyGate),
            ("held readiness is never cached", suite.readinessObservedWhileHeldIsNotCachedForAStaleRoot),
            ("draw permission stays granted after first success", suite.drawPermissionsRemainBlockedUntilFirstSuccessThenStayTrue),
            ("disposal after dismissal keeps permission", suite.disposalAfterDismissalKeepsDrawPermissionGranted),
            ("hide invalidates previously captured readiness", suite.synchronousHideRejectsReadinessCapturedBeforeItsReturn),
            ("repeated hide requires the latest revision", suite.repeatedHideRequiresReadinessFromTheLatestRequest),
            ("hide cannot revoke existing permission", suite.hideAfterDismissalCannotBlockAnExistingDrawPermission),
            ("stale failure cannot dispose after hide", suite.staleFailureCannotDisposeTheLaunchAfterSynchronousHide),
            ("current failure disposes and rejects later holds", suite.currentFailureDisposesTheLaunchAndPreventsAnotherHold),
            ("stale failure preserves a newer manual hold", suite.staleFailureCannotClearANewerManualHold),
            ("stale disposal is rejected after permanent permission", suite.staleFailureIsRejectedEvenAfterPermissionWasGranted),
            ("concurrent prevent and draw have one winner (128 trials)", suite.concurrentPreventAndDrawCannotBothClaimTheLaunch),
            ("concurrent hide and failure obey revision ordering (128 trials)", suite.concurrentHideAndFailureRespectRevisionOrdering),
        ]
        for (name, test) in tests {
            test()
            print("PASS: \(name)")
        }
        print("\(tests.count) StartupSplashState Foundation regressions passed")
    }
}
