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
const secretURL = 'https://subscriptions.invalid/full?token=private-test-value';
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Execute the production facades/helpers, substituting generated native entries only.
function fixture() {
  const calls: Array<{ name: string; value?: any }> = [];
  const storage = new Map<string, any>();
  let writeOK = true;
  let pointerWriteOK = true;
  let rejectWrite = (_key: string, _value: any) => false;
  const stateListeners = new Map<number, (value: any) => void>();
  let nextStateId = 0;
  let modal = async () => ({ confirm: true, cancel: false, content: secretURL });
  let download = async (_url: string) => ({ path: '/durable/subscription.json', name: secretURL, size: 900 });
  let state = { status: 'Stopped', running: false, errorCode: '', errorMessage: '', updatedAt: 1 };
  let caps = { vpn: true, trafficStats: true, systemProxy: true };
  let tailscale = { available: true, backendState: 'NeedsLogin', stateText: '', authUrl: 'https://login.invalid/private',
    addresses: [] as string[], peers: [], networkName: '', deviceName: '', keyAuth: false, updatedAt: 1 };
  let query = async () => tailscale;
  let start = async (_options: any) => {
    state = { ...state, status: 'Started', running: true };
    for (const listener of stateListeners.values()) listener(state);
    return { success: true, status: 'Started' };
  };
  let open = async () => true;
  let pick = async () => ({ canceled: false, assets: [{ uri: 'file:///cache/local.json', name: 'local.json', size: 5 }] });
  const native = {
    downloadSubscription: (url: string) => { calls.push({ name: 'download', value: url }); return download(url); },
    getState: () => { calls.push({ name: 'state' }); return state; },
    getCapabilities: () => caps,
    addStateListener: (listener: (value: any) => void) => {
      const id = nextStateId++;
      calls.push({ name: 'subscribe-state', value: id });
      stateListeners.set(id, listener);
      listener(state);
      return id;
    },
    removeStateListener: (id: number) => {
      calls.push({ name: 'unsubscribe-state', value: id });
      stateListeners.delete(id);
    },
    getTailscaleState: () => { calls.push({ name: 'tailscale' }); return query(); },
    start: (options: any) => { calls.push({ name: 'start', value: options }); return start(options); },
    stop: () => { calls.push({ name: 'stop' }); throw new Error('Login must never stop VPN'); },
    openTailscaleLogin: () => { calls.push({ name: 'open' }); return open(); },
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
    function requireFrom(name: string): any {
      if (name === 'valdi_core/src/Device') return { Device: { isIOS: () => true, isAndroid: () => false } };
      if (name === 'valdi_core/src/NativeReferences') return { withGlobalNativeRefs: (_scope: string, run: () => any) => run() };
      const target = name.startsWith('.') ? path.resolve(path.dirname(file), name) : path.join(root, 'valdi/modules', name);
      if (target.endsWith('/singbox/src/Singbox')) return { getHost: () => native };
      if (target.endsWith('/mmkv/src/MMKV')) return { getHost: () => ({
        get: (key: string) => ({ found: storage.has(key), value: storage.get(key) ?? '' }),
        set: ({ key, value }: any) => {
          const allowed = writeOK && (pointerWriteOK || key !== ['proxy', 'selectedProfile', 'v1'].join('.')) &&
            !rejectWrite(key, value);
          if (allowed) storage.set(key, value);
          return allowed;
        },
      }) };
      if (target.endsWith('/app_ui/src/AppUI')) return { getHost: () => ({
        showModal: (request: any) => { calls.push({ name: 'modal', value: request }); return modal(); },
        pickAttachments: () => { calls.push({ name: 'pick' }); return pick(); },
      }) };
      if (existsSync(target + '.ts')) return load(target + '.ts');
      if (existsSync(path.join(target, 'index.ts'))) return load(path.join(target, 'index.ts'));
      if (name === 'valibot' || name === 'dayjs' || name.startsWith('dayjs/')) return nodeRequire(name);
      if (name.startsWith('valdi_core/')) return {};
      if (existsSync(target + '.d.ts')) return { getHost: () => { throw new Error('Unexpected native access'); } };
      throw new Error(`Unmapped module ${name} from ${file}`);
    }
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,
      { Error, Promise, Float64Array, setTimeout, clearTimeout })(requireFrom, output, output.exports);
    return output.exports;
  }
  return {
    load: (name: string) => load(path.join(feature, `${name}.ts`)), calls, storage,
    setWriteOK: (value: boolean) => { writeOK = value; },
    setPointerWriteOK: (value: boolean) => { pointerWriteOK = value; },
    rejectWrite: (value: typeof rejectWrite) => { rejectWrite = value; },
    modal: (value: typeof modal) => { modal = value; },
    download: (value: typeof download) => { download = value; },
    state: (value: Partial<typeof state>) => {
      state = { ...state, ...value };
      for (const listener of stateListeners.values()) listener(state);
    },
    caps: (value: Partial<typeof caps>) => { caps = { ...caps, ...value }; },
    tailscale: (value: Partial<typeof tailscale>) => { tailscale = { ...tailscale, ...value }; },
    query: (value: typeof query) => { query = value; },
    start: (value: typeof start) => { start = value; },
    open: (value: typeof open) => { open = value; },
    pick: (value: typeof pick) => { pick = value; },
  };
}

