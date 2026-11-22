import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { projectDiagnostics, readModuleProject } from '../typescript-project';
import { sourceFiles, valdiTs } from '../valdiTs';
import type { ValdiModule } from '../valdiTs';

const tools = path.resolve(import.meta.dirname, '..');
const root = path.resolve(tools, '../..');
const scalarOptions = {
  experimentalDecorators: true,
  target: 'ES2020',
  module: 'commonjs',
  lib: ['dom', 'ES2021'],
  noImplicitReturns: true,
  noImplicitAny: true,
  importHelpers: true,
  strict: true,
  forceConsistentCasingInFileNames: true,
  jsx: 'preserve',
};

function put(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function executeArchive(entries: ReadonlyMap<string, Buffer>, entry: string): Record<string, any> {
  const cache = new Map<string, { exports: Record<string, any> }>();
  const load = (file: string): Record<string, any> => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const source = entries.get(file);
    assert.ok(source, `Missing bundled entry: ${file}`);
    const module = { exports: {} };
    cache.set(file, module);
    const require = (specifier: string) => {
      assert.ok(specifier.startsWith('.'), `Unexpected external dependency: ${specifier}`);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      return load(entries.has(resolved) ? resolved : `${resolved}.js`);
    };
    new Function('exports', 'require', 'module', source.toString())(module.exports, require, module);
    return module.exports;
  };
  return load(entry);
}

async function inspectEditorFile(file: string) {
  const requests = [
    { seq: 1, type: 'request', command: 'open', arguments: { file } },
    { seq: 2, type: 'request', command: 'projectInfo', arguments: { file, needFileNameList: true } },
    { seq: 3, type: 'request', command: 'semanticDiagnosticsSync', arguments: { file } },
  ];
  return new Promise<any[]>((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(tools, 'node_modules/typescript/lib/tsserver.js')]);
    const responses: any[] = [];
    let stderr = '';
    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error(`tsserver timed out: ${stderr}`));
    }, 30_000);
    server.stderr.on('data', data => { stderr += data.toString(); });
    const lines = createInterface({ input: server.stdout });
    lines.on('line', line => {
      if (!line.startsWith('{')) return;
      const response = JSON.parse(line);
      responses.push(response);
      if (response.type === 'response' && response.request_seq === 3) {
        server.stdin.end(JSON.stringify({ seq: 4, type: 'request', command: 'exit' }) + '\n');
      }
    });
    server.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    server.on('close', code => {
      clearTimeout(timeout);
      lines.close();
      if (code !== 0) reject(new Error(`tsserver exited ${code}: ${stderr}`));
      else resolve(responses);
    });
    server.stdin.write(requests.map(request => JSON.stringify(request)).join('\n') + '\n');
  });
}

// Copy the entry points, not the shared framework links. Real dependency imports
// resolve through symlinks; root/source discovery is confined to this project.
async function fixture(t: { after: (fn: () => void) => void }) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-editor-')));
  const localTools = path.join(directory, 'tools/valdi-rolldown');
  mkdirSync(localTools, { recursive: true });
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const previousSource = process.env.VALDI_SOURCE_ROOT;
  delete process.env.VALDI_SOURCE_ROOT;
  t.after(() => {
    if (previousSource === undefined) delete process.env.VALDI_SOURCE_ROOT;
    else process.env.VALDI_SOURCE_ROOT = previousSource;
  });
  const copies = new Set(['pipeline.ts', 'module-build.ts', 'tsconfig.ts', 'editor-config.ts']);
  for (const entry of readdirSync(tools, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'tests' || entry.name.endsWith('.test.ts')) continue;
    const destination = path.join(localTools, entry.name);
    if (copies.has(entry.name)) copyFileSync(path.join(tools, entry.name), destination);
    else symlinkSync(path.join(tools, entry.name), destination, entry.isDirectory() ? 'dir' : 'file');
  }
  const bootstrapBase = path.join(directory, 'valdi/tsconfig.editor-base.json');
  put(bootstrapBase, JSON.stringify({ compilerOptions: scalarOptions }));
  put(path.join(directory, 'package.json'), JSON.stringify({ type: 'module', valdi: { modules: ['own', 'sibling'] } }));
  const modules: ValdiModule[] = ['own', 'sibling'].map(name => ({
    name,
    dir: path.join(directory, 'valdi/modules', name),
    generatedDirs: [path.join(localTools, '.gen', name)],
    nodeModules: path.join(directory, 'valdi/modules/own/node_modules'),
  }));
  const [own, sibling] = modules;
  put(path.join(own.dir, 'src/Helper.ts'), 'export const value = 1;\n');
  put(path.join(own.dir, 'src/index.tsx'), `
import { sibling } from 'sibling/src/Component';
import { asset } from 'own/res';
import { siblingAsset } from 'sibling/res';
import { value } from './Helper';
import { npmValue } from 'fixture-npm';
export const answer = sibling + asset + siblingAsset + value + npmValue;
export const view = <view />;
`);
  put(path.join(own.dir, 'src/jsx.d.ts'), 'declare namespace JSX { interface Element {} interface IntrinsicElements { view: {} } }\n');
  put(path.join(own.dir, 'local.d.ts'), 'declare const ownAmbient: number;\n');
  put(path.join(sibling.dir, 'src/Component.tsx'), 'export const sibling = 2;\n');
  put(path.join(sibling.dir, 'src/Unrelated.tsx'), 'export const unrelated = <view />;\n');
  put(path.join(own.generatedDirs[0], 'res.ts'), 'export const asset = 3;\n');
  put(path.join(sibling.generatedDirs[0], 'res.ts'), 'export const siblingAsset = 4;\n');
  put(path.join(localTools, '.gen/unrelated/res.ts'), 'export const unrelated = 5;\n');
  put(path.join(own.nodeModules!, 'fixture-npm/package.json'), JSON.stringify({
    name: 'fixture-npm', main: 'index.js', types: 'index.d.ts',
  }));
  put(path.join(own.nodeModules!, 'fixture-npm/index.js'), 'exports.npmValue = 6;\n');
  put(path.join(own.nodeModules!, 'fixture-npm/index.d.ts'), 'export declare const npmValue: number;\n');
  put(path.join(own.nodeModules!, 'fixture-npm/Unrelated.tsx'), 'export const unrelated = <view />;\n');
  const pipeline = await import(pathToFileURL(path.join(localTools, 'pipeline.ts')).href) as typeof import('../pipeline');
  return { directory, localTools, bootstrapBase, modules, own, sibling, pipeline };
}

