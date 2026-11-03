import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../tools/valdi-rolldown/node_modules/typescript/lib/typescript.js';
import { unpack } from '../../tools/valdi-rolldown/archive';
import {
  buildBusiness, defaultBusinessBindings, defaultBusinessOut, defaultBusinessStage, runtimeNames,
} from '../../tools/valdi-rolldown/harmony-business';
import { buildModule, root } from '../../tools/valdi-rolldown/pipeline';
import { valdiTs } from '../../tools/valdi-rolldown/valdiTs';
import type { RouteDeclaration } from '../../valdi/modules/app_pages/src/navigation/models';

const info = JSON.parse(readFileSync(path.join(defaultBusinessOut, 'build-info.json'), 'utf8'));
const moduleNames = info.modules.filter((name: string) => !runtimeNames.includes(name)) as string[];
// Execute the real Rolldown outputs before HBC compilation, including bundled
// valibot. Only native/runtime boundaries are replaced; no business app/auth,
// routes, BLE/Wi-Fi/NFC implementations or pages are replaced.
const compiled = new Map<string, Buffer>();
const plugins = new Map(moduleNames.map(name => {
  const dir = path.join(defaultBusinessStage, name);
  return [name, valdiTs({ name, dir, generatedDirs: [path.join(dir, '.gen')],
    nodeModules: path.join(root, 'valdi/node_modules') }, undefined, true)] as const;
}));
for (const [name, plugin] of plugins) {
  const dir = path.join(defaultBusinessStage, name);
  const built = await buildModule({ name, dir, generatedDirs: [path.join(dir, '.gen')],
    nodeModules: path.join(root, 'valdi/node_modules') }, plugin, true);
  for (const [file, bytes] of built.entries) compiled.set(`${name}/${file.slice(0, -3)}`, bytes);
}
const runtimePlugin = valdiTs({
  name: 'app_pages', dir: path.join(defaultBusinessStage, 'app_pages'),
  generatedDirs: [path.join(defaultBusinessStage, 'app_pages/.gen')],
  nodeModules: path.join(root, 'valdi/node_modules'),
}, ts.ModuleKind.CommonJS, true);
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

