import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import { pack, unpack, type ArchiveEntries } from './archive';
import { generateNativeCode, nativeSourceFiles, VALDI_PROJECT_CONFIG, type CodegenModule } from './codegen/index';
import {
  buildBusiness, buildBusinessModule, businessArchiveProof, businessPackagingInfo, businessRuntimeSpec,
  packageBusinessModule, parseBusinessArgs, pinnedInputs, runtimeNames, validateOutputs,
} from './harmony-business';
import { appModules, buildModule, inlineSourceMaps, moduleConfig, precompile, root, sourceMapJson } from './pipeline';
import { findFonts, findImages, writeResTs } from './resources';
import { compileRuntimeModule } from './runtime-module';
import { valdiTs, type ValdiModule } from './valdiTs';

const require = createRequire(import.meta.url);
const { SourceMapConsumer } = require('source-map');
// This suite never uses the full builder. All emit, resource, stage and binding
// paths are under an explicit temporary root, including the runtime fixture.
const prepared = path.join(root, '.tools/harmony/upstream');
const gitSource = process.env.VALDI_FORK_SOURCE ?? path.join(root, '../Valdi-node-only');
const pin = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8').match(/VALDI_COMMIT = "([a-f0-9]+)"/)![1];

function temporary(t: TestContext, base = tmpdir()) {
  const directory = realpathSync(mkdtempSync(path.join(base, 'harmony-development-packaging-')));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const previous = process.env.VALDI_SOURCE_ROOT;
  process.env.VALDI_SOURCE_ROOT = prepared;
  t.after(() => {
    if (previous === undefined) delete process.env.VALDI_SOURCE_ROOT;
    else process.env.VALDI_SOURCE_ROOT = previous;
  });
  return directory;
}

function write(directory: string, relative: string, content: string | Buffer) {
  const file = path.join(directory, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function identity(file: string) {
  const stats = statSync(file, { bigint: true });
  return `${stats.dev}:${stats.ino}`;
}

function fixtureTree(directory: string): unknown {
  return readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name);
    const stats = lstatSync(file);
    return [name, stats.isSymbolicLink() ? ['link', readlinkSync(file)]
      : stats.isDirectory() ? fixtureTree(file) : readFileSync(file).toString('base64')];
  });
}

function assertHash(entries: ArchiveEntries) {
  const hash = createHash('sha256');
  for (const [name, bytes] of [...entries].filter(([name]) => name !== 'hash').sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name).update(bytes);
  }
  assert.equal(entries.get('hash')?.toString(), hash.digest('hex'));
}

function inlineMap(bytes: Buffer) {
  assert.notEqual(bytes.readUInt32LE(0), 0x0100c634, 'debug entry must be JavaScript, not wrapped HBC');
  const comment = /\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\n$/.exec(bytes.toString());
  assert.ok(comment, 'TypeScript entries carry the official inline map');
  return JSON.parse(Buffer.from(comment[1], 'base64').toString());
}

function assertMappedToken(code: string, map: any, token: string, source: string, original: string) {
  const offset = code.indexOf(token);
  assert.ok(offset >= 0, `missing generated token ${token}`);
  const before = code.slice(0, offset).split('\n');
  const location = new SourceMapConsumer(map).originalPositionFor({
    line: before.length, column: before.at(-1)!.length,
  });
  assert.equal(location.source, source);
  const lines = original.slice(0, original.indexOf(token)).split('\n');
  assert.equal(location.line, lines.length);
  assert.equal(location.column, lines.at(-1)!.length);
}

