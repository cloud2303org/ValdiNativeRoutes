package io.valdiroutes.app_ui.ui

import org.junit.Assert.*
import org.junit.Test

/** No Android, Valdi runtime, clock, or generated-model equality is needed for these tests. */
class NativeWheelLogicTest {
    private val fallback = WheelDate(2026, 11, 3, 17, 42)
    private val tree = listOf(
        WheelNode("a", "A", listOf(
            WheelNode("a1", "A1", listOf(WheelNode("a11", "A11"), WheelNode("a12", "A12"))),
            WheelNode("a2", "A2"),
        )),
        WheelNode("b", "B", listOf(WheelNode("b1", "B1"))),
        WheelNode("c", "C"),
    )

    @Test fun gregorianLeapRulesIncludeCenturyExceptions() {
        assertEquals(29, WheelDate.days(2000, 2))
        assertEquals(28, WheelDate.days(1900, 2))
        assertEquals(29, WheelDate.days(2024, 2))
        assertEquals(28, WheelDate.days(2025, 2))
        assertEquals(30, WheelDate.days(2026, 4))
        assertEquals(31, WheelDate.days(2026, 12))
    }

    @Test fun changingDateParentsClampsDayAndPreservesTime() {
        val leap = WheelDate(2024, 2, 29, 23, 59)
        assertEquals(WheelDate(2025, 2, 28, 23, 59), leap.change("date", 0, 2025, 2020, 2030))
        val january = leap.copy(month = 1, day = 31)
        assertEquals(29, january.change("date", 1, 2, 2020, 2030).day)
        assertEquals(30, january.change("date", 1, 4, 2020, 2030).day)
    }

    @Test fun boundsClampYearBeforeComputingLeapDay() {
        assertEquals(WheelDate(2025, 2, 28, 0, 59), WheelDate(2024, 2, 29, -1, 80).clamp(2025, 2030))
        assertEquals(WheelDate(2030, 12, 31, 23, 0), WheelDate(2040, 13, 99, 30, -1).clamp(2025, 2030))
    }

    @Test fun settlingYearAndActiveDayKeepsTheVisibleDayBeforeSegmentSwitch() {
        val original = WheelDate(2024, 2, 10, 8, 5)
        val settled = original.settle("date", listOf("2025", "2", "20"), 2020, 2030)
        assertEquals(WheelDate(2025, 2, 20, 8, 5), settled)
        assertEquals(listOf("8", "5"), settled.selected("time"))
    }

    @Test fun settlingSimultaneousDateColumnsClampsAgainstTheFinalYearAndMonth() {
        val leap = WheelDate(2024, 2, 29, 23, 59)
        assertEquals(WheelDate(2025, 3, 29, 23, 59),
            leap.settle("date", listOf("2025", "3", "29"), 2020, 2030))
        assertEquals(WheelDate(2025, 2, 28, 23, 59),
            leap.settle("date", listOf("2025", "2", "29"), 2020, 2030))
        assertEquals(WheelDate(2024, 2, 29, 23, 59),
            leap.copy(month = 1, day = 31).settle("date", listOf("2024", "2", "31"), 2020, 2030))
        assertEquals(WheelDate(2025, 2, 28, 23, 59),
            leap.settle("date", listOf("2024", "2", "29"), 2025, 2030))
    }

    @Test fun settlingTimeSnapshotKeepsDateAndUpdatesBothActiveColumns() {
        val original = WheelDate(2024, 2, 20, 8, 5)
        val settled = original.settle("time", listOf("18", "45"), 2020, 2030)
        assertEquals(WheelDate(2024, 2, 20, 18, 45), settled)
        assertEquals(settled, settled.settle("time", listOf("18", "45"), 2020, 2030))
    }

    @Test fun settlingPartialModesReadsOnlyTheirVisibleColumns() {
        val leap = WheelDate(2024, 2, 29, 8, 5)
        assertEquals(WheelDate(2025, 2, 28, 8, 5),
            leap.settle("year", listOf("2025", "3", "20"), 2020, 2030))
        assertEquals(WheelDate(2025, 3, 29, 8, 5),
            leap.settle("year-month", listOf("2025", "3", "20"), 2020, 2030))
        assertEquals(leap, leap.settle("date", emptyList(), 2020, 2030))
        assertEquals(leap.copy(day = 20),
            leap.settle("date", listOf("invalid", "", "20"), 2020, 2030))
    }

