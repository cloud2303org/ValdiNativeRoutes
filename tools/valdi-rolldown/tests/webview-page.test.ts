import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root } from '../pipeline';

const source = path.join(root, 'valdi/modules/app_pages/src/features/webview/WebViewPage.tsx');
const code = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
  },
}).outputText;

function fixture(initialDark = false) {
  const calls: string[] = [];
  const documents: string[] = [];
  let dark = initialDark;
  let themeCallback!: (dark: boolean) => void;
  let themeCancelled = false;
  let listener: any;
  let evaluation: any;
  let rejectClear = false;
  let resolveState!: (value: unknown) => void;
  let rejectState!: (error: unknown) => void;
  const statePromise = new Promise((resolve, reject) => {
    resolveState = resolve;
    rejectState = reject;
  });
  const controller = {
    setListener(value: unknown) {
      calls.push(value ? 'listen' : 'clear');
      if (!value && rejectClear) throw new Error('clear failed');
      listener = value;
    },
    load(request: { html: string }) {
      assert.match(request.html, /<title>Valdi WebView<\/title>/);
      assert.match(request.html, /window\.Valdi\.postMessage/);
      documents.push(request.html);
      calls.push('load');
    },
    evaluateJavaScript(script: string, callback: unknown) {
      calls.push(script);
      evaluation = callback;
    },
    getState: () => statePromise,
    dispose: () => calls.push('dispose'),
  };

  let updates = 0;
  const signals: Array<() => any> = [];
  const cleanups: Array<() => void> = [];
  const buttons = new Map<string, () => void>();
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type: unknown, props: Record<string, any> | null) {
      if (type === 'Button' && props?.id && typeof props.onTap === 'function') {
        buttons.set(props.id, props.onTap);
      }
      return { type, props };
    },
  };
  const exports: Record<string, any> = {};
  // Transpile the real page without full Solid bundling; only platform/UI boundaries
  // are collaborators so lifecycle methods and callback guards execute unchanged.
  const dependencies: Record<string, unknown> = {
    'valdi_core/src/Style': { Style: class {} },
    'valdi_core/src/Device': {
      Device: {
        isDarkMode: () => dark,
        observeDarkMode: (callback: (dark: boolean) => void) => {
          themeCallback = callback;
          callback(dark);
          return { cancel: () => { themeCancelled = true; } };
        },
      },
    },
    'valdi_core/src/SystemFont': { systemFont: () => 'font' },
    'valdi_webview/src/WebView': { WebView: { createController: () => controller } },
    'solid-js': {
      createSignal<T>(initial: T) {
        let value = initial;
        const get = () => value;
        signals.push(get);
        const set = (next: T | ((prev: T) => T)) => {
          value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
          updates++;
          return value;
        };
        return [get, set];
      },
      onCleanup: (fn: () => void) => cleanups.push(fn),
    },
    '../../components/Button': { Button: 'Button' },
    '../../components/NavigationBar': { NavigationBar: 'NavigationBar' },
    '../../components/usePageStatusBar': { usePageStatusBar: () => () => {} },
    '../../components/theme': {
      color: {},
      tokens: { font: {}, space: {} },
      COLORS: {
        light: { text: '#172033', canvas: '#f5f7fb', buttonPrimary: '#1e62d0', buttonOnPrimary: '#ffffff' },
        dark: { text: '#edf2f7', canvas: '#101114', buttonPrimary: '#5295ff', buttonOnPrimary: '#101114' },
      },
    },
  };
  vm.runInNewContext(`(function(require,exports,React){${code}\n})`)(
    (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    exports,
    React,
  );
  exports.WebViewPage({
    contextId: 'test-webview',
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    initialViewModel: { pageId: 'test-webview', insets: { top: 0, bottom: 0, left: 0, right: 0 } },
    viewModel: () => ({ pageId: 'test-webview' }),
    params: {},
    context: { back() {}, finish() {} },
  });
  const [getPhase, getMessage, getResult, getNavigation] = signals;
  return {
    calls,
    documents,
    state: () => ({
      phase: getPhase(),
      message: getMessage(),
      result: getResult(),
      navigation: getNavigation(),
    }),
    updates: () => updates,
    handleLoad: () => buttons.get('webview-load')?.(),
    handleEvaluate: () => buttons.get('webview-evaluate')?.(),
    handleState: () => buttons.get('webview-state')?.(),
    destroy: () => {
      for (const fn of cleanups) fn();
    },
    changeTheme: (value: boolean) => { dark = value; themeCallback(value); },
    themeCancelled: () => themeCancelled,
    listener: () => listener,
    evaluation: () => evaluation,
    resolveState, rejectState,
    failClear: () => { rejectClear = true; },
  };
}

