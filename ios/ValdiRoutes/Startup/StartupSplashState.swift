import Foundation

/// Application-lifetime splash policy shared by synchronous calls and the initial-content gate.
/// The coordinator supplies readiness for its current root; readiness is never cached here.
internal final class StartupSplashState {
    private let lock = NSLock()
    private var manualHold = false
    private var drawPermitted = false
    private var revision: UInt64 = 0

    func preventAutoHide() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if drawPermitted { return false }
        manualHold = true
        return true
    }

    func hide() {
        lock.lock()
        defer { lock.unlock() }
        manualHold = false
        revision &+= 1
    }

    func readinessRevision() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        return revision
    }

    func takeDrawPermission(contentReady: Bool, readinessRevision: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if !drawPermitted && contentReady && !manualHold && readinessRevision == revision {
            drawPermitted = true
        }
        return drawPermitted
    }

    @discardableResult
    func dispose(readinessRevision: UInt64? = nil) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if let readinessRevision, readinessRevision != revision { return false }
        manualHold = false
        drawPermitted = true
        return true
    }
}
