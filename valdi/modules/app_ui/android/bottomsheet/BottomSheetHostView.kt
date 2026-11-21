package io.valdiroutes.app

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.dynamicanimation.animation.DynamicAnimation
import androidx.dynamicanimation.animation.FloatValueHolder
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import com.snap.valdi.extensions.ViewUtils
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val CLOSE_REQUEST_RESPONSE_GRACE_MS = 80L

/**
 * Core Android sheet engine aligned with `@swmansion/react-native-bottom-sheet` v1.1.0,
 * adapted idiomatically to Valdi's layout, gesture recognizer, and custom-view lifecycle.
 */
internal class BottomSheetHostView(context: Context) : ViewGroup(context), NestedScrollingParent3 {

    // ---- Callbacks wired by BottomSheetView ----
    var onGeometryChanged: ((widthDp: Double, heightDp: Double, surfaceHeightDp: Double, insetDp: Double, hostWidthDp: Double) -> Unit)? = null
    var onIndexChanged: ((Int) -> Unit)? = null
    var onSettleChanged: ((Int) -> Unit)? = null
    var onPositionChanged: ((positionDp: Double, fractionalIndex: Double) -> Unit)? = null
    var onCloseRequest: (() -> Unit)? = null
    var onPresentationChanged: (() -> Unit)? = null

    // ---- Props ----
    private var rawDetents: List<RawDetentSpec> = emptyList()
    private var resolvedDetents: List<DetentSpec> = emptyList()
    private var rawRequestedIndex: Int = -1
    private var currentTargetIndex: Int = -1
    private var lastReportedIndex: Int = -1
    private var hasInitializedPresentation = false
    private var sawOpenRequestBeforeInit = false

