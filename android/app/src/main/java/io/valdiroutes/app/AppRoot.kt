package io.valdiroutes.app

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.BitmapFactory
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCompositionContext
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import io.valdiroutes.app_ui.appui.AppModalHost
import io.valdiroutes.app_ui.appui.AppPresentationHost
import io.valdiroutes.app_ui.appui.AppUI

@Composable
internal fun AppRoot(navigator: Navigator, started: Boolean) {
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
                        else -> NativeScreens.Content(NativePage(entry, navigator, pageInsets()))
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
    val front = navigator.frontPage()
    // showModal and the other presentations belong to the page on top: covering or removing it cancels them.
    val topPage = front?.id?.takeIf { started }
    LaunchedEffect(topPage) { AppUI.topPageChanged(topPage) }
    val visible = listOfNotNull(front)
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
 * The keyboard height, read once here and applied explicitly by the page containers.
 * The edge-to-edge window is never resized, so pages account for the IME themselves.
 */
@Composable
private fun keyboardHeight(): Dp = with(LocalDensity.current) { WindowInsets.ime.getBottom(this).toDp() }

/** Bottom inset for a page: the keyboard covers the navigation bar, so only the uncovered part remains. */
@Composable
private fun pageInsets(): Insets {
    val density = LocalDensity.current
    val bars = WindowInsets.systemBars.union(WindowInsets.displayCutout)
    val bottom = (bars.getBottom(density) - WindowInsets.ime.getBottom(density)).coerceAtLeast(0)
    val top = bars.getTop(density)
    return insetsOf(density, top = top, bottom = bottom, horizontal = bars, layoutDirection = LocalLayoutDirection.current)
}

/** Full-screen Valdi page: edge-to-edge, the page pads itself with the insets, the keyboard shrinks it. */
@Composable
private fun ValdiScreen(entry: PageEntry, navigator: Navigator) {
    Box(Modifier.fillMaxSize().background(PageBackground).padding(bottom = keyboardHeight())) {
        ValdiPage(entry, pageInsets(), navigator, Modifier.fillMaxSize())
    }
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

/**
 * Default bars use the glass bar's measured footprint (including its system bottom inset). A business Valdi bar is a
 * full-viewport overlay; its page receives only system insets, and the component owns its visible height.
 */
@Composable
private fun TabsScreen(shell: PageEntry, navigator: Navigator) {
    val bar = requireNotNull(navigator.tabBar) { "No tab bar" }
    val selected = shell.selectedTab ?: bar.tabs.first().route
    val systemInsets = pageInsets()
    if (bar.mode == "custom") {
        CustomTabsScreen(shell, bar, selected, systemInsets, navigator)
    } else {
        val hazeState = remember(shell.id) { HazeState() }
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = PageBackground,
            // Pages already receive all system insets through PageViewModel/NativePage.
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = { OfficialTabBar(bar, selected, hazeState) { navigator.selectTab(shell, it) } },
        ) { padding ->
            // Scaffold measures the entire bar, including safe padding, before composing the body.
            // Do not apply this padding to the source bounds: native pixels must extend behind the glass.
            val insets = systemInsets.copy(bottom = maxOf(systemInsets.bottom, padding.calculateBottomPadding().value))
            Box(Modifier.fillMaxSize().hazeSource(hazeState)) {
                TabPage(shell, selected, insets, navigator)
            }
        }
    }
}

@Composable
private fun TabPage(shell: PageEntry, selected: String, insets: Insets, navigator: Navigator) {
    Box(Modifier.fillMaxSize().background(PageBackground)) {
        key(selected) {
            val page = navigator.tabPage(shell, selected)
            if (page.definition.kind == "valdi") ValdiPage(page, insets, navigator, Modifier.fillMaxSize())
            else NativeScreens.Content(NativePage(page, navigator, insets))
        }
    }
}

/** The default native bar; the declaration and selected route remain owned by the shell. */
@Composable
private fun OfficialTabBar(bar: TabBar, selected: String, hazeState: HazeState, select: (String) -> Unit) {
    HazeTabBar(bar, selected, hazeState, select) { name, data -> resImage(name, data) }
}

/**
 * Both layers must be native siblings. Separate Compose AndroidViews choose the top pointer target before native
 * dispatch, so returning false from an empty overlay alone cannot offer that touch to the underlying page.
 *
 * Business contract: full-viewport layout ancestors have no gesture recognizers/touch targets; only the visible bar
 * children do. The business root's hitTest gates its own visible region, using its onLayout viewport height and its
 * chosen visual height + safeAreaBottom (false until layout). Android never measures that visual height.
 * The custom root uses Valdi's Android backend and legacy dispatcher, which rejects an empty DOWN.
 * FrameLayout then dispatches to the page ComposeView and preserves that owner for the entire gesture.
 */
@Composable
private fun CustomTabsScreen(shell: PageEntry, bar: TabBar, selected: String, insets: Insets, navigator: Navigator) {
    val composition = rememberCompositionContext()
    val density = LocalDensity.current
    val safeAreaBottom = WindowInsets.systemBars.union(WindowInsets.displayCutout).getBottom(density) /
        density.density.toDouble()
    val pageContent by rememberUpdatedState<@Composable () -> Unit>({ TabPage(shell, selected, insets, navigator) })
    key(shell.id) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                FrameLayout(context).apply {
                    addView(
                        ComposeView(context).apply {
                            setParentCompositionContext(composition)
                            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
                            setContent { pageContent() }
                        },
                        FrameLayout.LayoutParams(-1, -1),
                    )
                    val owner = shell.customTabBar ?: ValdiHost.createTabBar(
                        context, shell, bar, selected, safeAreaBottom, navigator,
                    ).also { shell.customTabBar = it }
                    (owner.rootView.parent as? ViewGroup)?.removeView(owner.rootView)
                    addView(owner.rootView, FrameLayout.LayoutParams(-1, -1))
                }
            },
            update = {
                shell.customTabBar?.let { owner ->
                    ValdiHost.updateTabBar(owner, bar, selected, safeAreaBottom)
                }
            },
            onRelease = { container ->
                (container.getChildAt(0) as ComposeView).disposeComposition()
                container.removeAllViews()
                if (shell.removed) shell.destroy()
            },
        )
    }
}

/**
 * A res/ image of the app_pages module: from the over-the-air package when it has one (ValdiOta.kt), as the Valdi
 * pages load it; otherwise the drawable app_pages_<name> Valdi exports into the APK.
 */
@SuppressLint("DiscouragedApi")
@Composable
private fun resImage(name: String, data: String?): Painter {
    if (data != null) return remember(name, data) {
        val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
        BitmapPainter(BitmapFactory.decodeByteArray(bytes, 0, bytes.size).asImageBitmap())
    }
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
