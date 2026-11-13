import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { buildModule, root, valdiSourceRoot } from './pipeline';
import { valdiTs, type ValdiModule } from './valdiTs';

const upstream = process.env.VALDI_SOURCE_ROOT ?? valdiSourceRoot()
  ?? path.join(root, 'valdi/.valdi-sources/external/valdi+');
const upstreamModules = path.join(upstream, 'src/valdi_modules/src/valdi');
const providerId = 'valdi_core/src/ValdiRuntimeProvider';
const loaderId = 'valdi_core/src/ModuleLoader';
const methods = ['log', 'warn', 'error', 'info', 'debug'] as const;
const callLabels = [...methods, 'arrow', 'parenthesized'];

function write(directory: string, file: string, content: string) {
  const destination = path.join(directory, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function fixture(t: TestContext) {
  assert.ok(existsSync(path.join(upstreamModules, `${providerId}.ts`)),
    'Set VALDI_SOURCE_ROOT to the upgraded framework checkout');
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-console-log-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const paths = Object.fromEntries(['valdi_core', 'valdi_tsx', 'coreutils', 'source_map']
    .map(name => [`${name}/*`, [path.join(upstreamModules, name, '*')]]));
  paths.tslib = [path.join(upstreamModules, 'valdi_core/src/tslib')];
  const config = {
    extends: path.join(upstream, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      paths,
      types: [path.join(upstream, 'modules/types/Long'), path.join(upstream, 'modules/types/globals')],
    },
  };
  const dir = path.join(temporary, 'fixture');
  write(dir, 'tsconfig.json', JSON.stringify({ ...config, include: ['src/**/*'] }));
  const logging = `
export let argumentEvaluations = 0;
function argument(label: string) { argumentEvaluations++; return label; }
console.log(argument('evaluation'));
export const arrow = () => console.log(argument('arrow'));
export const parenthesized = () => (console.warn(argument('parenthesized')));
export function run() {
  ${methods.map(method => `console.${method}(argument('${method}'));`).join('\n  ')}
  arrow();
  parenthesized();
}
`;
  const jsx = `
import type {} from 'valdi_tsx/src/JSX';
export function render() { <label value="console fixture" />; }
`;
  for (const extension of ['ts', 'tsx']) {
    const suffix = extension === 'tsx' ? jsx : '';
    write(dir, `src/logging-${extension}.${extension}`, logging + suffix);
    // A function reference is not a call and must not introduce a provider.
    write(dir, `src/quiet-${extension}.${extension}`, 'export const report = console.error;\n' + suffix);
  }
  const module: ValdiModule = { name: 'console_fixture', dir, generatedDirs: [] };
  const plugin = valdiTs(module);
  t.after(() => plugin.dispose());

  // Emit the real framework files in bootstrap's CommonJS mode. These inputs
  // remain in the framework checkout; only the temporary tsconfig is written.
  const runtimeDir = path.join(temporary, 'runtime');
  const runtimeSources = [providerId, loaderId].map(id => path.join(upstreamModules, `${id}.ts`));
  write(runtimeDir, 'tsconfig.json', JSON.stringify({ ...config, files: runtimeSources, include: [] }));
  const runtimePlugin = valdiTs({
    name: 'valdi_core', dir: runtimeDir, generatedDirs: [], sourceEntries: runtimeSources,
  }, ts.ModuleKind.CommonJS);
  t.after(() => runtimePlugin.dispose());
  return { module, plugin, runtimePlugin, runtimeSources };
}

// Inspect actual emission, rather than calling the transformer independently.
function providerUsage(code: string) {
  const source = ts.createSourceFile('output.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let requires = 0;
  let lookups = 0;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require'
          && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === providerId) requires++;
      if (ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'getValdiRuntime') lookups++;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { requires, lookups };
}

type Require = (id: string, disableProxy?: boolean, disableSyncDependencies?: boolean) => any;

function evaluate(code: string, filename: string, context: vm.Context, require: Require, exports: object = {}) {
  const module = { exports };
  vm.runInContext(`(function(require, module, exports) {\n${code}\n})`, context, { filename })(
    require, module, exports,
  );
  return module.exports as Record<string, any>;
}

function execute(entries: Map<string, Buffer>, entry: string, providerCode: string) {
  // The provider runs in the host's realm, with the real implementation.
  // Consumer modules receive that provider only through their require boundary.
  // A global runtime in the consumer realm would hide a stale transformer.
  const host = vm.createContext({});
  const realProvider = evaluate(providerCode, `${providerId}.js`, host, id => {
    assert.fail(`Provider unexpectedly required ${id} without a browser host`);
  });
  let lookups = 0;
  const provider = new Proxy(realProvider, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      return key === 'getValdiRuntime' ? (...args: unknown[]) => {
        lookups++;
        return Reflect.apply(value, target, args);
      } : value;
    },
  });
  const logs: unknown[][] = [];
  const renders: string[] = [];
  const consoleBoundary = Object.fromEntries(methods.map(method =>
    [method, (...args: unknown[]) => logs.push([method, ...args])]));
  const context = vm.createContext({ console: consoleBoundary });
  vm.runInContext(`Object.defineProperty(globalThis, 'runtime', {
    get() { throw new Error('Consumer used a global runtime fallback instead of its required provider'); },
  });`, context);
  const cache = new Map<string, Record<string, any>>();
  const required: string[] = [];
  const jsx = {
    makeNodePrototype(tag: string) { return { tag }; },
    beginRender(node: { tag: string }) { renders.push(node.tag); },
    endRender() { renders.push('end'); },
  };
  function load(id: string): Record<string, any> {
    if (cache.has(id)) return cache.get(id)!;
    const code = entries.get(id);
    assert.ok(code, `Missing emitted entry ${id}`);
    const exports = {};
    cache.set(id, exports);
    const value = evaluate(code.toString(), id, context, specifier => {
      required.push(specifier);
      if (specifier === providerId) return provider;
      if (specifier === 'valdi_core/src/JSX') return { jsx };
      assert.ok(specifier.startsWith('.'), `Unexpected external ${specifier}`);
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(id), specifier)) + '.js');
    }, exports);
    cache.set(id, value);
    return value;
  }
  return { exports: load(entry), host, logs, renders, required, lookups: () => lookups, consoleBoundary };
}

