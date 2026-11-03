import { PageContext, PageViewModel } from './Page';
import { readParams, router } from './navigation';
import { SmokePage } from './SmokePage';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class DetailPage extends SmokePage {
  private finish = (): void => {
    const { id } = readParams<'detail'>(this.viewModel);
    this.log('finish', { visited: id });
    this.pageRouter.finish<'detail'>({ visited: id });
  };

  onRender(): void {
    const { insets } = this.viewModel;
    const { id, from } = readParams<'detail'>(this.viewModel);
    <view width="100%" height="100%" backgroundColor="#fff4e5"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 8}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header(`Detail #${id}`, `Typed params: id=${id}, from=${from}`)}
      <label width="100%" height={30} value={this.state.result} font="system 16" color="#374151" />
      {this.button(`Finish with visited=${id}`, this.finish)}
      {this.button('Cancel / page context back', () => this.pageRouter.back())}
      {this.button('Push next typed detail', () => router.push('detail', { id: id + 1, from: `detail:${id}` }))}
      {this.button('Open stack actions', () => router.push('stack'))}
    </view>;
  }
}
