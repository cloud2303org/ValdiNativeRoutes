import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const feature = path.join(root, 'valdi/modules/app_pages/src/features/proxy');
const nodeRequire = createRequire(path.join(root, 'valdi/package.json'));

// Run the actual TS facades and controller. Only native module entries and Device
// are substituted; there are no test-only setters on the production controller.
function fixture() {
  const calls: Array<{ name: string; value?: any }> = [];
  const storage = new Map<string, any>();
  let writeOK = true;
  let status = { status: 'Stopped', running: false, errorCode: '', errorMessage: '', updatedAt: 1 };
  let capabilities = { vpn: true, trafficStats: true, installedApps: false, perAppProxy: false, systemProxy: true, notificationPermission: false };
  let stateListener: ((value: any) => void) | undefined;
  let trafficListener: ((value: any) => void) | undefined;
  let startResult: Promise<any> = Promise.resolve({ success: true, status: 'Started' });
  let addTrafficError = false;
  let canceled = false;
  const native = {
    getState: () => status,
    getCapabilities: () => capabilities,
    addStateListener: (listener: (value: any) => void) => {
      calls.push({ name: 'subscribe-state' });
      stateListener = listener;
      listener(status); // Native is allowed to deliver before returning its ID.
      return 0;
    },
    removeStateListener: (id: number) => { calls.push({ name: 'unsubscribe-state', value: id }); },
    addTrafficStatsListener: (listener: (value: any) => void) => {
      if (addTrafficError) throw new Error('subscription failed');
      calls.push({ name: 'subscribe-traffic' });
      trafficListener = listener;
      return 9;
    },
    removeTrafficStatsListener: (id: number) => { calls.push({ name: 'unsubscribe-traffic', value: id }); },
    start: (options: any) => { calls.push({ name: 'start', value: options }); return startResult; },
    stop: () => { calls.push({ name: 'stop' }); return Promise.resolve({ success: true }); },
  };
  const cache = new Map<string, any>();
  function load(file: string): any {
    assert.ok(existsSync(file), `Missing implementation: ${path.relative(root, file)}`);
    if (cache.has(file)) return cache.get(file);
    const output = { exports: {} as any };
    cache.set(file, output.exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    function requireFrom(name: string) {
      if (name === 'valdi_core/src/Device') return { Device: { isIOS: () => true, isAndroid: () => false } };
      if (name === 'valdi_core/src/NativeReferences') return { withGlobalNativeRefs: (_scope: string, run: () => any) => run() };
      const target = name.startsWith('.') ? path.resolve(path.dirname(file), name)
        : path.join(root, 'valdi/modules', name);
      if (target.endsWith('/singbox/src/Singbox')) return { getHost: () => native };
      if (target.endsWith('/mmkv/src/MMKV')) return { getHost: () => ({
        get: (key: string) => ({ found: storage.has(key), value: storage.get(key) ?? '' }),
        set: ({ key, value }: any) => { if (writeOK) storage.set(key, value); return writeOK; },
      }) };
      if (target.endsWith('/app_ui/src/AppUI')) return { getHost: () => ({
        pickAttachments: async () => {
          calls.push({ name: 'pick' });
          return { canceled, assets: canceled ? [] : [{
            uri: 'file:///private/cache/full%20profile.json', name: '我的配置.json', size: 1200, mimeType: 'application/json',
          }] };
        },
      }) };
      if (existsSync(target + '.ts')) return load(target + '.ts');
      if (existsSync(path.join(target, 'index.ts'))) return load(path.join(target, 'index.ts'));
      if (name === 'valibot' || name === 'dayjs' || name.startsWith('dayjs/')) return nodeRequire(name);
      if (name.startsWith('valdi_core/')) return {}; // Unused native service imports are lazy.
      if (existsSync(target + '.d.ts')) return { getHost: () => { throw new Error('Unexpected native service access'); } };
      throw new Error(`Unmapped module ${name} from ${file}`);
    }
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error, Promise, Float64Array })(
      requireFrom, output, output.exports,
    );
    cache.set(file, output.exports);
    return output.exports;
  }
  return {
    load: (name: string) => load(path.join(feature, `${name}.ts`)),
    calls, storage,
    setWriteOK: (value: boolean) => { writeOK = value; },
    setCanceled: (value: boolean) => { canceled = value; },
    setState: (value: Partial<typeof status>) => { status = { ...status, ...value }; stateListener?.(status); },
    traffic: (value: any) => trafficListener?.(value),
    unsupported: () => { capabilities = { ...capabilities, vpn: false, trafficStats: false }; },
    setStart: (value: Promise<any>) => { startResult = value; },
    breakTraffic: () => { addTrafficError = true; },
  };
}