test('console logging through valdiTs and debug/minified buildModule output', async t => {
  const f = fixture(t);
  assert.equal(f.plugin.diagnostics(), '');
  const providerCode = f.runtimePlugin.emit(f.runtimeSources[0]);
  const commonJsPlugin = valdiTs(f.module, ts.ModuleKind.CommonJS);
  t.after(() => commonJsPlugin.dispose());
  const transformed = new Map<string, Buffer>();
  for (const extension of ['ts', 'tsx']) {
    for (const name of ['quiet', 'logging']) {
      const source = path.join(f.module.dir, `src/${name}-${extension}.${extension}`);
      await t.test(`ESNext emission, ${name} ${extension}: provider and guard counts`, () => {
        assert.deepEqual(providerUsage(f.plugin.emit(source)), name === 'quiet'
          ? { requires: 0, lookups: 0 }
          : { requires: 1, lookups: callLabels.length + 1 });
      });
      transformed.set(`src/${name}-${extension}.js`,
        Buffer.from(commonJsPlugin.emit(source)));
    }
  }
  const outputs = [
    ['CommonJS TypeScript emission', transformed],
    ['debug bundle', (await buildModule(f.module, f.plugin, false)).entries],
    ['minified bundle', (await buildModule(f.module, f.plugin, true)).entries],
  ] as const;

  for (const [mode, entries] of outputs) {
    for (const extension of ['ts', 'tsx']) {
      await t.test(`${mode}, ${extension}: no log calls add no provider dependency`, () => {
        const entry = `src/quiet-${extension}.js`;
        assert.deepEqual(providerUsage(entries.get(entry)!.toString()), { requires: 0, lookups: 0 });
        const h = execute(entries, entry, providerCode);
        assert.equal(h.exports.report, h.consoleBoundary.error);
        assert.ok(!h.required.includes(providerId));
        assert.equal(h.lookups(), 0);
        if (extension === 'tsx') {
          h.exports.render();
          assert.deepEqual(h.renders, ['label', 'end']);
        }
      });

      await t.test(`${mode}, ${extension}: provider installs and toggles without evaluating disabled arguments`, () => {
        const entry = `src/logging-${extension}.js`;
        const h = execute(entries, entry, providerCode);
        assert.deepEqual(providerUsage(entries.get(entry)!.toString()), {
          requires: 1, lookups: callLabels.length + 1,
        }, 'JSX processing plus the generic pass must inject one provider and one guard per call');
        assert.equal(h.required.filter(id => id === providerId).length, 1);
        assert.equal(h.lookups(), 1, 'top-level logging must consult the provider while no runtime exists');
        assert.equal(h.exports.argumentEvaluations, 0);
        assert.deepEqual(h.logs, []);

        let expectedLookups = 1;
        let enabledRuns = 0;
        function run(enabled: boolean) {
          h.exports.run();
          expectedLookups += callLabels.length;
          if (enabled) enabledRuns++;
          assert.equal(h.lookups(), expectedLookups, 'every call gets exactly one fresh runtime lookup');
          assert.equal(h.exports.argumentEvaluations, enabledRuns * callLabels.length);
          const expectedRun = [
            ...methods.map(method => [method, method]),
            ['log', 'arrow'], ['warn', 'parenthesized'],
          ];
          assert.deepEqual(h.logs, Array.from({ length: enabledRuns }, () => expectedRun).flat());
        }
        run(false); // Provider returns undefined, including after module evaluation.
        const runtime = { isLoggingEnabled: false };
        h.host.runtime = runtime;
        run(false); // Host installs a disabled runtime after the module was loaded.
        runtime.isLoggingEnabled = true;
        run(true);
        runtime.isLoggingEnabled = false;
        run(false);
        runtime.isLoggingEnabled = true;
        run(true);
        h.host.runtime = { isLoggingEnabled: false };
        run(false); // Replacement must be observed, not just mutation of a cached object.
        h.host.runtime = { isLoggingEnabled: true };
        run(true);
        delete h.host.runtime;
        run(false);
        if (extension === 'tsx') {
          h.exports.render();
          assert.deepEqual(h.renders, ['label', 'end'], 'the fixture must actually execute transformed JSX');
        }
      });
    }
  }
});

