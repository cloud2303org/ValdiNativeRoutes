import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

export interface ButtonViewModel {
  /** Passed back to onTap, so one handler can serve a group of buttons. */
  id: string;
  title: string;
  secondary?: boolean;
  onTap: (id: string) => void;
}

export class Button extends Component<ButtonViewModel> {
  onRender(): void {
    const { id, title, secondary } = this.viewModel;
    <view key={id} accessibilityId={id} style={secondary ? styles.secondary : styles.primary} onTap={this.handleTap}>
      <label style={secondary ? styles.secondaryLabel : styles.primaryLabel} value={title} />
    </view>;
  }

  private handleTap = () => {
    this.viewModel.onTap(this.viewModel.id);
  };
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
