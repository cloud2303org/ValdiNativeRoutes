package io.valdiroutes.app

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** Persist the structured envelope directly; no legacy value decoding or conversion. */
internal object StorageCodec {
    data class Read(val found: Boolean, val payload: Map<String, Any?>, val error: String = "")

    fun decode(stored: String?): Read {
        if (stored == null) return Read(false, emptyMap())
        return try {
            val reader = JSONTokener(stored)
            val value = reader.nextValue()
            require(reader.nextClean() == '\u0000') { "Trailing data in stored value" }
            require(value is JSONObject && value.has("value")) { "Invalid storage envelope" }
            @Suppress("UNCHECKED_CAST")
            Read(true, unwrap(value) as Map<String, Any?>)
        } catch (error: Exception) {
            Read(false, emptyMap(), "Invalid stored value: ${error.message ?: "decode failed"}")
        }
    }

    fun encode(payload: Map<String, Any?>): String {
        require(payload.containsKey("value")) { "Storage payload is missing value" }
        return wrap(payload).toString()
    }

    // JSONObject(Map) drops null entries. Explicit JSON nulls must survive at every dictionary level.
    private fun wrap(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().apply {
            value.forEach { (key, item) ->
                require(key is String) { "Storage dictionary keys must be strings" }
                put(key, wrap(item))
            }
        }
        is List<*> -> JSONArray().apply { value.forEach { put(wrap(it)) } }
        is String, is Boolean -> value
        is Number -> value.also { require(it.toDouble().isFinite()) { "Storage numbers must be finite" } }
        else -> throw IllegalArgumentException("Storage payload must contain only structured values")
    }

    private fun unwrap(value: Any?): Any? = when {
        value == null || value === JSONObject.NULL -> null
        value is JSONObject -> value.keys().asSequence().associateWith { unwrap(value.get(it)) }
        value is JSONArray -> (0 until value.length()).map { unwrap(value.get(it)) }
        else -> value
    }
}
