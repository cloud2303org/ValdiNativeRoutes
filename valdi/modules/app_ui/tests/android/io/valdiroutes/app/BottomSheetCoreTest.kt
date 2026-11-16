package io.valdiroutes.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BottomSheetCoreTest {

    private val sampleDetents = listOf(
        DetentSpec(
            heightPx = 280,
            programmatic = false,
            insets = DetentInsets(left = 16f, right = 16f, bottom = 20f),
            scrimOpacity = 0.4f,
        ),
        DetentSpec(
            heightPx = 500,
            programmatic = true,
            insets = DetentInsets(left = 8f, right = 8f, bottom = 10f),
            scrimOpacity = 0.7f,
        ),
        DetentSpec(
            heightPx = 800,
            programmatic = false,
            insets = DetentInsets(left = 0f, right = 0f, bottom = 0f),
            scrimOpacity = 1.0f,
        ),
    )

    @Test
    fun releaseProjectionSkipsProgrammaticDetentsAndHonorsVelocity() {
        // Detent 0 totalHeight = 300, Detent 1 (programmatic) = 510, Detent 2 = 800.
        // At openHeight = 490 with zero velocity, Detent 1 is closest (510) but programmatic,
        // so nearest interactive detent is Detent 0 (300, dist=190 vs Detent 2 dist=310).
        assertEquals(
            0,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = sampleDetents,
                currentOpenHeightPx = 490f,
                velocityYPxPerSec = 0f,
                canDismissOrClose = false,
            ),
        )

        // Upward fling (velocityY = -2000 px/s -> projected = 490 + 200 = 690) snaps to Detent 2 (800).
        assertEquals(
            2,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = sampleDetents,
                currentOpenHeightPx = 490f,
                velocityYPxPerSec = -2000f,
                canDismissOrClose = true,
            ),
        )

        // Downward fling on modal sheet (openHeight = 250, velocityY = +1500 -> projected = 100) snaps to closed (-1).
        assertEquals(
            -1,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = sampleDetents,
                currentOpenHeightPx = 250f,
                velocityYPxPerSec = 1500f,
                canDismissOrClose = true,
            ),
        )

        // Same downward fling on non-modal sheet without close handler snaps to lowest interactive detent (0).
        assertEquals(
            0,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = sampleDetents,
                currentOpenHeightPx = 250f,
                velocityYPxPerSec = 1500f,
                canDismissOrClose = false,
            ),
        )
    }

    @Test
    fun criticalSpringOmegaScalesWithSettleDurationAndVelocity() {
        // Default 0.45s settleDuration -> omega = 8 / 0.45 = 17.777...
        assertEquals(
            8f / 0.45f,
            BottomSheetMath.computeCriticalSpringOmega(
                distancePx = 300f,
                initialVelocityPxPerSec = 0f,
                settleDurationSeconds = 0f,
            ),
            0.001f,
        )

        // Custom 0.25s settleDuration -> omega = 32
        assertEquals(
            32f,
            BottomSheetMath.computeCriticalSpringOmega(
                distancePx = 300f,
                initialVelocityPxPerSec = 0f,
                settleDurationSeconds = 0.25f,
            ),
            0.001f,
        )

        // Fast initial velocity overrides base omega (`|v0| / |d| = 6000 / 100 = 60 > 17.78`).
        assertEquals(
            60f,
            BottomSheetMath.computeCriticalSpringOmega(
                distancePx = 100f,
                initialVelocityPxPerSec = -6000f,
                settleDurationSeconds = 0.45f,
            ),
            0.001f,
        )
    }

    @Test
    fun fractionalIndexInsetsAndScrimInterpolateAcrossDetents() {
        // Closed (0) -> -1.0; half of first detent (150 / 300) -> -0.5; first detent (300) -> 0.0
        assertEquals(-1f, BottomSheetMath.computeFractionalIndex(sampleDetents, 0f), 0.001f)
        assertEquals(-0.5f, BottomSheetMath.computeFractionalIndex(sampleDetents, 150f), 0.001f)
        assertEquals(0f, BottomSheetMath.computeFractionalIndex(sampleDetents, 300f), 0.001f)
        // Midpoint between Detent 0 (300) and Detent 1 (510) -> 405 => index 0.5
        assertEquals(0.5f, BottomSheetMath.computeFractionalIndex(sampleDetents, 405f), 0.001f)

        val midInsets = BottomSheetMath.interpolateInsets(sampleDetents, 405f)
        assertEquals(12f, midInsets.left, 0.01f)
        assertEquals(15f, midInsets.bottom, 0.01f)

        // Scrim opacity ramps from 0 at closed to 0.4 at Detent 0, then 0.55 halfway to Detent 1.
        assertEquals(0f, BottomSheetMath.interpolateScrimOpacity(sampleDetents, 0f), 0.001f)
        assertEquals(0.2f, BottomSheetMath.interpolateScrimOpacity(sampleDetents, 150f), 0.001f)
        assertEquals(0.55f, BottomSheetMath.interpolateScrimOpacity(sampleDetents, 405f), 0.001f)
    }

    @Test
    fun portalCloseCoordinatorRoutesBackToTopmostEligibleSheet() {
        data class FakeSheet(val id: String, var state: CloseRequestInputState)

        val closedRequests = mutableListOf<String>()
        val dismissedModals = mutableListOf<String>()

        val coordinator = PortalCloseRequestCoordinator<FakeSheet>(
            stateOf = { it.state },
            onEmitCloseRequest = { closedRequests.add(it.id) },
            onDismissModal = { dismissedModals.add(it.id) },
        )

        val bottomModal = FakeSheet(
            "bottomModal",
            CloseRequestInputState(isPresented = true, hasCloseRequestHandler = false, isModal = true),
        )
        val midControlled = FakeSheet(
            "midControlled",
            CloseRequestInputState(isPresented = true, hasCloseRequestHandler = true, isModal = false),
        )
        val topPassiveNonModal = FakeSheet(
            "topPassiveNonModal",
            CloseRequestInputState(isPresented = true, hasCloseRequestHandler = false, isModal = false),
        )

        coordinator.updateSheets(listOf(bottomModal, midControlled, topPassiveNonModal))
        assertTrue(coordinator.backCallback.isEnabled)

        // Topmost passive non-modal passes through, so `midControlled` handles Back first!
        assertTrue(coordinator.handleBack())
        assertEquals(listOf("midControlled"), closedRequests)
        assertTrue(dismissedModals.isEmpty())

        // Once `midControlled` closes, `bottomModal` dismisses on Back!
        midControlled.state = midControlled.state.copy(isPresented = false)
        coordinator.syncEnabled()
        assertTrue(coordinator.backCallback.isEnabled)
        assertTrue(coordinator.handleBack())
        assertEquals(listOf("bottomModal"), dismissedModals)

        // Once `bottomModal` also closes, only passive non-modal remains -> Back callback disables!
        bottomModal.state = bottomModal.state.copy(isPresented = false)
        coordinator.syncEnabled()
        assertFalse(coordinator.backCallback.isEnabled)
        assertFalse(coordinator.handleBack())
    }
}
