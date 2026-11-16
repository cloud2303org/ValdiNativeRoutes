package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import androidx.annotation.Keep
import com.snap.valdi.extensions.ViewUtils
import com.snap.valdi.views.ValdiView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

internal enum class DetentKind {
    POINTS,
    PERCENTAGE,
    CONTENT,
}

internal enum class ScrollCoordinationLevel {
    NONE,
    INITIAL,
    HANDOFF;

    companion object {
        fun fromWireValue(value: Int): ScrollCoordinationLevel = when (value) {
            1 -> INITIAL
            2 -> HANDOFF
            else -> NONE
        }
    }
}

/** Per-detent horizontal and bottom margins of the card, in px. */
internal data class DetentInsets(
    val left: Float = 0f,
    val right: Float = 0f,
    val bottom: Float = 0f,
) {
    val isInset: Boolean
        get() = left > 0f || right > 0f || bottom > 0f
}

/** Unresolved detent specification received from Valdi TSX props (lengths in dp/pt). */
internal data class RawDetentSpec(
    val value: Float,
    val kind: DetentKind,
    val programmatic: Boolean = false,
    val usesStatusBarTopInset: Boolean = false,
    val insetTopDp: Float = 0f,
    val insetLeftDp: Float = 0f,
    val insetRightDp: Float = 0f,
    val insetBottomDp: Float = 0f,
    val widestCard: Boolean = false,
    val scrimOpacity: Float = 1f,
)

/** Resolved detent specification in pixels for the current container size. */
internal data class DetentSpec(
    val heightPx: Int,
    val programmatic: Boolean = false,
    val insets: DetentInsets = DetentInsets(),
    val scrimOpacity: Float = 1f,
) {
    val totalHeightPx: Float
        get() = heightPx + insets.bottom
}

/** Pure math helpers shared between `BottomSheetHostView` and unit tests. */
internal object BottomSheetMath {
    const val RELEASE_PROJECTION_SECONDS = 0.1f
    const val DEFAULT_SETTLE_DURATION_SECONDS = 0.45f
    const val SETTLE_SETTLED_FRACTION = 8f
    const val MAX_SPRING_OMEGA = 100f
    const val MIN_SETTLE_DURATION_SECONDS = 0.001f

    /**
     * Projects release position in sheet-height coordinates (`openHeightPx - velocityY * 0.1s`)
     * and returns the closest snap target among interactive detents (plus `0` when modal & no
     * `onCloseRequest` handler, or including `0` so close requests can be detected).
     */
    fun resolveReleaseTargetIndex(
        detents: List<DetentSpec>,
        currentOpenHeightPx: Float,
        velocityYPxPerSec: Float,
        canDismissOrClose: Boolean,
    ): Int {
        if (detents.isEmpty()) return -1
        val projectedHeight = currentOpenHeightPx - velocityYPxPerSec * RELEASE_PROJECTION_SECONDS
        var bestIndex = -1
        var bestDistance = Float.POSITIVE_INFINITY

        if (canDismissOrClose) {
            bestIndex = -1
            bestDistance = abs(projectedHeight - 0f)
        }

        for (i in detents.indices) {
            val spec = detents[i]
            if (spec.programmatic) continue
            val dist = abs(projectedHeight - spec.totalHeightPx)
            if (dist < bestDistance) {
                bestDistance = dist
                bestIndex = i
            }
        }

        // Fallback if all detents were marked programmatic and sheet cannot close.
        if (bestIndex == -1 && !canDismissOrClose) {
            for (i in detents.indices) {
                val dist = abs(projectedHeight - detents[i].totalHeightPx)
                if (dist < bestDistance) {
                    bestDistance = dist
                    bestIndex = i
                }
            }
        }
        return bestIndex
    }

