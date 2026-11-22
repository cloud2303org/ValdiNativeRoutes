import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { NavigationOptions, ResolvedNavigation } from '../../../valdi/modules/app_foundation/src/navigation/options';
import { appModule, valdiSourceRoot } from '../pipeline';
import { valdiTs } from '../valdiTs';

const app = appModule('app_pages');
const compiler = valdiTs(app, ts.ModuleKind.CommonJS);
const source = (name: string) => path.join(app.dir, 'src', name);
const foundation = (name: string) => path.join(appModule('app_foundation').dir, 'src', name);
const pageFile = source('features/navigation/RouteAnimationPage.tsx');
const emitted = new Map<string, string>();
const requireApp = createRequire(path.join(app.dir, 'package.json'));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Platform = 'android' | 'ios';
type Rendered = { kind: unknown; props: Record<string, any> };
type Push = { route: string; params: { animation: string }; navigation: ResolvedNavigation };
const presets = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'];

/** Execute production Solid universal output, Router, payload copier and validator; record only renderer/native boundaries. */
function runtime(platform: Platform, navigation?: NavigationOptions, routeOptions?: NavigationOptions) {
  const nodes: Rendered[] = [];
  const pushes: Push[] = [];
  const toasts: unknown[] = [];
  let backs = 0;
  class Button {}
  class PageHeader {}
  const appendChild = (parent: Rendered & { children?: Rendered[] }, child: unknown): void => {
    if (child == null || typeof child === 'boolean') return;
    if (typeof child === 'function') {
      appendChild(parent, child());
      return;
    }
    if (Array.isArray(child)) {
      for (const item of child) appendChild(parent, item);
      return;
    }
    if (typeof child === 'object' && 'kind' in child) {
      if (!parent.children) parent.children = [];
      parent.children.push(child as Rendered);
    }
  };
  const renderer = {
    createElement(tag: string, staticProps?: Record<string, any>): Rendered {
      const node: Rendered = { kind: tag, props: { ...staticProps } };
      nodes.push(node);
      return node;
    },
    createComponent(Comp: any, props: Record<string, any>): Rendered {
      if (typeof Comp === 'function' && Comp !== Button && Comp !== PageHeader) {
        return Comp(props);
      }
      const snapshot: Record<string, any> = {};
      for (const key of Object.keys(props)) {
        if (key !== 'children') snapshot[key] = props[key];
      }
      const node: Rendered = { kind: Comp, props: snapshot };
      nodes.push(node);
      return node;
    },
    setProp(node: Rendered, name: string, value: unknown) {
      node.props[name] = value;
    },
    createTextNode(value: unknown): Rendered {
      return { kind: '#text', props: { value: String(value ?? '') } };
    },
    insertNode(parent: Rendered & { children?: Rendered[] }, node: Rendered, _anchor?: Rendered) {
      if (!node) return;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    },
    removeNode(parent: Rendered & { children?: Rendered[] }, node: Rendered) {
      if (!parent.children) return;
      const idx = parent.children.indexOf(node);
      if (idx >= 0) parent.children.splice(idx, 1);
    },
    insert(parent: Rendered, accessor: unknown) {
      appendChild(parent, accessor);
    },
    spread(node: Rendered, props: Record<string, any>) {
      for (const [k, v] of Object.entries(props)) node.props[k] = v;
    },
    mergeProps(...sources: Record<string, any>[]) {
      return Object.assign({}, ...sources);
    },
    effect(fn: () => any, valueFn?: (v: any, prev?: any) => void) {
      const v = fn();
      if (typeof valueFn === 'function') valueFn(v, undefined);
    },
    memo<T>(fn: () => T) {
      return fn;
    },
  };
  const Show = (props: { when: any; fallback?: any; children: any }) => {
    const val = typeof props.when === 'function' ? props.when() : props.when;
    if (!val) return props.fallback ?? null;
    return typeof props.children === 'function' ? props.children(() => val) : props.children;
  };
  const For = (props: { each: readonly any[] | (() => readonly any[]); children: (item: any, index: () => number) => any }) => {
    const list = typeof props.each === 'function' ? props.each() : props.each;
    return Array.isArray(list) ? list.map((item, i) => props.children(item, () => i)) : [];
  };
  const context = vm.createContext({ Error });
  const modules: Record<string, any> = {
    'solid-js': {
      Show,
      For,
      createRoot: (fn: (dispose: () => void) => any) => fn(() => {}),
    },
    'solid_native/src/renderer': renderer,
    'valdi_core/src/Device': { Device: {
      getSystemType: () => platform, isAndroid: () => platform === 'android',
    } },
    'valdi_core/src/Style': { Style: class {} },
    'valdi_core/src/SystemFont': { systemBoldFont: () => '', systemFont: () => '' },
    'valdi_core/src/NativeReferences': { withGlobalNativeRefs: (_name: string, body: () => unknown) => body() },
    '../host/AppContext': { getHost: () => ({ getNavigationHost: () => ({
      push: (route: string, params: Push['params'], resolved: ResolvedNavigation) =>
        pushes.push(plain({ route, params, navigation: resolved })),
    }) }) },
    tslib: requireApp(path.join(valdiSourceRoot()!, 'src/valdi_modules/src/valdi/valdi_core/src/tslib.js')),
    [source('components/Button.tsx')]: { Button },
    [source('components/PageHeader.tsx')]: { PageHeader },
    [source('components/usePageStatusBar.ts')]: { usePageStatusBar: () => () => {} },
    [source('components/theme.ts')]: {
      color: {},
      tokens: { font: {}, space: {}, radius: {}, size: {}, icon: {}, motion: {} },
    },
    'theme_bridge/src/ThemeBridge': { getHost: () => ({ getTokens: () => ({ light: {}, dark: {}, shared: {} }) }) },
    [source('services/api.ts')]: { api: { showToast: (value: unknown) => toasts.push(value) } },
    [source('routes.ts')]: { routes: {
      navigation,
      assertRoute: (route: string) => {
        assert.equal(route, 'animation');
        return { options: routeOptions };
      },
    } },
  };
  function load(file: string): any {
    if (Object.hasOwn(modules, file)) return modules[file];
    if (!emitted.has(file)) {
      const raw = compiler.emit(file);
      emitted.set(
        file,
        ts.transpileModule(raw, {
          fileName: file,
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        }).outputText,
      );
    }
    const exports = {};
    modules[file] = exports;
    vm.runInContext(`(function(require,exports){${emitted.get(file)}\n})`, context, { filename: file })(
      (name: string) => {
        if (Object.hasOwn(modules, name)) return modules[name];
        if (/^(app_foundation|native_common)\//.test(name)) return load(path.join(app.dir, '..', name + '.ts'));
        assert.ok(name.startsWith('.'), `Unexpected runtime dependency: ${name}`);
        const relative = path.resolve(path.dirname(file), name);
        const resolved = [`${relative}.ts`, `${relative}.tsx`, path.join(relative, 'index.ts')].find(existsSync);
        assert.ok(resolved, `Missing runtime dependency: ${relative}`);
        return load(resolved);
      }, exports,
    );
    return exports;
  }
  const RouteAnimationPage = load(pageFile).RouteAnimationPage;
  const router = new (load(source('router.ts')).Router)({ back: () => { backs++; }, finish() {} });
  function render(animation = 'list') {
    nodes.length = 0;
    const insets = { top: 0, bottom: 0, left: 0, right: 0 };
    const initialViewModel = vm.runInContext(`(${JSON.stringify({
      insets, params: { animation },
    })})`, context);
    RouteAnimationPage({
      contextId: 'animation-test',
      context: { back: () => { backs++; }, finish() {} },
      params: initialViewModel.params,
      insets: initialViewModel.insets,
      initialViewModel,
      viewModel: () => initialViewModel,
    });
    return nodes;
  }
  const buttons = () => nodes.filter(node => node.kind === Button).map(node => node.props);
  const header = () => nodes.find(node => node.kind === PageHeader)!.props;
  const labels = () => nodes.filter(node => node.kind === 'label').map(node => node.props.value);
  return {
    render, buttons, header, labels, pushes, toasts,
    open: (animation: string) => router.push('animation',
      vm.runInContext(`(${JSON.stringify({ animation })})`, context)),
    tap: (button: Record<string, any>) => button.onTap(button.id),
    backCount: () => backs,
    resolve: load(foundation('navigation/options.ts')).resolveNavigation as
      (...layers: (NavigationOptions | undefined)[]) => ResolvedNavigation,
  };
}

function expected(name: string, platform: Platform): ResolvedNavigation {
  return {
    animation: name === 'fullScreen' ? 'default' : name,
    durationMs: 300,
    presentation: name === 'fullScreen' ? 'fullScreen' : 'push',
  };
}

function assertPush(run: ReturnType<typeof runtime>, name: string, platform: Platform) {
  assert.deepEqual(run.toasts, [], 'selection must not fail validation');
  assert.deepEqual(run.pushes.at(-1), {
    route: 'animation', params: { animation: name }, navigation: expected(name, platform),
  });
}

test('production Valdi compiler type-checks the animation page', () => {
  const program = compiler.program();
  const file = program.getSourceFile(pageFile)!;
  assert.ok(file);
  assert.deepEqual([...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), []);
});

for (const platform of ['android', 'ios'] as const) {
  const available = platform === 'ios' ? ['default', 'none', 'fullScreen'] : presets;
  test(`${platform} menu offers only supported examples and opens each through the real Router/resolver`, () => {
    const run = runtime(platform);
    run.render();
    assert.deepEqual(run.buttons().map(button => button.id), available);
    for (const button of run.buttons()) {
      run.tap(button);
      assertPush(run, button.id, platform);
    }
  });

  test(`${platform} header identifies its actual navigation implementation`, () => {
    const run = runtime(platform);
    run.render();
    assert.equal(run.header().subtitle, platform === 'android' ? 'Compose Nav3 · 进入、返回、预测性返回' : 'UINavigationController');
  });

  for (const name of available) {
    test(`${platform}/${name} detail preserves captions, repeat options and back handlers`, () => {
      const run = runtime(platform);
      run.render(name);
      assert.ok(run.labels().includes(run.header().title));
      assert.ok(run.labels().includes(name === 'none' ? '即时切换'
        : name === 'default' ? '平台默认效果' : '300 ms · 同一条导航栈'));
      const [repeat, back] = run.buttons();
      assert.equal(repeat.title, '再看一次');
      assert.equal(repeat.id, name);
      run.tap(repeat);
      assert.equal(run.pushes.length, 1);
      assertPush(run, name, platform);
      assert.equal(back.title, '返回');
      run.tap(back);
      run.header().onBack();
      assert.equal(run.backCount(), 2);
    });
  }
}

test('fullScreen stays an iOS-only option', () => {
  const ios = runtime('ios');
  ios.render();
  ios.tap(ios.buttons().find(button => button.id === 'fullScreen')!);
  assertPush(ios, 'fullScreen', 'ios');
  const options: NavigationOptions = { ios: { presentation: 'fullScreen' } };
  for (const platform of ['android'] as const) {
    const run = runtime(platform);
    run.render();
    assert.ok(!run.buttons().some(button => button.id === 'fullScreen'));
    assert.equal(run.resolve(options).presentation, 'push');
  }
});

for (const [platform, animation] of [
  ['android', 'fullScreen'], ['ios', 'slideRight'],
  ['android', 'constructor'], ['ios', 'constructor'],
] as const) {
  test(`${platform}/${animation} direct route renders the supported menu and keeps its Router actions`, () => {
    const run = runtime(platform);
    const available = platform === 'ios' ? ['default', 'none', 'fullScreen'] : presets;
    run.open(animation);
    assert.deepEqual(run.pushes, [{
      route: 'animation', params: { animation }, navigation: expected('default', platform),
    }], 'the existing Router accepts the string parameter with normal navigation defaults');
    run.render(run.pushes[0].params.animation);
    assert.equal(run.header().title, '路由动画');
    assert.deepEqual(run.buttons().map(button => button.id), available,
      'unsupported and inherited names use the available menu, without a repeat button');
    assert.equal(run.pushes.length, 1, 'rendering the menu must not navigate again');
    for (const button of run.buttons()) {
      run.tap(button);
      assertPush(run, button.id, platform);
    }
    assert.equal(run.pushes.length, available.length + 1);
    run.header().onBack();
    assert.equal(run.backCount(), 1);
  });
}
