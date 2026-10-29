// Copied from ExpoNativeRoutes android/native/nfc (io/nativeroutes/nfc/NfcFuture.kt).
package io.nativeroutes.nfc

import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/** A native async result with callback and suspend access, independent of JS. */
class NfcFuture<T> {
    private var result: Result<T>? = null
    private val observers = mutableListOf<(Result<T>) -> Unit>()

    fun observe(callback: (Result<T>) -> Unit) {
        val completed = synchronized(this) {
            result.also { if (it == null) observers.add(callback) }
        }
        if (completed != null) callback(completed)
    }

    suspend fun await(): T = suspendCoroutine { continuation ->
        observe { it.fold(continuation::resume, continuation::resumeWithException) }
    }

    internal fun resolve(value: T) = finish(Result.success(value))
    internal fun reject(error: Throwable) = finish(Result.failure(error))

    private fun finish(value: Result<T>) {
        val callbacks = synchronized(this) {
            if (result != null) return
            result = value
            observers.toList().also { observers.clear() }
        }
        callbacks.forEach { runCatching { it(value) } }
    }
}
