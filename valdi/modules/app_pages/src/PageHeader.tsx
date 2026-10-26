import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';

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
    paddingBottom: 16,
  }),
  back: new Style<View>({
    alignSelf: 'flex-start',
    padding: '8 0',
    marginBottom: 4,
  }),
  backLabel: new Style<Label>({
    color: '#2563eb',
    font: systemFont(16),
  }),
  title: new Style<Label>({
    color: '#111827',
    font: systemBoldFont(26),
  }),
  subtitle: new Style<Label>({
    color: '#6b7280',
    font: systemFont(14),
    marginTop: 4,
  }),
};
