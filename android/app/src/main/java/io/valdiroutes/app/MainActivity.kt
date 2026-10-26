package io.valdiroutes.app

import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.Dp
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private var navigator by mutableStateOf<Navigator?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ValdiHost.loadRoutes { routes -> navigator = Navigator(routes).apply { open("home") } }
        setContent {
            MaterialTheme {
                navigator?.let { AppRoot(it) }
            }
        }
    }

    override fun onDestroy() {
        navigator?.destroyAll()
        super.onDestroy()
    }
}

@Composable
private fun AppRoot(navigator: Navigator) {
    NavDisplay(
        backStack = navigator.stack,
        onBack = { navigator.back() },
        entryProvider = { entry ->
            NavEntry(entry, contentKey = entry.id) {
                if (entry.definition.kind == "valdi") ValdiScreen(entry, navigator) else NativeScreen(entry, navigator)
            }
        },
    )
    navigator.sheet?.let { SheetLayer(it, navigator) }
}

/**
 * The keyboard height, read once here and applied explicitly by each container. Nothing else avoids the keyboard:
 * the window is edge-to-edge (never resized) and sheets are drawn in the same window instead of a dialog.
 */
@Composable
private fun keyboardHeight(): Dp = with(LocalDensity.current) { WindowInsets.ime.getBottom(this).toDp() }

/** Bottom inset for a page: the keyboard covers the navigation bar, so only the uncovered part remains. */
@Composable
private fun pageInsets(includeTop: Boolean): Insets {
    val density = LocalDensity.current
    val bars = WindowInsets.systemBars.union(WindowInsets.displayCutout)
    val bottom = (bars.getBottom(density) - WindowInsets.ime.getBottom(density)).coerceAtLeast(0)
    val top = if (includeTop) bars.getTop(density) else 0
    return insetsOf(density, top = top, bottom = bottom, horizontal = bars, layoutDirection = LocalLayoutDirection.current)
}

/** Full-screen Valdi page: edge-to-edge, the page pads itself with the insets, the keyboard shrinks it. */
@Composable
private fun ValdiScreen(entry: PageEntry, navigator: Navigator) {
    Box(Modifier.fillMaxSize().background(PageBackground).padding(bottom = keyboardHeight())) {
        ValdiPage(entry, pageInsets(includeTop = true), navigator, Modifier.fillMaxSize())
    }
}

/**
 * A sheet over the stack in the same window (see SheetHostView). The sheet knows nothing about the keyboard; like
 * a full page, its content just gets a bottom padding the size of the keyboard. A fixed-height sheet therefore
 * shrinks its page, while a compact sheet, sized to its content, grows and rides up with the keyboard.
 */
@Composable
private fun SheetLayer(entry: PageEntry, navigator: Navigator) {
    val density = LocalDensity.current
    val keyboard = WindowInsets.ime.getBottom(density)
    val insets = pageInsets(includeTop = false)
    val windowHeight = LocalWindowInfo.current.containerSize.height
    val openHeight = when (entry.presentation) {
        Presentation.CompactSheet ->
            with(density) { (SheetHostView.HANDLE_HEIGHT_DP.dp + 340.dp + insets.bottom.dp).toPx() } + keyboard
        else -> windowHeight * 0.75f
    }
    BackHandler { navigator.cancel(entry.id) }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            SheetHostView(context).apply {
                val rootView = ValdiHost.createPage(context, entry, insets, navigator)
                entry.rootView = rootView
                entry.appliedInsets = insets
                // The keyboard padding goes on this frame, outside the sheet.
                val content = FrameLayout(context).apply { addView(rootView, FrameLayout.LayoutParams(-1, -1)) }
                tag = content
                setContent(content)
                onClosed = { byUser ->
                    // Dragged down or scrim tapped: the page did not finish, so it is cancelled.
                    if (byUser) navigator.cancel(entry.id)
                    navigator.onSheetHidden()
                }
            }
        },
        update = { host ->
            host.openHeight = openHeight
            (host.tag as FrameLayout).setPadding(0, 0, 0, keyboard)
            if (entry.appliedInsets != insets) {
                entry.appliedInsets = insets
                ValdiHost.updateInsets(entry, insets)
            }
            if (navigator.sheetClosing) host.dismiss()
        },
        onRelease = { host ->
            (host.tag as FrameLayout).removeAllViews()
            if (entry.removed) entry.destroy()
        },
    )
}

@Composable
private fun ValdiPage(entry: PageEntry, insets: Insets, navigator: Navigator, modifier: Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            FrameLayout(context).apply {
                val rootView = entry.rootView ?: ValdiHost.createPage(context, entry, insets, navigator).also {
                    entry.rootView = it
                    entry.appliedInsets = insets
                }
                (rootView.parent as? ViewGroup)?.removeView(rootView)
                addView(rootView, FrameLayout.LayoutParams(-1, -1))
            }
        },
        update = {
            if (entry.appliedInsets != insets) {
                entry.appliedInsets = insets
                ValdiHost.updateInsets(entry, insets)
            }
        },
        onRelease = { container ->
            container.removeAllViews()
            // Covered pages keep their root view; popped ones are destroyed once their exit animation ends.
            if (entry.removed) entry.destroy()
        },
    )
}

private val PageBackground = Color(0xFFF3F4F6)

private fun insetsOf(density: Density, top: Int, bottom: Int, horizontal: WindowInsets, layoutDirection: LayoutDirection) = Insets(
    top = top / density.density,
    bottom = bottom / density.density,
    left = horizontal.getLeft(density, layoutDirection) / density.density,
    right = horizontal.getRight(density, layoutDirection) / density.density,
)

private val FRUITS = listOf("苹果", "香蕉", "橙子", "葡萄", "西瓜")

/** A plain Compose page in the same stack, returning a result to the Valdi page that opened it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NativeScreen(entry: PageEntry, navigator: Navigator) {
    Scaffold(topBar = {
        TopAppBar(title = { Text(entry.definition.title) }, navigationIcon = {
            TextButton(onClick = { navigator.cancel(entry.id) }) { Text("返回") }
        })
    }) { padding ->
        LazyColumn(contentPadding = padding) {
            item {
                Text(
                    "Compose 页面，选一项返回给 Valdi 页面",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(16.dp),
                )
            }
            items(FRUITS) { fruit ->
                Text(
                    fruit,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.fillMaxWidth()
                        .clickable { navigator.finish(entry.id, JSONObject().put("value", fruit).toString()) }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                )
                HorizontalDivider()
            }
            item {
                TextButton(
                    onClick = { navigator.open("detail", JSONObject().put("id", 100).put("from", "原生页").toString()) },
                    modifier = Modifier.padding(8.dp),
                ) { Text("从原生页 push Valdi 详情页") }
            }
        }
    }
}
