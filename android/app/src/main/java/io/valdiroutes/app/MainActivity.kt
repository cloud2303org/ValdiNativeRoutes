package io.valdiroutes.app

import android.content.res.Configuration
import android.os.Bundle
import android.widget.TextView
import android.view.Gravity
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.SideEffect
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.app_ui.appui.AppUI

class MainActivity : ComponentActivity() {
    private var navigator by mutableStateOf<Navigator?>(null)
    /** Started: the app is in the foreground for the pages' visibility (Navigator.updateVisibility). */
    private var started by mutableStateOf(false)
    private var videoFullscreen by mutableStateOf(false)
    private var initialContentSplash: InitialContentSplashGate? = null
    private var cancelStartup: (() -> Unit)? = null
    private var startupFailed = false
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        ValdiHost.permissionHost.onResult(grants)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        StartupTrace.section("activity.onCreate") {
            installSplashScreen().setOnExitAnimationListener { splash ->
                splash.remove()
            }
            // Transparent bars over the pages; their icons follow Navigator.statusBarStyle (StatusBarIcons in AppRoot).
            val bars = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
            StartupTrace.section("activity.enableEdgeToEdge") {
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            }
            StartupTrace.section("activity.super.onCreate") { super.onCreate(savedInstanceState) }
            val content = findViewById<android.view.View>(android.R.id.content)
            initialContentSplash = StartupSplashScreen.attach(content, ::initialContentRoots, ::showStartupError)
            StartupTrace.section("activity.hosts.attach") {
                ValdiHost.videoHost.attach(this) { videoFullscreen = it }
                AppUI.attach(this)
                // PermissionHost.requestMultiple (BLE, Wi-Fi, NFC) prompts through this activity.
                ValdiHost.permissionHost.attach(this, permissionLauncher)
            }
            // The first page is startApp's (app.ts): JS decides it, once, at startup.
            cancelStartup = ValdiHost.start(onFailure = { initialContentSplash?.fail(it) }) { routes ->
                if (isDestroyed || isFinishing) return@start
                StartupTrace.section("activity.routes_ready.open_root") {
                    navigator = Navigator(routes).apply { open(routes.root) }.also { ValdiHost.navigator = it }
                }
            }
            // This measures only the setContent call, not composition, root inflation, or content displayed.
            StartupTrace.section("activity.setContent.call") {
                if (!startupFailed) setContent {
                    MaterialTheme {
                        navigator?.let {
                            AppRoot(it, started)
                            SideEffect { initialContentSplash?.onContentComposed() }
                        }
                        // Registered after navigation handlers: fullscreen back exits video presentation first.
                        BackHandler(enabled = videoFullscreen) { ValdiHost.videoHost.exitFullscreenFromBack() }
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        started = true
    }

    override fun onResume() {
        super.onResume()
        ValdiHost.videoHost.onResume(this)
    }

    override fun onPause() {
        ValdiHost.videoHost.onPause(this)
        super.onPause()
    }

    override fun onStop() {
        started = false
        ValdiHost.videoHost.onStop(this)
        super.onStop()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        ValdiHost.videoHost.onPictureInPictureModeChanged(this, isInPictureInPictureMode)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ValdiHost.notifyDarkMode(newConfig)
    }

    override fun onDestroy() {
        cancelStartup?.invoke()
        cancelStartup = null
        initialContentSplash?.dispose()
        initialContentSplash = null
        ValdiHost.videoHost.detach(this)
        AppUI.detach(this)
        ValdiHost.permissionHost.detach(this)
        navigator?.let {
            if (ValdiHost.navigator === it) ValdiHost.navigator = null
            it.destroyAll()
        }
        super.onDestroy()
    }

    private fun initialContentRoots(): List<ValdiRootView>? {
        val current = navigator ?: return null
        val page = current.frontPage() ?: return null
        val roots = mutableListOf<ValdiRootView>()
        if (page.definition.kind == "valdi") roots.add(page.rootView ?: return null)
        val shell = current.stack.lastOrNull()
        if (shell?.definition?.kind == "tabs" && current.tabBar?.mode == "custom") {
            roots.add(shell.customTabBar?.rootView ?: return null)
        }
        return roots
    }

    private fun showStartupError(error: Exception) {
        if (isDestroyed || isFinishing) return
        startupFailed = true
        Log.e("ValdiStartup", "Initial content failed: ${error.javaClass.simpleName}")
        setContentView(TextView(this).apply {
            text = "启动失败，请关闭后重新打开应用"
            gravity = Gravity.CENTER
            setBackgroundColor(getColor(R.color.page_background))
        })
    }
}
