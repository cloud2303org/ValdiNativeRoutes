import { omit } from 'solid-js';
import type { CustomViewProps } from 'solid_native/src/jsx';
import type { KeyboardStickyViewProps } from './types';

/**
 * Translates its children vertically to sit directly above the software keyboard using native UI-thread tracking.
 */
export function KeyboardStickyView(props: KeyboardStickyViewProps) {
  const viewProps = omit(props, 'enabled', 'offset', 'children');
  return (
    <custom-view
      {...(viewProps as CustomViewProps)}
      iosClass="VRKeyboardStickyView"
      androidClass="io.valdiroutes.app.KeyboardStickyView"
      limitToViewport={props.limitToViewport ?? false}
      keyboardEnabled={props.enabled ?? true}
      offsetClosed={props.offset?.closed ?? 0}
      offsetOpened={props.offset?.opened ?? 0}
    >
      {props.children}
    </custom-view>
  );
}
