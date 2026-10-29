// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/DialogFrame.kt).
package io.nativeroutes.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.window.Dialog as WindowDialog

private val quadInOut = CubicBezierEasing(0.455f, 0.03f, 0.515f, 0.955f)

/**
 * Page-scoped centered dialog in its own window, so it also covers an open BottomSheet.
 * Presentation shared by the plain and scrolling dialog bodies.
 */
@Composable
internal fun DialogFrame(open: Boolean, onOpenChange: (Boolean, DialogDismissReason) -> Unit, dismissible: Boolean = true,
    onClosed: (OverlayCloseReason) -> Unit = {}, title: String? = null, description: String? = null,
    scrolling: Boolean = false, footer: (@Composable () -> Unit)? = null, maxHeight: Dp = UiDesign.size.dialogMaxHeight.dp,
    content: (@Composable ColumnScope.() -> Unit)? = null) {
    val presentation = rememberPresentation(open, dismissible, DialogDismissReason.Back, DialogDismissReason.Navigation, onOpenChange, onClosed)
    val current = presentation.id ?: return
    key(current) {
        val scrim = remember { Animatable(0f) }
        val panel = remember { Animatable(0f) }
        val scale = remember { Animatable(0.96f) }
        LaunchedEffect(open) {
            coroutineScope {
                if (open) {
                    launch { scrim.animateTo(1f, tween(160, easing = quadInOut)) }
                    launch { panel.animateTo(1f, tween(160, easing = quadInOut)) }
                    launch { scale.animateTo(1f, spring(dampingRatio = 1f, stiffness = 300f)) }
                } else {
                    launch { scrim.animateTo(0f, tween(150, easing = quadInOut)) }
                    launch { panel.animateTo(0f, tween(150, easing = quadInOut)) }
                    launch { scale.animateTo(0.98f, tween(150, easing = quadInOut)) }
                }
            }
            if (!open) presentation.finish(current)
        }
        WindowDialog(onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false,
                usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            NotifyOverlayWindowAttached(current)
            val back = rememberOverlayBack { presentation.requestClose(DialogDismissReason.Back) }
            BackHandler(onBack = back)
            val view = LocalView.current
            val window = (view.parent as? DialogWindowProvider)?.window
            val light = uiColors().surface.luminance() > 0.5f
            SideEffect {
                window?.let {
                    it.setDimAmount(0f); it.setWindowAnimations(0)
                    WindowCompat.getInsetsController(it, view).apply {
                        isAppearanceLightStatusBars = light
                        isAppearanceLightNavigationBars = light
                    }
                }
            }
            DialogContent(presentation.interactive, presentation.top, scrim.value, panel.value, scale.value,
                onBackdrop = { presentation.requestClose(DialogDismissReason.Backdrop) }, title, description, scrolling, footer, maxHeight, content)
        }
    }
}

@Composable
private fun DialogContent(interactive: Boolean, topmost: Boolean, scrim: Float, panel: Float, scale: Float, onBackdrop: () -> Unit,
    title: String?, description: String?, scrolling: Boolean, footer: (@Composable () -> Unit)?, maxHeight: Dp,
    content: (@Composable ColumnScope.() -> Unit)?) {
    val colors = uiColors()
    val shape = RoundedCornerShape(UiDesign.radius.surface.dp)
    val hairline = with(LocalDensity.current) { (1f / density).toDp() }
    val density = LocalDensity.current
    val safe = WindowInsets.statusBars.union(WindowInsets.navigationBars).union(WindowInsets.displayCutout)
    val top = safe.getTop(density) + with(density) { UiDesign.space.content.dp.roundToPx() }
    val normalBottom = safe.getBottom(density) + with(density) { UiDesign.space.content.dp.roundToPx() }
    val keyboard = if (topmost) WindowInsets.ime.getBottom(density) else 0
    Box(Modifier.fillMaxSize().then(if (interactive) Modifier else Modifier.semantics { hideFromAccessibility() })) {
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = scrim }.background(colors.scrim)
            .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onBackdrop))
        Layout(modifier = Modifier.fillMaxSize(), content = {
            Column(Modifier.widthIn(max = UiDesign.size.dialogWidth.dp).fillMaxWidth()
                .graphicsLayer { alpha = panel; scaleX = scale; scaleY = scale }
                .dropShadow(shape, Shadow(radius = 48.dp, color = colors.dialogShadow, offset = DpOffset(0.dp, 16.dp)))
                .clip(shape).background(colors.surface).border(hairline, colors.border, shape)
                // Keep taps on the card from reaching the scrim.
                .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } }) {
                title?.let { OverlayTitle(it, Modifier.padding(top = UiDesign.space.content.dp).padding(horizontal = UiDesign.space.content.dp)) }
                if (description != null || content != null) {
                    val scrollState = rememberScrollState()
                    Column(Modifier.weight(1f, fill = false)
                        .then(if (scrolling) Modifier.verticalScroll(scrollState) else Modifier)
                        .padding(horizontal = UiDesign.space.content.dp)
                        .padding(top = if (title != null) UiDesign.space.md.dp else UiDesign.space.content.dp,
                            bottom = if (footer != null) 0.dp else UiDesign.space.content.dp),
                        verticalArrangement = Arrangement.spacedBy(UiDesign.space.lg.dp)) {
                        description?.let { OverlayDescription(it) }
                        content?.invoke(this)
                    }
                }
                footer?.let { Box(Modifier.padding(UiDesign.space.content.dp)) { it() } }
            }
        }) { measurables, constraints ->
            // Match RN: center in the whole window, cap the whole card, then lift
            // only an actual keyboard overlap. Title/footer never join the scroller.
            val height = constraints.maxHeight
            val bottom = height - maxOf(normalBottom, keyboard)
            val screenCap = minOf(maxHeight.roundToPx(), height - 2 * maxOf(top, normalBottom)).coerceAtLeast(0)
            val available = minOf(screenCap, (bottom - top).coerceAtLeast(0))
            val width = (constraints.maxWidth - 2 * UiDesign.space.content.dp.roundToPx()).coerceAtLeast(0)
            val card = measurables.single().measure(constraints.copy(minWidth = 0, minHeight = 0, maxWidth = width, maxHeight = available))
            val y = maxOf(top, minOf((height - card.height) / 2, bottom - card.height))
            layout(constraints.maxWidth, height) { card.placeRelative((constraints.maxWidth - card.width) / 2, y) }
        }
        if (!interactive) Box(Modifier.matchParentSize().pointerInput(Unit) {
            awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } }
        })
    }
}
