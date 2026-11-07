package io.valdiroutes.mmkv

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double

/** Persist the structured envelope directly; no legacy value decoding or conversion. */
internal object StorageCodec {
    data class Read(val found: Boolean, val payload: Map<String, Any?>, val error: String = "")

    fun decode(stored: String?): Read {
        if (stored == null) return Read(false, emptyMap())
        return try {
            val value = Json.parseToJsonElement(stored)
            require(value is JsonObject && value.containsKey("value")) { "Invalid storage envelope" }
            Read(true, value.mapValues { unwrap(it.value) })
        } catch (_: Exception) {
            // Parser diagnostics can contain stored secrets, including object keys and values.
            Read(false, emptyMap(), "Invalid stored value: invalid JSON storage envelope")
        }
    }

    fun encode(payload: Map<String, Any?>): String {
        require(payload.containsKey("value")) { "Storage payload is missing value" }
        return wrap(payload).toString()
    }

    private fun wrap(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is Map<*, *> -> JsonObject(buildMap {
            value.forEach { (key, item) ->
                require(key is String) { "Storage dictionary keys must be strings" }
                put(key, wrap(item))
            }
        })
        is List<*> -> JsonArray(value.map { wrap(it) })
        is String -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        is Number -> {
            require(value.toDouble().isFinite()) { "Storage numbers must be finite" }
            JsonPrimitive(value)
        }
        else -> throw IllegalArgumentException("Storage payload must contain only structured values")
    }

    private fun unwrap(value: JsonElement): Any? = when (value) {
        JsonNull -> null
        is JsonObject -> value.mapValues { unwrap(it.value) }
        is JsonArray -> value.map { unwrap(it) }
        is JsonPrimitive -> when {
            value.isString -> value.content
            else -> value.booleanOrNull ?: value.content.toIntOrNull() ?: value.content.toLongOrNull() ?: value.double.also {
                require(it.isFinite()) { "Storage numbers must be finite" }
            }
        }
    }
}