    var animateIn: Boolean = true
    var animateContentHeight: Boolean = true
    private var _modal: Boolean = false
    var modal: Boolean
        get() = _modal
        set(value) {
            if (_modal == value) return
            _modal = value
            if (containerHeightPx > 0 && rawDetents.isNotEmpty()) {
                recomputeDetentsAndSync(animateResize = false)
            } else {
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?.invoke()
            }
        }
    var hasCloseRequestHandler: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            syncAccessibility()
            onPresentationChanged?.invoke()
        }
    var dismissible: Boolean = true
        set(value) {
            if (field == value) return
            field = value
            syncAccessibility()
        }
    var interactionEnabled: Boolean = true
    var scrollExpandCoordination: ScrollCoordinationLevel = ScrollCoordinationLevel.HANDOFF
    var scrollCollapseCoordination: ScrollCoordinationLevel = ScrollCoordinationLevel.HANDOFF
    var settleDurationSeconds: Float = BottomSheetMath.DEFAULT_SETTLE_DURATION_SECONDS
    var committedContentRegionInsetDp: Float? = null
        set(value) {
            if (field == value) return
            field = value
            syncVisualsForCurrentOffset()
        }

    // ---- Internal state ----
    private val density: Float
        get() = resources.displayMetrics.density.coerceAtLeast(0.001f)

    private var containerWidthPx: Int = 0
    private var containerHeightPx: Int = 0
    private var statusBarTopInsetPx: Int = 0
    private var measuredNaturalContentHeightPx: Int = 0
    private var hasMeasuredContentHeight: Boolean = false
    private var cardMaxWidthPx: Float = 0f
    private var cardPlacementBias: Float = 0.5f
    private var widestCardInsetsPx: DetentInsets = DetentInsets()

    /** Current vertical offset of the sheet's top edge from container top (`containerHeight` == closed). */
    private var sheetOffsetY: Float = 0f
    private var isDraggingSheet: Boolean = false
    private var isNestedDragging: Boolean = false
    private var springAnimation: SpringAnimation? = null
    private val springValueHolder = FloatValueHolder(0f)
    private var pendingCloseRequestActive: Boolean = false
    private var pendingCloseRequestVelocityPxPerSec: Float = 0f
    private var pendingCloseRequestToken: Int = 0
    private val pendingCloseBounceRunnable = Runnable {
        if (!pendingCloseRequestActive) return@Runnable
        pendingCloseRequestActive = false
        pendingCloseRequestVelocityPxPerSec = 0f
        if (isDraggingSheet || isNestedDragging || rawRequestedIndex < 0 || resolvedDetents.isEmpty()) {
            return@Runnable
        }
        val bounceIndex = resolvedDetents.indexOfFirst { !it.programmatic }.takeIf { it >= 0 } ?: 0
        snapToIndex(
            index = bounceIndex,
            initialVelocityPxPerSec = 0f,
            animated = true,
            emitIndexCallback = bounceIndex != lastReportedIndex,
        )
    }

    private var lastGeometry: DoubleArray? = null
    private var lastPosition: DoubleArray? = null

    private var cornerRadiiPx = FloatArray(4)
    private var cardShadows: List<CardShadow> = emptyList()
    private var cardElevationPx: Float = 0f
    private var cardShadowColorArgb: Int = Color.BLACK

    // ---- Child views ----
    private val scrimCanvas = BottomSheetScrimCanvasView(context)
    private val scrimDismissView = ScrimDismissView(context) { handleDismissTrigger() }
    private val topShadowView = BottomSheetCardShadowView(context)
    private val bottomShadowView = BottomSheetCardShadowView(context)
    internal val sheetContainer = FrameLayout(context)
    internal val clipContainer = BottomSheetCardClipLayout(context)

    private var surfaceView: BottomSheetSurfaceView? = null
    private var contentWrapperView: BottomSheetContentWrapperView? = null
    private var markerView: BottomSheetMarkerView? = null

    private val sheetGestureRecognizer: SheetValdiGestureRecognizer
    private val scrimGestureRecognizer: ScrimValdiGestureRecognizer
    private val nestedScrollingParentHelper = NestedScrollingParentHelper(this)

    init {
        clipChildren = false
        clipToPadding = false

        addView(scrimCanvas, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(scrimDismissView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(topShadowView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(bottomShadowView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        sheetContainer.clipChildren = false
        sheetContainer.clipToPadding = false
        sheetContainer.addView(
            clipContainer,
            FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        addView(sheetContainer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        // Hit-test host only when touching presented card or active modal scrim.
        installValdiHitTest(this) { xPx, yPx -> isPointInteractive(xPx, yPx) }
        installValdiHitTest(sheetContainer) { xPx, yPx -> isLocalPointInPresentedCard(xPx, yPx) }

        sheetGestureRecognizer = SheetValdiGestureRecognizer(sheetContainer, this)
        ViewUtils.addGestureRecognizer(sheetContainer, sheetGestureRecognizer)

        scrimGestureRecognizer = ScrimValdiGestureRecognizer(this, this)
        ViewUtils.addGestureRecognizer(this, scrimGestureRecognizer)

        ViewCompat.setAccessibilityDelegate(
            sheetContainer,
            SheetDismissAccessibilityDelegate(
                canDismiss = { canUserDismissOrRequestClose() },
                onDismiss = { handleDismissTrigger() },
            ),
        )

        ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            if (top != statusBarTopInsetPx) {
                statusBarTopInsetPx = top
                if (containerHeightPx > 0) {
                    recomputeDetentsAndSync(animateResize = false)
                }
            }
            insets
        }
    }

    // ---- Valdi child mounting ----

    fun attachValdiChild(child: View, index: Int) {
        if (child.parent === clipContainer) return
        (child.parent as? ViewGroup)?.removeView(child)
        val safeIndex = index.coerceIn(0, clipContainer.childCount)
        clipContainer.addView(child, safeIndex)
        bindSpecialDescendants(child)
    }

    fun detachValdiChild(child: View) {
        unbindSpecialDescendants(child)
        if (child.parent === clipContainer) {
            clipContainer.removeView(child)
        }
    }

    private fun bindSpecialDescendants(view: View) {
        when (view) {
            is BottomSheetSurfaceView -> {
                surfaceView = view
            }
            is BottomSheetContentWrapperView -> {
                contentWrapperView = view
                scanForMarker(view)
                view.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
                    override fun onChildViewAdded(parent: View?, child: View?) {
                        if (child != null) bindSpecialDescendants(child)
                    }

                    override fun onChildViewRemoved(parent: View?, child: View?) {
                        if (child != null) unbindSpecialDescendants(child)
                    }
                })
            }
            is BottomSheetMarkerView -> {
                markerView = view
                view.onMarkerTopChanged = { naturalTopPx ->
                    onNaturalContentHeightMeasured(naturalTopPx)
                }
                if (view.top > 0 || view.isLaidOut) {
                    onNaturalContentHeightMeasured(view.top.coerceAtLeast(0))
                }
            }
        }
        if (view is ViewGroup && view !is BottomSheetContentWrapperView) {
            for (i in 0 until view.childCount) {
                bindSpecialDescendants(view.getChildAt(i))
            }
        }
    }

    private fun scanForMarker(group: ViewGroup) {
        for (i in 0 until group.childCount) {
            bindSpecialDescendants(group.getChildAt(i))
        }
    }

    private fun unbindSpecialDescendants(view: View) {
        when (view) {
            is BottomSheetSurfaceView -> {
                if (surfaceView === view) surfaceView = null
            }
            is BottomSheetContentWrapperView -> {
                view.setOnHierarchyChangeListener(null)
                if (contentWrapperView === view) contentWrapperView = null
            }
            is BottomSheetMarkerView -> {
                view.onMarkerTopChanged = null
                if (markerView === view) markerView = null
            }
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                unbindSpecialDescendants(view.getChildAt(i))
            }
        }
    }

    private fun onNaturalContentHeightMeasured(naturalHeightPx: Int) {
        val hadMeasurement = hasMeasuredContentHeight
        if (hadMeasurement && naturalHeightPx == measuredNaturalContentHeightPx) return
        measuredNaturalContentHeightPx = naturalHeightPx.coerceAtLeast(0)
        hasMeasuredContentHeight = true
        if (rawDetents.any { it.kind == DetentKind.CONTENT } && containerHeightPx > 0) {
            recomputeDetentsAndSync(
                animateResize = BottomSheetMath.shouldAnimateContentMeasurement(
                    hadMeasurement = hadMeasurement,
                    animateContentHeight = animateContentHeight,
                    isPresented = isPresented,
                    currentTargetIndex = currentTargetIndex,
                    openHeightPx = openHeightPx,
                ),
            )
        }
    }

    // ---- Configuration setters ----

    fun applyPresentationConfig(
        modal: Boolean,
        animateIn: Boolean,
        animateContentHeight: Boolean,
        detents: List<RawDetentSpec>,
        requestedIndex: Int,
    ) {
        val modalChanged = _modal != modal
        val detentsChanged = rawDetents != detents
        this.animateIn = animateIn
        this.animateContentHeight = animateContentHeight
        _modal = modal
        rawDetents = detents

        if (!hasInitializedPresentation) {
            if (requestedIndex >= 0) {
                sawOpenRequestBeforeInit = true
            }
            rawRequestedIndex = requestedIndex
            if (rawDetents.isEmpty() && requestedIndex < 0 && sawOpenRequestBeforeInit) {
                sawOpenRequestBeforeInit = false
                onSettleChanged?.invoke(-1)
            }
            if (containerHeightPx > 0 && containerWidthPx > 0) {
                recomputeDetentsAndSync(animateResize = false)
            } else if (modalChanged) {
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?.invoke()
            }
            return
        }

        if (detentsChanged || modalChanged) {
            val prevPresented = isPresented
            val prevTargetIndex = currentTargetIndex
            rawRequestedIndex = requestedIndex
            if (containerHeightPx <= 0 || containerWidthPx <= 0) {
                if (modalChanged) {
                    syncVisualsForCurrentOffset()
                    syncAccessibility()
                    onPresentationChanged?.invoke()
                }
                return
            }
            if (rawDetents.isEmpty()) {
                recomputeDetentsAndSync(animateResize = false)
                if (modalChanged || isPresented != prevPresented) {
                    syncAccessibility()
                    onPresentationChanged?.invoke()
                }
                return
            }
            resolveDetentsAndEmitGeometry()
            val clamped = clampRequestedIndex(requestedIndex)
            if (clamped != prevTargetIndex) {
                snapToIndex(
                    clamped,
                    initialVelocityPxPerSec = consumePendingCloseVelocity(clamped),
                    animated = true,
                    emitIndexCallback = false,
                )
            } else {
                reanchorInitializedPresentation(
                    desiredIndex = clamped,
                    animateResize = detentsChanged && animateContentHeight && isPresented,
                )
            }
            if (modalChanged || isPresented != prevPresented) {
                syncAccessibility()
                onPresentationChanged?.invoke()
            }
            return
        }

        setRequestedIndex(requestedIndex)
    }

    fun setRawDetents(specs: List<RawDetentSpec>) {
        if (specs == rawDetents) return
        rawDetents = specs
        if (containerHeightPx > 0) {
            recomputeDetentsAndSync(animateResize = hasInitializedPresentation && animateContentHeight && isPresented)
        }
    }

    fun setRequestedIndex(index: Int) {
        if (!hasInitializedPresentation && index >= 0) {
            sawOpenRequestBeforeInit = true
        }
        val prevRaw = rawRequestedIndex
        rawRequestedIndex = index
        if (rawDetents.isEmpty()) {
            if (index < 0 && sawOpenRequestBeforeInit) {
                sawOpenRequestBeforeInit = false
                onSettleChanged?.invoke(-1)
            }
            return
        }
        val clamped = clampRequestedIndex(index)
        if (containerHeightPx <= 0) return

        if (!hasInitializedPresentation) {
            recomputeDetentsAndSync(animateResize = false)
            return
        }

        val hadPendingClose = pendingCloseRequestActive
        val pendingVelocity = consumePendingCloseVelocity(clamped)
        if (
            !hadPendingClose &&
            clamped == currentTargetIndex &&
            prevRaw == index &&
            (isAnimating || isDraggingSheet || abs(targetOffsetForIndex(clamped) - sheetOffsetY) < 0.5f)
        ) {
            return
        }
        if (
            hadPendingClose ||
            clamped != currentTargetIndex ||
            (!isAnimating && !isDraggingSheet && targetOffsetForIndex(clamped) != sheetOffsetY)
        ) {
            snapToIndex(clamped, initialVelocityPxPerSec = pendingVelocity, animated = true, emitIndexCallback = false)
        }
    }

    fun resetForRecycling() {
        cancelPendingCloseRequest()
        cancelSpring()
        isDraggingSheet = false
        isNestedDragging = false
        rawDetents = emptyList()
        resolvedDetents = emptyList()
        rawRequestedIndex = -1
        currentTargetIndex = -1
        lastReportedIndex = -1
        hasInitializedPresentation = false
        sawOpenRequestBeforeInit = false
        hasMeasuredContentHeight = false
        measuredNaturalContentHeightPx = 0
        committedContentRegionInsetDp = null
        lastGeometry = null
        lastPosition = null
        sheetOffsetY = containerHeightPx.toFloat()
    }

    fun setScrimColorArgb(colorArgb: Int) {
        scrimCanvas.setScrimColor(colorArgb)
    }

    fun setScrimAccessibilityLabel(label: String) {
        scrimDismissView.label = label
    }

    fun setSurfaceCornerRadiiDp(radiiDp: FloatArray) {
        val px = FloatArray(4) { idx -> (radiiDp.getOrElse(idx) { 0f } * density).coerceAtLeast(0f) }
        if (px.contentEquals(cornerRadiiPx)) return
        cornerRadiiPx = px
        clipContainer.setCornerRadii(px)
        topShadowView.setCornerRadii(px)
        bottomShadowView.setCornerRadii(px)
        syncVisualsForCurrentOffset()
    }

    fun setSurfaceShadows(shadows: List<CardShadow>) {
        if (shadows == cardShadows) return
        cardShadows = shadows
        topShadowView.setShadows(shadows)
        bottomShadowView.setShadows(shadows)
        val visible = topShadowView.hasShadows
        topShadowView.visibility = if (visible) VISIBLE else GONE
        bottomShadowView.visibility = if (visible) VISIBLE else GONE
        syncVisualsForCurrentOffset()
    }

    fun setSurfaceElevationDp(elevationDp: Float) {
        val px = (elevationDp * density).coerceAtLeast(0f)
        if (px == cardElevationPx) return
        cardElevationPx = px
        clipContainer.setCardElevation(px)
    }

    fun setSurfaceShadowColorArgb(colorArgb: Int) {
        if (colorArgb == cardShadowColorArgb) return
        cardShadowColorArgb = colorArgb
        clipContainer.setCardShadowColor(colorArgb)
    }

    // ---- Presentation & hit-testing queries ----

    val openHeightPx: Float
        get() = (containerHeightPx - sheetOffsetY).coerceAtLeast(0f)

    val isPresented: Boolean
        get() = containerHeightPx > 0 && (currentTargetIndex >= 0 || openHeightPx > 0.5f)

    val isModalPresented: Boolean
        get() = modal && isPresented

    private val isAnimating: Boolean
        get() = springAnimation?.isRunning == true

    fun closeRequestState(): CloseRequestInputState = CloseRequestInputState(
        isPresented = isPresented,
        hasCloseRequestHandler = hasCloseRequestHandler,
        isModal = modal,
    )

    fun isPointInteractive(xPx: Float, yPx: Float): Boolean {
        if (!isPresented) return false
        if (isPointInPresentedCard(xPx, yPx)) return true
        return modal && scrimCanvas.isScrimVisible
    }

    fun isPointInPresentedCard(xPx: Float, yPx: Float): Boolean {
        if (!isPresented) return false
        val localY = yPx - sheetContainer.translationY
        val localX = xPx - sheetContainer.translationX
        return isLocalPointInPresentedCard(localX, localY)
    }

    fun isLocalPointInPresentedCard(localX: Float, localY: Float): Boolean =
        isPresented && clipContainer.cardContains(localX, localY)

    fun isScrimInteractiveAt(xPx: Float, yPx: Float): Boolean =
        modal && isPresented && scrimCanvas.isScrimVisible && !isPointInPresentedCard(xPx, yPx)

    fun canStartSheetGesture(): Boolean = isPresented && resolvedDetents.isNotEmpty()

    fun canSheetExpandFurther(): Boolean {
        if (resolvedDetents.isEmpty()) return false
        val maxTotal = resolvedDetents.last().totalHeightPx
        return openHeightPx < maxTotal - 0.5f
    }

    fun isAtRestingDetent(): Boolean {
        if (currentTargetIndex < 0 || currentTargetIndex > resolvedDetents.lastIndex) return false
        val targetOffset = targetOffsetForIndex(currentTargetIndex)
        return abs(sheetOffsetY - targetOffset) <= 1f
    }

    private fun canUserDismissOrRequestClose(): Boolean = dismissible && (modal || hasCloseRequestHandler)

    // ---- Layout & Detent Resolution ----

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(w, h)

        val exactW = MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY)
        val exactH = MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
        scrimCanvas.measure(exactW, exactH)
        scrimDismissView.measure(exactW, exactH)
        topShadowView.measure(exactW, exactH)
        bottomShadowView.measure(exactW, exactH)
        sheetContainer.measure(exactW, exactH)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val w = (r - l).coerceAtLeast(0)
        val h = (b - t).coerceAtLeast(0)

        scrimCanvas.layout(0, 0, w, h)
        scrimDismissView.layout(0, 0, w, h)
        topShadowView.layout(0, 0, w, h)
        bottomShadowView.layout(0, 0, w, h)
        sheetContainer.layout(0, 0, w, h)

        val sizeChanged = w != containerWidthPx || h != containerHeightPx
        containerWidthPx = w
        containerHeightPx = h

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            rootWindowInsets?.let { rawInsets ->
                val compat = WindowInsetsCompat.toWindowInsetsCompat(rawInsets, this)
                statusBarTopInsetPx = compat.getInsets(WindowInsetsCompat.Type.statusBars()).top
            }
        }

        if (w > 0 && h > 0 && (sizeChanged || !hasInitializedPresentation)) {
            recomputeDetentsAndSync(animateResize = false)
        } else if (sizeChanged) {
            syncVisualsForCurrentOffset()
        }
    }

    private fun resolveDetentsAndEmitGeometry() {
        val firstRaw = rawDetents.firstOrNull()
        cardMaxWidthPx = ((firstRaw?.maxWidthDp ?: 0f) * density).coerceAtLeast(0f)
        cardPlacementBias = (firstRaw?.placementBias ?: 0.5f).coerceIn(0f, 1f)

        val widestRaw = rawDetents.firstOrNull { it.widestCard } ?: firstRaw
        widestCardInsetsPx = if (widestRaw != null) {
            DetentInsets(
                left = (widestRaw.insetLeftDp * density).coerceAtLeast(0f),
                right = (widestRaw.insetRightDp * density).coerceAtLeast(0f),
                bottom = (widestRaw.insetBottomDp * density).coerceAtLeast(0f),
            )
        } else {
            DetentInsets()
        }

        resolvedDetents = rawDetents.map { raw ->
            val topInsetPx = if (raw.usesStatusBarTopInset) {
                statusBarTopInsetPx.toFloat()
            } else {
                raw.insetTopDp * density
            }
            val bottomInsetPx = (raw.insetBottomDp * density).coerceAtLeast(0f)
            val leftInsetPx = (raw.insetLeftDp * density).coerceAtLeast(0f)
            val rightInsetPx = (raw.insetRightDp * density).coerceAtLeast(0f)
            val availableCardHeightPx = (containerHeightPx - topInsetPx - bottomInsetPx).coerceAtLeast(0f)

            val rawCardHeightPx = when (raw.kind) {
                DetentKind.POINTS -> raw.value * density
                DetentKind.PERCENTAGE -> raw.value * availableCardHeightPx
                DetentKind.CONTENT -> {
                    if (hasMeasuredContentHeight) measuredNaturalContentHeightPx.toFloat()
                    else 0f
                }
            }
            val clampedCardHeightPx = rawCardHeightPx.coerceIn(0f, availableCardHeightPx).roundToInt()
            DetentSpec(
                heightPx = clampedCardHeightPx,
                programmatic = raw.programmatic,
                insets = DetentInsets(
                    left = leftInsetPx,
                    right = rightInsetPx,
                    bottom = bottomInsetPx,
                ),
                scrimOpacity = raw.scrimOpacity,
            )
        }

        emitGeometryIfNeeded()
    }

    private fun reanchorInitializedPresentation(desiredIndex: Int, animateResize: Boolean) {
        currentTargetIndex = desiredIndex
        val newTargetOffset = targetOffsetForIndex(desiredIndex)
        if (isDraggingSheet || isNestedDragging) {
            syncVisualsForCurrentOffset()
            emitPositionIfNeeded()
        } else if ((animateResize && abs(newTargetOffset - sheetOffsetY) >= 0.5f) || isAnimating) {
            syncVisualsForCurrentOffset()
            startSpringTo(
                targetOffsetPx = newTargetOffset,
                initialVelocityPxPerSec = 0f,
                targetIndex = desiredIndex,
            )
        } else {
            cancelSpring()
            sheetOffsetY = newTargetOffset
            syncVisualsForCurrentOffset()
            emitPositionIfNeeded()
        }
    }

    private fun recomputeDetentsAndSync(animateResize: Boolean) {
        if (containerHeightPx <= 0 || containerWidthPx <= 0) return
        if (rawDetents.isEmpty()) {
            resolvedDetents = emptyList()
            sheetOffsetY = containerHeightPx.toFloat()
            currentTargetIndex = -1
            syncVisualsForCurrentOffset()
            if (!hasInitializedPresentation && rawRequestedIndex < 0 && sawOpenRequestBeforeInit) {
                sawOpenRequestBeforeInit = false
                onSettleChanged?.invoke(-1)
            }
            return
        }

        resolveDetentsAndEmitGeometry()

        val desiredIndex = clampRequestedIndex(rawRequestedIndex)
        if (!hasInitializedPresentation) {
            if (desiredIndex >= 0) {
                sawOpenRequestBeforeInit = true
            }
            // Defer initial open if target detent is a 'content' detent whose marker hasn't laid out yet.
            val waitingForContent = BottomSheetMath.shouldWaitForContentMeasurement(
                rawDetents = rawDetents,
                desiredIndex = desiredIndex,
                hasMeasuredContentHeight = hasMeasuredContentHeight,
            )

            if (waitingForContent) {
                sheetOffsetY = containerHeightPx.toFloat()
                currentTargetIndex = -1
                syncVisualsForCurrentOffset()
                return
            }

            val notifyPreInitCancel = desiredIndex < 0 && sawOpenRequestBeforeInit
            sawOpenRequestBeforeInit = false
            hasInitializedPresentation = true
            currentTargetIndex = desiredIndex
            lastReportedIndex = desiredIndex

            if (desiredIndex >= 0 && animateIn) {
                sheetOffsetY = containerHeightPx.toFloat()
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?.invoke()
                startSpringTo(
                    targetOffsetPx = targetOffsetForIndex(desiredIndex),
                    initialVelocityPxPerSec = 0f,
                    targetIndex = desiredIndex,
                )
            } else {
                sheetOffsetY = targetOffsetForIndex(desiredIndex)
                syncVisualsForCurrentOffset()
                syncAccessibility()
                onPresentationChanged?.invoke()
                emitPositionIfNeeded()
                if (notifyPreInitCancel) {
                    onSettleChanged?.invoke(desiredIndex)
                }
            }
            return
        }

        // Re-anchor existing presentation after container resize or content height change.
        reanchorInitializedPresentation(desiredIndex = desiredIndex, animateResize = animateResize)
    }

    private fun emitGeometryIfNeeded() {
        if (containerWidthPx <= 0 || containerHeightPx <= 0) return

        val widestSpan = BottomSheetMath.placeCard(
            hostWidthPx = containerWidthPx.toFloat(),
            insets = widestCardInsetsPx,
            maxWidthPx = cardMaxWidthPx,
            placementBias = cardPlacementBias,
        )
        val contentRegionWidthPx = widestSpan.width
        val contentRegionInsetPx = widestSpan.left

        // Tallest card height across resolved detents (or available height when 'content' detent present).
        val maxAvailableForContent = rawDetents.maxOfOrNull { raw ->
            val topPx = if (raw.usesStatusBarTopInset) statusBarTopInsetPx.toFloat() else raw.insetTopDp * density
            val bottomPx = raw.insetBottomDp * density
            (containerHeightPx - topPx - bottomPx).coerceAtLeast(0f)
        } ?: containerHeightPx.toFloat()

        val hasContentDetent = rawDetents.any { it.kind == DetentKind.CONTENT }
        val maxResolvedCardHeightPx = resolvedDetents.maxOfOrNull { it.heightPx.toFloat() } ?: 0f
        val contentRegionHeightPx = if (hasContentDetent) {
            maxAvailableForContent
        } else {
            max(maxResolvedCardHeightPx, 0f)
        }

        val next = doubleArrayOf(
            (contentRegionWidthPx / density).toDouble(),
            (contentRegionHeightPx / density).toDouble(),
            (containerHeightPx / density).toDouble(),
            (contentRegionInsetPx / density).toDouble(),
            (containerWidthPx / density).toDouble(),
        )
        if (lastGeometry.contentEquals(next)) return
        lastGeometry = next
        onGeometryChanged?.invoke(next[0], next[1], next[2], next[3], next[4])
    }

    fun replayGeometryIfAvailable() {
        val g = lastGeometry ?: return
        onGeometryChanged?.invoke(g[0], g[1], g[2], g[3], g[4])
    }

    // ---- Dragging & Snapping ----

    internal fun onSheetDragBegan() {
        cancelPendingCloseRequest()
        cancelSpring()
        isDraggingSheet = true
    }

    internal fun onSheetDragBy(dyPx: Float) {
        if (resolvedDetents.isEmpty()) return
        val maxTotal = resolvedDetents.last().totalHeightPx
        val minTotal = if (canUserDismissOrRequestClose()) 0f else resolvedDetents.first().totalHeightPx

        val currentUnclampedOpen = containerHeightPx - sheetOffsetY - dyPx
        val nextOpen = when {
            currentUnclampedOpen > maxTotal -> {
                maxTotal + BottomSheetMath.rubberBand(currentUnclampedOpen - maxTotal, containerHeightPx * 0.35f)
            }
            currentUnclampedOpen < minTotal -> {
                if (minTotal <= 0f) 0f
                else (minTotal - BottomSheetMath.rubberBand(minTotal - currentUnclampedOpen, minTotal.coerceAtLeast(1f)))
                    .coerceAtLeast(0f)
            }
            else -> currentUnclampedOpen
        }
        setSheetOffsetYInternal(containerHeightPx - nextOpen)
    }

    /**
     * Moves the sheet upward toward the top detent without rubber-banding past `maxTotal`,
     * returning any unconsumed negative `dyPx` so `HANDOFF` can feed it into `ValdiScrollView`.
     */
    internal fun onSheetDragByClampedToTop(dyPx: Float): Float {
        if (resolvedDetents.isEmpty()) return dyPx
        val maxTotal = resolvedDetents.last().totalHeightPx
        val minOffset = containerHeightPx - maxTotal
        val proposedOffset = sheetOffsetY + dyPx
        return if (proposedOffset < minOffset) {
            val leftover = proposedOffset - minOffset
            setSheetOffsetYInternal(minOffset)
            leftover
        } else {
            setSheetOffsetYInternal(proposedOffset)
            0f
        }
    }

    internal fun onSheetDragEnded(velocityYPxPerSec: Float) {
        isDraggingSheet = false
        settleFromRelease(velocityYPxPerSec)
    }

    internal fun onSheetDragSettledAtRest() {
        isDraggingSheet = false
    }

    internal fun onSheetDragCancelled() {
        isDraggingSheet = false
        snapToIndex(currentTargetIndex.coerceIn(minAllowedIndex(), resolvedDetents.lastIndex), 0f, animated = true, emitIndexCallback = false)
    }

    internal fun onScrimTapped() {
        handleDismissTrigger()
    }

    fun dismissModalByUser() {
        if (!modal) return
        snapToIndex(-1, initialVelocityPxPerSec = 0f, animated = true, emitIndexCallback = true)
    }

    fun emitCloseRequestFromSystem() {
        onCloseRequest?.invoke()
    }

    private fun handleDismissTrigger() {
        if (!isPresented) return
        if (hasCloseRequestHandler) {
            onCloseRequest?.invoke()
        } else if (modal) {
            snapToIndex(-1, initialVelocityPxPerSec = 0f, animated = true, emitIndexCallback = true)
        }
    }

    private fun settleFromRelease(velocityYPxPerSec: Float) {
        if (resolvedDetents.isEmpty()) return
        val releaseIndex = BottomSheetMath.resolveReleaseTargetIndex(
            detents = resolvedDetents,
            currentOpenHeightPx = openHeightPx,
            velocityYPxPerSec = velocityYPxPerSec,
            canDismissOrClose = canUserDismissOrRequestClose(),
        )

        if (releaseIndex == -1 && hasCloseRequestHandler) {
            // Notify caller via onCloseRequest; Valdi JS runs async so wait briefly before bouncing back.
            cancelPendingCloseRequest()
            val token = pendingCloseRequestToken
            pendingCloseRequestActive = true
            pendingCloseRequestVelocityPxPerSec = velocityYPxPerSec
            onCloseRequest?.invoke()
            if (token != pendingCloseRequestToken || !pendingCloseRequestActive) {
                return
            }
            if (rawRequestedIndex < 0) {
                cancelPendingCloseRequest()
                snapToIndex(
                    index = -1,
                    initialVelocityPxPerSec = velocityYPxPerSec,
                    animated = true,
                    emitIndexCallback = false,
                )
                return
            }
            postDelayed(pendingCloseBounceRunnable, CLOSE_REQUEST_RESPONSE_GRACE_MS)
            return
        }

        val finalIndex = if (releaseIndex == -1 && !modal) {
            resolvedDetents.indexOfFirst { !it.programmatic }.takeIf { it >= 0 } ?: 0
        } else {
            releaseIndex
        }
        snapToIndex(
            index = finalIndex,
            initialVelocityPxPerSec = velocityYPxPerSec,
            animated = true,
            emitIndexCallback = true,
        )
    }

    private fun cancelPendingCloseRequest() {
        pendingCloseRequestActive = false
        pendingCloseRequestVelocityPxPerSec = 0f
        pendingCloseRequestToken++
        removeCallbacks(pendingCloseBounceRunnable)
    }

    private fun consumePendingCloseVelocity(targetIndex: Int): Float {
        if (!pendingCloseRequestActive) return 0f
        val velocity = if (targetIndex < 0) pendingCloseRequestVelocityPxPerSec else 0f
        cancelPendingCloseRequest()
        return velocity
    }

    private fun snapToIndex(
        index: Int,
        initialVelocityPxPerSec: Float,
        animated: Boolean,
        emitIndexCallback: Boolean,
    ) {
        val clamped = clampRequestedIndex(index)
        val prevPresented = isPresented
        currentTargetIndex = clamped
        rawRequestedIndex = clamped

        if (emitIndexCallback && clamped != lastReportedIndex) {
            lastReportedIndex = clamped
            onIndexChanged?.invoke(clamped)
        } else {
            lastReportedIndex = clamped
        }

        val targetOffset = targetOffsetForIndex(clamped)
        if (!animated || abs(targetOffset - sheetOffsetY) < 0.5f) {
            cancelSpring()
            setSheetOffsetYInternal(targetOffset)
            if (isPresented != prevPresented) {
                syncAccessibility()
                onPresentationChanged?.invoke()
            }
            onSettleChanged?.invoke(clamped)
            return
        }

        if (isPresented != prevPresented) {
            syncAccessibility()
            onPresentationChanged?.invoke()
        }
        startSpringTo(targetOffset, initialVelocityPxPerSec, clamped)
    }

    private fun startSpringTo(
        targetOffsetPx: Float,
        initialVelocityPxPerSec: Float,
        targetIndex: Int,
    ) {
        cancelSpring()
        val startOffset = sheetOffsetY - targetOffsetPx
        val distance = targetOffsetPx - sheetOffsetY
        val omega = BottomSheetMath.computeCriticalSpringOmega(
            distancePx = distance,
            initialVelocityPxPerSec = initialVelocityPxPerSec,
            settleDurationSeconds = settleDurationSeconds,
        )
        val clampedVelocity = BottomSheetMath.clampSpringInitialVelocity(
            startOffsetPx = startOffset,
            initialVelocityPxPerSec = initialVelocityPxPerSec,
            omega = omega,
        )
        val endOffset = BottomSheetMath.computeSpringEndOffset(
            startOffsetPx = startOffset,
            clampedInitialVelocityPxPerSec = clampedVelocity,
            omega = omega,
        )
        val stiffness = (omega * omega).coerceAtLeast(1f)

        var finished = false
        fun finishSettle() {
            if (finished) return
            finished = true
            springAnimation = null
            setSheetOffsetYInternal(targetOffsetPx)
            syncAccessibility()
            onPresentationChanged?.invoke()
            onSettleChanged?.invoke(targetIndex)
        }

        springValueHolder.value = sheetOffsetY
        val spring = SpringAnimation(springValueHolder).apply {
            setStartVelocity(clampedVelocity)
            minimumVisibleChange = BottomSheetMath.SETTLE_MIN_VISIBLE_CHANGE
            spring = SpringForce(targetOffsetPx).apply {
                this.stiffness = stiffness
                this.dampingRatio = SpringForce.DAMPING_RATIO_NO_BOUNCY
            }
            addUpdateListener { animation, value, _ ->
                val (scaledPosition, settled) = BottomSheetMath.scaleSpringPosition(
                    rawValuePx = value,
                    targetValuePx = targetOffsetPx,
                    startOffsetPx = startOffset,
                    endOffsetPx = endOffset,
                )
                if (!settled) {
                    setSheetOffsetYInternal(scaledPosition)
                } else {
                    animation.cancel()
                    finishSettle()
                }
            }
            addEndListener { _, canceled, _, _ ->
                if (!canceled) {
                    finishSettle()
                }
            }
        }
        springAnimation = spring
        spring.start()
    }

    private fun cancelSpring() {
        val running = springAnimation ?: return
        springAnimation = null
        running.cancel()
    }

    private fun setSheetOffsetYInternal(nextOffsetPx: Float) {
        sheetOffsetY = nextOffsetPx
        syncVisualsForCurrentOffset()
        emitPositionIfNeeded()
    }

    private fun syncVisualsForCurrentOffset() {
        if (containerHeightPx <= 0 || containerWidthPx <= 0) return

        val openPx = openHeightPx
        val hostWidthPx = containerWidthPx.toFloat()
        val insets = BottomSheetMath.interpolateInsets(resolvedDetents, openPx)
        val span = BottomSheetMath.placeCard(
            hostWidthPx = hostWidthPx,
            insets = insets,
            maxWidthPx = cardMaxWidthPx,
            placementBias = cardPlacementBias,
        )
        val cardLeft = span.left
        val cardRight = span.right
        val cardHeight = (openPx - insets.bottom).coerceAtLeast(0f)
        val hasCardGaps = insets.isInset || cardLeft > 0.5f || cardRight < hostWidthPx - 0.5f

        sheetContainer.translationY = sheetOffsetY
        clipContainer.setClipsToCard(hasCardGaps || cardShadows.isNotEmpty() || cardElevationPx > 0f)
        clipContainer.setCard(cardLeft, 0f, cardRight, cardHeight)

        // Position surface and content wrapper at committedContentRegionInset so content doesn't reflow horizontally during drag.
        val committedLeftPx = (committedContentRegionInsetDp ?: 0f) * density
        val horizontalDelta = cardLeft - committedLeftPx
        surfaceView?.translationX = horizontalDelta
        contentWrapperView?.let { wrapper ->
            val widestWidthPx = BottomSheetMath.placeCard(
                hostWidthPx = hostWidthPx,
                insets = widestCardInsetsPx,
                maxWidthPx = cardMaxWidthPx,
                placementBias = cardPlacementBias,
            ).width
            val scale = BottomSheetMath.contentScale(span.width, widestWidthPx)
            wrapper.pivotX = 0f
            wrapper.pivotY = 0f
            wrapper.scaleX = scale
            wrapper.scaleY = scale
            wrapper.translationX = horizontalDelta
        }

        // Stitch top and bottom RenderNode shadow halves without redrawing blurred paths!
        if (topShadowView.hasShadows && openPx > 0.5f && cardHeight > 0.5f) {
            topShadowView.visibility = VISIBLE
            bottomShadowView.visibility = VISIBLE
            val maxDetentCardHeight = resolvedDetents.maxOfOrNull { it.heightPx.toFloat() } ?: cardHeight
            val refHeight = max(cardHeight, max(maxDetentCardHeight, topShadowView.edgeBand * 2f))
            val splitY = sheetOffsetY + cardHeight * 0.5f
            topShadowView.place(
                shapeLeft = cardLeft,
                shapeRight = cardRight,
                shapeHeight = refHeight,
                offsetY = sheetOffsetY,
                clipTop = Float.NEGATIVE_INFINITY,
                clipBottom = splitY,
            )
            bottomShadowView.place(
                shapeLeft = cardLeft,
                shapeRight = cardRight,
                shapeHeight = refHeight,
                offsetY = sheetOffsetY + cardHeight - refHeight,
                clipTop = splitY,
                clipBottom = Float.POSITIVE_INFINITY,
            )
        } else {
            topShadowView.visibility = GONE
            bottomShadowView.visibility = GONE
        }

        // Update modal scrim opacity.
        if (modal) {
            val scrimProgress = BottomSheetMath.interpolateScrimOpacity(resolvedDetents, openPx)
            scrimCanvas.setOpacityProgress(scrimProgress)
        } else {
            scrimCanvas.setOpacityProgress(0f)
        }
    }

    private fun syncAccessibility() {
        val activeModal = modal && isPresented
        scrimDismissView.setDismissEnabled(activeModal && canUserDismissOrRequestClose())
        sheetContainer.importantForAccessibility =
            if (isPresented) IMPORTANT_FOR_ACCESSIBILITY_YES
            else IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }

    private fun emitPositionIfNeeded() {
        val callback = onPositionChanged ?: return
        if (containerHeightPx <= 0 || resolvedDetents.isEmpty()) return
        val openPx = openHeightPx
        val next = doubleArrayOf(
            (openPx / density).toDouble(),
            BottomSheetMath.computeFractionalIndex(resolvedDetents, openPx).toDouble(),
        )
        if (lastPosition.contentEquals(next)) return
        lastPosition = next
        callback(next[0], next[1])
    }

    private fun minAllowedIndex(): Int = if (modal) -1 else 0

    private fun clampRequestedIndex(index: Int): Int {
        if (rawDetents.isEmpty()) return -1
        val minIdx = if (modal) -1 else 0
        return index.coerceIn(minIdx, rawDetents.lastIndex)
    }

    private fun targetOffsetForIndex(index: Int): Float {
        if (index < 0 || resolvedDetents.isEmpty()) return containerHeightPx.toFloat()
        val safeIdx = index.coerceIn(0, resolvedDetents.lastIndex)
        return containerHeightPx - resolvedDetents[safeIdx].totalHeightPx
    }

    // ---- NestedScrollingParent3 fallback for standard Android nested scroll children ----

    override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
        if ((axes and ViewCompat.SCROLL_AXIS_VERTICAL) == 0) return false
        if (scrollExpandCoordination == ScrollCoordinationLevel.NONE &&
            scrollCollapseCoordination == ScrollCoordinationLevel.NONE
        ) {
            return false
        }
        return type == ViewCompat.TYPE_TOUCH && isPresented
    }

    override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
        nestedScrollingParentHelper.onNestedScrollAccepted(child, target, axes, type)
        if (type == ViewCompat.TYPE_TOUCH) {
            cancelPendingCloseRequest()
            cancelSpring()
            isNestedDragging = true
        }
    }

    override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray, type: Int) {
        if (type != ViewCompat.TYPE_TOUCH || dy == 0) return
        // dy > 0 in NestedScrolling means scrolling content DOWN (finger moves UP -> expanding sheet).
        if (dy > 0 && scrollExpandCoordination != ScrollCoordinationLevel.NONE && canSheetExpandFurther()) {
            val beforeOffset = sheetOffsetY
            onSheetDragByClampedToTop(-dy.toFloat())
            val moved = (beforeOffset - sheetOffsetY).roundToInt()
            consumed[1] = moved
        }
    }

    override fun onNestedScroll(
        target: View,
        dxConsumed: Int,
        dyConsumed: Int,
        dxUnconsumed: Int,
        dyUnconsumed: Int,
        type: Int,
        consumed: IntArray,
    ) {
        if (type != ViewCompat.TYPE_TOUCH || dyUnconsumed == 0) return
        // dyUnconsumed < 0 means child hit top and finger is moving DOWN -> collapsing sheet!
        if (dyUnconsumed < 0 && scrollCollapseCoordination != ScrollCoordinationLevel.NONE) {
            onSheetDragBy(-dyUnconsumed.toFloat())
            consumed[1] += dyUnconsumed
        }
    }

    override fun onNestedScroll(
        target: View,
        dxConsumed: Int,
        dyConsumed: Int,
        dxUnconsumed: Int,
        dyUnconsumed: Int,
        type: Int,
    ) {
        onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed, type, IntArray(2))
    }

    override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean {
        if (!isAtRestingDetent()) {
            isNestedDragging = false
            settleFromRelease(-velocityY)
            return true
        }
        return false
    }

    override fun onStopNestedScroll(target: View, type: Int) {
        nestedScrollingParentHelper.onStopNestedScroll(target, type)
        if (type == ViewCompat.TYPE_TOUCH && isNestedDragging) {
            isNestedDragging = false
            if (!isAtRestingDetent()) {
                settleFromRelease(0f)
            }
        }
    }

    override fun getNestedScrollAxes(): Int = nestedScrollingParentHelper.nestedScrollAxes

    override fun onDetachedFromWindow() {
        cancelPendingCloseRequest()
        cancelSpring()
        super.onDetachedFromWindow()
    }
}
