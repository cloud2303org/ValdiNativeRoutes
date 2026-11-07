import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

export interface PageHeaderViewModel {
  title: string;
  subtitle?: string;
  /** Without onBack the header has no back button, e.g. on the root page. */
  onBack?: () => void;
}

/** Valdi pages draw their own header; the host shows no app bar for them. */
export class PageHeader extends Component<PageHeaderViewModel> {
  onRender(): void {
    const { title, subtitle, onBack } = this.viewModel;
    <view style={styles.header}>
      {onBack && (
        <view key="back" style={styles.back} onTap={onBack}>
          <label style={styles.backLabel} value="‹ 返回" />
        </view>
      )}
      <label style={styles.title} value={title} />
      {subtitle && <label style={styles.subtitle} value={subtitle} numberOfLines={0} />}
    </view>;
  }
}

const styles = {
  header: new Style<View>({
    paddingBottom: tokens.space.lg,
  }),
  back: new Style<View>({
    alignSelf: 'flex-start',
    padding: `${tokens.space.sm} 0`,
    marginBottom: tokens.space.xs,
  }),
  backLabel: new Style<Label>({
    color: color.primary,
    font: systemFont(tokens.font.button),
  }),
  title: new Style<Label>({
    color: color.ink,
    font: systemBoldFont(tokens.font.heading),
  }),
  subtitle: new Style<Label>({
    color: color.muted,
    font: systemFont(tokens.font.section + 1),
    marginTop: tokens.space.xs,
  }),
};
