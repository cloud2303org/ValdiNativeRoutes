import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../tools/valdi-rolldown/node_modules/typescript/lib/typescript.js';
import { buildModule, root } from '../../tools/valdi-rolldown/pipeline';
import { unpack } from '../../tools/valdi-rolldown/archive';
import { valdiTs } from '../../tools/valdi-rolldown/valdiTs';
import type { RouteDeclaration, StackPage } from '../../valdi/modules/app_pages/src/navigation/models';

const stage = path.join(root, '.tools/harmony/route-fixture');
const appPages = path.join(stage, 'app_pages');
const out = path.resolve(process.env.HARMONY_SMOKE_RAWFILE ??
  path.join(root, 'harmony/entry/src/main/resources/rawfile'));
const compiled = new Map<string, Buffer>();
for (const name of ['app_pages', 'harmony_smoke']) {
  const dir = path.join(stage, name);
  const module = { name, dir, generatedDirs: name === 'app_pages' ? [path.join(dir, '.gen')] : [],
    nodeModules: path.join(root, 'valdi/node_modules') };
  const built = await buildModule(module, valdiTs(module, undefined, true), true);
  for (const [file, bytes] of built.entries) compiled.set(`${name}/${file.slice(0, -3)}`, bytes);
}
const loaderFile = path.join(root,
  '.tools/harmony/upstream/src/valdi_modules/src/valdi/valdi_core/src/ModuleLoader.ts');
const loaderProgram = ts.createProgram([loaderFile], {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, skipLibCheck: true,
});
let loaderCode = '';
loaderProgram.emit(loaderProgram.getSourceFile(loaderFile), (file, text) => {
  if (file.endsWith('/ModuleLoader.js')) loaderCode = text;
});
assert.ok(loaderCode, 'pinned ModuleLoader must compile');
const runtimePlugin = valdiTs({
  name: 'app_pages', dir: appPages, generatedDirs: [path.join(appPages, '.gen')],
  nodeModules: path.join(root, 'valdi/node_modules'),
}, ts.ModuleKind.CommonJS, true);

/** Run real Rolldown outputs and the pinned loader, replacing only the native Device boundary. */
function contracts(lazy = true) {
  const loaded: string[] = [];
  const context = vm.createContext({
    console: { log() {} }, runtime: { isLoggingEnabled: false, getCurrentPlatform: () => 6 },
  });
  const evaluate = (name: string, require: unknown, module: unknown, exports: unknown) => {
    loaded.push(name);
    assert.ok(!/Page$|\/res$/.test(name), `declaration/bootstrap must not eagerly load pages or native assets: ${name}`);
    let code = compiled.get(name)?.toString();
    if (code === undefined) {
      const runtimeFile = path.join(root, '.tools/harmony/upstream/src/valdi_modules/src/valdi', `${name}.ts`);
      assert.ok(existsSync(runtimeFile), `unexpected dependency ${name}`);
      code = runtimePlugin.emit(runtimeFile);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: name })(
      require, module, exports,
    );
  };
  const loaderModule = { exports: {} as any };
  vm.runInContext(`(function(module,exports){${loaderCode}\n})`, context)(loaderModule, loaderModule.exports);
  const loader = new loaderModule.exports.ModuleLoader(evaluate, undefined, undefined, !lazy);
  context.moduleLoader = loader;
  loader.registerModule('valdi_core/src/Device', () =>
    ({ Device: { getSystemType: () => 'harmony', isAndroid: () => false } }));
  const load = (name: string): any =>
    loader.load(name.endsWith('/src/navigation') ? `${name}/index` : name, true);
  // Throws inside the app realm, so tests fail if any route bridge silently
  // encodes a typed value. Manifest/provenance JSON and UI debug labels are unrelated.
  const forbidRouteJSON = () => vm.runInContext(`
    JSON.stringify = () => { throw new Error('route transport called JSON.stringify'); };
    JSON.parse = () => { throw new Error('route transport called JSON.parse'); };
  `, context);
  // Native dictionary marshalling creates values in the application's JS realm.
  // Reproduce that boundary instead of passing Node's foreign Object.prototype.
  const inRealm = vm.runInContext(`(function copy(value) {
    if (value === null || typeof value !== 'object') return value;
    const out = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) out[key] = copy(value[key]);
    return out;
  })`, context) as <T>(value: T) => T;
  const reloadRoutes = () => loader.unload(['app_pages/src/routes'], true, false);
  return { load, loaded, forbidRouteJSON, inRealm, reloadRoutes };
}

