package io.valdiroutes.video

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import com.snap.valdi.promise.Promise
import com.snap.valdi.promise.ResolvablePromise
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Application-scoped resource registry shared explicitly by the generated module factory and the asset loader.
 * Only the map lookup crosses threads; every session, player and Activity operation runs on main.
 */
class VideoHostImpl internal constructor(internal val context: Context) : VideoHost {
    internal val main = Handler(Looper.getMainLooper())
    internal val sessions = ConcurrentHashMap<String, VideoSession>()
    internal var presentation: VideoPresentation? = null
        private set
    internal var foreground = false
        private set
    val loader = VideoLoader(this)

    override fun create(source: String): Promise<VideoPlayer> = onMain {
        checkNotNull(presentation) { "Video playback requires an attached Activity" }
        val uri = Uri.parse(source).normalizeScheme()
        require(uri.scheme in listOf("asset", "https", "http", "file", "content")) {
            "Unsupported video source scheme"
        }
        require(!uri.path.isNullOrEmpty() || !uri.host.isNullOrEmpty()) { "Empty video source" }
        val id = UUID.randomUUID().toString()
        val session = VideoSession(this, id, uri)
        sessions[id] = session
        VideoPlayerImpl(this, session)
    }

    fun attach(activity: ComponentActivity, onFullscreenChanged: (Boolean) -> Unit) {
        checkMain()
        val current = presentation
        if (current != null) {
            if (current.activity === activity) return
            // A relaunched task can attach before the previous Activity is destroyed.
            detach(current.activity)
        }
        presentation = VideoPresentation(this, activity, onFullscreenChanged)
    }

    fun onResume(activity: ComponentActivity) {
        if (presentation?.activity !== activity) return
        foreground = true
        presentation?.onResume()
        sessions.values.forEach { it.updatePlayback() }
    }

    fun onPause(activity: ComponentActivity) {
        if (presentation?.activity !== activity) return
        foreground = false
        sessions.values.forEach { it.updatePlayback() }
    }

    fun onStop(activity: ComponentActivity) {
        if (presentation?.activity !== activity) return
        foreground = false
        presentation?.onStop()
        sessions.values.forEach { it.updatePlayback() }
    }

    fun onPictureInPictureModeChanged(activity: ComponentActivity, inPip: Boolean) {
        if (presentation?.activity === activity) presentation?.onPictureInPictureModeChanged(inPip)
    }

    fun exitFullscreenFromBack() {
        presentation?.let { it.active?.let(it::exitFullscreen) }
    }

    fun detach(activity: ComponentActivity) {
        if (presentation?.activity !== activity) return
        // A player never outlives its Activity's actual destruction, including a dismissed PiP task.
        sessions.values.toList().forEach(::destroy)
        presentation?.dispose()
        presentation = null
        foreground = false
    }

    internal fun destroy(session: VideoSession) {
        checkMain()
        presentation?.remove(session)
        sessions.remove(session.id, session)
        session.dispose()
    }

    internal fun requirePresentation(): VideoPresentation = checkNotNull(presentation) { "No video Activity attached" }

    internal fun checkMain() = check(Looper.myLooper() == Looper.getMainLooper()) { "Video operation requires main" }

    internal fun dispatch(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post { action() }
    }

    internal fun <T> onMain(action: () -> T): Promise<T> = ResolvablePromise<T>().also { promise ->
        // Never block the JS thread waiting for UI work.
        main.post {
            try {
                promise.fulfillSuccess(action())
            } catch (error: Exception) {
                promise.fulfillFailure(error)
            }
        }
    }
}
