package io.nativeroutes.ble

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class ListenerList<T> {
    private val callbacks = ConcurrentHashMap<Long, (T) -> Unit>()
    private val nextId = AtomicLong(1L)

    fun add(cb: (T) -> Unit): Double {
        val id = nextId.getAndIncrement()
        callbacks[id] = cb
        return id.toDouble()
    }

    fun remove(id: Double): Boolean {
        return callbacks.remove(id.toLong()) != null
    }

    fun notify(value: T) {
        callbacks.values.toList().forEach { callback ->
            runCatching { callback(value) }
        }
    }
}
