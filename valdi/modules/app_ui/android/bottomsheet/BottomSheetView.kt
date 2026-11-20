package io.valdiroutes.app

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.ComponentDialog
import androidx.annotation.Keep
import androidx.core.view.WindowCompat
import com.snap.valdi.ValdiRuntimeManager
import com.snap.valdi.attributes.AttributesBinder
import com.snap.valdi.attributes.AttributesBindingContext
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.utils.ValdiMarshallableObject
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.views.CustomChildViewAppender
import com.snap.valdi.views.ValdiView
import com.snap.valdi.views.touches.DisallowInterceptTouchEventMode
import com.snap.valdi.views.touches.TouchDispatcher
import io.valdiroutes.app_ui.BottomSheetCardShadow
import io.valdiroutes.app_ui.BottomSheetConfig
import io.valdiroutes.app_ui.BottomSheetDetent
import io.valdiroutes.app_ui.BottomSheetDetentKind
import io.valdiroutes.app_ui.ui.applyWheelConfigOrReset
import kotlin.math.roundToInt

/**
 * Root container used inside `windowOverlay` `ComponentDialog` so Valdi child views,
 * `ValdiScrollView`, `TapGestureRecognizer`, and `SheetValdiGestureRecognizer` receive full
 * Valdi `TouchDispatcher` gesture routing outside the main `ValdiRootView` window.
 */
internal class BottomSheetDialogRootView(
    context: Context,
    private val hostView: BottomSheetHostView,
) : FrameLayout(context) {

    private val touchDispatcher = TouchDispatcher.create(
        this,
        DisallowInterceptTouchEventMode.DISALLOW_WHEN_GESTURE_RECOGNIZED,
        null,
        false,
        true,
        false,
        false,
    )

    init {
        clipChildren = false
        clipToPadding = false
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN && !hostView.isPointInteractive(event.x, event.y)) {
            return false
        }
        val handledByValdi = touchDispatcher.dispatchTouch(event)
        return handledByValdi || hostView.isPointInteractive(event.x, event.y)
    }
}

/**
 * Native `<custom-view>` backing `BottomSheet.tsx` and `ModalBottomSheet.tsx` on Android.
 *
 * Routes Valdi child views (`BottomSheetSurfaceView` and `BottomSheetContentWrapperView`) into
 * `BottomSheetHostView.clipContainer`, manages either inline/portal hosting or `windowOverlay`
 * `ComponentDialog` presentation, and bridges native callbacks back to TypeScript.
 */
