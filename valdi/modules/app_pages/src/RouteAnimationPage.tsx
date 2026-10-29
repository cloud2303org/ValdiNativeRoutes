import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { api } from './api';
import { Button } from './Button';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { PageHeader } from './PageHeader';
import { NavigationOptions, Router, readParams } from './routes';

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

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRRouteAnimationPage', android: 'io.valdiroutes.pages.RouteAnimationPage'})
 */
export class RouteAnimationPage extends Page<PageViewModel, {}, PageContext> {
  state = {};

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { animation } = readParams<'animation'>(this.viewModel);
    const example = EXAMPLES[animation];

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
            onBack={this.handleBack}
          />
          {example ? this.renderExample(animation, example) : this.renderList()}
        </view>
      </scroll>
    </view>;
  }

  private renderList(): void {
    <label style={styles.text} value="每个按钮用对应的 options 打开下一页；点返回，观察退出效果。" />;
    AVAILABLE.forEach(name => {
      <Button key={name} id={name} title={EXAMPLES[name].title} onTap={this.handleOpen} />;
    });
  }

  private renderExample(animation: string, example: Example): void {
    <label key="kind" accessibilityId={`animation-${animation}`} style={styles.title} value={example.title} />;
    <label style={styles.text} value={example.description} />;
    <label
      style={styles.caption}
      value={animation === 'none' ? '即时切换' : animation === 'default' ? '平台默认效果' : '300 ms · 同一条导航栈'}
    />;
    <Button id={animation} title="再看一次" onTap={this.handleOpen} />;
    <Button id="back" title="返回" secondary={true} onTap={this.handleBack} />;
  }

  private handleOpen = (name: string) => {
    try {
      this.router.push('animation', { animation: name }, 'push', EXAMPLES[name].options);
    } catch (error) {
      api.showToast({ title: String((error as Error).message), icon: 'none' });
    }
  };

  private handleBack = () => {
    this.router.back();
  };
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  content: new Style<View>({ width: '100%' }),
  title: new Style<Label>({ color: '#111827', font: systemBoldFont(30), marginBottom: 8 }),
  text: new Style<Label>({ color: '#374151', font: systemFont(15), marginBottom: 16, numberOfLines: 0 }),
  caption: new Style<Label>({ color: '#1e62d0', font: systemFont(14), marginBottom: 16 }),
};
