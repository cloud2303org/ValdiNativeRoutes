import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';

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
    <view key={id} style={secondary ? styles.secondary : styles.primary} onTap={this.handleTap}>
      <label style={secondary ? styles.secondaryLabel : styles.primaryLabel} value={title} />
    </view>;
  }

  private handleTap = () => {
    this.viewModel.onTap(this.viewModel.id);
  };
}

const base = new Style<View>({
  height: 46,
  marginBottom: 10,
  borderRadius: 12,
  justifyContent: 'center',
  alignItems: 'center',
});

const labelBase = new Style<Label>({
  font: systemSemiboldFont(16),
});

const styles = {
  primary: base.extend({ backgroundColor: '#2563eb' }),
  secondary: base.extend({ backgroundColor: '#e5e7eb' }),
  primaryLabel: labelBase.extend({ color: 'white' }),
  secondaryLabel: labelBase.extend({ color: '#111827' }),
};