test('only local file URIs become absolute paths; malformed, remote and content URIs never reach core', () => {
  const { normalizeConfigPath } = fixture().load('profiles');
  assert.equal(normalizeConfigPath('file:///private/cache/a%20b.json'), '/private/cache/a b.json');
  assert.equal(normalizeConfigPath('file://localhost/private/cache/a.json'), '/private/cache/a.json');
  assert.equal(normalizeConfigPath('/data/user/0/app/cache/a%20b.json'), '/data/user/0/app/cache/a%20b.json');
  for (const value of ['content://provider/config', 'https://host/config', 'relative.json', 'file://remote/a',
    'file:///bad%XX', 'file:///a?query', 'file:///a#fragment', '/a\0b', '//remote/a']) {
    assert.throws(() => normalizeConfigPath(value), /重新选择/);
  }
});

test('import persists only selected file metadata through the actual native API storage and survives reload', async () => {
  const f = fixture();
  const profiles = f.load('profiles');
  const reply = await profiles.chooseProfile();
  const saved = profiles.saveProfile(reply);
  assert.equal(saved.path, '/private/cache/full profile.json');
  assert.equal(saved.name, '我的配置.json');
  assert.equal(saved.size, 1200);
  const restored = profiles.readProfile();
  assert.equal(restored.path, saved.path);
  assert.equal(restored.name, saved.name);
  assert.equal(f.storage.size, 1);
  assert.deepEqual(Object.keys(JSON.parse([...f.storage.values()][0])).sort(), ['importedAt', 'name', 'path', 'size']);
  assert.deepEqual(f.calls.map(call => call.name), ['pick']);
});

test('cancel, corrupt metadata and storage write failures cannot replace the selected profile', async () => {
  const f = fixture();
  const profiles = f.load('profiles');
  profiles.saveProfile({ path: '/cache/old.json', name: 'old.json', size: 12 });
  f.setCanceled(true);
  assert.equal(await profiles.chooseProfile(), undefined);
  assert.equal(profiles.readProfile().path, '/cache/old.json');
  f.setWriteOK(false);
  assert.throws(() => profiles.saveProfile({ path: '/cache/new.json', name: 'new.json', size: 15 }));
  assert.equal(profiles.readProfile().path, '/cache/old.json');
  const key = [...f.storage.keys()][0];
  f.storage.set(key, JSON.stringify({ path: 'content://unsafe', name: 'bad', size: 10, importedAt: 1 }));
  assert.throws(() => profiles.readProfile(), /重新选择/);
});

test('formatting has honest unavailable values and handles invalid, zero and unit boundaries', () => {
  const { formatBytes, formatRate } = fixture().load('format');
  for (const value of [undefined, NaN, Infinity, -1]) assert.equal(formatBytes(value), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatRate(undefined), '—');
  assert.equal(formatRate(1024), '1.0 KB/s');
});

