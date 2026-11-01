package io.nativeroutes.ble

import android.os.Handler
import android.os.Looper
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/** Native async result. It deliberately has no RN or Nitro dependency. */
class BleFuture<T> {
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

    fun resolve(value: T) = finish(Result.success(value))
    fun reject(error: Throwable) = finish(Result.failure(error))

    private fun finish(value: Result<T>) {
        val pending = synchronized(this) {
            if (result != null) return
            result = value
            observers.toList().also { observers.clear() }
        }
        pending.forEach { runCatching { it(value) } }
    }

    companion object {
        internal fun <T> async(action: () -> T): BleFuture<T> {
            val future = BleFuture<T>()
            val run = { runCatching(action).fold(future::resolve, future::reject); Unit }
            if (Looper.myLooper() == Looper.getMainLooper()) run()
            else Handler(Looper.getMainLooper()).post(run)
            return future
        }
    }
}
