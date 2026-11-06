package io.valdiroutes.app

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StartupSplashStateTest {
    private fun StartupSplashState.draw(contentReady: Boolean): Boolean =
        takeDrawPermission(contentReady, readinessRevision())

    @Test
    fun automaticDismissalWaitsForFirstContentReadiness() {
        val state = StartupSplashState()

        assertFalse(state.draw(contentReady = false))
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun manualHoldBlocksReadyContentUntilHide() {
        val state = StartupSplashState()

        assertTrue(state.preventAutoHide())
        assertFalse(state.draw(contentReady = true))
        state.hide()
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun earlyHideDoesNotBypassContentReadiness() {
        val state = StartupSplashState()

        assertTrue(state.preventAutoHide())
        state.hide()
        assertFalse(state.draw(contentReady = false))
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun repeatedPreventAndHideAreIdempotent() {
        val state = StartupSplashState()

        repeat(3) { assertTrue(state.preventAutoHide()) }
        assertFalse(state.draw(contentReady = true))
        repeat(3) { state.hide() }
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun manualHoldCanBeReappliedBeforeDismissal() {
        val state = StartupSplashState()

        state.hide()
        assertFalse(state.draw(contentReady = false))
        assertTrue(state.preventAutoHide())
        state.hide()
        assertTrue(state.preventAutoHide())
        assertFalse(state.draw(contentReady = true))
        state.hide()
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun preventAfterDismissalReturnsFalseAndCannotReshowSplash() {
        val state = StartupSplashState()

        assertTrue(state.draw(contentReady = true))
        repeat(3) {
            assertFalse(state.preventAutoHide())
            state.hide()
            assertTrue(state.draw(contentReady = false))
        }
    }

    @Test
    fun disposeUnblocksPendingHoldWithoutReadyContent() {
        val state = StartupSplashState()

        assertTrue(state.preventAutoHide())
        assertFalse(state.draw(contentReady = false))
        state.dispose()
        assertTrue(state.draw(contentReady = false))
        assertFalse(state.preventAutoHide())
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun disposalIsTerminalAndIdempotentEvenBeforeAnyGate() {
        val state = StartupSplashState()

        repeat(3) {
            state.dispose()
            state.hide()
            assertFalse(state.preventAutoHide())
            assertTrue(state.draw(contentReady = false))
            assertTrue(state.draw(contentReady = true))
        }
    }

    @Test
    fun readinessObservedWhileHeldIsNotCachedForAStaleRoot() {
        val state = StartupSplashState()

        assertTrue(state.preventAutoHide())
        assertFalse(state.draw(contentReady = true))
        state.hide()
        repeat(3) { assertFalse(state.draw(contentReady = false)) }
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun repeatedDrawPermissionsRemainBlockedUntilFirstSuccessThenStayTrue() {
        val state = StartupSplashState()

        repeat(3) { assertFalse(state.draw(contentReady = false)) }
        assertTrue(state.draw(contentReady = true))
        repeat(3) {
            assertTrue(state.draw(contentReady = true))
            assertTrue(state.draw(contentReady = false))
        }
    }

    @Test
    fun disposalAfterDismissalKeepsDrawPermissionGranted() {
        val state = StartupSplashState()

        assertTrue(state.draw(contentReady = true))
        state.dispose()
        assertFalse(state.preventAutoHide())
        state.hide()
        assertTrue(state.draw(contentReady = false))
    }

    @Test
    fun synchronousHideRejectsReadinessCapturedBeforeItsReturn() {
        val state = StartupSplashState()
        assertTrue(state.preventAutoHide())
        val previous = state.readinessRevision()

        state.hide()

        assertFalse(state.takeDrawPermission(contentReady = true, readinessRevision = previous))
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun repeatedHideRequiresReadinessFromTheLatestRequest() {
        val state = StartupSplashState()
        val initial = state.readinessRevision()
        state.hide()
        val afterFirstHide = state.readinessRevision()
        state.hide()

        assertFalse(state.takeDrawPermission(contentReady = true, readinessRevision = initial))
        assertFalse(state.takeDrawPermission(contentReady = true, readinessRevision = afterFirstHide))
        assertTrue(state.draw(contentReady = true))
    }

    @Test
    fun hideAfterDismissalCannotBlockAnExistingDrawPermission() {
        val state = StartupSplashState()
        val initial = state.readinessRevision()
        assertTrue(state.takeDrawPermission(contentReady = true, readinessRevision = initial))
        state.hide()

        assertTrue(state.takeDrawPermission(contentReady = false, readinessRevision = initial))
        assertFalse(state.preventAutoHide())
    }

    @Test
    fun staleFailureCannotDisposeTheLaunchAfterSynchronousHide() {
        val state = StartupSplashState()
        assertTrue(state.preventAutoHide())
        val previous = state.readinessRevision()
        state.hide()

        assertFalse(state.dispose(readinessRevision = previous))
        assertFalse(state.draw(contentReady = false))
        assertTrue(state.preventAutoHide())
    }

    @Test
    fun currentFailureDisposesTheLaunchAndPreventsAnotherHold() {
        val state = StartupSplashState()
        assertTrue(state.preventAutoHide())

        assertTrue(state.dispose(readinessRevision = state.readinessRevision()))
        assertTrue(state.draw(contentReady = false))
        assertFalse(state.preventAutoHide())
    }

    @Test
    fun concurrentPreventAndDrawCannotBothClaimTheLaunch() {
        val workers = Executors.newFixedThreadPool(2)
        try {
            repeat(128) {
                val state = StartupSplashState()
                val revision = state.readinessRevision()
                val start = CountDownLatch(1)
                val hold = workers.submit<Boolean> {
                    check(start.await(5, TimeUnit.SECONDS))
                    state.preventAutoHide()
                }
                val draw = workers.submit<Boolean> {
                    check(start.await(5, TimeUnit.SECONDS))
                    state.takeDrawPermission(contentReady = true, readinessRevision = revision)
                }
                start.countDown()
                val held = hold.get(5, TimeUnit.SECONDS)
                val permitted = draw.get(5, TimeUnit.SECONDS)
                assertTrue(held != permitted)
            }
        } finally {
            workers.shutdownNow()
        }
    }
}
