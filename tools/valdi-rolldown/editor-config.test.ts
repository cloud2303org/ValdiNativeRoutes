import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { valdiTs } from './valdiTs';
import type { ValdiModule } from './valdiTs';

const tools = import.meta.dirname;
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
    if (entry.name.startsWith('.') || entry.name.endsWith('.test.ts')) continue;
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
  const pipeline = await import(pathToFileURL(path.join(localTools, 'pipeline.ts')).href) as typeof import('./pipeline');
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
    path.join(f.own.dir, 'local.d.ts'), path.join(f.own.dir, 'src/Helper.ts'),
    path.join(f.own.dir, 'src/index.tsx'), path.join(f.own.dir, 'src/jsx.d.ts'),
  ].sort(), 'default roots stay inside the individual module');
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

test('missing sources still produce parseable, strict TSX configs with local aliases and unchanged root discovery', async t => {
  const f = await fixture(t);
  assert.equal(f.pipeline.valdiSourceRoot(), undefined);
  assert.equal(f.pipeline.writeTsconfig(f.own, f.modules), true);
  const first = readFileSync(path.join(f.own.dir, 'tsconfig.json'), 'utf8');
  const { json, config } = parsed(f.own);
  assert.equal(path.resolve(f.own.dir, json.extends), f.bootstrapBase);
  assert.equal(config.options.jsx, ts.JsxEmit.Preserve);
  assert.equal(config.options.target, ts.ScriptTarget.ES2020);
  assert.equal(config.options.module, ts.ModuleKind.CommonJS);
  for (const key of ['strict', 'experimentalDecorators', 'importHelpers', 'noImplicitReturns', 'noImplicitAny', 'forceConsistentCasingInFileNames']) {
    assert.equal(config.options[key], true, key);
  }
  assert.deepEqual(config.options.lib, ['lib.dom.d.ts', 'lib.es2021.d.ts']);
  assert.deepEqual(config.options.types, []);
  assert.ok(!json.compilerOptions.paths['valdi_core/*']);
  assert.ok(!json.compilerOptions.paths.tslib);
  assert.deepEqual(json.compilerOptions.paths['*'], [path.join(f.own.nodeModules!, '*')]);
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

test('editor command reports bootstrap limits and the explicit preparation command', async t => {
  const f = await fixture(t);
  const output: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args: unknown[]) => output.push(args.join(' ')));
  await import(pathToFileURL(path.join(f.localTools, 'tsconfig.ts')).href);
  for (const module of f.modules) assert.ok(existsSync(path.join(module.dir, 'tsconfig.json')));
  assert.match(output.join('\n'), /bootstrap/i);
  assert.match(output.join('\n'), /node scripts\/prepare-valdi\.mjs/);
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
    /Valdi sources are not prepared.*node scripts\/prepare-valdi\.mjs/s);
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
    generatedRoot: '\\\\server\\generated',
  }, path.win32);
  assert.equal(config.extends, 'D:/framework/modules/_configs/base.tsconfig.json');
  assert.deepEqual(config.compilerOptions.paths['own/*'], ['C:/repo with spaces/valdi/modules/own/*', 'D:/cache/own/*']);
  assert.deepEqual(config.compilerOptions.paths['sibling/*'], ['//server/share/sibling/*']);
  assert.deepEqual(config.compilerOptions.paths['*'], ['C:/repo with spaces/valdi/node_modules/*']);
  assert.deepEqual(config.compilerOptions.rootDirs, ['C:/repo with spaces/valdi/modules', '//server/generated/']);
  assert.deepEqual(config.compilerOptions.types, ['D:/framework/modules/types/Long', 'D:/framework/modules/types/globals']);
  const unc = createEditorConfig(own, [own], {
    frameworkSources: '\\\\buildhost\\cache', bootstrapBase: 'C:\\repo\\base.json', generatedRoot: 'C:\\repo\\.gen',
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

test('real CalculatorComponent gets Valdi IntrinsicElements and dayjs types through either module entry', async t => {
  const f = await fixture(t);
  const live = await import('./pipeline');
  const sources = live.valdiSourceRoot();
  assert.ok(sources, 'prepare the pinned Valdi sources before this real declaration regression');
  const { paths: _paths, types: _types, ...upstreamScalars } =
    JSON.parse(readFileSync(path.join(sources, 'modules/_configs/base.tsconfig.json'), 'utf8')).compilerOptions;
  assert.deepEqual(upstreamScalars, scalarOptions, 'bootstrap scalar options match the actual pinned upstream base');
  process.env.VALDI_SOURCE_ROOT = sources;
  // Use the real authored TSX and framework declarations, with resource types
  // confined to this fixture. No application source/config/link is rewritten.
  rmSync(path.join(f.own.dir, 'src'), { recursive: true });
  symlinkSync(path.join(root, 'valdi/modules/calculator/src'), path.join(f.own.dir, 'src'), 'dir');
  put(path.join(f.own.generatedDirs[0], 'res.ts'),
    "import { Asset } from 'valdi_core/src/Asset'; declare const res: { readonly calculator: Asset }; export default res;\n");
  const calculator = { ...f.own, name: 'calculator', nodeModules: path.join(root, 'valdi/node_modules') };
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(f.directory, 'valdi/modules'), alias, 'dir');
  f.pipeline.writeTsconfig(calculator, [calculator]);
  for (const dir of [calculator.dir, path.join(alias, 'own')]) {
    const config = parsed({ ...calculator, dir }).config;
    const program = ts.createProgram(config.fileNames, config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], dir);
    assert.ok(program.getSourceFiles().some(file => /dayjs\/index\.d\.ts$/.test(file.fileName)));
    const jsx = program.getSourceFiles().find(file => /valdi_tsx\/src\/JSX\.ts$/.test(file.fileName));
    assert.ok(jsx, 'the real framework supplies JSX, not a permissive fixture declaration');
    let intrinsic: ts.InterfaceDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'IntrinsicElements') intrinsic = node;
      ts.forEachChild(node, visit);
    };
    visit(jsx);
    assert.ok(intrinsic);
    const checker = program.getTypeChecker();
    const view = checker.getTypeAtLocation(intrinsic).getProperty('view');
    assert.ok(view);
    assert.ok(!(checker.getTypeOfSymbolAtLocation(view, intrinsic).flags & ts.TypeFlags.Any));
  }
  put(path.join(calculator.dir, 'invalid.tsx'), 'export const invalid = <view definitelyInvalidValdiProp={1} />;\n');
  const invalid = parsed({ ...calculator, dir: path.join(alias, 'own') }).config;
  assert.ok(ts.getPreEmitDiagnostics(ts.createProgram(invalid.fileNames, invalid.options)).some(d => d.code === 2322));
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

