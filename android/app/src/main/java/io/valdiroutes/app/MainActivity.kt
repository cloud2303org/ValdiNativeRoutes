package io.valdiroutes.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.res.Configuration
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import io.valdiroutes.app.appui.AppModalHost
import io.valdiroutes.app.appui.AppPresentationHost
import io.valdiroutes.app.appui.AppUI

class MainActivity : ComponentActivity() {
    private var navigator by mutableStateOf<Navigator?>(null)
    /** Started: the app is in the foreground for the pages' visibility (Navigator.updateVisibility). */
    private var started by mutableStateOf(false)
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        ValdiHost.permissionHost.onResult(grants)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Transparent bars over the pages; their icons follow Navigator.statusBarStyle (StatusBarIcons in AppRoot).
        val bars = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        super.onCreate(savedInstanceState)
        AppUI.attach(this)
        // PermissionHost.requestMultiple (BLE, Wi-Fi, NFC) prompts through this activity.
        ValdiHost.permissionHost.attach(this, permissionLauncher)
        // The first page is startApp's (app.ts): JS decides it, once, at startup.
        ValdiHost.start { routes ->
            navigator = Navigator(routes).apply { open(routes.root) }.also { ValdiHost.navigator = it }
        }
        setContent {
            MaterialTheme {
                navigator?.let { AppRoot(it, started) }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        started = true
    }

    override fun onStop() {
        started = false
        super.onStop()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ValdiHost.notifyDarkMode(newConfig)
    }

    override fun onDestroy() {
        AppUI.detach(this)
        ValdiHost.permissionHost.detach(this)
        navigator?.let {
            if (ValdiHost.navigator === it) ValdiHost.navigator = null
            it.destroyAll()
        }
        super.onDestroy()
    }
}

@Composable
private fun AppRoot(navigator: Navigator, started: Boolean) {
    // Each page carries its own transition (NativeRouteAnimations); 'default' falls back to Nav3's. As in
    // ExpoNativeRoutes, every NavEntry is remembered: one rebuilt when the stack pops retargets the transition, and the
    // outgoing page's content was released and recreated empty, so it vanished instead of sliding out.
    val entries = navigator.stack.map { entry ->
        key(entry.id) {
            remember(entry) {
                NavEntry(entry, contentKey = entry.id, metadata = NativeRouteAnimations.metadata(entry.navigation)) {
                    when (entry.definition.kind) {
                        "valdi" -> ValdiScreen(entry, navigator)
                        "tabs" -> TabsScreen(entry, navigator)
                        else -> NativeScreens.Content(NativePage(entry, navigator, pageInsets(includeTop = true)))
                    }
                }
            }
        }
    }
    val decoratedEntries = rememberDecoratedNavEntries(
        entries = entries,
        entryDecorators = listOf(rememberSaveableStateHolderNavEntryDecorator()),
    )
    NavDisplay(entries = decoratedEntries, onBack = { navigator.back() })
    navigator.sheet?.let { SheetLayer(it, navigator) }
    // showModal and the other presentations belong to the page on top: covering or removing it cancels them.
    val topPage = navigator.sheet?.id ?: navigator.stack.lastOrNull()?.id
    LaunchedEffect(topPage) { AppUI.topPageChanged(topPage) }
    // The page under a sheet stays on screen; a closing sheet stays until it is removed, so it is never "hidden".
    val front = navigator.frontPage()
    val visible = listOfNotNull(front, navigator.sheet)
    LaunchedEffect(visible, started) { navigator.updateVisibility(visible, started) }
    StatusBarIcons(navigator.statusBarStyle)
    AppModalHost()
    AppPresentationHost()
}

/**
 * The system bars' icons (StatusBarStyle in PageComponent.ts): 'light' icons for a dark page, 'dark' ones
 * for a light page, 'auto' after the theme. The navigation bar's go with them, over the same page.
 */
@Composable
private fun StatusBarIcons(style: String) {
    val dark = isSystemInDarkTheme()
    val view = LocalView.current
    LaunchedEffect(style, dark) {
        val lightIcons = if (style == "auto") dark else style == "light"
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !lightIcons
            isAppearanceLightNavigationBars = !lightIcons
        }
    }
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

private val TabBarHeight = 56.dp
private val TabSelected = Color(0xFF2563EB)
private val TabUnselected = Color(0xFF6B7280)

/** Frosted: the page blurred under a light tint; below Android 12 (no RenderEffect) only the tint. */
private val TabBarStyle = HazeStyle(
    backgroundColor = PageBackground,
    tint = HazeTint(Color.White.copy(alpha = 0.6f)),
    blurRadius = 24.dp,
    fallbackTint = HazeTint(Color.White.copy(alpha = 0.92f)),
)

/**
 * The tab shell (TAB_BAR in routes.ts): the selected tab's page fills the screen and the bar is drawn over its bottom,
 * blurring what scrolls under it. A tab's page is created when first selected and kept, like a covered page; its
 * bottom inset includes the bar.
 */
@Composable
private fun TabsScreen(shell: PageEntry, navigator: Navigator) {
    val bar = requireNotNull(navigator.tabBar) { "No tab bar" }
    val selected = shell.selectedTab ?: bar.tabs.first().tab
    val haze = rememberHazeState()
    val insets = pageInsets(includeTop = true).let { it.copy(bottom = it.bottom + TabBarHeight.value) }
    Box(Modifier.fillMaxSize().background(PageBackground)) {
        Box(Modifier.fillMaxSize().hazeSource(haze)) {
            key(selected) {
                val page = navigator.tabPage(shell, selected)
                if (page.definition.kind == "valdi") ValdiPage(page, insets, navigator, Modifier.fillMaxSize())
                else NativeScreens.Content(NativePage(page, navigator, insets))
            }
        }
        TabBar(bar, selected, { shell.selectedTab = it }, Modifier.align(Alignment.BottomCenter).hazeEffect(haze, TabBarStyle))
    }
}

/** Items spread evenly, each an icon over its text; the selected one shows its selected icon. */
@Composable
private fun TabBar(bar: TabBar, selected: String, select: (String) -> Unit, modifier: Modifier) {
    Column(modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Color(0x1F000000)))
        Row(Modifier.fillMaxWidth().height(TabBarHeight)) {
            bar.tabs.forEach { tab ->
                val active = tab.tab == selected
                Column(
                    Modifier.weight(1f).fillMaxHeight().selectable(
                        selected = active, role = Role.Tab, interactionSource = remember { MutableInteractionSource() },
                        indication = null, onClick = { select(tab.tab) },
                    ),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Image(resImage(if (active) tab.selectedIcon ?: tab.icon else tab.icon), null, Modifier.size(24.dp))
                    Text(tab.text, color = if (active) TabSelected else TabUnselected, fontSize = 11.sp,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
        Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
    }
}

/**
 * A res/ image of the app_pages module: from the over-the-air package when it has one (ValdiOta.kt), as the Valdi
 * pages load it; otherwise the drawable app_pages_<name> Valdi exports into the APK.
 */
@SuppressLint("DiscouragedApi")
@Composable
private fun resImage(name: String): Painter {
    val file = remember(name) { ValdiOta.image("app_pages", name) }
    if (file != null) return remember(file) { BitmapPainter(BitmapFactory.decodeFile(file.path).asImageBitmap()) }
    val context = LocalContext.current
    val id = remember(name) {
        context.resources.getIdentifier("app_pages_$name", "drawable", context.packageName).also {
            require(it != 0) { "No drawable app_pages_$name" }
        }
    }
    return painterResource(id)
}