    @Test fun parseAndFormatEveryMode() {
        val cases = mapOf("year" to "2024", "year-month" to "2024-02", "date" to "2024-02-29",
            "time" to "08:05", "datetime" to "2024-02-29 08:05")
        cases.forEach { (mode, value) -> assertEquals(value, WheelDate.parse(value, fallback).format(mode)) }
        assertEquals(fallback, WheelDate.parse("invalid", fallback))
        assertEquals(fallback, WheelDate.parse("", fallback))
    }

    @Test fun partialDateParsingKeepsOtherSelectionParts() {
        assertEquals(fallback.copy(year = 2024), WheelDate.parse("2024", fallback))
        assertEquals(fallback.copy(hour = 8, minute = 5), WheelDate.parse("08:05", fallback))
    }

    @Test fun switchingSegmentModesRetainsBothDateAndTimeValues() {
        val original = WheelDate(2024, 1, 31, 8, 5)
        val dateChanged = original.change("date", 1, 2, 2020, 2030)
        val timeChanged = dateChanged.change("time", 0, 18, 2020, 2030).change("time", 1, 45, 2020, 2030)
        assertEquals("2024-02-29 18:45", timeChanged.format("datetime"))
        assertEquals(listOf("2024", "2", "29"), timeChanged.selected("date"))
        assertEquals(listOf("18", "45"), timeChanged.selected("time"))
    }

    @Test fun columnsRespectModeYearBoundsAndMonthLength() {
        val parts = WheelDate(2024, 2, 29, 8, 5)
        assertEquals(listOf("2023", "2024", "2025"), parts.columns("year", 2023, 2025).single().map { it.value })
        assertEquals(listOf(3, 12), parts.columns("year-month", 2023, 2025).map { it.size })
        assertEquals(listOf(3, 12, 29), parts.columns("date", 2023, 2025).map { it.size })
        assertEquals(listOf(24, 60), parts.columns("time", 2023, 2025).map { it.size })
        assertEquals("05分", parts.columns("time", 2023, 2025)[1][5].label)
    }

    @Test fun invalidTreePathDefaultsToFirstValidDescendant() {
        assertEquals(listOf("a", "a1", "a11"), normalizeWheelPath(tree, listOf("missing"), 3))
        assertEquals(listOf("a", "a1", "a12"), normalizeWheelPath(tree, listOf("a", "bad", "a12"), 3))
    }

    @Test fun replacingParentDiscardsOldDescendantEvenIfNamesOverlap() {
        assertEquals(listOf("b", "b1"), replaceWheelPath(tree, listOf("a", "a1", "a12"), 0, "b", 3))
        assertEquals(listOf("a", "a1", "a11"), replaceWheelPath(tree, listOf("a", "a2"), 1, "a1", 3))
    }

    @Test fun variableDepthTreeDoesNotInventEmptyColumns() {
        val path = normalizeWheelPath(tree, listOf("c", "stale", "stale"), 8)
        assertEquals(listOf("c"), path)
        assertEquals(1, wheelTreeColumns(tree, path, 8).size)
        val short = normalizeWheelPath(tree, listOf("a", "a2"), 3)
        assertEquals(listOf("a", "a2"), short)
        assertEquals(2, wheelTreeColumns(tree, short, 3).size)
        assertEquals(emptyList<String>(), normalizeWheelPath(emptyList(), emptyList(), 3))
    }

    @Test fun treeColumnLimitIsHonored() {
        assertEquals(listOf("a"), normalizeWheelPath(tree, emptyList(), 1))
        assertEquals(2, wheelTreeColumns(tree, listOf("a", "a1", "a11"), 2).size)
        assertEquals(emptyList<String>(), normalizeWheelPath(tree, emptyList(), 0))
    }

    @Test fun selectionFallsBackAndSnapIsBoundedAtBothEnds() {
        val options = listOf(WheelItem("x", "X"), WheelItem("y", "Y"))
        assertEquals(1, wheelSelection(options, "y"))
        assertEquals(0, wheelSelection(options, "unknown"))
        assertEquals(0, wheelSelection(emptyList(), "x"))
        assertEquals(0, wheelSnap(-2f, 10))
        assertEquals(9, wheelSnap(100f, 10))
        assertEquals(3, wheelSnap(3.49f, 10))
        assertEquals(4, wheelSnap(3.5f, 10))
        assertEquals(0, wheelSnap(100f, 0))
    }

    @Test fun echoesDoNotRewindNewerSelectionWhileUpdatesAreInFlight() {
        val echo = WheelEcho<String>()
        echo.touch()
        echo.sent("a")
        echo.sent("b")
        assertTrue(echo.isEcho("a"))
        assertTrue(echo.isEcho("a")) // unrelated rerender still shows previous acknowledged value
        assertTrue(echo.isEcho("b"))
        assertFalse(echo.isEcho("external"))
        assertFalse(echo.isEcho("a"))
    }