function contracts(signedIn = false, failBle = false, lazy = true) {
  const calls: [string, ...unknown[]][] = [];
  const updates: RouteDeclaration[] = [];
  const loaded: string[] = [];
  let token = signedIn ? 'test-only.stored-session' : '';
  let events: Record<string, (value: any) => void> | undefined;
  const nativeBle = {
    setEvents: (value: typeof events) => { events = value; calls.push(['ble.events']); },
  };
  const tokens = {
    has: () => { calls.push(['tokens.has']); return !!token; },
    read: () => { calls.push(['tokens.read']); return token; },
    write: (value: string) => { calls.push(['tokens.write', value]); token = value; },
    clear: () => { calls.push(['tokens.clear']); token = ''; },
  };
  const navigation = {
    ...Object.fromEntries([
      'push', 'pushForResult', 'replace', 'back', 'popToRoot', 'reset',
      'switchTab', 'setStatusBarStyle', 'currentPages',
    ].map(name => [name, (...args: unknown[]) => calls.push([name, ...args])])),
    updateRoutes: (declaration: RouteDeclaration) => { calls.push(['routes.update']); updates.push(declaration); },
  };
  const appUI = Object.fromEntries([
    'showModal', 'showActionSheet', 'showPicker', 'showDatePicker', 'showBottomSheet', 'previewImage',
    'scanCode', 'pickAttachments', 'clearAttachmentCache', 'showToast', 'hideToast', 'showLoading', 'hideLoading',
  ].map(name => [name, () => { throw new Error(`UI action outside startup test: ${name}`); }]));
  const permissionHost = {
    check: async () => false, requestMultiple: async () => [], openSettings: async () => {},
  };
  const wifi: Record<string, (...args: any[]) => unknown> = Object.fromEntries([
    'startWifi', 'stopWifi', 'connectWifi', 'getWifiList', 'getConnectedWifi', 'setWifiList',
    'getLocationPermissionState', 'requestLocationPermission',
  ].map(name => [name, () => { throw new Error(`Wi-Fi action outside startup test: ${name}`); }]));
  wifi.setEvents = (events: unknown) => { calls.push(['wifi.events', events]); };
  const nfc: Record<string, (...args: any[]) => unknown> = Object.fromEntries([
    'getAvailability', 'startDiscovery', 'stopDiscovery', 'connect', 'close', 'isConnected', 'transceive',
    'getMaxTransceiveLength', 'setTimeout', 'getAtqa', 'getSak', 'getHistoricalBytes', 'writeNdefMessage',
  ].map(name => [name, () => { throw new Error(`NFC action outside startup test: ${name}`); }]));
  nfc.setEvents = (events: unknown) => { calls.push(['nfc.events', events]); };
  // Models only the synchronous native boundary; real storage.ts owns JSON,
  // validation and ApiError behavior. Native SQLite persistence has separate QA.
  const storageValues = new Map<string, string>();
  const storageHost = {
    get: (key: string) => { calls.push(['storage.get', key]); return storageValues.get(key) ?? ''; },
    set: (key: string, json: string) => { calls.push(['storage.set', key, json]); storageValues.set(key, json); return true; },
    remove: (key: string) => { calls.push(['storage.remove', key]); storageValues.delete(key); },
    clear: () => { calls.push(['storage.clear']); storageValues.clear(); },
  };
  const runtime = {
    isLoggingEnabled: false,
    getCurrentPlatform: () => 6,
    configureColorPalette: (name: string) => calls.push(['palette', name]),
    setActiveColorPalette: (name: string) => calls.push(['palette.active', name]),
    setUncaughtExceptionHandler: (handler: unknown) => calls.push(['uncaught.handler', handler]),
    setUnhandledRejectionHandler: (handler: unknown) => calls.push(['rejection.handler', handler]),
  };
  const state: Record<string, any> = {
    runtime, console: { log() {}, error() {}, warn() {} },
    __valdiRoutesStorageHost: storageHost,
    __harmonyBusinessBootstrap: { debug: false, navigation, tokens, appUI, permissions: permissionHost, wifi, nfc },
  };
  const context = vm.createContext(state);
  const native: Record<string, unknown> = {
    'valdi_core/src/Device': { Device: {
      getSystemType: () => 'harmony', isAndroid: () => false, isDarkMode: () => false,
      observeDarkMode: () => { calls.push(['darkMode.observe']); return { cancel() {} }; },
    } },
    // The test runs without a native debugger transport. ClientSQLDebug remains
    // the real pinned implementation, with its provider registration boundary.
    'valdi_core/src/debugging/DebuggerProvider': {
      DebuggerProviderKind: { Sql: 'sql' },
      createDebuggerProviderOwner: () => ({ register: () => ({ dispose() {}, notifyChange() {} }) }),
    },
    'bluetooth/src/Bluetooth': { getHost: () => {
      calls.push(['ble.getHost']);
      assert.equal(state.__valdiRoutesNavigationHost, undefined, 'navigation must be absent during BLE/app initialization');
      assert.equal(state.__valdiRoutesTokenStore, tokens, 'tokens installed before real startup');
      assert.equal(state.__valdiRoutesAppUIHost, appUI, 'AppUI installed before real startup');
      assert.equal(state.__valdiRoutesPermissionHost.host, permissionHost, 'permissions installed before real startup');
      assert.equal(state.__valdiRoutesWifiHost, wifi, 'Wi-Fi installed before real startup');
      assert.equal(state.__valdiRoutesNfcHost, nfc, 'NFC installed before real startup');
      if (failBle) throw new Error('native BLE unavailable in test');
      return nativeBle;
    } },
    'client_sql/src/ClientSQLNative': { openDatabase: (...args: unknown[]) => {
      calls.push(['db.open', ...args]);
      return {};
    } },
  };
  const evaluate = (name: string, require: unknown, module: unknown, exports: unknown) => {
    loaded.push(name);
    assert.ok(!/\/[^/]*Page$|\/res$/.test(name), `startup must not eagerly load pages/assets: ${name}`);
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
  // Run the pinned loader itself: require() normally returns its lazy proxy;
  // require(path, true) forces evaluation. Eager CommonJS alone hid the race.
  const loaderModule = { exports: {} as any };
  vm.runInContext(`(function(module,exports){${loaderCode}\n})`, context)(
    loaderModule, loaderModule.exports,
  );
  const loader = new loaderModule.exports.ModuleLoader(evaluate, undefined, undefined, !lazy);
  state.moduleLoader = loader;
  for (const [name, value] of Object.entries(native)) {
    loader.registerModule(name, () => { loaded.push(name); return value; });
  }
  const load = (requested: string): any =>
    loader.load(requested.endsWith('/src/navigation') ? `${requested}/index` : requested, true);
  const start = (debug = false) => {
    state.__harmonyBusinessBootstrap.debug = debug;
    return load('harmony_business/src/app').start();
  };
  const forbidRouteJSON = () => vm.runInContext(`
    JSON.stringify = () => { throw new Error('route transport called JSON.stringify'); };
    JSON.parse = () => { throw new Error('route transport called JSON.parse'); };
  `, context);
  return {
    load, start, state, calls, updates, loaded, navigation, tokens, appUI, permissionHost, wifi, nfc, forbidRouteJSON,
    storageHost, storageValues, events: () => events,
    reloadRoutes: () => loader.unload(['app_pages/src/routes'], true, false),
  };
}

test('every business/runtime archive contains actual HBC99 and matches the successful build proof', () => {
  assert.equal(info.schemaVersion, 1);
  assert.equal(info.profile, 'business');
  const markerBytes = readFileSync(path.join(defaultBusinessOut, 'valdi/build-info.json'));
  assert.ok(markerBytes.length < 4096, 'native profile marker stays small; full provenance is separate');
  const marker = JSON.parse(markerBytes.toString());
  for (const key of ['schemaVersion', 'profile', 'valdiCommit', 'engine', 'hbcVersion', 'platform', 'modules', 'bootstrap', 'routing']) {
    assert.deepEqual(marker[key], info[key], key);
  }
  assert.deepEqual(info.bootstrap, {
    module: 'harmony_business/src/app', export: 'start',
    arguments: [], payloadGlobal: '__harmonyBusinessBootstrap',
    returns: 'RouteDeclaration',
    injects: ['__valdiRoutesTokenStore', '__valdiRoutesAppUIHost', '__valdiRoutesPermissionHost',
      '__valdiRoutesWifiHost', '__valdiRoutesNfcHost'],
    publication: 'updateRoutes receives exactly the unmodified typed app.startApp return once',
  });
  assert.deepEqual(info.routing, { abi: 'typed-v1', declaration: 'RouteDeclaration', routes: 'RouteEntry[]',
    params: 'any (UNTYPED_MAP)', results: 'any (UNTYPED_MAP)', currentPages: 'StackPage[]' });
  assert.equal(info.valdiCommit, '15feb6530ceecb971f4c8519ea8ab77474b959db');
  assert.equal(info.runtimeExecuted, false);
  assert.deepEqual(info.modules, [...runtimeNames, 'app_pages', 'bluetooth', 'calculator', 'harmony_business']);
  for (const name of info.modules) {
    const archive = readFileSync(path.join(defaultBusinessOut, 'modules', `${name}.valdimodule`));
    assert.equal(createHash('sha256').update(archive).digest('hex'), info.moduleProof[name].sha256);
    let count = 0;
    for (const [file, bytes] of unpack(archive)) {
      if (!file.endsWith('.js')) continue;
      assert.equal(bytes.readUInt32LE(0), 0x0100c634, `${name}/${file}`);
      assert.equal(bytes.readBigUInt64LE(4), 0x1f1903c103bc1fc6n, `${name}/${file}`);
      assert.equal(bytes.readUInt32LE(12), 99, `${name}/${file}`);
      count++;
    }
    assert.equal(count, info.moduleProof[name].hbcEntries);
    assert.equal(info.moduleProof[name].diagnostics, 0);
  }
  const app = unpack(readFileSync(path.join(defaultBusinessOut, 'modules/app_pages.valdimodule')));
  for (const file of ['app', 'LoginPage', 'HomePage', 'DevicePage', 'BlePage',
    'wifi/wechat', 'nfc/adapter', 'sqlgen/AppDb', 'navigation/index']) {
    assert.ok(app.has(`src/${file}.js`), file);
  }
});

test('staged sources are unchanged copies and native-only module paths remain native factory dependencies', () => {
  for (const [relative, hash] of Object.entries(info.localInputs)) {
    const bytes = readFileSync(path.join(root, relative));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, relative);
    const match = /^valdi\/modules\/([^/]+)\/((?:src|res)\/.*)$/.exec(relative);
    if (match) assert.deepEqual(readFileSync(path.join(defaultBusinessStage, match[1], match[2])), bytes, relative);
  }
  for (const [owner, nativePath] of [
    ['bluetooth', 'bluetooth/src/Bluetooth'],
    ['calculator', 'calculator/src/Calculator'],
    ['app_pages', 'app_pages/src/cpp/Cpp'],
  ]) {
    const entries = unpack(readFileSync(path.join(defaultBusinessOut, 'modules', `${owner}.valdimodule`)));
    assert.ok(!entries.has(`${nativePath.split('/').slice(1).join('/')}.js`), 'native module must not be a JS fake');
    assert.ok(info.moduleProof[owner].requires.some((specifier: string) =>
      specifier === nativePath || specifier === `./${nativePath.split('/').at(-1)}`));
    const cpp = readFileSync(path.join(defaultBusinessBindings, 'valdi_modules', owner, `${owner}.cpp`), 'utf8');
    assert.ok(cpp.includes(`fromCString("${nativePath}")`));
  }
});

