package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.os.Process
import android.os.SystemClock
import android.os.Trace
import android.util.Log
import android.view.View
import com.snap.valdi.InflationCompletion
import com.snap.valdi.logger.DefaultLogger
import com.snap.valdi.logger.Logger
import com.snap.valdi.views.ValdiRootView
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Opt in BEFORE process launch: adb shell setprop log.tag.ValdiStartup DEBUG
 * INFO is Android's default tag threshold, so the additional DEBUG check makes the default silent.
 * The gate is fixed on first use; force-stop/relaunch after changing the property.
 *
 * All timestamps/durations use elapsedRealtimeNanos, including cross-thread intervals. The process
 * anchor is Process.getStartElapsedRealtime (API 24), converted from milliseconds: since-process
 * values have a millisecond-resolution anchor, even though section durations use nanoseconds.
 * No uptime, wall clock, CPU time, or display/presentation timestamps are used.
 */
internal object StartupTrace {
    private const val TAG = "ValdiStartup"

    @PublishedApi
    internal val enabled = Log.isLoggable(TAG, Log.INFO) && Log.isLoggable(TAG, Log.DEBUG)
    private val processStartNs = if (enabled) Process.getStartElapsedRealtime() * 1_000_000L else 0L
    private val sequence = AtomicLong()

    @PublishedApi
    internal class Span(
        val stage: String,
        val details: String,
        val id: Long,
        val startTid: Int,
        val startThread: String,
        val startNs: Long,
    )

    /** An immutable token can cross threads. No synchronous Trace section is opened here. */
    @PublishedApi
    internal fun start(stage: String, details: String = "", startNs: Long? = null): Span? {
        if (!enabled) return null
        val id = sequence.incrementAndGet()
        val tid = Process.myTid()
        val thread = Thread.currentThread().name
        return Span(stage, details, id, tid, thread, startNs ?: SystemClock.elapsedRealtimeNanos())
    }

    /** The time is sampled before formatting/logging; stage durations exclude the end log itself. */
    @PublishedApi
    internal fun finish(span: Span?, outcome: String = "callback", endNs: Long? = null) {
        if (span == null) return
        val now = endNs ?: SystemClock.elapsedRealtimeNanos()
        Log.i(
            TAG,
            "event=end stage=${span.stage} id=${span.id} outcome=$outcome" +
                " elapsed_ns=$now since_process_ns=${now - processStartNs}" +
                " start_elapsed_ns=${span.startNs} start_since_process_ns=${span.startNs - processStartNs}" +
                " duration_ns=${now - span.startNs} pid=${Process.myPid()}" +
                " tid=${Process.myTid()} thread=${quoted(Thread.currentThread().name)}" +
                " start_tid=${span.startTid} start_thread=${quoted(span.startThread)} ${span.details}",
        )
    }

    /** Only synchronous blocks use Trace: begin/end always execute on the same calling thread. */
    internal inline fun <T> section(stage: String, details: String = "", block: () -> T): T {
        if (!enabled) return block()
        Trace.beginSection("ValdiStartup.$stage".take(127))
        val span = start(stage, details)
        var outcome = "throw"
        try {
            val result = block()
            outcome = "return"
            return result
        } finally {
            val endNs = SystemClock.elapsedRealtimeNanos()
            Trace.endSection()
            finish(span, outcome, endNs)
        }
    }

    internal fun mark(stage: String, details: String = "") {
        if (!enabled) return
        val now = SystemClock.elapsedRealtimeNanos()
        Log.i(
            TAG,
            "event=mark stage=$stage id=${sequence.incrementAndGet()} elapsed_ns=$now" +
                " since_process_ns=${now - processStartNs} pid=${Process.myPid()}" +
                " tid=${Process.myTid()} thread=${quoted(Thread.currentThread().name)} $details",
        )
    }

    internal fun pageDetails(kind: String, id: String, route: String): String =
        if (enabled) "kind=$kind page_id=${quoted(id)} route=${quoted(route)}" else ""

