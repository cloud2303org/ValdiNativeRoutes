package io.valdiroutes.app

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.snap.valdi.ValdiRuntimeManager
import com.snap.valdi.support.SupportValdiRuntimeManager
import com.snap.valdi.views.ValdiRootView
import io.valdiroutes.pages.PageContext
import io.valdiroutes.pages.PageInsets
import io.valdiroutes.pages.PageViewModel
import io.valdiroutes.pages.Routes
import org.json.JSONObject

/** One Valdi runtime for the whole app; every page is a root view inside it. */
object ValdiHost {
    private lateinit var runtimeManager: ValdiRuntimeManager
    private val main = Handler(Looper.getMainLooper())

    fun init(app: Application) {
        // Named after the valdi_exported_library() target.
        System.loadLibrary("valdi_pages")
        runtimeManager = SupportValdiRuntimeManager.createWithSupportLibs(app)
    }

    /** The route table is declared in TS (routes.ts) and read through its @ExportFunction. */
    fun loadRoutes(completion: (RouteTable) -> Unit) {
        runtimeManager.mainRuntime.createScopedJSRuntime("routes") { js ->
            val table = RouteTable.parse(Routes.create(js).invoke())
            main.post { completion(table) }
        }
    }

    fun createPage(context: Context, entry: PageEntry, insets: Insets, navigator: Navigator): ValdiRootView {
        val component = requireNotNull(entry.definition.component) { "${entry.route} is not a Valdi page" }
        val rootView = ValdiRootView(context).apply {
            // The root view is focusable and fills the screen, so outside touch mode (hardware keys, D-pad) the
            // system's focus highlight would grey out the whole page.
            defaultFocusHighlightEnabled = false
        }
        runtimeManager.mainRuntime.inflateViewAsync(
            rootView, component, viewModel(entry, insets), pageContext(entry, navigator), null, null, null,
        )
        return rootView
    }

    fun updateInsets(entry: PageEntry, insets: Insets) {
        entry.rootView?.setViewModelUntyped(viewModel(entry, insets))
    }

    private fun viewModel(entry: PageEntry, insets: Insets) = PageViewModel(
        entry.id, entry.route, entry.paramsJson, entry.presentation.value,
        PageInsets(insets.top.toDouble(), insets.bottom.toDouble(), insets.left.toDouble(), insets.right.toDouble()),
    )

    // TS calls these on the JS thread; navigation state lives on the main thread.
    private fun pageContext(entry: PageEntry, navigator: Navigator) = PageContext(
        { route, params, presentation -> main.post { navigator.open(route, params, Presentation.parse(presentation)) } },
        { route, params, presentation, onResult ->
            main.post { navigator.open(route, params, Presentation.parse(presentation)) { json, canceled -> onResult(json, canceled) } }
        },
        { result -> main.post { navigator.finish(entry.id, result) } },
        { main.post { navigator.cancel(entry.id) } },
    )
}

data class Insets(val top: Float, val bottom: Float, val left: Float, val right: Float)

class RouteDefinition(val kind: String, val title: String, val component: String?)

class RouteTable(private val routes: Map<String, RouteDefinition>) {
    operator fun get(route: String): RouteDefinition = requireNotNull(routes[route]) { "Unknown route: $route" }

    companion object {
        fun parse(json: String): RouteTable {
            val root = JSONObject(json)
            return RouteTable(root.keys().asSequence().associateWith { key ->
                val route = root.getJSONObject(key)
                RouteDefinition(route.getString("kind"), route.getString("title"), route.optString("component").ifEmpty { null })
            })
        }
    }
}