    /**
     * Computes critically-damped natural frequency `omega` (`stiffness = omega^2`), matching
     * upstream v1.0.0: `omega = min(MAX_SPRING_OMEGA, max(8 / settleDuration, |v0| / |distance|))`.
     */
    fun computeCriticalSpringOmega(
        distancePx: Float,
        initialVelocityPxPerSec: Float,
        settleDurationSeconds: Float,
    ): Float {
        val effectiveDuration =
            if (settleDurationSeconds > 0f) max(settleDurationSeconds, MIN_SETTLE_DURATION_SECONDS)
            else DEFAULT_SETTLE_DURATION_SECONDS
        val baseOmega = SETTLE_SETTLED_FRACTION / effectiveDuration
        val absDistance = abs(distancePx)
        val velocityOmega =
            if (absDistance > 0.5f) abs(initialVelocityPxPerSec) / absDistance else 0f
        return max(baseOmega, velocityOmega).coerceIn(1f, MAX_SPRING_OMEGA)
    }

    /**
     * Computes continuous fractional detent index (`-1.0` closed .. `N - 1` highest detent)
     * from current `openHeightPx` (`containerHeight - sheetOffsetY`).
     */
    fun computeFractionalIndex(detents: List<DetentSpec>, openHeightPx: Float): Float {
        if (detents.isEmpty()) return -1f
        val firstTotal = detents[0].totalHeightPx
        if (openHeightPx <= 0f) return -1f
        if (openHeightPx <= firstTotal) {
            return if (firstTotal > 0f) (openHeightPx / firstTotal) - 1f else 0f
        }
        for (i in 0 until detents.lastIndex) {
            val low = detents[i].totalHeightPx
            val high = detents[i + 1].totalHeightPx
            if (openHeightPx <= high) {
                val span = high - low
                return if (span > 0f) i + (openHeightPx - low) / span else i.toFloat()
            }
        }
        return detents.lastIndex.toFloat()
    }

    /**
     * Interpolates per-detent [DetentInsets] across adjacent detents (and holds `detents[0].insets`
     * while closing below `detents[0]`).
     */
    fun interpolateInsets(detents: List<DetentSpec>, openHeightPx: Float): DetentInsets {
        if (detents.isEmpty()) return DetentInsets()
        if (openHeightPx <= detents[0].totalHeightPx || detents.size == 1) {
            return detents[0].insets
        }
        for (i in 0 until detents.lastIndex) {
            val low = detents[i]
            val high = detents[i + 1]
            if (openHeightPx <= high.totalHeightPx) {
                val span = high.totalHeightPx - low.totalHeightPx
                val t = if (span > 0f) ((openHeightPx - low.totalHeightPx) / span).coerceIn(0f, 1f) else 0f
                return DetentInsets(
                    left = lerp(low.insets.left, high.insets.left, t),
                    right = lerp(low.insets.right, high.insets.right, t),
                    bottom = lerp(low.insets.bottom, high.insets.bottom, t),
                )
            }
        }
        return detents.last().insets
    }

    /**
     * Interpolates modal scrim opacity from `0` at closed (`openHeight == 0`) through each detent's
     * configured `scrimOpacity`.
     */
    fun interpolateScrimOpacity(detents: List<DetentSpec>, openHeightPx: Float): Float {
        if (detents.isEmpty() || openHeightPx <= 0f) return 0f
        val first = detents[0]
        if (openHeightPx <= first.totalHeightPx) {
            return if (first.totalHeightPx > 0f) {
                ((openHeightPx / first.totalHeightPx) * first.scrimOpacity).coerceIn(0f, 1f)
            } else {
                first.scrimOpacity.coerceIn(0f, 1f)
            }
        }
        for (i in 0 until detents.lastIndex) {
            val low = detents[i]
            val high = detents[i + 1]
            if (openHeightPx <= high.totalHeightPx) {
                val span = high.totalHeightPx - low.totalHeightPx
                val t = if (span > 0f) ((openHeightPx - low.totalHeightPx) / span).coerceIn(0f, 1f) else 0f
                return lerp(low.scrimOpacity, high.scrimOpacity, t).coerceIn(0f, 1f)
            }
        }
        return detents.last().scrimOpacity.coerceIn(0f, 1f)
    }

