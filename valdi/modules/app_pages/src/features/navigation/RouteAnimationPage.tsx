import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { For, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router, type NavigationOptions } from '../../router';
import { api } from '../../services/api';

export interface RouteAnimationParams {
  animation: string;
}

type RouteAnimationViewModel = Omit<PageViewModel, 'route' | 'params'> & {
  route: 'animation';
  params: RouteAnimationParams;
};

interface Example {
  title: string;
  description: string;
  options: NavigationOptions;
}

/** As ExpoNativeRoutes' RouteAnimationPage; 'list' is the entry page that lists them. */
const EXAMPLES: Record<string, Example> = {
  default: {
    title: '系统默认',
    description: '使用平台导航的默认效果，让页面自然衔接。',
    options: { animation: 'default', android: { animation: 'default' } },
  },
  none: {
    title: '无动画',
    description: '直接打开下一页，立即完成页面切换。',
    options: { animation: 'none', android: { animation: 'none' } },
  },
  slideRight: {
    title: '右侧推进',
    description: '下一页从右侧进入，当前页面向左退让。',
    options: { android: { animation: 'slideRight', durationMs: 300 } },
  },
  slideUp: {
    title: '底部进入',
    description: '下一页从下方向上进入，适合临时打开的内容。',
    options: { android: { animation: 'slideUp', durationMs: 300 } },
  },
  fade: {
    title: '淡入淡出',
    description: '两页以透明度变化柔和交接，视线停留在原处。',
    options: { android: { animation: 'fade', durationMs: 300 } },
  },
  zoom: {
    title: '缩放',
    description: '下一页从稍小的尺寸展开，逐渐填满视野。',
    options: { android: { animation: 'zoom', durationMs: 300 } },
  },
  fullScreen: {
    title: '全屏覆盖',
    description: '盖住整个导航栈，从底部升起，返回时落下。',
    options: { ios: { presentation: 'fullScreen' } },
  },
};

const AVAILABLE = Device.isAndroid()
  ? ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom']
  : ['default', 'none', 'fullScreen'];

export function RouteAnimationPage(props: SolidPageProps<RouteAnimationViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const { insets } = props;
  const { animation } = props.params;
  const example = AVAILABLE.some(name => name === animation) ? EXAMPLES[animation] : undefined;

  const handleOpen = (name: string) => {
    try {
      router.push('animation', { animation: name }, EXAMPLES[name].options);
    } catch (error) {
      api.showToast({ title: String((error as Error).message), icon: 'none' });
    }
  };

  const handleBack = () => {
    router.back();
  };

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
            title={example ? example.title : '路由动画'}
            subtitle={Device.isAndroid() ? 'Compose Nav3 · 进入、返回、预测性返回' : 'UINavigationController'}
            onBack={handleBack}
          />
          <Show
            when={example}
            fallback={
              <>
                <label style={styles.text} value="每个按钮用对应的 options 打开下一页；点返回，观察退出效果。" />
                <For each={AVAILABLE}>
                  {name => <Button id={name} title={EXAMPLES[name].title} onTap={handleOpen} />}
                </For>
              </>
            }
          >
            {ex => (
              <>
                <label accessibilityId={`animation-${animation}`} style={styles.title} value={ex().title} />
                <label style={styles.text} value={ex().description} />
                <label
                  style={styles.caption}
                  value={animation === 'none' ? '即时切换' : animation === 'default' ? '平台默认效果' : '300 ms · 同一条导航栈'}
                />
                <Button id={animation} title="再看一次" onTap={handleOpen} />
                <Button id="back" title="返回" secondary={true} onTap={handleBack} />
              </>
            )}
          </Show>
        </view>
      </scroll>
    </view>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  content: new Style<View>({ width: '100%' }),
  title: new Style<Label>({ color: color.ink, font: systemBoldFont(tokens.font.heading), marginBottom: tokens.space.sm }),
  text: new Style<Label>({ color: color.text, font: systemFont(15), marginBottom: tokens.space.lg, numberOfLines: 0 }),
  caption: new Style<Label>({ color: color.primary, font: systemFont(tokens.font.segment), marginBottom: tokens.space.lg }),
};
