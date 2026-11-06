import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appModule, appModules, valdiSourceRoot, writeTsconfig } from './pipeline';
import { findFonts, findImages, writeResTs } from './resources';
import { valdiTs } from './valdiTs';

async function fixture(t: TestContext, dev = false) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'valdi-routes-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const original = appModule('app_pages');
  const dir = path.join(temporary, 'app_pages');
  mkdirSync(dir);
  cpSync(path.join(original.dir, 'src'), path.join(dir, 'src'), { recursive: true });
  cpSync(path.join(original.dir, 'res'), path.join(dir, 'res'), { recursive: true });
  const generated = path.join(temporary, 'generated');
  const module = { ...original, dir, generatedDirs: [generated] };
  // A fresh checkout has no .gen output. Generate declarations from this fixture's
  // resources, just as the pipeline does, instead of depending on a previous build.
  writeResTs(module, await findImages(module), generated, findFonts(module));
  assert.ok(writeTsconfig(module, [module, ...appModules().filter(other => other.name !== module.name)]));
  const config = JSON.parse(readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
  config.compilerOptions.baseUrl = dir;
  config.compilerOptions.rootDirs = [path.dirname(dir), generated];
  config.compilerOptions.paths['app_pages/*'] = [path.join(dir, '*'), path.join(generated, '*')];
  symlinkSync(original.nodeModules!, path.join(dir, 'node_modules'), 'junction');
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(config));
  const plugin = valdiTs(module, ts.ModuleKind.CommonJS, dev);
  t.after(() => plugin.dispose());
  const routeFile = path.join(dir, 'src/routes.ts');
  const change = (file: string, transform: (text: string) => string) => {
    writeFileSync(file, transform(readFileSync(file, 'utf8')));
    plugin.invalidate(file);
  };
  return { module, plugin, routeFile, change };
}

/** Execute actual emitted sources; external runtime dependencies must be supplied explicitly. */
function execute(f: Awaited<ReturnType<typeof fixture>>, dependencies: Record<string, any> = {}) {
  const nativeNavigation: Record<string, any> = {};
  dependencies = {
    'valdi_core/src/NativeReferences': { withGlobalNativeRefs: (_name: string, body: () => unknown) => body() },
    './AppContext': { getHost: () => ({ getNavigationHost: () => nativeNavigation }) },
    ...dependencies,
  };
  const context = vm.createContext({});
  const cache = new Map<string, any>();
  const loaded: string[] = [];
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    loaded.push(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const require = (name: string) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      assert.ok(name.startsWith('.'), `route evaluation must not load page/native/npm modules: ${name}`);
      return load(path.resolve(path.dirname(file), `${name}.ts`));
    };
    vm.runInContext(`(function(require,module,exports){${f.plugin.emit(file)}\n})`, context, { filename: file })(
      require, module, module.exports,
    );
    return module.exports;
  };
  return { routes: load(f.routeFile).routes, load, loaded, nativeNavigation };
}

function addCustomBar(f: Awaited<ReturnType<typeof fixture>>) {
  const file = path.join(f.module.dir, 'src/AppTabBar.ts');
  writeFileSync(file, `
import { Component } from 'valdi_core/src/Component';
import type { TabBarContext, TabBarViewModel } from './TabBar';
/** @Component({viewModel: 'TabBarViewModel', context: 'TabBarContext'}) */
export class AppTabBar extends Component<TabBarViewModel, TabBarContext> {
  onRender(): void {}
}
`);
  f.plugin.invalidate(file);
  f.change(f.routeFile, text => `import { AppTabBar } from './AppTabBar';\n${text}`
    .replace('  tabs: {', "  tabs: {\n    bar: { type: 'custom', component: AppTabBar },"));
  return file;
}

