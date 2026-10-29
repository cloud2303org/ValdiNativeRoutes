import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { ApiError, api } from './api';
import { auth } from './auth';
import { Button } from './Button';
import { getAppDb } from './db';
import { PageContext, PageViewModel } from './Page';
import { HideReason, Page, ShowReason } from './PageComponent';
import { PageHeader } from './PageHeader';
import { FormLayout, Presentation, Router } from './routes';
import { ClientSQLSubscription } from './sqlgen/SubmissionQueries';

/** The JS engine running this page, read from the runtime itself. */
function describeJsEngine(): string {
  const hermes = (globalThis as any).HermesInternal;
  if (!hermes) {
    return 'QuickJS 或其他（不是 Hermes）';
  }
  const version = hermes.getRuntimeProperties?.()?.['OSS Release Version'];
  return version ? `Hermes ${version}` : 'Hermes';
}

const JS_ENGINE = describeJsEngine();

interface State {
  /** Survives while the page is covered; a remount would reset it. */
  taps: number;
  lastResult: string;
  /** Rows in the SQLite submission table, kept live by a watch query. */
  savedCount: number;
  /** How many times a home page was created, kept in api storage (MMKV) across launches. */
  opens: number;
  /** onShow / onHide calls, with the latest reason of each. */
  lifecycle: { shows: number; hides: number; lastShow: string; lastHide: string };
  /** Seconds the page has been on screen, counted by a whileVisible timer. */
  visibleSeconds: number;
}

const OPENS_KEY = 'demo.homeOpens';

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
export class HomePage extends Page<PageViewModel, State, PageContext> {
  state: State = {
    taps: 0,
    lastResult: '还没有结果',
    savedCount: 0,
    opens: 0,
    lifecycle: { shows: 0, hides: 0, lastShow: '-', lastHide: '-' },
    visibleSeconds: 0,
  };

  private savedSubscription?: ClientSQLSubscription;

  onCreate(): void {
    const opens = (api.getStorageSync<number>(OPENS_KEY) ?? 0) + 1;
    api.setStorageSync(OPENS_KEY, opens);
    this.setState({ opens });
    this.whileVisible(() => {
      const timer = setInterval(() => this.setState({ visibleSeconds: this.state.visibleSeconds + 1 }), 1000);
      return () => clearInterval(timer);
    });
    this.savedSubscription = getAppDb().submissionQueries.watchCountSubmissions(rows => {
      this.setState({ savedCount: rows[0]?.count ?? 0 });
    });
  }

  onShow(reason: ShowReason): void {
    const { lifecycle } = this.state;
    this.setState({ lifecycle: { ...lifecycle, shows: lifecycle.shows + 1, lastShow: reason } });
  }

  onHide(reason: HideReason): void {
    const { lifecycle } = this.state;
    this.setState({ lifecycle: { ...lifecycle, hides: lifecycle.hides + 1, lastHide: reason } });
  }

  onDestroy(): void {
    this.savedSubscription?.unsubscribe();
  }

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { taps, lastResult, savedCount, opens, lifecycle, visibleSeconds } = this.state;

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
            subtitle={`${JS_ENGINE}\ninset 上 ${Math.round(insets.top)} · 下 ${Math.round(insets.bottom)} · 左 ${Math.round(insets.left)} · 右 ${Math.round(insets.right)}`}
          />

          <label style={styles.section} value="路由" />
          <Button id="detail" title="push 详情页" onTap={this.handleRoute} />
          <Button id="picker" title="打开原生选择页，等结果" onTap={this.handleRoute} />
          <label key="last-result" style={styles.result} value={`结果：${lastResult}`} />
          <label key="saved-count" style={styles.result} value={`SQLite 里已保存 ${savedCount} 次表单提交`} />

          <label style={styles.section} value="页面生命周期（Page）" />
          <label
            key="lifecycle"
            style={styles.result}
            value={`onShow ${lifecycle.shows} 次（${lifecycle.lastShow}）· onHide ${lifecycle.hides} 次（${lifecycle.lastHide}）`}
          />
          <label key="visible-seconds" style={styles.result} value={`可见时计时（whileVisible）：${visibleSeconds} 秒`} />

          <label style={styles.section} value="登录（auth）" />
          <label key="token" style={styles.result} numberOfLines={0} value={`token：${auth.getToken() ?? '没有'}`} />
          <Button id="sign-out" title="退出登录" secondary={true} onTap={this.handleSignOut} />

          <label style={styles.section} value="存储（api.*StorageSync，MMKV）" />
          <label key="opens" style={styles.result} value={`首页打开过 ${opens} 次，重启后接着数`} />
          <Button id="storage-clear" title="clearStorageSync" secondary={true} onTap={this.handleClearStorage} />
          <Button id="storage-bad" title="setStorageSync(undefined)（入参校验）" secondary={true} onTap={this.handleBadStorage} />