test('resources include all three real tab pairs plus the actual calculator asset', () => {
  const tabs = readdirSync(path.join(root, 'valdi/modules/app_pages/res'));
  assert.equal(tabs.length, 6);
  for (const file of tabs) {
    const name = file.replace('@3x', '');
    const original = readFileSync(path.join(root, 'valdi/modules/app_pages/res', file));
    assert.deepEqual(readFileSync(path.join(defaultBusinessOut, 'tab-icons', name)), original);
    assert.deepEqual(readFileSync(path.join(defaultBusinessOut, 'assets/app_pages', name)), original);
  }
  assert.deepEqual(readFileSync(path.join(defaultBusinessOut, 'assets/calculator/calculator.png')),
    readFileSync(path.join(root, 'valdi/modules/calculator/res/calculator@3x.png')));
});

for (const [lazy, signedIn] of [[false, false], [false, true], [true, false], [true, true]]) {
  test(`real startApp (${lazy ? 'lazy Valdi' : 'eager CommonJS'}) selects ${signedIn ? '$tabs' : 'login'} and publishes once after token inspection`, () => {
    const f = contracts(signedIn, false, lazy);
    f.load('harmony_business/src/app');
    assert.deepEqual(f.loaded, ['harmony_business/src/app'], 'bootstrap evaluation must not import app/routes');
    assert.equal(f.updates.length, 0);
    assert.equal(f.state.__valdiRoutesNavigationHost, undefined);
    const declaration: RouteDeclaration = f.start(false);
    assert.equal(typeof (declaration as any)?.then, 'undefined', 'bootstrap must stay synchronous');
    assert.deepEqual(f.updates, [declaration], 'only the auth-selected declaration reaches native');
    assert.equal(f.updates[0], declaration, 'native receives the exact returned object');
    assert.equal(declaration.root, signedIn ? '$tabs' : 'login');
    assert.ok(Array.isArray(declaration.routes));
    const entries = new Map(declaration.routes.map(entry => [entry.route, entry]));
    assert.equal(entries.get('login')?.component, 'LoginPage@app_pages/src/LoginPage');
    assert.equal(entries.get('home')?.component, 'HomePage@app_pages/src/HomePage');
    assert.equal(entries.get('calculator')?.component, 'CalculatorComponent@calculator/src/CalculatorComponent');
    assert.equal(entries.get('picker')?.nativeName, 'picker');
    assert.equal(declaration.tabBar!.tabs.length, 3);
    for (const tab of declaration.tabBar!.tabs) {
      assert.deepEqual(Buffer.from(tab.iconData!, 'base64'),
        readFileSync(path.join(defaultBusinessOut, 'tab-icons', `${tab.icon}.png`)));
    }
    assert.equal(f.state.__valdiRoutesNavigationHost, f.navigation);
    assert.equal(f.state.__valdiRoutesTokenStore, f.tokens);
    assert.equal(f.state.__valdiRoutesAppUIHost, f.appUI);
    assert.equal(f.state.__valdiRoutesPermissionHost.host, f.permissionHost);
    assert.equal(f.state.__valdiRoutesPermissionHost.androidSdk, 0);
    assert.equal(f.state.__valdiRoutesWifiHost, f.wifi);
    assert.equal(f.state.__valdiRoutesNfcHost, f.nfc);
    assert.equal(f.calls.filter(([name]) => name === 'wifi.events').length, 1);
    assert.equal(f.calls.filter(([name]) => name === 'nfc.events').length, 1);
    assert.equal(f.state.__valdiRoutesDeclaration, declaration);
    assert.ok(f.calls.some(([name]) => name === 'db.open'));
    assert.ok(f.calls.some(([name]) => name === 'ble.events'));
    assert.equal(f.calls.filter(([name]) => name === 'tokens.has').length, 1);
    assert.ok(f.calls.findIndex(([name]) => name === 'tokens.has') <
      f.calls.findIndex(([name]) => name === 'routes.update'));
    assert.ok(f.calls.findIndex(([name]) => name === 'db.open') <
      f.calls.findIndex(([name]) => name === 'routes.update'), 'Home database is ready synchronously');
    assert.ok(f.calls.findIndex(([name]) => name === 'uncaught.handler') <
      f.calls.findIndex(([name]) => name === 'ble.getHost'), 'error handler precedes service initialization');
    assert.equal(f.calls.filter(([name]) => name === 'tokens.read').length, 0, 'auth root uses has, not read');
    assert.equal(f.events(), f.load('bluetooth/src/events').bleEvents);
    assert.equal(f.state.catchAllErrorHandler(false, new Error('test')), 1, 'real release handler ignores');
    assert.equal(typeof f.load('app_pages/src/api').api.startWifi, 'function');
    assert.equal(typeof f.load('app_pages/src/api').api.getNFCAdapter, 'function');
    assert.equal(f.updates.length, 1);
    const callCount = f.calls.length;
    assert.equal(f.start(false), declaration, 'duplicate start returns the original object');
    assert.equal(f.calls.length, callCount, 'duplicate start has no initialization or native publication');
    assert.equal(f.updates.length, 1);
  });
}

