package io.valdiroutes.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/**
 * Native controls over a source-backed Haze surface, without Material3's pill indicator.
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
    // Match the original repository tab bar: blue labels, white glass, and no pressed effect.
    val safeInsets = WindowInsets.systemBars.union(WindowInsets.displayCutout)
        .only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)
    Column(
        Modifier
            .fillMaxWidth()
            .hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = Color(0xFFF3F4F6),
                    tint = HazeTint(Color.White.copy(alpha = 0.6f)),
                    blurRadius = 24.dp,
                    // Haze 1.x uses a scrim below API 31; do not pretend those devices blur.
                    fallbackTint = HazeTint(Color.White.copy(alpha = 0.92f)),
                ),
            )
            // Inside the effect and measured by Scaffold exactly once, including gesture navigation.
            .windowInsetsPadding(safeInsets)
            .selectableGroup(),
    ) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Color(0x1F000000)))
        Row(Modifier.fillMaxWidth().height(56.dp)) {
            bar.tabs.forEach { tab ->
                val active = tab.route == selected
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .selectable(
                            selected = active,
                            role = Role.Tab,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = { select(tab.route) },
                        ),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Image(
                        painter = image(
                            if (active) tab.selectedIcon else tab.icon,
                            if (active) tab.selectedIconData ?: tab.iconData else tab.iconData,
                        ),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                    )
                    Text(
                        text = tab.text,
                        color = if (active) Color(0xFF2563EB) else Color(0xFF6B7280),
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp),
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
