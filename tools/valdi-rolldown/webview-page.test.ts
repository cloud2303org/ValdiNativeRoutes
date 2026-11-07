import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { root } from './pipeline';

const source = path.join(root, 'valdi/modules/app_pages/src/features/webview/WebViewPage.tsx');
const code = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
  },
}).outputText;

function fixture() {
  const calls: string[] = [];
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
      calls.push('load');
    },
    evaluateJavaScript(script: string, callback: unknown) {
      calls.push(script);
      evaluation = callback;
    },
    getState: () => statePromise,
    dispose: () => calls.push('dispose'),
  };
  class Page {
    state: Record<string, unknown> = {};
    updates = 0;
    setState(value: Record<string, unknown>) {
      this.updates++;
      Object.assign(this.state, value);
    }
  }
  const exports: Record<string, any> = {};
  // Transpile the real page without rendering JSX. Only platform/UI boundaries
  // are collaborators; lifecycle methods and callback guards execute unchanged.
  const dependencies: Record<string, unknown> = {
    'valdi_core/src/Style': { Style: class {} },
    'valdi_core/src/SystemFont': { systemFont: () => 'font' },
    'valdi_webview/src/WebView': { WebView: { createController: () => controller } },
    'app_foundation/src/page/PageComponent': { Page },
    '../../components/Button': {},
    '../../components/NavigationBar': {},
    '../../components/theme': {
      color: {},
      tokens: { font: {}, space: {} },
      COLORS: { light: { text: '#172033', canvas: '#f5f7fb', primary: '#1e62d0', buttonOnPrimary: '#ffffff' } },
    },
  };
  vm.runInNewContext(`(function(require,exports){${code}\n})`)(
    (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    exports,
  );
  const page = new exports.WebViewPage();
  return {
    page, calls,
    listener: () => listener,
    evaluation: () => evaluation,
    resolveState, rejectState,
    failClear: () => { rejectClear = true; },
  };
}

test('WebView page installs the bridge before loading and forwards native results', async () => {
  const f = fixture();
  f.page.onCreate();
  assert.deepEqual(f.calls, ['listen', 'load']);
  f.listener().onLoadCompleted();
  assert.equal(f.page.state.phase, '离线页面已加载');
  f.listener().onMessage('from page');
  assert.equal(f.page.state.message, 'from page');
  f.page.handleEvaluate();
  assert.equal(f.calls.at(-1), 'document.title');
  f.evaluation()({ value: '"Valdi WebView"' });
  assert.equal(f.page.state.result, '"Valdi WebView"');
  f.page.handleState();
  f.resolveState({ canGoBack: false, canGoForward: true, loading: false });
  await Promise.resolve();
  assert.match(f.page.state.navigation, /后退 false · 前进 true · 加载中 false/);
  f.page.onDestroy();
  assert.deepEqual(f.calls.slice(-2), ['clear', 'dispose']);
});

test('WebView page ignores already captured listener, evaluation and state callbacks after destruction', async () => {
  for (const reject of [false, true]) {
    const f = fixture();
    f.page.onCreate();
    const listener = f.listener();
    f.page.handleEvaluate();
    const evaluation = f.evaluation();
    f.page.handleState();
    f.page.onDestroy();
    const updates = f.page.updates;
    listener.onMessage('late');
    listener.onLoadCompleted();
    listener.onLoadFailed('late failure');
    evaluation({ value: 'late' });
    if (reject) f.rejectState(new Error('late state'));
    else f.resolveState({ canGoBack: true, canGoForward: true, loading: true });
    await Promise.resolve();
    assert.equal(f.page.updates, updates);
  }
});

test('WebView page disposes even if clearing the listener throws', () => {
  const f = fixture();
  f.page.onCreate();
  f.failClear();
  assert.throws(() => f.page.onDestroy(), /clear failed/);
  assert.deepEqual(f.calls.slice(-2), ['clear', 'dispose']);
});
