import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { codegenModules, generateNativeCode, nativeSourceFiles } from './codegen/index';
import { appModule } from './pipeline';

const app = appModule('mmkv');
function runtime() {
  const context = vm.createContext({});
  const requireApp = createRequire(path.join(app.dir, 'package.json'));
  const cache = new Map<string, any>();
  const load = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context)(
      (name: string) => {
        if (name === './MMKV') return { getHost: () => context.nativeStorageHost };
        if (name.startsWith('native_common/')) return load(path.join(appModule('native_common').dir, name.slice('native_common/'.length) + '.ts'));
        return name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : requireApp(name);
      },
      module, module.exports,
    );
    return module.exports;
  };
  Object.assign(context, { storage: load(path.join(app.dir, 'src/storage.ts')) });
  const evaluate = (source: string) => vm.runInContext(source, context);
  evaluate(`
    globalThis.writes = [];
    globalThis.records = new Map();
    globalThis.nativeStorageHost = {
      get: key => records.has(key) ? { found: true, payload: records.get(key), error: '' }
                                 : { found: false, payload: {}, error: '' },
      set: request => { writes.push(request); records.set(request.key, request.payload); return true; },
      remove: key => records.delete(key), clear: () => records.clear(),
    };
    globalThis.api = storage.storageApi((method, cause) => new Error(method + ': ' + cause.message));
  `);
  return { evaluate };
}

test('storage sends generated structured requests and reads typed replies for all root value shapes', () => {
  const { evaluate } = runtime();
  for (const source of ['null', 'true', 'false', '1.25', "'中文 👋'", "''", "[null, false, { nested: 'x' }]", "({ __proto__: null, own: 'value' })"]) {
    evaluate(`api.setStorageSync('key', ${source})`);
    assert.equal(evaluate('typeof writes.at(-1)'), 'object');
    assert.equal(evaluate('typeof writes.at(-1).payload'), 'object');
    assert.equal(evaluate("JSON.stringify(api.getStorageSync('key'))"), evaluate(`JSON.stringify(${source})`));
  }
  assert.equal(evaluate("api.getStorageSync('missing')"), undefined);
  evaluate("api.setStorageSync('null', null)");
  assert.equal(evaluate("api.getStorageSync('null')"), null);
  evaluate("api.removeStorageSync('null')");
  assert.equal(evaluate("api.getStorageSync('null')"), undefined);
  evaluate('api.clearStorageSync()');
  assert.equal(evaluate('records.size'), 0);
});

test('writes pass structured values through without JSON conversion', () => {
  const { evaluate } = runtime();
  evaluate(`
    globalThis.input = { missing: undefined, list: [null, false], nested: { n: 1 } };
    globalThis.special = JSON.parse('{"__proto__":{"safe":true}}');
    JSON.parse = JSON.stringify = () => { throw Error('JSON transport is forbidden'); };
    api.setStorageSync('key', input);
    input.nested.n = 9;
    api.setStorageSync('proto', special);
  `);
  assert.equal(evaluate("api.getStorageSync('key').nested.n"), 9);
  assert.equal(evaluate("Object.hasOwn(api.getStorageSync('key'), 'missing')"), true);
  assert.equal(evaluate("Object.hasOwn(writes.at(-1).payload.value, '__proto__')"), true);
  assert.equal(evaluate("api.getStorageSync('proto').__proto__.safe"), true);
});

test('typed reads do not parse bridge data and corrupt records/write failures remain API errors', () => {
  const { evaluate } = runtime();
  evaluate("api.setStorageSync('key', { ok: true }); JSON.parse = () => { throw Error('no JSON read bridge'); }");
  assert.equal(evaluate("api.getStorageSync('key').ok"), true);
  evaluate("nativeStorageHost.get = () => ({ found: false, payload: {}, error: 'corrupt record' })");
  assert.throws(() => evaluate("api.getStorageSync('key')"), /getStorageSync: corrupt record/);
  const fresh = runtime();
  fresh.evaluate('nativeStorageHost.set = () => false');
  assert.throws(() => fresh.evaluate("api.setStorageSync('key', 'value')"), /setStorageSync: the store could not write it/);
});

test('unrepresentable values reach the host and empty keys are still rejected', () => {
  const { evaluate } = runtime();
  for (const value of ['undefined', '() => {}', 'BigInt(1)', 'NaN', 'Infinity', 'new Date()', '[,]', '[undefined]', '({ toJSON: () => 1 })', '({ get value() { throw Error("getter called"); } })', '(() => { const x = {}; x.x = x; return x; })()']) {
    evaluate(`api.setStorageSync('key', ${value})`);
  }
  assert.equal(evaluate('writes.length'), 11);
  assert.throws(() => evaluate("api.setStorageSync(' ', 1)"), /key must not be empty/);
});

test('real generator exports structured storage request/reply signatures on all native targets', () => {
  const target = codegenModules().mmkv;
  const code = generateNativeCode(target);
  const platform = (name: 'android' | 'ios' | 'cpp') => [...nativeSourceFiles(target, code, name)].map(([, source]) => source).join('\n');
  const android = platform('android');
  assert.match(android, /get: \(key: String\) -> StorageReadReply/);
  assert.match(android, /set: \(request: StorageWriteRequest\) -> Boolean/);
  assert.match(android, /payload: Map<String, Any\?>/);
  const ios = platform('ios');
  assert.match(ios, /VRStorageReadReply \* _Nonnull\(\^VRStorageHostGetBlock\)/);
  assert.match(ios, /VRStorageHostSetBlock\)\(VRStorageWriteRequest \* _Nonnull request\)/);
  const cpp = platform('cpp');
  assert.match(cpp, /using GetFn = Valdi::Function<StorageReadReply\(Valdi::StringBox\)>/);
  assert.match(cpp, /using SetFn = Valdi::Function<bool\(StorageWriteRequest\)>/);
});
