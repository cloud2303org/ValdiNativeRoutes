import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG } from './codegen/index';
import { appModule, valdiSourceRoot } from './pipeline';

const app = appModule('app_pages');
const source = (name: string) => path.join(app.dir, 'src', name);

/** Execute real routing sources with native services supplied at their boundary. */
function routingRuntime() {
  const calls: any[][] = [];
  const globals: Record<string, any> = { calls };
  const context = vm.createContext(globals);
  const requireApp = createRequire(path.join(app.dir, 'package.json'));
  const cache = new Map<string, any>();
  const modules: Record<string, any> = {
    'valdi_core/src/Device': { Device: { getSystemType: () => 'android', isAndroid: () => true } },
    valibot: requireApp('valibot'),
  };
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${emitted}\n})`, context)(
      (name: string) => {
        if (modules[name]) return modules[name];
        if (name.startsWith('native_common/')) return load(path.join(appModule('native_common').dir, name.slice('native_common/'.length) + '.ts'));
        assert.ok(name.startsWith('.'), `Unexpected module: ${name}`);
        const resolved = path.resolve(path.dirname(file), name);
        return load(resolved.endsWith('/navigation') ? `${resolved}/index.ts` : `${resolved}.ts`);
      }, module, module.exports,
    );
    return module.exports;
  };
  const evaluate = (code: string) => vm.runInContext(code, context);
  globals.config = load(source('navigation/config.ts'));
  modules['../routes'] = evaluate(`({
    routes: config.defineRoutes({
      navigation: { android: { animation: 'slideRight', durationMs: 333 } },
      pages: {
        detail: config.nativePage({ name: 'detail', title: '详情' }),
        picker: config.nativePage({ name: 'picker', title: '选择' }),
      },
      tabs: { items: [{ route: 'detail', text: '详情', icon: { name: 'tab_home' } }] },
    }),
  })`);
  globals.host = load(source('NavigationHost.ts'));
  globals.navigation = load(source('navigation/index.ts'));
  globals.data = load(source('navigation/data.ts'));
  evaluate(`
    host.installNavigation({
      push: (...args) => calls.push(['push', ...args]),
      pushForResult: (...args) => calls.push(['pushForResult', ...args]),
      replace: (...args) => calls.push(['replace', ...args]),
      reset: (...args) => calls.push(['reset', ...args]),
      currentPages: done => { globalThis.returnPages = done; },
      updateRoutes: declaration => calls.push(['updateRoutes', declaration]),
    });
  `);
  return { evaluate, calls, globals, load };
}

test('tab bar config normalizes omitted/default modes, validates custom metadata, and publishes typed declarations', () => {
  const { evaluate, calls } = routingRuntime();
  evaluate(`
    globalThis.makeRoutes = bar => config.defineRoutes({
      pages: { home: config.nativePage({ name: 'home', title: 'Home' }) },
      tabs: { items: [{ route: 'home', text: 'Home', icon: { name: 'tab_home' } }], bar },
    });
  `);
  for (const bar of ['undefined', "{ type: 'default' }"]) {
    const host = evaluate(`makeRoutes(${bar}).toHost()`);
    assert.equal(host.tabBar.mode, 'default');
    assert.equal(host.tabBar.component, undefined);
    assert.equal(host.tabBar.initial, 'home');
  }
  const host = evaluate(`
    globalThis.customRoutes = makeRoutes({ type: 'custom', component: 'AppTabBar@app_pages/src/AppTabBar' });
    customRoutes.toHost();
  `);
  assert.equal(host.tabBar.mode, 'custom');
  assert.equal(host.tabBar.component, 'AppTabBar@app_pages/src/AppTabBar');
  assert.equal(calls.length, 0, 'constructing declarations does not publish');
  evaluate('customRoutes.publish()');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'updateRoutes');
  assert.equal(calls[0][1].tabBar.component, host.tabBar.component);
  for (const bar of [
    'null', '{}', "{ type: 'floating' }", "{ mode: 'custom' }",
    "{ type: 'default', component: 'AppTabBar@app_pages/src/AppTabBar' }",
    "{ type: 'default', component: undefined }", "{ type: 'custom' }",
    "{ type: 'custom', component: '' }", "{ type: 'custom', component: '  ' }",
    "{ type: 'custom', component: 'not-a-class-path' }",
    "{ type: 'custom', component: class AppTabBar {} }",
    "{ type: 'custom', component: () => {} }",
  ]) {
    assert.throws(() => evaluate(`makeRoutes(${bar})`), /tabs.bar/);
  }
  assert.equal(evaluate(`
    config.defineRoutes({ pages: { home: config.nativePage({ name: 'home', title: 'Home' }) } }).toHost().tabBar
  `), undefined);
});

test('typed router snapshots structured params/results without JSON transport and retains cancellation semantics', async () => {
  const { evaluate, calls } = routingRuntime();
  evaluate(`
    JSON.stringify = JSON.parse = () => { throw Error('JSON transport is forbidden'); };
    globalThis.payload = { id: 1.25, ok: true, label: '中文 🧭', nested: [null, false, { n: -4 }], optional: undefined };
    navigation.router.push('detail', payload);
    payload.nested[2].n = 99;
    navigation.router.replace('detail', payload);
    navigation.router.reset('detail', payload);
    navigation.router.resetToTabs('detail');
    globalThis.resultPromise = navigation.router.pushForResult('picker', payload);
  `);
  assert.equal(calls[0][2].label, '中文 🧭');
  assert.equal(calls[0][2].nested[2].n, -4);
  assert.equal(Object.hasOwn(calls[0][2], 'optional'), false);
  assert.equal(calls[0][4].durationMs, 333);
  assert.equal(calls[0][4].animation, 'slideRight');
  assert.equal(calls[1][2].nested[2].n, 99);
  assert.equal(calls[2][0], 'reset');
  assert.equal(calls[3][1], '$tabs');
  assert.equal(calls[3][2].tab, 'detail');
  const successful = evaluate(`
    globalThis.resultData = { value: '选中', nested: [null, 2, true] };
    calls[4][5](resultData, false);
    resultData.nested[1] = 9;
    resultPromise;
  `);
  assert.equal((await successful).nested[1], 2);
  const canceled = evaluate(`
    globalThis.canceled = navigation.router.pushForResult('picker');
    calls[5][5]({}, true);
    canceled;
  `);
  assert.equal(await canceled, undefined);
  evaluate(`
    globalThis.finished = undefined;
    globalThis.result = { value: '完成', nested: [true, null] };
    new navigation.Router({ finish: value => { globalThis.finished = value; }, back() {} }).finish(result);
    result.nested[0] = false;
  `);
  assert.equal(evaluate('finished.nested[0]'), true);
  const pages = evaluate(`
    globalThis.pagesPromise = navigation.router.getCurrentPages();
    globalThis.pages = [{ pageId: '1', route: 'detail', params: payload }];
    returnPages(pages);
    payload.nested[2].n = 100;
    pagesPromise;
  `);
  assert.equal((await pages)[0].params.nested[2].n, 99);
  assert.equal(evaluate(`navigation.readParams({ params: { id: 123 } }).id`), 123);
});

test('routing rejects non-data payloads before host calls and rejects invalid native callback data', async () => {
  const { evaluate, calls } = routingRuntime();
  for (const expression of [
    'null', '[]', '42', '{ callback() {} }', '{ nested: { callback() {} } }',
    '{ value: new Date() }', '{ value: NaN }', '{ value: Infinity }',
    '{ value: 1n }', '{ value: Symbol("x") }', '{ value: [undefined] }',
    'Object.assign({}, { [Symbol("x")]: 1 })',
    '(() => { const value = {}; value.self = value; return value; })()',
    '({ get value() { throw Error("getter was executed"); } })',
  ]) {
    assert.throws(() => evaluate(`navigation.router.push('detail', (${expression}))`), /Invalid route data/);
  }
  assert.equal(calls.length, 0);
  const promise = evaluate(`
    globalThis.invalidResult = navigation.router.pushForResult('picker');
    calls[0][5]({ value() {} }, false);
    invalidResult;
  `);
  await assert.rejects(promise, /Invalid route data/);
  assert.equal(evaluate(`
    globalThis.shared = { text: 'ok' };
    data.snapshotRouteData({ a: shared, b: shared }).b.text;
  `), 'ok', 'repeated noncyclic references are valid and copied independently');
});

test('startup stays synchronous, installs error handler first, initializes services before authenticated root selection', () => {
  for (const signedIn of [false, true]) {
    const events: string[] = [];
    const context = vm.createContext({ events, signedIn });
    const startupSource = ts.transpileModule(readFileSync(source('app.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} as any };
    const mocks: Record<string, any> = {
      'valdi_core/src/UncaughtErrorHandler': {
        UncaughtErrorHandlerResult: { CRASH_APPLICATION: 1, IGNORE: 0 },
        setCatchAllUncaughtErrorHandler: () => events.push('handler'),
      },
      'bluetooth/src/index': { initializeBluetooth: () => events.push('bluetooth') },
      './permissions/index': {},
      './api': { api: {} },
      './auth': {
        installAuth: () => events.push('auth'),
        auth: { isSignedIn: () => { events.push('signedIn'); return signedIn; } },
      },
      './db': { initializeAppDb: () => events.push('db') },
      './NavigationHost': { installNavigation: () => events.push('navigation') },
      './routes': { routes: { home: '$tabs', toHost: (root: string) => { events.push('declaration'); return { root }; } } },
      './theme': { installTheme: () => events.push('theme') },
    };
    mocks['valdi_core/src/ModuleLoaderGlobal'] = {
      getModuleLoader: () => ({
        load: (name: string) => mocks[name.replace('app_pages/src/', './')],
        onHotReload: () => () => {},
      }),
    };
    // This test validates startup order; the real loader test below exercises
    // development subscription ownership and reloads.
    vm.runInContext(`(function(require,module,exports){${startupSource}\n})`, context)(
      (name: string) => { assert.ok(mocks[name], name); return mocks[name]; }, module, module.exports,
    );
    const result = module.exports.startApp(false, {}, {});
    assert.equal(result.root, signedIn ? '$tabs' : 'login');
    assert.equal(typeof result.then, 'undefined');
    assert.deepEqual(events, ['handler', 'bluetooth', 'theme', 'auth', 'db', 'navigation', 'signedIn', 'declaration']);
  }
});

test('pinned lazy ModuleLoader publishes fresh routes after hot unload and disposes the app observer', () => {
  const upstream = valdiSourceRoot();
  assert.ok(upstream, 'the pinned Valdi source checkout must exist');
  const core = path.join(upstream, 'src/valdi_modules/src/valdi/valdi_core/src');
  const emit = (file: string) => ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const events: string[] = [];
  const updates: any[] = [];
  const globals: Record<string, any> = { runtime: { getCurrentPlatform: () => 1 }, events };
  const context = vm.createContext(globals);
  const evaluateModule = (code: string, require: any, module: any, exports: any) => {
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(require, module, exports);
  };
  const bootstrap: any = {};
  const loaderFile = path.join(core, 'ModuleLoader.ts');
  const loaderProgram = ts.createProgram([loaderFile], {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  });
  let loaderCode = '';
  loaderProgram.emit(loaderProgram.getSourceFile(loaderFile), (file, text) => {
    if (file.endsWith('.js')) loaderCode = text;
  });
  assert.ok(loaderCode, 'the real loader must emit through a type-aware program');
  evaluateModule(loaderCode, (id: string) => assert.fail(id), { exports: bootstrap }, bootstrap);
  const sources = new Map<string, string>([
    ['app_pages/src/app', emit(source('app.ts'))],
    ['app_pages/src/NavigationHost', emit(source('NavigationHost.ts'))],
    ['app_pages/src/navigation/config', emit(source('navigation/config.ts'))],
    ['valdi_core/src/ModuleLoaderGlobal', emit(path.join(core, 'ModuleLoaderGlobal.ts'))],
    ['valdi_core/src/UncaughtErrorHandler', `
      exports.UncaughtErrorHandlerResult = { CRASH_APPLICATION: 1, IGNORE: 0 };
      exports.setCatchAllUncaughtErrorHandler = () => events.push('handler');
    `],
    ['bluetooth/src/index', `exports.initializeBluetooth = () => events.push('bluetooth');`],
    ['app_pages/src/permissions/index', ''],
    ['app_pages/src/api', `exports.api = {};`],
    ['app_pages/src/db', `exports.initializeAppDb = () => events.push('db');`],
    ['app_pages/src/theme', `exports.installTheme = () => events.push('theme');`],
    ['app_pages/src/auth', `
      exports.installAuth = store => { globalThis.tokens = store; };
      exports.auth = { isSignedIn: () => globalThis.tokens.has() };
    `],
  ]);
  const routeSource = (title: string) => `
    const config = require('app_pages/src/navigation/config', true);
    exports.routes = config.defineRoutes({
      pages: {
        login: config.nativePage({ name: 'login', title: '登录' }),
        home: config.nativePage({ name: 'home', title: '${title}' }),
      },
      tabs: { items: [{ route: 'home', text: '${title}', icon: { name: 'tab_home' } }] },
    });
  `;
  sources.set('app_pages/src/routes', routeSource('初始'));
  const loader = bootstrap.create((id: string, require: any, module: any, exports: any) => {
    const code = sources.get(id);
    assert.notEqual(code, undefined, `unexpected module ${id}`);
    evaluateModule(code!, require, module, exports);
  }, undefined, undefined, false);
  globals.moduleLoader = loader;
  let signedIn = false;
  const tokens = { has: () => signedIn };
  const navigation = { updateRoutes: (value: any) => updates.push(value) };
  const start = loader.load('app_pages/src/app', true).startApp;
  assert.equal(start(true, navigation, tokens).root, 'login');
  assert.equal(start(true, navigation, tokens).root, 'login');
  assert.equal(updates.length, 0, 'initial startup only returns a declaration');
  sources.set('app_pages/src/routes', routeSource('替换'));
  const unloaded = loader.unload(['app_pages/src/routes'], true, true);
  assert.ok(unloaded.includes('app_pages/src/routes'));
  assert.equal(loader.isLoaded('app_pages/src/app'), true, 'route reload must retain its app observer');
  assert.equal(updates.length, 1, 'repeated start must not duplicate the observer');
  assert.equal(updates[0].tabBar.tabs[0].text, '替换', 'callback resolves replacement module exports');
  assert.equal(updates[0].root, 'login');
  signedIn = true;
  sources.set('app_pages/src/routes', routeSource('已登录'));
  loader.unload(['app_pages/src/routes'], true, true);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].root, '$tabs', 'reload consults current auth state');
  loader.unload(['app_pages/src/routes'], false, true);
  assert.equal(updates.length, 2, 'ordinary unload does not publish');
  loader.load('app_pages/src/routes', true);
  loader.unload(['app_pages/src/app'], false, true);
  sources.set('app_pages/src/routes', routeSource('结束'));
  loader.unload(['app_pages/src/routes'], true, true);
  assert.equal(updates.length, 2, 'unloading the observing app removes its reload callback');
});

test('real application generator exports fixed route models and dictionary schemas on Android, iOS and C++', () => {
  const target = codegenModules().app_pages;
  const code = generateNativeCode(target);
  const kotlin = [...nativeSourceFiles(target, code, 'android').values()].join('\n');
  const objc = [...nativeSourceFiles(target, code, 'ios').values()].join('\n');
  const cpp = [...nativeSourceFiles(target, code, 'cpp').values()].join('\n');
  assert.match(kotlin, /constructor\(routes: List<RouteEntry>, tabBar: RouteTabBar\? = null, root: String\)/);
  assert.match(kotlin, /constructor\(pageId: String, route: String, params: Map<String, Any\?>\)/);
  assert.match(kotlin, /constructor\(animation: String, durationMs: Double, presentation: String\)/);
  assert.match(kotlin, /constructor\(route: String, initial: String, tabs: List<RouteTab>, mode: String\? = null, component: String\? = null\)/);
  assert.match(kotlin, /constructor\(items: List<RouteTab>, selectedRoute: String, safeAreaBottom: Double\)/);
  assert.match(kotlin, /constructor\(selectTab: \(route: String\) -> Unit\)/);
  assert.match(kotlin, /class TabBarContextFactory/);
  assert.match(kotlin, /'route':s,'initial':s,'tabs':a<r:'\[0\]'>,'mode':s\?,'component':s\?/);
  assert.match(kotlin, /'items':a<r:'\[0\]'>,'selectedRoute':s,'safeAreaBottom':d/);
  assert.match(kotlin, /'selectTab':f\(s\)/);
  assert.match(kotlin, /onResult: \(result: Map<String, Any\?>, canceled: Boolean\) -> Unit/);
  assert.match(kotlin, /fun invoke\(debug: Boolean, navigation: NavigationHost, tokens: TokenStore\): RouteDeclaration/);
  assert.match(kotlin, /'params':m<s,u>/);
  assert.match(kotlin, /'push':f\(s, m<s,u>, s, r:/);
  assert.match(kotlin, /'currentPages':f\(f\(a<r:/);
  assert.match(objc, /NSArray<VRRouteEntry \*> \* _Nonnull routes/);
  assert.match(objc, /VRRouteTabBar \* _Nullable tabBar/);
  assert.match(objc, /@interface VRTabBarViewModel/);
  assert.match(objc, /@interface VRTabBarContext/);
  assert.deepEqual(JSON.parse(code.iosDependencyMetadata!).contexts.VRTabBarContext, [{
    injectable: false, name: 'selectTab', propertyAttribute: 'copy',
    qualifiedType: 'VRTabBarContextSelectTabBlock _Nonnull',
  }]);
  assert.match(objc, /NSArray<VRRouteTab \*> \* _Nonnull items/);
  assert.match(objc, /NSString \* _Nonnull selectedRoute/);
  assert.match(objc, /double safeAreaBottom/);
  assert.match(objc, /typedef void\(\^VRTabBarContextSelectTabBlock\)\(NSString \* _Nonnull route\)/);
  assert.match(objc, /NSDictionary <NSString \*, id> \* _Nonnull params/);
  assert.match(objc, /VRRouteDeclaration \* _Nonnull\(\^VRStartAppBlock\)/);
  assert.match(cpp, /RouteDeclaration\(const std::vector<RouteEntry> &routes, const Valdi::Ref<RouteTabBar> &tabBar, const Valdi::StringBox &root\)/);
  assert.match(cpp, /StackPage\(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::Ref<Valdi::ValueMap> &params\)/);
  assert.match(cpp, /RouteTabBar\(const Valdi::StringBox &route, const Valdi::StringBox &initial, const std::vector<RouteTab> &tabs, const std::optional<Valdi::StringBox> &mode, const std::optional<Valdi::StringBox> &component\)/);
  assert.match(cpp, /TabBarViewModel\(const std::vector<RouteTab> &items, const Valdi::StringBox &selectedRoute, double safeAreaBottom\)/);
  assert.match(cpp, /TabBarContext\(const SelectTabFn &selectTab\)/);
  for (const output of [kotlin, objc, cpp]) assert.doesNotMatch(output, /paramsJson|resultJson|navigationJson|routesJson/);
});

test('real compiler requires any dictionary spelling instead of Record for exported dynamic payloads', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'valdi-route-map-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'src'));
  const file = path.join(dir, 'src/model.ts');
  const build = (type: string) => {
    writeFileSync(file, `/** @ExportModel */\nexport interface Payload { params: ${type}; }\n`);
    return generateNativeCode({
      module: { name: 'route_fixture', dir, generatedDirs: [] },
      bundleInfo: { ...VALDI_PROJECT_CONFIG, name: 'route_fixture', iosModuleName: 'route_fixture', iosLanguage: 'objc', asyncStrictMode: false },
      program: () => ts.createProgram([file], { target: ts.ScriptTarget.ES2020, strict: true }),
    });
  };
  assert.throws(() => build('Record<string, unknown>'), /Unrecognized type '__type'/);
  const code = build('any');
  assert.match(code.sources.map(item => item.source.content).join('\n'), /m<s,u>/);
});
