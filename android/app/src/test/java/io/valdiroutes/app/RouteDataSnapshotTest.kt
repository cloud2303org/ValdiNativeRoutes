package io.valdiroutes.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs directly on the JVM against the same production helper used by PageEntry. */
class RouteDataSnapshotTest {
    @Test
    fun callerMutationCannotChangeNestedSnapshotOrScalarTypes() {
        val leaf = mutableMapOf<String, Any?>("flag" to true, "missing" to null)
        val nested = mutableListOf<Any?>(false, null, 3.5)
        val items = mutableListOf<Any?>(leaf, nested)
        val source = mutableMapOf<String, Any?>("items" to items, "count" to 7, "__proto__" to "data")
        val snapshot = snapshotRouteData(source)

        leaf["flag"] = false
        leaf["missing"] = "later"
        nested[0] = true
        nested.add("later")
        items.clear()
        source.clear()

        assertEquals(
            mapOf(
                "items" to listOf(mapOf("flag" to true, "missing" to null), listOf(false, null, 3.5)),
                "count" to 7,
                "__proto__" to "data",
            ),
            snapshot,
        )
        val copiedLeaf = (snapshot.getValue("items") as List<*>)[0] as Map<*, *>
        assertTrue(copiedLeaf["flag"] is Boolean)
        assertTrue(copiedLeaf.containsKey("missing"))
        assertNull(copiedLeaf["missing"])
    }

    @Test
    fun returnedMapAndNestedOutputAccessorsCannotMutateStoredValues() {
        val snapshot = snapshotRouteData(mapOf("items" to listOf(mapOf("flag" to true), listOf(false, null))))
        val items = snapshot.getValue("items") as List<*>
        val leaf = items[0] as Map<*, *>
        val nested = items[1] as List<*>

        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (snapshot as MutableMap<String, Any?>).clear()
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (leaf as MutableMap<String, Any?>)["flag"] = false
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (items as MutableList<Any?>).clear()
        }
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (nested as MutableList<Any?>)[0] = true
        }
        assertEquals(mapOf("items" to listOf(mapOf("flag" to true), listOf(false, null))), snapshot)
    }

    @Test
    fun repeatedChildrenAreCopiedWithoutBeingMistakenForCycles() {
        val child = mutableListOf<Any?>(true, null)
        val snapshot = snapshotRouteData(mapOf("first" to child, "second" to child))
        child.clear()
        assertEquals(mapOf("first" to listOf(true, null), "second" to listOf(true, null)), snapshot)
    }

    @Test
    fun cyclesMutableObjectsNonStringKeysAndNonFiniteNumbersAreRejected() {
        val map = mutableMapOf<String, Any?>()
        map["self"] = map
        val list = mutableListOf<Any?>()
        list.add(list)

        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(map) }
        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(mapOf("list" to list)) }
        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(mapOf("object" to Any())) }
        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(mapOf("number" to Double.NaN)) }
        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(mapOf("number" to Float.POSITIVE_INFINITY)) }
        assertThrows(IllegalArgumentException::class.java) { snapshotRouteData(mapOf("key" to mapOf(1 to true))) }
    }
}
