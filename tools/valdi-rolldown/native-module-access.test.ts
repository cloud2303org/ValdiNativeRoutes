import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode } from './codegen/index';

const app = path.resolve(import.meta.dirname, '../../valdi/modules/app_pages');
const requireApp = createRequire(path.join(app, 'package.json'));

function runtime() {
  const calls: string[] = [];
  const scopes: string[] = [];
  const context = vm.createContext({ Error });
  const cache = new Map<string, any>();
  let token = '';
  let callback: ((error: string, value?: object) => void) | undefined;
  const navigation = { updateRoutes: (value: unknown) => calls.push(`routes:${String(value)}`) };
  const tokens = {
    has: () => { calls.push('has'); return !!token; },
    read: () => { calls.push('read'); return token; },
    write: (value: string) => { calls.push('write'); token = value; },
    clear: () => { calls.push('clear'); token = ''; },
  };
  const boundaries: Record<string, unknown> = {
    valibot: requireApp('valibot'),
    'valdi_core/src/NativeReferences': {
      withGlobalNativeRefs: (name: string, body: () => unknown) => {
        scopes.push(name);
        try { return body(); } finally { scopes.pop(); }
      },
    },
    './AppContext': { getHost: () => {
      calls.push(`context:${scopes.at(-1)}`);
      return { getTokenStore: () => tokens, getNavigationHost: () => navigation };
    } },
    './navigation': { router: {
      resetToTabs: () => calls.push('tabs'),
      reset: (route: string) => calls.push(`reset:${route}`),
    } },
    './Vision': { getHost: () => {
      calls.push(`vision:${scopes.at(-1)}`);
      return { runDemo: (done: typeof callback) => { callback = done; } };
    } },
  };
  function load(name: string) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    cache.set(name, module.exports);
    const code = ts.transpileModule(readFileSync(path.join(app, 'src', `${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(
      (id: string) => {
        assert.ok(Object.hasOwn(boundaries, id), id);
        return boundaries[id];
      }, module, module.exports,
    );
    return module.exports as any;
  }
  return { load, calls, scopes, complete: (error: string, value?: object) => callback!(error, value) };
}

test('auth and navigation obtain cached native capabilities lazily without installation', () => {
  const f = runtime();
  const { auth } = f.load('auth');
  const navigation = f.load('NavigationHost');
  assert.deepEqual(f.calls, []);
  assert.equal(auth.isSignedIn(), false);
  auth.signIn('test-token');
  assert.equal(auth.getToken(), 'test-token');
  assert.equal(auth.isSignedIn(), true);
  auth.signOut();
  assert.equal(auth.getToken(), undefined);
  assert.throws(() => auth.signIn(' '));
  assert.equal(navigation.navigationHost(), navigation.navigationHost());
  navigation.publishRoutes('fixture');
  assert.deepEqual(f.calls, [
    'context:app-auth', 'has', 'write', 'tabs', 'clear', 'reset:login',
    'context:app-navigation', 'routes:fixture',
  ]);
  assert.deepEqual(f.scopes, [], 'native scope is restored after synchronous marshaling');
});

test('Vision registers real one-shot callbacks on first use and preserves result/errors', async () => {
  const f = runtime();
  const vision = f.load('vision/VisionHost');
  assert.deepEqual(f.calls, []);
  const result = { width: 256 };
  const pending = vision.runDemo();
  assert.deepEqual(f.calls, ['vision:vision.runDemo']);
  assert.deepEqual(f.scopes, []);
  f.complete('', result);
  assert.equal(await pending, result);
  const failed = vision.runDemo();
  f.complete('native failure');
  await assert.rejects(failed, /native failure/);
  const empty = vision.runDemo();
  f.complete('');
  await assert.rejects(empty, /no result/);
});

test('real module codegen exposes AppContext and Vision factories with debug-only startup', () => {
  const generated = generateNativeCode(codegenModules().app_pages);
  const all = generated.sources.map(item => item.source.content).join('\n');
  for (const name of ['AppContextNativeModuleFactory', 'VisionNativeModuleFactory']) {
    assert.ok(all.includes(name), name);
  }
  assert.ok(all.includes('app_pages/src/AppContext'));
  assert.ok(all.includes('app_pages/src/vision/Vision'));
  assert.match(all, /fun invoke\(debug: Boolean\): RouteDeclaration/);
  assert.doesNotMatch(all, /installVisionHost/);
});
