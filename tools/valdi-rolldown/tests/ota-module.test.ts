import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = path.resolve(import.meta.dirname, '../../../valdi/modules/app_ota/src/index.ts');

function fixture(platform = 'android') {
  const calls: string[] = [];
  let failure: Error | undefined;
  let finish: ((value: unknown) => void) | undefined;
  const info = {
    enabled: true, appVersion: '1.0', embeddedBundleVersion: 'pages-001',
    bundleVersion: 'pages-002', pendingBundleVersion: 'pages-003' as string | undefined,
    isNewVersion: false, previousBundleVersion: undefined as string | undefined,
  };
  const host = {
    getInfo: () => failure ? Promise.reject(failure) : Promise.resolve(info),
    checkForUpdate: () => {
      calls.push('check');
      return failure ? Promise.reject(failure) : new Promise(resolve => { finish = resolve; });
    },
  };
  assert.ok(existsSync(source), 'app_ota facade must expose the native OTA module');
  const code = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as any };
  const boundaries: Record<string, unknown> = {
    'valdi_core/src/Device': {
      Device: { isAndroid: () => platform === 'android', isIOS: () => platform === 'ios' },
    },
    'valdi_core/src/NativeReferences': {
      withGlobalNativeRefs: (name: string, body: () => unknown) => {
        calls.push(`scope:${name}`);
        return body();
      },
    },
    './Ota': { getHost: () => { calls.push('host'); return host; } },
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error, Promise })(
    (name: string) => {
      assert.ok(Object.hasOwn(boundaries, name), name);
      return boundaries[name];
    }, module, module.exports,
  );
  return {
    api: module.exports, info, calls,
    fail(error: Error) { failure = error; },
    complete() { assert.ok(finish); finish(info); },
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform} loads one retained host lazily and preserves all version fields`, async () => {
    const f = fixture(platform);
    assert.deepEqual(f.calls, []);
    assert.equal(await f.api.getInfo(), f.info);
    assert.equal(await f.api.getInfo(), f.info);
    assert.deepEqual(f.calls, ['scope:app-ota', 'host']);
    assert.equal(f.api.confirmLaunch, undefined);
    assert.equal(f.api.restart, undefined);
    assert.equal(f.api.reload, undefined);
  });
}

test('check resolves only after the native check/download completes', async () => {
  const f = fixture();
  let settled = false;
  const pending = f.api.checkForUpdate().then((info: unknown) => { settled = true; return info; });
  await Promise.resolve();
  assert.equal(settled, false);
  f.complete();
  assert.equal(await pending, f.info);
  assert.equal((await f.api.getInfo()).bundleVersion, 'pages-002');
});

test('native errors reject both APIs without replacing their identity', async () => {
  const f = fixture();
  const failure = new Error('download failed');
  f.fail(failure);
  await assert.rejects(f.api.getInfo(), error => error === failure);
  await assert.rejects(f.api.checkForUpdate(), error => error === failure);
});

test('disabled status is returned without hiding native version information', async () => {
  const f = fixture();
  f.info.enabled = false;
  assert.equal((await f.api.getInfo()).enabled, false);
  assert.equal((await f.api.getInfo()).embeddedBundleVersion, 'pages-001');
});

test('the facade exposes the native activation flag without inferring it from pending', async () => {
  const f = fixture();
  assert.equal((await f.api.getInfo()).isNewVersion, false);
  f.info.isNewVersion = true;
  f.info.previousBundleVersion = 'pages-001';
  f.info.pendingBundleVersion = undefined;
  const info = await f.api.getInfo();
  assert.equal(info.isNewVersion, true);
  assert.equal(info.previousBundleVersion, 'pages-001');
  assert.equal(info.bundleVersion, 'pages-002');
});

test('unsupported platforms reject without loading the native host', async () => {
  const f = fixture('web');
  await assert.rejects(f.api.getInfo(), /Android.*iOS/);
  await assert.rejects(f.api.checkForUpdate(), /Android.*iOS/);
  assert.deepEqual(f.calls, []);
});
