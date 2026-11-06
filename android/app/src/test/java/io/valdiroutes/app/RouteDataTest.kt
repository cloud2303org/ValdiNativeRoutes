package io.valdiroutes.app

import io.valdiroutes.pages.ResolvedNavigation
import io.valdiroutes.pages.RouteEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
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
    fun ordinaryPushRetainsRootAndResolvedNavigation() {
        val navigator = navigator()
        val root = navigator.stack.single()
        val navigation = ResolvedNavigation("slideUp", 450.0, "push")

        navigator.open("detail", mapOf("id" to 7), navigation)
        val page = navigator.stack.last()

        assertEquals(listOf(root.id, page.id), navigator.currentPages().map { it.pageId })
        assertSame(root, navigator.stack.first())
        assertSame(page, navigator.frontPage())
        assertEquals(Presentation.Push, page.presentation)
        assertSame(navigation, page.navigation)
        assertFalse(root.removed)
    }

    @Test
    fun pushFinishCapturesResultOnRemovalAndKeepsFirstResult() {
        val navigator = navigator()
        val root = navigator.stack.single()
        var calls = 0
        var received: Map<String, Any?>? = null
        var canceled = true
        navigator.open("detail") { result, wasCanceled ->
            calls++
            received = result
            canceled = wasCanceled
        }
        val page = navigator.stack.last()
        val result = Payload()

        navigator.finish(page.id, result.data)
        assertTrue(page.removed)
        assertSame(root, navigator.stack.single())
        assertEquals(expected, received)
        result.mutate()
        // A removed page ignores subsequent results before validating them.
        navigator.finish(page.id, mapOf("second" to Any()))
        navigator.cancel(page.id)
        page.remove()

        assertEquals(1, calls)
        assertFalse(canceled)
        assertEquals(expected, received)
    }

    @Test
    fun cancellationReturnsEmptyMapAndRemainsFirstResult() {
        val navigator = navigator()
        var calls = 0
        var received: Pair<Map<String, Any?>, Boolean>? = null
        navigator.open("detail") { result, canceled ->
            calls++
            received = result to canceled
        }
        val page = navigator.stack.last()

        navigator.cancel(page.id)
        navigator.finish(page.id, Payload().data)
        navigator.cancel(page.id)

        assertTrue(page.removed)
        assertEquals(1, calls)
        assertEquals(emptyMap<String, Any?>() to true, received)
    }

    @Test
    fun successfulEmptyResultIsDistinctFromCancellation() {
        val navigator = navigator()
        var calls = 0
        var received: Pair<Map<String, Any?>, Boolean>? = null
        navigator.open("detail") { result, canceled ->
            calls++
            received = result to canceled
        }
        val page = navigator.stack.last()

        navigator.finish(page.id, emptyMap())
        navigator.cancel(page.id)

        assertEquals(1, calls)
        assertEquals(emptyMap<String, Any?>() to false, received)
    }

    @Test
    fun backCancelsTopPageAndRetainsRoot() {
        val navigator = navigator()
        val root = navigator.stack.single()
        val received = mutableListOf<Pair<Map<String, Any?>, Boolean>>()
        navigator.open("detail") { result, canceled -> received.add(result to canceled) }
        val page = navigator.stack.last()

        navigator.back()
        navigator.back()
        navigator.cancel(root.id)
        navigator.finish(root.id, emptyMap())

        assertTrue(page.removed)
        assertFalse(root.removed)
        assertSame(root, navigator.stack.single())
        assertSame(root, navigator.frontPage())
        assertEquals(listOf(emptyMap<String, Any?>() to true), received)
    }

    @Test
    fun backDeltaCancelsTopDownOnceAndRetainsRoot() {
        val navigator = navigator()
        val root = navigator.stack.single()
        val canceledPages = mutableListOf<String>()
        navigator.open("detail") { result, canceled ->
            assertTrue(canceled)
            assertTrue(result.isEmpty())
            canceledPages.add("first")
        }
        val first = navigator.stack.last()
        navigator.open("detail") { result, canceled ->
            assertTrue(canceled)
            assertTrue(result.isEmpty())
            assertFalse(first.removed)
            canceledPages.add("second")
        }

        navigator.back(0)
        assertEquals(3, navigator.currentPages().size)
        navigator.back(10)
        navigator.popToRoot()

        assertEquals(listOf("second", "first"), canceledPages)
        assertSame(root, navigator.stack.single())
        assertFalse(root.removed)
    }

    @Test
    fun replaceAndResetCancelDisplacedPushes() {
        val navigator = navigator()
        val received = mutableListOf<Pair<Map<String, Any?>, Boolean>>()
        navigator.open("detail") { result, canceled -> received.add(result to canceled) }
        val replaced = navigator.stack.last()

        navigator.replace("detail", emptyMap(), NativeRouteAnimations.Default)
        assertTrue(replaced.removed)
        assertEquals(2, navigator.currentPages().size)
        assertEquals(listOf(emptyMap<String, Any?>() to true), received)

        navigator.open("detail") { result, canceled -> received.add(result to canceled) }
        val reset = navigator.stack.last()
        navigator.reset("home", emptyMap())

        assertTrue(reset.removed)
        assertEquals("home", navigator.currentPages().single().route)
        assertEquals(List(2) { emptyMap<String, Any?>() to true }, received)
    }
}