test('routes compile direct components/res to metadata, execute without loading any page, and preserve native aliases', async t => {
  const f = await fixture(t);
  assert.equal(f.plugin.diagnostics(), '');
  f.change(f.routeFile, text => text.replace("name: 'picker'", "name: 'app/device-picker'"));
  const { routes, loaded } = execute(f);
  const host = routes.toHost('login');
  assert.equal(host.root, 'login');
  assert.equal(routes.home, '$tabs');
  assert.equal(host.routes.find((route: any) => route.route === 'home').component, 'HomePage@app_pages/src/HomePage');
  assert.equal(host.routes.find((route: any) => route.route === 'calculator').component, 'CalculatorComponent@calculator/src/CalculatorComponent');
  assert.equal(host.routes.find((route: any) => route.route === 'picker').nativeName, 'app/device-picker');
  assert.equal(host.tabBar.initial, 'home');
  assert.equal(host.tabBar.mode, 'default');
  assert.equal(host.tabBar.component, undefined);
  assert.equal(host.tabBar.tabs[0].icon, 'tab_home');
  assert.equal(host.tabBar.tabs[0].selectedIcon, 'tab_home_on');
  assert.ok(loaded.every(file => ['/src/routes.ts', '/src/navigation/config.ts', '/src/NavigationHost.ts']
    .some(suffix => file.endsWith(suffix))), loaded.join('\n'));
  assert.throws(() => routes.assertRoute('absent'), /Unknown route: "absent"/);
  assert.throws(() => routes.assertTab('detail'), /Unknown tab/);
  f.change(path.join(f.module.dir, 'src/HomePage.tsx'), text => text.replace('export class HomePage', 'export default class HomePage'));
  f.change(f.routeFile, text => text.replace("import { HomePage } from './HomePage';", "import HomePage from './HomePage';"));
  assert.equal(f.plugin.diagnostics(), '');
  assert.equal(execute(f).routes.toHost().routes.find((route: any) => route.route === 'home').component, 'default@app_pages/src/HomePage');
});