function parsed(module: ValdiModule) {
  const file = path.join(module.dir, 'tsconfig.json');
  const read = ts.readConfigFile(file, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, module.dir, undefined, file);
  assert.deepEqual(config.errors, []);
  return { json: read.config, config };
}

function assertResolution(module: ValdiModule, options: ts.CompilerOptions, name: string, expected: string | undefined) {
  const resolved = ts.resolveModuleName(name, path.join(module.dir, 'src/index.tsx'), options, ts.sys).resolvedModule;
  assert.equal(resolved?.resolvedFileName, expected, name);
}

function assertLocalResolution(f: Awaited<ReturnType<typeof fixture>>, config: ts.ParsedCommandLine) {
  assertResolution(f.own, config.options, 'own/src/Helper', path.join(f.own.dir, 'src/Helper.ts'));
  assertResolution(f.own, config.options, './Helper', path.join(f.own.dir, 'src/Helper.ts'));
  assertResolution(f.own, config.options, 'sibling/src/Component', path.join(f.sibling.dir, 'src/Component.tsx'));
  assertResolution(f.own, config.options, 'own/res', path.join(f.own.generatedDirs[0], 'res.ts'));
  assertResolution(f.own, config.options, 'sibling/res', path.join(f.sibling.generatedDirs[0], 'res.ts'));
  assertResolution(f.own, config.options, 'fixture-npm', path.join(f.own.nodeModules!, 'fixture-npm/index.d.ts'));
  assert.deepEqual(config.fileNames.sort(), [
    path.join(f.own.generatedDirs[0], 'res.ts'),
    path.join(f.own.dir, 'local.d.ts'), path.join(f.own.dir, 'src/Helper.ts'),
    path.join(f.own.dir, 'src/index.tsx'), path.join(f.own.dir, 'src/jsx.d.ts'),
  ].sort(), 'roots contain only the individual module sources, declarations and generated inputs');
  const program = ts.createProgram(config.fileNames, config.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(d => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`), []);
  assert.ok(program.getSourceFile(path.join(f.sibling.dir, 'src/Component.tsx')), 'imports still traverse siblings');
  assert.ok(program.getSourceFile(path.join(f.own.generatedDirs[0], 'res.ts')), 'imports still traverse generated declarations');
  assert.ok(!program.getSourceFile(path.join(f.sibling.dir, 'src/Unrelated.tsx')));
  assert.ok(!program.getSourceFile(path.join(f.own.nodeModules!, 'fixture-npm/Unrelated.tsx')));
}

function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  const sources = path.join(f.directory, 'valdi/.valdi-sources/external/valdi+');
  put(path.join(sources, 'modules/_configs/base.tsconfig.json'), JSON.stringify({
    compilerOptions: { ...scalarOptions, noUnusedLocals: true, noFallthroughCasesInSwitch: true },
  }));
  put(path.join(sources, 'modules/types/Long.d.ts'), 'declare const frameworkLong: number;\n');
  put(path.join(sources, 'modules/types/globals.d.ts'), 'declare const frameworkGlobal: number;\n');
  put(path.join(sources, 'src/valdi_modules/src/valdi/valdi_core/src/Component.ts'), 'export const component = 1;\n');
  put(path.join(sources, 'src/valdi_modules/src/valdi/valdi_core/src/tslib.d.ts'), 'export {};\n');
  return sources;
}

test('editor and build check the same sources and declarations while bundling emits ES modules', async t => {
  const f = await fixture(t);
  const sibling = path.join(f.sibling.dir, 'src/Component.tsx');
  put(sibling, `import npm = require('fixture-npm'); export const sibling = npm.npmValue;\n`);
  put(path.join(f.own.dir, 'tests/node.test.mts'), `const value: string = 1; export { value };\n`);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '', 'CommonJS framework imports are valid source');
  assert.equal(plugin.program().getCompilerOptions().module, ts.ModuleKind.Preserve);
  assert.equal(plugin.program().getCompilerOptions().moduleResolution, ts.ModuleResolutionKind.Bundler);
  assert.match(plugin.emit(path.join(f.own.dir, 'src/Helper.ts')), /export const value/);
  assert.ok(!plugin.program().getRootFileNames().some(file => file.endsWith('node.test.mts')));

  const owned = path.join(f.own.dir, 'local.d.ts');
  const external = path.join(f.own.nodeModules!, 'fixture-npm/index.d.ts');
  put(owned, 'interface Owned { run(): void } declare class InvalidOwned implements Owned {}\n');
  put(external, 'interface External { run(): void } export declare class InvalidExternal implements External {} export declare const npmValue: number;\n');
  put(sibling, 'export const sibling: string = 1;\n');
  for (const file of [owned, external, sibling]) plugin.invalidate(file);
  const config = readModuleProject(f.own);
  const editor = projectDiagnostics(ts.createProgram(config.fileNames, config.options), f.own.dir);
  const diagnostics = plugin.diagnostics();
  assert.equal(diagnostics, editor);
  for (const name of ['InvalidOwned', 'InvalidExternal', 'Component.tsx']) assert.ok(diagnostics.includes(name), diagnostics);
  assert.match(diagnostics, /TS2420/);
  assert.match(diagnostics, /TS2322/);
  await assert.rejects(f.pipeline.buildModule(f.own, plugin, false), error =>
    error instanceof Error && error.message === diagnostics);
});

test('conditional package exports select the same import types and bundled implementation through either module entry', async t => {
  const f = await fixture(t);
  const npm = path.join(f.own.nodeModules!, 'fixture-exports');
  put(path.join(npm, 'package.json'), JSON.stringify({
    name: 'fixture-exports', type: 'module',
    exports: {
      '.': {
        import: { types: './types/import.d.ts', default: './esm/index.js' },
        require: { types: './types/require.d.cts', default: './cjs/index.cjs' },
      },
      './feature': { types: './types/feature.d.ts', default: './esm/feature.js' },
    },
  }));
  put(path.join(npm, 'types/import.d.ts'), "export declare const mode: 'import';\n");
  put(path.join(npm, 'types/require.d.cts'), "export declare const mode: 'require';\n");
  put(path.join(npm, 'types/feature.d.ts'), 'export declare const feature: number;\n');
  put(path.join(npm, 'esm/index.js'), "export const mode = 'import';\n");
  put(path.join(npm, 'cjs/index.cjs'), "exports.mode = 'require';\n");
  put(path.join(npm, 'esm/feature.js'), 'export const feature = 42;\n');
  // Existing files must remain inaccessible when the package does not export them.
  put(path.join(npm, 'private.d.ts'), 'export declare const secret: number;\n');
  put(path.join(npm, 'private.js'), 'export const secret = 1;\n');
  const file = path.join(f.own.dir, 'src/Modern.ts');
  const source = `import { mode } from 'fixture-exports';
import { feature } from 'fixture-exports/feature';
export const result: 'import' = mode;
export const value: number = feature;
`;
  put(file, source);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  for (const dir of [f.own.dir, path.join(alias, 'own')]) {
    const { config } = parsed({ ...f.own, dir });
    assert.equal(projectDiagnostics(ts.createProgram(config.fileNames, config.options), dir), '', dir);
    assertResolution({ ...f.own, dir }, config.options, 'fixture-exports/private', undefined);
  }
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '');
  assert.ok(!sourceFiles(f.own).some(file => file.includes(`${path.sep}node_modules${path.sep}`)),
    'generated dependency links must not add npm sources as module entries');
  for (const minify of [false, true]) {
    const built = await f.pipeline.buildModule(f.own, plugin, minify);
    const exports = executeArchive(built.entries, 'src/Modern.js');
    assert.equal(exports.result, 'import', 'runtime must use the implementation matching the checked types');
    assert.equal(exports.value, 42);
  }
  put(file, source.replace("result: 'import'", "result: 'require'"));
  plugin.invalidate(file);
  assert.match(plugin.diagnostics(), /TS2322/, 'conditional types must retain literal checking');
});

test('bundling retains a transitive dependency version nearest to its importer', async t => {
  const f = await fixture(t);
  const parent = path.join(f.own.nodeModules!, 'fixture-parent');
  put(path.join(parent, 'package.json'), JSON.stringify({
    name: 'fixture-parent', main: 'index.cjs', types: 'index.d.ts',
  }));
  put(path.join(parent, 'index.d.ts'), "export { version } from 'fixture-version';\n");
  put(path.join(parent, 'index.cjs'), "exports.version = require('fixture-version').version;\n");
  for (const [directory, version] of [
    [f.own.nodeModules!, 'root'],
    [path.join(parent, 'node_modules'), 'nested'],
  ]) {
    const dependency = path.join(directory, 'fixture-version');
    put(path.join(dependency, 'package.json'), JSON.stringify({
      name: 'fixture-version', main: 'index.js', types: 'index.d.ts',
    }));
    put(path.join(dependency, 'index.d.ts'), `export declare const version: '${version}';\n`);
    put(path.join(dependency, 'index.js'), `exports.version = '${version}';\n`);
  }
  put(path.join(f.own.dir, 'src/Nested.ts'), `import { version } from 'fixture-parent';
export const result: 'nested' = version;
`);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '', 'types must select the importer-local dependency');
  for (const minify of [false, true]) {
    const built = await f.pipeline.buildModule(f.own, plugin, minify);
    const exports = executeArchive(built.entries, 'src/Nested.js');
    assert.equal(exports.result, 'nested', 'bundling must select the same dependency version as type checking');
  }
});

test('packages installed only in a real module-local node_modules are bundled with their import exports', async t => {
  const f = await fixture(t);
  const shared = path.join(f.directory, 'valdi/node_modules');
  mkdirSync(shared, { recursive: true });
  const local = path.join(f.own.nodeModules!, '@fixture/local-only');
  put(path.join(local, 'package.json'), JSON.stringify({
    name: '@fixture/local-only', type: 'module',
    exports: { '.': { import: { types: './types.d.ts', default: './entry.js' } } },
  }));
  put(path.join(local, 'types.d.ts'), 'export declare const localOnly: number;\n');
  put(path.join(local, 'entry.js'), 'export const localOnly = 23;\n');
  const own = { ...f.own, nodeModules: shared };
  const modules = f.modules.map(module => ({ ...module, nodeModules: shared }));
  const file = path.join(own.dir, 'src/Local.ts');
  put(file, `import * as local from '@fixture/local-only';
export const result: number = local.localOnly;
`);
  f.pipeline.writeTsconfig(own, modules);
  assert.ok(existsSync(local) && !existsSync(path.join(shared, '@fixture/local-only')));
  const plugin = valdiTs(own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '');
  assert.doesNotMatch(plugin.emit(file), /require\(["']@fixture\/local-only["']\)/,
    'a local npm namespace import must not become a Valdi external require');
  for (const minify of [false, true]) {
    const built = await f.pipeline.buildModule(own, plugin, minify);
    assert.equal(executeArchive(built.entries, 'src/Local.js').result, 23);
  }
});

test('project invalidation discovers added sources and generated declarations and forgets removed roots', async t => {
  const f = await fixture(t);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '');
  const source = path.join(f.own.dir, 'src/Added.ts');
  const generated = path.join(f.own.generatedDirs[0], 'src/AddedResource.ts');
  put(source, `import { value } from 'own/src/AddedResource'; export const added: number = value;\n`);
  plugin.invalidate(source);
  assert.match(plugin.diagnostics(), /TS2307/);
  put(generated, 'export const value = "wrong type";\n');
  plugin.invalidate(generated);
  plugin.invalidate(source);
  assert.match(plugin.diagnostics(), /TS2322/);
  assert.ok(plugin.program().getRootFileNames().includes(generated));
  put(generated, 'export const value = 7;\n');
  plugin.invalidate(generated);
  assert.equal(plugin.diagnostics(), '');
  rmSync(source);
  rmSync(generated);
  plugin.invalidate(source);
  plugin.invalidate(generated);
  assert.equal(plugin.diagnostics(), '');
  for (const file of [source, generated]) assert.ok(!plugin.program().getRootFileNames().includes(file));
});

test('bundling rejects owned CommonJS-only syntax before emission while bootstrap preserves its semantics', async t => {
  const f = await fixture(t);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const importer = path.join(f.own.dir, 'src/Helper.ts');
  const assignment = path.join(f.own.dir, 'src/Assignment.ts');
  put(importer, `import npm = require('fixture-npm'); export const value = npm.npmValue;\n`);
  put(assignment, 'const value = () => 7; export = value;\n');
  const plugin = valdiTs(f.own);
  const bootstrap = valdiTs(f.own, ts.ModuleKind.CommonJS);
  t.after(() => { plugin.dispose(); bootstrap.dispose(); });
  assert.equal(projectDiagnostics(bootstrap.program(), f.own.dir), '');
  const diagnostics = plugin.diagnostics();
  assert.match(diagnostics, /TS1202/);
  assert.match(diagnostics, /TS1203/);
  assert.throws(() => plugin.emit(importer), /TS1202/);
  assert.throws(() => plugin.emit(assignment), /TS1203/);
  await assert.rejects(f.pipeline.buildModule(f.own, plugin, false), /TS1202/);
  assert.equal(bootstrap.diagnostics(), '');
  const imported = { exports: {} as { value?: number } };
  new Function('module', 'exports', 'require', bootstrap.emit(importer))(
    imported, imported.exports, () => ({ npmValue: 6 }));
  assert.equal(imported.exports.value, 6);
  const exported = { exports: {} as unknown };
  new Function('module', 'exports', bootstrap.emit(assignment))(exported, exported.exports);
  assert.equal((exported.exports as () => number)(), 7);
});

test('CommonJS emission keeps source errors in checking and still rejects incompatible output syntax', async t => {
  const f = await fixture(t);
  const file = path.join(f.own.dir, 'src/Helper.ts');
  put(file, 'export const value: number = "invalid";\n');
  f.pipeline.writeTsconfig(f.own, f.modules);
  const plugin = valdiTs(f.own, ts.ModuleKind.CommonJS);
  t.after(() => plugin.dispose());
  assert.match(plugin.diagnostics(), /TS2322/, 'source checking still rejects invalid assignments');
  assert.doesNotThrow(() => plugin.emit(file), 'direct emit leaves existing source diagnostics to the checker');
  put(file, 'export const value = import.meta.url;\n');
  plugin.invalidate(file);
  assert.equal(projectDiagnostics(plugin.program(), f.own.dir), '', 'preserve source syntax allows import.meta');
  assert.match(plugin.diagnostics(), /TS1343/);
  assert.throws(() => plugin.emit(file), /TS1343/, 'CommonJS output must reject import.meta before emitting it');
});

test('missing sources still produce parseable, strict TSX configs with local aliases and unchanged root discovery', async t => {
  const f = await fixture(t);
  assert.equal(f.pipeline.valdiSourceRoot(), undefined);
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), true);
  const first = readFileSync(path.join(f.own.dir, 'tsconfig.json'), 'utf8');
  const { json, config } = parsed(f.own);
  assert.equal(path.resolve(f.own.dir, json.extends), f.bootstrapBase);
  assert.equal(config.options.jsx, ts.JsxEmit.Preserve);
  assert.equal(config.options.target, ts.ScriptTarget.ES2020);
  assert.equal(config.options.module, ts.ModuleKind.Preserve);
  assert.equal(config.options.moduleResolution, ts.ModuleResolutionKind.Bundler);
  for (const key of ['strict', 'experimentalDecorators', 'importHelpers', 'noImplicitReturns', 'noImplicitAny', 'forceConsistentCasingInFileNames']) {
    assert.equal(config.options[key], true, key);
  }
  assert.deepEqual(config.options.lib, ['lib.dom.d.ts', 'lib.es2021.d.ts']);
  assert.deepEqual(config.options.types, []);
  assert.ok(!json.compilerOptions.paths['valdi_core/*']);
  assert.ok(!json.compilerOptions.paths.tslib);
  assert.equal(json.compilerOptions.paths['*'], undefined);
  assertLocalResolution(f, config);
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), false);
  assert.equal(readFileSync(path.join(f.own.dir, 'tsconfig.json'), 'utf8'), first);
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  const logical = parsed({ ...f.own, dir: path.join(alias, 'own') }).config;
  assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram(logical.fileNames, logical.options)), []);
  assertResolution(f.own, config.options, 'valdi_core/src/Component', undefined);
  put(path.join(f.own.dir, 'src/unprepared.ts'), "import { component } from 'valdi_core/src/Component'; export { component };\n");
  const unprepared = parsed(f.own).config;
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(unprepared.fileNames, unprepared.options));
  assert.ok(diagnostics.some(d => d.code === 2307), 'bootstrap must leave unresolved framework imports visible');
  assert.ok(!diagnostics.some(d => d.code === 17004 || d.code === 6142), 'TSX mode is available before source preparation');
});

test('prepared configs inherit authoritative options/types and recover to bootstrap after fixture source removal', async t => {
  const f = await fixture(t);
  const sources = prepare(f);
  assert.ok(!existsSync(path.join(sources, 'src/valdi_modules/src/valdi/native_web')),
    'older prepared forks may omit unused optional builtin declarations');
  // Production compilation only needs the upstream base, which is already a
  // declared compiler prerequisite; bootstrap JSON need not be a sandbox input.
  rmSync(f.bootstrapBase);
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), true);
  const { json, config } = parsed(f.own);
  assert.equal(path.resolve(f.own.dir, json.extends), path.join(sources, 'modules/_configs/base.tsconfig.json'));
  assert.equal(config.options.noUnusedLocals, true);
  assert.equal(config.options.noFallthroughCasesInSwitch, true);
  assert.equal(config.options.jsx, ts.JsxEmit.Preserve);
  assert.equal(config.options.types?.length, 2);
  assertResolution(f.own, config.options, 'valdi_core/src/Component',
    path.join(sources, 'src/valdi_modules/src/valdi/valdi_core/src/Component.ts'));
  assertLocalResolution(f, config);
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), false);
  put(f.bootstrapBase, JSON.stringify({ compilerOptions: scalarOptions }));
  rmSync(sources, { recursive: true });
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), true);
  const fallback = parsed(f.own);
  assert.deepEqual(fallback.config.options.types, []);
  assert.equal(path.resolve(f.own.dir, fallback.json.extends), f.bootstrapBase);
  assert.ok(!fallback.json.compilerOptions.paths['valdi_core/*']);
});

test('prepared native_web declarations typecheck a consumer and preserve the exact external native require', async t => {
  const f = await fixture(t);
  const sources = prepare(f);
  const declaration = path.join(sources, 'src/valdi_modules/src/valdi/native_web/src/NativeWeb.d.ts');
  // A compiler contract only: the runtime implementation must remain external.
  put(declaration, `
export interface Response { readonly status: number; }
export declare function fetch(input: string): Promise<Response>;
`);
  rmSync(path.join(f.own.dir, 'src/index.tsx'));
  put(path.join(f.own.dir, 'src/index.ts'), `
import { fetch as nativeFetch } from 'native_web/src/NativeWeb';
export function responseStatus(input: string): Promise<number> {
  return nativeFetch(input).then(response => response.status);
}
`);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  for (const dir of [f.own.dir, path.join(alias, 'own')]) {
    const { config } = parsed({ ...f.own, dir });
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], dir);
    assertResolution({ ...f.own, dir }, config.options, 'native_web/src/NativeWeb', declaration);
    assert.ok(program.getSourceFile(declaration), 'the consumer uses the prepared declaration');
    assert.ok(!config.fileNames.includes(declaration), 'optional declarations are dependencies, not added roots');
  }
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  assert.equal(plugin.diagnostics(), '');
  const built = await f.pipeline.buildModule(f.own, plugin, false);
  const javascript = built.entries.get('src/index.js')?.toString();
  assert.ok(javascript);
  assert.match(javascript, /require\(["']native_web\/src\/NativeWeb["']\)/);
  const requires = [...javascript.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(match => match[1]);
  assert.deepEqual(requires, ['native_web/src/NativeWeb']);
  assert.ok(![...built.entries.keys()].some(name => /native_web|NativeWeb/.test(name)),
    'the app archive must not synthesize a Web implementation');
  assert.ok(![...built.maps.values()].some(map => map.includes('NativeWeb.d.ts')),
    'declarations must not become bundled implementation sources');

  put(path.join(f.own.dir, 'src/invalid.ts'), `
import { fetch as nativeFetch } from 'native_web/src/NativeWeb';
export const invalid = nativeFetch(42);
`);
  const { config } = parsed(f.own);
  assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options)).map(d => ({
    code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  })), [{ code: 2345, text: "Argument of type 'number' is not assignable to parameter of type 'string'." }],
  'the native declaration retains argument checking');
});

test('editor command reports bootstrap limits and the explicit preparation command', async t => {
  const f = await fixture(t);
  const output: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args: unknown[]) => output.push(args.join(' ')));
  await import(pathToFileURL(path.join(f.localTools, 'tsconfig.ts')).href);
  for (const module of f.modules) assert.ok(existsSync(path.join(module.dir, 'tsconfig.json')));
  assert.match(output.join('\n'), /bootstrap/i);
  assert.match(output.join('\n'), /node scripts\/lib\/prepare-valdi\.mjs/);
  assert.doesNotMatch(output.join('\n'), /(?:types|paths) are ready/i);
});

test('editor command reports prepared status after repeated generation', async t => {
  const f = await fixture(t);
  prepare(f);
  const modules = f.pipeline.appModules();
  for (const module of modules) f.pipeline.writeTsconfig(module, modules);
  const before = f.modules.map(module => readFileSync(path.join(module.dir, 'tsconfig.json'), 'utf8'));
  const output: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args: unknown[]) => output.push(args.join(' ')));
  await import(pathToFileURL(path.join(f.localTools, 'tsconfig.ts')).href);
  assert.deepEqual(output, ['Editor configs use prepared Valdi sources.']);
  assert.deepEqual(f.modules.map(module => readFileSync(path.join(module.dir, 'tsconfig.json'), 'utf8')), before);
});

test('missing bootstrap installation fails without publishing a broken extends', async t => {
  const f = await fixture(t);
  rmSync(f.bootstrapBase);
  assert.throws(() => f.pipeline.writeTsconfig(f.own, f.modules), /Missing editor bootstrap base/);
  assert.ok(!existsSync(path.join(f.own.dir, 'tsconfig.json')));
});

test('module compilation rejects missing prepared sources before staging or touching output', async t => {
  const f = await fixture(t);
  const { compileNodeModule } = await import(pathToFileURL(path.join(f.localTools, 'module-build.ts')).href);
  const out = path.join(f.directory, 'output');
  put(path.join(out, 'sentinel'), 'unchanged\n');
  const original = { ...f.own, dir: path.join(f.directory, 'missing-input') };
  await assert.rejects(compileNodeModule(original, out, 'Own', 'debug'),
    /Valdi sources are not prepared.*node scripts\/lib\/prepare-valdi\.mjs/s);
  assert.deepEqual(readdirSync(out), ['sentinel']);
  assert.equal(readFileSync(path.join(out, 'sentinel'), 'utf8'), 'unchanged\n');
  assert.ok(!existsSync(path.join(original.dir, 'tsconfig.json')));
});

test('config generation preserves absolute Windows drives and UNC shares', async () => {
  const helper = path.join(tools, 'editor-config.ts');
  assert.ok(existsSync(helper), 'config path generation must be available as a pure helper');
  const { createEditorConfig } = await import(pathToFileURL(helper).href);
  const own = {
    name: 'own', dir: 'C:\\repo with spaces\\valdi\\modules\\own',
    generatedDirs: ['D:\\cache\\own'], nodeModules: 'C:\\repo with spaces\\valdi\\node_modules',
  };
  const sibling = { name: 'sibling', dir: '\\\\server\\share\\sibling', generatedDirs: [] };
  const config = createEditorConfig(own, [own, sibling], {
    frameworkSources: 'D:\\framework',
    bootstrapBase: 'C:\\repo with spaces\\valdi\\tsconfig.editor-base.json',
  }, path.win32);
  assert.equal(config.extends, 'D:/framework/modules/_configs/base.tsconfig.json');
  assert.deepEqual(config.compilerOptions.paths['own/*'], ['C:/repo with spaces/valdi/modules/own/*', 'D:/cache/own/*']);
  assert.deepEqual(config.compilerOptions.paths['sibling/*'], ['//server/share/sibling/*']);
  assert.equal(config.compilerOptions.paths['*'], undefined);
  assert.ok(!('rootDirs' in config.compilerOptions), 'generated APIs use explicit module aliases');
  assert.deepEqual(config.compilerOptions.types, ['D:/framework/modules/types/Long', 'D:/framework/modules/types/globals']);
  const unc = createEditorConfig(own, [own], {
    frameworkSources: '\\\\buildhost\\cache', bootstrapBase: 'C:\\repo\\base.json',
  }, path.win32);
  assert.equal(unc.extends, '//buildhost/cache/modules/_configs/base.tsconfig.json');
  assert.ok(!JSON.stringify(unc).includes('./D:/'));
  assert.ok(!JSON.stringify(unc).includes('.///'));
});

test('physical and symlink config entry paths resolve identical JSX types, own/sibling/generated aliases and real dayjs', async t => {
  const f = await fixture(t);
  const sources = prepare(f);
  // JSX comes from the prepared framework declarations in this regression.
  rmSync(path.join(f.own.dir, 'src/jsx.d.ts'));
  put(path.join(sources, 'modules/types/globals.d.ts'),
    'declare namespace JSX { interface Element {} interface IntrinsicElements { view: { width?: number } } }\n');
  symlinkSync(realpathSync(path.join(root, 'valdi/node_modules/dayjs')),
    path.join(f.own.nodeModules!, 'dayjs'), 'dir');
  put(path.join(f.own.dir, 'src/date.ts'), "import dayjs from 'dayjs'; export const date: string = dayjs('2026-11-06').format('YYYY-MM-DD');\n");
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), true);
  for (const dir of [f.own.dir, path.join(alias, 'own')]) {
    const { json, config } = parsed({ ...f.own, dir });
    assert.ok(path.isAbsolute(json.extends));
    assert.equal(config.options.jsx, ts.JsxEmit.Preserve);
    assert.equal(config.options.allowSyntheticDefaultImports, true);
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], dir);
    assert.ok(program.getSourceFiles().some(file => /dayjs\/index\.d\.ts$/.test(file.fileName)));
    assertResolution({ ...f.own, dir }, config.options, 'own/res', path.join(f.own.generatedDirs[0], 'res.ts'));
  }
  // Preserve JSX's actual property checking; do not hide the error with JSX-any.
  put(path.join(f.own.dir, 'src/invalid.tsx'), 'export const invalid = <view unknownProperty={1} />;\n');
  const config = parsed({ ...f.own, dir: path.join(alias, 'own') }).config;
  assert.ok(ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options)).some(d => d.code === 2322));
});

test('canonical generated Strings imports retain type checking without rootDirs through physical and symlink module entries', async t => {
  const f = await fixture(t);
  const sources = prepare(f);
  put(path.join(sources, 'src/valdi_modules/src/valdi/valdi_core/src/LocalizableStrings.ts'),
    'export declare function buildInlineModule(...args: unknown[]): unknown;\n');
  for (const module of f.modules) {
    put(path.join(module.dir, 'strings/strings-en.json'),
      JSON.stringify({ welcome: { defaultMessage: 'Hello {name}' } }));
    put(path.join(module.dir, 'src/services/localization.ts'), `
import Strings from '${module.name}/src/Strings';
export const welcome = (name: string): string => Strings.welcome(name);
`);
    f.pipeline.writeTsconfig(module, f.modules);
  }
  put(path.join(f.own.dir, 'src/index.tsx'), `
import { welcome } from './services/localization';
import { welcome as siblingWelcome } from 'sibling/src/services/localization';
export const message: string = welcome('Ada') + siblingWelcome('Bob');
`);
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  for (const dir of [f.own.dir, path.join(alias, 'own')]) {
    const { config } = parsed({ ...f.own, dir });
    assert.equal(config.options.rootDirs, undefined);
    assert.ok(config.fileNames.includes(path.join(dir, 'src/services/localization.ts')),
      'the configured project must include the opened source');
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], dir);
    for (const module of f.modules) {
      assert.ok(program.getSourceFile(path.join(module.generatedDirs[0], 'src/Strings.ts')),
        'both local and imported sibling sources resolve their generated Strings');
    }
  }
  put(path.join(f.own.dir, 'src/services/invalid.ts'), `
import Strings from 'own/src/Strings';
Strings.welcome(123);
Strings.unknownKey();
`);
  for (const dir of [f.own.dir, path.join(alias, 'own')]) {
    const { config } = parsed({ ...f.own, dir });
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options));
    assert.deepEqual(diagnostics.map(d => d.code).sort(), [2339, 2345], dir);
    const file = path.join(dir, 'src/services/invalid.ts');
    const responses = await inspectEditorFile(file);
    const project = responses.find(response => response.type === 'response' && response.request_seq === 2);
    assert.equal(project?.success, true, JSON.stringify(responses));
    assert.equal(realpathSync(project.body.configFileName), realpathSync(path.join(dir, 'tsconfig.json')));
    assert.ok(project.body.fileNames.includes(file), 'tsserver must own the opened source in the configured project');
    const semantic = responses.find(response => response.type === 'response' && response.request_seq === 3);
    assert.equal(semantic?.success, true, JSON.stringify(responses));
    assert.deepEqual(semantic.body.map((diagnostic: { code: number }) => diagnostic.code).sort(), [2339, 2345]);
  }
});

test('opening generated resources directly resolves Asset types and retains semantic diagnostics', async t => {
  const f = await fixture(t);
  const sources = prepare(f);
  put(path.join(sources, 'src/valdi_modules/src/valdi/valdi_core/src/Asset.ts'),
    'export interface Asset { readonly url: string }\n');
  const file = path.join(f.own.generatedDirs[0], 'res.ts');
  put(file, `import type { Asset } from 'valdi_core/src/Asset';
export const asset: Asset = { url: 'fixture' };
export const invalid: number = asset.url;
`);
  f.pipeline.writeTsconfig(f.own, f.modules);
  const responses = await inspectEditorFile(file);
  const project = responses.find(response => response.type === 'response' && response.request_seq === 2);
  assert.equal(project?.success, true, JSON.stringify(responses));
  assert.equal(project.body.configFileName, path.join(f.own.generatedDirs[0], 'tsconfig.json'));
  assert.ok(project.body.fileNames.includes(file));
  const semantic = responses.find(response => response.type === 'response' && response.request_seq === 3);
  assert.equal(semantic?.success, true, JSON.stringify(responses));
  assert.deepEqual(semantic.body.map((diagnostic: { code: number }) => diagnostic.code), [2322],
    'Asset must resolve while the intentionally invalid assignment still fails');
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), false, 'regeneration is idempotent');
});

test('Solid TSX component gets Solid IntrinsicElements and dayjs types through either module entry', async t => {
  const f = await fixture(t);
  const live = await import('../pipeline');
  const sources = live.valdiSourceRoot();
  assert.ok(sources, 'prepare the pinned Valdi sources before this real declaration regression');
  const { paths: _paths, types: _types, ...upstreamScalars } =
    JSON.parse(readFileSync(path.join(sources, 'modules/_configs/base.tsconfig.json'), 'utf8')).compilerOptions;
  assert.deepEqual(upstreamScalars, scalarOptions, 'bootstrap scalar options match the actual pinned upstream base');
  process.env.VALDI_SOURCE_ROOT = sources;
  rmSync(path.join(f.own.dir, 'src'), { recursive: true });
  put(path.join(f.own.dir, 'src/SolidSample.tsx'), `import res from 'own/res';
import dayjs from 'dayjs';
import { createSignal } from 'solid-js';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';

export function SolidSample() {
  const [result, setResult] = createSignal('Ready');
  return (
    <view padding={24} backgroundColor="#f8fafc" flexGrow={1}>
      <label value="Solid Sample" font={systemSemiboldFont(26)} color="#0f172a" />
      <image src={res.logo} width={40} height={40} marginTop={16} />
      <label value={\`npm dayjs: \${dayjs('2026-10-29').format('YYYY-MM-DD')}\`} font={systemFont(14)} marginTop={8} />
      <view onTap={() => setResult('Tapped')} padding={16} marginTop={24} backgroundColor="#2563eb" borderRadius={12}>
        <label value={result()} font={systemSemiboldFont(18)} color="white" />
      </view>
    </view>
  );
}
`);
  put(path.join(f.own.generatedDirs[0], 'res.ts'),
    "import { Asset } from 'valdi_core/src/Asset'; declare const res: { readonly logo: Asset }; export default res;\n");
  symlinkSync(realpathSync(path.join(root, 'valdi/node_modules/dayjs')),
    path.join(f.own.nodeModules!, 'dayjs'), 'junction');
  symlinkSync(realpathSync(path.join(root, 'valdi/node_modules/solid-js')),
    path.join(f.own.nodeModules!, 'solid-js'), 'junction');
  const solidNative = { name: 'solid_native', dir: path.join(root, 'valdi/modules/solid_native'), generatedDirs: [] };
  const sample = f.own;
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  f.pipeline.writeTsconfig(sample, [sample, solidNative]);
  for (const dir of [sample.dir, path.join(alias, 'own')]) {
    const config = parsed({ ...sample, dir }).config;
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], dir);
    assert.ok(program.getSourceFiles().some(file => /dayjs\/index\.d\.ts$/.test(file.fileName)));
    const jsx = program.getSourceFiles().find(file => /solid_native\/src\/jsx\.d\.ts$/.test(file.fileName));
    assert.ok(jsx, 'solid_native supplies IntrinsicElements declarations');
    const viewSym = program.getTypeChecker().resolveName('JSX', undefined, ts.SymbolFlags.Namespace, false);
    assert.ok(viewSym);
  }
  put(path.join(sample.dir, 'invalid.tsx'), 'export const invalid = <view definitelyInvalidValdiProp={1} />;\n');
  const invalid = parsed({ ...sample, dir: path.join(alias, 'own') }).config;
  assert.ok(ts.getPreEmitDiagnostics(ts.createProgram([
    ...invalid.fileNames, path.join(sample.dir, 'invalid.tsx'),
  ], invalid.options)).some(d => d.code === 2322));
});

test('absolute editor aliases keep sibling modules external and ordinary/scoped npm packages bundled', async t => {
  const f = await fixture(t);
  prepare(f);
  rmSync(path.join(f.own.dir, 'src/index.tsx'));
  put(path.join(f.own.dir, 'src/index.ts'), `
import { sibling } from 'sibling/src/Component';
import { asset } from 'own/res';
import { npmValue } from 'fixture-npm';
import { scoped } from '@fixture/pkg';
export const result = sibling + asset + npmValue + scoped;
`);
  put(path.join(f.own.nodeModules!, '@fixture/pkg/package.json'),
    JSON.stringify({ name: '@fixture/pkg', main: 'index.js', types: 'index.d.ts' }));
  put(path.join(f.own.nodeModules!, '@fixture/pkg/index.js'), 'exports.scoped = 7;\n');
  put(path.join(f.own.nodeModules!, '@fixture/pkg/index.d.ts'), 'export declare const scoped: number;\n');
  f.pipeline.writeTsconfig(f.own, f.modules);
  const plugin = valdiTs(f.own);
  t.after(() => plugin.dispose());
  const built = await f.pipeline.buildModule(f.own, plugin, false);
  assert.equal(plugin.diagnostics(), '');
  const javascript = [...built.entries.values()].map(value => value.toString()).join('\n');
  assert.match(javascript, /require\(["']sibling\/src\/Component["']\)/);
  assert.doesNotMatch(javascript, /require\(["'](?:fixture-npm|@fixture\/pkg)["']\)/);
  assert.ok(!built.entries.has('src/Component.js'));
  assert.match(javascript, /npmValue/);
  assert.match(javascript, /scoped/);
});

test('real WheelPickers resolves shared dayjs types through physical and logical module paths', async t => {
  const f = await fixture(t);
  const live = await import('../pipeline');
  const { createEditorConfig } = await import('../editor-config');
  const module = live.appModule('app_ui');
  const configJson = createEditorConfig(module, live.appModules(), {
    frameworkSources: live.valdiSourceRoot(),
    bootstrapBase: path.join(root, 'valdi/tsconfig.editor-base.json'),
  });
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(root, 'valdi/modules'), alias, 'dir');
  for (const directory of [module.dir, path.join(alias, 'app_ui')]) {
    const config = ts.parseJsonConfigFileContent(configJson, ts.sys, directory, undefined, path.join(directory, 'tsconfig.json'));
    assert.deepEqual(config.errors, []);
    const file = path.join(directory, 'src/wheels/WheelPickers.tsx');
    const resolved = ts.resolveModuleName('dayjs', file, config.options, ts.sys).resolvedModule;
    assert.ok(resolved && /dayjs\/index\.d\.ts$/.test(resolved.resolvedFileName));
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], directory);
    assert.ok(program.getSourceFiles().some(source => /solid_native\/src\/jsx\.d\.ts$/.test(source.fileName)));
  }
});

test('tracked bootstrap base pins common compiler options without fetched paths or root expansion', () => {
  const file = path.join(root, 'valdi/tsconfig.editor-base.json');
  assert.ok(existsSync(file), 'fresh checkouts need a tracked base');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { compilerOptions: scalarOptions });
});
