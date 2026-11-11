package io.valdiroutes.app

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import io.valdiroutes.app_ui.ui.UiDesign
import io.valdiroutes.app_ui.ui.uiColors

/**
 * A quiet frosted dock with native tab controls and the application's shared theme tokens.
 * Source and effect live in the same Compose owner. Haze records the page's AndroidView drawing
 * into its GraphicsLayer; a separate SurfaceView (camera/video) is outside that capture path.
 */
@Composable
internal fun HazeTabBar(
    bar: TabBar,
    selected: String,
    hazeState: HazeState,
    select: (String) -> Unit,
    image: @Composable (String, String?) -> Painter,
) {
    val colors = uiColors()
    val dark = isSystemInDarkTheme()
    val dockShape = RoundedCornerShape(UiDesign.radius.card.dp)
    val itemShape = RoundedCornerShape(UiDesign.radius.control.dp)
    val input = remember(hazeState) { HazeInput.Sources(hazeState) }
    val dockStyle = remember(colors, dark) {
        HazeBlurStyle {
            blurRadius(20.dp)
            noiseFactor(0.02f)
            backgroundColor(colors.canvas)
            colorEffects(listOf(HazeColorEffect.tint(colors.surface.copy(alpha = if (dark) 0.82f else 0.78f))))
            fallbackColorEffect(HazeColorEffect.tint(colors.surface.copy(alpha = 0.96f)))
        }
    }
    val safeInsets = WindowInsets.systemBars.union(WindowInsets.displayCutout)
        .only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)
    Box(
        Modifier
            .fillMaxWidth()
            // Scaffold measures the dock, its floating gap, and safe area together.
            .windowInsetsPadding(safeInsets)
            .padding(horizontal = UiDesign.space.lg.dp, vertical = UiDesign.space.sm.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .shadow(
                    elevation = 2.dp,
                    shape = dockShape,
                    ambientColor = colors.dialogShadow,
                    spotColor = colors.dialogShadow,
                )
                .clip(dockShape)
                .hazeBlur(input = input, style = dockStyle)
                .border(0.5.dp, colors.border.copy(alpha = 0.6f), dockShape)
                .padding(UiDesign.space.xs.dp)
                .selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(UiDesign.space.xs.dp),
        ) {
            bar.tabs.forEach { tab ->
                key(tab.route) {
                    val active = tab.route == selected
                    val interaction = remember { MutableInteractionSource() }
                    val pressed by interaction.collectIsPressedAsState()
                    val fill by animateColorAsState(
                        targetValue = when {
                            pressed -> colors.pressed
                            active -> colors.iconWell
                            else -> Color.Transparent
                        },
                        animationSpec = tween(140),
                        label = "tab.fill",
                    )
                    val foreground by animateColorAsState(
                        targetValue = if (active) colors.primary else colors.muted,
                        animationSpec = tween(140),
                        label = "tab.foreground",
                    )
                    Column(
                        Modifier
                            .weight(1f)
                            // Let the dock grow with large text instead of clipping the labels.
                            .heightIn(min = 56.dp)
                            .clip(itemShape)
                            .background(fill)
                            .selectable(
                                selected = active,
                                role = Role.Tab,
                                interactionSource = interaction,
                                indication = null,
                                onClick = { select(tab.route) },
                            )
                            .padding(horizontal = UiDesign.space.xs.dp, vertical = UiDesign.space.tight.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Image(
                            painter = image(
                                if (active) tab.selectedIcon else tab.icon,
                                if (active) tab.selectedIconData ?: tab.iconData else tab.iconData,
                            ),
                            contentDescription = null,
                            colorFilter = ColorFilter.tint(foreground),
                            modifier = Modifier.size(24.dp),
                        )
                        Text(
                            text = tab.text,
                            color = foreground,
                            fontSize = UiDesign.font.body.sp,
                            lineHeight = 16.sp,
                            modifier = Modifier.padding(top = UiDesign.space.xs.dp),
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
