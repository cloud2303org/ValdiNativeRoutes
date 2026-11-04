import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { buildModule, root, valdiSourceRoot, type Built } from './pipeline';
import { valdiTs, type ValdiModule } from './valdiTs';

// Never call writeTsconfig/compileRuntimeModule here: their app/global setup is
// outside this test's scope. Every generated file lives under this one temp root.
const upstream = process.env.VALDI_SOURCE_ROOT ?? valdiSourceRoot()
  ?? path.join(root, 'valdi/.valdi-sources/external/valdi+');
const upstreamModules = path.join(upstream, 'src/valdi_modules/src/valdi');

function write(root: string, file: string, content: string) {
  const destination = path.join(root, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function fixture(t: TestContext) {
  assert.ok(existsSync(path.join(upstreamModules, 'valdi_core/src/LazyImport.ts')),
    'set VALDI_SOURCE_ROOT to the upgraded framework checkout');
  // Match Node's canonical package paths on every host (/var -> /private/var
  // on macOS), so dependency classification is tested with Linux's layout too.
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-lazy-import-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const dir = path.join(temporary, 'app');
  const runtimeDir = path.join(temporary, 'valdi_core');
  // Copy the real sources verbatim, including their declaration dependencies.
  cpSync(path.join(upstreamModules, 'valdi_core/src'), path.join(runtimeDir, 'src'), { recursive: true });
  const paths = Object.fromEntries(['valdi_core', 'valdi_tsx', 'coreutils', 'source_map']
    .map(name => [`${name}/*`, [path.join(upstreamModules, name, '*')]]));
  paths['tslib'] = [path.join(upstreamModules, 'valdi_core/src/tslib')];
  paths['fixture/*'] = [path.join(dir, '*')];
  const config = {
    extends: path.join(upstream, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: {
      paths,
      types: [path.join(upstream, 'modules/types/Long'), path.join(upstream, 'modules/types/globals')],
    },
    include: ['src/**/*.ts'],
  };
  write(dir, 'tsconfig.json', JSON.stringify(config));
  write(runtimeDir, 'tsconfig.json', JSON.stringify({ ...config,
    files: ['src/ModuleLoader.ts', 'src/LazyImport.ts'], include: [],
  }));
  const runtimeModule: ValdiModule = {
    name: 'valdi_core', dir: runtimeDir, generatedDirs: [],
    sourceEntries: ['ModuleLoader', 'LazyImport'].map(name => path.join(runtimeDir, `src/${name}.ts`)),
  };
  // Bootstrap must be standalone CommonJS, exactly as runtime-module.ts emits
  // it; a Rolldown shared chunk cannot be required before the loader exists.
  const runtimePlugin = valdiTs(runtimeModule, ts.ModuleKind.CommonJS);
  const bootstrap = runtimePlugin.emit(path.join(runtimeDir, 'src/ModuleLoader.ts'));
  const lazyImport = runtimePlugin.emit(path.join(runtimeDir, 'src/LazyImport.ts'));
  const module: ValdiModule = { name: 'fixture', dir, generatedDirs: [], nodeModules: path.join(dir, 'node_modules') };
  return { dir, module, bootstrap, lazyImport };
}

type Fixture = ReturnType<typeof fixture>;
type Require = (id: string, disableProxy?: boolean, disableSyncDependencies?: boolean) => any;
interface Loader {
  load: Require;
  isLoaded(id: string): boolean;
}

function host(fixture: Fixture, built: Built, extra: Record<string, string> = {}) {
  const sources = new Map<string, string>([
    ...[...built.entries].map(([name, content]): [string, string] => [`fixture/${name.slice(0, -3)}`, content.toString()]),
    ['valdi_core/src/LazyImport', fixture.lazyImport],
    ...Object.entries(extra),
  ]);
  const evaluated: string[] = [];
  const events: string[] = [];
  // This is a JS host contract, not a substitute ModuleLoader/Proxy or native
  // ABI mock. Unexpected runtime calls and missing module paths throw normally.
  const context = vm.createContext({ events, runtime: { getCurrentPlatform: () => 1 } });
  const evaluate = (code: string, filename: string, require: Require, module: object, exports: object) => {
    vm.runInContext(`(function(require, module, exports) {\n${code}\n})`, context, { filename })(require, module, exports);
  };
  const bootstrapExports: Record<string, any> = {};
  evaluate(fixture.bootstrap, 'valdi_core/src/ModuleLoader.js', id => {
    assert.fail(`ModuleLoader bootstrap unexpectedly required ${id}`);
  }, { exports: bootstrapExports }, bootstrapExports);
  const loader: Loader = bootstrapExports.create(
    (id: string, require: Require, module: object, exports: object) => {
      const code = sources.get(id);
      assert.notEqual(code, undefined, `module path must resolve to an actual emitted entry: ${id}`);
      evaluated.push(id);
      evaluate(code!, `${id}.js`, require, module, exports);
      return undefined;
    },
    undefined, // no source map resolver is needed for execution
    undefined, // no native bundle preloader: all module sources are in memory
    false, // use Valdi's real lazy proxies, not CommonJS compatibility mode
  );
  return { loader, evaluated, events };
}

async function build(f: Fixture, minify: boolean) {
  const plugin = valdiTs(f.module);
  assert.equal(plugin.diagnostics(), '', 'the fixture must type-check through valdiTs');
  return buildModule(f.module, plugin, minify);
}

for (const minify of [false, true]) {
  const mode = minify ? 'minified' : 'unminified';

  test(`callback LazyImport executes real local TS and external modules once, relative to each caller (${mode})`, async t => {
    const f = fixture(t);
    write(f.dir, 'src/events.d.ts', 'declare const events: string[];\n');
    for (const directory of ['left', 'right']) {
      write(f.dir, `src/${directory}/entry.ts`, `
import { lazyImport } from 'valdi_core/src/LazyImport';
export const local = lazyImport<typeof import('./module')>(() => {
  events.push('${directory}:callback');
  return require('./module', true);
});
export const external = lazyImport<typeof import('valdi_core/src/ExternalProbe')>(() => {
  events.push('${directory}:external-callback');
  return require('valdi_core/src/ExternalProbe', true);
});
`);
      write(f.dir, `src/${directory}/module.ts`, `events.push('${directory}:module');\nexport const origin = '${directory}';\n`);
    }
    write(f.dir, 'src/external.d.ts', "declare module 'valdi_core/src/ExternalProbe' { export const origin: string; }\n");
    const built = await build(f, minify);
    const h = host(f, built, {
      'valdi_core/src/ExternalProbe': "events.push('external:module'); exports.origin = 'external';",
    });
    const left = h.loader.load('fixture/src/left/entry', true);
    const right = h.loader.load('fixture/src/right/entry', true);
    assert.deepEqual(h.events, []);
    const targets = ['fixture/chunks/src/left/module', 'fixture/chunks/src/right/module', 'valdi_core/src/ExternalProbe'];
    for (const id of targets) {
      assert.equal(h.loader.isLoaded(id), false, id);
      assert.ok(!h.evaluated.includes(id), id);
    }
    const local = left.local.get;
    assert.deepEqual(h.events, ['left:callback', 'left:module'], 'get itself must execute the module before any export read');
    assert.equal(local.origin, 'left');
    assert.strictEqual(left.local.get, local);
    assert.deepEqual(h.events, ['left:callback', 'left:module']);
    const other = right.local.get;
    assert.equal(other.origin, 'right');
    assert.strictEqual(right.local.get, other);
    const external = left.external.get;
    assert.deepEqual(h.events, ['left:callback', 'left:module', 'right:callback', 'right:module',
      'left:external-callback', 'external:module'], 'disableProxy=true must execute the external module during get');
    assert.equal(external.origin, 'external');
    assert.strictEqual(left.external.get, external);
    assert.strictEqual(right.external.get, external);
    assert.strictEqual(right.external.get, external);
    assert.deepEqual(h.events, ['left:callback', 'left:module', 'right:callback', 'right:module',
      'left:external-callback', 'external:module', 'right:external-callback']);
    for (const id of targets) {
      assert.equal(h.evaluated.filter(value => value === id).length, 1, id);
      assert.equal(h.loader.isLoaded(id), true, id);
    }
    // Rolldown moves local require targets into initializer chunks. Loading the
    // public entry afterwards must reuse that initializer, not execute TS twice.
    for (const directory of ['left', 'right']) {
      assert.equal(h.loader.load(`fixture/src/${directory}/module`, true).origin, directory);
      assert.equal(h.events.filter(event => event === `${directory}:module`).length, 1);
    }
  });

  test(`standalone side-effect imports execute once across callers (${mode})`, async t => {
    const f = fixture(t);
    write(f.dir, 'src/probe.d.ts', "declare module 'valdi_core/src/SideEffectProbe' {}\n");
    for (const name of ['first', 'nested/second']) {
      write(f.dir, `src/${name}.ts`, "import 'valdi_core/src/SideEffectProbe';\nexport const ready = true;\n");
    }
    const h = host(f, await build(f, minify), {
      'valdi_core/src/SideEffectProbe': "events.push('external side effect');",
    });
    assert.equal(h.loader.load('fixture/src/first', true).ready, true);
    assert.deepEqual(h.events, ['external side effect'], 'the output plugin must force bare require execution');
    assert.equal(h.loader.load('fixture/src/nested/second', true).ready, true);
    assert.deepEqual(h.events, ['external side effect']);
    assert.equal(h.evaluated.filter(id => id === 'valdi_core/src/SideEffectProbe').length, 1);
  });

  test(`a retained namespace proxy stays lazy until its first property read (${mode})`, async t => {
    const f = fixture(t);
    write(f.dir, 'src/probe.d.ts', "declare module 'valdi_core/src/NamespaceProbe' { export const answer: number; }\n");
    write(f.dir, 'src/index.ts', `
import * as probe from 'valdi_core/src/NamespaceProbe';
export const untouched = probe;
export const ready = true;
`);
    const h = host(f, await build(f, minify), {
      'valdi_core/src/NamespaceProbe': "events.push('namespace'); exports.answer = 42;",
    });
    const entry = h.loader.load('fixture/src/index', true);
    const untouched = entry.untouched; // retain the import without reading the proxy
    assert.equal(entry.ready, true);
    assert.deepEqual(h.events, []);
    assert.equal(h.loader.isLoaded('valdi_core/src/NamespaceProbe'), false);
    assert.ok(!h.evaluated.includes('valdi_core/src/NamespaceProbe'));
    assert.equal(untouched.answer, 42);
    assert.equal(untouched.answer, 42);
    assert.deepEqual(h.events, ['namespace']);
    assert.equal(h.evaluated.filter(id => id === 'valdi_core/src/NamespaceProbe').length, 1);
  });

  test(`external star reexports enumerate loaded exports with the real lazy loader (${mode})`, async t => {
    const f = fixture(t);
    write(f.dir, 'src/probe.d.ts', `
declare module 'valdi_core/src/SchemaProbe' {
  export const loadingRequest: { parse(value: string): string };
}
`);
    write(f.dir, 'src/schemas.ts', "export * from 'valdi_core/src/SchemaProbe';\n");
    write(f.dir, 'src/index.ts', `
import * as schemas from './schemas';
export function validate(value: string) { return schemas.loadingRequest.parse(value); }
`);
    const h = host(f, await build(f, minify), {
      'valdi_core/src/SchemaProbe': `
events.push('schema loaded');
exports.loadingRequest = { parse: value => 'validated:' + value };
`,
    });
    assert.equal(h.loader.isLoaded('valdi_core/src/SchemaProbe'), false);
    const entry = h.loader.load('fixture/src/index', true);
    assert.equal(entry.validate('loading'), 'validated:loading');
    assert.equal(h.loader.load('fixture/src/schemas', true).loadingRequest.parse('toast'), 'validated:toast');
    assert.deepEqual(h.events, ['schema loaded']);
    assert.equal(h.evaluated.filter(id => id === 'valdi_core/src/SchemaProbe').length, 1);
  });

  test(`npm shared chunk side effects resolve from nested output entries and run once (${mode})`, async t => {
    const f = fixture(t);
    write(f.dir, 'node_modules/side-effect-probe/package.json', JSON.stringify({
      name: 'side-effect-probe', version: '1.0.0', type: 'module', main: 'index.js', types: 'index.d.ts', sideEffects: true,
    }));
    write(f.dir, 'node_modules/side-effect-probe/index.js', "events.push('npm shared side effect'); export const answer = 42;\n");
    write(f.dir, 'node_modules/side-effect-probe/index.d.ts', 'export declare const answer: number;\n');
    for (const name of ['first', 'nested/second']) {
      write(f.dir, `src/${name}.ts`, "import 'side-effect-probe';\nexport const ready = true;\n");
    }
    const built = await build(f, minify);
    const chunks = [...built.entries.keys()].filter(name => name.startsWith('npm/'));
    assert.equal(chunks.length, 1, 'exercise an actual npm shared chunk, not inlined package code');
    const h = host(f, built);
    assert.equal(h.loader.load('fixture/src/nested/second', true).ready, true);
    assert.deepEqual(h.events, ['npm shared side effect']);
    assert.equal(h.loader.load('fixture/src/first', true).ready, true);
    assert.deepEqual(h.events, ['npm shared side effect']);
    const chunkId = `fixture/${chunks[0].slice(0, -3)}`;
    assert.equal(h.evaluated.filter(id => id === chunkId).length, 1, 'nested require must resolve to the shared archive entry');
  });
}
