import { Style } from 'valdi_core/src/Style';
import { Device } from 'valdi_core/src/Device';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { WebView, IWebViewController } from 'valdi_webview/src/WebView';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { COLORS, color, tokens } from '../../components/theme';

// This local document owns its colors. Supply the current native appearance before its first
// paint, then switch the CSS palette in place when the app appearance changes.
function offlineHtml(dark: boolean): string {
  return `<!doctype html>
<html lang="zh-CN" data-valdi-theme="${dark ? 'dark' : 'light'}"><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Valdi WebView</title>
<style>
:root{color-scheme:light;--page-text:${COLORS.light.text};--page-background:${COLORS.light.canvas};--button-background:${COLORS.light.buttonPrimary};--button-text:${COLORS.light.buttonOnPrimary}}
:root[data-valdi-theme="dark"]{color-scheme:dark;--page-text:${COLORS.dark.text};--page-background:${COLORS.dark.canvas};--button-background:${COLORS.dark.buttonPrimary};--button-text:${COLORS.dark.buttonOnPrimary}}
html,body{color:var(--page-text);background:var(--page-background)}
body{font:16px -apple-system,sans-serif;padding:20px}
button{font:inherit;padding:12px;border:0;border-radius:10px;background:var(--button-background);color:var(--button-text)}
</style>
</head><body><h2>WebView 已接入</h2><p>这是随应用加载的离线 HTML，不依赖网络。</p>
<button id="send" onclick="window.Valdi.postMessage('来自网页的消息')">发送消息给 Valdi</button>
</body></html>`;
}

interface State {
  phase: string;
  message: string;
  result: string;
  navigation: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRWebViewPage', android: 'io.valdiroutes.pages.WebViewPage'})
 */
export class WebViewPage extends Page<PageViewModel, State, PageContext> {
  state: State = {
    phase: '正在加载离线页面',
    message: '尚未收到网页消息',
    result: '尚未执行脚本',
    navigation: '尚未读取导航状态',
  };

  private controller?: IWebViewController;
  private alive = false;
  private darkMode = false;
  private themeObserver?: ReturnType<typeof Device.observeDarkMode>;

  onCreate(): void {
    this.alive = true;
    this.darkMode = Device.isDarkMode();
    this.controller = WebView.createController();
    this.controller.setListener({
      onMessage: message => {
        if (this.alive) this.setState({ message });
      },
      onLoadFailed: errorMessage => {
        if (this.alive) this.setState({ phase: `加载失败：${errorMessage}` });
      },
      onLoadCompleted: () => {
        if (this.alive) {
          // A theme event during navigation may have reached the previous document.
          this.syncWebTheme();
          this.setState({ phase: '离线页面已加载' });
        }
      },
    });
    this.controller.load({ html: offlineHtml(this.darkMode) });
    this.themeObserver = Device.observeDarkMode(dark => {
      if (!this.alive || dark === this.darkMode) return;
      this.darkMode = dark;
      this.syncWebTheme();
    });
  }

  onDestroy(): void {
    this.alive = false;
    const themeObserver = this.themeObserver;
    this.themeObserver = undefined;
    const controller = this.controller;
    this.controller = undefined;
    try {
      themeObserver?.cancel();
    } finally {
      if (controller) {
        try {
          controller.setListener(undefined);
        } finally {
          controller.dispose();
        }
      }
    }
  }

  onRender(): void {
    const { insets } = this.viewModel;
    <view style={styles.page}>
      <NavigationBar title="WebView" topInset={insets.top} onBack={this.handleBack} />
      <scroll flexGrow={1}>
        <view
          paddingTop={tokens.space.lg}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.lg}
        >
          <label accessibilityId="webview-phase" style={styles.status} value={this.state.phase} />
          <webview
            accessibilityId="webview-browser"
            width="100%"
            height={280}
            marginBottom={tokens.space.lg}
            limitToViewport={false}
            controller={this.controller}
          />
          <Button id="webview-load" title="载入离线 HTML" onTap={this.handleLoad} />
          <Button id="webview-evaluate" title="读取网页标题" onTap={this.handleEvaluate} />
          <label accessibilityId="webview-result" style={styles.status} value={this.state.result} />
          <Button id="webview-message" title="让网页发送消息" onTap={this.handleMessage} />
          <label accessibilityId="webview-message-result" style={styles.status} value={this.state.message} />
          <Button id="webview-state" title="读取导航状态" secondary={true} onTap={this.handleState} />
          <label accessibilityId="webview-state-result" style={styles.status} value={this.state.navigation} />
        </view>
      </scroll>
    </view>;
  }

  private handleLoad = () => {
    this.setState({ phase: '正在加载离线页面' });
    this.controller?.load({ html: offlineHtml(this.darkMode) });
  };

  private syncWebTheme(): void {
    if (!this.alive) return;
    this.controller?.evaluateJavaScript(
      `document.documentElement.setAttribute('data-valdi-theme', '${this.darkMode ? 'dark' : 'light'}');`,
    );
  }

  private handleEvaluate = () => this.evaluate('document.title');
  private handleMessage = () => this.evaluate("document.getElementById('send').click(); '已请求网页发送消息'");

  private evaluate(script: string): void {
    const controller = this.controller;
    controller?.evaluateJavaScript(script, result => {
      if (!this.alive || controller !== this.controller) return;
      this.setState({
        result: result.errorMessage !== undefined ? `执行失败：${result.errorMessage}` : result.value ?? '',
      });
    });
  }

  private handleState = () => {
    const controller = this.controller;
    controller?.getState().then(state => {
      if (!this.alive || controller !== this.controller) return;
      this.setState({
        navigation: `后退 ${state.canGoBack} · 前进 ${state.canGoForward} · 加载中 ${state.loading}`,
      });
    }, error => {
      if (this.alive && controller === this.controller) this.setState({ navigation: String(error) });
    });
  };

  private handleBack = () => this.context.back();
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  status: new Style<Label>({
    font: systemFont(tokens.font.body),
    color: color.text,
    numberOfLines: 0,
    marginBottom: tokens.space.lg,
  }),
};