function applicationFixture(t: TestContext) {
  const directory = temporary(t);
  const dir = path.join(directory, 'stage/fixture');
  const original = [
    'export function calculateDevelopmentResult(inputNumber: number): number {',
    '  const developmentIntermediateValue = inputNumber + 37;',
    '  debugger;',
    '  return developmentIntermediateValue * inputNumber;',
    '}',
    '',
  ].join('\n');
  write(dir, 'src/main.ts', original);
  write(dir, 'tsconfig.json', JSON.stringify({
    extends: path.join(prepared, 'modules/_configs/base.tsconfig.json'),
    compilerOptions: { types: [], paths: { 'fixture/*': [path.join(dir, '*')] }, rootDir: dir },
    include: ['src/**/*.ts'],
  }));
  const module: ValdiModule = { name: 'fixture', dir, generatedDirs: [] };
  const plugin = valdiTs(module, undefined, true);
  assert.equal(plugin.diagnostics(), '');
  return { directory, module, plugin, original };
}

test('output guard rejects macOS volume aliases of canonical directories and their missing descendants read-only', t => {
  if (process.platform !== 'darwin') return t.skip('macOS Data volume aliases');
  const directory = temporary(t);
  const canonical = path.join(root, 'valdi/native/generated');
  const alias = `/System/Volumes/Data${canonical}`;
  assert.equal(identity(alias), identity(canonical), 'the two spellings refer to the same directory');
  assert.notEqual(realpathSync(alias), realpathSync(canonical), 'realpath alone does not normalize this volume alias');
  const outputs = ['out', 'stage', 'bindings'].map(name => path.join(directory, name));
  const before = fixtureTree(directory);
  const canonicalBefore = fixtureTree(canonical);
  for (const protectedAlias of [alias, path.join(alias, 'p1-nonexistent/child'),
    `/System/Volumes/Data${root}`, `/System/Volumes/Data${path.dirname(root)}`,
    `/System/Volumes/Data${prepared}`]) {
    for (let index = 0; index < outputs.length; index++) {
      const selected = [...outputs];
      selected[index] = protectedAlias;
      // Never call buildBusiness with canonical aliases, even for a negative control.
      assert.throws(() => validateOutputs(selected, prepared), /Business output overlaps/);
    }
  }
  assert.deepEqual(fixtureTree(directory), before);
  assert.deepEqual(fixtureTree(canonical), canonicalBefore);
});

