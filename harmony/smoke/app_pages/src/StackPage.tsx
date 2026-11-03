import { PageContext, PageViewModel } from './Page';
import { router } from './navigation';
import { SmokePage } from './SmokePage';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class StackPage extends SmokePage {
  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f1eefb"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 8}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header('Stack actions')}
      {this.button('Replace top with detail #42', () => router.replace('detail', { id: 42, from: 'replace' }))}
      {this.button('Back two pages', () => router.back(2))}
      {this.button('Pop to root', () => router.popToRoot())}
      {this.button('Reset stack to new root', () => router.reset('reset', { from: this.viewModel.pageId }))}
      {this.button('Refresh currentPages', () => { void this.inspectPages(); })}
      {this.button('Slide-up detail #77', () => router.push('detail', { id: 77, from: 'slideUp' },
        'push', { harmony: { animation: 'slideUp', durationMs: 500 } }))}
      {this.button('Immediate detail #0', () => router.push('detail', { id: 0, from: 'none' },
        'push', { harmony: { animation: 'none' } }))}
    </view>;
  }
}