function subscriptions(f = fixture()) {
  const c = new (f.load('subscriptions').SubscriptionsController)();
  const snapshots: any[] = [];
  const detach = c.attach((value: any) => snapshots.push(value));
  return { f, c, snapshots, detach };
}
function tailscale(f = fixture()) {
  const c = new (f.load('tailscale').TailscaleController)();
  const snapshots: any[] = [];
  const detach = c.attach((value: any) => snapshots.push(value));
  return { f, c, snapshots, detach };
}

test('add asks for a native editable URL and persists only opaque native file metadata plus subscription metadata', async () => {
  const { f, c, snapshots } = subscriptions();
  await c.add();
  assert.equal(f.calls.find(v => v.name === 'modal')?.value.editable, true);
  assert.equal(f.calls.find(v => v.name === 'modal')?.value.title, '添加订阅');
  assert.equal(f.calls.find(v => v.name === 'download')?.value, secretURL);
  assert.equal(f.load('profiles').readProfile().path, '/durable/subscription.json');
  assert.equal(snapshots.at(-1).records.length, 1);
  assert.equal(snapshots.at(-1).records[0].url, secretURL);
  assert.equal(snapshots.at(-1).records[0].name, '订阅配置');
  assert.equal(f.storage.size, 2);
  const restored = subscriptions(f);
  assert.equal(restored.snapshots.at(-1).records.length, 1);
  assert.equal(restored.snapshots.at(-1).selected.path, '/durable/subscription.json');
  c.destroy(); restored.c.destroy();
});

test('two subscriptions can be selected independently and refreshing an unselected record preserves selection', async () => {
  const { f, c, snapshots } = subscriptions();
  await c.add();
  f.modal(async () => ({ confirm: true, cancel: false, content: 'https://other.invalid/full' }));
  f.download(async () => ({ path: '/durable/second.json', name: 'second', size: 90 }));
  await c.add();
  assert.equal(snapshots.at(-1).records.length, 2);
  c.select(secretURL);
  assert.equal(f.load('profiles').readProfile().path, '/durable/subscription.json');
  f.download(async () => ({ path: '/durable/refreshed.json', name: 'new', size: 100 }));
  await c.refresh('https://other.invalid/full');
  assert.equal(f.load('profiles').readProfile().path, '/durable/subscription.json');
  assert.equal(snapshots.at(-1).records[1].path, '/durable/refreshed.json');
  c.destroy();
});

