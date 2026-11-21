import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createSignal, onCleanup } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { WebView, type IWebViewController } from 'valdi_webview/src/WebView';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { usePageStatusBar } from '../../components/usePageStatusBar';
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

export function WebViewPage(props: SolidPageProps<PageViewModel, PageContext>) {
  usePageStatusBar(props, 'auto');

  const [phase, setPhase] = createSignal('正在加载离线页面');
  const [message, setMessage] = createSignal('尚未收到网页消息');
  const [result, setResult] = createSignal('尚未执行脚本');
  const [navigation, setNavigation] = createSignal('尚未读取导航状态');

  let alive = true;
  let darkMode = Device.isDarkMode();
  let controller: IWebViewController | undefined = WebView.createController();

  const syncWebTheme = () => {
    if (!alive) return;
    controller?.evaluateJavaScript(
      `document.documentElement.setAttribute('data-valdi-theme', '${darkMode ? 'dark' : 'light'}');`,
    );
  };

  controller.setListener({
    onMessage: next => {
      if (alive) setMessage(next);
    },
    onLoadFailed: errorMessage => {
      if (alive) setPhase(`加载失败：${errorMessage}`);
    },
    onLoadCompleted: () => {
      if (alive) {
        // A theme event during navigation may have reached the previous document.
        syncWebTheme();
        setPhase('离线页面已加载');
      }
    },
  });
  controller.load({ html: offlineHtml(darkMode) });

  const themeObserver = Device.observeDarkMode(dark => {
    if (!alive || dark === darkMode) return;
    darkMode = dark;
    syncWebTheme();
  });

  onCleanup(() => {
    alive = false;
    const currentController = controller;
    controller = undefined;
    try {
      themeObserver?.cancel();
    } finally {
      if (currentController) {
        try {
          currentController.setListener(undefined);
        } finally {
          currentController.dispose();
        }
      }
    }
  });

  const handleLoad = () => {
    setPhase('正在加载离线页面');
    controller?.load({ html: offlineHtml(darkMode) });
  };

  const evaluate = (script: string) => {
    const active = controller;
    active?.evaluateJavaScript(script, evalResult => {
      if (!alive || active !== controller) return;
      setResult(
        evalResult.errorMessage !== undefined ? `执行失败：${evalResult.errorMessage}` : evalResult.value ?? '',
      );
    });
  };

  const handleEvaluate = () => evaluate('document.title');
  const handleMessage = () => evaluate("document.getElementById('send').click(); '已请求网页发送消息'");

  const handleState = () => {
    const active = controller;
    active?.getState().then(
      state => {
        if (!alive || active !== controller) return;
        setNavigation(`后退 ${state.canGoBack} · 前进 ${state.canGoForward} · 加载中 ${state.loading}`);
      },
      error => {
        if (alive && active === controller) setNavigation(String(error));
      },
    );
  };

  const { insets } = props;

  return (
    <view style={styles.page}>
      <NavigationBar title="WebView" topInset={insets.top} onBack={() => props.context.back()} />
      <scroll flexGrow={1}>
        <view
          paddingTop={tokens.space.lg}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.lg}
        >
          <label accessibilityId="webview-phase" style={styles.status} value={phase()} />
          <webview
            accessibilityId="webview-browser"
            width="100%"
            height={280}
            marginBottom={tokens.space.lg}
            limitToViewport={false}
            controller={controller}
          />
          <Button id="webview-load" title="载入离线 HTML" onTap={handleLoad} />
          <Button id="webview-evaluate" title="读取网页标题" onTap={handleEvaluate} />
          <label accessibilityId="webview-result" style={styles.status} value={result()} />
          <Button id="webview-message" title="让网页发送消息" onTap={handleMessage} />
          <label accessibilityId="webview-message-result" style={styles.status} value={message()} />
          <Button id="webview-state" title="读取导航状态" secondary={true} onTap={handleState} />
          <label accessibilityId="webview-state-result" style={styles.status} value={navigation()} />
        </view>
      </scroll>
    </view>
  );
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
