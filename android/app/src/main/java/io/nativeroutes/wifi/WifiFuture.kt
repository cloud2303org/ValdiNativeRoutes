// Copied from ExpoNativeRoutes android/native/wifi (io/nativeroutes/wifi/WifiFuture.kt).
package io.nativeroutes.wifi

import android.os.Handler
import android.os.Looper
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/** Awaitable native result, usable by a Kotlin host without a JS runtime. */
class WifiFuture<T> {
    private var result: Result<T>? = null
    private val observers = mutableListOf<(Result<T>) -> Unit>()
    fun observe(callback: (Result<T>) -> Unit) {
        val completed = synchronized(this) { result.also { if (it == null) observers.add(callback) } }
        if (completed != null) callback(completed)
    }
    suspend fun await(): T = suspendCoroutine { continuation ->
        observe { it.fold(continuation::resume, continuation::resumeWithException) }
    }
    internal fun resolve(value: T) = finish(Result.success(value))
    internal fun reject(error: Throwable) = finish(Result.failure(error))
    private fun finish(value: Result<T>) {
        val pending = synchronized(this) {
            if (result != null) return
            result = value
            observers.toList().also { observers.clear() }
        }
        pending.forEach { runCatching { it(value) } }
    }
    companion object {
        internal val handler = Handler(Looper.getMainLooper())
        internal fun onMain(action: () -> Unit) {
            if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post(action)
        }
        internal fun <T> value(action: () -> T): WifiFuture<T> {
            val future = WifiFuture<T>()
            onMain { runCatching(action).fold(future::resolve, future::reject) }
            return future
        }
    }
}
