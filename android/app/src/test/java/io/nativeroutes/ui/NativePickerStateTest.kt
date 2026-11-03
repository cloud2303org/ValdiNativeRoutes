package io.nativeroutes.ui

import io.valdiroutes.app.WheelDate
import io.valdiroutes.app.WheelItem
import io.valdiroutes.app.WheelNode
import org.junit.Assert.*
import org.junit.Test

class NativePickerStateTest {
    private val now = WheelDate(2026, 11, 3, 17, 42)
    private val tree = listOf(
        WheelNode("a", "A", listOf(
            WheelNode("shared", "A1", listOf(WheelNode("a11", "A11"), WheelNode("a12", "A12"))),
            WheelNode("a2", "A2"),
        )),
        WheelNode("b", "B", listOf(WheelNode("b1", "B1"), WheelNode("shared", "B2"))),
        WheelNode("c", "C"),
    )

    @Test fun columnFallbackAndConfirmUseTheSettledSelection() {
        val state = NativeColumnPickerState(listOf(WheelItem("a", "A"), WheelItem("b", "B")), "missing")
        assertEquals("a", state.value)
        assertFalse(state.select(0, "missing"))
        assertTrue(state.settle(listOf("b")))
        assertEquals("b", state.value)
        assertFalse(state.settle(listOf("b")))
        assertEquals("", NativeColumnPickerState(emptyList(), null).value)
    }

    @Test fun allTimeModesHaveTheExpectedColumnsAndFormat() {
        val cases = listOf(
            Triple(TimePickMode.Year, "2024", 1),
            Triple(TimePickMode.YearMonth, "2024-02", 2),
            Triple(TimePickMode.Date, "2024-02-29", 3),
            Triple(TimePickMode.Time, "08:05", 2),
            Triple(TimePickMode.DateTime, "2024-02-29 08:05", 3),
        )
        cases.forEach { (mode, value, count) ->
            val state = NativeTimePickerState(mode, value, 2020, 2030, now)
            assertEquals(value, state.value)
            assertEquals(count, state.options.size)
        }
    }

    @Test fun simultaneousDateSettleClampsOnlyAfterReadingAllActiveColumns() {
        val state = NativeTimePickerState(TimePickMode.DateTime, "2024-02-29 08:05", 2020, 2030, now)
        assertTrue(state.settle(listOf("2025", "3", "29")))
        assertEquals("2025-03-29 08:05", state.value) // intermediate February must not reduce it to 28
        assertTrue(state.settle(listOf("2025", "2", "29")))
        assertEquals("2025-02-28 08:05", state.value)
    }

    @Test fun segmentSwitchPreservesSimultaneousYearAndDayThenHourAndMinute() {
        val state = NativeTimePickerState(TimePickMode.DateTime, "2024-02-10 08:05", 2020, 2030, now)
        assertTrue(state.settle(listOf("2025", "2", "20")))
        assertFalse(state.settle(listOf("2025", "2", "20")))
        state.selectSegment(1)
        assertEquals("2025-02-20 08:05", state.value)
        assertTrue(state.settle(listOf("18", "45")))
        assertFalse(state.settle(listOf("18", "45")))
        state.selectSegment(0)
        assertEquals(listOf("2025", "2", "20"), state.selected)
        assertEquals("2025-02-20 18:45", state.value)
    }

    @Test fun segmentSwitchSettlesDateAndTimeIndependentlyWithoutDiscardingEither() {
        val state = NativeTimePickerState(TimePickMode.DateTime, "2024-01-31 08:05", 2020, 2030, now)
        state.settle(listOf("2024", "2", "31"))
        state.selectSegment(1)
        assertEquals(listOf("8", "5"), state.selected)
        state.settle(listOf("18", "45"))
        state.selectSegment(0)
        assertEquals(listOf("2024", "2", "29"), state.selected)
        assertEquals("2024-02-29 18:45", state.value)
        assertEquals(listOf("日期  2024-02-29", "时间  18:45"), state.segments)
    }

    @Test fun controlledValueUpdateKeepsTheActiveSegmentButNewOpeningResetsIt() {
        val tab = NativePickerSegment()
        val first = NativeTimePickerState(TimePickMode.DateTime, "2024-02-29 08:05", 2020, 2030, now, tab)
        first.selectSegment(1)
        first.select(0, "18")
        val echoed = NativeTimePickerState(TimePickMode.DateTime, first.value, 2020, 2030, now, tab)
        assertEquals(1, echoed.segment)
        assertEquals(listOf("18", "5"), echoed.selected)
        assertEquals(0, NativeTimePickerState(TimePickMode.DateTime, first.value, 2020, 2030, now).segment)
    }

