// The showModal dialog, after ExpoNativeRoutes' Compose DialogFrame / ScrollDialog / PopupActionButtons and their
// UiDesign tokens: its own window (so it covers the sheet too), a centered card capped at 360 wide, a scrolling body
// with a pinned title and footer, and the card lifted only by an actual keyboard overlap.

package io.valdiroutes.app.appui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private object Tokens {
    val surface = Color(0xffffffff)
    val text = Color(0xff172033)
    val muted = Color(0xff667085)
    val border = Color(0xffe8ecf1)
    val scrim = Color(0x52101828)
    val shadow = Color(0x2e102b52)
    val primary = Color(0xff1e62d0)
    val onPrimary = Color(0xffffffff)
    val secondary = Color(0xffeef2f7)
    val onSecondary = Color(0xff1d2939)
    val field = Color(0xfff3f4f6)
    val placeholder = Color(0xff9ca3af)
    const val padding = 24
    const val gap = 12
    const val bodyGap = 16
    const val dialogWidth = 360
    const val dialogMaxHeight = 600
    const val radius = 20
    const val buttonHeight = 48
    const val buttonRadius = 14
}

private val quadInOut = CubicBezierEasing(0.455f, 0.03f, 0.515f, 0.955f)

/** Draws [AppUI.modal] while there is one. */
@Composable
fun AppModalHost() {
    val modal = AppUI.modal ?: return
    key(modal.requestId) { AppModalDialog(modal) }
}

@Composable
private fun AppModalDialog(modal: ModalPresentation) {
    val options = modal.options
    var text by remember { mutableStateOf(options.defaultText) }
    fun close(confirm: Boolean) =
        AppUI.close(modal.requestId, ModalResult(confirm, !confirm, if (options.editable) text else ""))

    val scrim = remember { Animatable(0f) }
    val panel = remember { Animatable(0f) }
    val scale = remember { Animatable(0.96f) }
    LaunchedEffect(modal.open) {
        coroutineScope {
            if (modal.open) {
                launch { scrim.animateTo(1f, tween(160, easing = quadInOut)) }
                launch { panel.animateTo(1f, tween(160, easing = quadInOut)) }
                launch { scale.animateTo(1f, spring(dampingRatio = 1f, stiffness = 300f)) }
            } else {
                launch { scrim.animateTo(0f, tween(150, easing = quadInOut)) }
                launch { panel.animateTo(0f, tween(150, easing = quadInOut)) }
                launch { scale.animateTo(0.98f, tween(150, easing = quadInOut)) }
            }
        }
        if (!modal.open) AppUI.modalClosed(modal.requestId)
    }
    LaunchedEffect(Unit) { AppUI.overlayShown() }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false, dismissOnClickOutside = false,
            usePlatformDefaultWidth = false, decorFitsSystemWindows = false,
        ),
    ) {
        BackHandler { close(false) }
        val view = LocalView.current
        val window = (view.parent as? DialogWindowProvider)?.window
        SideEffect {
            window?.let {
                it.setDimAmount(0f)
                it.setWindowAnimations(0)
                WindowCompat.getInsetsController(it, view).apply {
                    isAppearanceLightStatusBars = true
                    isAppearanceLightNavigationBars = true
                }
            }
        }
        DialogLayout(scrim.value, onBackdrop = { close(false) }) {
            Card(panel.value, scale.value) {
                if (options.title.isNotEmpty()) {
                    Text(
                        options.title, Modifier.fillMaxWidth().padding(top = Tokens.padding.dp).padding(horizontal = Tokens.padding.dp),
                        color = Tokens.text, fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                }
                if (options.content.isNotEmpty() || options.editable) {
                    Column(
                        Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())
                            .padding(horizontal = Tokens.padding.dp)
                            .padding(top = if (options.title.isNotEmpty()) Tokens.gap.dp else Tokens.padding.dp),
                        verticalArrangement = Arrangement.spacedBy(Tokens.bodyGap.dp),
                    ) {
                        if (options.content.isNotEmpty()) {
                            Text(
                                options.content, Modifier.fillMaxWidth(), color = Tokens.muted, fontSize = 15.sp,
                                lineHeight = 22.sp, textAlign = TextAlign.Center,
                            )
                        }
                        if (options.editable) {
                            InputField(text, { text = it }, options.placeholderText, onDone = { close(true) })
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(Tokens.padding.dp), horizontalArrangement = Arrangement.spacedBy(Tokens.gap.dp)) {
                    if (options.showCancel) {
                        ActionButton(options.cancelText, Tokens.secondary, Tokens.onSecondary, Modifier.weight(1f)) { close(false) }
                    }
                    ActionButton(options.confirmText, Tokens.primary, Tokens.onPrimary, Modifier.weight(1f)) { close(true) }
                }
            }
        }
    }
}

/**
 * Centers the card in the whole window and caps its height; only an actual keyboard overlap lifts it. Title and
 * footer stay put while the body scrolls.
 */
@Composable
private fun DialogLayout(scrim: Float, onBackdrop: () -> Unit, card: @Composable () -> Unit) {
    val density = LocalDensity.current
    val safe = WindowInsets.statusBars.union(WindowInsets.navigationBars).union(WindowInsets.displayCutout)
    val margin = with(density) { Tokens.padding.dp.roundToPx() }
    val top = safe.getTop(density) + margin
    val normalBottom = safe.getBottom(density) + margin
    val keyboard = WindowInsets.ime.getBottom(density)
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxSize().graphicsLayer { alpha = scrim }.background(Tokens.scrim)
                .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onBackdrop),
        )
        Layout(modifier = Modifier.fillMaxSize(), content = card) { measurables, constraints ->
            val height = constraints.maxHeight
            val bottom = height - maxOf(normalBottom, keyboard + margin)
            val screenCap = minOf(Tokens.dialogMaxHeight.dp.roundToPx(), height - 2 * maxOf(top, normalBottom)).coerceAtLeast(0)
            val available = minOf(screenCap, (bottom - top).coerceAtLeast(0))
            val width = (constraints.maxWidth - 2 * margin).coerceAtLeast(0)
            val placeable = measurables.single()
                .measure(constraints.copy(minWidth = 0, minHeight = 0, maxWidth = width, maxHeight = available))
            val y = maxOf(top, minOf((height - placeable.height) / 2, bottom - placeable.height))
            layout(constraints.maxWidth, height) { placeable.placeRelative((constraints.maxWidth - placeable.width) / 2, y) }
        }
    }
}

