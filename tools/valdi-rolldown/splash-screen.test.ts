import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = path.resolve(import.meta.dirname, '../../valdi/modules/app_foundation/src/splash');

function load(file: string, boundaries: Record<string, unknown>) {
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(path.join(source, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error, Promise })(
    (name: string) => {
      assert.ok(Object.hasOwn(boundaries, name), name);
      return boundaries[name];
    }, module, module.exports,
  );
  return module.exports;
}

function facade(platform: 'android' | 'ios' | 'other' = 'android') {
  const calls: string[] = [];
  let fail = false;
  let accepted = true;
  const host = {
    preventAutoHide: () => { calls.push('prevent'); return accepted; },
    hide: () => { calls.push('hide'); if (fail) throw new Error('native failure'); },
  };
  const api = load('SplashScreen.ts', {
    'valdi_core/src/Device': {
      Device: { isAndroid: () => platform === 'android', isIOS: () => platform === 'ios' },
    },
    'valdi_core/src/NativeReferences': {
      withGlobalNativeRefs: (name: string, body: () => unknown) => {
        calls.push(`scope:${name}`);
        return body();
      },
    },
    './SplashScreenNative': { getHost: () => { calls.push('getHost'); return host; } },
  });
  return { api, calls, fail: () => { fail = true; }, dismissed: () => { accepted = false; } };
}

test('splash controls synchronously return native results and share a lazy host', () => {
  const f = facade();
  assert.deepEqual(f.calls, []);
  assert.equal(f.api.preventAutoHide(), true);
  assert.equal(f.api.preventAutoHide(), true);
  assert.equal(f.api.hide(), undefined);
  assert.deepEqual(f.calls, ['scope:splash-screen', 'getHost', 'prevent', 'prevent', 'hide']);
  assert.equal(f.api.preventAutoHideAsync, undefined);
  assert.equal(f.api.hideAsync, undefined);
});

test('an already dismissed splash returns false synchronously', () => {
  const f = facade();
  f.dismissed();
  assert.equal(f.api.preventAutoHide(), false);
});

test('iOS uses the same synchronous lazy native contract', () => {
  const f = facade('ios');
  assert.deepEqual(f.calls, []);
  assert.equal(f.api.preventAutoHide(), true);
  assert.equal(f.api.hide(), undefined);
  f.dismissed();
  assert.equal(f.api.preventAutoHide(), false);
  assert.deepEqual(f.calls, ['scope:splash-screen', 'getHost', 'prevent', 'hide', 'prevent']);
  f.fail();
  assert.throws(() => f.api.hide(), /native failure/);
});

test('native hide errors throw synchronously', () => {
  const f = facade();
  f.fail();
  assert.throws(() => f.api.hide(), /native failure/);
});

test('unsupported platforms throw without resolving a native module', () => {
  const f = facade('other');
  assert.throws(() => f.api.preventAutoHide(), /Android/);
  assert.throws(() => f.api.hide(), /Android/);
  assert.deepEqual(f.calls, []);
});

test('initial content acknowledgement waits for the selected renderer draw hook', () => {
  let nextDraw: (() => void) | undefined;
  let ready = 0;
  const roots = {
    '42': { renderer: { onNextDraw: (callback: () => void) => { nextDraw = callback; } } },
  };
  const api = load('InitialContentDraw.ts', {
    'valdi_core/src/Valdi': { getLastRootComponentsManager: () => ({ rootComponents: roots }) },
  });
  assert.equal(api.requestInitialContentDraw('42', () => { ready++; }), true);
  assert.equal(ready, 0);
  assert.ok(nextDraw);
  nextDraw();
  assert.equal(ready, 1);
});

test('a missing renderer cannot acknowledge first content', () => {
  const api = load('InitialContentDraw.ts', {
    'valdi_core/src/Valdi': { getLastRootComponentsManager: () => undefined },
  });
  assert.equal(api.requestInitialContentDraw('missing', () => assert.fail('unexpected ready')), false);
});
