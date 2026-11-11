package io.valdiroutes.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.absolutePadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.valdiroutes.app_ui.appui.ModalOptions
import io.valdiroutes.app_ui.appui.NativeApp
import io.valdiroutes.app_ui.appui.ToastOptions
import io.valdiroutes.app_ui.ui.ActionButton
import io.valdiroutes.app_ui.ui.ActionButtonSize
import io.valdiroutes.app_ui.ui.ActionButtonTone
import io.valdiroutes.app_ui.ui.UiDesign
import io.valdiroutes.app_ui.ui.uiColors
import kotlinx.coroutines.launch

/** Example registration is composed by App, independently of the native-page registry. */
object NativeExamples {
    fun registerScreens() {
        NativeScreens.register("picker") { PickerPage(it) }
    }
}

private val FRUITS = listOf("苹果", "香蕉", "橙子", "葡萄", "西瓜")

/** A plain Compose page in the same stack, returning a result to the Valdi page that opened it. */
@Composable
private fun PickerPage(page: NativePage) {
    val colors = uiColors()
    Column(
        Modifier.fillMaxSize().background(colors.canvas).absolutePadding(
            left = page.insets.left.dp, top = page.insets.top.dp, right = page.insets.right.dp,
        ),
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = UiDesign.size.nav.dp)
                .padding(horizontal = UiDesign.space.sm.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ActionButton("返回", onClick = { page.back() }, tone = ActionButtonTone.Text,
                size = ActionButtonSize.Small)
            Text(page.entry.definition.title, color = colors.text, fontSize = UiDesign.font.nav.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = UiDesign.space.sm.dp))
        }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = page.insets.bottom.dp)) {
            item {
                Text(
                    "Compose 页面，选一项返回给 Valdi 页面",
                    color = colors.muted,
                    fontSize = UiDesign.font.section.sp,
                    modifier = Modifier.padding(UiDesign.space.lg.dp),
                )
            }
            items(FRUITS) { fruit ->
                Text(
                    fruit,
                    color = colors.text,
                    fontSize = UiDesign.font.button.sp,
                    modifier = Modifier.fillMaxWidth()
                        .clickable { page.finish(mapOf("value" to fruit)) }
                        .padding(horizontal = UiDesign.space.lg.dp, vertical = UiDesign.space.md.dp),
                )
                HorizontalDivider(color = colors.border)
            }
            item {
                ActionButton(
                    "从原生页 push Valdi 详情页",
                    onClick = { page.navigator.open("detail", mapOf("id" to 100.0, "from" to "原生页")) },
                    modifier = Modifier.padding(UiDesign.space.sm.dp),
                    tone = ActionButtonTone.Text,
                )
            }
            item {
                ActionButton(
                    "原生调用 switchTab('wheels')",
                    onClick = { page.navigator.switchTab("wheels") },
                    modifier = Modifier.padding(horizontal = UiDesign.space.sm.dp),
                    tone = ActionButtonTone.Text,
                )
            }
            item {
                // Native pages call the same AppUI directly, without going through JS.
                val scope = rememberCoroutineScope()
                ActionButton(
                    "原生调用 showModal",
                    onClick = {
                        scope.launch {
                            val answer = NativeApp.ui.showModal(ModalOptions(title = "原生调用", content = "NativeApp.ui.showModal"))
                            NativeApp.ui.showToast(ToastOptions(if (answer.confirm) "原生页点了确定" else "原生页点了取消", icon = "none"))
                        }
                    },
                    modifier = Modifier.padding(horizontal = UiDesign.space.sm.dp),
                    tone = ActionButtonTone.Text,
                )
            }
        }
    }
}