test('custom tab component resolves to canonical metadata without a static component import', async t => {
  const f = await fixture(t);
  const file = addCustomBar(f);
  assert.equal(f.plugin.diagnostics(), '');
  const emitted = f.plugin.emit(f.routeFile);
  assert.doesNotMatch(emitted, /require\(["']\.\/AppTabBar["']\)/);
  const { routes, loaded } = execute(f);
  assert.equal(routes.toHost().tabBar.mode, 'custom');
  assert.equal(routes.toHost().tabBar.component, 'AppTabBar@app_pages/src/AppTabBar');
  assert.equal(loaded.includes(file), false);
  f.change(file, text => text.replace('export class AppTabBar', 'export default class AppTabBar'));
  f.change(f.routeFile, text => text.replace("import { AppTabBar } from './AppTabBar';", "import AppTabBar from './AppTabBar';"));
  assert.equal(f.plugin.diagnostics(), '');
  assert.equal(execute(f).routes.toHost().tabBar.component, 'default@app_pages/src/AppTabBar');
});

test('type-only aliases do not retain runtime imports of custom tab components', async t => {
  const f = await fixture(t);
  const file = addCustomBar(f);
  f.change(f.routeFile, text => `${text}
export type BarInstance = AppTabBar;
export type BarConstructor = typeof AppTabBar;
export interface BarShape extends AppTabBar {}
export type { AppTabBar };
export { type AppTabBar as BusinessBarType };
`);
  assert.equal(f.plugin.diagnostics(), '');
  const emitted = f.plugin.emit(f.routeFile);
  assert.ok(!/require\(["']\.\/AppTabBar["']\)/.test(emitted),
    'type-only references must not retain the custom component runtime import');
  const { routes, loaded } = execute(f);
  assert.equal(routes.toHost().tabBar.component, 'AppTabBar@app_pages/src/AppTabBar');
  assert.equal(loaded.includes(file), false);
});

test('type-only aliases do not retain runtime imports of valdiPage components', async t => {
  const f = await fixture(t);
  f.change(f.routeFile, text => `${text}
export type PageInstance = HomePage;
export type { HomePage };
`);
  assert.equal(f.plugin.diagnostics(), '');
  assert.ok(!/require\(["']\.\/HomePage["']\)/.test(f.plugin.emit(f.routeFile)),
    'valdiPage metadata shares the same runtime-only import liveness');
  const { routes, loaded } = execute(f);
  assert.equal(routes.toHost().routes.find((route: any) => route.route === 'home').component,
    'HomePage@app_pages/src/HomePage');
  assert.ok(!loaded.some(file => file.endsWith('/HomePage.tsx')));
});

for (const component of ['AppTabBar', 'HomePage']) {
  test(`legacy decorators on declared properties retain and execute the ${component} dependency`, async t => {
    const f = await fixture(t);
    const implementation = component === 'AppTabBar' ? 'AppTabBar' : 'DecoratedHomePage';
    const file = component === 'AppTabBar' ? addCustomBar(f) : path.join(f.module.dir, `src/${implementation}.ts`);
    // Compile the actual imported class too, with no native runtime required to evaluate this fixture.
    writeFileSync(file, `
/** @Component */
export class ${component} {
  static readonly key = Symbol('decorated');
  onRender(): void {}
}
`);
    f.plugin.invalidate(file);
    f.change(f.routeFile, text => `${component === 'HomePage'
      ? text.replace("from './HomePage';", `from './${implementation}';`) : text}
export const observed: { component: unknown; key: string | symbol }[] = [];
function keep(component: unknown): PropertyDecorator {
  return (_target, key) => { observed.push({ component, key }); };
}
export class Consumer {
  @keep(${component}) declare bar: unknown;
  @keep('computed') declare [${component}.key]: unknown;
}
`);
    assert.equal(f.plugin.program().getCompilerOptions().experimentalDecorators, true);
    assert.equal(f.plugin.diagnostics(), '');
    const emitted = f.plugin.emit(f.routeFile);
    assert.match(emitted, /__decorate/, 'the real legacy decorator emission must be exercised');
    const tslib = createRequire(import.meta.url)(path.join(valdiSourceRoot()!,
      'src/valdi_modules/src/valdi/valdi_core/src/tslib.js'));
    const { routes, load, loaded } = execute(f, { tslib });
    const exported = load(f.routeFile);
    const constructor = load(file)[component];
    assert.equal(exported.observed.length, 2);
    assert.equal(exported.observed[0].component, constructor);
    assert.equal(exported.observed[0].key, 'bar');
    assert.equal(exported.observed[1].component, 'computed');
    assert.equal(exported.observed[1].key, constructor.key);
    assert.equal(Object.hasOwn(new exported.Consumer(), 'bar'), false, 'declare does not create an instance field');
    assert.ok(loaded.includes(file), 'live decorator expressions must load the component');
    assert.ok(emitted.includes(`require("./${implementation}")`));
    if (component === 'AppTabBar') {
      assert.equal(routes.toHost().tabBar.component, 'AppTabBar@app_pages/src/AppTabBar');
    } else {
      assert.equal(routes.toHost().routes.find((route: any) => route.route === 'home').component,
        'HomePage@app_pages/src/DecoratedHomePage');
    }
  });

  for (const ambient of ['class', 'nested namespace']) {
    test(`ambient ${ambient} does not retain the metadata-only ${component} import`, async t => {
      const f = await fixture(t);
      if (component === 'AppTabBar') addCustomBar(f);
      const declaration = ambient === 'class'
        ? `export declare class DeclaredBar extends ${component} {}`
        : `export declare namespace Declared {
            namespace Nested { class DeclaredBar extends ${component} {} }
          }`;
      f.change(f.routeFile, text => `${text}\n${declaration}\n`);
      assert.equal(f.plugin.diagnostics(), '');
      const emitted = f.plugin.emit(f.routeFile);
      assert.ok(!emitted.includes(`require("./${component}")`),
        `erased ambient ${ambient} must not retain the ${component} runtime import`);
      const { routes, loaded } = execute(f);
      if (component === 'AppTabBar') {
        assert.equal(routes.toHost().tabBar.component, 'AppTabBar@app_pages/src/AppTabBar');
      } else {
        assert.equal(routes.toHost().routes.find((route: any) => route.route === 'home').component,
          'HomePage@app_pages/src/HomePage');
      }
      assert.ok(!loaded.some(file => file.endsWith(`/${component}.ts`) || file.endsWith(`/${component}.tsx`)));
    });
  }
}

test('remaining runtime values and class extends retain custom component imports', async t => {
  const f = await fixture(t);
  addCustomBar(f);
  const original = readFileSync(f.routeFile, 'utf8');
  for (const runtimeUse of [
    'export const businessConstructor = AppTabBar;',
    'export class DerivedBar extends AppTabBar {}',
    'export { AppTabBar as BusinessBar };',
    `export namespace Business {
      export declare namespace Declared { class DeclaredBar extends AppTabBar {} }
      export class DerivedBar extends AppTabBar {}
    }`,
  ]) {
    writeFileSync(f.routeFile, `${original}\nexport type BarInstance = AppTabBar;\n${runtimeUse}\n`);
    f.plugin.invalidate(f.routeFile);
    assert.equal(f.plugin.diagnostics(), '');
    assert.ok(/require\(["']\.\/AppTabBar["']\)/.test(f.plugin.emit(f.routeFile)),
      `remaining runtime use must retain the import: ${runtimeUse}`);
  }
});

test('explicit default bar uses the official container and carries no custom component', async t => {
  const f = await fixture(t);
  f.change(f.routeFile, text => text.replace('  tabs: {', "  tabs: {\n    bar: { type: 'default' },"));
  assert.equal(f.plugin.diagnostics(), '');
  const bar = execute(f).routes.toHost().tabBar;
  assert.equal(bar.mode, 'default');
  assert.equal(bar.component, undefined);
});

test('custom tab transformer rejects non-components, unexported classes, mode mismatches and dynamic config', async t => {
  const f = await fixture(t);
  const file = addCustomBar(f);
  const original = readFileSync(f.routeFile, 'utf8');
  const replaceBar = (bar: string) => original.replace("{ type: 'custom', component: AppTabBar }", bar);
  for (const [bar, error] of [
    ["{ type: 'custom', component: Date }", /tabs.bar.component must reference an exported @Component class/],
    ["{ type: 'custom', component: 'AppTabBar@app_pages/src/AppTabBar' }", /exported @Component class/],
    ["{ type: 'custom', component: () => undefined }", /exported @Component class/],
    ["{ type: 'custom' }", /component is required/],
    ["{ type: 'default', component: AppTabBar }", /only allowed for custom/],
    ["{ type: 'floating' }", /type must be default or custom/],
    ["{ type: 'custom', ...{ component: AppTabBar } }", /without spreads/],
    ["{ type: 'custom', component: AppTabBar, component: Date }", /Duplicate tabs.bar property/],
    ["{ mode: 'custom', component: AppTabBar }", /Unknown tabs.bar property/],
    ["AppTabBar", /must be an object literal/],
  ] as const) {
    writeFileSync(f.routeFile, replaceBar(bar));
    f.plugin.invalidate(f.routeFile);
    assert.throws(() => f.plugin.emit(f.routeFile), error);
  }
  writeFileSync(f.routeFile, original);
  f.plugin.invalidate(f.routeFile);
  f.change(file, text => text.replace('/** @Component', '/** Component'));
  assert.throws(() => f.plugin.emit(f.routeFile), /exported @Component class/);
  f.change(file, text => text.replace('/** Component', '/** @Component').replace('export class', 'class'));
  assert.throws(() => f.plugin.emit(f.routeFile), /exported/);
});

test('editor types enforce the default/custom discriminant and require a component class', async t => {
  const f = await fixture(t);
  const file = path.join(f.module.dir, 'src/tab-bar-types.ts');
  writeFileSync(file, `
import type { TabBarDefinition } from './navigation/config';
import { HomePage } from './HomePage';
const defaultBar: TabBarDefinition = { type: 'default' };
const customBar: TabBarDefinition = { type: 'custom', component: HomePage };
// @ts-expect-error custom requires a component
const missing: TabBarDefinition = { type: 'custom' };
// @ts-expect-error default cannot name a component
const mismatch: TabBarDefinition = { type: 'default', component: HomePage };
// @ts-expect-error modes are closed
const invalid: TabBarDefinition = { type: 'floating' };
// @ts-expect-error callbacks are not component classes
const callback: TabBarDefinition = { type: 'custom', component: () => undefined };
// @ts-expect-error canonical strings belong to generated metadata, not business source
const raw: TabBarDefinition = { type: 'custom', component: 'HomePage@app_pages/src/HomePage' };
`);
  f.plugin.invalidate(file);
  assert.equal(f.plugin.diagnostics(), '');
});

test('editor types reject unknown native/Valdi routes, wrong params/results, and non-tab names', async t => {
  const f = await fixture(t);
  const file = path.join(f.module.dir, 'src/navigation-types.ts');
  writeFileSync(file, `
import { router, Router, readParams } from './navigation';
import type { PageContext, PageViewModel } from './Page';
router.push('home');
router.push('picker');
router.push('detail', { id: 123, from: 'test' });
router.push('detail', { id: 123, from: 'test' }, { android: { animation: 'fade' } });
// @ts-expect-error route sheets are not a presentation mode
router.push('detail', { id: 123, from: 'test' }, 'sheet');
// @ts-expect-error compact route sheets are not a presentation mode
router.pushForResult('picker', {}, 'compactSheet');
// @ts-expect-error there is no separate presentation argument before options
router.push('detail', { id: 123, from: 'test' }, 'push', { animation: 'none' });
// @ts-expect-error unknown route
router.push('absent');
// @ts-expect-error required params cannot be omitted
router.push('detail');
// @ts-expect-error wrong param type
router.push('detail', { id: '123', from: 'test' });
// @ts-expect-error native page params are checked too
router.push('picker', { selected: 123 });
// @ts-expect-error only Tab routes are accepted
router.switchTab('detail');
router.pushForResult('picker').then(result => {
  if (!result) return;
  const value: string = result.value;
  // @ts-expect-error native result declaration is retained
  const wrong: number = result.value;
});
declare const context: PageContext;
declare const model: PageViewModel;
new Router(context).finish<'detail'>({ visited: 123 });
// @ts-expect-error result type is preserved despite the private native any map
new Router(context).finish<'detail'>({ visited: '123' });
const params = readParams<'detail'>(model);
const id: number = params.id;
// @ts-expect-error readParams returns route-specific data rather than any
const wrongId: string = params.id;
`);
  f.plugin.invalidate(file);
  assert.equal(f.plugin.diagnostics(), '', 'every expect-error must be consumed and valid calls must type-check');
});

test('tabs.initial is independently typed from items and must not widen the accepted Tab names', async t => {
  const f = await fixture(t);
  f.change(f.routeFile, text => text.replace("initial: 'home'", "initial: 'detail'"));
  assert.match(f.plugin.diagnostics(), /detail.*not assignable|not assignable.*detail/);
  assert.throws(() => f.plugin.emit(f.routeFile), /tabs.initial must name a route in tabs.items/);
});

test('default selection uses first item; duplicate and unknown Tab references fail before publishing', async t => {
  const f = await fixture(t);
  f.change(f.routeFile, text => text.replace("    initial: 'home',\n", ''));
  assert.equal(execute(f).routes.toHost().tabBar.initial, 'home');
  f.change(f.routeFile, text => text.replace("route: 'wheels'", "route: 'home'"));
  assert.throws(() => f.plugin.emit(f.routeFile), /Duplicate tab: "home"/);
  f.change(f.routeFile, text => text.replace("route: 'device'", "route: 'absent'"));
  assert.match(f.plugin.diagnostics(), /absent/);
});

test('old JSON declarations, non-components and unresolved image references are rejected with source positions', async t => {
  const f = await fixture(t);
  const original = readFileSync(f.routeFile, 'utf8');
  for (const [source, error] of [
    [original.replace("valdiPage({ component: HomePage, title: '首页' })", "{ kind: 'valdi', title: '首页', component: 'HomePage@app_pages/src/HomePage' }"), /legacy route JSON/],
    [original.replace('component: HomePage', 'component: Date'), /exported @Component class/],
    [original.replace('icon: res.tabHome,', 'icon: res.absent,'), /Unknown Tab image/],
  ] as const) {
    writeFileSync(f.routeFile, source);
    f.plugin.invalidate(f.routeFile);
    assert.throws(() => f.plugin.emit(f.routeFile), error);
  }
});

test('dev icon bytes change emitted routes and refresh the host; production references stay compact', async t => {
  const f = await fixture(t, true);
  const { routes, load, nativeNavigation } = execute(f);
  const host = routes.toHost();
  const data = host.tabBar.tabs[0].iconData;
  assert.ok(data && Buffer.from(data, 'base64').length > 0);
  assert.equal(host.tabBar.tabs[0].selectedIconData === undefined, false);
  const image = readdirSync(path.join(f.module.dir, 'res')).find(file => /^tab_home(?:@[\d.]+x)?\.png$/.test(file))!;
  assert.ok(image);
  writeFileSync(path.join(f.module.dir, 'res', image), Buffer.from('different image bytes'));
  f.plugin.invalidate(f.routeFile);
  assert.notEqual(execute(f).routes.toHost().tabBar.tabs[0].iconData, data);
  const updates: any[] = [];
  nativeNavigation.updateRoutes = (declaration: any) => updates.push(declaration);
  // Re-evaluate the actual helper to simulate a changed declaration arriving from the dev daemon.
  const config = load(path.join(f.module.dir, 'src/navigation/config.ts'));
  const changed = config.defineRoutes({ pages: routes.pages, tabs: { items: [{ route: 'home', text: 'Changed', icon: { name: 'tab_home', data } }] } });
  assert.equal(updates.length, 0, 'defining routes is side-effect free even with a native host installed');
  changed.publish('login');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].tabBar.tabs[0].text, 'Changed');
  assert.equal(updates[0].root, 'login');
  const prod = await fixture(t);
  assert.equal(execute(prod).routes.toHost().tabBar.tabs[0].iconData, undefined);
});