@Keep
class BottomSheetView(context: Context) :
    ValdiView(context),
    CustomChildViewAppender {

    internal val hostView = BottomSheetHostView(context)
    internal var portalOwner: BottomSheetPortalHostView? = null

    var openOrder: Int = 0
        set(value) {
            if (field == value) return
            field = value
            portalOwner?.syncSheetStack()
        }

    var windowOverlay: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            syncHostPlacement()
            portalOwner?.syncSheetStack()
        }

    // ---- ValdiFunction callbacks ----
    var onNativeGeometry: ValdiFunction? = null
        set(value) {
            field = value
            if (value != null) {
                hostView.replayGeometryIfAvailable()
            }
        }
    var onNativeIndexChange: ValdiFunction? = null
    var onNativeSettle: ValdiFunction? = null
    var onNativePositionChange: ValdiFunction? = null
    var onNativeCloseRequest: ValdiFunction? = null

    private var overlayDialog: ComponentDialog? = null
    private var dialogRoot: BottomSheetDialogRootView? = null
    private val overlayCloseController = OverlayCloseRequestController(
        stateProvider = { hostView.closeRequestState() },
        onEmitCloseRequest = { hostView.emitCloseRequestFromSystem() },
        onDismissModal = { hostView.dismissModalByUser() },
    )

    init {
        clipChildren = false
        clipToPadding = false
        clipToBounds = false

        addView(hostView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        installValdiHitTest(this) { xPx, yPx ->
            !windowOverlay && hostView.isPointInteractive(xPx, yPx)
        }

        hostView.onGeometryChanged = { widthDp, heightDp, surfaceDp, insetDp, hostWidthDp ->
            val fn = onNativeGeometry
            if (fn != null) {
                ValdiMarshaller.use { m ->
                    m.pushDouble(widthDp)
                    m.pushDouble(heightDp)
                    m.pushDouble(surfaceDp)
                    m.pushDouble(insetDp)
                    m.pushDouble(hostWidthDp)
                    fn.perform(m)
                }
            }
        }
        hostView.onIndexChanged = { index ->
            val fn = onNativeIndexChange
            if (fn != null) {
                ValdiMarshaller.use { m ->
                    m.pushInt(index)
                    fn.perform(m)
                }
            }
        }
        hostView.onSettleChanged = { index ->
            val fn = onNativeSettle
            if (fn != null) {
                ValdiMarshaller.use { m ->
                    m.pushInt(index)
                    fn.perform(m)
                }
            }
            syncOverlayVisibility()
        }
        hostView.onPositionChanged = { positionDp, fractionalIndex ->
            val fn = onNativePositionChange
            if (fn != null) {
                ValdiMarshaller.use { m ->
                    m.pushDouble(positionDp)
                    m.pushDouble(fractionalIndex)
                    fn.perform(m)
                }
            }
        }
        hostView.onCloseRequest = {
            val fn = onNativeCloseRequest
            if (fn != null) {
                ValdiMarshaller.use { m ->
                    fn.perform(m)
                }
            }
        }
        hostView.onPresentationChanged = {
            portalOwner?.syncSheetStack()
            overlayCloseController.sync()
            syncOverlayVisibility()
        }
    }

    override val clipToBoundsDefaultValue: Boolean
        get() = false

    // ---- Route Valdi children into hostView.clipContainer ----

    override fun addValdiChildView(view: View, index: Int) {
        hostView.attachValdiChild(view, index)
    }

    override fun removeView(view: View?) {
        if (view != null && view !== hostView && view.parent === hostView.clipContainer) {
            hostView.detachValdiChild(view)
            return
        }
        super.removeView(view)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(w, h)
        if (hostView.parent === this) {
            hostView.measure(
                MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY),
            )
        }
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        if (hostView.parent === this) {
            hostView.layout(0, 0, (r - l).coerceAtLeast(0), (b - t).coerceAtLeast(0))
        }
    }

    // ---- Portal hooks ----

    internal fun isPortalInteractiveAt(xPx: Float, yPx: Float): Boolean =
        !windowOverlay && hostView.isPointInteractive(xPx, yPx)

    internal fun isPortalModalPresented(): Boolean =
        !windowOverlay && hostView.isModalPresented

    internal fun portalCloseState(): CloseRequestInputState =
        if (windowOverlay) CloseRequestInputState(false, false, false)
        else hostView.closeRequestState()

    internal fun emitPortalCloseRequest() {
        hostView.emitCloseRequestFromSystem()
    }

    internal fun dismissPortalModal() {
        hostView.dismissModalByUser()
    }

    // ---- windowOverlay Dialog management ----

    private fun syncHostPlacement() {
        if (!isAttachedToWindow) {
            teardownOverlayDialog()
            return
        }
        if (windowOverlay) {
            syncOverlayVisibility()
        } else {
            teardownOverlayDialog()
            if (hostView.parent !== this) {
                (hostView.parent as? ViewGroup)?.removeView(hostView)
                addView(hostView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }
        }
    }

    private fun syncOverlayVisibility() {
        if (!windowOverlay || !isAttachedToWindow) return
        val shouldShow = hostView.isPresented || requestedToPresentInOverlay
        if (shouldShow) {
            ensureOverlayDialogShown()
            updateOverlayWindowFlags()
        } else {
            teardownOverlayDialog()
            if (hostView.parent !== this) {
                (hostView.parent as? ViewGroup)?.removeView(hostView)
                addView(hostView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }
        }
    }

    private var requestedToPresentInOverlay: Boolean = false

    private fun ensureOverlayDialogShown() {
        if (overlayDialog?.isShowing == true) return
        val activity = context.findActivity() ?: return
        if (activity.isFinishing || activity.isDestroyed) return

        (hostView.parent as? ViewGroup)?.removeView(hostView)
        val root = BottomSheetDialogRootView(activity, hostView)
        root.addView(
            hostView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        dialogRoot = root

        val dialog = object : ComponentDialog(activity, android.R.style.Theme_Translucent_NoTitleBar_Fullscreen) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                if (overlayCloseController.handleKeyEvent(event.keyCode, event)) return true
                return super.dispatchKeyEvent(event)
            }
        }
        dialog.setCancelable(false)
        dialog.setCanceledOnTouchOutside(false)
        dialog.onBackPressedDispatcher.addCallback(dialog, overlayCloseController.backCallback)
        overlayCloseController.sync()

        dialog.setContentView(
            root,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        dialog.window?.let { win ->
            win.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            win.setLayout(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
            )
            win.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            WindowCompat.setDecorFitsSystemWindows(win, false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                win.attributes = win.attributes.apply {
                    layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            }
        }
        overlayDialog = dialog
        updateOverlayWindowFlags()
        dialog.show()
    }

    private fun updateOverlayWindowFlags() {
        val win = overlayDialog?.window ?: return
        val interceptsBack = hostView.closeRequestState().interceptsBack
        if (interceptsBack) {
            win.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
        } else {
            win.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
        }
        win.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)
    }

    private fun teardownOverlayDialog() {
        val dialog = overlayDialog
        overlayDialog = null
        dialogRoot?.removeAllViews()
        dialogRoot = null
        if (dialog != null && dialog.isShowing) {
            runCatching { dialog.dismiss() }
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        syncHostPlacement()
    }

    override fun onDetachedFromWindow() {
        teardownOverlayDialog()
        if (hostView.parent !== this) {
            (hostView.parent as? ViewGroup)?.removeView(hostView)
            addView(hostView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        }
        super.onDetachedFromWindow()
    }

    override fun prepareForRecycling() {
        super.prepareForRecycling()
        onNativeGeometry = null
        onNativeIndexChange = null
        onNativeSettle = null
        onNativePositionChange = null
        onNativeCloseRequest = null
        resetConfig()
    }

    // ---- Typed config application ----

    internal fun applyConfigUntyped(value: Any?) {
        if (value == null) {
            resetConfig()
            return
        }
        applyWheelConfigOrReset(reset = ::resetConfig) {
            applyConfig(ValdiMarshallableObject.fromUntyped(BottomSheetConfig::class.java, value))
        }
    }

    internal fun applyConfig(config: BottomSheetConfig) {
        windowOverlay = config.windowOverlay
        openOrder = config.openOrder.toInt()
        hostView.animateIn = config.animateIn
        hostView.animateContentHeight = config.animateContentHeight
        hostView.modal = config.modal
        hostView.scrollExpandCoordination =
            ScrollCoordinationLevel.fromWireValue(config.scrollExpandCoordination.toInt())
        hostView.scrollCollapseCoordination =
            ScrollCoordinationLevel.fromWireValue(config.scrollCollapseCoordination.toInt())
        hostView.settleDurationSeconds = if (config.settleDuration > 0.0) {
            config.settleDuration.toFloat()
        } else {
            BottomSheetMath.DEFAULT_SETTLE_DURATION_SECONDS
        }
        hostView.hasCloseRequestHandler = config.hasCloseRequestHandler
        hostView.setScrimColorArgb(config.scrimColorArgb.toLong().toInt())
        hostView.setScrimAccessibilityLabel(config.scrimAccessibilityLabel)
        hostView.setSurfaceCornerRadiiDp(mapCornerRadiiDp(config.surfaceCornerRadii))
        val density = resources.displayMetrics.density.coerceAtLeast(0.001f)
        hostView.setSurfaceShadows(mapSurfaceShadows(config.surfaceShadows, density))
        hostView.setSurfaceElevationDp(config.surfaceElevation.toFloat())
        hostView.setSurfaceShadowColorArgb(config.surfaceShadowColorArgb.toLong().toInt())
        hostView.committedContentRegionInsetDp = config.committedContentRegionInset?.toFloat()
        hostView.setRawDetents(mapRawDetents(config.detents))

        val nextIndex = config.detentIndex.toInt()
        requestedToPresentInOverlay = nextIndex >= 0
        hostView.setRequestedIndex(nextIndex)
        syncOverlayVisibility()
    }

    internal fun resetConfig() {
        teardownOverlayDialog()
        requestedToPresentInOverlay = false
        windowOverlay = false
        openOrder = 0
        hostView.resetForRecycling()
        hostView.animateIn = true
        hostView.animateContentHeight = true
        hostView.modal = false
        hostView.scrollExpandCoordination = ScrollCoordinationLevel.HANDOFF
        hostView.scrollCollapseCoordination = ScrollCoordinationLevel.HANDOFF
        hostView.settleDurationSeconds = BottomSheetMath.DEFAULT_SETTLE_DURATION_SECONDS
        hostView.hasCloseRequestHandler = false
        hostView.setScrimColorArgb(BottomSheetScrimCanvasView.DEFAULT_SCRIM_COLOR)
        hostView.setScrimAccessibilityLabel(ScrimDismissView.DEFAULT_LABEL)
        hostView.setSurfaceCornerRadiiDp(FloatArray(4))
        hostView.setSurfaceShadows(emptyList())
        hostView.setSurfaceElevationDp(0f)
        hostView.setSurfaceShadowColorArgb(Color.BLACK)
    }
}

internal fun mapRawDetents(detents: List<BottomSheetDetent>): List<RawDetentSpec> = detents.map { item ->
    val kind = when (item.kind) {
        BottomSheetDetentKind.Points -> DetentKind.POINTS
        BottomSheetDetentKind.Percentage -> DetentKind.PERCENTAGE
        BottomSheetDetentKind.Content -> DetentKind.CONTENT
    }
    RawDetentSpec(
        value = item.value.toFloat(),
        kind = kind,
        programmatic = item.programmatic,
        usesStatusBarTopInset = item.usesStatusBarTopInset,
        insetTopDp = item.insetTop.toFloat(),
        insetLeftDp = item.insetLeft.toFloat(),
        insetRightDp = item.insetRight.toFloat(),
        insetBottomDp = item.insetBottom.toFloat(),
        widestCard = item.widestCard,
        maxWidthDp = item.maxWidth.toFloat(),
        placementBias = item.placementBias.toFloat(),
        scrimOpacity = item.scrimOpacity.toFloat(),
    )
}

internal fun mapCornerRadiiDp(radii: List<Double>): FloatArray {
    if (radii.size < 4) return FloatArray(4)
    return FloatArray(4) { idx -> radii[idx].toFloat() }
}

internal fun mapSurfaceShadows(shadows: List<BottomSheetCardShadow>, density: Float): List<CardShadow> =
    shadows.mapNotNull { shadow ->
        val rawColor = shadow.colorArgb.toLong().toInt()
        val opacity = shadow.opacity.toFloat().coerceIn(0f, 1f)
        val baseAlpha = (rawColor ushr 24) and 0xFF
        val combinedAlpha = (baseAlpha * opacity).roundToInt().coerceIn(0, 255)
        if (combinedAlpha <= 0) return@mapNotNull null
        CardShadow(
            offsetX = shadow.offsetX.toFloat() * density,
            offsetY = shadow.offsetY.toFloat() * density,
            blurRadius = (shadow.blurRadius.toFloat() * density).coerceAtLeast(0f),
            spreadDistance = shadow.spreadDistance.toFloat() * density,
            color = (combinedAlpha shl 24) or (rawColor and 0x00FFFFFF),
        )
    }

/**
 * Registers all Valdi `<custom-view>` binders for `app_ui`'s BottomSheet library.
 */
object BottomSheetBinders {
    fun register(runtimeManager: ValdiRuntimeManager) {
        runtimeManager.registerGlobalAttributesBinder(NoOpValdiViewBinder(BottomSheetPortalHostView::class.java))
        runtimeManager.registerGlobalAttributesBinder(NoOpValdiViewBinder(BottomSheetSurfaceView::class.java))
        runtimeManager.registerGlobalAttributesBinder(NoOpValdiViewBinder(BottomSheetContentWrapperView::class.java))
        runtimeManager.registerGlobalAttributesBinder(NoOpValdiViewBinder(BottomSheetMarkerView::class.java))
        runtimeManager.registerGlobalAttributesBinder(BottomSheetViewBinder())
    }
}

private class NoOpValdiViewBinder<T : View>(override val viewClass: Class<T>) : AttributesBinder<T> {
    override fun bindAttributes(attributesBindingContext: AttributesBindingContext<T>) = Unit
}

private class BottomSheetViewBinder : AttributesBinder<BottomSheetView> {
    override val viewClass: Class<BottomSheetView> = BottomSheetView::class.java

    override fun bindAttributes(ctx: AttributesBindingContext<BottomSheetView>) {
        ctx.bindUntypedAttribute(
            "config",
            false,
            { view, value -> view.applyConfigUntyped(value) },
            { view -> view.resetConfig() },
        )

        ctx.bindFunctionAttribute(
            "onNativeGeometry",
            { view, fn -> view.onNativeGeometry = fn },
            { view -> view.onNativeGeometry = null },
        )
        ctx.bindFunctionAttribute(
            "onNativeIndexChange",
            { view, fn -> view.onNativeIndexChange = fn },
            { view -> view.onNativeIndexChange = null },
        )
        ctx.bindFunctionAttribute(
            "onNativeSettle",
            { view, fn -> view.onNativeSettle = fn },
            { view -> view.onNativeSettle = null },
        )
        ctx.bindFunctionAttribute(
            "onNativePositionChange",
            { view, fn -> view.onNativePositionChange = fn },
            { view -> view.onNativePositionChange = null },
        )
        ctx.bindFunctionAttribute(
            "onNativeCloseRequest",
            { view, fn -> view.onNativeCloseRequest = fn },
            { view -> view.onNativeCloseRequest = null },
        )
    }
}
