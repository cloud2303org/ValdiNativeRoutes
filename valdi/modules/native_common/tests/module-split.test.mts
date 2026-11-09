import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../../tools/valdi-rolldown/node_modules/typescript/lib/typescript.js';
import { compileNodeModule } from '../../../../tools/valdi-rolldown/module-build';
import { assertEnabledImports } from '../../../../tools/valdi-rolldown/module-selection';
import { unpack } from '../../../../tools/valdi-rolldown/archive';

const root = path.resolve(import.meta.dirname, '../../../..');
const modules = path.join(root, 'valdi/modules');
const names = ['native_common', 'mmkv', 'permissions', 'wifi', 'nfc', 'app_ui'];
const dependencies: Record<string, string[]> = {
  native_common: [],
  mmkv: [],
  permissions: ['native_common'],
  wifi: ['native_common', 'permissions'],
  nfc: ['native_common', 'permissions'],
  app_ui: ['native_common'],
};
const moduleFor = (name: string) => ({
  name,
  dir: path.join(modules, name),
  generatedDirs: [],
  nodeModules: path.join(root, 'valdi/node_modules'),
});

// Only OS capabilities are supplied; the module facades, validation, permission queue,
// byte adapters and shared helpers execute unchanged in one JS realm.
function runtime(platform = 'android', sdk = 36, hostFactories: Record<string, () => any> = {}) {
  const context = vm.createContext({ console, Error, ArrayBuffer, Uint8Array });
  const requireNpm = createRequire(path.join(root, 'valdi/package.json'));
  const cache = new Map<string, { exports: any }>();
  const hosts: Record<string, any> = {};
  const factories: Record<string, string> = {
    MMKV: 'mmkv',
    Permissions: 'permissions',
    Wifi: 'wifi',
    Nfc: 'nfc',
    AppUI: 'app_ui',
  };
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file)!.exports;
    const module = { exports: {} as any };
    cache.set(file, module);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: file,
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename: file })(
      (name: string) => {
        if (name === 'valdi_core/src/NativeReferences') return { withGlobalNativeRefs: (_name: string, body: () => unknown) => body() };
        if (name === 'valdi_core/src/Device') return { Device: { isAndroid: () => platform === 'android' } };
        if (name === 'bluetooth/src/index') return { bluetoothApi: () => ({}) };
        if (name === 'valibot' || name.startsWith('dayjs')) return requireNpm(name);
        const target = name.startsWith('.') ? path.resolve(path.dirname(file), name) : path.join(modules, name);
        const factory = factories[path.basename(target)];
        if (factory && target.endsWith(`/src/${path.basename(target)}`))
          return {
            getHost: () => {
              if (hostFactories[factory]) return hostFactories[factory]();
              assert.ok(hosts[factory], `${factory} host not supplied`);
              return hosts[factory];
            },
            getAndroidSdk: () => (platform === 'android' ? sdk : 0),
          };
        return load(`${target}.ts`);
      },
      module,
      module.exports,
    );
    return module.exports;
  };
  return {
    context,
    hosts,
    load: (name: string) => load(path.join(modules, `${name}.ts`)),
    evaluate: (text: string) => vm.runInContext(text, context),
  };
}

