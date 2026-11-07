package io.valdiroutes.mmkv

import org.junit.Assert.*
import org.junit.Test

class StorageCodecTest {
    @Test fun missingAndStoredNullAreDifferent() {
        assertFalse(StorageCodec.decode(null).found)
        val read = StorageCodec.decode("{\"value\":null}")
        assertTrue(read.found)
        assertTrue(read.payload.containsKey("value"))
        assertNull(read.payload["value"])
        assertEquals("{\"value\":null}", StorageCodec.encode(read.payload))
    }

    @Test fun scalarValuesRoundTripInsideTheStructuredEnvelope() {
        for ((stored, expected) in listOf("true" to true, "false" to false, "\"中文 👋\"" to "中文 👋", "\"\"" to "")) {
            val read = StorageCodec.decode("{\"value\":$stored}")
            assertEquals("", read.error)
            assertEquals(expected, read.payload["value"])
            assertEquals(expected, StorageCodec.decode(StorageCodec.encode(read.payload)).payload["value"])
        }
        assertEquals(1.25, (StorageCodec.decode("{\"value\":1.25}").payload["value"] as Number).toDouble(), 0.0)
    }

    @Test fun nestedMapsArraysNullAndSpecialKeysRoundTripWithoutStringPayloads() {
        val value = linkedMapOf("__proto__" to mapOf("safe" to true, "nullable" to null), "items" to listOf(null, false, "🧭", 3.5))
        val read = StorageCodec.decode(StorageCodec.encode(mapOf("value" to value)))
        assertEquals("", read.error)
        val result = read.payload["value"] as Map<*, *>
        assertEquals(mapOf("safe" to true, "nullable" to null), result["__proto__"])
        val items = result["items"] as List<*>
        assertNull(items[0])
        assertEquals(false, items[1])
        assertEquals("🧭", items[2])
        assertEquals(3.5, (items[3] as Number).toDouble(), 0.0)
    }

    @Test fun rootArrayDoesNotBecomeAnObjectOrAString() {
        val read = StorageCodec.decode(StorageCodec.encode(mapOf("value" to listOf("x", null, true))))
        assertEquals(listOf("x", null, true), read.payload["value"])
    }

