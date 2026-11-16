package io.valdiroutes.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import com.snap.valdi.views.ValdiView

/**
 * Hosts the sheet's surface and content and clips them to the card shape.
 *
 * Extends [ValdiView] so Valdi children (`BottomSheetSurfaceView`, `BottomSheetContentWrapperView`)
 * receive their exact Yoga layout frames via `applyLayoutToValdiChildren` while keeping the sheet
 * container's full size; only the clip shape follows the card.
 */
internal class BottomSheetCardClipLayout(context: Context) : ValdiView(context) {
    private val cardRect = RectF()
    private val cornerRadii = FloatArray(4)
    private val clipPath = Path()
    private val pathRadii = FloatArray(8)
    private val clipRect = Rect()
    private var clipsToCard = false

    private enum class ClipMode {
        NONE,
        RECT,
        UNIFORM,
        TOP,
        OUTLINE_PATH,
        CANVAS_PATH,
    }

    private var clipMode = ClipMode.NONE

    init {
        clipChildren = false
        clipToPadding = false
        clipToBounds = false
        installValdiHitTest(this) { xPx, yPx -> !clipsContent || cardContains(xPx, yPx) }
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                val left = cardRect.left.toInt()
                val top = cardRect.top.toInt()
                val right = cardRect.right.toInt()
                val bottom = cardRect.bottom.toInt()
                when (clipMode) {
                    ClipMode.UNIFORM -> outline.setRoundRect(left, top, right, bottom, limitedRadius(0))
                    ClipMode.TOP -> {
                        val radius = limitedRadius(0)
                        outline.setRoundRect(left, top, right, bottom + radius.toInt() + 1, radius)
                    }
                    ClipMode.OUTLINE_PATH -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            outline.setPath(buildCardPath())
                        }
                    }
                    ClipMode.NONE, ClipMode.RECT -> outline.setRect(left, top, right, bottom)
                    ClipMode.CANVAS_PATH -> setShadowOutline(outline, left, top, right, bottom)
                }
            }
        }
    }

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    private fun limitedRadius(corner: Int): Float =
        cornerRadii[corner].coerceAtMost(minOf(cardRect.width(), cardRect.height()) / 2f)

    @Suppress("DEPRECATION")
    private fun setShadowOutline(outline: Outline, left: Int, top: Int, right: Int, bottom: Int) {
        val path = buildCardPath()
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> outline.setPath(path)
            path.isConvex -> outline.setConvexPath(path)
            else -> outline.setRect(left, top, right, bottom)
        }
    }

    val isShaped: Boolean
        get() = cornerRadii.any { it > 0f }

    fun setCornerRadii(radii: FloatArray) {
        if (radii.contentEquals(cornerRadii)) return
        radii.copyInto(cornerRadii)
        updateClipMode()
    }

    val clipsContent: Boolean
        get() = clipMode != ClipMode.NONE

    fun setClipsToCard(value: Boolean) {
        if (value == clipsToCard) return
        clipsToCard = value
        updateClipMode()
    }

    private fun updateClipMode() {
        val topLeft = cornerRadii[0]
        val topRight = cornerRadii[1]
        val bottomRight = cornerRadii[2]
        val bottomLeft = cornerRadii[3]
        clipMode = when {
            !isShaped -> if (clipsToCard) ClipMode.RECT else ClipMode.NONE
            cornerRadii.all { it == topLeft } -> ClipMode.UNIFORM
            topLeft == topRight && bottomRight == 0f && bottomLeft == 0f -> ClipMode.TOP
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> ClipMode.OUTLINE_PATH
            else -> ClipMode.CANVAS_PATH
        }
        clipToOutline =
            clipMode != ClipMode.NONE && clipMode != ClipMode.RECT && clipMode != ClipMode.CANVAS_PATH
        updateClipBounds()
        invalidateOutline()
        invalidate()
    }

    fun setCard(left: Float, top: Float, right: Float, bottom: Float) {
        if (
            cardRect.left == left &&
            cardRect.top == top &&
            cardRect.right == right &&
            cardRect.bottom == bottom
        ) {
            return
        }
        cardRect.set(left, top, right, bottom)
        if (clipToOutline || elevation > 0f) invalidateOutline()
        updateClipBounds()
        if (clipMode == ClipMode.CANVAS_PATH) invalidate()
    }

    fun setCardElevation(value: Float) {
        if (value == elevation) return
        elevation = value
        invalidateOutline()
    }

    fun setCardShadowColor(color: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            outlineAmbientShadowColor = color
            outlineSpotShadowColor = color
        }
    }

    private fun updateClipBounds() {
        if (clipMode == ClipMode.TOP || clipMode == ClipMode.RECT) {
            cardRect.roundOut(clipRect)
            clipBounds = clipRect
        } else if (clipBounds != null) {
            clipBounds = null
        }
    }

    fun cardContains(x: Float, y: Float): Boolean {
        if (!cardRect.contains(x, y)) return false
        if (!isShaped) return true
        val topLeft = limitedRadius(0)
        val topRight = limitedRadius(1)
        val bottomRight = limitedRadius(2)
        val bottomLeft = limitedRadius(3)
        val left = cardRect.left
        val top = cardRect.top
        val right = cardRect.right
        val bottom = cardRect.bottom
        return when {
            x < left + topLeft && y < top + topLeft ->
                isInCorner(x, y, left + topLeft, top + topLeft, topLeft)
            x > right - topRight && y < top + topRight ->
                isInCorner(x, y, right - topRight, top + topRight, topRight)
            x > right - bottomRight && y > bottom - bottomRight ->
                isInCorner(x, y, right - bottomRight, bottom - bottomRight, bottomRight)
            x < left + bottomLeft && y > bottom - bottomLeft ->
                isInCorner(x, y, left + bottomLeft, bottom - bottomLeft, bottomLeft)
            else -> true
        }
    }

    private fun isInCorner(
        x: Float,
        y: Float,
        centerX: Float,
        centerY: Float,
        radius: Float,
    ): Boolean {
        val dx = x - centerX
        val dy = y - centerY
        return dx * dx + dy * dy <= radius * radius
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (
            clipsContent &&
            event.actionMasked == MotionEvent.ACTION_DOWN &&
            !cardContains(event.x, event.y)
        ) {
            return false
        }
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchDraw(canvas: Canvas) {
        val saveCount = canvas.save()
        if (clipMode == ClipMode.CANVAS_PATH) canvas.clipPath(buildCardPath())
        super.dispatchDraw(canvas)
        canvas.restoreToCount(saveCount)
    }

    private fun buildCardPath(): Path {
        for (corner in 0 until 4) {
            val radius = limitedRadius(corner)
            pathRadii[corner * 2] = radius
            pathRadii[corner * 2 + 1] = radius
        }
        clipPath.reset()
        clipPath.addRoundRect(cardRect, pathRadii, Path.Direction.CW)
        return clipPath
    }
}
