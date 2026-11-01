package io.nativeroutes.ble

import java.util.concurrent.ConcurrentHashMap
import kotlin.collections.set

class PromiseStore<T> {
    private val store = ConcurrentHashMap<String, BleFuture<T>>()

    fun get(key: String): BleFuture<T>? = store[key]

    fun putIfAbsent(
        key: String,
        promise: BleFuture<T>,
    ): BleFuture<T> {
        return store.putIfAbsent(key, promise) ?: promise
    }

    fun resolve(key: String, value: T): Boolean {
        val promise = store.remove(key) ?: return false
        promise.resolve(value)
        return true
    }

    fun reject(key: String, error: Throwable): Boolean {
        val promise = store.remove(key) ?: return false
        promise.reject(error)
        return true
    }

    fun clear(error: Throwable) {
        val pending = store.values.toList()
        store.clear()
        pending.forEach { it.reject(error) }
    }

    fun rejectMatching(predicate: (String) -> Boolean, error: Throwable) {
        store.keys.filter(predicate).forEach { key -> reject(key, error) }
    }
}
