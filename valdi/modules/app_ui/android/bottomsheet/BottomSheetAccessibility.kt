package io.valdiroutes.app

import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.Button
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import com.snap.valdi.extensions.ViewUtils

/**
 * Invisible TalkBack / Switch Access target covering the scrim area on modal sheets.
 * Mirrors upstream `@swmansion/react-native-bottom-sheet` v1.0.0 `ScrimDismissView`:
 * never hit-tested by pointers (`NEVER_HIT_VALDI_FUNCTION`), only activated via accessibility click.
 */
internal class ScrimDismissView(context: Context, private val onActivate: () -> Unit) :
    View(context) {

    var label: String = DEFAULT_LABEL
        set(value) {
            val next = value.ifBlank { DEFAULT_LABEL }
            if (field == next) return
            field = next
            contentDescription = next
        }

    init {
        contentDescription = label
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        ViewUtils.getOrCreateGestureRecognizers(this).hitTest = NEVER_HIT_VALDI_FUNCTION
        ViewCompat.setAccessibilityDelegate(
            this,
            object : AccessibilityDelegateCompat() {
                override fun onInitializeAccessibilityNodeInfo(
                    host: View,
                    info: AccessibilityNodeInfoCompat,
                ) {
                    super.onInitializeAccessibilityNodeInfo(host, info)
                    info.className = Button::class.java.name
                    info.isClickable = true
                    info.addAction(AccessibilityNodeInfoCompat.AccessibilityActionCompat.ACTION_CLICK)
                }

                override fun performAccessibilityAction(
                    host: View,
                    action: Int,
                    args: Bundle?,
                ): Boolean {
                    if (action == AccessibilityNodeInfoCompat.ACTION_CLICK) {
                        onActivate()
                        return true
                    }
                    return super.performAccessibilityAction(host, action, args)
                }
            },
        )
    }

    fun setDismissEnabled(enabled: Boolean) {
        importantForAccessibility =
            if (enabled) IMPORTANT_FOR_ACCESSIBILITY_YES else IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    companion object {
        const val DEFAULT_LABEL = "Close sheet"
    }
}

/**
 * Exposes `ACTION_DISMISS` on the sheet container when the sheet is dismissible or has an
 * `onCloseRequest` handler.
 */
internal class SheetDismissAccessibilityDelegate(
    private val canDismiss: () -> Boolean,
    private val onDismiss: () -> Unit,
) : AccessibilityDelegateCompat() {

    override fun onInitializeAccessibilityNodeInfo(
        host: View,
        info: AccessibilityNodeInfoCompat,
    ) {
        super.onInitializeAccessibilityNodeInfo(host, info)
        if (canDismiss()) {
            info.isDismissable = true
            info.addAction(AccessibilityNodeInfoCompat.AccessibilityActionCompat.ACTION_DISMISS)
        }
    }

    override fun performAccessibilityAction(host: View, action: Int, args: Bundle?): Boolean {
        if (action == AccessibilityNodeInfoCompat.ACTION_DISMISS && canDismiss()) {
            onDismiss()
            return true
        }
        return super.performAccessibilityAction(host, action, args)
    }
}
