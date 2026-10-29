// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/ActionButton.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit

enum class ActionButtonTone { Primary, Cancel, Danger, Text }
enum class ActionButtonSize { Small, Medium, Large }
enum class ActionButtonShape { Default, Square, Round }

/** Single wushui control; mirrors the RN `ActionButton`. */
@Composable
fun ActionButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: ActionButtonTone = ActionButtonTone.Primary,
    enabled: Boolean = true,
    textColor: Color? = null,
    loading: Boolean = false,
    icon: String? = null,
    size: ActionButtonSize = ActionButtonSize.Large,
    shape: ActionButtonShape = ActionButtonShape.Default,
) = ActionButtonContent(title, onClick, modifier, tone, enabled, textColor, loading, icon,
    compact = false, size = size, shape = shape)

/** Quiet, compact action shared by illustrated state views. */
@Composable
internal fun StateActionButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier) =
    ActionButtonContent(title, onClick, modifier.widthIn(min = 96.dp), ActionButtonTone.Cancel,
        enabled = true, textColor = null, loading = false, icon = null, compact = true)

@Composable
private fun ActionButtonContent(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier,
    tone: ActionButtonTone,
    enabled: Boolean,
    textColor: Color?,
    loading: Boolean,
    icon: String?,
    compact: Boolean,
    size: ActionButtonSize = ActionButtonSize.Large,
    shape: ActionButtonShape = ActionButtonShape.Default,
) {
    val colors = uiColors()
    // Flat fills without outlines; disabled keeps its tone at reduced opacity.
    val palette = when (tone) {
        ActionButtonTone.Danger -> ButtonPalette(colors.buttonDanger, colors.buttonOnDanger)
        ActionButtonTone.Cancel -> ButtonPalette(colors.buttonSecondary, colors.buttonOnSecondary)
        ActionButtonTone.Text -> ButtonPalette(Color.Transparent, colors.primary)
        ActionButtonTone.Primary -> ButtonPalette(colors.buttonPrimary, colors.buttonOnPrimary)
    }
    val interaction = remember { MutableInteractionSource() }
    val pressed = interaction.collectIsPressedAsState().value && enabled
    val metrics = if (compact) ButtonMetrics(UiDesign.component.state.button.height.dp, UiDesign.component.state.button.fontSize.sp, UiDesign.component.state.button.lineHeight.sp, UiDesign.component.state.button.paddingHorizontal.dp, UiDesign.component.state.button.paddingVertical.dp, UiDesign.component.state.button.iconSize.dp) else when (size) {
        ActionButtonSize.Small -> ButtonMetrics(UiDesign.buttonSize.small.height.dp, UiDesign.buttonSize.small.fontSize.sp, UiDesign.buttonSize.small.lineHeight.sp, UiDesign.buttonSize.small.paddingHorizontal.dp, UiDesign.buttonSize.small.paddingVertical.dp, UiDesign.buttonSize.small.iconSize.dp)
        ActionButtonSize.Medium -> ButtonMetrics(UiDesign.buttonSize.medium.height.dp, UiDesign.buttonSize.medium.fontSize.sp, UiDesign.buttonSize.medium.lineHeight.sp, UiDesign.buttonSize.medium.paddingHorizontal.dp, UiDesign.buttonSize.medium.paddingVertical.dp, UiDesign.buttonSize.medium.iconSize.dp)
        ActionButtonSize.Large -> ButtonMetrics(UiDesign.buttonSize.large.height.dp, UiDesign.buttonSize.large.fontSize.sp, UiDesign.buttonSize.large.lineHeight.sp, UiDesign.buttonSize.large.paddingHorizontal.dp, UiDesign.buttonSize.large.paddingVertical.dp, UiDesign.buttonSize.large.iconSize.dp)
    }
    val cornerShape = when (shape) {
        ActionButtonShape.Default -> RoundedCornerShape(UiDesign.radius.button.dp)
        ActionButtonShape.Square -> RoundedCornerShape(0.dp)
        ActionButtonShape.Round -> RoundedCornerShape(percent = 50)
    }
    Box(
        modifier
            .heightIn(min = metrics.height)
            .graphicsLayer {
                alpha = if (!enabled) UiDesign.motion.disabledOpacity else if (pressed) UiDesign.motion.pressedOpacity else 1f
                if (pressed) { scaleX = UiDesign.motion.pressedScale; scaleY = UiDesign.motion.pressedScale }
            }
            .clip(cornerShape)
            .background(palette.fill)
            .clickable(interaction, indication = null, enabled = enabled && !loading, role = Role.Button, onClick = onClick)
            .padding(horizontal = metrics.horizontalPadding, vertical = metrics.verticalPadding),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(UiDesign.space.sm.dp)) {
            if (loading) {
                if (compact) Loading() else CircularProgressIndicator(Modifier.size(metrics.iconSize),
                    color = textColor ?: palette.text, strokeWidth = 2.dp)
            } else {
                uiIconKind(if (icon?.lowercase() == "plus") "add" else icon)?.let {
                    UiIcon(it, tint = textColor ?: palette.text, modifier = Modifier.size(metrics.iconSize))
                }
            }
            Text(title, color = textColor ?: palette.text, fontSize = metrics.fontSize,
                lineHeight = metrics.lineHeight,
                fontWeight = if (compact) FontWeight.Medium else FontWeight.SemiBold, textAlign = TextAlign.Center)
        }
    }
}

private data class ButtonMetrics(val height: Dp, val fontSize: TextUnit, val lineHeight: TextUnit,
    val horizontalPadding: Dp, val verticalPadding: Dp, val iconSize: Dp)

private data class ButtonPalette(val fill: Color, val text: Color)
