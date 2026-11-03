import { PageContext, PageViewModel } from './Page';
import { readParams, router } from './navigation';
import { SmokePage } from './SmokePage';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class ResetPage extends SmokePage {
  onRender(): void {
    const { insets } = this.viewModel;
    const { from } = readParams<'reset'>(this.viewModel);
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 8}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header('New reset root', `Reset from ${from}`)}
      {this.button('Reset to home tab shell', () => router.resetToTabs('home'))}
      {this.button('Switch to retained tab shell', () => router.switchTab('second'))}
      {this.button('Push typed detail', this.openDetail)}
      {this.button('Back (root must remain)', () => router.back())}
    </view>;
  }
}
