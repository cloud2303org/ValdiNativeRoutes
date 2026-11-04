package io.valdiroutes.app

import io.valdiroutes.app_ui.AppUIPromise

import com.snap.valdi.exceptions.PromiseRejectionException
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.PromiseCallback
import com.snap.valdi.promise.ResolvablePromise
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUIPromiseTest {
    private class Completion<T>(promise: Promise<T>) : PromiseCallback<T> {
        val values = mutableListOf<T>()
        val errors = mutableListOf<Throwable>()

        init { promise.onComplete(this) }
        override fun onSuccess(value: T) { values.add(value) }
        override fun onFailure(error: Throwable) { errors.add(error) }
    }

    @Test
    fun dispatchDoesNotSettleUntilNativeCompletionAfterPostedWork() {
        var posted: (() -> Unit)? = null
        var nativeCompletion: ((Result<String>) -> Unit)? = null
        val promise = AppUIPromise.onMain<String>({ posted = it; true }) { pending ->
            nativeCompletion = { AppUIPromise.complete(pending, it) { value -> value } }
        }
        val completion = Completion(promise)
        assertTrue(completion.values.isEmpty())
        assertTrue(completion.errors.isEmpty())
        assertEquals(null, nativeCompletion)

        posted!!()
        assertTrue(completion.values.isEmpty())
        assertTrue(completion.errors.isEmpty())
        nativeCompletion!!(Result.success("closed"))
        assertEquals(listOf("closed"), completion.values)
        assertTrue(completion.errors.isEmpty())
    }

    @Test
    fun unavailableMainThreadRejectsWithoutRunningPresentation() {
        var ran = false
        val promise = AppUIPromise.onMain<Unit>({ false }) { ran = true }
        val completion = Completion(promise)
        assertFalse(ran)
        assertTrue(completion.values.isEmpty())
        assertEquals("Main thread is unavailable", completion.errors.single().message)
    }

    @Test
    fun throwingDispatcherAndThrowingNativeStartRejectPublicMessage() {
        val error = IllegalStateException("No foreground activity")
        val postFailure = Completion(AppUIPromise.onMain<Unit>({ throw error }) { error("must not run") })
        assertPublicFailure(postFailure.errors.single(), "No foreground activity")

        var posted: (() -> Unit)? = null
        val startFailure = Completion(AppUIPromise.onMain<Unit>({ posted = it; true }) { throw error })
        posted!!()
        assertPublicFailure(startFailure.errors.single(), "No foreground activity")
        assertTrue(startFailure.values.isEmpty())
    }

    @Test
    fun nativeFailurePreservesPublicMessageWithoutMappingFallbackReply() {
        val pending = ResolvablePromise<String>()
        val completion = Completion(pending)
        val error = IllegalStateException("cancel")
        var mapped = false
        AppUIPromise.complete(pending, Result.failure<String>(error)) { mapped = true; it }
        assertFalse(mapped)
        assertPublicFailure(completion.errors.single(), "cancel")
        assertTrue(completion.values.isEmpty())
    }

    @Test
    fun asynchronousReplyMappingFailureRejectsInsteadOfEscapingCallback() {
        val pending = ResolvablePromise<String>()
        val completion = Completion(pending)
        val error = IllegalArgumentException("invalid reply")
        AppUIPromise.complete(pending, Result.success(1)) { throw error }
        assertPublicFailure(completion.errors.single(), "invalid reply")
        assertTrue(completion.values.isEmpty())
    }

    @Test
    fun cancellationShapedReplyIsSuccessAndLateDuplicateCompletionIsIgnored() {
        data class Reply(val cancel: Boolean, val index: Double)
        val pending = ResolvablePromise<Reply>()
        val completion = Completion(pending)
        AppUIPromise.complete(pending, Result.success(-1)) { Reply(cancel = true, index = it.toDouble()) }
        AppUIPromise.complete(pending, Result.failure<Int>(IllegalStateException("late"))) { Reply(false, it.toDouble()) }
        assertEquals(listOf(Reply(true, -1.0)), completion.values)
        assertTrue(completion.errors.isEmpty())
        assertEquals(completion.values, Completion(pending).values)
    }

    @Test
    fun voidSuccessSuppliesUnitToBothExistingAndLateObservers() {
        var posted: (() -> Unit)? = null
        val promise = AppUIPromise.onMain<Unit>({ posted = it; true }) { it.fulfillSuccess(Unit) }
        val completion = Completion(promise)
        posted!!()
        assertEquals(listOf(Unit), completion.values)
        assertEquals(listOf(Unit), Completion(promise).values)
        assertTrue(completion.errors.isEmpty())
    }

    @Test
    fun cacheWorkWaitsForWorkerAndSettlesUnitAfterDeletion() {
        var work: (() -> Unit)? = null
        var deleted = false
        val promise = AppUIPromise.background({ work = it }) { deleted = true }
        val completion = Completion(promise)
        assertFalse(deleted)
        assertTrue(completion.values.isEmpty())
        work!!()
        assertTrue(deleted)
        assertEquals(listOf(Unit), completion.values)
        assertEquals(listOf(Unit), Completion(promise).values)
        assertTrue(completion.errors.isEmpty())
    }

    private fun assertPublicFailure(error: Throwable, message: String) {
        assertTrue(error is PromiseRejectionException)
        assertEquals(message, error.message)
    }
}