test('lazy defineRoutes is pure after navigation installation; explicit live updates publish typed declarations', () => {
  const f = contracts();
  const { installNavigation } = f.load('app_pages/src/NavigationHost');
  let installedNavigation: any;
  const navigationModule = f.load('app_pages/src/NavigationHost');
  navigationModule.installNavigation = (host: unknown) => {
    assert.ok(!f.loaded.includes('app_pages/src/routes'), 'routes must still be unevaluated at installNavigation');
    installedNavigation = host;
    installNavigation(host);
  };
  const publishRoutes = navigationModule.publishRoutes;
  navigationModule.publishRoutes = () => {
    throw new Error('startup defineRoutes/startApp must not publish');
  };
  const declaration: RouteDeclaration = f.start();
  assert.equal(declaration.root, 'login');
  assert.deepEqual(f.updates, [declaration]);
  assert.equal(installedNavigation, f.navigation, 'startup installs the real host directly');
  navigationModule.publishRoutes = publishRoutes;
  f.forbidRouteJSON();
  const { routes } = f.load('app_pages/src/routes');
  const { defineRoutes, nativePage } = f.load('app_pages/src/navigation/config');
  defineRoutes({ pages: { replacement: nativePage({ name: 'replacement', title: 'Replacement' }) } });
  assert.equal(f.updates.length, 1, 'new declarations remain pure with a live host');
  routes.publish();
  assert.equal(f.updates.length, 2);
  assert.equal(f.updates[1].root, '$tabs');
  const changed: RouteDeclaration = routes.toHost('login');
  changed.tabBar!.tabs[0].text = 'Home updated';
  publishRoutes(changed);
  assert.equal(f.updates.length, 3);
  assert.equal(f.updates[2], changed);
  assert.equal(f.updates[2].tabBar!.tabs[0].text, 'Home updated');
  installedNavigation.updateRoutes(declaration);
  assert.equal(f.updates[3], declaration);
});