    @Test fun coalescedEchoAcknowledgesEarlierValues() {
        val echo = WheelEcho<String>()
        echo.sent("a")
        echo.sent("b")
        echo.sent("c")
        assertTrue(echo.isEcho("c"))
        assertFalse(echo.isEcho("a"))
    }

    @Test fun recyclingResetsTouchAndAllEchoHistory() {
        val echo = WheelEcho<List<String>>()
        assertFalse(echo.touched)
        echo.touch()
        echo.sent(listOf("a", "b"))
        assertTrue(echo.isEcho(listOf("a", "b")))
        echo.sent(listOf("a", "c"))
        echo.reset()
        assertFalse(echo.touched)
        assertFalse(echo.isEcho(listOf("a", "b")))
        assertFalse(echo.isEcho(listOf("a", "c")))
    }

    @Test fun treeEchoUsesListEqualityWithoutDelimiterOrJsonCollisions() {
        val echo = WheelEcho<List<String>>()
        echo.sent(listOf("a,b", "c"))
        assertFalse(echo.isEcho(listOf("a", "b,c")))
        echo.sent(listOf("\"quoted\"", "[x]"))
        assertTrue(echo.isEcho(listOf("\"quoted\"", "[x]")))
    }

    @Test fun largeOptionListMeasuresOnlyRequestedVisibleLabels() {
        val cache = WheelLabelCache()
        val items = (1..9999).map { "$it 年" }
        var measurements = 0
        repeat(3) {
            for (index in 4997..5002) {
                assertEquals(items[index], cache.label(index, 120) { measurements++; items[index] })
            }
        }
        assertEquals(6, measurements)
        assertEquals(6, cache.size)
    }

    @Test fun longScrollBoundsCacheAndKeepsRecentlyVisibleLabels() {
        val cache = WheelLabelCache()
        var measurements = 0
        fun label(index: Int) = cache.label(index, 120) { measurements++; "$index" }
        for (index in 0 until 9999) {
            label(index)
            assertTrue(cache.size <= 32)
        }
        assertEquals(32, cache.size)
        assertEquals("9998", label(9998))
        assertEquals(9999, measurements)
        // A distant old row was evicted; revisiting it measures only that row.
        assertEquals("0", label(0))
        assertEquals(10000, measurements)
        assertEquals(32, cache.size)
        assertEquals("9998", label(9998))
        assertEquals(10000, measurements)
    }

    @Test fun widthAndConfigChangesInvalidateLabelsAtTheSameIndex() {
        val cache = WheelLabelCache()
        assertEquals("wide label", cache.label(3, 120) { "wide label" })
        assertEquals("short…", cache.label(3, 60) { "short…" })
        assertEquals(1, cache.size)
        cache.clear() // NativeWheelColumn.configure clears on a changed configuration.
        assertEquals(0, cache.size)
        assertEquals("replacement", cache.label(3, 60) { "replacement" })
    }

    @Test fun failedConfigClearsInteractionAndCallbackBeforeRethrowingOriginalFailure() {
        val echo = WheelEcho<String>()
        echo.touch()
        echo.sent("old")
        var callback: (() -> Unit)? = {}
        var resets = 0
        val failure = IllegalArgumentException("invalid generated model")
        try {
            applyWheelConfigOrReset(reset = {
                resets++
                callback = null
                echo.reset()
            }) { throw failure }
            fail("Expected config failure")
        } catch (actual: IllegalArgumentException) {
            assertSame(failure, actual)
            assertNull(callback)
            assertFalse(echo.touched)
            assertFalse(echo.isEcho("old"))
            assertEquals(1, resets)
        }
    }

    @Test fun successfulConfigDoesNotClearPendingUserEcho() {
        val echo = WheelEcho<String>()
        echo.touch()
        echo.sent("selected")
        val result = applyWheelConfigOrReset(reset = { echo.reset() }) { "applied" }
        assertEquals("applied", result)
        assertTrue(echo.touched)
        assertTrue(echo.isEcho("selected"))
    }

    @Test fun configFailureRemainsPrimaryIfCleanupAlsoFails() {
        val failure = IllegalArgumentException("bad config")
        val cleanupFailure = IllegalStateException("cleanup failure")
        try {
            applyWheelConfigOrReset(reset = { throw cleanupFailure }) { throw failure }
            fail("Expected config failure")
        } catch (actual: IllegalArgumentException) {
            assertSame(failure, actual)
            assertEquals(listOf(cleanupFailure), actual.suppressed.toList())
        }
    }
}
