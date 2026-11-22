import CoreGraphics
import Foundation

/// Pure layout and animation math mirroring Android's `KeyboardMath.kt`.
enum VRKeyboardMath {
    static func stickyTranslationY(
        keyboardHeight: CGFloat,
        progress: CGFloat,
        closedOffset: CGFloat,
        openedOffset: CGFloat,
        enabled: Bool
    ) -> CGFloat {
        guard enabled else { return 0 }
        guard keyboardHeight > 0 else { return closedOffset }
        let clampedProgress = min(max(progress, 0), 1)
        let interpolated = closedOffset + (openedOffset - closedOffset) * clampedProgress
        let raw = -keyboardHeight + interpolated
        return openedOffset >= closedOffset ? min(closedOffset, raw) : raw
    }

    static func avoidingOverlap(
        restingBottomInWindow: CGFloat,
        viewHeight: CGFloat,
        windowHeight: CGFloat,
        keyboardHeight: CGFloat,
        keyboardVerticalOffset: CGFloat,
        enabled: Bool
    ) -> CGFloat {
        guard enabled, keyboardHeight > 0, viewHeight > 0, windowHeight > 0 else { return 0 }
        let keyboardTop = windowHeight - keyboardHeight
        let raw = restingBottomInWindow - keyboardTop + keyboardVerticalOffset
        return min(max(raw, 0), viewHeight)
    }

    static func awareScrollBottomInset(
        scrollBottomInWindow: CGFloat,
        windowHeight: CGFloat,
        keyboardHeight: CGFloat,
        progress: CGFloat,
        extraKeyboardSpace: CGFloat,
        enabled: Bool
    ) -> CGFloat {
        guard enabled, keyboardHeight > 0, windowHeight > 0 else { return 0 }
        let keyboardTop = windowHeight - keyboardHeight
        let overlap = max(scrollBottomInWindow - keyboardTop, 0)
        let extra = max(extraKeyboardSpace, 0) * min(max(progress, 0), 1)
        return max(overlap + extra, 0)
    }

    static func awareScrollTargetOffsetY(
        scrollTopInWindow: CGFloat,
        scrollHeight: CGFloat,
        windowHeight: CGFloat,
        keyboardHeight: CGFloat,
        bottomOffset: CGFloat,
        topMargin: CGFloat,
        focusedTopInWindow: CGFloat,
        focusedBottomInWindow: CGFloat,
        currentOffsetY: CGFloat,
        contentHeight: CGFloat,
        bottomInset: CGFloat
    ) -> CGFloat {
        let clampedScrollH = max(scrollHeight, 0)
        let maxOffset = max(contentHeight - clampedScrollH + max(bottomInset, 0), 0)
        guard keyboardHeight > 0, clampedScrollH > 0, windowHeight > 0 else {
            return min(max(currentOffsetY, 0), maxOffset)
        }
        let keyboardTop = windowHeight - keyboardHeight
        let visibleBottom = min(scrollTopInWindow + clampedScrollH, keyboardTop) - bottomOffset
        let overlapBottom = focusedBottomInWindow - visibleBottom
        let overlapTop = (scrollTopInWindow + topMargin) - focusedTopInWindow
        if overlapBottom > 0 {
            return min(max(currentOffsetY + overlapBottom, 0), maxOffset)
        }
        if overlapTop > 0 {
            return min(max(currentOffsetY - overlapTop, 0), maxOffset)
        }
        return min(max(currentOffsetY, 0), maxOffset)
    }
}