test('output guard rejects aliased output equality and ancestry through macOS tmp and volume aliases read-only', t => {
  if (process.platform !== 'darwin') return t.skip('macOS tmp and Data volume aliases');
  const directory = temporary(t, '/tmp');
  mkdirSync(path.join(directory, 'existing'));
  assert.equal(identity('/tmp'), identity('/private/tmp'));
  const viaTmp = directory.replace(/^\/private\/tmp\//, '/tmp/');
  assert.notEqual(viaTmp, directory);
  const viaVolume = `/System/Volumes/Data${directory}`;
  assert.equal(identity(directory), identity(viaTmp));
  assert.equal(identity(directory), identity(viaVolume));
  const before = fixtureTree(directory);
  for (const alias of [viaTmp, viaVolume]) {
    for (const [out, stage] of [
      [path.join(directory, 'existing'), path.join(alias, 'existing')],
      [path.join(directory, 'missing/a'), path.join(alias, 'missing/a')],
      [path.join(directory, 'missing'), path.join(alias, 'missing/child')],
      [path.join(alias, 'missing/child'), path.join(directory, 'missing')],
    ]) {
      assert.throws(() => validateOutputs([out, stage, path.join(directory, 'bindings')], prepared),
        /Business output directories must be (distinct|disjoint)/);
    }
  }
  assert.deepEqual(fixtureTree(directory), before);
});

test('output guard compares unresolved suffixes and allows genuinely disjoint dedicated directories read-only', t => {
  const directory = temporary(t);
  symlinkSync(directory, path.join(directory, 'alias'), 'dir');
  const source = path.join(directory, 'missing/source');
  const before = fixtureTree(directory);
  const unrelated = [path.join(directory, 'stage'), path.join(directory, 'bindings')];
  for (const output of ['alias/missing', 'alias/missing/source', 'alias/missing/source/child']) {
    assert.throws(() => validateOutputs([path.join(directory, output), ...unrelated], source), /Business output overlaps/);
  }
  assert.throws(() => validateOutputs([
    path.join(directory, 'missing/out'), path.join(directory, 'alias/missing/OUT/child'), unrelated[1],
  ], source), /Business output directories must be disjoint/);
  assert.doesNotThrow(() => validateOutputs([
    path.join(directory, 'alias/missing/output'), path.join(directory, 'missing/output-other'), unrelated[1],
  ], source), 'shared existing ancestors do not make distinct future siblings overlap');
  assert.doesNotThrow(() => validateOutputs([
    path.join(root, '.tools/harmony/business-rawfile'),
    path.join(root, '.tools/harmony/business-stage'),
    path.join(root, '.tools/harmony/business-bindings'),
  ], prepared), 'existing release defaults remain valid without creating or removing them');
  assert.deepEqual(fixtureTree(directory), before);
});

test('output guard follows safe symlink ancestry, rejects protected targets and dangling or nondirectory paths read-only', t => {
  const directory = temporary(t);
  const source = path.join(directory, 'source');
  write(source, 'sentinel', 'source is protected');
  const target = path.join(directory, 'target');
  mkdirSync(target);
  symlinkSync(target, path.join(directory, 'safe-link'), 'dir');
  symlinkSync(source, path.join(directory, 'source-link'), 'dir');
  symlinkSync(path.join(source, 'missing'), path.join(directory, 'dangling'), 'dir');
  symlinkSync(path.join(directory, 'loop'), path.join(directory, 'loop'), 'dir');
  const unrelated = [path.join(directory, 'stage'), path.join(directory, 'bindings')];
  const before = fixtureTree(directory);
  assert.doesNotThrow(() => validateOutputs([path.join(directory, 'safe-link/new'), ...unrelated], source));
  for (const output of [path.join(directory, 'source-link'), path.join(directory, 'source-link/missing')]) {
    assert.throws(() => validateOutputs([output, ...unrelated], source), /Business output overlaps/);
  }
  assert.throws(() => validateOutputs([target, path.join(directory, 'safe-link/new'), unrelated[1]], source),
    /Business output directories must be disjoint/);
  for (const output of ['dangling', 'dangling/new', 'loop', 'loop/new', 'source/sentinel', 'source/sentinel/new']) {
    assert.throws(() => validateOutputs([path.join(directory, output), ...unrelated], source),
      /Cannot safely inspect business path|Business output overlaps/);
  }
  assert.deepEqual(fixtureTree(directory), before);
});

test('output guard checks symlink placement inside protected sources even when its target is elsewhere', t => {
  const directory = temporary(t);
  const source = path.join(directory, 'source');
  const target = path.join(directory, 'target');
  mkdirSync(source);
  mkdirSync(target);
  symlinkSync(target, path.join(source, 'escape'), 'dir');
  symlinkSync(source, path.join(directory, 'source-link'), 'dir');
  const before = fixtureTree(directory);
  assert.throws(() => validateOutputs([
    path.join(directory, 'source-link/escape/new'), path.join(directory, 'stage'), path.join(directory, 'bindings'),
  ], source), /Business output overlaps/);
  assert.deepEqual(fixtureTree(directory), before);
});

test('output guard rejects overlapping aliases before deletion, source verification, generators or output creation in temp fixtures', async t => {
  const directory = temporary(t);
  const source = path.join(directory, 'source');
  write(source, 'sentinel', 'deliberately incomplete input: no compiler or Git invocation is valid');
  const out = path.join(directory, 'out');
  write(out, 'sentinel', 'must not be deleted');
  symlinkSync(source, path.join(directory, 'source-link'), 'dir');
  symlinkSync(out, path.join(directory, 'out-link'), 'dir');
  const before = fixtureTree(directory);
  for (const development of [false, true]) {
    for (const options of [
      { out: path.join(directory, 'source-link/missing'), stage: path.join(directory, 'stage'), bindings: path.join(directory, 'bindings') },
      { out, stage: path.join(directory, 'out-link/missing'), bindings: path.join(directory, 'bindings') },
      { out, stage: path.join(directory, 'stage'), bindings: path.join(directory, 'source-link') },
    ]) {
      await assert.rejects(buildBusiness({
        ...options, source, development, gitSource: path.join(directory, 'no-git-repository'),
      }), /Business output overlaps|Business output directories must be disjoint/);
      assert.deepEqual(fixtureTree(directory), before);
    }
  }
});

test('development is an explicit flag; existing CLI arguments and release defaults remain unchanged', () => {
  assert.deepEqual(parseBusinessArgs([]), {});
  assert.deepEqual(parseBusinessArgs(['--source', '/source', '--out', '/out', '--stage', '/stage',
    '--bindings', '/bindings', '--git-source', '/git']), {
    source: '/source', out: '/out', stage: '/stage', bindings: '/bindings', gitSource: '/git',
  });
  assert.deepEqual(parseBusinessArgs(['--out', '/out', '--development', '--stage', '/stage', '--bindings', '/bindings']), {
    out: '/out', development: true, stage: '/stage', bindings: '/bindings',
  });
  assert.deepEqual(parseBusinessArgs(['--development']), { development: true });
  for (const args of [['--out'], ['--out', '--development'], ['--development', 'false'], ['--debug']]) {
    assert.throws(() => parseBusinessArgs(args), /Usage:/);
  }
});

test('JavaScript metadata omits HBC fields and release metadata retains its exact contract', () => {
  assert.equal(JSON.stringify(businessPackagingInfo()), '{"hbcVersion":99}');
  assert.deepEqual(businessPackagingInfo(false), { hbcVersion: 99 });
  assert.deepEqual(businessPackagingInfo(true), { compilationMode: 'js', minified: false, sourceMaps: 'inline' });
  const archive = pack(new Map([['src/main.js', Buffer.from('"use strict";\nexports.answer = 42;\n')]]));
  const proof = businessArchiveProof('fixture', archive, true);
  assert.deepEqual(Object.keys(proof), ['sha256', 'javascriptEntries', 'diagnostics']);
  assert.equal(proof.javascriptEntries, 1);
  assert.throws(() => businessArchiveProof('fixture', archive), /Not a pinned HBC99 entry/);
});

test('development uses real unminified compiler output, official inline maps and unchanged map content', async t => {
  const { directory, module, plugin, original } = applicationFixture(t);
  const expected = await buildModule(module, plugin, false);
  inlineSourceMaps(expected); // Current dev.ts path, including sourcesContent policy.
  const built = await buildBusinessModule(module, plugin, true);
  assert.deepEqual(built, expected);
  built.entries.set('res.assetcatalog', Buffer.from('fixture-resource'));
  const archive = await packageBusinessModule(built, true);
  write(directory, 'out/modules/fixture.valdimodule', archive);
  write(directory, 'out/modules/fixture.map.json', sourceMapJson('fixture', built));
  const entries = unpack(archive);
  assertHash(entries);
  assert.equal(entries.get('res.assetcatalog')!.toString(), 'fixture-resource');
  const code = entries.get('src/main.js')!.toString();
  assert.match(code, /const developmentIntermediateValue = inputNumber \+ 37;/);
  assert.match(code, /debugger;/);
  const map = inlineMap(entries.get('src/main.js')!);
  assert.deepEqual(map, JSON.parse(built.maps.get('src/main.js')!));
  assert.deepEqual(map.sources, ['//fixture/src/main.ts']);
  assert.equal(Object.hasOwn(map, 'sourcesContent'), false, 'preserve the current dev pipeline exclusion');
  assertMappedToken(code, map, 'developmentIntermediateValue', '//fixture/src/main.ts', original);
  const exports: Record<string, any> = {};
  vm.runInNewContext(`(function(exports){${code}\n})`)(exports);
  assert.equal(exports.calculateDevelopmentResult(5), 210);
  assert.equal(businessArchiveProof('fixture', archive, true).javascriptEntries, 1);
  const standalone = JSON.parse(readFileSync(path.join(directory, 'out/modules/fixture.map.json'), 'utf8'));
  assert.deepEqual(JSON.parse(standalone['fixture/src/main.js']), map);
});

test('release remains byte-identical to minify + pinned HBC99 + original sorted-entry hash and pack', async t => {
  const { directory, module, plugin } = applicationFixture(t);
  const expected = await buildModule(module, plugin, true);
  const built = await buildBusinessModule(module, plugin);
  assert.deepEqual(built, expected);
  assert.doesNotMatch(built.entries.get('src/main.js')!.toString(), /developmentIntermediateValue/);
  assert.doesNotMatch(built.entries.get('src/main.js')!.toString(), /sourceMappingURL=data:/);
  const mapBefore = sourceMapJson('fixture', built);
  for (const entries of [expected.entries, built.entries]) entries.set('res.assetcatalog', Buffer.from('fixture-resource'));
  await precompile(expected.entries);
  const hash = createHash('sha256');
  for (const [name, bytes] of [...expected.entries].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(bytes);
  expected.entries.set('hash', Buffer.from(hash.digest('hex')));
  const archive = await packageBusinessModule(built);
  assert.deepEqual(archive, pack(expected.entries), 'release archive bytes must retain the previous pipeline contract');
  assert.equal(sourceMapJson('fixture', built), mapBefore);
  write(directory, 'out/modules/fixture.valdimodule', archive);
  const entries = unpack(archive);
  assertHash(entries);
  const bytecode = entries.get('src/main.js')!;
  assert.equal(bytecode.readUInt32LE(0), 0x0100c634);
  assert.equal(bytecode.readBigUInt64LE(4), 0x1f1903c103bc1fc6n);
  assert.equal(bytecode.readUInt32LE(12), 99);
  const proof = businessArchiveProof('fixture', archive);
  assert.deepEqual(Object.keys(proof), ['sha256', 'hbcEntries', 'diagnostics']);
  assert.equal(proof.hbcEntries, 1);
  assert.throws(() => businessArchiveProof('fixture', archive, true), /Unexpected bytecode/);
});

test('both modes retain the exact seven runtime modules and output layout', () => {
  assert.deepEqual(runtimeNames, ['coreutils', 'jasmine', 'source_map', 'valdi_tsx', 'valdi_core', 'client_sql', 'valdi_http']);
  for (const development of [false, true]) {
    for (const name of runtimeNames) {
      const spec = businessRuntimeSpec(name, '/prepared', '/isolated/out/modules', ['/isolated/input.ts'], development);
      assert.equal(spec.moduleDirectory, `/prepared/src/valdi_modules/src/valdi/${name}`);
      assert.equal(spec.compilationMode, development ? 'js' : 'js_bytecode');
      assert.deepEqual(spec.outputs, ['valdimodule', 'map.json'].map(extension => ({
        path: `/isolated/out/modules/${name}.${extension}`,
        relative: `cpp/${development ? 'debug' : 'release'}/assets/${name}.${extension}`,
        directory: false,
      })));
      assert.deepEqual(spec.dependencies.map(dep => dep.module_name), runtimeNames.filter(other => other !== name));
    }
  }
});

test('real runtime compiler debug mode emits mapped JavaScript and release still emits HBC99', async t => {
  const directory = temporary(t);
  const source = path.join(directory, 'source');
  // Isolated lightweight fixture, with the actual prepared compiler configs,
  // declarations and pinned Hermes protocol inputs. No shared source writes.
  for (const relative of ['modules/_configs', 'modules/types',
    'third-party/hermes_v1/hermes.BUILD', 'valdi/src/valdi/runtime/JavaScript/JavaScriptUtils.cpp']) {
    mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
    cpSync(path.join(prepared, relative), path.join(source, relative), { recursive: true });
  }
  const original = 'export function runtimeDevelopmentValue(inputNumber: number): number {\n' +
    '  const runtimeIntermediateValue = inputNumber + 19;\n  debugger;\n  return runtimeIntermediateValue;\n}\n';
  const input = write(source, 'src/valdi_modules/src/valdi/coreutils/src/fixture.ts', original);
  write(source, 'src/valdi_modules/src/valdi/coreutils/test/fixture.ts', 'export const debugOnlyTest = 7;\n');
  const raw = write(source, 'src/valdi_modules/src/valdi/coreutils/src/raw.js', 'exports.rawValue = 17;\n');
  for (const development of [true, false]) {
    const out = path.join(directory, development ? 'development-out/modules' : 'release-out/modules');
    const spec = businessRuntimeSpec('coreutils', source, out,
      [input, raw, path.join(path.dirname(path.dirname(input)), 'test/fixture.ts')], development);
    await compileRuntimeModule(spec, root);
    const archive = readFileSync(path.join(out, 'coreutils.valdimodule'));
    const entries = unpack(archive);
    assertHash(entries);
    assert.equal(entries.has('test/fixture.js'), development, 'use official debug/release input selection');
    const proof = businessArchiveProof('coreutils', archive, development);
    assert.equal(development ? proof.javascriptEntries : proof.hbcEntries, development ? 3 : 2);
    if (development) {
      const bytes = entries.get('src/fixture.js')!;
      assert.match(bytes.toString(), /const runtimeIntermediateValue = inputNumber \+ 19;/);
      assert.match(bytes.toString(), /debugger;/);
      assert.equal(entries.get('src/raw.js')!.toString(), 'exports.rawValue = 17;\n');
      const map = inlineMap(bytes);
      assert.deepEqual(map.sources, ['//coreutils/src/fixture.ts']);
      assert.equal(Object.hasOwn(map, 'sourcesContent'), false);
      assertMappedToken(bytes.toString(), map, 'runtimeIntermediateValue', '//coreutils/src/fixture.ts', original);
      const maps = JSON.parse(readFileSync(path.join(out, 'coreutils.map.json'), 'utf8'));
      assert.deepEqual(JSON.parse(maps['coreutils/src/fixture.js']), map);
    } else {
      for (const [file, bytes] of entries) {
        if (file.endsWith('.js')) {
          assert.equal(bytes.readUInt32LE(0), 0x0100c634);
          assert.equal(bytes.readUInt32LE(12), 99);
        }
      }
    }
  }
});

test('source verification accepts actual selected pin plus overlay and rejects edits at arbitrary paths', t => {
  const directory = temporary(t);
  const inputs = ['MODULE.bazel', 'modules/_configs/base.tsconfig.json',
    'src/valdi_modules/src/valdi/valdi_core/src/Device.ts',
    'src/valdi_modules/src/valdi/valdi_tsx/src/JSX.ts'];
  const proof = pinnedInputs(prepared, gitSource, pin, inputs.map(relative => path.join(prepared, relative)));
  for (const relative of inputs) {
    assert.equal(proof[relative], createHash('sha256').update(readFileSync(path.join(prepared, relative))).digest('hex'));
  }
  assert.ok(proof['scripts/harmony/apply-platform.mjs'], 'the actual staged overlay must be verified');
  const copied = path.join(directory, 'arbitrary-source');
  for (const relative of inputs) write(copied, relative, readFileSync(path.join(prepared, relative)));
  assert.deepEqual(pinnedInputs(copied, gitSource, pin, inputs.map(relative => path.join(copied, relative))), proof);
  write(copied, 'modules/_configs/base.tsconfig.json', '{}\n');
  assert.throws(() => pinnedInputs(copied, gitSource, pin, inputs.map(relative => path.join(copied, relative))),
    /does not match .* plus Harmony overlay: modules\/_configs\/base.tsconfig.json/);
  const device = 'src/valdi_modules/src/valdi/valdi_core/src/Device.ts';
  write(copied, device, readFileSync(path.join(prepared, device), 'utf8') + '\n// untrusted edit\n');
  assert.throws(() => pinnedInputs(copied, gitSource, pin, [path.join(copied, device)]),
    /does not match .* plus Harmony overlay: .*Device.ts/);
  const unknown = write(copied, 'untracked.ts', 'export const untrusted = true;\n');
  assert.throws(() => pinnedInputs(copied, gitSource, pin, [unknown]), /does not match .* plus Harmony overlay: untracked.ts/);
});

test('both modes reject shared/source output paths before any writes', async t => {
  const directory = temporary(t);
  const out = path.join(directory, 'out');
  const sentinel = write(out, 'sentinel', 'preserve me');
  for (const development of [false, true]) {
    await assert.rejects(buildBusiness({
      development, source: prepared, out, stage: path.join(directory, 'stage'),
      bindings: path.join(root, 'valdi/native/generated'),
    }), /Business output overlaps/);
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve me');
    await assert.rejects(buildBusiness({
      development, source: prepared, out, stage: out, bindings: path.join(directory, 'bindings'),
    }), /Business output directories must be distinct/);
  }
});

test('real canonical C++ bindings stay equal when codegen runs entirely in isolated staging/binding outputs', async t => {
  const directory = temporary(t);
  const stage = path.join(directory, 'stage');
  const bindings = path.join(directory, 'bindings');
  const upstreamModules = path.join(prepared, 'src/valdi_modules/src/valdi');
  const modules: ValdiModule[] = [...appModules(), {
    name: 'harmony_business', dir: path.join(root, 'harmony/business'), generatedDirs: [],
    nodeModules: path.join(root, 'valdi/node_modules'),
  }].map(original => {
    const dir = path.join(stage, original.name);
    for (const name of ['src', 'res']) {
      if (existsSync(path.join(original.dir, name))) cpSync(path.join(original.dir, name), path.join(dir, name), { recursive: true });
    }
    symlinkSync(original.nodeModules!, path.join(dir, 'node_modules'), 'junction');
    return { ...original, dir, generatedDirs: [path.join(dir, '.gen')] };
  });
  for (const module of modules) {
    writeResTs(module, await findImages(module), module.generatedDirs[0], findFonts(module) ?? []);
    write(module.dir, 'tsconfig.json', JSON.stringify({
      extends: path.join(prepared, 'modules/_configs/base.tsconfig.json'),
      compilerOptions: {
        paths: Object.fromEntries([
          ...runtimeNames.map(name => [`${name}/*`, [path.join(upstreamModules, name, '*')]]),
          ...modules.map(other => [`${other.name}/*`, [path.join(other.dir, '*'), ...other.generatedDirs.map(dir => path.join(dir, '*'))]]),
          ['tslib', [path.join(upstreamModules, 'valdi_core/src/tslib')]],
          ['Valdi', [path.join(upstreamModules, 'valdi_core/src/Valdi')]],
        ]),
        types: [path.join(prepared, 'modules/types/Long'), path.join(prepared, 'modules/types/globals')],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx', '.gen/**/*.ts'],
    }));
  }
  const targets: CodegenModule[] = modules.map(module => ({
    module, bundleInfo: {
      ...VALDI_PROJECT_CONFIG, name: module.name, iosModuleName: moduleConfig(module.name).iosModuleName ?? module.name,
      iosLanguage: moduleConfig(module.name).iosLanguage ?? 'objc', asyncStrictMode: false,
    },
  }));
  let count = 0;
  for (const target of targets) {
    target.nativeDependencies = targets.filter(other => other !== target).map(({ module, bundleInfo }) => ({ module, bundleInfo }));
    const plugin = valdiTs(target.module, undefined, true);
    assert.equal(plugin.diagnostics(), '');
    target.program = () => plugin.program();
    const native = generateNativeCode(target, message => { throw new Error(message); });
    for (const [relative, content] of nativeSourceFiles(target, native, 'cpp')) {
      const generated = write(bindings, relative, content);
      const canonical = path.join(root, '.tools/harmony/business-bindings', relative);
      assert.deepEqual(readFileSync(generated), readFileSync(canonical), relative);
      if (target.module.name === 'app_pages') {
        assert.deepEqual(readFileSync(generated), readFileSync(path.join(root, 'valdi/native/generated', relative)), relative);
      }
      count++;
    }
  }
  assert.equal(count, 2 * modules.length);
});