@Composable
private fun Card(alpha: Float, scale: Float, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(Tokens.radius.dp)
    Column(
        Modifier.widthIn(max = Tokens.dialogWidth.dp).fillMaxWidth()
            .graphicsLayer {
                this.alpha = alpha
                scaleX = scale
                scaleY = scale
            }
            .shadow(24.dp, shape, ambientColor = Tokens.shadow, spotColor = Tokens.shadow)
            .clip(shape).background(Tokens.surface).border(1.dp / 2, Tokens.border, shape)
            // Taps on the card must not reach the scrim.
            .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } },
        content = content,
    )
}

@Composable
private fun InputField(value: String, onValueChange: (String) -> Unit, placeholder: String, onDone: () -> Unit) {
    val style = TextStyle(color = Tokens.text, fontSize = 16.sp, lineHeight = 22.sp)
    BasicTextField(
        value, onValueChange, singleLine = true, textStyle = style,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        modifier = Modifier.fillMaxWidth(),
        decorationBox = { field ->
            Box(
                Modifier.fillMaxWidth().heightIn(min = Tokens.buttonHeight.dp).clip(RoundedCornerShape(12.dp))
                    .background(Tokens.field).padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) Text(placeholder, style = style.copy(color = Tokens.placeholder))
                field()
            }
        },
    )
}

@Composable
private fun ActionButton(title: String, fill: Color, textColor: Color, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier.heightIn(min = Tokens.buttonHeight.dp)
            .graphicsLayer {
                alpha = if (pressed) 0.82f else 1f
                if (pressed) {
                    scaleX = 0.97f
                    scaleY = 0.97f
                }
            }
            .clip(RoundedCornerShape(Tokens.buttonRadius.dp)).background(fill)
            .clickable(interaction, indication = null, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(title, color = textColor, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
