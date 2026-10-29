// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/FormControls.kt, only Loading, used by ActionButton).
package io.nativeroutes.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Loading(title: String = "", modifier: Modifier = Modifier) {
    val c = uiColors()
    Row(modifier.heightIn(min = 24.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(UiDesign.space.section.dp)) {
        CircularProgressIndicator(Modifier.size(20.dp), color = c.primary, strokeWidth = 2.dp)
        if (title.isNotEmpty()) Text(title, color = c.muted, fontSize = UiDesign.font.section.sp)
    }
}
