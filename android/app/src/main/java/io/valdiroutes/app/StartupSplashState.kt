package io.valdiroutes.app

/**
 * Application-lifetime splash policy shared by synchronous JS calls and Android pre-draw.
 * The coordinator supplies readiness for its current root; readiness is never cached here.
 */
internal class StartupSplashState {
    private var manualHold = false
    private var drawPermitted = false
    private var revision = 0L

    @Synchronized
    fun preventAutoHide(): Boolean {
        if (drawPermitted) return false
        manualHold = true
        return true
    }

    @Synchronized
    fun hide() {
        manualHold = false
        revision++
    }

    @Synchronized
    fun readinessRevision(): Long = revision

    @Synchronized
    fun takeDrawPermission(contentReady: Boolean, readinessRevision: Long): Boolean {
        if (!drawPermitted && contentReady && !manualHold && readinessRevision == revision) drawPermitted = true
        return drawPermitted
    }

    @Synchronized
    fun dispose(readinessRevision: Long? = null): Boolean {
        if (readinessRevision != null && readinessRevision != revision) return false
        manualHold = false
        drawPermitted = true
        return true
    }
}
