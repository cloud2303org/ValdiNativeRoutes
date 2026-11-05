package io.valdiroutes.video

import com.snap.valdi.promise.Promise

/** Generated Valdi proxy identity owns commands; only the loader interprets the opaque surface URL. */
internal class VideoPlayerImpl(
    private val host: VideoHostImpl,
    private val session: VideoSession,
) : VideoPlayer {
    override fun getSource(): String = "valdi-video://${session.id}"

    override fun play(): Promise<Unit> = command { play() }

    override fun pause(): Promise<Unit> = command { setRate(0f) }

    override fun setPlaybackRate(rate: Double): Promise<Unit> = command {
        val value = rate.toFloat()
        require(rate.isFinite() && rate > 0.0 && value.isFinite() && value > 0f) {
            "Video playback rate must be a finite positive Float"
        }
        setPreferredRate(value)
    }

    override fun seekTo(timeMs: Double): Promise<Unit> = command {
        require(timeMs.isFinite() && timeMs >= 0.0) { "Video seek time must be finite and nonnegative" }
        seekFromObject(timeMs.toLong())
    }

    override fun setVolume(volume: Double): Promise<Unit> = command {
        require(volume.isFinite() && volume in 0.0..1.0) { "Video volume must be between zero and one" }
        setVolumeFromObject(volume.toFloat())
    }

    override fun setPageVisible(visible: Boolean): Promise<Unit> = command {
        pageVisible = visible
        updatePlayback()
    }

    override fun enterFullscreen(): Promise<Unit> = command {
        host.requirePresentation().enterFullscreen(this)
    }

    override fun exitFullscreen(): Promise<Unit> = command {
        check(mode != VideoSession.PIP) { "Leave picture-in-picture using the system controls" }
        host.requirePresentation().exitFullscreen(this)
    }

    override fun enterPictureInPicture(): Promise<Unit> = command {
        host.requirePresentation().enterPictureInPicture(this)
    }

    override fun getState(): Promise<VideoState> = command { state() }

    override fun subscribe(listener: (state: VideoState) -> Unit): Promise<VideoSubscription> =
        command { subscribe(listener) }

    override fun release(): Promise<Unit> = host.onMain {
        if (!session.pageReleased && !session.released) {
            // Detach every JS callback even when the system retains the decoder for pending/active PiP.
            session.releasePage()
            if (host.presentation?.isLivePip(session) != true) host.destroy(session)
        }
        Unit
    }

    private fun <T> command(action: VideoSession.() -> T): Promise<T> = host.onMain {
        check(!session.released && !session.pageReleased) { "Video player was released" }
        session.action()
    }
}

/** Its callback is nullable so queued events and retained JS subscriptions cannot keep a listener alive. */
internal class VideoSubscriptionImpl(
    private val host: VideoHostImpl,
    private val session: VideoSession,
    internal var listener: ((VideoState) -> Unit)?,
) : VideoSubscription {
    override fun unsubscribe(): Promise<Unit> = host.onMain {
        session.unsubscribe(this)
    }
}