test('visible subscriptions deliver native state, detach both IDs including zero, and suppress late callbacks', () => {
  const f = fixture();
  const { ProxyController } = f.load('native-state');
  const c = new ProxyController();
  const snapshots: any[] = [];
  const detach = c.attach((snapshot: any) => snapshots.push(snapshot));
  f.setState({ status: 'Started', running: true });
  f.traffic({ available: true, uplink: 52, downlink: 1024, updatedAt: 1 });
  assert.equal(snapshots.at(-1).core.status, 'Started');
  assert.equal(snapshots.at(-1).traffic.downlink, 1024);
  detach(); detach();
  const count = snapshots.length;
  f.setState({ status: 'Stopped', running: false });
  assert.equal(snapshots.length, count);
  assert.deepEqual(f.calls.filter(call => call.name.startsWith('unsubscribe')), [
    { name: 'unsubscribe-state', value: 0 }, { name: 'unsubscribe-traffic', value: 9 },
  ]);
  assert.equal(f.calls.some(call => call.name === 'stop'), false);
});

test('destroy during synchronous subscription delivery still releases its ID and never adds traffic', () => {
  const f = fixture();
  const c = new (f.load('native-state').ProxyController)();
  c.attach(() => { if (f.calls.some(call => call.name === 'subscribe-state')) c.destroy(); });
  assert.deepEqual(f.calls, [{ name: 'subscribe-state' }, { name: 'unsubscribe-state', value: 0 }]);
});

test('partial subscription failure releases the first listener', () => {
  const f = fixture(); f.breakTraffic();
  const c = new (f.load('native-state').ProxyController)();
  const snapshots: any[] = [];
  c.attach((snapshot: any) => snapshots.push(snapshot));
  assert.ok(f.calls.some(call => call.name === 'unsubscribe-state'));
  assert.ok(snapshots.at(-1).notice);
  c.destroy();
});

test('start passes selected path and explicit flags; promise success never invents connected state', async () => {
  const f = fixture();
  const c = new (f.load('native-state').ProxyController)();
  let snapshot: any;
  c.attach((value: any) => { snapshot = value; });
  let resolve!: (value: any) => void;
  f.setStart(new Promise(done => { resolve = done; }));
  const pending = c.toggle({ path: '/cache/chosen.json' });
  assert.equal(snapshot.busy, true);
  await c.toggle({ path: '/cache/duplicate.json' });
  assert.equal(f.calls.filter(call => call.name === 'start').length, 1);
  const options = f.calls.find(call => call.name === 'start')!.value;
  assert.equal(options.configPath, '/cache/chosen.json');
  assert.equal(options.systemProxyEnabled, true);
  assert.equal(options.allowBypass, false);
  assert.equal(options.showRealtimeTraffic, true);
  resolve({ success: true, status: 'Started' });
  await pending;
  assert.equal(snapshot.core.status, 'Stopped');
  assert.equal(snapshot.busy, false);
  c.destroy();
});

test('missing profile, unsupported VPN and native transitions never submit start; explicit connected tap stops', async () => {
  const f = fixture(); f.unsupported();
  const c = new (f.load('native-state').ProxyController)();
  c.attach(() => {});
  await c.toggle(undefined);
  await c.toggle({ path: '/cache/a.json' });
  assert.equal(f.calls.some(call => call.name === 'start'), false);
  f.setState({ status: 'Starting' });
  await c.toggle({ path: '/cache/a.json' });
  f.setState({ status: 'Started', running: true });
  await c.toggle(undefined);
  assert.equal(f.calls.filter(call => call.name === 'stop').length, 1);
  c.destroy();
});

test('late command failures after detach are handled without UI writes or native error/credential output', async () => {
  const f = fixture();
  const c = new (f.load('native-state').ProxyController)();
  const snapshots: any[] = [];
  const detach = c.attach((value: any) => snapshots.push(value));
  let reject!: (value: any) => void;
  f.setStart(new Promise((_done, fail) => { reject = fail; }));
  const pending = c.toggle({ path: '/cache/a.json' });
  detach();
  const count = snapshots.length;
  reject(new Error('secret=must-never-appear'));
  await pending;
  assert.equal(snapshots.length, count);
  assert.equal(JSON.stringify(snapshots).includes('must-never-appear'), false);
  c.destroy();
});