test('real auth signs in/out through the installed token functions and real Router', () => {
  const f = contracts();
  f.start(true);
  f.forbidRouteJSON();
  const { auth } = f.load('app_pages/src/auth');
  assert.equal(f.state.catchAllErrorHandler(false, new Error('test')), 2, 'debug requests crash');
  assert.throws(() => auth.signIn('   '));
  auth.signIn('test-only.session');
  assert.equal(auth.isSignedIn(), true);
  assert.equal(auth.getToken(), 'test-only.session');
  assert.ok(f.calls.some(call => call[0] === 'reset' && call[1] === '$tabs'));
  auth.signOut();
  assert.equal(auth.isSignedIn(), false);
  assert.equal(auth.getToken(), undefined);
  assert.ok(f.calls.some(call => call[0] === 'tokens.clear'));
  assert.ok(f.calls.some(call => call[0] === 'reset' && call[1] === 'login'));
});

for (const signedIn of [false, true]) {
  test(`pinned hot reload explicitly republishes the ${signedIn ? 'signed-in' : 'signed-out'} typed root without reinitializing services`, () => {
    const f = contracts(signedIn);
    const declaration: RouteDeclaration = f.start(true);
    f.forbidRouteJSON();
    const serviceCalls = () => f.calls.filter(([name]) =>
      ['db.open', 'ble.getHost', 'ble.events', 'uncaught.handler', 'rejection.handler'].includes(name)).length;
    const initialized = serviceCalls();
    const root = signedIn ? '$tabs' : 'login';
    for (const count of [2, 3]) {
      f.reloadRoutes();
      assert.equal(f.updates.length, count, 'one explicit typed update per reload');
      assert.equal(f.updates.at(-1)!.root, root);
      assert.notEqual(f.updates.at(-1), declaration, 'new route exports create a fresh declaration');
      assert.equal(serviceCalls(), initialized, 'reload preserves synchronous service ownership');
    }
  });
}

