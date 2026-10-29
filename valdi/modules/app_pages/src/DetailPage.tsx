import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { NavigationBar } from './NavigationBar';
import { PageContext, PageViewModel } from './Page';
import { Page, StatusBarStyle } from './PageComponent';
import { Router, readParams, router } from './routes';
import { color } from './theme';

interface State {
  /** How deep the chain of detail pages opened from this one went. */
  deepest: number;
  /** router.getCurrentPages(), as route names. */
  pages: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRDetailPage', android: 'io.valdiroutes.pages.DetailPage'})
 */
export class DetailPage extends Page<PageViewModel, State, PageContext> {
  state: State = { deepest: 0, pages: '' };

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets, pageId } = this.viewModel;
    const { id, from } = readParams<'detail'>(this.viewModel);
    const deepest = Math.max(this.state.deepest, id);

    <view style={styles.page}>
      <NavigationBar title={`详情 #${id}`} topInset={insets.top} onBack={this.handleBack} />
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingBottom={insets.bottom + 24}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <label style={styles.text} value={`来自 ${from} · ${pageId}`} />
          <label style={styles.text} value={`下面已经走到第 ${deepest} 层`} />
          <Button id="next" title={`push 详情 #${id + 1}`} onTap={this.handleNext} />
          <Button id="picker" title="push 原生选择页" onTap={this.handlePicker} />
          <Button id="finish" title="带结果返回" secondary={true} onTap={this.handleFinish} />

          <label style={styles.section} value="栈操作（全局 router）" />
          <label style={styles.text} numberOfLines={0} value={this.state.pages} />
          <Button id="replace" title={`replace 成详情 #${id + 1}`} secondary={true} onTap={this.handleReplace} />
          <Button id="back2" title="back(2)" secondary={true} onTap={this.handleBack2} />
          <Button id="root" title="popToRoot" secondary={true} onTap={this.handlePopToRoot} />
          <Button id="tab" title="switchTab('device')" secondary={true} onTap={this.handleSwitchTab} />
          <Button id="reset" title="reset('main', { tab: 'wheels' })" secondary={true} onTap={this.handleReset} />

          <label style={styles.section} value="状态栏（只影响这一页）" />
          <Button id="light" title="setStatusBarStyle('light')" secondary={true} onTap={this.handleStatusBar} />
          <Button id="dark" title="setStatusBarStyle('dark')" secondary={true} onTap={this.handleStatusBar} />
          <Button id="auto" title="setStatusBarStyle('auto')" secondary={true} onTap={this.handleStatusBar} />
        </view>
      </scroll>
    </view>;
  }

  onCreate(): void {
    void this.showPages();
  }

  private async showPages() {
    const pages = await router.getCurrentPages();
    const canGoBack = await router.canGoBack();
    this.setState({ pages: `栈：${pages.map(page => page.route).join(' → ')}（canGoBack ${canGoBack}）` });
  }

  private handleReplace = () => {
    const { id } = readParams<'detail'>(this.viewModel);
    router.replace('detail', { id: id + 1, from: `replace 自 #${id}` });
  };

  private handleStatusBar = (id: string) => this.setStatusBarStyle(id as StatusBarStyle);

  private handleBack2 = () => router.back(2);

  private handlePopToRoot = () => router.popToRoot();

  private handleSwitchTab = () => router.switchTab('device');

  private handleReset = () => router.reset('main', { tab: 'wheels' });

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
    backgroundColor: color.canvas,
  }),
  content: new Style<View>({
    paddingTop: 12,
  }),
  // The navigation bar stays fixed; only the remaining page height is the scroll viewport.
  scroll: new Style<ScrollView>({ width: '100%', height: 0, flexGrow: 1 }),
  text: new Style<Label>({
    color: '#374151',
    font: systemFont(15),
    marginBottom: 16,
  }),
  section: new Style<Label>({ color: '#6b7280', font: systemFont(13), margin: '12 0 8 0' }),
};
