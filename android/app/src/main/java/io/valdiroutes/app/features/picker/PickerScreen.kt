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
import io.valdiroutes.app_ui.appui.ModalOptions
import io.valdiroutes.app_ui.appui.NativeApp
import io.valdiroutes.app_ui.appui.ToastOptions
import kotlinx.coroutines.launch

/** Example registration is composed by App, independently of the native-page registry. */
object NativeExamples {
    fun registerScreens() {
        NativeScreens.register("picker") { PickerPage(it) }
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
                        .clickable { page.finish(mapOf("value" to fruit)) }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                )
                HorizontalDivider()
            }
            item {
                TextButton(
                    onClick = { page.navigator.open("detail", mapOf("id" to 100.0, "from" to "原生页")) },
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