test('direct StorageHost injection is ready for Home storage access when signed-in routes publish', () => {
  const f = contracts(true);
  const key = 'demo.homeOpens'; // Actual HomePage.onCreate counter.
  f.storageValues.set(key, '7');
  let opens: number | undefined;
  f.navigation.updateRoutes = (declaration: RouteDeclaration) => {
    assert.equal(declaration.root, '$tabs');
    assert.equal(f.state.__valdiRoutesStorageHost, f.storageHost);
    assert.ok(f.calls.some(([name]) => name === 'db.open'), 'Home opens only after the database is ready');
    const { api } = f.load('app_pages/src/api');
    opens = (api.getStorageSync(key) ?? 0) + 1;
    api.setStorageSync(key, opens);
    f.updates.push(declaration);
  };
  f.start();
  assert.equal(opens, 8);
  assert.equal(f.storageValues.get(key), '8', 'real storage API writes JSON text synchronously');
  assert.equal(f.state.__valdiRoutesStorageHost, f.storageHost, 'bootstrap preserves the direct native injection');
  assert.deepEqual(Object.keys(f.state.__harmonyBusinessBootstrap).sort(),
    ['appUI', 'debug', 'navigation', 'nfc', 'permissions', 'tokens', 'wifi'], 'private payload includes system hosts');
  assert.ok(!f.loaded.some(name => /AppStorage/.test(name)), 'storage uses its global, not a native AppStorage module');

  const { api } = f.load('app_pages/src/api');
  api.setStorageSync('json', { label: '存储', enabled: false });
  assert.deepEqual(JSON.parse(JSON.stringify(api.getStorageSync('json'))), { label: '存储', enabled: false });
  api.removeStorageSync(key);
  assert.equal(api.getStorageSync(key), undefined, 'native absence is empty text, decoded to undefined');
  api.clearStorageSync();
  assert.equal(f.storageValues.size, 0);
  assert.equal(f.tokens.has(), true, 'ordinary storage clear must not clear the secure token store');
  f.storageHost.set = () => false;
  assert.throws(() => api.setStorageSync(key, 1), /setStorageSync:fail the store could not write it/);
});