test('six independent Node modules compile TS and bindings into temporary outputs', async () => {
  const output = mkdtempSync(path.join(tmpdir(), 'valdi-services-split-'));
  try {
    for (const name of names) {
      const config = JSON.parse(readFileSync(path.join(modules, name, 'module.json'), 'utf8'));
      const dest = path.join(output, name);
      await compileNodeModule(
        moduleFor(name),
        dest,
        config.iosModuleName,
        'debug',
        dependencies[name].map(moduleFor),
        'objc',
      );
      const entries = unpack(readFileSync(path.join(dest, `${name}.valdimodule`)));
      assert.ok(entries.size > 1, `${name} compiled JavaScript`);
      if (name !== 'native_common') {
        const kotlin = readFileSync(path.join(dest, 'android', `${name}.kt`), 'utf8');
        const header = readFileSync(
          path.join(dest, 'ios', `${config.iosModuleName}Types`, `${config.iosModuleName}Types.h`),
          'utf8',
        );
        assert.match(kotlin, /NativeModuleFactory/);
        assert.match(header, /NativeModuleFactory/);
        assert.doesNotMatch(kotlin, /io\.valdiroutes\.pages\./);
        assert.doesNotMatch(header, /VRInstall/);
        if (name === 'permissions') {
          assert.match(header, /getAndroidSdk/);
          assert.match(kotlin, /fun getAndroidSdk\(\): Double/);
        }
        if (name === 'nfc') assert.match(header, /transceiveWithHandle:.*data:/);
      }
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('disabled source dependencies fail selection checks without auto-enabling', () => {
  for (const name of names.filter(name => name !== 'native_common')) {
    const files = readdirSync(path.join(modules, name, 'src'))
      .filter(file => file.endsWith('.ts'))
      .map(file => path.join(modules, name, 'src', file));
    for (const missing of dependencies[name]) {
      const enabled = [name, ...dependencies[name].filter(dependency => dependency !== missing)];
      assert.throws(
        () => assertEnabledImports(files, modules, names, enabled),
        new RegExp(`disabled module "${missing}"`),
        `${name} must reject a disabled source dependency`,
      );
    }
    assert.doesNotThrow(() => assertEnabledImports(files, modules, names, [name, ...dependencies[name]]));
  }
});

test('factory-backed storage preserves snapshots, null/missing distinction and facade ApiError identity', () => {
  const r = runtime();
  // Native persistence stores JSON text unchanged; the real JS facade owns
  // serialization, parsing and error conversion.
  const records = new Map<string, string>();
  r.hosts.mmkv = {
    get: (key: string) => ({
      found: records.has(key),
      value: records.get(key) ?? '',
    }),
    set: ({ key, value }: { key: string; value: string }) => {
      records.set(key, value);
      return true;
    },
    remove: (key: string) => records.delete(key),
    clear: () => records.clear(),
  };
  Object.assign(r.context, { facade: r.load('app_pages/src/services/api') });
  assert.equal(r.evaluate(`facade.api.setStorageSync('x', null); facade.api.getStorageSync('x')`), null);
  assert.equal(records.get('x'), 'null');
  assert.equal(r.evaluate(`facade.api.getStorageSync('missing')`), undefined);
  assert.equal(
    r.evaluate(
      `const input = { nested: { n: 1 } }; facade.api.setStorageSync('x', input); input.nested.n = 9; facade.api.getStorageSync('x').nested.n`,
    ),
    1,
  );
  assert.equal(
    r.evaluate(
      `try { facade.api.setStorageSync('x', undefined); false } catch (error) { error instanceof facade.ApiError && error.errMsg.startsWith('setStorageSync:fail ') }`,
    ),
    true,
  );
  records.set('x', '{broken');
  assert.equal(
    r.evaluate(
      `try { facade.api.getStorageSync('x'); false } catch (error) { error instanceof facade.ApiError && error.errMsg.startsWith('getStorageSync:fail ') }`,
    ),
    true,
  );
  r.hosts.mmkv.set = () => false;
  assert.equal(
    r.evaluate(
      `try { facade.api.setStorageSync('x', null); false } catch (error) { error instanceof facade.ApiError && error.errMsg.startsWith('setStorageSync:fail ') }`,
    ),
    true,
  );
});

test('permission factories supply SDK and the same serialized application prompt queue', async () => {
  const r = runtime();
  const prompts: string[][] = [];
  const granted = new Set<string>();
  r.hosts.permissions = {
    check: async (p: string) => granted.has(p),
    requestMultiple: async (items: string[]) => {
      prompts.push(items);
      return items.map(permission => {
        granted.add(permission);
        return { permission, result: 'granted' };
      });
    },
  };
  const permissions = r.load('permissions/src/index');
  assert.equal(permissions.androidSdk(), 36);
  await Promise.all([
    permissions.requestAndroidPermissions(['android.permission.CAMERA']),
    permissions.requestAndroidPermissions(['android.permission.CAMERA']),
  ]);
  assert.equal(prompts.length, 1);
  assert.equal((await permissions.getAndroidPermissionState(['android.permission.CAMERA'])).status, 'granted');
});

test('Wi-Fi binds factory events once; iOS NFC still rejects before loading native', async () => {
  const r = runtime();
  let bindings = 0;
  r.hosts.wifi = { setEvents: () => bindings++ };
  const wifi = r.load('wifi/src/WifiHost');
  assert.equal(wifi.wifiHost(), r.hosts.wifi);
  assert.equal(wifi.wifiHost(), r.hosts.wifi);
  assert.equal(bindings, 1);
  const ios = runtime('ios');
  await assert.rejects(ios.load('nfc/src/native').nativeNFC.startDiscovery(), /Android-only/);
});

test('Wi-Fi retrieves one factory proxy and subscribes once when marshaling creates fresh wrappers', () => {
  let retrievals = 0;
  const subscriptions: any[] = [];
  const collaborator = { setEvents: (events: any) => subscriptions.push(events) };
  const r = runtime('ios', 0, {
    wifi: () => {
      retrievals++;
      return new Proxy(collaborator, {});
    },
  });
  const wifi = r.load('wifi/src/WifiHost');
  const native = r.load('wifi/src/native').nativeWifi;
  let notifications = 0;
  native.onWifiConnected(() => notifications++);
  const first = wifi.wifiHost();
  for (let lookup = 0; lookup < 5; lookup++) wifi.wifiHost();
  subscriptions.forEach(events => events.wifiConnected({ SSID: 'device-ap' }));
  assert.equal(retrievals, 1);
  assert.equal(subscriptions.length, 1);
  assert.equal(notifications, 1);
  assert.equal(wifi.wifiHost(), first);
});

test('Wi-Fi exposes only the native factory entry without manual installation', () => {
  let retrievals = 0;
  let bindings = 0;
  const host = { setEvents: () => bindings++ };
  const r = runtime('ios', 0, { wifi: () => { retrievals++; return host; } });
  const wifi = r.load('wifi/src/WifiHost');
  assert.equal('installWifiHost' in wifi, false);
  assert.equal(retrievals, 0, 'loading the facade must not create a host');
  assert.equal(wifi.wifiHost(), host);
  assert.equal(wifi.wifiHost(), host);
  assert.equal(retrievals, 1);
  assert.equal(bindings, 1);
});

test('AppUI validates requests and keeps the facade error type and cancel replies', async () => {
  const r = runtime();
  r.hosts.app_ui = {
    showModal: async (request: any) => ({ confirm: true, cancel: false, content: request.defaultText }),
    showPicker: async () => ({ confirm: false, cancel: true, value: 'stale', index: 5 }),
    showToast: async () => {
      throw new Error('native presentation failure');
    },
  };
  const { api, ApiError } = r.load('app_pages/src/services/api');
  assert.equal((await api.showModal({ editable: true, defaultText: 'kept' })).content, 'kept');
  const canceled = await api.showPicker({ options: ['a'] });
  assert.deepEqual({ ...canceled }, { confirm: false, cancel: true, value: '', index: -1, errMsg: 'showPicker:ok' });
  await assert.rejects(
    api.showToast({ title: 'hello' }),
    (error: any) => error instanceof ApiError && error.errMsg === 'showToast:fail native presentation failure',
  );
  await assert.rejects(api.showToast({ title: ' ' }), (error: any) => error instanceof ApiError);
});
