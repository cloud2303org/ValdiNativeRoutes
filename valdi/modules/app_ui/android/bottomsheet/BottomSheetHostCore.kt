package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import androidx.annotation.Keep
import androidx.dynamicanimation.animation.SpringForce
import com.snap.valdi.extensions.ViewUtils
import com.snap.valdi.views.ValdiView
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
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

/** Horizontal span of the card inside its host container, in px. */
internal data class CardSpan(
    val left: Float,
    val width: Float,
) {
    val right: Float
        get() = left + width
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
    val maxWidthDp: Float = 0f,
    val placementBias: Float = 0.5f,
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
    const val DEFAULT_SETTLE_DURATION_SECONDS = 0.25f
    const val DEFAULT_SPRING_STIFFNESS = SpringForce.STIFFNESS_MEDIUM
    const val MAX_DEFAULT_SPRING_VELOCITY_RATIO = 5f
    const val FLICK_VELOCITY_THRESHOLD_DP_PER_SEC = 600f
    const val SETTLE_SETTLED_FRACTION = 8f
    const val SETTLE_MIN_VISIBLE_CHANGE = 0.001f
    const val MAX_SPRING_OMEGA = 100f
    const val MIN_SETTLE_DURATION_SECONDS = 0.001f

    /**
     * Width of the sheet's column in a host `hostWidthPx` wide, capped at `maxWidthPx` (`0` for no cap).
     * Mirrors `columnWidth` in `cardPlacement.ts`.
     */
    fun columnWidth(hostWidthPx: Float, maxWidthPx: Float): Float =
        if (maxWidthPx > 0f) min(maxWidthPx, hostWidthPx) else hostWidthPx

    /**
     * Places the card horizontally across a host `hostWidthPx` wide, snapping the column origin to a
     * whole device pixel so centered columns in odd free widths stay crisp. Mirrors `placeCard` in `cardPlacement.ts`.
     */
    fun placeCard(
        hostWidthPx: Float,
        insets: DetentInsets,
        maxWidthPx: Float = 0f,
        placementBias: Float = 0.5f,
    ): CardSpan {
        val column = columnWidth(hostWidthPx, maxWidthPx)
        val columnLeft = (placementBias * (hostWidthPx - column)).roundToInt().toFloat()
        return CardSpan(
            left = columnLeft + insets.left,
            width = (column - insets.left - insets.right).coerceAtLeast(0f),
        )
    }

    /**
     * Scale factor applied to content when the current card width differs from the widest card width.
     */
    fun contentScale(cardWidthPx: Float, widestCardWidthPx: Float): Float =
        if (widestCardWidthPx > 0f) (cardWidthPx / widestCardWidthPx).coerceAtLeast(0f) else 1f

    /**
     * Resolves the release snap target using `0.16.2`'s `600 dp/s` flick threshold so tall
     * modal sheets dismiss crisply on natural downward flicks while slow drags settle to the
     * nearest interactive detent (or closed when `canDismissOrClose`).
     */
    fun resolveReleaseTargetIndex(
        detents: List<DetentSpec>,
        currentOpenHeightPx: Float,
        velocityYPxPerSec: Float,
        canDismissOrClose: Boolean,
        density: Float = 1f,
    ): Int {
        if (detents.isEmpty()) return -1
        val candidates = ArrayList<Pair<Int, Float>>(detents.size + 1)
        if (canDismissOrClose) {
            candidates.add(-1 to 0f)
        }
        for (i in detents.indices) {
            val spec = detents[i]
            if (!spec.programmatic) {
                candidates.add(i to spec.totalHeightPx)
            }
        }

        // Fallback if all detents were marked programmatic and sheet cannot close.
        if (candidates.isEmpty()) {
            for (i in detents.indices) {
                candidates.add(i to detents[i].totalHeightPx)
            }
        }

        val flickThreshold = FLICK_VELOCITY_THRESHOLD_DP_PER_SEC * density.coerceAtLeast(0.001f)
        if (velocityYPxPerSec < -flickThreshold) {
            return candidates.firstOrNull { it.second > currentOpenHeightPx + 0.5f }?.first
                ?: candidates.last().first
        }
        if (velocityYPxPerSec > flickThreshold) {
            return candidates.lastOrNull { it.second < currentOpenHeightPx - 0.5f }?.first
                ?: candidates.first().first
        }
        return candidates.minBy { abs(it.second - currentOpenHeightPx) }.first
    }

    /**
     * Clamps release velocity ratio against travel distance (`[-5, 5] * distance`) matching
     * `0.16.2` `SheetHostView.kt` for the default `STIFFNESS_MEDIUM` spring.
     */
    fun clampDefaultSpringVelocity(
        distancePx: Float,
        initialVelocityPxPerSec: Float,
    ): Float {
        if (distancePx == 0f) return 0f
        val velocityRatio = initialVelocityPxPerSec / distancePx
        return velocityRatio.coerceIn(
            -MAX_DEFAULT_SPRING_VELOCITY_RATIO,
            MAX_DEFAULT_SPRING_VELOCITY_RATIO,
        ) * distancePx
    }

    /**
     * Computes critically-damped natural frequency `omega` (`stiffness = omega^2`), matching
     * upstream v1.1.0: `omega = min(MAX_SPRING_OMEGA, max(8 / settleDuration, |v0| / |distance|))`.
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
     * Clamps initial velocity toward the target so a critically-damped spring with capped `omega`
     * never overshoots its target.
     */
    fun clampSpringInitialVelocity(
        startOffsetPx: Float,
        initialVelocityPxPerSec: Float,
        omega: Float,
    ): Float {
        if (abs(startOffsetPx) <= 1e-4f) return 0f
        return if ((initialVelocityPxPerSec / startOffsetPx) < -omega) {
            -omega * startOffsetPx
        } else {
            initialVelocityPxPerSec
        }
    }

    /**
     * Residual offset left on the unscaled critically-damped spring at `omega * t = 8`.
     * Scaling this residual out of the curve lets the animation land on `target` at the exact
     * settle duration without a final-frame jump (upstream v1.1.0 `73723b3a`).
     */
    fun computeSpringEndOffset(
        startOffsetPx: Float,
        clampedInitialVelocityPxPerSec: Float,
        omega: Float,
    ): Float {
        if (omega <= 0f || abs(startOffsetPx) <= 1e-4f) return 0f
        val duration = SETTLE_SETTLED_FRACTION / omega
        return exp(-SETTLE_SETTLED_FRACTION) *
            (startOffsetPx + (clampedInitialVelocityPxPerSec + omega * startOffsetPx) * duration)
    }

    /**
     * Maps an unscaled `SpringAnimation` value onto the exact-landing curve (`(position, settled)`).
     */
    fun scaleSpringPosition(
        rawValuePx: Float,
        targetValuePx: Float,
        startOffsetPx: Float,
        endOffsetPx: Float,
    ): Pair<Float, Boolean> {
        val denom = startOffsetPx - endOffsetPx
        if (abs(denom) <= 1e-5f) return targetValuePx to true
        val remaining = (rawValuePx - targetValuePx - endOffsetPx) / denom
        return if (remaining > 1e-5f && abs(startOffsetPx * remaining) > SETTLE_MIN_VISIBLE_CHANGE) {
            (targetValuePx + startOffsetPx * remaining) to false
        } else {
            targetValuePx to true
        }
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

    /**
     * Defers initial sheet presentation while targeting a `'content'` detent whose
     * [BottomSheetMarkerView] has not yet reported a natural height.
     */
    fun shouldWaitForContentMeasurement(
        rawDetents: List<RawDetentSpec>,
        desiredIndex: Int,
        hasMeasuredContentHeight: Boolean,
    ): Boolean =
        desiredIndex in rawDetents.indices &&
            rawDetents[desiredIndex].kind == DetentKind.CONTENT &&
            !hasMeasuredContentHeight

    /**
     * Animates content-height updates when dynamically resizing an already-open sheet, or when
     * the first measurement resolves for an open sheet still resting at closed offset (`openHeight == 0`).
     */
    fun shouldAnimateContentMeasurement(
        hadMeasurement: Boolean,
        animateContentHeight: Boolean,
        isPresented: Boolean,
        currentTargetIndex: Int,
        openHeightPx: Float,
    ): Boolean =
        (hadMeasurement && animateContentHeight && isPresented) ||
            (!hadMeasurement && currentTargetIndex >= 0 && openHeightPx <= 0.5f)

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
}

/** Draws the modal scrim fill without allocating drawables or capturing Valdi touches directly. */
internal class BottomSheetScrimCanvasView(context: Context) : View(context) {
    private val paint = Paint()
    private var baseColor: Int = DEFAULT_SCRIM_COLOR
    private var baseAlpha: Int = Color.alpha(DEFAULT_SCRIM_COLOR)
    private var lastAlpha: Int = 0
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
        val alpha = (baseAlpha * currentProgress).roundToInt().coerceIn(0, 255)
        lastAlpha = alpha
        visibility = if (alpha > 0) VISIBLE else GONE
        invalidate()
    }

    fun setOpacityProgress(progress: Float) {
        val clamped = progress.coerceIn(0f, 1f)
        if (currentProgress == clamped) return
        currentProgress = clamped
        val alpha = (baseAlpha * clamped).roundToInt().coerceIn(0, 255)
        if (alpha == lastAlpha) return
        lastAlpha = alpha
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