          <label style={styles.section} value="被覆盖时保留状态" />
          <Button id="tap" title={`点了 ${taps} 次`} secondary={true} onTap={this.handleTap} />

          <label style={styles.section} value="弹窗与提示（api）" />
          <Button id="modal-confirm" title="showModal 确认" onTap={this.handleFeedback} />
          <Button id="modal-input" title="showModal 输入" onTap={this.handleFeedback} />
          <Button id="modal-queue" title="连续两个 showModal（排队）" onTap={this.handleFeedback} />
          <Button id="toast-success" title="showToast 成功" secondary={true} onTap={this.handleFeedback} />
          <Button id="toast-text" title="showToast 纯文字" secondary={true} onTap={this.handleFeedback} />
          <Button id="toast-error" title="showToast 失败" secondary={true} onTap={this.handleFeedback} />
          <Button id="loading" title="showLoading 2 秒（遮罩）" secondary={true} onTap={this.handleFeedback} />

          <label style={styles.section} value="更多示例" />
          <Button id="presentation" title="选择器、日期、图片预览" onTap={this.handleExample} />
          <Button id="wheels" title="页面内滚轮（组件）" onTap={this.handleExample} />
          <Button id="vision" title="OpenCV 与 ncnn" onTap={this.handleExample} />
          <Button id="ble" title="打开蓝牙 api 页" onTap={this.handleExample} />
          <Button id="device" title="Wi-Fi 与 NFC" onTap={this.handleExample} />
          <Button id="animation" title="路由动画" onTap={this.handleExample} />

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

  private handleSignOut = async () => {
    const answer = await api.showModal({ title: '退出登录？', content: '会回到登录页，当前页面都会关闭' });
    if (answer.confirm) auth.signOut();
  };

  private handleClearStorage = () => {
    api.clearStorageSync();
    this.setState({ opens: 0, lastResult: `清空了，${OPENS_KEY} 读出来是 ${api.getStorageSync(OPENS_KEY)}` });
  };

  private handleBadStorage = () => {
    try {
      api.setStorageSync('demo.bad', undefined);
    } catch (error) {
      this.setState({ lastResult: (error as ApiError).errMsg });
    }
  };

  private handleTap = () => {
    this.setState({ taps: this.state.taps + 1 });
  };

  private handleExample = (id: string) => {
    if (id === 'animation') this.router.push('animation', { animation: 'list' });
    else this.router.push(id as 'ble' | 'presentation' | 'vision' | 'device' | 'wheels', {});
  };

  private handleFeedback = async (id: string) => {
    try {
      await this.runFeedback(id);
    } catch (error) {
      // API failures reject with an ApiError whose errMsg reads like 'showModal:fail …'.
      this.setState({ lastResult: (error as ApiError).errMsg ?? String(error) });
    }
  };

  private runFeedback = async (id: string) => {
    switch (id) {
      case 'modal-confirm': {
        const answer = await api.showModal({ title: '删除这条记录？', content: '删除后无法恢复', confirmText: '删除' });
        this.setState({ lastResult: answer.confirm ? '确认删除' : '取消了删除' });
        break;
      }
      case 'modal-input': {
        const answer = await api.showModal({
          title: '重命名设备',
          editable: true,
          placeholderText: '输入设备名',
          defaultText: '采样设备',
        });
        this.setState({ lastResult: answer.confirm ? `新名字：${answer.content}` : '取消了重命名' });
        break;
      }
      case 'modal-queue': {
        // Both calls start now; the second dialog waits until the first one has closed.
        const first = api.showModal({ title: '第一个', content: '关掉以后才会出现第二个', showCancel: false });
        const second = api.showModal({ title: '第二个', content: '排在第一个后面' });
        const answers = await Promise.all([first, second]);
        this.setState({
          lastResult: `两个都关了：${answers.map(answer => (answer.confirm ? '确定' : '取消')).join('、')}`,
        });
        break;
      }
      case 'toast-success':
        await api.showToast({ title: '保存成功' });
        break;
      case 'toast-text':
        await api.showToast({ title: '这是一条没有图标的提示，文字可以换行显示', icon: 'none', duration: 2500 });
        break;
      case 'toast-error':
        await api.showToast({ title: '保存失败', icon: 'error' });
        break;
      case 'loading':
        await api.showLoading({ title: '加载中', mask: true });
        setTimeout(async () => {
          await api.hideLoading();
          await api.showToast({ title: '加载完成' });
        }, 2000);
        break;
    }
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
