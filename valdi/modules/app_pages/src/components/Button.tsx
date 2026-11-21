import { Style } from 'valdi_core/src/Style';
import { systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

export interface ButtonProps {
  id: string;
  title: string;
  secondary?: boolean;
  onTap: (id: string) => void;
}

export function Button(props: ButtonProps) {
  return (
    <view
      accessibilityId={props.id}
      style={props.secondary ? styles.secondary : styles.primary}
      onTap={() => props.onTap(props.id)}
    >
      <label style={props.secondary ? styles.secondaryLabel : styles.primaryLabel} value={props.title} />
    </view>
  );
}

const base = new Style<View>({
  height: tokens.size.button - 2,
  marginBottom: tokens.space.sm + 2,
  borderRadius: tokens.radius.control,
  justifyContent: 'center',
  alignItems: 'center',
});

const labelBase = new Style<Label>({
  font: systemSemiboldFont(tokens.font.button),
});

const styles = {
  primary: base.extend({ backgroundColor: color.buttonPrimary }),
  secondary: base.extend({ backgroundColor: color.buttonSecondary }),
  primaryLabel: labelBase.extend({ color: color.buttonOnPrimary }),
  secondaryLabel: labelBase.extend({ color: color.buttonOnSecondary }),
};
