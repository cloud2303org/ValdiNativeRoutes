package io.valdiroutes.video

import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise

// Session and host boundaries only; compile the complete production VideoPlayerImpl.kt.
// Scheduling/Media3/Valdi marshalling are outside this JVM test's boundary.
internal class VideoSession {
    val id = "test"
    var pageReleased = false
    var released = false
    var pageVisible = true
    var mode = "inline"
    var volume = 0.5f
    var writes = 0
    fun setVolumeFromObject(value: Float) { volume = value; writes++ }
    fun play() {}
    fun setRate(value: Float) {}
    fun setPreferredRate(value: Float) {}
    fun seekFromObject(value: Long) {}
    fun updatePlayback() {}
    fun state() = VideoState()
    fun subscribe(listener: (VideoState) -> Unit): VideoSubscription = VideoSubscriptionImpl(VideoHostImpl(), this, listener)
    fun releasePage() { pageReleased = true }
    fun unsubscribe(subscription: VideoSubscriptionImpl) { subscription.listener = null }
    companion object { const val PIP = "pictureInPicture" }
}

internal class VideoHostImpl {
    val presentation: TestPresentation? = TestPresentation()
    fun requirePresentation() = presentation!!
    fun destroy(session: VideoSession) { session.released = true }
    fun <T> onMain(action: () -> T): Promise<T> = ResolvablePromise<T>().also {
        try { it.value = action() } catch (error: Exception) { it.error = error }
    }
}

internal class TestPresentation {
    fun enterFullscreen(session: VideoSession) {}
    fun exitFullscreen(session: VideoSession) {}
    fun enterPictureInPicture(session: VideoSession) {}
    fun isLivePip(session: VideoSession) = false
}

class VideoState
interface VideoSubscription { fun unsubscribe(): Promise<Unit> }
interface VideoPlayer {
    fun getSource(): String
    fun play(): Promise<Unit>
    fun pause(): Promise<Unit>
    fun setPlaybackRate(rate: Double): Promise<Unit>
    fun seekTo(timeMs: Double): Promise<Unit>
    fun setVolume(volume: Double): Promise<Unit>
    fun setPageVisible(visible: Boolean): Promise<Unit>
    fun enterFullscreen(): Promise<Unit>
    fun exitFullscreen(): Promise<Unit>
    fun enterPictureInPicture(): Promise<Unit>
    fun getState(): Promise<VideoState>
    fun subscribe(listener: (VideoState) -> Unit): Promise<VideoSubscription>
    fun release(): Promise<Unit>
}

fun main() {
    val session = VideoSession()
    val player = VideoPlayerImpl(VideoHostImpl(), session)
    fun checkVolume(value: Double, succeeds: Boolean) {
        val previous = session.volume
        val writes = session.writes
        val result = player.setVolume(value) as ResolvablePromise<Unit>
        check((result.error == null) == succeeds) { "Unexpected setVolume($value) outcome: ${result.error}" }
        check(session.writes == writes + if (succeeds) 1 else 0) { "Rejected input changed the player" }
        check(session.volume == if (succeeds) value.toFloat() else previous)
    }
    listOf(0.0, 0.25, 1.0, -0.0).forEach { checkVolume(it, true) }
    listOf(-0.01, 1.01, -Double.MIN_VALUE, Math.nextUp(1.0),
        Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.MAX_VALUE)
        .forEach { checkVolume(it, false) }
    session.pageReleased = true
    checkVolume(0.5, false)
    session.pageReleased = false
    session.released = true
    checkVolume(0.5, false)
    println("PASS Android production setVolume: valid bounds, invalid inputs, no rejected mutation, released guards")
}
