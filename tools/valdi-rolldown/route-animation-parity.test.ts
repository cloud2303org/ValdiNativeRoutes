import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { NavigationOptions, ResolvedNavigation } from '../../valdi/modules/app_pages/src/navigation/options';
import { appModule } from './pipeline';
import { valdiTs } from './valdiTs';

const app = appModule('app_pages');
const compiler = valdiTs(app, ts.ModuleKind.CommonJS);
const source = (name: string) => path.join(app.dir, 'src', name);
const pageFile = source('RouteAnimationPage.tsx');
const emitted = new Map<string, string>();
const requireApp = createRequire(path.join(app.dir, 'package.json'));
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Platform = 'android' | 'ios' | 'harmony';
type Rendered = { kind: unknown; props: Record<string, any> };
type Push = { route: string; params: { animation: string }; presentation: string; navigation: ResolvedNavigation };
const presets = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'];

/** Execute production Valdi JSX output, Router, payload copier and validator; record only renderer/native boundaries. */
function runtime(platform: Platform, navigation?: NavigationOptions, routeOptions?: NavigationOptions) {
  const nodes: Rendered[] = [];
  const stack: Rendered[] = [];
  const pushes: Push[] = [];
  const toasts: unknown[] = [];
  let backs = 0;
  class Button {}
  class PageHeader {}
  const prototype = (kind: unknown, attributes: any[] = []): Rendered => ({
    kind,
    props: Object.fromEntries(Array.from({ length: attributes.length / 2 }, (_, index) =>
      [attributes[index * 2], attributes[index * 2 + 1]])),
  });
  const begin = (node: Rendered) => { nodes.push(node); stack.push(node); };
  const set = (name: string, value: unknown) => { stack[stack.length - 1].props[name] = value; };
  const jsx = {
    makeNodePrototype: prototype,
    makeComponentPrototype: (attributes?: any[]) => prototype(undefined, attributes),
    beginRender: (node: Rendered) => begin({ kind: node.kind, props: { ...node.props } }),
    beginComponent: (kind: unknown, node: Rendered) => begin({ kind, props: { ...node.props } }),
    endRender: () => stack.pop(),
    endComponent: () => stack.pop(),
    setAttributeStyle: set, setAttributeString: set, setAttributeNumber: set, setViewModelProperty: set,
  };
  const context = vm.createContext({ Error });
  const modules: Record<string, any> = {
    'valdi_core/src/JSX': { jsx },
    'valdi_core/src/Device': { Device: {
      getSystemType: () => platform, isAndroid: () => platform === 'android',
    } },
    'valdi_core/src/Style': { Style: class {} },
    'valdi_core/src/SystemFont': { systemBoldFont: () => '', systemFont: () => '' },
    valibot: requireApp('valibot'),
    [source('Button.tsx')]: { Button },
    [source('PageHeader.tsx')]: { PageHeader },
    [source('PageComponent.ts')]: { Page: class {} },
    [source('api.ts')]: { api: { showToast: (value: unknown) => toasts.push(value) } },
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
    if (!emitted.has(file)) emitted.set(file, compiler.emit(file));
    const exports = {};
    modules[file] = exports;
    vm.runInContext(`(function(require,exports){${emitted.get(file)}\n})`, context, { filename: file })(
      (name: string) => {
        if (Object.hasOwn(modules, name)) return modules[name];
        assert.ok(name.startsWith('.'), `Unexpected runtime dependency: ${name}`);
        const relative = path.resolve(path.dirname(file), name);
        const resolved = [`${relative}.ts`, `${relative}.tsx`, path.join(relative, 'index.ts')].find(existsSync);
        assert.ok(resolved, `Missing runtime dependency: ${relative}`);
        return load(resolved);
      }, exports,
    );
    return exports;
  }
  load(source('NavigationHost.ts')).installNavigation({
    push: (route: string, params: Push['params'], presentation: string, resolved: ResolvedNavigation) =>
      pushes.push(plain({ route, params, presentation, navigation: resolved })),
  });
  const page = new (load(pageFile).RouteAnimationPage)();
  page.context = { back: () => { backs++; } };
  const router = new (load(source('navigation/index.ts')).Router)(page.context);
  function render(animation = 'list') {
    nodes.length = 0;
    page.viewModel = vm.runInContext(`(${JSON.stringify({
      insets: { top: 0, bottom: 0, left: 0, right: 0 }, params: { animation },
    })})`, context);
    page.onRender();
    assert.equal(stack.length, 0, 'compiler output balances renderer scopes');
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
    resolve: load(source('navigation/options.ts')).resolveNavigation as
      (...layers: (NavigationOptions | undefined)[]) => ResolvedNavigation,
  };
}

function expected(name: string, platform: Platform): ResolvedNavigation {
  return {
    animation: name === 'fullScreen' ? 'default' : name,
    durationMs: name === 'none' && platform === 'harmony' ? 0 : 300,
    presentation: name === 'fullScreen' ? 'fullScreen' : 'push',
  };
}

function assertPush(run: ReturnType<typeof runtime>, name: string, platform: Platform) {
  assert.deepEqual(run.toasts, [], 'selection must not fail validation');
  assert.deepEqual(run.pushes.at(-1), {
    route: 'animation', params: { animation: name }, presentation: 'push', navigation: expected(name, platform),
  });
}

test('production Valdi compiler type-checks the animation page', () => {
  const program = compiler.program();
  const file = program.getSourceFile(pageFile)!;
  assert.ok(file);
  assert.deepEqual([...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), []);
});

for (const platform of ['harmony', 'android', 'ios'] as const) {
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
    assert.equal(run.header().subtitle, platform === 'harmony' ? 'ArkUI'
      : platform === 'android' ? 'Compose Nav3 · 进入、返回、预测性返回' : 'UINavigationController');
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

test('fullScreen stays an iOS-only option rather than a Harmony presentation fallback', () => {
  const ios = runtime('ios');
  ios.render();
  ios.tap(ios.buttons().find(button => button.id === 'fullScreen')!);
  assertPush(ios, 'fullScreen', 'ios');
  const options: NavigationOptions = { ios: { presentation: 'fullScreen' } };
  for (const platform of ['harmony', 'android'] as const) {
    const run = runtime(platform);
    run.render();
    assert.ok(!run.buttons().some(button => button.id === 'fullScreen'));
    assert.equal(run.resolve(options).presentation, 'push');
  }
});

test('Harmony custom examples override lower route/global transitions with the selected 300 ms preset', () => {
  for (const name of presets.slice(2)) {
    const run = runtime('harmony',
      { ios: { presentation: 'fullScreen' }, harmony: { animation: 'none', durationMs: 0 } },
      { harmony: { animation: 'default', durationMs: 850 } });
    run.render(name);
    run.tap(run.buttons()[0]);
    assertPush(run, name, 'harmony');
  }
});

for (const [platform, animation] of [
  ['harmony', 'fullScreen'], ['android', 'fullScreen'], ['ios', 'slideRight'],
  ['harmony', 'constructor'], ['android', 'constructor'], ['ios', 'constructor'],
] as const) {
  test(`${platform}/${animation} direct route renders the supported menu and keeps its Router actions`, () => {
    const run = runtime(platform);
    const available = platform === 'ios' ? ['default', 'none', 'fullScreen'] : presets;
    run.open(animation);
    assert.deepEqual(run.pushes, [{
      route: 'animation', params: { animation }, presentation: 'push', navigation: expected('default', platform),
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
