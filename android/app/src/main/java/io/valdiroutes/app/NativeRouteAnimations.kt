package io.valdiroutes.app

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.navigation3.scene.Scene
import androidx.navigation3.ui.NavDisplay
import io.valdiroutes.pages.ResolvedNavigation

/**
 * ExpoNativeRoutes' NativeRouteAnimations: named presets run by Nav3 on push, pop and predictive pop. 'default'
 * leaves the transition to Nav3; a duration of 0 is 'none'. Register more presets at startup, before any page opens
 * with them, and add their names to routes.ts ANDROID_ANIMATIONS.
 */
object NativeRouteAnimations {
    /** routes.ts NAVIGATION on Android, for pages opened natively. */
    val Default = ResolvedNavigation("slideRight", 300.0, "push")

    private val presets = mutableMapOf<String, AnimatedContentTransitionScope<Scene<*>>.(Int, Boolean) -> ContentTransform?>()

    init {
        presets["default"] = { _, _ -> null }
        presets["none"] = { _, _ -> EnterTransition.None togetherWith ExitTransition.None }
        presets["slideRight"] = { ms, back ->
            slideInHorizontally(tween(ms), initialOffsetX = { if (back) -it / 3 else it }) togetherWith
                slideOutHorizontally(tween(ms), targetOffsetX = { if (back) it else -it / 3 })
        }
        presets["slideUp"] = { ms, back ->
            if (back) EnterTransition.None togetherWith slideOutVertically(tween(ms), targetOffsetY = { it })
            else slideInVertically(tween(ms), initialOffsetY = { it }) togetherWith ExitTransition.KeepUntilTransitionsFinished
        }
        presets["fade"] = { ms, _ -> fadeIn(tween(ms)) togetherWith fadeOut(tween(ms)) }
        presets["zoom"] = { ms, back ->
            (fadeIn(tween(ms)) + scaleIn(tween(ms), initialScale = if (back) 1.05f else .9f)) togetherWith
                (fadeOut(tween(ms)) + scaleOut(tween(ms), targetScale = if (back) .9f else 1.05f))
        }
    }

    fun register(name: String, factory: AnimatedContentTransitionScope<Scene<*>>.(durationMs: Int, isPop: Boolean) -> ContentTransform?) {
        require(name.matches(Regex("[A-Za-z][A-Za-z0-9_-]*")) && name !in presets) { "Duplicate or invalid animation: $name" }
        presets[name] = factory
    }

    /** routes.ts already rejected unknown names; one registered only natively and never added there falls back. */
    fun validated(options: ResolvedNavigation): ResolvedNavigation {
        require(options.durationMs in 0.0..2000.0 && options.durationMs % 1.0 == 0.0) {
            "durationMs must be an integer from 0 to 2000"
        }
        return if (options.animation in presets) options else Default
    }

    private fun AnimatedContentTransitionScope<Scene<*>>.transform(options: ResolvedNavigation, back: Boolean): ContentTransform? =
        if (options.durationMs == 0.0) presets.getValue("none")(this, 0, back)
        else presets.getValue(options.animation)(this, options.durationMs.toInt(), back)

    /** NavEntry metadata: a page enters and leaves (also by predictive back) with its own options. */
    fun metadata(options: ResolvedNavigation): Map<String, Any> =
        NavDisplay.transitionSpec { transform(options, false) } +
            NavDisplay.popTransitionSpec { transform(options, true) } +
            NavDisplay.predictivePopTransitionSpec { _ -> transform(options, true) }
}
