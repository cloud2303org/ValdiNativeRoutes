package io.valdiroutes.video

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import io.valdiroutes.app.R

/** Presentation is borrowed from the existing Compose Activity, never from another Activity or JS runtime. */
@OptIn(UnstableApi::class)
internal class VideoPresentation(
    private val host: VideoHostImpl,
    val activity: ComponentActivity,
    private val onFullscreenChanged: (Boolean) -> Unit,
) {
    var active: VideoSession? = null
        private set
    private var overlay: FrameLayout? = null
    private var controls: LinearLayout? = null
    private var savedBars: Bars? = null
    private var pipConfirmed = false
    private var pipPending = false
    private var stopped = false
    private var mediaSession: MediaSession? = null
    private var disposed = false
    private val actionName = "${activity.packageName}.video.CONTROL"
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val session = active ?: return
            if (intent.action != actionName || intent.getStringExtra("id") != session.id || session.released) return
            when (intent.getStringExtra("command")) {
                "play" -> session.setNativePlayback(true)
                "pause" -> session.setNativePlayback(false)
                "back" -> session.seek((session.player.currentPosition - 10_000).coerceAtLeast(0))
                "forward" -> session.seek(session.player.currentPosition + 10_000)
            }
            updatePipActions(session)
        }
    }

    init {
        val filter = IntentFilter(actionName).apply {
            addDataScheme("valdi-video-control")
        }
        ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    fun supportsPip(): Boolean = activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    fun isLivePip(session: VideoSession): Boolean =
        active === session && (pipConfirmed || pipPending || activity.isInPictureInPictureMode)

    fun enterFullscreen(session: VideoSession) {
        check(!disposed && !activity.isFinishing && !activity.isDestroyed) { "Video Activity is unavailable" }
        check(!activity.isInPictureInPictureMode && !pipPending) { "Activity is already in picture-in-picture" }
        if (active === session && session.mode == VideoSession.FULLSCREEN) return
        active?.let { previous ->
            check(previous.mode != VideoSession.PIP) { "Another video owns picture-in-picture" }
            remove(previous)
        }
        active = session
        session.mode = VideoSession.FULLSCREEN
        val content = FrameLayout(activity).apply {
            setBackgroundColor(Color.BLACK)
            isClickable = true
            isFocusable = true
        }
        overlay = content
        activity.addContentView(content, ViewGroup.LayoutParams(-1, -1))
        session.movePlayerTo(content)
        session.playerView.useController = true
        session.playerView.setFullscreenButtonState(true)
        val buttons = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            if (supportsPip()) addView(Button(activity).apply {
                text = "Picture in picture"
                setOnClickListener {
                    try {
                        enterPictureInPicture(session)
                    } catch (failure: Exception) {
                        android.widget.Toast.makeText(activity, failure.message ?: "PiP unavailable", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            })
        }
        controls = buttons
        content.addView(buttons, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START))
        ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
            val safe = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            buttons.setPadding(safe.left, safe.top, safe.right, 0)
            insets
        }
        ViewCompat.requestApplyInsets(content)
        saveAndHideBars()
        onFullscreenChanged(true)
        session.updatePlayback()
    }

    fun exitFullscreen(session: VideoSession) {
        if (active !== session || session.mode == VideoSession.PIP || pipPending) return
        remove(session)
    }

    fun enterPictureInPicture(session: VideoSession) {
        check(supportsPip()) { "Picture-in-picture is not supported on this device" }
        check(host.foreground && activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            "Picture-in-picture requires a resumed Activity"
        }
        if (isLivePip(session)) return
        check(!pipConfirmed && !pipPending && !activity.isInPictureInPictureMode) { "Another video owns picture-in-picture" }
        // Capture the current video bounds before expanding its view into the Activity.
        val sourceRect = Rect().takeIf { session.playerView.getGlobalVisibleRect(it) && !it.isEmpty }
        val wasFullscreen = active === session && session.mode == VideoSession.FULLSCREEN
        if (!wasFullscreen) enterFullscreen(session)
        pipPending = true
        // Keep getState.mode at fullscreen until the Activity confirms actual PiP entry.
        controls?.visibility = View.GONE
        session.playerView.useController = false
        onFullscreenChanged(false)
        try {
            // A real Media3 session exposes the SAME decoder to system/media-button transports.
            // Its direct player commands are recorded by VideoSession's native intent listener.
            // Defer session construction until requested PiP; ordinary page creation pays no IPC cost.
            mediaSession = MediaSession.Builder(host.context, session.player)
                .setId("valdi-video-${session.id}")
                .build()
            check(activity.enterPictureInPictureMode(pipParams(session, sourceRect))) { "System declined picture-in-picture" }
            // Mode is confirmed by onPictureInPictureModeChanged; release() also honors this pending transfer.
            session.updatePlayback()
        } catch (failure: Exception) {
            pipPending = false
            releaseMediaSession()
            session.mode = VideoSession.FULLSCREEN
            controls?.visibility = View.VISIBLE
            session.playerView.useController = true
            onFullscreenChanged(true)
            if (!wasFullscreen) remove(session)
            throw failure
        }
    }

    fun onPictureInPictureModeChanged(inPip: Boolean) {
        if (disposed) return
        if (inPip) {
            pipConfirmed = true
            pipPending = false
            active?.let {
                it.mode = VideoSession.PIP
                controls?.visibility = View.GONE
                it.playerView.useController = false
                it.updatePlayback()
            }
            onFullscreenChanged(false)
        } else {
            pipConfirmed = false
            pipPending = false
            // Expansion and dismissal can both deliver this before their lifecycle transition.
            // RESUMED means expansion; onStop/onDestroy owns dismissal. Never guess from a timer.
            host.main.post {
                if (disposed || activity.isInPictureInPictureMode) return@post
                val session = active?.takeIf { it.mode == VideoSession.PIP } ?: return@post
                if (activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && !activity.isFinishing) {
                    finishPip(session)
                } else if (activity.isFinishing || activity.isDestroyed ||
                    (stopped && !activity.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))) {
                    // onStop may have arrived BEFORE this mode callback. Complete that dismissal here.
                    host.destroy(session)
                }
            }
        }
    }

    fun onResume() {
        stopped = false
        if (!activity.isInPictureInPictureMode && !pipPending) {
            active?.takeIf { it.mode == VideoSession.PIP }?.let(::finishPip)
        }
    }

    fun onStop() {
        stopped = true
        // Do not destroy from a stale session.mode alone. Pending/actual PiP can cross the Activity's
        // lifecycle callbacks in either order. A subsequent mode-exit callback or detach owns cleanup.
        if (!pipPending && !activity.isInPictureInPictureMode) {
            active?.takeIf { it.mode == VideoSession.PIP }?.let { host.destroy(it) }
        }
    }

    private fun finishPip(session: VideoSession) {
        pipConfirmed = false
        pipPending = false
        if (session.pageReleased) host.destroy(session) else remove(session)
    }

    fun updatePipActions(session: VideoSession) {
        if (active !== session || (!pipConfirmed && !pipPending) || disposed || session.released) return
        try {
            activity.setPictureInPictureParams(pipParams(session, null))
        } catch (_: IllegalStateException) {
            // The Activity may already be leaving PiP; its lifecycle callback owns cleanup.
        } catch (_: IllegalArgumentException) {
            // Retain the last accepted parameters if the platform rejects an update during transition.
        }
    }

    private fun pipParams(session: VideoSession, sourceRect: Rect?): PictureInPictureParams {
        val size = session.player.videoSize
        val aspect = if (size.width > 0 && size.height > 0) {
            (size.width.toDouble() * size.pixelWidthHeightRatio / size.height).coerceIn(1.0 / 2.39, 2.39)
        } else 16.0 / 9.0
        // Publish explicit commands: an old "Play" PendingIntent must never toggle into a pause.
        val playing = session.player.playWhenReady && session.player.playbackState != Player.STATE_ENDED
        val actions = listOf(
            action(session, "back", "Back 10 seconds", R.drawable.valdi_video_pip_back),
            action(session, if (playing) "pause" else "play", if (playing) "Pause" else "Play",
                if (playing) R.drawable.valdi_video_pip_pause else R.drawable.valdi_video_pip_play),
            action(session, "forward", "Forward 10 seconds", R.drawable.valdi_video_pip_forward),
        )
        return PictureInPictureParams.Builder()
            .setAspectRatio(Rational((aspect * 1000).toInt().coerceIn(419, 2390), 1000))
            .setActions(actions)
            .apply {
                if (sourceRect != null) setSourceRectHint(sourceRect)
                if (Build.VERSION.SDK_INT >= 31) setAutoEnterEnabled(false)
            }
            .build()
    }

    private fun action(session: VideoSession, command: String, title: String, icon: Int): RemoteAction {
        val intent = Intent(actionName).setPackage(activity.packageName)
            .setData(android.net.Uri.parse("valdi-video-control://${session.id}/$command"))
            .putExtra("id", session.id).putExtra("command", command)
        val pending = PendingIntent.getBroadcast(activity, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return RemoteAction(Icon.createWithResource(activity, icon), title, title, pending).apply {
            isEnabled = command == "play" || command == "pause" || session.player.isCurrentMediaItemSeekable
        }
    }

    fun remove(session: VideoSession) {
        if (active !== session) return
        active = null
        pipPending = false
        pipConfirmed = false
        releaseMediaSession()
        session.mode = VideoSession.INLINE
        session.playerView.setFullscreenButtonState(false)
        (session.playerView.parent as? ViewGroup)?.removeView(session.playerView)
        overlay?.let { (it.parent as? ViewGroup)?.removeView(it) }
        overlay = null
        controls = null
        restoreBars()
        onFullscreenChanged(false)
        session.restoreInline()
        session.updatePlayback()
    }

    private fun saveAndHideBars() {
        val decor = activity.window.decorView
        val controller = WindowCompat.getInsetsController(activity.window, decor)
        val insets = ViewCompat.getRootWindowInsets(decor)
        savedBars = Bars(
            controller.isAppearanceLightStatusBars, controller.isAppearanceLightNavigationBars,
            controller.systemBarsBehavior,
            insets?.isVisible(WindowInsetsCompat.Type.statusBars()) ?: true,
            insets?.isVisible(WindowInsetsCompat.Type.navigationBars()) ?: true,
        )
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun restoreBars() {
        val bars = savedBars ?: return
        savedBars = null
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = bars.lightStatus
            isAppearanceLightNavigationBars = bars.lightNavigation
            systemBarsBehavior = bars.behavior
            if (bars.statusVisible) show(WindowInsetsCompat.Type.statusBars()) else hide(WindowInsetsCompat.Type.statusBars())
            if (bars.navigationVisible) show(WindowInsetsCompat.Type.navigationBars()) else hide(WindowInsetsCompat.Type.navigationBars())
        }
    }

    fun dispose() {
        if (disposed) return
        active?.let(::remove)
        activity.unregisterReceiver(receiver)
        disposed = true
    }

    private fun releaseMediaSession() {
        val previous = mediaSession
        mediaSession = null
        previous?.release()
    }

    private data class Bars(
        val lightStatus: Boolean,
        val lightNavigation: Boolean,
        val behavior: Int,
        val statusVisible: Boolean,
        val navigationVisible: Boolean,
    )
}
