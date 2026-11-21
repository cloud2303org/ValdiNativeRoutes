import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import type { StatusBarStyle } from 'app_foundation/src/page/PageComponent';
import { createSignal, onCleanup } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color } from '../../components/theme';
import { Router, router } from '../../router';

export interface DetailParams {
  id: number;
  from: string;
}

type DetailViewModel = Omit<PageViewModel, 'route' | 'params'> & {
  route: 'detail';
  params: DetailParams;
};

export function DetailPage(props: SolidPageProps<DetailViewModel, PageContext>) {
  const pageRouter = new Router(props.context);
  const setStatusBarStyle = usePageStatusBar(props, 'auto');

  const { insets, pageId } = props.initialViewModel;
  const { id, from } = props.params;

  const [deepest, setDeepest] = createSignal(id);
  const [pages, setPages] = createSignal('');
  let alive = true;
  onCleanup(() => {
    alive = false;
  });

  void (async () => {
    const stack = await router.getCurrentPages();
    const canGoBack = await router.canGoBack();
    if (!alive) return;
    setPages(`栈：${stack.map(page => page.route).join(' → ')}（canGoBack ${canGoBack}）`);
  })();

  const handleBack = () => {
    pageRouter.back();
  };

  const handleNext = async () => {
    const result = await pageRouter.pushForResult('detail', { id: id + 1, from: `详情 #${id}` });
    if (alive && result) {
      setDeepest(prev => Math.max(prev, result.visited));
    }
  };

  const handlePicker = () => {
    pageRouter.push('picker', { selected: undefined });
  };

  const handleFinish = () => {
    pageRouter.finish<'detail'>({ visited: Math.max(deepest(), id) });
  };

  const handleReplace = () => {
    router.replace('detail', { id: id + 1, from: `replace 自 #${id}` });
  };

  const handleStatusBar = (style: string) => {
    setStatusBarStyle(style as StatusBarStyle);
  };

  return (
    <view style={styles.page}>
      <NavigationBar title={`详情 #${id}`} topInset={insets.top} onBack={handleBack} />
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingBottom={insets.bottom + 24}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <label style={styles.text} value={`来自 ${from} · ${pageId}`} />
          <label style={styles.text} value={`下面已经走到第 ${deepest()} 层`} />
          <Button id="next" title={`push 详情 #${id + 1}`} onTap={handleNext} />
          <Button id="picker" title="push 原生选择页" onTap={handlePicker} />
          <Button id="finish" title="带结果返回" secondary={true} onTap={handleFinish} />

          <label style={styles.section} value="栈操作（全局 router）" />
          <label style={styles.text} numberOfLines={0} value={pages()} />
          <Button id="replace" title={`replace 成详情 #${id + 1}`} secondary={true} onTap={handleReplace} />
          <Button id="back2" title="back(2)" secondary={true} onTap={() => router.back(2)} />
          <Button id="root" title="popToRoot" secondary={true} onTap={() => router.popToRoot()} />
          <Button id="tab" title="switchTab('device')" secondary={true} onTap={() => router.switchTab('device')} />
          <Button id="reset" title="resetToTabs('wheels')" secondary={true} onTap={() => router.resetToTabs('wheels')} />

          <label style={styles.section} value="状态栏（只影响这一页）" />
          <Button id="light" title="setStatusBarStyle('light')" secondary={true} onTap={handleStatusBar} />
          <Button id="dark" title="setStatusBarStyle('dark')" secondary={true} onTap={handleStatusBar} />
          <Button id="auto" title="setStatusBarStyle('auto')" secondary={true} onTap={handleStatusBar} />
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
  content: new Style<View>({
    paddingTop: 12,
  }),
  // The navigation bar stays fixed; only the remaining page height is the scroll viewport.
  scroll: new Style<ScrollView>({ width: '100%', height: 0, flexGrow: 1 }),
  text: new Style<Label>({
    color: color.text,
    font: systemFont(15),
    marginBottom: 16,
  }),
  section: new Style<Label>({ color: color.muted, font: systemFont(13), margin: '12 0 8 0' }),
};
