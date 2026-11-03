package io.valdiroutes.app

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
}
