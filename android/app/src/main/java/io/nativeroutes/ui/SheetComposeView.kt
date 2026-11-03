package io.nativeroutes.ui

import android.content.Context
import android.view.MotionEvent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.AbstractComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.Velocity
import io.valdiroutes.app.SheetHostView
import io.valdiroutes.app.VerticalDragOwnerAtPoint

/**
 * Native interception runs before Compose's nested-scroll dispatch. A wheel's
 * NestedScrollConnection alone therefore cannot protect it from a ViewGroup.
 * Keep the live coordinates, so native translation/IME movement does not leave
 * a stale hit rectangle. Scroll/list bodies keep their pointer stream but hand
 * leftover deltas to the native panel. Wheels remain exclusive even in pre-scroll.
 */
internal class SheetDragOwners {
    data class Region(val coordinates: LayoutCoordinates, val exclusive: Boolean)
    val regions = mutableMapOf<Any, Region>()
    var exclusiveGesture = false

    fun contains(point: Offset, exclusiveOnly: Boolean = false): Boolean =
        regions.values.any {
            (!exclusiveOnly || it.exclusive) && it.coordinates.isAttached &&
                it.coordinates.boundsInWindow().contains(point)
        }
}

private val LocalSheetDragOwners = staticCompositionLocalOf<SheetDragOwners?> { null }
private val LocalSheetNestedScroll = staticCompositionLocalOf<NestedScrollConnection?> { null }

@Composable
internal fun Modifier.ownsSheetVerticalDrags(exclusive: Boolean = true): Modifier {
    val owners = LocalSheetDragOwners.current ?: return this
    val key = remember { Any() }
    DisposableEffect(owners, key) {
        onDispose { owners.regions.remove(key) }
    }
    return onGloballyPositioned { owners.regions[key] = SheetDragOwners.Region(it, exclusive) }
}

@Composable
internal fun Modifier.sheetNestedScroll(): Modifier {
    val connection = LocalSheetNestedScroll.current ?: return this
    return ownsSheetVerticalDrags(exclusive = false).nestedScroll(connection)
}

/** Pixel deltas/velocities have Compose's sign: positive Y pulls the panel down. */
internal class SheetNestedScrollConnection(
    private val drag: (Float) -> Float,
    private val settle: (Float) -> Boolean,
    private val displaced: () -> Boolean,
    private val exclusive: () -> Boolean,
) : NestedScrollConnection {
    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset =
        if (!exclusive() && source == NestedScrollSource.UserInput && available.y < 0f && displaced())
            Offset(0f, drag(available.y)) else Offset.Zero

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset =
        if (!exclusive() && source == NestedScrollSource.UserInput && available.y > 0f)
            Offset(0f, drag(available.y)) else Offset.Zero

    override suspend fun onPreFling(available: Velocity): Velocity {
        if (exclusive()) return Velocity.Zero
        if (displaced() && settle(available.y)) return Velocity(0f, available.y)
        // Clear a drag that returned to fully expanded without eating the child's fling.
        settle(0f)
        return Velocity.Zero
    }

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity =
        if (!exclusive() && available.y > 0f && settle(available.y))
            Velocity(0f, available.y) else Velocity.Zero
}

internal class SheetComposeView(
    context: Context,
    private val owners: SheetDragOwners,
    private val panel: State<@Composable () -> Unit>,
    private val host: SheetHostView,
) : AbstractComposeView(context), VerticalDragOwnerAtPoint {
    private val connection = SheetNestedScrollConnection(
        drag = host::dragFromNestedScroll,
        settle = { host.finishNestedScroll(it) },
        displaced = { host.nestedScrollDisplaced },
        exclusive = { owners.exclusiveGesture },
    )
    // Scrollable normally dispatches pre-fling on release, even at zero velocity.
    // This fallback handles a removed/disabled scrollable that cannot dispatch it.
    private val settleOnRelease = Runnable { host.finishNestedScroll(0f) }

    init {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
    }

    @Composable
    override fun Content() {
        CompositionLocalProvider(
            LocalSheetDragOwners provides owners,
            LocalSheetNestedScroll provides connection,
        ) { panel.value() }
    }

    private fun windowPoint(x: Float, y: Float): Offset {
        val location = IntArray(2)
        getLocationInWindow(location)
        return Offset(location[0] + x, location[1] + y)
    }

    override fun ownsVerticalDragAt(x: Float, y: Float): Boolean = owners.contains(windowPoint(x, y))

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            removeCallbacks(settleOnRelease)
            owners.exclusiveGesture = owners.contains(windowPoint(event.x, event.y), exclusiveOnly = true)
        }
        val handled = super.dispatchTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_UP -> postOnAnimation(settleOnRelease)
            MotionEvent.ACTION_CANCEL -> {
                removeCallbacks(settleOnRelease)
                host.finishNestedScroll(0f, cancelled = true)
            }
        }
        return handled
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(settleOnRelease)
        host.finishNestedScroll(0f, cancelled = true)
        super.onDetachedFromWindow()
    }
}