test('refresh replaces selected pointer only after download succeeds, and failures do not disclose URL or native errors', async () => {
  const { f, c, snapshots } = subscriptions();
  await c.add();
  const result = deferred<any>();
  f.download(() => result.promise);
  const pending = c.refresh(secretURL);
  assert.equal(f.load('profiles').readProfile().path, '/durable/subscription.json');
  result.resolve({ path: '/durable/new.json', name: 'new', size: 1800 });
  await pending;
  assert.equal(f.load('profiles').readProfile().path, '/durable/new.json');
  f.download(async () => { throw new Error(secretURL); });
  await c.refresh(secretURL);
  assert.equal(f.load('profiles').readProfile().path, '/durable/new.json');
  assert.equal(snapshots.at(-1).notice.includes('private-test-value'), false);
  f.setWriteOK(false);
  f.download(async () => ({ path: '/durable/not-selected.json', name: 'new', size: 20 }));
  await c.refresh(secretURL);
  assert.equal(f.load('profiles').readProfile().path, '/durable/new.json');
  c.destroy();
});

test('invalid and canceled native URL input never downloads or changes the selected local file', async () => {
  const { f, c, snapshots } = subscriptions();
  f.load('profiles').saveProfile({ path: '/cache/local.json', name: 'local', size: 1 });
  for (const content of ['', 'vless://node', 'file:///a', 'https://', 'https://user@host/full', 'https://host/\nsecret']) {
    f.modal(async () => ({ confirm: true, cancel: false, content }));
    await c.add();
  }
  f.modal(async () => ({ confirm: false, cancel: true, content: secretURL }));
  await c.add();
  assert.equal(f.calls.some(v => v.name === 'download'), false);
  assert.equal(f.load('profiles').readProfile().path, '/cache/local.json');
  assert.equal(snapshots.at(-1).records.length, 0);
  c.destroy();
});

test('hiding during editable modal or download invalidates selection writes and suppresses late UI results', async () => {
  const { f, c, snapshots, detach } = subscriptions();
  const modal = deferred<any>();
  f.modal(() => modal.promise);
  const pending = c.add();
  await c.add();
  assert.equal(f.calls.filter(v => v.name === 'modal').length, 1);
  detach();
  const count = snapshots.length;
  modal.resolve({ confirm: true, cancel: false, content: secretURL });
  await pending;
  assert.equal(f.calls.some(v => v.name === 'download'), false);
  assert.equal(snapshots.length, count);
  const detachAgain = c.attach((value: any) => snapshots.push(value));
  f.modal(async () => ({ confirm: true, cancel: false, content: secretURL }));
  const download = deferred<any>();
  f.download(() => download.promise);
  const downloading = c.add();
  await tick();
  detachAgain();
  const hiddenCount = snapshots.length;
  download.resolve({ path: '/durable/late.json', name: 'late', size: 9 });
  await downloading;
  assert.equal(f.storage.size, 0);
  assert.equal(snapshots.length, hiddenCount);
  c.destroy();
});

test('superseded scope cannot overwrite a newer subscription selection', async () => {
  const { f, c, detach } = subscriptions();
  const old = deferred<any>();
  f.download(() => old.promise);
  const pending = c.add();
  await tick();
  detach();
  c.attach(() => {});
  f.download(async () => ({ path: '/durable/current.json', name: 'current', size: 5 }));
  await c.add();
  old.resolve({ path: '/durable/stale.json', name: 'stale', size: 4 });
  await pending;
  assert.equal(f.load('profiles').readProfile().path, '/durable/current.json');
  c.destroy();
});

test('local import stays secondary and ignores a file-picker result after hide', async () => {
  const { f, c, snapshots } = subscriptions();
  assert.equal(typeof c.importFile, 'function', 'Secondary local import must be available');
  await c.importFile();
  assert.equal(f.load('profiles').readProfile().path, '/cache/local.json');
  assert.equal(snapshots.at(-1).records.length, 0);
  const pick = deferred<any>();
  f.pick(() => pick.promise);
  const pending = c.importFile();
  c.destroy();
  const count = snapshots.length;
  pick.resolve({ canceled: false, assets: [{ uri: 'file:///cache/late.json', name: 'late.json', size: 5 }] });
  await pending;
  assert.equal(f.load('profiles').readProfile().path, '/cache/local.json');
  assert.equal(snapshots.length, count);
});

