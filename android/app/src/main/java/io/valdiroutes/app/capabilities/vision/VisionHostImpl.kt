package io.valdiroutes.app

import android.content.Context
import android.util.Base64
import androidx.annotation.Keep
import io.valdiroutes.pages.VisionDemoResult
import io.valdiroutes.pages.VisionHost
import io.valdiroutes.pages.VisionPrediction
import java.io.File
import java.util.concurrent.Executors

/** JNI entry of libvaldi_routes_vision.so (src/main/cpp): VisionCore with OpenCV mobile and ncnn linked in. */
internal object VisionNative {
    init {
        System.loadLibrary("valdi_routes_vision")
    }

    /**
     * native_routes::vision::DemoResult as built by vision-jni.cpp; keep the constructor in sync with it. @Keep: the JNI
     * code finds the class and its constructor by name, so R8 must not rename or drop them.
     */
    @Keep
    class Result(
        val opencvVersion: String, val ncnnVersion: String, val modelName: String, val modelDescription: String,
        val processingMs: Double, val inferenceMs: Double, val width: Int, val height: Int,
        val inferenceWidth: Int, val inferenceHeight: Int, val edgePixelCount: Int,
        val inputImageDataUrl: String, val edgeImageDataUrl: String, val labels: Array<String>, val scores: DoubleArray,
    )

    external fun runDemo(): Result
}

/**
 * `runDemo` of vision/VisionHost.ts. The core returns PNG data URLs; they are written to the cache and handed to the
 * page as file:// URLs, which Valdi's image loader reads directly.
 */
class VisionHostImpl(context: Context) : VisionHost {
    private val directory = File(context.cacheDir, "vision")
    private val worker = Executors.newSingleThreadExecutor { Thread(it, "valdi-vision") }
    private var run = 0L

    override fun runDemo(done: (String, VisionDemoResult?) -> Unit) {
        worker.execute {
            runCatching { demo() }.fold({ done("", it) }, { done(it.message ?: it.toString(), null) })
        }
    }

    private fun demo(): VisionDemoResult {
        val result = VisionNative.runDemo()
        // A fresh name per run: the page's image cache is keyed by URL. Earlier runs are no longer shown.
        directory.mkdirs()
        directory.listFiles()?.forEach { it.delete() }
        val name = "run-${++run}-${System.currentTimeMillis()}"
        return VisionDemoResult(
            result.opencvVersion, result.ncnnVersion, result.modelName, result.modelDescription,
            result.processingMs, result.inferenceMs, result.width.toDouble(), result.height.toDouble(),
            result.inferenceWidth.toDouble(), result.inferenceHeight.toDouble(), result.edgePixelCount.toDouble(),
            writePng(result.inputImageDataUrl, "$name-input.png"), writePng(result.edgeImageDataUrl, "$name-edges.png"),
            result.labels.indices.map { VisionPrediction(result.labels[it], result.scores[it]) },
        )
    }

    private fun writePng(dataUrl: String, name: String): String {
        val prefix = "data:image/png;base64,"
        check(dataUrl.startsWith(prefix)) { "VisionCore returned an unexpected image" }
        val file = File(directory, name)
        file.writeBytes(Base64.decode(dataUrl.substring(prefix.length), Base64.DEFAULT))
        return "file://${file.absolutePath}"
    }
}
