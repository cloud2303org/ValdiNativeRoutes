package io.valdiroutes.app

import com.snap.valdi.exceptions.ValdiException
import com.snap.valdi.exceptions.valdiErrorCode
import com.snap.valdi.promise.CppPromiseCallback
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import java.util.concurrent.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Invokes the production CppPromiseCallback; the JNI fixture records the arguments at its native boundary.
 * The isolated runner supplies the fixture library. Ordinary JVM runs without it skip these JNI-specific tests.
 */
class AppUIPromiseSerializerTest {
    @Before
    fun loadNativeRecorder() {
        val library = System.getProperty("appui.promise.jni.library")
        assumeTrue("requires the AppUIPromiseJni.c JNI recorder", library != null)
        System.load(library!!)
    }

    @Test
    fun scannerCancellationReachesNativeWithExactPublicMessage() {
        val pending = ResolvablePromise<String>()
        pending.onComplete(CppPromiseCallback(11L, 22L))
        AppUIPromise.complete(pending, Result.failure<String>(IllegalStateException("cancel"))) { it }
        assertEquals("cancel", AppUIPromiseNativeRecorder.message())
        assertEquals(0, AppUIPromiseNativeRecorder.errorCode())
        assertEquals(11L, AppUIPromiseNativeRecorder.handle())
        assertEquals(22L, AppUIPromiseNativeRecorder.marshallerHandle())
    }

    @Test
    fun unrelatedThrowableKeepsProductionDiagnosticFormatting() {
        CppPromiseCallback<String>(11L, 22L).onFailure(IllegalStateException("cancel"))
        assertEquals("IllegalStateException: 'cancel'", AppUIPromiseNativeRecorder.message())
    }

    @Test
    fun mainDispatchAndNativeStartFailuresUseTheSameRawMessageBoundary() {
        val postFailure = AppUIPromise.onMain<Unit>({ throw IllegalStateException("post failed") }) { }
        assertNativeFailure(postFailure, "post failed")
        val unavailable = AppUIPromise.onMain<Unit>({ false }) { }
        assertNativeFailure(unavailable, "Main thread is unavailable")

        var posted: (() -> Unit)? = null
        val startFailure = AppUIPromise.onMain<Unit>({ posted = it; true }) { throw SecurityException("camera denied") }
        posted!!()
        assertNativeFailure(startFailure, "camera denied")
    }

    @Test
    fun asynchronousMappingFailureUsesRawMessageBoundary() {
        val pending = ResolvablePromise<String>()
        AppUIPromise.complete(pending, Result.success(1)) { throw IllegalArgumentException("invalid reply") }
        assertNativeFailure(pending, "invalid reply")
    }

    @Test
    fun causeTextIsNotAppendedAndNonblankWhitespaceIsPreserved() {
        val error = IllegalStateException("  camera denied  ", IllegalArgumentException("private cause"))
        assertNativeFailure(nativeFailure(error), "  camera denied  ")
    }

    @Test
    fun missingMessageUsesOldToStringAndBlankMessageGetsNativeFallback() {
        val withoutMessage = object : RuntimeException(null as String?) {
            override fun toString() = "custom failure"
        }
        assertNativeFailure(nativeFailure(withoutMessage), "custom failure")
        for (message in listOf("", " \t\n")) {
            assertNativeFailure(nativeFailure(IllegalStateException(message)), "AppUI operation failed")
        }
        val entirelyBlank = object : RuntimeException(null as String?) {
            override fun toString() = ""
        }
        assertNativeFailure(nativeFailure(entirelyBlank), "AppUI operation failed")
    }

    @Test
    fun nativeAndCancellationErrorCodesSurviveNormalization() {
        for (error in listOf(ValdiException("native denied", 73), CancellationException("cancel"))) {
            assertNativeFailure(nativeFailure(error), error.message!!, error.valdiErrorCode())
        }
    }

    @Test
    fun immediateUnsupportedModeRejectionUsesRawMessageBoundary() {
        assertNativeFailure(
            AppUIPromise.reject<Unit>(IllegalArgumentException("unsupported picker mode")),
            "unsupported picker mode",
        )
    }

    @Test
    fun cacheWorkerStartAndCacheOperationFailuresUseRawMessageBoundary() {
        assertNativeFailure(
            AppUIPromise.background({ throw IllegalStateException("worker unavailable") }) { },
            "worker unavailable",
        )
        var work: (() -> Unit)? = null
        val operation = AppUIPromise.background({ work = it }) { throw SecurityException("cache denied") }
        work!!()
        assertNativeFailure(operation, "cache denied")
    }

    private fun nativeFailure(error: Throwable): Promise<String> = ResolvablePromise<String>().also {
        AppUIPromise.complete(it, Result.failure<String>(error)) { value -> value }
    }

    private fun assertNativeFailure(promise: Promise<*>, message: String, code: Int = 0) {
        promise.onComplete(CppPromiseCallback(11L, 22L))
        assertEquals(message, AppUIPromiseNativeRecorder.message())
        assertEquals(code, AppUIPromiseNativeRecorder.errorCode())
    }
}

internal object AppUIPromiseNativeRecorder {
    @JvmStatic external fun message(): String
    @JvmStatic external fun errorCode(): Int
    @JvmStatic external fun handle(): Long
    @JvmStatic external fun marshallerHandle(): Long
}
