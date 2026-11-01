import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appModule, appModules, writeTsconfig } from './pipeline';
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
  const routeFile = path.join(dir, 'src/routes.ts');
  const change = (file: string, transform: (text: string) => string) => {
    writeFileSync(file, transform(readFileSync(file, 'utf8')));
    plugin.invalidate(file);
  };
  return { module, plugin, routeFile, change };
}

/** Execute the actual emitted declaration/helpers; page implementations must never be required here. */
function execute(f: Awaited<ReturnType<typeof fixture>>) {
  const context = vm.createContext({});
  const cache = new Map<string, any>();
  const loaded: string[] = [];
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    loaded.push(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const require = (name: string) => {
      assert.ok(name.startsWith('.'), `route evaluation must not load page/native/npm modules: ${name}`);
      return load(path.resolve(path.dirname(file), `${name}.ts`));
    };
    vm.runInContext(`(function(require,module,exports){${f.plugin.emit(file)}\n})`, context, { filename: file })(
      require, module, module.exports,
    );
    return module.exports;
  };
  return { routes: load(f.routeFile).routes, load, loaded };
}

test('routes compile direct components/res to metadata, execute without loading any page, and preserve native aliases', async t => {
  const f = await fixture(t);
  assert.equal(f.plugin.diagnostics(), '');
  f.change(f.routeFile, text => text.replace("name: 'picker'", "name: 'app/device-picker'"));
  const { routes, loaded } = execute(f);
  const host = routes.toHost('login');
  assert.equal(host.root, 'login');
  assert.equal(routes.home, '$tabs');
  assert.equal(host.routes.home.component, 'HomePage@app_pages/src/HomePage');
  assert.equal(host.routes.calculator.component, 'CalculatorComponent@calculator/src/CalculatorComponent');
  assert.equal(host.routes.picker.nativeName, 'app/device-picker');
  assert.equal(host.tabBar.initial, 'home');
  assert.equal(host.tabBar.tabs[0].icon, 'tab_home');
  assert.equal(host.tabBar.tabs[0].selectedIcon, 'tab_home_on');
  assert.ok(loaded.every(file => ['/src/routes.ts', '/src/navigation/config.ts', '/src/NavigationHost.ts']
    .some(suffix => file.endsWith(suffix))), loaded.join('\n'));
  assert.throws(() => routes.assertRoute('absent'), /Unknown route: "absent"/);
  assert.throws(() => routes.assertTab('detail'), /Unknown tab/);
  f.change(path.join(f.module.dir, 'src/HomePage.tsx'), text => text.replace('export class HomePage', 'export default class HomePage'));
  f.change(f.routeFile, text => text.replace("import { HomePage } from './HomePage';", "import HomePage from './HomePage';"));
  assert.equal(f.plugin.diagnostics(), '');
  assert.equal(execute(f).routes.toHost().routes.home.component, 'default@app_pages/src/HomePage');
});

test('editor types reject unknown native/Valdi routes, wrong params/results, and non-tab names', async t => {
  const f = await fixture(t);
  const file = path.join(f.module.dir, 'src/navigation-types.ts');
  writeFileSync(file, `
import { router } from './navigation';
router.push('home');
router.push('picker');
router.push('detail', { id: 123, from: 'test' });
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
  const { routes, load } = execute(f);
  const host = routes.toHost();
  const data = host.tabBar.tabs[0].iconData;
  assert.ok(data && Buffer.from(data, 'base64').length > 0);
  assert.equal(host.tabBar.tabs[0].selectedIconData === undefined, false);
  const image = readdirSync(path.join(f.module.dir, 'res')).find(file => /^tab_home(?:@[\d.]+x)?\.png$/.test(file))!;
  assert.ok(image);
  writeFileSync(path.join(f.module.dir, 'res', image), Buffer.from('different image bytes'));
  f.plugin.invalidate(f.routeFile);
  assert.notEqual(execute(f).routes.toHost().tabBar.tabs[0].iconData, data);
  const updates: string[] = [];
  load(path.join(f.module.dir, 'src/NavigationHost.ts')).installNavigation({ updateRoutes: (json: string) => updates.push(json) });
  // Re-evaluate the actual helper to simulate a changed declaration arriving from the dev daemon.
  const config = load(path.join(f.module.dir, 'src/navigation/config.ts'));
  config.defineRoutes({ pages: routes.pages, tabs: { items: [{ route: 'home', text: 'Changed', icon: { name: 'tab_home', data } }] } });
  assert.equal(updates.length, 1);
  assert.equal(JSON.parse(updates[0]).tabBar.tabs[0].text, 'Changed');
  const prod = await fixture(t);
  assert.equal(execute(prod).routes.toHost().tabBar.tabs[0].iconData, undefined);
});