test('real WheelPickers resolves shared valibot types through physical and logical module paths', async t => {
  const f = await fixture(t);
  const live = await import('./pipeline');
  const { createEditorConfig } = await import('./editor-config');
  const module = live.appModule('app_pages');
  const configJson = createEditorConfig(module, live.appModules(), {
    frameworkSources: live.valdiSourceRoot(),
    bootstrapBase: path.join(root, 'valdi/tsconfig.editor-base.json'),
    generatedRoot: path.join(tools, '.gen'),
  });
  const alias = path.join(f.directory, 'module-build/modules');
  mkdirSync(path.dirname(alias), { recursive: true });
  symlinkSync(path.join(root, 'valdi/modules'), alias, 'dir');
  for (const directory of [module.dir, path.join(alias, 'app_pages')]) {
    const config = ts.parseJsonConfigFileContent(configJson, ts.sys, directory, undefined, path.join(directory, 'tsconfig.json'));
    assert.deepEqual(config.errors, []);
    const file = path.join(directory, 'src/WheelPickers.tsx');
    const resolved = ts.resolveModuleName('valibot', file, config.options, ts.sys).resolvedModule;
    assert.ok(resolved && /valibot\/dist\/index\.d\.mts$/.test(resolved.resolvedFileName));
    const program = ts.createProgram([file], config.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })), [], directory);
    assert.ok(program.getSourceFiles().some(source => /valdi_tsx\/src\/JSX\.ts$/.test(source.fileName)));
  }
});

test('tracked bootstrap base pins common compiler options without fetched paths or root expansion', () => {
  const file = path.join(root, 'valdi/tsconfig.editor-base.json');
  assert.ok(existsSync(file), 'fresh checkouts need a tracked base');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { compilerOptions: scalarOptions });
});
