package io.valdiroutes.video

import android.net.Uri
import android.util.Log
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.callable.performUntyped
import io.valdiroutes.app.R
import java.util.ArrayDeque

/** One session owns exactly one ExoPlayer and one texture-backed PlayerView throughout all presentation modes. */
@OptIn(UnstableApi::class)
internal class VideoSession(
    private val host: VideoHostImpl,
    val id: String,
    source: Uri,
) {
    val player: ExoPlayer = ExoPlayer.Builder(host.context).setLooper(host.main.looper)
        .setAudioAttributes(AudioAttributes.DEFAULT, true)
        .setHandleAudioBecomingNoisy(true)
        .build()
    val playerView = try {
        (LayoutInflater.from(host.context).inflate(R.layout.valdi_video_player, null) as PlayerView).apply {
            player = this@VideoSession.player
            setFullscreenButtonClickListener { fullscreen ->
                if (released || pageReleased) return@setFullscreenButtonClickListener
                try {
                    val presentation = host.requirePresentation()
                    // Media3 also calls this listener from programmatic button-state updates.
                    if (fullscreen && mode == INLINE) presentation.enterFullscreen(this@VideoSession)
                    else if (!fullscreen && mode == FULLSCREEN) presentation.exitFullscreen(this@VideoSession)
                } catch (failure: Exception) {
                    Log.w("ValdiVideo", "Video presentation unavailable", failure)
                    android.widget.Toast.makeText(context, failure.message ?: "Fullscreen unavailable",
                        android.widget.Toast.LENGTH_SHORT).show()
                } finally {
                    setFullscreenButtonState(mode != INLINE)
                }
            }
        }
    } catch (failure: Exception) {
        player.release()
        throw failure
    }
    val bindings = mutableSetOf<VideoBinding>()
    var activeBinding: VideoBinding? = null
        private set
    var pageVisible = true
    var pageReleased = false
    var released = false
        private set
    var mode = INLINE
    private var desiredRate = 0f
    private var preferredRate = 1f
    // Renderer defaults may seed an untouched property, but never override object/native controls.
    private var playbackOwned = false
    private var volumeOwned = false
    private var seekOwned = false
    private var loaded = false
    private var completed = false
    private var error = ""
    private var sequence = 0.0
    private val subscriptions = mutableSetOf<VideoSubscriptionImpl>()
    private val stateEvents = ArrayDeque<StateEvent>()
    private var deliveryScheduled = false
    private var delivering = false

    // One event per main-loop turn. A listener can queue commands/unsubscribe without recursively
    // mutating this delivery, and its queued operation runs before the next event is delivered.
    private val deliverState = object : Runnable {
        override fun run() {
            deliveryScheduled = false
            if (released || pageReleased || delivering) return
            val event = stateEvents.pollFirst() ?: return
            delivering = true
            try {
                event.recipients.forEach { subscription ->
                    if (released || pageReleased) return@forEach
                    val callback = subscription.listener ?: return@forEach
                    try {
                        // Exported models are mutable. Give each recipient its own value so listener
                        // mutation cannot corrupt the queued snapshot seen by another listener.
                        callback(event.state.copySnapshot())
                    } catch (failure: Throwable) {
                        Log.w("ValdiVideo", "Video state listener unavailable", failure)
                    }
                }
            } finally {
                delivering = false
                scheduleStateDelivery()
            }
        }
    }

    private val progress = object : Runnable {
        override fun run() {
            if (released || pageReleased || !player.isPlaying) return
            publishState()
            emit { callbacks -> invoke(callbacks.onProgressUpdated, player.currentPosition.toDouble(), duration()) }
            if (player.isPlaying) host.main.postDelayed(this, 250)
        }
    }

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (released) return
            if (playbackState == Player.STATE_READY && !loaded) {
                loaded = true
                activeBinding?.let(::deliverSnapshot)
            }
            if (playbackState == Player.STATE_ENDED && !completed) {
                completed = true
                desiredRate = 0f
                emit { invoke(it.onProgressUpdated, player.currentPosition.toDouble(), duration()) }
                emit { invoke(it.onCompleted) }
                updatePlayback()
            }
            publishState()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (released) return
            host.main.removeCallbacks(progress)
            if (isPlaying) {
                emit { invoke(it.onBeginPlayback) }
                host.main.post(progress)
            }
            playerView.keepScreenOn = isPlaying
            publishState()
        }

        override fun onPlayerError(failure: PlaybackException) {
            if (released) return
            error = failure.message ?: failure.errorCodeName
            desiredRate = 0f
            activeBinding?.let(::deliverSnapshot)
            updatePlayback()
        }

        override fun onEvents(player: Player, events: Player.Events) {
            // Media3 batches events after its individual callbacks, including reentrant state changes.
            // Publish system controls from that coherent state, rather than once per callback.
            if (!released) host.presentation?.updatePipActions(this@VideoSession)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            // All PlayerView commands own intent, in every mode. Ignore our own lifecycle writes
            // (requestedPlayback is installed before Media3 can reenter) and obsolete queued callbacks.
            if (!released &&
                reason == Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST &&
                playWhenReady == player.playWhenReady && playWhenReady != requestedPlayback) {
                setNativePlayback(playWhenReady)
            }
            if (!released && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY) {
                // This system pause still owns intent after the page releases an active PiP.
                playbackOwned = true
                applyRate(0f)
            }
            publishState()
        }

        override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
            if (released) return
            // PlayerView speed controls change Media3 directly. A session-authored change
            // already installed preferredRate before calling Media3, so only external changes differ.
            if (playbackParameters.speed == player.playbackParameters.speed && playbackParameters.speed != preferredRate) {
                playbackOwned = true
                preferredRate = playbackParameters.speed
                if (desiredRate > 0f) desiredRate = preferredRate
            }
            publishState()
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            publishState()
        }

        override fun onIsLoadingChanged(isLoading: Boolean) {
            publishState()
        }

        override fun onTimelineChanged(timeline: Timeline, reason: Int) {
            publishState()
        }

        override fun onVolumeChanged(volume: Float) {
            publishState()
        }

        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int,
        ) {
            if (released) return
            if (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) {
                completed = false
                seekOwned = true
            }
            publishState()
        }
    }
    private var requestedPlayback = false

    init {
        host.checkMain()
        try {
            player.addListener(listener)
            // DefaultMediaSourceFactory infers MP4/file/asset and HLS (.m3u8, including live) from the URI.
            // The host module supplies media3-exoplayer-hls; no custom headers or DRM are configured.
            player.setMediaItem(MediaItem.fromUri(source))
            player.prepare()
        } catch (failure: Exception) {
            player.removeListener(listener)
            playerView.player = null
            player.release()
            throw failure
        }
    }

    fun attach(binding: VideoBinding) {
        if (released || pageReleased || binding.disposed) return
        activeBinding = binding
        restoreInline()
        updatePlayback()
    }

    fun detached(binding: VideoBinding) {
        if (activeBinding !== binding || released) return
        if (binding.disposed || !binding.bound || !binding.attached) {
            bindings.lastOrNull { it !== binding && it.bound && !it.disposed && it.attached }?.let {
                activeBinding = it
                restoreInline()
            }
        }
        updatePlayback()
    }

    fun restoreInline() {
        if (released || mode != INLINE) return
        val binding = activeBinding?.takeIf { !it.disposed && it.bound } ?: return
        movePlayerTo(binding.anchor)
        playerView.useController = true
        playerView.setFullscreenButtonState(false)
    }

    fun movePlayerTo(parent: ViewGroup) {
        if (playerView.parent === parent) return
        (playerView.parent as? ViewGroup)?.removeView(playerView)
        parent.addView(playerView, FrameLayout.LayoutParams(-1, -1))
    }

    fun setRate(rate: Float) {
        if (released || pageReleased || !rate.isFinite() || rate < 0f) return
        playbackOwned = true
        applyRate(rate)
    }

    private fun applyRate(rate: Float) {
        if (rate > 0f) preferredRate = rate
        desiredRate = rate
        if (desiredRate > 0 && completed) seek(0)
        updatePlayback(forcePlayWhenReady = true)
    }

    fun play() = setRate(preferredRate)

    fun setPreferredRate(rate: Float) {
        if (released || pageReleased) return
        playbackOwned = true
        preferredRate = rate
        if (desiredRate > 0f) desiredRate = rate
        updatePlayback()
    }

    fun setSurfaceRate(rate: Float) {
        if (!released && !pageReleased && !playbackOwned && rate.isFinite() && rate >= 0f) applyRate(rate)
    }

    fun setVolumeFromObject(volume: Float) {
        volumeOwned = true
        setVolume(volume)
    }

    fun setSurfaceVolume(volume: Float) {
        // ValdiVideoView also uses -1 for an absent attribute; it is not a request to mute.
        if (!volumeOwned && !released && !pageReleased && volume.isFinite() && volume >= 0f) {
            setVolume(volume.coerceIn(0f, 1f))
        }
    }

    private fun setVolume(volume: Float) {
        player.volume = volume
        publishState()
    }

    fun seekFromObject(position: Long) {
        seekOwned = true
        seek(position)
    }

    fun seekFromSurface(position: Long) {
        if (!seekOwned && !released && !pageReleased) seek(position)
    }

    fun setNativePlayback(play: Boolean) {
        if (released) return
        // Native controls retain PiP ownership after releasePage() severs every JS binding.
        playbackOwned = true
        applyRate(if (play) preferredRate else 0f)
    }

    fun seek(position: Long) {
        if (released) return
        val end = player.duration
        completed = false
        player.seekTo(if (end != C.TIME_UNSET && end >= 0) position.coerceIn(0, end) else position.coerceAtLeast(0))
        publishState()
    }

    fun updatePlayback(forcePlayWhenReady: Boolean = false) {
        if (released) return
        val inlineAttached = activeBinding?.let { it.bound && !it.disposed && it.attached } == true
        val livePip = host.presentation?.isLivePip(this) == true
        val allowed = livePip || when (mode) {
            FULLSCREEN -> host.foreground
            INLINE -> !pageReleased && pageVisible && host.foreground && inlineAttached
            else -> false
        }
        // Install preference while paused too; changing it never changes desired play/pause intent.
        if (player.playbackParameters.speed != preferredRate) player.setPlaybackSpeed(preferredRate)
        val nextPlayback = desiredRate > 0f && allowed && error.isEmpty()
        val changed = requestedPlayback != nextPlayback
        requestedPlayback = nextPlayback
        // Do not turn every layout/lifecycle refresh into another play request after audio-focus loss.
        // Explicit object/native commands can retry play even when intent was already "playing".
        if (forcePlayWhenReady || (changed && player.playWhenReady != requestedPlayback)) {
            player.playWhenReady = requestedPlayback
        }
        publishState()
    }

    fun state() = VideoState(
        player.currentPosition.toDouble(), duration(), player.isPlaying, desiredRate > 0f, mode,
        host.presentation?.supportsPip() == true, error,
        loaded, completed, player.volume.toDouble(), preferredRate.toDouble(), sequence,
    )

    private fun VideoState.copySnapshot() = VideoState(
        currentTimeMs, durationMs, playing, requestedPlayback, mode, supportsPictureInPicture, error,
        loaded, ended, volume, playbackRate, sequence,
    )

    fun subscribe(callback: (VideoState) -> Unit): VideoSubscription {
        host.checkMain()
        val subscription = VideoSubscriptionImpl(host, this, callback)
        subscriptions.add(subscription)
        publishState(listOf(subscription))
        return subscription
    }

    fun unsubscribe(subscription: VideoSubscriptionImpl) {
        host.checkMain()
        subscription.listener = null
        subscriptions.remove(subscription)
        if (subscriptions.isEmpty()) clearStateEvents()
    }

    private fun publishState(recipients: List<VideoSubscriptionImpl> = subscriptions.toList()) {
        if (released || pageReleased) return
        sequence += 1.0
        if (recipients.isEmpty()) return
        stateEvents.addLast(StateEvent(state(), recipients))
        scheduleStateDelivery()
    }

    private fun scheduleStateDelivery() {
        if (released || pageReleased || delivering || deliveryScheduled || stateEvents.isEmpty()) return
        deliveryScheduled = true
        host.main.post(deliverState)
    }

    private fun clearStateEvents() {
        host.main.removeCallbacks(deliverState)
        deliveryScheduled = false
        stateEvents.clear()
    }

    private fun clearSubscriptions() {
        subscriptions.forEach { it.listener = null }
        subscriptions.clear()
        clearStateEvents()
    }

    fun releasePage() {
        host.checkMain()
        pageReleased = true
        clearSubscriptions()
        clearBindings()
    }

    private fun duration(): Double = player.duration.let {
        if (it == C.TIME_UNSET || it < 0) 0.0 else it.toDouble()
    }

    fun deliverSnapshot(binding: VideoBinding) {
        // Queue after attribute installation so synchronous callback re-entry cannot interrupt view setup.
        if (binding.snapshotPending) return
        binding.snapshotPending = true
        host.main.post {
            binding.snapshotPending = false
            if (binding.disposed || !binding.bound) return@post
            val failure = if (released || pageReleased) "Video session was released" else error
            if (failure.isNotEmpty()) {
                val callback = binding.callbacks?.onError
                if (callback != null && (binding.errorCallback !== callback || binding.deliveredError != failure)) {
                    binding.errorCallback = callback
                    binding.deliveredError = failure
                    invoke(callback, failure)
                }
            } else if (loaded && activeBinding === binding) {
                val callback = binding.callbacks?.onVideoLoaded
                if (callback != null && binding.loadedCallback !== callback) {
                    binding.loadedCallback = callback
                    invoke(callback, duration())
                }
            }
        }
    }

    private fun emit(action: (com.snap.valdi.utils.ValdiVideoPlayer.Callbacks) -> Unit) {
        if (pageReleased || released) return
        activeBinding?.takeIf { it.bound && !it.disposed }?.callbacks?.let(action)
    }

    private fun invoke(function: ValdiFunction?, vararg arguments: Any?) {
        if (function == null) return
        try {
            // ValdiFunction has perform(marshaller), not invoke(...). performUntyped uses that real contract.
            function.performUntyped(arrayOf(*arguments))
        } catch (failure: Exception) {
            Log.w("ValdiVideo", "Video callback unavailable", failure)
        }
    }

    fun clearBindings() {
        // ValdiVideoView still owns these callback objects and can reuse them. Drop our references; do not
        // call ValdiFunction.dispose() on borrowed callbacks and invalidate the renderer's own handles.
        bindings.toList().forEach { it.dispose() }
        activeBinding = null
        host.main.removeCallbacks(progress)
    }

    fun dispose() {
        if (released) return
        released = true
        clearSubscriptions()
        host.main.removeCallbacks(progress)
        clearBindings()
        player.removeListener(listener)
        playerView.setFullscreenButtonClickListener(null)
        playerView.player = null
        playerView.keepScreenOn = false
        (playerView.parent as? ViewGroup)?.removeView(playerView)
        player.release()
    }

    private class StateEvent(val state: VideoState, val recipients: List<VideoSubscriptionImpl>)

    companion object {
        val INLINE = VideoMode.Inline
        val FULLSCREEN = VideoMode.Fullscreen
        val PIP = VideoMode.PictureInPicture
    }
}
