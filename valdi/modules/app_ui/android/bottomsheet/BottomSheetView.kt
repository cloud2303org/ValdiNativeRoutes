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
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.views.CustomChildViewAppender
import com.snap.valdi.views.ValdiRecyclableView
import com.snap.valdi.views.ValdiView
import com.snap.valdi.views.touches.DisallowInterceptTouchEventMode
import com.snap.valdi.views.touches.TouchDispatcher
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
        teardownOverlayDialog()
        onNativeGeometry = null
        onNativeIndexChange = null
        onNativeSettle = null
        onNativePositionChange = null
        onNativeCloseRequest = null
        requestedToPresentInOverlay = false
        windowOverlay = false
        openOrder = 0
        hostView.committedContentRegionInsetDp = null
        hostView.setRawDetents(emptyList())
        hostView.setRequestedIndex(-1)
    }

    // ---- Attribute decoding helpers ----

    internal fun applyDetentsUntyped(value: Any?) {
        val list = value as? List<*> ?: run {
            hostView.setRawDetents(emptyList())
            return
        }
        val parsed = list.mapNotNull { item ->
            val map = item as? Map<*, *> ?: return@mapNotNull null
            val kindStr = map["kind"] as? String ?: "points"
            val kind = when (kindStr) {
                "percentage" -> DetentKind.PERCENTAGE
                "content" -> DetentKind.CONTENT
                else -> DetentKind.POINTS
            }
            RawDetentSpec(
                value = (map["value"] as? Number)?.toFloat() ?: 0f,
                kind = kind,
                programmatic = map["programmatic"] as? Boolean ?: false,
                usesStatusBarTopInset = map["usesStatusBarTopInset"] as? Boolean ?: false,
                insetTopDp = (map["insetTop"] as? Number)?.toFloat() ?: 0f,
                insetLeftDp = (map["insetLeft"] as? Number)?.toFloat() ?: 0f,
                insetRightDp = (map["insetRight"] as? Number)?.toFloat() ?: 0f,
                insetBottomDp = (map["insetBottom"] as? Number)?.toFloat() ?: 0f,
                widestCard = map["widestCard"] as? Boolean ?: false,
                maxWidthDp = (map["maxWidth"] as? Number)?.toFloat() ?: 0f,
                placementBias = (map["placementBias"] as? Number)?.toFloat() ?: 0.5f,
                scrimOpacity = (map["scrimOpacity"] as? Number)?.toFloat() ?: 1f,
            )
        }
        hostView.setRawDetents(parsed)
    }

    internal fun applyDetentIndex(index: Int) {
        requestedToPresentInOverlay = index >= 0
        hostView.setRequestedIndex(index)
        syncOverlayVisibility()
    }

    internal fun applyCornerRadiiUntyped(value: Any?) {
        val list = value as? List<*>
        if (list == null || list.size < 4) {
            hostView.setSurfaceCornerRadiiDp(FloatArray(4))
            return
        }
        val radii = FloatArray(4) { i -> (list[i] as? Number)?.toFloat() ?: 0f }
        hostView.setSurfaceCornerRadiiDp(radii)
    }

    internal fun applySurfaceShadowsUntyped(value: Any?) {
        val list = value as? List<*> ?: run {
            hostView.setSurfaceShadows(emptyList())
            return
        }
        val density = resources.displayMetrics.density.coerceAtLeast(0.001f)
        val parsed = list.mapNotNull { item ->
            val map = item as? Map<*, *> ?: return@mapNotNull null
            val rawColor = (map["colorArgb"] as? Number)?.toInt() ?: 0
            val opacity = ((map["opacity"] as? Number)?.toFloat() ?: 1f).coerceIn(0f, 1f)
            val combinedAlpha = (Color.alpha(rawColor) * opacity).roundToInt().coerceIn(0, 255)
            if (combinedAlpha <= 0) return@mapNotNull null
            CardShadow(
                offsetX = ((map["offsetX"] as? Number)?.toFloat() ?: 0f) * density,
                offsetY = ((map["offsetY"] as? Number)?.toFloat() ?: 0f) * density,
                blurRadius = (((map["blurRadius"] as? Number)?.toFloat() ?: 0f) * density).coerceAtLeast(0f),
                spreadDistance = ((map["spreadDistance"] as? Number)?.toFloat() ?: 0f) * density,
                color = Color.argb(
                    combinedAlpha,
                    Color.red(rawColor),
                    Color.green(rawColor),
                    Color.blue(rawColor),
                ),
            )
        }
        hostView.setSurfaceShadows(parsed)
    }
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
            "detents",
            false,
            { view, value -> view.applyDetentsUntyped(value) },
            { view -> view.applyDetentsUntyped(null) },
        )
        ctx.bindIntAttribute(
            "detentIndex",
            false,
            { view, value, _ -> view.applyDetentIndex(value) },
            { view, _ -> view.applyDetentIndex(-1) },
        )
        ctx.bindBooleanAttribute(
            "animateIn",
            false,
            { view, value, _ -> view.hostView.animateIn = value },
            { view, _ -> view.hostView.animateIn = true },
        )
        ctx.bindBooleanAttribute(
            "animateContentHeight",
            false,
            { view, value, _ -> view.hostView.animateContentHeight = value },
            { view, _ -> view.hostView.animateContentHeight = true },
        )
        ctx.bindBooleanAttribute(
            "modal",
            false,
            { view, value, _ -> view.hostView.modal = value },
            { view, _ -> view.hostView.modal = false },
        )
        ctx.bindBooleanAttribute(
            "windowOverlay",
            false,
            { view, value, _ -> view.windowOverlay = value },
            { view, _ -> view.windowOverlay = false },
        )
        ctx.bindIntAttribute(
            "openOrder",
            false,
            { view, value, _ -> view.openOrder = value },
            { view, _ -> view.openOrder = 0 },
        )
        ctx.bindIntAttribute(
            "scrollExpandCoordination",
            false,
            { view, value, _ ->
                view.hostView.scrollExpandCoordination = ScrollCoordinationLevel.fromWireValue(value)
            },
            { view, _ -> view.hostView.scrollExpandCoordination = ScrollCoordinationLevel.HANDOFF },
        )
        ctx.bindIntAttribute(
            "scrollCollapseCoordination",
            false,
            { view, value, _ ->
                view.hostView.scrollCollapseCoordination = ScrollCoordinationLevel.fromWireValue(value)
            },
            { view, _ -> view.hostView.scrollCollapseCoordination = ScrollCoordinationLevel.HANDOFF },
        )
        ctx.bindFloatAttribute(
            "settleDuration",
            false,
            { view, value, _ ->
                view.hostView.settleDurationSeconds =
                    if (value > 0f) value else BottomSheetMath.DEFAULT_SETTLE_DURATION_SECONDS
            },
            { view, _ ->
                view.hostView.settleDurationSeconds = BottomSheetMath.DEFAULT_SETTLE_DURATION_SECONDS
            },
        )
        ctx.bindBooleanAttribute(
            "hasCloseRequestHandler",
            false,
            { view, value, _ -> view.hostView.hasCloseRequestHandler = value },
            { view, _ -> view.hostView.hasCloseRequestHandler = false },
        )
        ctx.bindIntAttribute(
            "scrimColorArgb",
            false,
            { view, value, _ -> view.hostView.setScrimColorArgb(value) },
            { view, _ -> view.hostView.setScrimColorArgb(BottomSheetScrimCanvasView.DEFAULT_SCRIM_COLOR) },
        )
        ctx.bindStringAttribute(
            "scrimAccessibilityLabel",
            false,
            { view, value, _ -> view.hostView.setScrimAccessibilityLabel(value) },
            { view, _ -> view.hostView.setScrimAccessibilityLabel(ScrimDismissView.DEFAULT_LABEL) },
        )
        ctx.bindUntypedAttribute(
            "surfaceCornerRadii",
            false,
            { view, value -> view.applyCornerRadiiUntyped(value) },
            { view -> view.applyCornerRadiiUntyped(null) },
        )
        ctx.bindStringAttribute(
            "surfaceCornerCurve",
            false,
            { _, _, _ -> /* Android uses circular rounded rects natively */ },
            { _, _ -> },
        )
        ctx.bindUntypedAttribute(
            "surfaceShadows",
            false,
            { view, value -> view.applySurfaceShadowsUntyped(value) },
            { view -> view.applySurfaceShadowsUntyped(null) },
        )
        ctx.bindFloatAttribute(
            "surfaceElevation",
            false,
            { view, value, _ -> view.hostView.setSurfaceElevationDp(value) },
            { view, _ -> view.hostView.setSurfaceElevationDp(0f) },
        )
        ctx.bindIntAttribute(
            "surfaceShadowColorArgb",
            false,
            { view, value, _ -> view.hostView.setSurfaceShadowColorArgb(value) },
            { view, _ -> view.hostView.setSurfaceShadowColorArgb(Color.BLACK) },
        )
        ctx.bindUntypedAttribute(
            "committedContentRegionInset",
            false,
            { view, value ->
                view.hostView.committedContentRegionInsetDp = (value as? Number)?.toFloat()
            },
            { view -> view.hostView.committedContentRegionInsetDp = null },
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