test('WebView page installs the bridge before loading and forwards native results', async () => {
  const f = fixture();
  assert.deepEqual(f.calls, ['listen', 'load']);
  f.listener().onLoadCompleted();
  assert.equal(f.state().phase, '离线页面已加载');
  f.listener().onMessage('from page');
  assert.equal(f.state().message, 'from page');
  f.handleEvaluate();
  assert.equal(f.calls.at(-1), 'document.title');
  f.evaluation()({ value: '"Valdi WebView"' });
  assert.equal(f.state().result, '"Valdi WebView"');
  f.handleState();
  f.resolveState({ canGoBack: false, canGoForward: true, loading: false });
  await Promise.resolve();
  assert.match(f.state().navigation, /后退 false · 前进 true · 加载中 false/);
  f.destroy();
  assert.deepEqual(f.calls.slice(-2), ['clear', 'dispose']);
});

test('WebView page ignores already captured listener, evaluation and state callbacks after destruction', async () => {
  for (const reject of [false, true]) {
    const f = fixture();
    const listener = f.listener();
    f.handleEvaluate();
    const evaluation = f.evaluation();
    f.handleState();
    f.destroy();
    const updates = f.updates();
    listener.onMessage('late');
    listener.onLoadCompleted();
    listener.onLoadFailed('late failure');
    evaluation({ value: 'late' });
    if (reject) f.rejectState(new Error('late state'));
    else f.resolveState({ canGoBack: true, canGoForward: true, loading: true });
    await Promise.resolve();
    assert.equal(f.updates(), updates);
  }
});

test('WebView page disposes even if clearing the listener throws', () => {
  const f = fixture();
  f.failClear();
  assert.throws(() => f.destroy(), /clear failed/);
  assert.deepEqual(f.calls.slice(-2), ['clear', 'dispose']);
  assert.equal(f.themeCancelled(), true);
});

test('offline HTML starts with the current appearance and both native token palettes', () => {
  for (const dark of [false, true]) {
    const f = fixture(dark);
    assert.match(f.documents[0], new RegExp(`data-valdi-theme="${dark ? 'dark' : 'light'}"`));
    assert.match(f.documents[0], /color-scheme:light;--page-text:#172033;--page-background:#f5f7fb/);
    assert.match(f.documents[0], /color-scheme:dark;--page-text:#edf2f7;--page-background:#101114/);
    assert.match(f.documents[0], /html,body\{color:var\(--page-text\);background:var\(--page-background\)\}/);
    assert.deepEqual(f.calls, ['listen', 'load']);
  }
});

test('theme changes update the document in place and are reapplied after a load race', () => {
  const f = fixture();
  let documentTheme = 'light';
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        assert.equal(name, 'data-valdi-theme');
        documentTheme = value;
      },
    },
  };
  const applyLastScript = () => vm.runInNewContext(f.calls.at(-1)!, { document });
  f.changeTheme(true);
  applyLastScript();
  assert.equal(documentTheme, 'dark');
  assert.equal(f.documents.length, 1);
  // Simulate a newly loaded document replacing the one that received the early theme event.
  documentTheme = 'light';
  f.listener().onLoadCompleted();
  applyLastScript();
  assert.equal(documentTheme, 'dark');
  assert.equal(f.documents.length, 1);
  f.handleLoad();
  assert.match(f.documents[1], /data-valdi-theme="dark"/);
  f.changeTheme(false);
  applyLastScript();
  assert.equal(documentTheme, 'light');
  f.destroy();
  assert.equal(f.themeCancelled(), true);
  const calls = f.calls.length;
  f.changeTheme(true); // Already queued callback arriving after cancellation.
  assert.equal(f.calls.length, calls);
});
