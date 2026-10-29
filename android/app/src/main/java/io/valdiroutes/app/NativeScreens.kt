package io.valdiroutes.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.valdiroutes.app.appui.ModalOptions
import io.valdiroutes.app.appui.NativeApp
import io.valdiroutes.app.appui.ToastOptions
import kotlinx.coroutines.launch
import org.json.JSONObject

/** What a native page gets: its params, and the navigator it shares with the Valdi pages. */
class NativePage(val entry: PageEntry, val navigator: Navigator, val insets: Insets) {
    val params = JSONObject(entry.paramsJson.ifEmpty { "{}" })

    /** Closes this page and delivers the result to whoever opened it with pushForResult. */
    fun finish(result: JSONObject) = navigator.finish(entry.id, result.toString())

    fun back() = navigator.cancel(entry.id)

    /** As Page.setStatusBarStyle: 'auto', 'light' or 'dark'; reset to 'auto' each time the page comes back. */
    fun setStatusBarStyle(style: String) {
        require(style in listOf("auto", "light", "dark")) { "Bad status bar style: $style" }
        navigator.statusBarStyle = style
    }
}

/**
 * The native pages, by route: the routes with kind 'native' in routes.ts. Registered at startup (App), before the
 * first page opens; a native route without a registration fails when it opens.
 */
object NativeScreens {
    private val screens = mutableMapOf<String, @Composable (NativePage) -> Unit>()

    fun register(route: String, content: @Composable (NativePage) -> Unit) {
        require(route !in screens) { "Duplicate native screen: $route" }
        screens[route] = content
    }

    @Composable
    fun Content(page: NativePage) {
        requireNotNull(screens[page.entry.route]) { "No native screen registered for ${page.entry.route}" }(page)
    }

    fun registerDefaults() {
        register("picker") { PickerPage(it) }
    }
}

private val FRUITS = listOf("苹果", "香蕉", "橙子", "葡萄", "西瓜")

/** A plain Compose page in the same stack, returning a result to the Valdi page that opened it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickerPage(page: NativePage) {
    Scaffold(topBar = {
        TopAppBar(title = { Text(page.entry.definition.title) }, navigationIcon = {
            TextButton(onClick = { page.back() }) { Text("返回") }
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
                        .clickable { page.finish(JSONObject().put("value", fruit)) }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                )
                HorizontalDivider()
            }
            item {
                TextButton(
                    onClick = { page.navigator.open("detail", JSONObject().put("id", 100).put("from", "原生页").toString()) },
                    modifier = Modifier.padding(8.dp),
                ) { Text("从原生页 push Valdi 详情页") }
            }
            item {
                TextButton(
                    onClick = { page.navigator.switchTab("wheels") },
                    modifier = Modifier.padding(horizontal = 8.dp),
                ) { Text("原生调用 switchTab('wheels')") }
            }
            item {
                // Native pages call the same AppUI directly, without going through JS.
                val scope = rememberCoroutineScope()
                TextButton(
                    onClick = {
                        scope.launch {
                            val answer = NativeApp.ui.showModal(ModalOptions(title = "原生调用", content = "NativeApp.ui.showModal"))
                            NativeApp.ui.showToast(ToastOptions(if (answer.confirm) "原生页点了确定" else "原生页点了取消", icon = "none"))
                        }
                    },
                    modifier = Modifier.padding(horizontal = 8.dp),
                ) { Text("原生调用 showModal") }
            }
        }
    }
}
