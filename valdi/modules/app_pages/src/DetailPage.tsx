import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { PageContext, PageViewModel } from './Page';
import { PageHeader } from './PageHeader';
import { readParams, Router } from './routes';

interface State {
  /** How deep the chain of detail pages opened from this one went. */
  deepest: number;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRDetailPage', android: 'io.valdiroutes.pages.DetailPage'})
 */
export class DetailPage extends StatefulComponent<PageViewModel, State, PageContext> {
  state: State = { deepest: 0 };

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets, pageId } = this.viewModel;
    const { id, from } = readParams<'detail'>(this.viewModel);
    const deepest = Math.max(this.state.deepest, id);

    <view
      style={styles.page}
      paddingTop={insets.top + 12}
      paddingBottom={insets.bottom + 24}
      paddingLeft={insets.left + 20}
      paddingRight={insets.right + 20}
    >
      <PageHeader title={`详情 #${id}`} subtitle={`来自 ${from} · ${pageId}`} onBack={this.handleBack} />
      <label style={styles.text} value={`下面已经走到第 ${deepest} 层`} />
      <Button id="next" title={`push 详情 #${id + 1}`} onTap={this.handleNext} />
      <Button id="picker" title="push 原生选择页" onTap={this.handlePicker} />
      <Button id="finish" title="带结果返回" secondary={true} onTap={this.handleFinish} />
    </view>;
  }

  private handleBack = () => {
    this.router.back();
  };

  private handleNext = async () => {
    const { id } = readParams<'detail'>(this.viewModel);
    const result = await this.router.pushForResult('detail', { id: id + 1, from: `详情 #${id}` });
    if (result) {
      this.setState({ deepest: result.visited });
    }
  };

  private handlePicker = () => {
    this.router.push('picker', { selected: undefined });
  };

  private handleFinish = () => {
    const { id } = readParams<'detail'>(this.viewModel);
    this.router.finish<'detail'>({ visited: Math.max(this.state.deepest, id) });
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  }),
  text: new Style<Label>({
    color: '#374151',
    font: systemFont(15),
    marginBottom: 16,
  }),
};