test('Home storage API fails synchronously if the host omitted its direct StorageHost injection', () => {
  const f = contracts(true);
  delete f.state.__valdiRoutesStorageHost;
  f.start();
  const { api } = f.load('app_pages/src/api');
  assert.throws(() => api.getStorageSync('demo.homeOpens'), /getStorageSync:fail native storage is not installed/);
  assert.throws(() => api.setStorageSync('demo.homeOpens', 1), /setStorageSync:fail native storage is not installed/);
});

test('missing native prerequisites fail before business evaluation; startup failure restores navigation', () => {
  for (const missing of ['navigation', 'tokens', 'appUI', 'permissions', 'wifi', 'nfc']) {
    const f = contracts();
    delete f.state.__harmonyBusinessBootstrap[missing];
    assert.throws(() => f.start(), /requires native/);
    assert.ok(!f.loaded.includes('app_pages/src/app'));
    assert.equal(f.updates.length, 0);
  }
  const f = contracts(false, true);
  const previous = { updateRoutes() {} };
  f.state.__valdiRoutesNavigationHost = previous;
  assert.throws(() => f.start(), /native BLE unavailable/);
  assert.equal(f.state.__valdiRoutesNavigationHost, previous);
  assert.equal(f.updates.length, 0);
  assert.throws(() => f.start(), /startup is failed/);
});

test('startup rejects reentry from native callbacks without a second business initialization', () => {
  const f = contracts();
  f.tokens.has = () => {
    assert.throws(() => f.start(), /startup is starting/);
    return false;
  };
  assert.equal(f.start().root, 'login');
  assert.equal(f.calls.filter(([name]) => name === 'ble.getHost').length, 1);
  assert.equal(f.updates.length, 1);
});

test('builder rejects the active smoke destination before changing it', async () => {
  await assert.rejects(buildBusiness({ out: path.join(root, 'harmony/entry/src/main/resources/rawfile') }),
    /overlaps sources or active smoke/);
});