    @Test fun suppliedYearLimitsAndInvalidDatesNormalizeToRepresentableOptions() {
        val state = NativeTimePickerState(TimePickMode.DateTime, "2024-02-29 99:99", 2025, 2030, now)
        assertEquals("2025-02-28 23:59", state.value)
        assertEquals(listOf("2025", "2026", "2027", "2028", "2029", "2030"), state.options[0].map { it.value })
        val reversed = NativeTimePickerState(TimePickMode.Year, "2024", 2030, 2020, now)
        assertEquals("2030", reversed.value)
        assertEquals(1, reversed.options.single().size)
        val default = NativeTimePickerState(TimePickMode.Date, null, null, null, now)
        assertEquals(2021, default.start)
        assertEquals(2031, default.end)
        assertEquals("2026-11-03", default.value)
    }

    @Test fun changingYearOrMonthClampsDayAndPreservesTime() {
        val state = NativeTimePickerState(TimePickMode.DateTime, "2024-02-29 08:05", 2020, 2030, now)
        state.select(0, "2025")
        assertEquals("2025-02-28 08:05", state.value)
        state.select(1, "4")
        state.select(2, "30")
        state.select(1, "2")
        assertEquals("2025-02-28 08:05", state.value)
    }

    @Test fun treeSheetDefaultsDescendantsAndDiscardOldBranchWhenSettlingAncestor() {
        val state = NativeTreePickerState(tree, listOf("a", "shared", "a12"), 3, false)
        assertTrue(state.complete)
        state.settle(listOf("b", "shared", "a12"))
        assertEquals(listOf("b", "b1"), state.value)
        assertTrue(state.complete)
        assertEquals(listOf("a", "shared", "a11"), NativeTreePickerState(tree, emptyList(), 3, false).value)
    }

    @Test fun treePageRequiresExplicitDescendantsAndAdvancesOneLevelAtATime() {
        val state = NativeTreePickerState(tree, emptyList(), 3, true)
        assertFalse(state.complete)
        assertEquals(0, state.level)
        state.select(0, "a")
        assertEquals(listOf("a"), state.value)
        assertEquals(1, state.level)
        assertFalse(state.complete)
        state.select(1, "shared")
        assertEquals(2, state.level)
        assertFalse(state.complete)
        state.select(2, "a12")
        assertTrue(state.complete)
        assertEquals(listOf("a", "shared", "a12"), state.value)
        state.visit(0)
        assertEquals(0, state.level)
        assertTrue(state.complete)
        state.select(0, "b")
        assertEquals(listOf("b"), state.value)
        assertEquals(1, state.level)
        assertFalse(state.complete)
    }

    @Test fun treePageKeepsOnlyValidInitialPrefixAndSupportsShallowLeavesAndLimits() {
        val state = NativeTreePickerState(tree, listOf("a", "invalid", "a11"), 3, true)
        assertEquals(listOf("a"), state.value)
        assertEquals(1, state.level)
        assertFalse(state.complete)
        assertFalse(state.select(1, "missing"))
        state.visit(0)
        state.select(0, "c")
        assertEquals(listOf("c"), state.value)
        assertTrue(state.complete)
        assertEquals(0, state.level)
        assertTrue(NativeTreePickerState(tree, listOf("a"), 1, true).complete)
        assertFalse(NativeTreePickerState(tree, emptyList(), 0, true).complete)
        assertFalse(NativeTreePickerState(emptyList(), emptyList(), 3, true).complete)
    }

    @Test fun hostCancelAndReleaseNeverSettleAndOldReleaseCannotClearNewBody() {
        class Body : NativePickerContent {
            var settled = 0
            var cancelled = 0
            var released = 0
            override fun settle() { settled++ }
            override fun cancel() { cancelled++ }
            override fun release() { released++; cancel() }
        }
        val old = Body()
        val next = Body()
        val handle = NativePickerHandle()
        handle.body = old
        handle.cancel()
        assertEquals(0, old.settled)
        assertEquals(1, old.cancelled)
        handle.body = next
        handle.release(old)
        assertSame(next, handle.body)
        handle.settle()
        assertEquals(1, next.settled)
        handle.release(next)
        assertNull(handle.body)
        assertEquals(1, next.cancelled)
    }
}
