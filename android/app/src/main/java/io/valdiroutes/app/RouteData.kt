package io.valdiroutes.app

import java.util.Collections
import java.util.IdentityHashMap

/** Route data has value semantics: callers never retain a mutable part of a page's params or accepted result. */
internal fun snapshotRouteData(data: Map<String, Any?>): Map<String, Any?> {
    val ancestors = IdentityHashMap<Any, Boolean>()

    fun copy(value: Any?): Any? = when (value) {
        null, is String, is Boolean, is Byte, is Short, is Int, is Long -> value
        is Double -> value.also { require(it.isFinite()) { "Route numbers must be finite" } }
        is Float -> value.also { require(it.isFinite()) { "Route numbers must be finite" } }
        is Map<*, *> -> {
            require(ancestors.put(value, true) == null) { "Route data must not contain cycles" }
            try {
                val result = LinkedHashMap<String, Any?>(value.size)
                for ((key, item) in value) {
                    require(key is String) { "Route dictionary keys must be strings" }
                    result[key] = copy(item)
                }
                Collections.unmodifiableMap(result)
            } finally {
                ancestors.remove(value)
            }
        }
        is List<*> -> {
            require(ancestors.put(value, true) == null) { "Route data must not contain cycles" }
            try {
                Collections.unmodifiableList(value.map { copy(it) })
            } finally {
                ancestors.remove(value)
            }
        }
        else -> throw IllegalArgumentException("Route data must contain only maps, lists and JSON scalar values")
    }

    @Suppress("UNCHECKED_CAST")
    return copy(data) as Map<String, Any?>
}
