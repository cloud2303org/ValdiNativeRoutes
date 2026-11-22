package io.valdiroutes.app

import io.valdiroutes.app_ui.BottomSheetCardShadow
import io.valdiroutes.app_ui.BottomSheetDetent
import io.valdiroutes.app_ui.BottomSheetDetentKind
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

    @Test
    fun placeCardHonorsMaxWidthPlacementBiasAndPixelRounding() {
        // Wide host (1024px) with maxWidth=500px, centered (bias=0.5), 16px side insets:
        // columnLeft = round(0.5 * (1024 - 500)) = 262 -> left = 278, width = 468.
        val centered = BottomSheetMath.placeCard(
            hostWidthPx = 1024f,
            insets = DetentInsets(left = 16f, right = 16f),
            maxWidthPx = 500f,
            placementBias = 0.5f,
        )
        assertEquals(278f, centered.left, 0.001f)
        assertEquals(468f, centered.width, 0.001f)
        assertEquals(746f, centered.right, 0.001f)

        // Start (bias=0) vs End (bias=1) placement:
        val startPlaced = BottomSheetMath.placeCard(
            hostWidthPx = 1024f,
            insets = DetentInsets(left = 12f, right = 20f),
            maxWidthPx = 500f,
            placementBias = 0f,
        )
        assertEquals(12f, startPlaced.left, 0.001f)
        assertEquals(468f, startPlaced.width, 0.001f)

        val endPlaced = BottomSheetMath.placeCard(
            hostWidthPx = 1024f,
            insets = DetentInsets(left = 12f, right = 20f),
            maxWidthPx = 500f,
            placementBias = 1f,
        )
        assertEquals(524f + 12f, endPlaced.left, 0.001f)
        assertEquals(468f, endPlaced.width, 0.001f)

        // Odd free space (1025 - 500 = 525px) snaps columnLeft to whole pixel (263px).
        val oddCentered = BottomSheetMath.placeCard(
            hostWidthPx = 1025f,
            insets = DetentInsets(),
            maxWidthPx = 500f,
            placementBias = 0.5f,
        )
        assertEquals(263f, oddCentered.left, 0.001f)
        assertEquals(500f, oddCentered.width, 0.001f)

        // Host narrower than maxWidth clamps column to hostWidth.
        val narrow = BottomSheetMath.placeCard(
            hostWidthPx = 390f,
            insets = DetentInsets(left = 16f, right = 16f),
            maxWidthPx = 500f,
            placementBias = 1f,
        )
        assertEquals(16f, narrow.left, 0.001f)
        assertEquals(358f, narrow.width, 0.001f)
        assertEquals(0.5f, BottomSheetMath.contentScale(179f, 358f), 0.001f)
    }

    @Test
    fun exactLandingSpringScalingEliminatesResidualJumpAtSettleDuration() {
        val startValue = 600f
        val targetValue = 200f
        val startOffset = startValue - targetValue // +400px
        val omega = BottomSheetMath.computeCriticalSpringOmega(
            distancePx = targetValue - startValue,
            initialVelocityPxPerSec = 0f,
            settleDurationSeconds = 0.45f,
        )
        val clampedVel = BottomSheetMath.clampSpringInitialVelocity(startOffset, 0f, omega)
        val endOffset = BottomSheetMath.computeSpringEndOffset(startOffset, clampedVel, omega)
        assertTrue(endOffset > 1f) // Unscaled spring still has >1px left at t=0.45s!

        // At t=0, rawValue = 600 -> scaled = 600, settled = false
        val atStart = BottomSheetMath.scaleSpringPosition(startValue, targetValue, startOffset, endOffset)
        assertEquals(600f, atStart.first, 0.001f)
        assertFalse(atStart.second)

        // At t=settleDuration, rawValue = targetValue + endOffset -> scaled lands on 200, settled = true!
        val atEnd = BottomSheetMath.scaleSpringPosition(targetValue + endOffset, targetValue, startOffset, endOffset)
        assertEquals(200f, atEnd.first, 0.001f)
        assertTrue(atEnd.second)

        // Fast throw toward target (-50000 px/s) is clamped to -omega * startOffset so it never overshoots.
        val clampedThrow = BottomSheetMath.clampSpringInitialVelocity(startOffset, -50000f, omega)
        assertEquals(-omega * startOffset, clampedThrow, 0.01f)
    }

    @Test
    fun typedGeneratedModelsMapDirectlyToNativeSpecs() {
        val detents = mapRawDetents(
            listOf(
                BottomSheetDetent(
                    value = 0.0,
                    kind = BottomSheetDetentKind.Content,
                    programmatic = false,
                    usesStatusBarTopInset = true,
                    insetTop = 0.0,
                    insetLeft = 12.0,
                    insetRight = 12.0,
                    insetBottom = 8.0,
                    widestCard = true,
                    maxWidth = 480.0,
                    placementBias = 0.5,
                    scrimOpacity = 0.8,
                ),
            ),
        )
        assertEquals(1, detents.size)
        assertEquals(DetentKind.CONTENT, detents[0].kind)
        assertTrue(detents[0].usesStatusBarTopInset)
        assertTrue(detents[0].widestCard)
        assertEquals(480f, detents[0].maxWidthDp, 0.001f)
        assertEquals(0.8f, detents[0].scrimOpacity, 0.001f)

        val radii = mapCornerRadiiDp(listOf(16.0, 16.0, 0.0, 0.0))
        assertEquals(4, radii.size)
        assertEquals(16f, radii[0], 0.001f)
        assertEquals(16f, radii[1], 0.001f)
        assertEquals(0f, radii[2], 0.001f)
        assertEquals(0f, radii[3], 0.001f)

        val shadows = mapSurfaceShadows(
            listOf(
                BottomSheetCardShadow(
                    offsetX = 0.0,
                    offsetY = 4.0,
                    blurRadius = 12.0,
                    spreadDistance = 0.0,
                    colorArgb = 0x80000000.toInt().toDouble(),
                    opacity = 0.5,
                    excludesInterior = true,
                ),
            ),
            density = 2f,
        )
        assertEquals(1, shadows.size)
        assertEquals(8f, shadows[0].offsetY, 0.001f)
        assertEquals(24f, shadows[0].blurRadius, 0.001f)
        assertEquals(0x40000000, shadows[0].color)
    }

    @Test
    fun contentDetentWaitAndFirstMeasurementAnimateDecisions() {
        val contentDetent = listOf(
            RawDetentSpec(value = 0f, kind = DetentKind.CONTENT),
        )
        assertTrue(
            BottomSheetMath.shouldWaitForContentMeasurement(
                rawDetents = contentDetent,
                desiredIndex = 0,
                hasMeasuredContentHeight = false,
            ),
        )
        assertFalse(
            BottomSheetMath.shouldWaitForContentMeasurement(
                rawDetents = contentDetent,
                desiredIndex = 0,
                hasMeasuredContentHeight = true,
            ),
        )
        assertFalse(
            BottomSheetMath.shouldWaitForContentMeasurement(
                rawDetents = contentDetent,
                desiredIndex = -1,
                hasMeasuredContentHeight = false,
            ),
        )

        // First natural height measurement arriving while open at closed offset (openHeightPx == 0) must animate.
        assertTrue(
            BottomSheetMath.shouldAnimateContentMeasurement(
                hadMeasurement = false,
                animateContentHeight = false,
                isPresented = true,
                currentTargetIndex = 0,
                openHeightPx = 0f,
            ),
        )
        // Subsequent height updates follow animateContentHeight && isPresented.
        assertFalse(
            BottomSheetMath.shouldAnimateContentMeasurement(
                hadMeasurement = true,
                animateContentHeight = false,
                isPresented = true,
                currentTargetIndex = 0,
                openHeightPx = 220f,
            ),
        )
        assertTrue(
            BottomSheetMath.shouldAnimateContentMeasurement(
                hadMeasurement = true,
                animateContentHeight = true,
                isPresented = true,
                currentTargetIndex = 0,
                openHeightPx = 220f,
            ),
        )
    }

    @Test
    fun flickThresholdDismissesTallSheetAndClampsDefaultSpringVelocity() {
        val tallSheetDetents = listOf(DetentSpec(heightPx = 1872))
        val density = 3f
        // Downward flick below 600 dp/s (1800 px/s at 3x) settles back to detent 0.
        assertEquals(
            0,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = tallSheetDetents,
                currentOpenHeightPx = 1650f,
                velocityYPxPerSec = 1700f,
                canDismissOrClose = true,
                density = density,
            ),
        )
        // Downward flick above 600 dp/s (1800 px/s at 3x) dismisses cleanly even from near top.
        assertEquals(
            -1,
            BottomSheetMath.resolveReleaseTargetIndex(
                detents = tallSheetDetents,
                currentOpenHeightPx = 1650f,
                velocityYPxPerSec = 1900f,
                canDismissOrClose = true,
                density = density,
            ),
        )

        // Zero travel returns zero velocity; extreme ratios clamp to ±5 * distance.
        assertEquals(0f, BottomSheetMath.clampDefaultSpringVelocity(0f, 5000f), 0.001f)
        assertEquals(-500f, BottomSheetMath.clampDefaultSpringVelocity(100f, -2000f), 0.001f)
        assertEquals(500f, BottomSheetMath.clampDefaultSpringVelocity(100f, 2000f), 0.001f)
    }

    @Test
    fun splitCollapseScrollDeltaHandsOffExactLeftoverAtTop() {
        assertEquals(20f to 0f, BottomSheetMath.splitCollapseScrollDelta(remainingScrollPx = 50f, dyPx = 20f))
        assertEquals(20f to 0f, BottomSheetMath.splitCollapseScrollDelta(remainingScrollPx = 20f, dyPx = 20f))
        assertEquals(12f to 18f, BottomSheetMath.splitCollapseScrollDelta(remainingScrollPx = 12f, dyPx = 30f))
        assertEquals(0f to 15f, BottomSheetMath.splitCollapseScrollDelta(remainingScrollPx = 0f, dyPx = 15f))
        assertEquals(0f to 0f, BottomSheetMath.splitCollapseScrollDelta(remainingScrollPx = 20f, dyPx = -5f))
    }
}
