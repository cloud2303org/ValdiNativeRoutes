package io.valdiroutes.video

import android.net.Uri
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import com.snap.valdi.exceptions.ValdiException
import com.snap.valdi.utils.Disposable
import com.snap.valdi.utils.DisposableUtils
import com.snap.valdi.utils.ValdiVideoLoader
import com.snap.valdi.utils.ValdiVideoPlayer
import com.snap.valdi.utils.ValdiVideoPlayerCreatedCompletion
import com.snap.valdi.views.ValdiTouchEventResult
import com.snap.valdi.views.ValdiTouchTarget
import java.util.concurrent.atomic.AtomicBoolean

/** Loads only app-owned session URLs; media URLs themselves are handled by Media3. */
class VideoLoader internal constructor(private val host: VideoHostImpl) : ValdiVideoLoader {
    override fun getSupportedURLSchemes(): List<String> = listOf("valdi-video")

    override fun getRequestPayload(url: Uri): Any {
        if (url.scheme != "valdi-video" || url.host.isNullOrEmpty() ||
            !url.path.isNullOrEmpty() || url.query != null || url.fragment != null) {
            throw ValdiException("Invalid video session URL")
        }
        val id = url.host ?: throw ValdiException("Invalid video session URL")
        val session = host.sessions[id] ?: throw ValdiException("Unknown video session")
        // Keep the real session available if release races the eventual load. release still destroys its
        // decoder immediately; a cached request never revives it or creates another player.
        return Request(session)
    }

    override fun loadVideo(requestPayload: Any, completion: ValdiVideoPlayerCreatedCompletion): Disposable {
        val session = (requestPayload as Request).session
        val canceled = AtomicBoolean(false)
        // Delivery and cleanup are serialized on main. Do not hold a Java monitor across a JNI completion.
        var delivered = false
        var binding: VideoBinding? = null
        host.main.post {
            if (!canceled.get()) {
                val value = VideoBinding(host, session)
                binding = value
                delivered = true
                // The pinned Kotlin completion requires a non-null player even on failure, and its
                // implementation prioritizes that player over error. Late release is therefore reported
                // through this real session binding's onError callback once Valdi installs callbacks.
                completion.onVideoPlayerCreated(value, null)
            }
        }
        return object : Disposable {
            override fun dispose() {
                if (!canceled.compareAndSet(false, true)) return
                host.main.post {
                    if (!delivered) DisposableUtils.disposeAny(completion)
                    binding?.dispose()
                }
            }
        }
    }

    private class Request(val session: VideoSession)

    companion object {
        internal fun matches(payload: Any, session: VideoSession): Boolean =
            payload is Request && payload.session === session
    }
}

/**
 * Each Valdi load gets its own anchor and callbacks, but never another decoder. Repeated loads of one source
 * transfer the single PlayerView to the latest attached anchor. Disposing an old load cannot pause the new one.
 */
internal class VideoBinding(
    private val host: VideoHostImpl,
    private val session: VideoSession,
) : ValdiVideoPlayer {
    val anchor = VideoAnchor(host.context)
    var callbacks: ValdiVideoPlayer.Callbacks? = null
        private set
    var disposed = false
        private set
    var bound = false
        private set
    var attached = false
        private set
    var loadedCallback: com.snap.valdi.callable.ValdiFunction? = null
    var errorCallback: com.snap.valdi.callable.ValdiFunction? = null
    var deliveredError: String? = null
    var snapshotPending = false

    private val attachListener = object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(view: View) {
            attached = true
            if (bound && !disposed) session.attach(this@VideoBinding)
        }
        override fun onViewDetachedFromWindow(view: View) {
            attached = false
            if (!disposed) session.detached(this@VideoBinding)
        }
    }

    init {
        anchor.addOnAttachStateChangeListener(attachListener)
        session.bindings.add(this)
    }

    override fun getView(): View {
        host.checkMain()
        return anchor
    }

    override fun setRequestPayload(payload: Any?) {
        // A binding is immutable; the loader has already bound its request. Reapplying a cached payload
        // is harmless, but another session must go through a new load, never mutate this decoder's source.
        if (payload != null && !VideoLoader.matches(payload, session)) {
            throw ValdiException("Cannot replace a video binding's session")
        }
    }

    override fun setVolume(volume: Float) = host.dispatch {
        if (!disposed && !session.released && bound && session.activeBinding === this && volume.isFinite()) {
            session.setSurfaceVolume(volume)
        }
    }

    override fun setPlaybackRate(rate: Float) = host.dispatch {
        // The official view installs defaults again when reloaded/recycled. Once object/native
        // controls own intent, those attributes are no longer authoritative (including default zero).
        if (!disposed && bound && session.activeBinding === this) session.setSurfaceRate(rate)
    }

    override fun setSeekToTime(time: Float) = host.dispatch {
        if (!disposed && bound && session.activeBinding === this && time.isFinite() && time >= 0f) {
            session.seekFromSurface(time.toLong())
        }
    }

    override fun setCallbacks(callbacks: ValdiVideoPlayer.Callbacks?) = host.dispatch {
        if (!disposed) {
            if (callbacks != null) {
                if (loadedCallback !== callbacks.onVideoLoaded) loadedCallback = null
                if (errorCallback !== callbacks.onError) {
                    errorCallback = null
                    deliveredError = null
                }
                this.callbacks = callbacks
                bound = true
                session.attach(this)
                session.deliverSnapshot(this)
            } else {
                clearCallbacks()
                session.detached(this)
            }
        }
    }

    fun clearCallbacks() {
        callbacks = null
        loadedCallback = null
        errorCallback = null
        deliveredError = null
        bound = false
    }

    fun dispose() {
        if (disposed) return
        disposed = true
        clearCallbacks()
        anchor.removeOnAttachStateChangeListener(attachListener)
        session.bindings.remove(this)
        session.detached(this)
        anchor.removeAllViews()
    }
}

/** Forward embedded native controls through the same touch contract as Valdi's WebView. */
internal class VideoAnchor(context: Context) : FrameLayout(context), ValdiTouchTarget {
    override fun processTouchEvent(event: MotionEvent): ValdiTouchEventResult =
        if (dispatchTouchEvent(event)) ValdiTouchEventResult.ConsumeEventAndCancelOtherGestures
        else ValdiTouchEventResult.IgnoreEvent
}
