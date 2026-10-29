// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/ImagePreviewContentView.kt); only R is imported from the app.
package io.nativeroutes.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.view.ViewConfiguration
import android.view.VelocityTracker
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.viewpager2.widget.ViewPager2
import coil3.asDrawable
import coil3.request.Disposable
import kotlin.math.min
import kotlin.math.abs
import io.valdiroutes.app.R

internal class ImagePreviewContentView(context: Context) : FrameLayout(context) {
    var onIndexChange: (Int) -> Unit = {}
    var onRequestClose: () -> Unit = {}

    private var dismissing = false
    private var dismissalAnimator: ValueAnimator? = null
    private val scrim = View(context).apply {
        setBackgroundColor(Color.BLACK)
        layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    }
    private var currentIndex = 0
    var sources: List<String> = emptyList()
        set(value) {
            if (field == value) return
            field = value.toList()
            currentIndex = clamped(index)
            adapter.replaceSources(field)
            if (field.isNotEmpty()) pager.setCurrentItem(currentIndex, false)
            updateCounter()
        }
    var index: Int = 0
        set(value) {
            if (field == value) return
            field = value
            val next = clamped(value)
            currentIndex = next
            if (sources.isNotEmpty() && pager.currentItem != next) pager.setCurrentItem(next, false)
            updateCounter()
        }
    var topInset: Float = 0f
        set(value) {
            if (field == value) return
            field = value
            positionChrome()
        }
    var active: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            if (active) adapter.resumeRequests() else adapter.cancelRequests()
        }

    private val pager = ViewPager2(context).apply {
        orientation = ViewPager2.ORIENTATION_HORIZONTAL
        offscreenPageLimit = 1
        layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    }
    private val adapter = ImagePageAdapter()
    private val counter = TextView(context).apply {
        setTextColor(Color.WHITE)
        textSize = 15f
        typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        gravity = Gravity.CENTER
        minWidth = dp(60)
        setPadding(dp(10), dp(4), dp(10), dp(4))
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(14).toFloat()
            setColor(Color.argb(190, 38, 38, 38))
        }
        layoutParams = FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, dp(28), Gravity.TOP or Gravity.CENTER_HORIZONTAL)
    }

    private val pageCallback = object : ViewPager2.OnPageChangeCallback() {
        override fun onPageSelected(position: Int) {
            if (sources.isEmpty()) return
            val next = position.coerceIn(0, sources.lastIndex)
            if (next == currentIndex) return
            currentIndex = next
            updateCounter()
            onIndexChange(next)
        }
    }

    init {
        setBackgroundColor(Color.TRANSPARENT)
        pager.adapter = adapter
        pager.registerOnPageChangeCallback(pageCallback)
        addView(scrim)
        addView(pager)
        addView(counter)
        positionChrome()
        updateCounter()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (active) adapter.resumeRequests()
    }

    override fun onDetachedFromWindow() {
        dismissalAnimator?.cancel()
        adapter.cancelRequests()
        super.onDetachedFromWindow()
    }

    private fun updateDismissDrag(dx: Float, dy: Float, originX: Float, originY: Float) {
        val progress = (dy / (height * 0.5f).coerceAtLeast(1f)).coerceIn(0f, 1f)
        val scale = 1f - 0.25f * progress
        pager.translationX = dx + (originX - width / 2f) * (1f - scale)
        pager.translationY = dy + (originY - height / 2f) * (1f - scale)
        pager.scaleX = scale
        pager.scaleY = scale
        scrim.alpha = 1f - progress
        counter.alpha = scrim.alpha
    }

    private fun dismissPreview() {
        if (!active || dismissing) return
        dismissing = true
        animateDismissal(close = true)
    }

    private fun restorePreview() = animateDismissal(close = false)

    private fun animateDismissal(close: Boolean) {
        dismissalAnimator?.cancel()
        val x = pager.translationX
        val y = pager.translationY
        val scale = pager.scaleX
        val opacity = scrim.alpha
        val imageOpacity = pager.alpha
        val targetScale = if (close) scale * 0.92f else 1f
        dismissalAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (close) 180L else 220L
            interpolator = android.view.animation.DecelerateInterpolator()
            addUpdateListener {
                val progress = it.animatedValue as Float
                pager.translationX = x * (if (close) 1f else 1f - progress)
                pager.translationY = y * (if (close) 1f else 1f - progress)
                pager.scaleX = scale + (targetScale - scale) * progress
                pager.scaleY = pager.scaleX
                scrim.alpha = opacity + ((if (close) 0f else 1f) - opacity) * progress
                pager.alpha = if (close) imageOpacity * (1f - progress) else 1f
                counter.alpha = scrim.alpha
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                private var cancelled = false
                override fun onAnimationCancel(animation: android.animation.Animator) { cancelled = true }
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (!cancelled && close && active) onRequestClose()
                }
            })
            start()
        }
    }

    private fun positionChrome() {
        (counter.layoutParams as? FrameLayout.LayoutParams)?.let { params ->
            val top = dp(topInset.toInt() + 24)
            if (params.topMargin != top) {
                params.topMargin = top
                counter.layoutParams = params
            }
        }
    }

    private fun updateCounter() {
        counter.text = if (sources.isEmpty()) "0 / 0" else "${currentIndex + 1} / ${sources.size}"
        counter.contentDescription = if (sources.isEmpty()) "没有图片" else "第 ${currentIndex + 1} 张，共 ${sources.size} 张"
    }

    private fun clamped(value: Int) = value.coerceIn(0, (sources.size - 1).coerceAtLeast(0))
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private inner class ImagePageAdapter : androidx.recyclerview.widget.RecyclerView.Adapter<ImagePageHolder>() {
        private var items: List<String> = emptyList()
        private val pages = linkedSetOf<ImagePreviewPage>()

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ImagePageHolder {
            val page = ImagePreviewPage(parent.context).apply {
                layoutParams = androidx.recyclerview.widget.RecyclerView.LayoutParams(
                    LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT,
                )
            }
            pages += page
            return ImagePageHolder(page)
        }

        override fun onBindViewHolder(holder: ImagePageHolder, position: Int) {
            holder.page.bind(items[position])
        }

        override fun getItemCount() = items.size

        override fun onViewAttachedToWindow(holder: ImagePageHolder) {
            super.onViewAttachedToWindow(holder)
            if (active) holder.page.ensureLoad()
        }

        override fun onViewDetachedFromWindow(holder: ImagePageHolder) {
            holder.page.cancelLoad()
            super.onViewDetachedFromWindow(holder)
        }

        override fun onViewRecycled(holder: ImagePageHolder) {
            holder.page.cancelLoad()
            super.onViewRecycled(holder)
        }

        fun replaceSources(next: List<String>) {
            pages.forEach { it.cancelLoad() }
            items = next
            notifyDataSetChanged()
        }

        fun cancelRequests() = pages.forEach { it.cancelLoad() }
        fun resumeRequests() = pages.forEach { it.ensureLoad() }
    }

    private class ImagePageHolder(val page: ImagePreviewPage) : androidx.recyclerview.widget.RecyclerView.ViewHolder(page)

    private inner class ImagePreviewPage(context: Context) : FrameLayout(context) {
        private val zoomImage = ZoomImageView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        private val message = TextView(context).apply {
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(8), dp(28), dp(8))
        }
        private val retry = TextView(context).apply {
            text = "重新加载"
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(8), dp(16), dp(8))
            compoundDrawablePadding = dp(8)
            val refreshIcon = context.getDrawable(R.drawable.ic_refresh)?.mutate()?.apply { setTint(Color.WHITE) }
            setCompoundDrawablesRelativeWithIntrinsicBounds(refreshIcon, null, null, null)
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.argb(190, 58, 58, 58))
            }
            setOnClickListener { startLoad() }
        }
        private val statusPanel = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            addView(message, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
            addView(retry, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, dp(44)).apply { topMargin = dp(8) })
        }
        private var source: String? = null
        private var loading = false
        private var generation = 0
        private var request: Disposable? = null

        init {
            setBackgroundColor(Color.TRANSPARENT)
            addView(zoomImage)
            addView(statusPanel, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER))
            showLoading()
        }

        override fun onAttachedToWindow() {
            super.onAttachedToWindow()
            // RecyclerView may bind/attach a holder before its window is attached.
            // Start again at the actual page attachment, including cached holders.
            ensureLoad()
        }

        override fun onDetachedFromWindow() {
            cancelLoad()
            super.onDetachedFromWindow()
        }

        fun bind(value: String) {
            if (source == value && (zoomImage.drawable != null || loading)) return
            cancelLoad()
            source = value
            ensureLoad()
        }

        fun ensureLoad() {
            if (active && isAttachedToWindow && source != null && zoomImage.drawable == null && !loading) startLoad()
        }

        fun cancelLoad() {
            generation++
            request?.dispose()
            request = null
            loading = false
            clearImage()
        }

        private fun clearImage() {
            // Coil owns the cache lifetime; never recycle a cached bitmap here.
            zoomImage.setPreviewImage(null)
        }

        private fun startLoad() {
            val value = source ?: return
            if (loading) return
            cancelLoad()
            loading = true
            showLoading()
            val token = generation
            val metrics = resources.displayMetrics
            val imageRequest = NativeImages.request(context, value)
                .size(metrics.widthPixels.coerceAtLeast(1), metrics.heightPixels.coerceAtLeast(1))
                .target(onSuccess = { image ->
                    if (generation == token && loading) {
                        request = null
                        loading = false
                        zoomImage.setPreviewImage(image.asDrawable(resources))
                        statusPanel.visibility = View.GONE
                    }
                }, onError = {
                    if (generation == token && loading) {
                        request = null
                        loading = false
                        showError()
                    }
                }).build()
            val disposable = NativeImages.loader().enqueue(imageRequest)
            if (generation == token && loading) request = disposable
            else if (generation != token) disposable.dispose()
        }

        private fun showLoading() {
            message.text = "正在加载图片…"
            retry.visibility = View.GONE
            statusPanel.visibility = View.VISIBLE
        }

        private fun showError() {
            message.text = "图片加载失败"
            retry.visibility = View.VISIBLE
            statusPanel.visibility = View.VISIBLE
        }
    }

    private inner class ZoomImageView(context: Context) : ImageView(context) {
        private val imageMatrixValue = Matrix()
        private var minimumScale = 1f
        private var currentScale = 1f
        private var downX = 0f
        private var downY = 0f
        private var dragging = false
        private var multiTouch = false
        private var horizontal = false
        private var velocity: VelocityTracker? = null
        private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
        private var lastX = 0f
        private var lastY = 0f
        private var lastSizeWidth = 0
        private var lastSizeHeight = 0
        private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                this@ZoomImageView.parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }

            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val next = (currentScale * detector.scaleFactor).coerceIn(minimumScale, minimumScale * 4f)
                imageMatrixValue.postScale(next / currentScale, next / currentScale, detector.focusX, detector.focusY)
                currentScale = next
                clampMatrix()
                imageMatrix = imageMatrixValue
                return true
            }
        })
        private val doubleTapDetector = android.view.GestureDetector(context, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent) = true
            override fun onSingleTapConfirmed(event: MotionEvent): Boolean {
                performClick()
                return true
            }
            override fun onDoubleTap(event: MotionEvent): Boolean {
                if (drawable == null) return false
                val targetScale = if (currentScale > minimumScale + 0.01f) minimumScale else minimumScale * 2.5f
                val next = targetScale.coerceAtMost(minimumScale * 4f)
                imageMatrixValue.postScale(next / currentScale, next / currentScale, event.x, event.y)
                currentScale = next
                clampMatrix()
                imageMatrix = imageMatrixValue
                return true
            }
        })

        init {
            scaleType = ScaleType.MATRIX
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = true
            isClickable = true
        }

        fun setPreviewImage(image: android.graphics.drawable.Drawable?) {
            setImageDrawable(image)
            if (image == null) {
                imageMatrixValue.reset()
                currentScale = 1f
                return
            }
            // A measured page must install its fitted matrix before the bitmap's
            // first draw. Unmeasured pages are fitted by onSizeChanged instead.
            fitImage(reset = true)
        }

        override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
            super.onSizeChanged(width, height, oldWidth, oldHeight)
            if (width != lastSizeWidth || height != lastSizeHeight) {
                lastSizeWidth = width
                lastSizeHeight = height
                if (drawable != null) fitImage(reset = true)
            }
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (!active || dismissing) return true
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                velocity?.recycle()
                velocity = VelocityTracker.obtain()
                downX = event.rawX
                downY = event.rawY
                dragging = false
                multiTouch = false
                horizontal = false
                dismissalAnimator?.cancel()
            }
            // Track screen coordinates: the image's local coordinates change as it follows the finger.
            val velocityEvent = MotionEvent.obtain(event)
            velocityEvent.offsetLocation(event.rawX - event.x, event.rawY - event.y)
            velocity?.addMovement(velocityEvent)
            velocityEvent.recycle()
            if (event.pointerCount > 1) {
                multiTouch = true
                if (dragging) { dragging = false; restorePreview() }
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            doubleTapDetector.onTouchEvent(event)
            scaleDetector.onTouchEvent(event)
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    lastX = event.x
                    lastY = event.y
                    parent?.requestDisallowInterceptTouchEvent(currentScale > minimumScale + 0.01f)
                }
                MotionEvent.ACTION_POINTER_UP -> {
                    val remaining = if (event.actionIndex == 0) 1 else 0
                    lastX = event.getX(remaining)
                    lastY = event.getY(remaining)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downX
                    val dy = event.rawY - downY
                    if (!dragging && !multiTouch && !horizontal && currentScale <= minimumScale + 0.01f) {
                        if (abs(dx) > touchSlop && abs(dx) >= abs(dy)) horizontal = true
                        if (dy > touchSlop && dy > abs(dx)) dragging = true
                    }
                    if (dragging) {
                        parent?.requestDisallowInterceptTouchEvent(true)
                        val location = IntArray(2)
                        this@ImagePreviewContentView.getLocationOnScreen(location)
                        updateDismissDrag(dx, dy.coerceAtLeast(0f), downX - location[0], downY - location[1])
                        return true
                    }
                    if (!scaleDetector.isInProgress && event.pointerCount == 1 && currentScale > minimumScale + 0.01f) {
                        val dx = event.x - lastX
                        val dy = event.y - lastY
                        imageMatrixValue.postTranslate(dx, dy)
                        clampMatrix()
                        imageMatrix = imageMatrixValue
                        parent?.requestDisallowInterceptTouchEvent(true)
                    } else if (event.pointerCount == 1 && !scaleDetector.isInProgress && currentScale <= minimumScale + 0.01f) {
                        parent?.requestDisallowInterceptTouchEvent(false)
                    }
                    lastX = event.x
                    lastY = event.y
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (dragging) {
                        velocity?.computeCurrentVelocity(1000)
                        val speed = velocity?.yVelocity ?: 0f
                        val dy = event.rawY - downY
                        if (event.actionMasked == MotionEvent.ACTION_UP &&
                            (dy > dp(40) || (dy > dp(12) && speed > dp(650))) && speed > -dp(120)) dismissPreview()
                        else restorePreview()
                    }
                    dragging = false
                    velocity?.recycle()
                    velocity = null
                    parent?.requestDisallowInterceptTouchEvent(false)
                }
            }
            return true
        }

        override fun performClick(): Boolean {
            super.performClick()
            dismissPreview()
            return true
        }

        private fun fitImage(reset: Boolean) {
            val drawable = drawable ?: return
            if (width <= 0 || height <= 0 || drawable.intrinsicWidth <= 0 || drawable.intrinsicHeight <= 0) return
            val fit = min(width.toFloat() / drawable.intrinsicWidth, height.toFloat() / drawable.intrinsicHeight)
            if (reset) {
                imageMatrixValue.reset()
                imageMatrixValue.setScale(fit, fit)
                imageMatrixValue.postTranslate((width - drawable.intrinsicWidth * fit) / 2f, (height - drawable.intrinsicHeight * fit) / 2f)
                minimumScale = fit
                currentScale = fit
            }
            clampMatrix()
            imageMatrix = imageMatrixValue
        }

        private fun clampMatrix() {
            val drawable = drawable ?: return
            val rect = RectF(0f, 0f, drawable.intrinsicWidth.toFloat(), drawable.intrinsicHeight.toFloat())
            imageMatrixValue.mapRect(rect)
            val dx = when {
                rect.width() <= width -> (width - rect.width()) / 2f - rect.left
                rect.left > 0f -> -rect.left
                rect.right < width -> width - rect.right
                else -> 0f
            }
            val dy = when {
                rect.height() <= height -> (height - rect.height()) / 2f - rect.top
                rect.top > 0f -> -rect.top
                rect.bottom < height -> height - rect.bottom
                else -> 0f
            }
            imageMatrixValue.postTranslate(dx, dy)
        }
    }
}
