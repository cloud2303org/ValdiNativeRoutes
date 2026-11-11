package com.snap.valdi.modules.webview

import android.os.Process
import android.os.SystemClock
import android.os.Trace
import android.util.Log

/** Temporary diagnostics, opted in with the host's existing ValdiStartup log property. */
internal object WebViewTrace {
    private const val TAG = "ValdiStartup"
    private val enabled = Log.isLoggable(TAG, Log.INFO) && Log.isLoggable(TAG, Log.DEBUG)

    fun mark(stage: String, owner: Any) {
        if (!enabled) return
        val now = SystemClock.elapsedRealtimeNanos()
        Log.i(TAG, "event=mark stage=webview.$stage elapsed_ns=$now owner=${System.identityHashCode(owner)} pid=${Process.myPid()} tid=${Process.myTid()}")
    }

    fun link(stage: String, owner: Any, child: Any) {
        if (!enabled) return
        val now = SystemClock.elapsedRealtimeNanos()
        Log.i(TAG, "event=link stage=webview.$stage elapsed_ns=$now owner=${System.identityHashCode(owner)} child=${System.identityHashCode(child)} pid=${Process.myPid()} tid=${Process.myTid()}")
    }

    inline fun <T> section(stage: String, owner: Any, block: () -> T): T {
        if (!enabled) return block()
        Trace.beginSection("ValdiWebView.$stage")
        val startNs = SystemClock.elapsedRealtimeNanos()
        var outcome = "throw"
        try {
            val result = block()
            outcome = "return"
            return result
        } finally {
            val endNs = SystemClock.elapsedRealtimeNanos()
            Trace.endSection()
            Log.i(TAG, "event=end stage=webview.$stage start_elapsed_ns=$startNs elapsed_ns=$endNs duration_ns=${endNs - startNs} owner=${System.identityHashCode(owner)} pid=${Process.myPid()} tid=${Process.myTid()} outcome=$outcome")
        }
    }
}
