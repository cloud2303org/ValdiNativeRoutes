import { omit } from 'solid-js';
import type { CustomViewProps } from 'solid_native/src/jsx';
import type { KeyboardAvoidingViewProps } from './types';

/**
 * Avoids the software keyboard by adjusting container `paddingBottom`, `height`, or `translationY` natively.
 */
export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps) {
  const viewProps = omit(props, 'enabled', 'behavior', 'keyboardVerticalOffset', 'children');
  return (
    <custom-view
      {...(viewProps as CustomViewProps)}
      iosClass="VRKeyboardAvoidingView"
      androidClass="io.valdiroutes.app.KeyboardAvoidingView"
      limitToViewport={props.limitToViewport ?? false}
      keyboardEnabled={props.enabled ?? true}
      keyboardBehavior={props.behavior ?? 'padding'}
      keyboardVerticalOffset={props.keyboardVerticalOffset ?? 0}
    >
      {props.children}
    </custom-view>
  );
}
