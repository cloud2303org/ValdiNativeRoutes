import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode } from './codegen/index';

const app = path.resolve(import.meta.dirname, '../../valdi/modules/app_pages');
const modules = path.dirname(app);

function runtime() {
  const calls: string[] = [];
  const scopes: string[] = [];
  const context = vm.createContext({ Error });
  const cache = new Map<string, any>();
  let callback: ((error: string, value?: object) => void) | undefined;
  const navigation = { updateRoutes: (value: unknown) => calls.push(`routes:${String(value)}`) };
  const boundaries: Record<string, unknown> = {
    'valdi_core/src/NativeReferences': {
      withGlobalNativeRefs: (name: string, body: () => unknown) => {
        scopes.push(name);
        try { return body(); } finally { scopes.pop(); }
      },
    },
    'app_foundation/src/host/AppContext': { getHost: () => {
      calls.push(`context:${scopes.at(-1)}`);
      return { getNavigationHost: () => navigation };
    } },
    'app_vision/src/Vision': { getHost: () => {
      calls.push(`vision:${scopes.at(-1)}`);
      return { runDemo: (done: typeof callback) => { callback = done; } };
    } },
  };
  function load(name: string) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    cache.set(name, module.exports);
    const code = ts.transpileModule(readFileSync(path.join(modules, `${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(
      (id: string) => {
        if (id.startsWith('.')) id = path.posix.normalize(path.posix.join(path.posix.dirname(name), id));
        if (Object.hasOwn(boundaries, id)) return boundaries[id];
        assert.match(id, /^(app_foundation|app_pages|app_vision)\//);
        return load(id);
      }, module, module.exports,
    );
    return module.exports as any;
  }
  return { load, calls, scopes, complete: (error: string, value?: object) => callback!(error, value) };
}

test('native navigation host is acquired lazily and restores its native scope after publishing', () => {
  const f = runtime();
  const navigation = f.load('app_foundation/src/navigation/NavigationHost');
  assert.deepEqual(f.calls, []);
  assert.equal(navigation.navigationHost(), navigation.navigationHost());
  navigation.publishRoutes('fixture');
  assert.deepEqual(f.calls, [
    'context:app-navigation', 'routes:fixture',
  ]);
  assert.deepEqual(f.scopes, [], 'native scope is restored after synchronous marshaling');
});

test('Vision registers real one-shot callbacks on first use and preserves result/errors', async () => {
  const f = runtime();
  const vision = f.load('app_vision/src/VisionHost');
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
  const targets = codegenModules();
  const output = (name: string) => generateNativeCode(targets[name]).sources
    .map(item => item.source.content).join('\n');
  const pages = output('app_pages');
  const foundation = output('app_foundation');
  const vision = output('app_vision');
  assert.ok(foundation.includes('AppContextNativeModuleFactory'));
  assert.ok(foundation.includes('app_foundation/src/host/AppContext'));
  assert.doesNotMatch(foundation, /TokenStore|getTokenStore/);
  assert.ok(vision.includes('VisionNativeModuleFactory'));
  assert.ok(vision.includes('app_vision/src/Vision'));
  assert.match(pages, /fun invoke\(debug: Boolean\): RouteDeclaration/);
  assert.doesNotMatch(pages, /AppContextNativeModuleFactory|VisionNativeModuleFactory/);
  assert.doesNotMatch(foundation, /VisionNativeModuleFactory/);
  assert.doesNotMatch(vision, /AppContextNativeModuleFactory/);
  for (const all of [pages, foundation, vision]) {
    assert.doesNotMatch(all, /app_pages\/src\/(?:AppContext|vision\/Vision)/);
    assert.doesNotMatch(all, /installVisionHost/);
  }
});
