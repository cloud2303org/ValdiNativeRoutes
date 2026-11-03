package io.nativeroutes.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SheetNestedScrollConnectionTest {
    /** A bounded panel sink; these tests exercise the real Compose handoff connection. */
    private class Panel {
        var position = 0f
        var wheel = false
        var enabled = true
        val deltas = mutableListOf<Float>()
        val settles = mutableListOf<Float>()
        val connection = SheetNestedScrollConnection(
            drag = { delta ->
                deltas.add(delta)
                val before = position
                if (enabled) position = (position + delta).coerceIn(0f, 100f)
                position - before
            },
            settle = { velocity ->
                settles.add(velocity)
                enabled && (position > 0f || velocity > 0f)
            },
            displaced = { position > 0f },
            exclusive = { wheel },
        )
    }

    @Test
    fun downwardDragScrollsChildFirstAndOnlyHandsOffRemainder() {
        val panel = Panel()
        val connection = panel.connection
        assertEquals(Offset.Zero, connection.onPreScroll(Offset(6f, 40f), NestedScrollSource.UserInput))
        assertEquals(Offset.Zero, connection.onPostScroll(Offset(0f, 40f), Offset.Zero, NestedScrollSource.UserInput))
        assertTrue(panel.deltas.isEmpty())
        assertEquals(Offset(0f, 15f),
            connection.onPostScroll(Offset(0f, 25f), Offset(6f, 15f), NestedScrollSource.UserInput))
        assertEquals(15f, panel.position, 0f)
    }

    @Test
    fun upwardReversalExpandsSheetAndLeavesRemainingDistanceToChild() {
        val panel = Panel().apply { position = 30f }
        assertEquals(Offset(0f, -30f),
            panel.connection.onPreScroll(Offset(8f, -50f), NestedScrollSource.UserInput))
        assertEquals(0f, panel.position, 0f)
        assertEquals(Offset.Zero,
            panel.connection.onPreScroll(Offset(0f, -20f), NestedScrollSource.UserInput))
        assertEquals(listOf(-50f), panel.deltas)
    }

    @Test
    fun handoffReportsOnlyDistancePanelActuallyConsumed() {
        val panel = Panel().apply { position = 90f }
        assertEquals(Offset(0f, 10f),
            panel.connection.onPostScroll(Offset.Zero, Offset(0f, 40f), NestedScrollSource.UserInput))
        panel.enabled = false
        assertEquals(Offset.Zero,
            panel.connection.onPreScroll(Offset(0f, -40f), NestedScrollSource.UserInput))
    }

    @Test
    fun wheelOwnsPreScrollPostScrollAndFlingEvenWhenPanelDisplaced() = runBlocking {
        val panel = Panel().apply { position = 35f; wheel = true }
        val connection = panel.connection
        assertEquals(Offset.Zero, connection.onPreScroll(Offset(0f, -40f), NestedScrollSource.UserInput))
        assertEquals(Offset.Zero, connection.onPostScroll(Offset.Zero, Offset(0f, 40f), NestedScrollSource.UserInput))
        assertEquals(Velocity.Zero, connection.onPreFling(Velocity(0f, -800f)))
        assertEquals(Velocity.Zero, connection.onPostFling(Velocity.Zero, Velocity(0f, 800f)))
        assertTrue(panel.deltas.isEmpty())
        assertTrue(panel.settles.isEmpty())
        assertEquals(35f, panel.position, 0f)
    }

    @Test
    fun sideEffectScrollDoesNotDragTheSheet() {
        val panel = Panel().apply { position = 30f }
        assertEquals(Offset.Zero, panel.connection.onPreScroll(Offset(0f, -20f), NestedScrollSource.SideEffect))
        assertEquals(Offset.Zero,
            panel.connection.onPostScroll(Offset.Zero, Offset(0f, 20f), NestedScrollSource.SideEffect))
        assertTrue(panel.deltas.isEmpty())
    }

    @Test
    fun displacedPanelSettlesOnReleaseAndConsumesOnlyVerticalVelocity() = runBlocking {
        val panel = Panel().apply { position = 35f }
        assertEquals(Velocity(0f, -800f), panel.connection.onPreFling(Velocity(200f, -800f)))
        assertEquals(listOf(-800f), panel.settles)
        panel.settles.clear()
        assertEquals(Velocity.Zero, panel.connection.onPreFling(Velocity.Zero))
        assertEquals(listOf(0f), panel.settles)
    }

    @Test
    fun expandedSheetLeavesChildFlingAloneButAcceptsDownwardLeftoverAtEdge() = runBlocking {
        val panel = Panel()
        assertEquals(Velocity.Zero, panel.connection.onPreFling(Velocity(200f, -800f)))
        assertEquals(listOf(0f), panel.settles)
        panel.settles.clear()
        assertEquals(Velocity(0f, 500f),
            panel.connection.onPostFling(Velocity(0f, 300f), Velocity(100f, 500f)))
        assertEquals(listOf(500f), panel.settles)
        panel.settles.clear()
        assertEquals(Velocity.Zero, panel.connection.onPostFling(Velocity.Zero, Velocity(0f, -500f)))
        assertTrue(panel.settles.isEmpty())
    }

    @Test
    fun blockedPanelDoesNotClaimFlingVelocity() = runBlocking {
        val panel = Panel().apply { enabled = false }
        assertEquals(Velocity.Zero, panel.connection.onPostFling(Velocity.Zero, Velocity(0f, 900f)))
    }
}