test('scoped app_pages keeps shared routing sources byte-identical and builds real HBC99 entries', () => {
  const info = JSON.parse(readFileSync(path.join(out, 'modules/build-info.json'), 'utf8'));
  assert.equal(info.profile, 'smoke');
  assert.deepEqual(info.bootstrap, { module: 'harmony_smoke/src/app', export: 'start',
    arguments: [], returns: 'RouteDeclaration',
    publication: 'updateRoutes receives exactly the returned typed declaration once' });
  assert.deepEqual(info.routing, { abi: 'typed-v1', declaration: 'RouteDeclaration', routes: 'RouteEntry[]',
    params: 'any (UNTYPED_MAP)', results: 'any (UNTYPED_MAP)', currentPages: 'StackPage[]' });
  assert.deepEqual(readFileSync(path.join(out, 'valdi/build-info.json')),
    readFileSync(path.join(out, 'modules/build-info.json')));
  for (const file of ['NavigationHost.ts', 'Page.ts', 'PageComponent.ts', 'TabBar.ts',
    'navigation/config.ts', 'navigation/index.ts', 'navigation/options.ts', 'navigation/models.ts', 'navigation/data.ts']) {
    assert.deepEqual(readFileSync(path.join(appPages, 'src', file)),
      readFileSync(path.join(root, 'valdi/modules/app_pages/src', file)), file);
  }
  assert.deepEqual(readFileSync(path.join(stage, 'harmony_smoke/src/app.ts')),
    readFileSync(path.join(root, 'harmony/smoke/src/app.ts')), 'current typed bootstrap staged unchanged');
  for (const file of ['routes.ts', 'SmokePage.tsx', 'SecondTabPage.tsx']) {
    assert.deepEqual(readFileSync(path.join(appPages, 'src', file)),
      readFileSync(path.join(root, 'harmony/smoke/app_pages/src', file)), file);
  }
  for (const module of ['app_pages', 'harmony_smoke']) {
    const entries = unpack(readFileSync(path.join(out, 'modules', `${module}.valdimodule`)));
    assert.ok(entries.has(module === 'app_pages' ? 'src/routes.js' : 'src/app.js'));
    for (const [name, bytes] of entries) {
      if (!name.endsWith('.js')) continue;
      assert.equal(bytes.readUInt32LE(0), 0x0100c634, `${module}/${name} precompiled module`);
      assert.equal(bytes.readBigUInt64LE(4), 0x1f1903c103bc1fc6n, `${module}/${name} HBC magic`);
      assert.equal(bytes.readUInt32LE(12), 99, `${module}/${name} HBC version`);
    }
  }
});

test('Harmony packages an actual Valdi asset catalog, font bytes and native image files', () => {
  const entries = unpack(readFileSync(path.join(out, 'modules/app_pages.valdimodule')));
  assert.ok(entries.has('res.assetcatalog'));
  const font = entries.get('res/roboto_mono_regular.ttf');
  assert.ok(font && font.length > 1000, 'module owns packaged font bytes');
  const catalog = entries.get('res.assetcatalog')!;
  assert.ok(catalog.includes(Buffer.from('tab_home')));
  assert.ok(catalog.includes(Buffer.from('roboto_mono_regular')));
  for (const name of ['tab_home', 'tab_home_on', 'tab_components', 'tab_components_on']) {
    assert.deepEqual(readFileSync(path.join(out, 'assets/app_pages', `${name}.png`)),
      readFileSync(path.join(root, 'valdi/modules/app_pages/res', `${name}@3x.png`)));
  }
});

for (const lazy of [false, true]) test(`typed smoke startup (${lazy ? 'pinned lazy' : 'eager'} loader) and explicit live publication avoid route JSON`, () => {
  const f = contracts(lazy);
  const updates: RouteDeclaration[] = [];
  const host = f.load('app_pages/src/NavigationHost');
  host.installNavigation({ updateRoutes: (value: RouteDeclaration) => updates.push(value) });
  f.forbidRouteJSON();
  const app = f.load('harmony_smoke/src/app');
  assert.equal(updates.length, 0, 'defineRoutes has no native publication side effect');
  const declaration: RouteDeclaration = app.start();
  assert.equal(app.start(), declaration, 'startup retains the exact object');
  assert.equal(updates.length, 1, 'startup publishes once');
  assert.equal(updates[0], declaration);
  assert.equal(declaration.root, '$tabs');
  assert.equal(declaration.tabBar!.initial, 'home');
  assert.ok(Array.isArray(declaration.routes));
  for (const [route, component] of Object.entries({
    home: 'HomePage', second: 'SecondTabPage', detail: 'DetailPage', stack: 'StackPage', reset: 'ResetPage',
    animation: 'AnimationPage', gesture: 'GesturePage', scroll: 'ScrollPage', image: 'ImagePage', input: 'InputPage',
    tabBar: 'TabBarPage',
    foundation: 'FoundationPage', snapshot: 'SnapshotPage', refresh: 'RefreshPage',
  })) {
    assert.equal(declaration.routes.find(entry => entry.route === route)?.component,
      `${component}@app_pages/src/${component}`);
  }
  for (const tab of declaration.tabBar!.tabs) {
    for (const [name, data] of [[tab.icon, tab.iconData], [tab.selectedIcon, tab.selectedIconData]]) {
      const original = readFileSync(path.join(root, 'valdi/modules/app_pages/res', `${name}@3x.png`));
      assert.deepEqual(readFileSync(path.join(out, 'tab-icons', `${name}.png`)), original);
      assert.deepEqual(Buffer.from(data!, 'base64'), original);
    }
  }
  const { routes } = f.load('app_pages/src/routes');
  const changed: RouteDeclaration = routes.toHost();
  changed.tabBar!.tabs[1].text = 'Updated';
  host.publishRoutes(changed);
  assert.equal(updates.length, 2);
  assert.equal(updates[1], changed);
  assert.equal(updates[1].tabBar!.tabs[1].text, 'Updated');
  routes.publish();
  assert.equal(updates.length, 3, 'hot reload explicitly publishes its declaration');
  assert.equal(updates[2].root, '$tabs');
  routes.publish('reset');
  assert.equal(updates.at(-1)!.root, 'reset', 'explicit root selection stays typed');
  f.reloadRoutes();
  assert.equal(updates.length, 5, 'the actual ModuleLoader reload callback explicitly republishes');
  assert.equal(updates.at(-1)!.root, '$tabs');
  assert.equal(f.loaded.filter(name => name === 'app_pages/src/routes').length, 2, 'fresh route exports loaded');
  f.reloadRoutes();
  assert.equal(updates.length, 6, 'reload observation survives repeated route replacement');
});