    /**
     * Timestamp receipt of our fixed-format JS diagnostics on the native clock, without adding
     * a native bridge API. JS runtime_ms remains its own clock; receipt includes logging overhead.
     * Other runtime messages retain the default logger and are never copied into diagnostic files.
     */
    internal fun pageLogger(): Logger? {
        if (!enabled) return null
        val delegate = DefaultLogger()
        return object : Logger by delegate {
            override fun log(level: Int, message: String?) {
                if (message?.startsWith("[ValdiPageTrace] ") == true) {
                    mark("js.page_event", message.removePrefix("[ValdiPageTrace] "))
                } else {
                    delegate.log(level, message)
                }
            }
        }
    }

    /**
     * Pinned ValdiRuntime.inflateViewAsync registers completion via enqueueNextRenderCallback,
     * drained by ContextManager.onContextRendered -> ValdiContext.onRender. This observes that
     * context's first render callback after the request, NOT first draw, GPU completion, or Home
     * content displayed. The call-return duration is measured separately.
     */
    internal fun renderCompletion(root: ValdiRootView, details: String): InflationCompletion? {
        val span = start("root.inflate_request_to_context_render_callback", details) ?: return null
        return { error ->
            val now = SystemClock.elapsedRealtimeNanos()
            if (error == null) (root as? MeasuredRootView)?.armDrawAfterContextRender(now)
            finish(span, if (error == null) "callback" else "callback_error", now)
        }
    }

    /** Normal launches keep the original concrete root class and null inflation completion. */
    internal fun rootView(context: Context, details: String): ValdiRootView =
        if (enabled) MeasuredRootView(context, details) else ValdiRootView(context)

    private fun quoted(value: String): String =
        "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\""

    private class MeasuredRootView(context: Context, private val details: String) : ValdiRootView(context) {
        private val afterContextRender = AtomicReference<Span?>(null)

        fun armDrawAfterContextRender(callbackNs: Long) {
            afterContextRender.set(
                start("root.context_render_callback_to_first_dispatchDraw_return", details, callbackNs),
            )
        }

        override fun dispatchDraw(canvas: Canvas) {
            // Observe only a draw that STARTS after the official callback. Do not request a draw.
            // ValdiView.dispatchDraw preserves clipping, ViewUtils dispatch, and foreground drawing.
            // Native runUpdatesInner invokes render completions before endViewTransaction/submit:
            // this callback ordering does NOT prove the latest native transaction was applied, nor
            // that a SnapDrawing Surface/Texture produced or presented Home pixels.
            val afterRender = afterContextRender.getAndSet(null)
            if (afterRender == null) {
                super.dispatchDraw(canvas)
                return
            }
            val draw = start("root.first_dispatchDraw_after_context_render_callback", details)
            var outcome = "throw"
            try {
                super.dispatchDraw(canvas)
                outcome = "return"
            } finally {
                val now = SystemClock.elapsedRealtimeNanos()
                finish(draw, outcome, now)
                finish(afterRender, outcome, now)
            }
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            section(
                "root.onMeasure",
                "$details width_spec=${quoted(View.MeasureSpec.toString(widthMeasureSpec))}" +
                    " height_spec=${quoted(View.MeasureSpec.toString(heightMeasureSpec))}",
            ) {
                super.onMeasure(widthMeasureSpec, heightMeasureSpec)
            }
            mark("root.measured_size", "$details width_px=$measuredWidth height_px=$measuredHeight")
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            // These are the actual root bounds supplied to super.onLayout, which calls
            // context.setLayoutSpecs(width, height, rtl) when its own caching/dirty rules permit.
            // We do not change those rules or claim every callback resubmits identical specs.
            section(
                "root.onLayout",
                "$details left_px=$l top_px=$t right_px=$r bottom_px=$b" +
                    " width_px=${r - l} height_px=${b - t} rtl=${layoutDirection == View.LAYOUT_DIRECTION_RTL}" +
                    " context_present=${valdiContext != null} changed=$changed",
            ) {
                super.onLayout(changed, l, t, r, b)
            }
        }
    }
}
