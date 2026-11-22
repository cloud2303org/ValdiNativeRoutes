import { omit } from 'solid-js';
import { Style } from 'valdi_core/src/Style';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { KeyboardAwareScrollViewProps } from './types';

const innerScrollStyle = new Style<ScrollView>({
  width: '100%',
  height: 0,
  flexGrow: 1,
});

/**
 * Scroll container that keeps focused inputs visible above the keyboard and maintains bottom content insets cleanly
 * on native UI threads without JS bridge frame churn.
 */
export function KeyboardAwareScrollView(props: KeyboardAwareScrollViewProps) {
  const scrollProps = omit(props, 'enabled', 'bottomOffset', 'extraKeyboardSpace', 'style', 'children');
  return (
    <custom-view
      iosClass="VRKeyboardAwareScrollViewHost"
      androidClass="io.valdiroutes.app.KeyboardAwareScrollViewHost"
      limitToViewport={false}
      keyboardEnabled={props.enabled ?? true}
      bottomOffset={props.bottomOffset ?? 16}
      extraKeyboardSpace={props.extraKeyboardSpace ?? 0}
      style={props.style as Style<View> | undefined}
    >
      <scroll {...scrollProps} style={innerScrollStyle}>
        {props.children}
      </scroll>
    </custom-view>
  );
}