test('real Router forwards nested typed params/results/options and stack values with finish/cancel and no JSON', async () => {
  const f = contracts();
  const calls: [string, ...any[]][] = [];
  let onResult!: (result: Record<string, unknown>, canceled: boolean) => void;
  const pages: StackPage[] = [
    { pageId: 'root', route: '$tabs', params: {} },
    { pageId: 'detail', route: 'detail', params: { id: 7, from: 'home', nested: { list: [null, true, 2, '值'] } } },
  ];
  const host = Object.fromEntries(['push', 'replace', 'back', 'popToRoot', 'reset', 'switchTab', 'setStatusBarStyle', 'updateRoutes']
    .map(name => [name, (...args: any[]) => calls.push([name, ...args])]));
  f.load('app_pages/src/NavigationHost').installNavigation({
    ...host,
    pushForResult: (...args: any[]) => { onResult = args.pop(); calls.push(['pushForResult', ...args]); },
    currentPages: (done: (pages: StackPage[]) => void) => done(f.inRealm(pages)),
  });
  const { Router, router, readParams } = f.load('app_pages/src/navigation');
  const page = new Router({
    finish: (result: Record<string, unknown>) => onResult(result, false),
    back: () => onResult({}, true),
  });
  f.forbidRouteJSON();
  const params = f.inRealm({ id: 7, from: 'home',
    metadata: { labels: ['中文', 'quoted "value"'], flags: { enabled: false, missing: null }, scores: [0, -3, 1.5] } });
  const result = { visited: 7, details: { labels: ['done', ''], flags: { accepted: true, missing: null } } };
  const finished = router.pushForResult('detail', params);
  page.finish(f.inRealm(result));
  assert.deepEqual(structuredClone(await finished), result);
  assert.deepEqual(structuredClone(calls.find(call => call[0] === 'pushForResult')![2]), structuredClone(params));
  const empty = router.pushForResult('detail', f.inRealm({ id: 1, from: 'empty' }));
  page.finish(f.inRealm({}));
  assert.deepEqual(structuredClone(await empty), {}, 'a successful empty object is not cancellation');
  const canceled = page.pushForResult('detail', f.inRealm({ id: 8, from: 'second' }));
  page.back();
  assert.equal(await canceled, undefined);
  assert.deepEqual(structuredClone(readParams({ params })), structuredClone(params));
  router.push('detail', f.inRealm({ id: 9, from: 'push' }));
  router.replace('detail', f.inRealm({ id: 42, from: 'replace' }));
  router.back(2);
  router.popToRoot();
  router.reset('reset', f.inRealm({ from: 'stack' }));
  router.resetToTabs('home');
  router.switchTab('second');
  assert.deepEqual(structuredClone(await router.getCurrentPages()), pages);
  assert.equal(await router.canGoBack(), true);
  const push = calls.find(call => call[0] === 'push')!;
  assert.equal(push[1], 'detail');
  assert.deepEqual(structuredClone(push[2]), { id: 9, from: 'push' });
  assert.deepEqual(structuredClone(push[4]), { animation: 'default', durationMs: 300, presentation: 'push' });
  assert.deepEqual(calls.filter(call => ['replace', 'back', 'popToRoot', 'reset', 'switchTab'].includes(call[0])).map(call => call.slice(0, 2)),
    [['replace', 'detail'], ['back', 2], ['popToRoot'], ['reset', 'reset'], ['reset', '$tabs'], ['switchTab', 'second']]);
});