test('reentrant hide from busy publication prevents subscription native actions', async () => {
  const f = fixture();
  const c = new (f.load('subscriptions').SubscriptionsController)();
  c.attach((value: any) => { if (value.busy) c.destroy(); });
  await c.add();
  assert.equal(f.calls.some(v => ['modal', 'download', 'pick'].includes(v.name)), false);
});

test('reentrant destroy from Tailscale publication prevents native reads, start and browser open', async () => {
  const f = fixture();
  const c = new (f.load('tailscale').TailscaleController)();
  c.attach(() => c.destroy());
  await c.login();
  assert.equal(f.calls.length, 0);
});

test('Tailscale visible attach refreshes native status and address without starting or opening browser', async () => {
  const f = fixture();
  f.state({ status: 'Started', running: true });
  f.tailscale({ backendState: 'Running', authUrl: '', addresses: ['100.64.1.2'] });
  const { c, snapshots } = tailscale(f);
  await tick();
  assert.equal(snapshots.at(-1).status, '已认证');
  assert.equal(snapshots.at(-1).addresses[0], '100.64.1.2');
  assert.equal(JSON.stringify(snapshots).includes('https://login'), false);
  assert.equal(f.calls.some(v => ['start', 'open', 'stop'].includes(v.name)), false);
  c.destroy();
});

test('explicit Tailscale login starts selected config with capability flags and opens only native auth URL', async () => {
  const f = fixture();
  f.load('profiles').saveProfile({ path: '/durable/selected.json', name: 'selected', size: 1 });
  const { c, snapshots } = tailscale(f);
  await tick();
  await c.login();
  const options = f.calls.find(v => v.name === 'start')!.value;
  assert.equal(options.configPath, '/durable/selected.json');
  assert.equal(options.systemProxyEnabled, true);
  assert.equal(options.allowBypass, false);
  assert.equal(options.showRealtimeTraffic, true);
  assert.equal(f.calls.filter(v => v.name === 'open').length, 1);
  assert.notEqual(snapshots.at(-1).status, '已认证');
  assert.match(snapshots.at(-1).notice, /浏览器/);
  assert.equal(JSON.stringify(snapshots).includes('https://login'), false);
  c.destroy();
});

test('already authenticated running VPN is never restarted or sent to login', async () => {
  const f = fixture();
  f.state({ status: 'Started', running: true });
  f.tailscale({ backendState: 'Running', authUrl: '' });
  const { c, snapshots } = tailscale(f);
  await tick(); await c.login();
  assert.equal(snapshots.at(-1).status, '已认证');
  assert.equal(f.calls.some(v => ['start', 'open', 'stop'].includes(v.name)), false);
  c.destroy();
});

test('missing selection, unsupported VPN and native failed start never open Tailscale login', async () => {
  const { f, c, snapshots } = tailscale();
  await tick(); await c.login();
  assert.match(snapshots.at(-1).notice, /配置/);
  f.load('profiles').saveProfile({ path: '/durable/a.json', name: 'a', size: 1 });
  f.caps({ vpn: false });
  await c.login();
  assert.equal(f.calls.some(v => v.name === 'start'), false);
  f.caps({ vpn: true });
  f.start(async () => ({ success: false, status: 'Stopped' }));
  await c.login();
  assert.equal(f.calls.some(v => v.name === 'open'), false);
  c.destroy();
});

test('start acknowledgement alone cannot authorize browser opening; bounded absent endpoint is actionable', async () => {
  const f = fixture();
  f.load('profiles').saveProfile({ path: '/durable/a.json', name: 'a', size: 1 });
  f.start(async () => ({ success: true, status: 'Started' }));
  const { c, snapshots } = tailscale(f);
  await tick(); await c.login();
  assert.equal(f.calls.some(v => v.name === 'open'), false);
  assert.notEqual(snapshots.at(-1).status, '已认证');
  f.state({ status: 'Started', running: true });
  f.tailscale({ available: false, authUrl: '' });
  await c.login();
  assert.match(snapshots.at(-1).notice, /当前配置未启用 Tailscale/);
  assert.ok(f.calls.filter(v => v.name === 'tailscale').length < 30);
  c.destroy();
});