test('actual ModuleLoader bootstrap stays independent of the provider require cycle', async t => {
  const f = fixture(t);
  const bootstrap = f.runtimePlugin.emit(f.runtimeSources[1]);
  assert.deepEqual(providerUsage(bootstrap), { requires: 0, lookups: 0 });
  // Check the source as well as emission: these are the upstream safeguards
  // keeping logging guards out of the loader that creates require itself.
  const source = readFileSync(f.runtimeSources[1], 'utf8');
  assert.match(source, /globalThis\.console\?\.log/);
  assert.doesNotMatch(source, /import .*ValdiRuntimeProvider/);
  for (const environment of [{}, { window: { document: {} } }, { importScripts() {} }]) {
    const context = vm.createContext({ ...environment, console: undefined });
    const exports = evaluate(bootstrap, `${loaderId}.js`, context, id => {
      assert.fail(`Bootstrap required ${id} before the loader exists`);
    });
    const evaluated: string[] = [];
    const loader = exports.create((id: string, _require: Require, module: { exports: any }) => {
      evaluated.push(id);
      if (id.includes('/missing')) throw new Error('missing fixture module');
      module.exports = { ready: true };
    }, undefined, undefined, false);
    // No runtime, provider, console or getCurrentPlatform is available here.
    assert.equal(loader.load('console_fixture/src/./ready', true).ready, true);
    assert.deepEqual(evaluated, [
      'window' in environment || 'importScripts' in environment
        ? 'console_fixture/src/./ready' : 'console_fixture/src/ready',
    ]);
    // Preload's error path is bootstrap-safe even before console is installed;
    // its only runtime requirement is the declared host logging flag.
    context.runtime = { isLoggingEnabled: false };
    loader.preloadBatch(['console_fixture/src/missing', 'console_fixture/src/next'], 0);
    assert.equal(loader.load('console_fixture/src/next', true).ready, true);
    context.runtime.isLoggingEnabled = true;
    loader.preloadBatch(['console_fixture/src/missing-again'], 0);
  }
});