    @Test fun truncatedAndTrailingCorruptDataAreErrors() {
        for (stored in listOf("", "{", "[1,", "{} trailing", "{}", "[]", "null")) {
            val read = StorageCodec.decode(stored)
            assertFalse(read.found)
            assertTrue(read.error.startsWith("Invalid stored value:"))
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidEnvelopeCannotAccidentallyStoreNull() {
        StorageCodec.encode(emptyMap())
    }

    @Test fun oldObjectEnvelopeKeepsMetadataAndStructuredValues() {
        val stored = """{"value":{"name":"旧值","integer":42,"decimal":1.25,"items":[null,{"empty":{},"list":[]}]},"revision":7,"nullable":null}"""
        val read = StorageCodec.decode(stored)
        assertTrue(read.found)
        assertEquals("", read.error)
        assertEquals(7, (read.payload["revision"] as Number).toInt())
        assertTrue(read.payload.containsKey("nullable"))
        assertNull(read.payload["nullable"])
        val value = read.payload["value"] as Map<*, *>
        assertEquals("旧值", value["name"])
        assertEquals(42, (value["integer"] as Number).toInt())
        assertEquals(1.25, (value["decimal"] as Number).toDouble(), 0.0)
        assertEquals(listOf(null, mapOf("empty" to emptyMap<String, Any?>(), "list" to emptyList<Any?>())), value["items"])
        assertEquals(read.payload, StorageCodec.decode(StorageCodec.encode(read.payload)).payload)
    }

    @Test fun missingKeysAndExplicitNullSurviveAtEveryDepth() {
        val payload = linkedMapOf(
            "value" to linkedMapOf(
                "nullable" to null,
                "child" to mapOf("nullable" to null),
                "items" to listOf(null, mapOf("nullable" to null), emptyMap<String, Any?>()),
            ),
            "nullable" to null,
        )
        val read = StorageCodec.decode(StorageCodec.encode(payload))
        assertTrue(read.found)
        assertEquals(payload, read.payload)
        val value = read.payload["value"] as Map<*, *>
        val items = value["items"] as List<*>
        for (dictionary in listOf(read.payload, value, value["child"] as Map<*, *>, items[1] as Map<*, *>)) {
            assertTrue(dictionary.containsKey("nullable"))
            assertNull(dictionary["nullable"])
            assertFalse(dictionary.containsKey("missing"))
        }
        assertNull(items[0])
        assertFalse((items[2] as Map<*, *>).containsKey("nullable"))
    }

    @Test fun escapedStringsStringKeysAndNumericLookingStringsStayStrings() {
        val payload = mapOf("value" to linkedMapOf(
            "" to "", "quote\"slash\\\n" to "\u0000\t\r\n\b\u000c",
            "中文👋" to "01", "truth" to "true", "nil" to "null", "number" to "1e400",
        ))
        assertEquals(payload, StorageCodec.decode(StorageCodec.encode(payload)).payload)
        assertEquals("A/\\\"\n", StorageCodec.decode("""{"value":"\u0041\/\\\"\n"}""").payload["value"])
    }

    @Test fun oldScalarAndWhitespaceEnvelopesRemainReadable() {
        for (stored in listOf(
            " \r\n\t {\"value\":false} \r\n\t",
            """{"value":"{\"value\":null}"}""",
            """{"value":[]}""",
            """{"value":{}}""",
        )) {
            val read = StorageCodec.decode(stored)
            assertTrue(read.found)
            assertEquals("", read.error)
            assertEquals(read.payload, StorageCodec.decode(StorageCodec.encode(read.payload)).payload)
        }
        assertEquals("{\"value\":null}", StorageCodec.decode("""{"value":"{\"value\":null}"}""").payload["value"])
    }

    @Test fun decodeUsesOnlyFiniteValdiNumericTypes() {
        val cases = listOf(
            "0" to 0, "2147483647" to Int.MAX_VALUE, "-2147483648" to Int.MIN_VALUE,
            "2147483648" to 2147483648L, "9223372036854775807" to Long.MAX_VALUE,
            "-9223372036854775808" to Long.MIN_VALUE, "9223372036854775808" to 9223372036854775808.0,
            "1.25" to 1.25, "1e2" to 100.0, "1.7976931348623157e308" to Double.MAX_VALUE,
            "4.9e-324" to Double.MIN_VALUE,
        )
        for ((literal, expected) in cases) {
            val read = StorageCodec.decode("{\"value\":$literal}")
            assertTrue("Numeric input must decode", read.found)
            val actual = read.payload["value"]
            assertTrue("Only Int, Long and Double may cross the Valdi boundary", actual is Int || actual is Long || actual is Double)
            assertEquals(expected.javaClass, actual!!.javaClass)
            assertEquals(expected, actual)
            assertEquals(actual, StorageCodec.decode(StorageCodec.encode(read.payload)).payload["value"])
        }
    }

    @Test fun encodeAcceptsFinitePrimitiveNumbers() {
        for (number in listOf<Number>(1.toByte(), 2.toShort(), 3, 4L, 1.25f, 2.5, Double.MAX_VALUE)) {
            val read = StorageCodec.decode(StorageCodec.encode(mapOf("value" to number)))
            assertTrue(read.found)
            assertEquals(number.toDouble(), (read.payload["value"] as Number).toDouble(), 0.0)
        }
    }

    @Test fun rejectsNonFiniteStoredNumbersAtEveryDepth() {
        for (number in listOf("NaN", "Infinity", "-Infinity", "1e400", "-1e400")) {
            assertInvalidStoredValue("{\"value\":$number}")
            assertInvalidStoredValue("{\"value\":[{\"number\":$number}]}")
            assertInvalidStoredValue("{\"value\":null,\"metadata\":{\"number\":$number}}")
        }
    }

    @Test fun decodeErrorsNeverIncludeStoredContent() {
        val marker = "synthetic-private-storage-marker"
        for (stored in listOf(
            "{\"value\":\"$marker",
            "{\"value\":\"$marker\",\"broken\":[}",
            "{\"$marker\":true}",
        )) {
            val read = StorageCodec.decode(stored)
            assertFalse(read.found)
            assertEquals(emptyMap<String, Any?>(), read.payload)
            assertTrue(read.error.startsWith("Invalid stored value:"))
            assertFalse("Parser diagnostics must not expose stored data", read.error.contains(marker))
        }
    }

    @Test fun encodeRejectsNonFiniteNumbersAtEveryDepth() {
        for (number in listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Float.NaN, Float.POSITIVE_INFINITY)) {
            for (payload in listOf(
                mapOf("value" to number),
                mapOf("value" to listOf(mapOf("number" to number))),
                mapOf("value" to null, "metadata" to number),
            )) assertInvalidPayload(payload)
        }
    }

    @Test fun encodeRejectsNonStringKeysAndUnsupportedValuesAtEveryDepth() {
        for (invalid in listOf(mapOf(1 to "value"), mapOf(null to "value"), Any(), arrayOf("x"), setOf("x"))) {
            assertInvalidPayload(mapOf("value" to invalid))
            assertInvalidPayload(mapOf("value" to listOf(mapOf("child" to invalid))))
            assertInvalidPayload(mapOf("value" to null, "metadata" to invalid))
        }
    }

    @Test fun onlyAnObjectContainingValueIsAnEnvelope() {
        for (stored in listOf("1", "true", "\"text\"", "[{\"value\":null}]", """{"nested":{"value":null}}""")) {
            assertInvalidStoredValue(stored)
        }
        val missing = StorageCodec.decode(null)
        assertFalse(missing.found)
        assertEquals(emptyMap<String, Any?>(), missing.payload)
        assertEquals("", missing.error)
    }

    private fun assertInvalidStoredValue(stored: String) {
        val read = StorageCodec.decode(stored)
        assertFalse("Invalid stored JSON must be rejected", read.found)
        assertEquals(emptyMap<String, Any?>(), read.payload)
        assertTrue(read.error.startsWith("Invalid stored value:"))
    }

    private fun assertInvalidPayload(payload: Map<String, Any?>) {
        try {
            StorageCodec.encode(payload)
            fail("Invalid storage payload must be rejected")
        } catch (_: IllegalArgumentException) {
            // Expected validation failure; no payload content may be included in diagnostics.
        }
    }
}