test('hiding while native start or state read awaits prevents browser open, further queries and UI updates', async () => {
  const f = fixture();
  f.load('profiles').saveProfile({ path: '/durable/a.json', name: 'a', size: 1 });
  const { c, snapshots, detach } = tailscale(f);
  await tick();
  const start = deferred<any>();
  f.start(() => start.promise);
  const pending = c.login();
  await c.login();
  assert.equal(f.calls.filter(v => v.name === 'start').length, 1);
  detach();
  const count = snapshots.length;
  start.resolve({ success: true, status: 'Started' });
  await pending;
  assert.equal(snapshots.length, count);
  assert.equal(f.calls.some(v => v.name === 'open'), false);
  f.state({ status: 'Started', running: true });
  const query = deferred<any>();
  f.query(() => query.promise);
  const again = c.attach((value: any) => snapshots.push(value));
  await tick();
  again();
  const hiddenCount = snapshots.length;
  query.resolve({ available: true, backendState: 'NeedsLogin', authUrl: 'https://login.invalid/private' });
  await tick();
  assert.equal(snapshots.length, hiddenCount);
  assert.equal(f.calls.some(v => v.name === 'stop'), false);
  c.destroy();
});

test('native Tailscale errors and failed external browser opening produce bounded safe notices', async () => {
  const f = fixture();
  f.state({ status: 'Started', running: true });
  const { c, snapshots } = tailscale(f);
  await tick();
  f.open(async () => false);
  await c.login();
  assert.match(snapshots.at(-1).notice, /浏览器/);
  f.query(async () => { throw new Error(secretURL); });
  await c.refresh();
  assert.equal(JSON.stringify(snapshots).includes('private-test-value'), false);
  assert.equal(snapshots.at(-1).busy, false);
  c.destroy();
});

test('native VPN stop clears visible Tailscale authentication, addresses and disabled login without a manual refresh', async () => {
  const f = fixture();
  f.state({ status: 'Started', running: true });
  f.tailscale({ backendState: 'Running', authUrl: '', addresses: ['100.64.1.2'] });
  f.load('profiles').saveProfile({ path: '/durable/selected.json', name: 'selected', size: 1 });
  const { c, snapshots, detach } = tailscale(f);
  await tick();
  assert.equal(snapshots.at(-1).authenticated, true);
  f.state({ status: 'Stopped', running: false });
  assert.equal(snapshots.at(-1).authenticated, false);
  assert.equal(snapshots.at(-1).addresses.length, 0);
  assert.notEqual(snapshots.at(-1).status, '已认证');
  assert.equal(snapshots.at(-1).busy, false);
  f.tailscale({ backendState: 'NeedsLogin', authUrl: 'https://login.invalid/private', addresses: [] });
  await c.login();
  assert.equal(f.calls.filter(value => value.name === 'start').length, 1);
  assert.equal(f.calls.filter(value => value.name === 'open').length, 1);
  detach();
  const count = snapshots.length;
  f.state({ status: 'Stopped', running: false });
  assert.equal(snapshots.length, count);
  assert.deepEqual(f.calls.filter(value => value.name === 'unsubscribe-state').map(value => value.value), [0]);
  c.destroy();
});

