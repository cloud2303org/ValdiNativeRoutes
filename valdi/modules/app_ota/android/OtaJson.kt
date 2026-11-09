package io.valdiroutes.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

internal fun parseOtaObject(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

// Protocol values must keep their JSON type; never coerce strings to numbers.
internal fun JsonElement.otaString(): String {
    check(this is JsonPrimitive && isString) { "Expected OTA string" }
    return content
}

internal fun JsonElement.otaLong(): Long {
    check(this is JsonPrimitive && !isString) { "Expected OTA integer" }
    return content.toLongOrNull() ?: error("Expected OTA integer")
}

internal fun JsonObject.otaString(name: String): String = getValue(name).otaString()