    /** Rubber-band resistance above maximum detent or below minimum non-modal detent. */
    fun rubberBand(overshootPx: Float, dimensionPx: Float): Float {
        if (dimensionPx <= 0f || overshootPx == 0f) return 0f
        val sign = if (overshootPx < 0f) -1f else 1f
        val absOvershoot = abs(overshootPx)
        val c = 0.55f
        return sign * (1f - (1f / ((absOvershoot * c / dimensionPx) + 1f))) * dimensionPx
    }

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
}

/** Draws the modal scrim fill without allocating drawables or capturing Valdi touches directly. */
internal class BottomSheetScrimCanvasView(context: Context) : View(context) {
    private val paint = Paint()
    private var baseColor: Int = DEFAULT_SCRIM_COLOR
    private var baseAlpha: Int = Color.alpha(DEFAULT_SCRIM_COLOR)
    var currentProgress: Float = 0f
        private set

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        ViewUtils.getOrCreateGestureRecognizers(this).hitTest = NEVER_HIT_VALDI_FUNCTION
        visibility = GONE
    }

    fun setScrimColor(colorArgb: Int) {
        if (baseColor == colorArgb) return
        baseColor = colorArgb
        baseAlpha = Color.alpha(colorArgb)
        invalidate()
    }

    fun setOpacityProgress(progress: Float) {
        val clamped = progress.coerceIn(0f, 1f)
        if (currentProgress == clamped) return
        currentProgress = clamped
        val alpha = (baseAlpha * clamped).roundToInt().coerceIn(0, 255)
        visibility = if (alpha > 0) VISIBLE else GONE
        invalidate()
    }

    val isScrimVisible: Boolean
        get() = visibility == VISIBLE && (baseAlpha * currentProgress).roundToInt() > 0

    override fun onDraw(canvas: Canvas) {
        val alpha = (baseAlpha * currentProgress).roundToInt().coerceIn(0, 255)
        if (alpha <= 0) return
        paint.color = Color.argb(
            alpha,
            Color.red(baseColor),
            Color.green(baseColor),
            Color.blue(baseColor),
        )
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    companion object {
        const val DEFAULT_SCRIM_COLOR: Int = 0x52000000
    }
}

/**
 * Wrapper `<custom-view>` around the optional custom `surface` slot in `BottomSheet.tsx`.
 * Reports its laid-out height to the enclosing [BottomSheetHostView].
 */
@Keep
class BottomSheetSurfaceView(context: Context) : ValdiView(context) {
    internal var onHeightChanged: ((Int) -> Unit)? = null

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        val h = (b - t).coerceAtLeast(0)
        if (changed) {
            onHeightChanged?.invoke(h)
        }
    }
}

/**
 * Wrapper `<custom-view>` around the sheet's content slot and trailing [BottomSheetMarkerView].
 */
@Keep
class BottomSheetContentWrapperView(context: Context) : ValdiView(context) {
    override val clipToBoundsDefaultValue: Boolean
        get() = false
}

/**
 * Zero-height `<custom-view>` placed immediately after `<slot />` inside
 * [BottomSheetContentWrapperView]. Its `top` in the content wrapper equals the exact natural
 * height of the rendered children (`'content'` detent height)!
 */
@Keep
class BottomSheetMarkerView(context: Context) : ValdiView(context) {
    internal var onMarkerTopChanged: ((Int) -> Unit)? = null
    private var lastReportedTop: Int = -1

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        ViewUtils.getOrCreateGestureRecognizers(this).hitTest = NEVER_HIT_VALDI_FUNCTION
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        val naturalTop = t.coerceAtLeast(0)
        if (naturalTop != lastReportedTop) {
            lastReportedTop = naturalTop
            onMarkerTopChanged?.invoke(naturalTop)
        }
    }
}
