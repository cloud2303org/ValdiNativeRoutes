import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createSignal, onCleanup } from 'solid-js';
import { onPageHide, onPageShow, whilePageVisible, type SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from 'app_pages/src/Strings';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router } from '../../router';
import { ApiError, api } from '../../services/api';
import { language, selectLanguage } from '../../services/localization';
import type { FormLayout } from '../form/types';

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

const OPENS_KEY = 'demo.homeOpens';

const KEYBOARD_CASES: Record<string, FormLayout> = {
  'page-scroll': 'scroll',
  'page-plain': 'plain',
};

export function HomePage(props: SolidPageProps<PageViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const initialOpens = (api.getStorageSync<number>(OPENS_KEY) ?? 0) + 1;
  api.setStorageSync(OPENS_KEY, initialOpens);

  const [taps, setTaps] = createSignal(0);
  const [lastResult, setLastResult] = createSignal('还没有结果');
  const [opens, setOpens] = createSignal(initialOpens);
  const [lifecycle, setLifecycle] = createSignal({ shows: 0, hides: 0, lastShow: '-', lastHide: '-' });
  const [visibleSeconds, setVisibleSeconds] = createSignal(0);

  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (loadingTimer !== undefined) clearTimeout(loadingTimer);
  });

  onPageShow(reason => {
    setLifecycle(prev => ({ ...prev, shows: prev.shows + 1, lastShow: reason }));
  });

  onPageHide(reason => {
    setLifecycle(prev => ({ ...prev, hides: prev.hides + 1, lastHide: reason }));
  });

  whilePageVisible(() => {
    const timer = setInterval(() => {
      setVisibleSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  });

  const handleRoute = async (id: string) => {
    if (id === 'detail') {
      const result = await router.pushForResult('detail', { id: 1, from: 'home' });
      setLastResult(result ? `详情页一共走了 ${result.visited} 层` : '详情页返回，没带结果');
    } else {
      const result = await router.pushForResult('picker', { selected: undefined });
      setLastResult(result ? `原生页选了 ${result.value}` : '原生页取消了');
    }
  };

  const handleClearStorage = () => {
    api.clearStorageSync();
    setOpens(0);
    setLastResult(`清空了，${OPENS_KEY} 读出来是 ${api.getStorageSync(OPENS_KEY)}`);
  };

  const handleTap = () => {
    setTaps(c => c + 1);
  };

  const handleExample = (id: string) => {
    if (id === 'animation') router.push('animation', { animation: 'list' });
    else router.push(id as 'ble' | 'presentation' | 'device' | 'wheels', {});
  };

  const runFeedback = async (id: string) => {
    switch (id) {
      case 'modal-confirm': {
        const answer = await api.showModal({ title: '删除这条记录？', content: '删除后无法恢复', confirmText: '删除' });
        setLastResult(answer.confirm ? '确认删除' : '取消了删除');
        break;
      }
      case 'modal-input': {
        const answer = await api.showModal({
          title: '重命名设备',
          editable: true,
          placeholderText: '输入设备名',
          content: '测试',
        });
        setLastResult(answer.confirm ? `新名字：${answer.content}` : '取消了重命名');
        break;
      }
      case 'modal-queue': {
        // Both calls start now; the second dialog waits until the first one has closed.
        const first = api.showModal({ title: '第一个', content: '关掉以后才会出现第二个', showCancel: false });
        const second = api.showModal({ title: '第二个', content: '排在第一个后面' });
        const answers = await Promise.all([first, second]);
        setLastResult(`两个都关了：${answers.map(answer => (answer.confirm ? '确定' : '取消')).join('、')}`);
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
        if (loadingTimer !== undefined) clearTimeout(loadingTimer);
        await api.showLoading({ title: '加载中', mask: true });
        loadingTimer = setTimeout(async () => {
          loadingTimer = undefined;
          await api.hideLoading();
          await api.showToast({ title: '加载完成' });
        }, 2000);
        break;
    }
  };

  const handleFeedback = async (id: string) => {
    try {
      await runFeedback(id);
    } catch (error) {
      // API failures reject with an ApiError whose errMsg reads like 'showModal:fail …'.
      setLastResult((error as ApiError).errMsg ?? String(error));
    }
  };

  const handleKeyboardCase = async (id: string) => {
    const layout = KEYBOARD_CASES[id];
    const result = await router.pushForResult('form', { layout });
    setLastResult(result ? result.summary : '表单取消了');
  };

  const { insets } = props;

  return (
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
            title="Valdi + Solid 2.0"
            subtitle={`${JS_ENGINE}\ninset 上 ${Math.round(insets.top)} · 下 ${Math.round(insets.bottom)} · 左 ${Math.round(insets.left)} · 右 ${Math.round(insets.right)}`}
          />

          <label style={styles.section} value={(language(), Strings.languageTitle())} />
          <label accessibilityId="language-greeting" style={styles.result} value={(language(), Strings.languageGreeting('Valdi'))} />
          <Button
            id="language-system"
            title={(language(), Strings.languageSystem())}
            secondary={language() !== undefined}
            onTap={() => selectLanguage(undefined)}
          />
          <Button id="language-en" title="English" secondary={language() !== 'en'} onTap={() => selectLanguage('en')} />
          <Button id="language-zh" title="简体中文" secondary={language() !== 'zh-CN'} onTap={() => selectLanguage('zh-CN')} />

          <label style={styles.section} value="路由" />
          <Button id="solid-demo" title="Solid 2.0 特性演示" onTap={() => router.push('solidDemo', {})} />
          <Button id="input-check" title="输入自检" onTap={() => router.push('inputCheck', {})} />
          <Button id="webview" title="WebView" onTap={() => router.push('webview', {})} />
          <Button id="lottie" title="Lottie 动画" onTap={() => router.push('lottie', {})} />
          <Button id="video" title="原生视频播放器（MP4 / HLS）" onTap={() => router.push('video', {})} />
          <Button id="detail" title="push 详情页" onTap={handleRoute} />
          <Button id="picker" title="打开原生选择页，等结果" onTap={handleRoute} />
          <label style={styles.result} value={`结果：${lastResult()}`} />

          <label style={styles.section} value="页面生命周期（Solid Hooks）" />
          <label
            style={styles.result}
            value={`onShow ${lifecycle().shows} 次（${lifecycle().lastShow}）· onHide ${lifecycle().hides} 次（${lifecycle().lastHide}）`}
          />
          <label style={styles.result} value={`可见时计时（whileVisible）：${visibleSeconds()} 秒`} />

          <label style={styles.section} value="存储（api.*StorageSync，MMKV）" />
          <label style={styles.result} value={`首页打开过 ${opens()} 次，重启后接着数`} />
          <Button id="storage-clear" title="clearStorageSync" secondary={true} onTap={handleClearStorage} />

          <label style={styles.section} value="被覆盖时保留状态" />
          <Button id="tap" title={`点了 ${taps()} 次`} secondary={true} onTap={handleTap} />

          <label style={styles.section} value="弹窗与提示（api）" />
          <Button id="modal-confirm" title="showModal 确认" onTap={handleFeedback} />
          <Button id="modal-input" title="showModal 输入" onTap={handleFeedback} />
          <Button id="modal-queue" title="连续两个 showModal（排队）" onTap={handleFeedback} />
          <Button id="toast-success" title="showToast 成功" secondary={true} onTap={handleFeedback} />
          <Button id="toast-text" title="showToast 纯文字" secondary={true} onTap={handleFeedback} />
          <Button id="toast-error" title="showToast 失败" secondary={true} onTap={handleFeedback} />
          <Button id="loading" title="showLoading 2 秒（遮罩）" secondary={true} onTap={handleFeedback} />

          <label style={styles.section} value="更多示例" />
          <Button id="presentation" title="选择器、日期、图片预览" onTap={handleExample} />
          <Button id="wheels" title="页面内滚轮（组件）" onTap={handleExample} />
          <Button id="ble" title="打开蓝牙 api 页" onTap={handleExample} />
          <Button id="device" title="Wi-Fi 与 NFC" onTap={handleExample} />
          <Button id="animation" title="路由动画" onTap={handleExample} />

          <label style={styles.section} value="键盘" />
          <Button id="page-scroll" title="全屏页 + scroll + 输入框" onTap={handleKeyboardCase} />
          <Button id="page-plain" title="全屏页 + 普通 view + 输入框" onTap={handleKeyboardCase} />
        </view>
      </scroll>
    </view>
  );
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: '100%',
  }),
  content: new Style<View>({}),
  section: new Style<Label>({
    color: color.muted,
    font: systemSemiboldFont(tokens.font.section),
    margin: '12 0 8 0',
  }),
  result: new Style<Label>({
    color: color.success,
    font: systemFont(tokens.font.segment),
    marginBottom: tokens.space.xs,
  }),
};