test('stop invalidates an in-flight auth observation even if native restarts before the old reply arrives', async () => {
  for (const operation of ['refresh', 'login']) {
    const f = fixture();
    f.state({ status: 'Started', running: true });
    const { c, snapshots } = tailscale(f);
    await tick();
    const reply = deferred<any>();
    f.query(() => reply.promise);
    const pending = c[operation]();
    await tick();
    f.state({ status: 'Stopped', running: false });
    f.state({ status: 'Started', running: true });
    reply.resolve({ available: true, backendState: operation === 'refresh' ? 'Running' : 'NeedsLogin',
      authUrl: 'https://login.invalid/stale', addresses: ['100.64.9.9'] });
    await pending;
    assert.equal(snapshots.at(-1).authenticated, false, operation);
    assert.equal(snapshots.at(-1).addresses.length, 0, operation);
    assert.equal(f.calls.some(value => value.name === 'open'), false, operation);
    assert.equal(snapshots.at(-1).busy, false, operation);
    c.destroy();
  }
});

test('a second-write failure preserves selected subscription identity across reload and a successful retry advances the pointer', async () => {
  for (const legacy of [false, true]) {
    const { f, c, snapshots } = subscriptions();
    await c.add();
    if (legacy) {
      const key = ['proxy', 'selectedProfile', 'v1'].join('.');
      const { subscriptionUrl: _identity, ...plain } = JSON.parse(f.storage.get(key));
      f.storage.set(key, JSON.stringify(plain));
    }
    f.setPointerWriteOK(false);
    f.download(async () => ({ path: '/durable/update-b.json', name: 'b', size: 1000 }));
    await c.refresh(secretURL);
    assert.equal(f.load('profiles').readProfile().path, '/durable/subscription.json');
    assert.match(snapshots.at(-1).notice, /未|失败/);
    assert.equal(snapshots.at(-1).notice.includes('完整配置已保存'), false);
    if (!legacy) {
      assert.equal(snapshots.at(-1).records[0].path, '/durable/update-b.json');
      assert.equal(snapshots.at(-1).selected.subscriptionUrl, secretURL);
    }
    c.destroy();
    const restored = subscriptions(f);
    if (!legacy) {
      assert.equal(restored.snapshots.at(-1).selected.subscriptionUrl, secretURL);
      assert.match(restored.snapshots.at(-1).notice, /仍使用上次配置/);
    }
    f.setPointerWriteOK(true);
    f.download(async () => ({ path: '/durable/update-c.json', name: 'c', size: 1100 }));
    await restored.c.refresh(secretURL);
    assert.equal(f.load('profiles').readProfile().path, '/durable/update-c.json', `legacy=${legacy}`);
    assert.equal(restored.snapshots.at(-1).records[0].path, '/durable/update-c.json');
    restored.c.destroy();
  }
});

test('failed duplicate add preserves an unrelated local selection and future subscription refresh leaves it selected', async () => {
  for (const failure of ['record', 'selection']) {
    const { f, c, snapshots } = subscriptions();
    await c.add();
    await c.importFile();
    const local = f.load('profiles').readProfile();
    assert.equal(local.path, '/cache/local.json');
    assert.equal(local.subscriptionUrl, undefined);
    f.download(async () => ({ path: '/durable/duplicate-b.json', name: 'b', size: 1000 }));
    f.rejectWrite((key, value) => failure === 'record'
      ? key === ['proxy', 'subscriptions', 'v1'].join('.')
      : key === ['proxy', 'selectedProfile', 'v1'].join('.') && JSON.parse(value).path === '/durable/duplicate-b.json');
    await c.add();
    assert.deepEqual(f.load('profiles').readProfile(), local, failure);
    assert.match(snapshots.at(-1).notice, /未|失败/);
    c.destroy();
    const restored = subscriptions(f);
    assert.deepEqual(restored.snapshots.at(-1).selected, local, failure);
    assert.equal(restored.snapshots.at(-1).notice.includes('仍使用上次配置'), false, failure);
    f.rejectWrite(() => false);
    f.download(async () => ({ path: '/durable/refresh-c.json', name: 'c', size: 1100 }));
    await restored.c.refresh(secretURL);
    assert.equal(restored.snapshots.at(-1).records[0].path, '/durable/refresh-c.json');
    assert.deepEqual(f.load('profiles').readProfile(), local, failure);
    restored.c.destroy();
  }
});
