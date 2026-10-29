// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/PopupActionButtons.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Cancel / confirm pair shared by sheets and dialogs; mirrors the RN `PopupActionButtons`. */
@Composable
fun PopupActionButtons(onCancel: () -> Unit, onConfirm: () -> Unit, modifier: Modifier = Modifier,
    cancelText: String = "取消", confirmText: String = "确定", confirmDisabled: Boolean = false,
    confirmTone: ConfirmTone = ConfirmTone.Primary, showCancel: Boolean = true,
    cancelIcon: String? = null, confirmIcon: String? = null) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(UiDesign.space.md.dp)) {
        if (showCancel) ActionButton(cancelText, onCancel, Modifier.weight(1f), ActionButtonTone.Cancel, icon = cancelIcon)
        ActionButton(confirmText, onConfirm, Modifier.weight(1f),
            if (confirmTone == ConfirmTone.Danger) ActionButtonTone.Danger else ActionButtonTone.Primary,
            enabled = !confirmDisabled, icon = confirmIcon)
    }
}

/** Title and description typography shared with the RN sheet header and dialog. */
@Composable
internal fun OverlayTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.fillMaxWidth(), color = uiColors().text, fontSize = UiDesign.component.overlay.titleSize.sp, lineHeight = UiDesign.component.overlay.titleLine.sp,
        fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
}

@Composable
internal fun OverlayDescription(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.fillMaxWidth(), color = uiColors().muted, fontSize = UiDesign.font.title.sp, lineHeight = UiDesign.font.valueLine.sp, textAlign = TextAlign.Center)
}

@Composable
internal fun SheetHeader(title: String?, description: String?, showHandle: Boolean = true) {
    Column(Modifier.fillMaxWidth().padding(horizontal = UiDesign.space.content.dp)
        .padding(top = if (showHandle) UiDesign.component.overlay.handleTop.dp else 0.dp, bottom = if (title != null || description != null) UiDesign.space.xl.dp else 0.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        if (showHandle) Box(Modifier.padding(bottom = UiDesign.component.overlay.titleGap.dp).size(UiDesign.component.overlay.handleWidth.dp, UiDesign.component.overlay.handleHeight.dp).clip(RoundedCornerShape(UiDesign.radius.tiny.dp)).background(uiColors().handle))
        title?.let { OverlayTitle(it) }
        description?.let { OverlayDescription(it, Modifier.padding(top = UiDesign.space.sm.dp)) }
    }
}
