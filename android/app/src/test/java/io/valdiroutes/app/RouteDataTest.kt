package io.valdiroutes.app

import io.valdiroutes.pages.RouteEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteDataTest {
    private fun navigator() = Navigator(
        RouteTable(
            mapOf(
                "home" to RouteEntry("home", "valdi", "Home", "app_pages/src/HomePage"),
                "detail" to RouteEntry("detail", "valdi", "Detail", "app_pages/src/DetailPage"),
            ),
            null,
            "home",
        ),
    ).apply { open("home") }

    private class Payload {
        val leaf = linkedMapOf<String, Any?>("enabled" to true, "missing" to null)
        val nested = mutableListOf<Any?>(false, null, 3.5)
        val items = mutableListOf<Any?>(leaf, nested)
        val data = linkedMapOf<String, Any?>("items" to items, "name" to "before", "count" to 7)

        fun mutate() {
            leaf["enabled"] = false
            leaf["extra"] = "later"
            nested[0] = true
            nested.add("later")
            items.add("later")
            data["name"] = "after"
        }
    }

    private val expected = mapOf(
        "items" to listOf(mapOf("enabled" to true, "missing" to null), listOf(false, null, 3.5)),
        "name" to "before",
        "count" to 7,
    )

    @Test
    fun openCapturesNestedParamsBeforeCallerMutation() {
        val navigator = navigator()
        val input = Payload()
        navigator.open("detail", input.data)
        val entry = navigator.stack.last()
        val page = NativePage(entry, navigator, Insets(0f, 0f, 0f, 0f))

        input.mutate()

        assertEquals(expected, page.params)
        assertEquals(expected, entry.params)
        assertEquals(expected, navigator.currentPages().last().params)
    }

    @Test
    fun nativeParamsAndStackSnapshotsCannotMutateRetainedGraph() {
        val navigator = navigator()
        navigator.open("detail", Payload().data)
        val entry = navigator.stack.last()
        val page = NativePage(entry, navigator, Insets(0f, 0f, 0f, 0f))
        val params = page.params
        val items = params.getValue("items") as List<*>
        val leaf = items[0] as Map<*, *>
        val nested = items[1] as List<*>

        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (params as MutableMap<String, Any?>)["name"] = "changed"
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (leaf as MutableMap<String, Any?>)["enabled"] = false
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (items as MutableList<Any?>).clear()
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (nested as MutableList<Any?>)[0] = true
        }

        val snapshot = navigator.currentPages().last()
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (snapshot.params as MutableMap<String, Any?>).clear()
        }
        snapshot.params = mapOf("unrelated" to true)
        assertEquals(expected, page.params)
        assertEquals(expected, navigator.currentPages().last().params)
    }

    @Test
    fun replaceAndResetCaptureTheirOwnParams() {
        val navigator = navigator()
        val replacement = Payload()
        navigator.replace("detail", replacement.data, NativeRouteAnimations.Default)
        replacement.mutate()
        assertEquals(expected, navigator.stack.last().params)

        val reset = Payload()
        navigator.reset("home", reset.data)
        reset.mutate()
        assertEquals(expected, navigator.currentPages().single().params)
    }

    @Test
    fun sheetFinishCapturesResultBeforeHideAndKeepsFirstResult() {
        val navigator = navigator()
        var calls = 0
        var received: Map<String, Any?>? = null
        var canceled = true
        navigator.open("detail", presentation = Presentation.Sheet) { result, wasCanceled ->
            calls++
            received = result
            canceled = wasCanceled
        }
        val sheet = requireNotNull(navigator.sheet)
        val result = Payload()

        navigator.finish(sheet.id, result.data)
        assertTrue(navigator.sheetClosing)
        assertNull(received)
        result.mutate()
        // A second result is ignored before validation too: the accepted first result still wins.
        navigator.finish(sheet.id, mapOf("second" to Any()))
        navigator.cancel(sheet.id)
        navigator.onSheetHidden()
        navigator.onSheetHidden()

        assertEquals(1, calls)
        assertFalse(canceled)
        assertEquals(expected, received)
    }

    @Test
    fun cancellationReturnsEmptyMapAndRemainsFirstResult() {
        val navigator = navigator()
        var received: Pair<Map<String, Any?>, Boolean>? = null
        navigator.open("detail", presentation = Presentation.CompactSheet) { result, canceled ->
            received = result to canceled
        }
        val sheet = requireNotNull(navigator.sheet)

        navigator.cancel(sheet.id)
        navigator.finish(sheet.id, Payload().data)
        navigator.onSheetHidden()

        assertEquals(emptyMap<String, Any?>() to true, received)
    }

    @Test
    fun successfulEmptyResultIsDistinctFromCancellation() {
        val navigator = navigator()
        var received: Pair<Map<String, Any?>, Boolean>? = null
        navigator.open("detail", presentation = Presentation.Sheet) { result, canceled ->
            received = result to canceled
        }
        val sheet = requireNotNull(navigator.sheet)

        navigator.finish(sheet.id, emptyMap())
        navigator.cancel(sheet.id)
        navigator.onSheetHidden()

        assertEquals(emptyMap<String, Any?>() to false, received)
    }
}
