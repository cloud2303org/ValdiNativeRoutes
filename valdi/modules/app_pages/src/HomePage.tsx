import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { getAppDb } from './db';
import { ClientSQLSubscription } from './sqlgen/SubmissionQueries';
import { PageContext, PageViewModel } from './Page';
import { PageHeader } from './PageHeader';
import { FormLayout, Presentation, Router } from './routes';

interface State {
  /** Survives while the page is covered; a remount would reset it. */
  taps: number;
  lastResult: string;
  /** Rows in the SQLite submission table, kept live by a watch query. */
  savedCount: number;
}

const KEYBOARD_CASES: Record<string, { layout: FormLayout; presentation: Presentation }> = {
  'page-scroll': { layout: 'scroll', presentation: 'push' },
  'page-plain': { layout: 'plain', presentation: 'push' },
  'sheet-scroll': { layout: 'scroll', presentation: 'sheet' },
  'sheet-plain': { layout: 'plain', presentation: 'compactSheet' },
};

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRHomePage', android: 'io.valdiroutes.pages.HomePage'})
 */
export class HomePage extends StatefulComponent<PageViewModel, State, PageContext> {
  state: State = { taps: 0, lastResult: '还没有结果', savedCount: 0 };

  private savedSubscription?: ClientSQLSubscription;

  onCreate(): void {
    this.savedSubscription = getAppDb().submissionQueries.watchCountSubmissions(rows => {
      this.setState({ savedCount: rows[0]?.count ?? 0 });
    });
  }

  onDestroy(): void {
    this.savedSubscription?.unsubscribe();
  }

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { taps, lastResult, savedCount } = this.state;

    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingTop={insets.top + 12}
          paddingBottom={insets.bottom + 24}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <PageHeader
            title="Valdi + Compose Nav3"
            subtitle={`inset 上 ${insets.top} · 下 ${insets.bottom} · 左 ${insets.left} · 右 ${insets.right}`}
          />

          <label style={styles.section} value="路由" />
          <Button id="detail" title="push 详情页" onTap={this.handleRoute} />
          <Button id="picker" title="打开原生选择页，等结果" onTap={this.handleRoute} />
          <label key="last-result" style={styles.result} value={`结果：${lastResult}`} />
          <label key="saved-count" style={styles.result} value={`SQLite 里已保存 ${savedCount} 次表单提交`} />

          <label style={styles.section} value="被覆盖时保留状态" />
          <Button id="tap" title={`点了 ${taps} 次`} secondary={true} onTap={this.handleTap} />

          <label style={styles.section} value="键盘" />
          <Button id="page-scroll" title="全屏页 + scroll + 输入框" onTap={this.handleKeyboardCase} />
          <Button id="page-plain" title="全屏页 + 普通 view + 输入框" onTap={this.handleKeyboardCase} />
          <Button id="sheet-scroll" title="Sheet + scroll + 输入框" onTap={this.handleKeyboardCase} />
          <Button id="sheet-plain" title="Sheet + 普通 view + 输入框" onTap={this.handleKeyboardCase} />
        </view>
      </scroll>
    </view>;
  }

  private handleRoute = async (id: string) => {
    if (id === 'detail') {
      const result = await this.router.pushForResult('detail', { id: 1, from: 'home' });
      this.setState({ lastResult: result ? `详情页一共走了 ${result.visited} 层` : '详情页返回，没带结果' });
    } else {
      const result = await this.router.pushForResult('picker', { selected: undefined });
      this.setState({ lastResult: result ? `原生页选了 ${result.value}` : '原生页取消了' });
    }
  };

  private handleTap = () => {
    this.setState({ taps: this.state.taps + 1 });
  };

  private handleKeyboardCase = async (id: string) => {
    const { layout, presentation } = KEYBOARD_CASES[id];
    const result = await this.router.pushForResult('form', { layout }, presentation);
    this.setState({ lastResult: result ? result.summary : '表单取消了' });
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: '100%',
  }),
  content: new Style<View>({}),
  section: new Style<Label>({
    color: '#6b7280',
    font: systemSemiboldFont(13),
    margin: '12 0 8 0',
  }),
  result: new Style<Label>({
    color: '#059669',
    font: systemFont(14),
    marginBottom: 4,
  }),
};
