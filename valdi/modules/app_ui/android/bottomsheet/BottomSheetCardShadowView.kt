package io.valdiroutes.app

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.View
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.extensions.ViewUtils
import com.snap.valdi.utils.ValdiMarshaller
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/** Shared Valdi hit-test function that makes decorative helper views invisible to Valdi TouchDispatcher. */
internal val NEVER_HIT_VALDI_FUNCTION = object : ValdiFunction {
    override fun perform(marshaller: ValdiMarshaller): Boolean {
        marshaller.pushBoolean(false)
        return true
    }
}

/** An outset shadow of the card, as `boxShadow` describes it, in px. */
internal data class CardShadow(
    val offsetX: Float,
    val offsetY: Float,
    val blurRadius: Float,
    val spreadDistance: Float,
    val color: Int,
)

/**
 * Draws the outset shadows of a card `shapeHeight` tall between `shapeLeft` and `shapeRight`.
 * Two instances (top half and bottom half) are stitched with RenderNode `translationY` + `clipBounds`
 * so a moving sheet never redraws blurred shadows.
 */
internal class BottomSheetCardShadowView(context: Context) : View(context) {
    private val cornerRadii = FloatArray(4)
    private var shadows: List<CardShadow> = emptyList()
    private var blurFilters: List<BlurMaskFilter?> = emptyList()
    private var shapeLeft = 0f
    private var shapeRight = 0f
    private var shapeHeight = 0f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val shapeRect = RectF()
    private val pathRadii = FloatArray(8)
    private val clip = Rect()

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        ViewUtils.getOrCreateGestureRecognizers(this).hitTest = NEVER_HIT_VALDI_FUNCTION
    }

    val hasShadows: Boolean
        get() = shadows.isNotEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

    var edgeBand = 1f
        private set

    private fun updateEdgeBand() {
        val reach = shadows.maxOfOrNull {
            1.5f * it.blurRadius + abs(it.spreadDistance) + abs(it.offsetY)
        }
        edgeBand = (reach ?: 0f) + (cornerRadii.maxOrNull() ?: 0f) + 1f
    }

    fun setShadows(value: List<CardShadow>) {
        if (value == shadows) return
        shadows = value
        blurFilters = value.map(::blurFilter)
        updateEdgeBand()
        invalidate()
    }

    fun setCornerRadii(radii: FloatArray) {
        if (radii.contentEquals(cornerRadii)) return
        radii.copyInto(cornerRadii)
        updateEdgeBand()
        invalidate()
    }

    fun place(
        shapeLeft: Float,
        shapeRight: Float,
        shapeHeight: Float,
        offsetY: Float,
        clipTop: Float,
        clipBottom: Float,
    ) {
        if (
            shapeLeft != this.shapeLeft ||
            shapeRight != this.shapeRight ||
            shapeHeight != this.shapeHeight
        ) {
            this.shapeLeft = shapeLeft
            this.shapeRight = shapeRight
            this.shapeHeight = shapeHeight
            invalidate()
        }
        translationY = offsetY
        val reach = (width + height) * 2
        clip.set(
            -reach,
            if (clipTop.isInfinite()) -reach else floor(clipTop - offsetY).toInt(),
            width + reach,
            if (clipBottom.isInfinite()) height + reach else ceil(clipBottom - offsetY).toInt(),
        )
        clipBounds = clip
    }

    override fun onDraw(canvas: Canvas) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        if (shadows.isEmpty() || shapeHeight <= 0f || width <= 0) return
        canvas.save()
        if (buildPath(-CLIP_INSET)) canvas.clipOutPath(path)
        for (index in shadows.lastIndex downTo 0) {
            val shadow = shadows[index]
            if (!buildPath(shadow.spreadDistance)) continue
            paint.color = shadow.color
            paint.maskFilter = blurFilters[index]
            canvas.save()
            canvas.translate(shadow.offsetX, shadow.offsetY)
            canvas.drawPath(path, paint)
            canvas.restore()
        }
        canvas.restore()
    }

    private fun buildPath(outset: Float): Boolean {
        shapeRect.set(shapeLeft, 0f, shapeRight, shapeHeight)
        shapeRect.inset(-outset, -outset)
        if (shapeRect.width() <= 0f || shapeRect.height() <= 0f) return false
        val limit = minOf(shapeRect.width(), shapeRect.height()) / 2f
        for (corner in 0 until 4) {
            val base = cornerRadii[corner]
            val radius = if (base > 0f) (base + outset).coerceIn(0f, limit) else 0f
            pathRadii[corner * 2] = radius
            pathRadii[corner * 2 + 1] = radius
        }
        path.reset()
        path.addRoundRect(shapeRect, pathRadii, Path.Direction.CW)
        return true
    }
}

private const val CLIP_INSET = 0.4f

private fun blurFilter(shadow: CardShadow): BlurMaskFilter? {
    val sigma = shadow.blurRadius / 2f
    if (sigma <= 0.5f) return null
    return BlurMaskFilter((sigma - 0.5f) / 0.57735f, BlurMaskFilter.Blur.NORMAL)
}
