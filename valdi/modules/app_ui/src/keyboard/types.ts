import type { ScrollProps, ViewProps } from 'solid_native/src/jsx';

/**
 * Pixel offset applied to a `KeyboardStickyView` at rest (`closed`) and when fully above the keyboard (`opened`).
 * Defaults to `0` on both ends.
 */
export interface KeyboardStickyOffset {
  closed?: number;
  opened?: number;
}

/**
 * Container whose child views smoothly translate vertically to stay anchored above the software keyboard.
 *
 * Uses native OS frame callbacks (Android `WindowInsetsAnimationCompat` / iOS 120Hz `KeyboardObserver`) so
 * animations run purely on the UI thread without JS layout churn.
 */
export interface KeyboardStickyViewProps extends ViewProps {
  /** Whether keyboard tracking is active. Defaults to `true`. */
  enabled?: boolean;
  /** Additional vertical offset when the keyboard is closed / opened (in dp / pt). */
  offset?: KeyboardStickyOffset;
}

/** Strategy used by {@link KeyboardAvoidingView} to avoid overlapping the keyboard. */
export type KeyboardAvoidingBehavior = 'padding' | 'translate-with-padding' | 'height';

/**
 * Container that adjusts its `paddingBottom`, `height`, or `translationY` based on the remaining distance between
 * its resting bottom edge and the keyboard top edge.
 */
export interface KeyboardAvoidingViewProps extends ViewProps {
  /** How this view avoids the keyboard (`'padding' | 'translate-with-padding' | 'height'`). Defaults to `'padding'`. */
  behavior?: KeyboardAvoidingBehavior;
  /** Whether keyboard avoidance is active. Defaults to `true`. */
  enabled?: boolean;
  /** Additional vertical offset subtracted from keyboard overlap (e.g. `-insets.bottom` for edge-to-edge roots). */
  keyboardVerticalOffset?: number;
}

/**
 * Scroll container that automatically extends its bottom content inset for the software keyboard, scrolls the active
 * focused `<textfield>` / `<textview>` into view, and clamps stale scroll offsets back cleanly when the keyboard closes.
 */
export interface KeyboardAwareScrollViewProps extends ScrollProps {
  /** Whether automatic keyboard scroll avoidance is enabled. Defaults to `true`. */
  enabled?: boolean;
  /** Extra space preserved between the focused input's bottom edge and the keyboard top (dp / pt). Defaults to `16`. */
  bottomOffset?: number;
  /** Extra scrollable runway added at the bottom of the scroll content while the keyboard is open (dp / pt). */
  extraKeyboardSpace?: number;
}
