import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import ts from 'typescript';
import { findValdiSourceRoot, writeNodeFrameworkConfig } from './modules.mjs';

const tools = import.meta.dirname;
const root = path.resolve(tools, '../..');
const prepared = findValdiSourceRoot(root);

function put(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fixture(t: TestContext) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'valdi-node-project-')));
  const localTools = path.join(directory, 'tools/valdi-rolldown');
  mkdirSync(localTools, { recursive: true });
  const previous = process.env.VALDI_SOURCE_ROOT;
  delete process.env.VALDI_SOURCE_ROOT;
  t.after(() => {
    if (previous === undefined) delete process.env.VALDI_SOURCE_ROOT;
    else process.env.VALDI_SOURCE_ROOT = previous;
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  for (const name of ['package.json', 'modules.mjs', 'typecheck-node.mjs', 'tsconfig.json', 'tsconfig.tests.json']) {
    copyFileSync(path.join(tools, name), path.join(localTools, name));
  }
  symlinkSync(path.join(tools, 'node_modules'), path.join(localTools, 'node_modules'), 'junction');
  const common = 'valdi/modules/native_common/tests';
  mkdirSync(path.join(directory, common), { recursive: true });
  copyFileSync(path.join(root, common, 'tsconfig.json'), path.join(directory, common, 'tsconfig.json'));
  put(path.join(directory, common, 'node.test.mts'), 'import assert from "node:assert/strict"; assert.ok(true);\n');
  put(path.join(directory, 'package.json'), JSON.stringify({ type: 'module', valdi: { modules: [] } }));
  const navigation = 'valdi/modules/app_foundation/src/navigation';
  mkdirSync(path.join(directory, navigation), { recursive: true });
  for (const name of ['options.ts', 'models.ts']) {
    copyFileSync(path.join(root, navigation, name), path.join(directory, navigation, name));
  }
  symlinkSync(path.join(root, 'valdi/node_modules'), path.join(directory, 'valdi/node_modules'), 'junction');
  put(path.join(localTools, 'consumer.test.ts'), `
import { resolveNavigation, type ResolvedNavigation } from '../../${navigation}/options';
export const result: ResolvedNavigation = resolveNavigation({ android: { animation: 'zoom' } });
`);
  return { directory, localTools, generated: path.join(localTools, '.gen/tsconfig.framework.json') };
}

type Fixture = ReturnType<typeof fixture>;

function sourceTree(directory: string, realSources = false) {
  put(path.join(directory, 'modules/_configs/base.tsconfig.json'), '{}\n');
  if (realSources) {
    assert.ok(prepared, 'prepare real Valdi sources before running Node consumer regressions');
    symlinkSync(path.join(prepared, 'src'), path.join(directory, 'src'), 'junction');
  }
  return directory;
}

function check(f: Fixture) {
  const result = spawnSync(process.execPath, [path.join(f.localTools, 'typecheck-node.mjs')], {
    cwd: f.directory, encoding: 'utf8',
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function project(f: Fixture) {
  const configFile = path.join(f.localTools, 'tsconfig.tests.json');
  const read = ts.readConfigFile(configFile, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, f.localTools, undefined, configFile);
  assert.deepEqual(config.errors, []);
  assert.equal(config.options.strict, true);
  assert.equal(config.options.noEmit, true);
  assert.equal(config.options.skipLibCheck, undefined);
  assert.equal(config.options.module, ts.ModuleKind.ESNext);
  assert.equal(config.options.moduleResolution, ts.ModuleResolutionKind.Bundler);
  assert.deepEqual(config.options.types, ['node']);
  assert.deepEqual(config.fileNames, [path.join(f.localTools, 'consumer.test.ts')]);
  return config;
}

function assertSelected(f: Fixture, selected: string) {
  const config = project(f);
  const device = path.join(selected, 'src/valdi_modules/src/valdi/valdi_core/src/Device.ts');
  assert.deepEqual(config.options.paths, {
    'valdi_core/*': [path.join(selected, 'src/valdi_modules/src/valdi/valdi_core/*').split(path.sep).join('/')],
  });
  const resolved = ts.resolveModuleName('valdi_core/src/Device', config.fileNames[0], config.options, ts.sys);
  assert.equal(path.normalize(resolved.resolvedModule!.resolvedFileName), device);
}

// Run the real editor setup entry point with an empty module inventory, so no
// resources or app configs are generated. All links belong to the fixture.
function editorSetup(f: Fixture) {
  for (const entry of readdirSync(tools, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /\.test\.(?:ts|mts)$/.test(entry.name)) continue;
    const destination = path.join(f.localTools, entry.name);
    if (existsSync(destination)) continue;
    if (entry.name === 'pipeline.ts' || entry.name === 'tsconfig.ts') {
      copyFileSync(path.join(tools, entry.name), destination);
    } else {
      symlinkSync(path.join(tools, entry.name), destination, entry.isDirectory() ? 'junction' : 'file');
    }
  }
  const result = spawnSync(process.execPath, [path.join(tools, 'node_modules/tsx/dist/cli.mjs'), path.join(f.localTools, 'tsconfig.ts')], {
    cwd: f.directory, encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('shared discovery preserves explicit, stable-link and Bazel workspace precedence', t => {
  const f = fixture(t);
  assert.equal(findValdiSourceRoot(f.directory), undefined);
  const other = sourceTree(path.join(f.directory, 'valdi/bazel-other/external/valdi+'));
  assert.equal(findValdiSourceRoot(f.directory), other);
  const bazel = sourceTree(path.join(f.directory, 'valdi/bazel-valdi/external/valdi+'));
  assert.equal(findValdiSourceRoot(f.directory), bazel);
  const stable = sourceTree(path.join(f.directory, 'valdi/.valdi-sources/external/valdi+'));
  assert.equal(findValdiSourceRoot(f.directory), stable);
  process.env.VALDI_SOURCE_ROOT = path.join(f.directory, 'not-prepared');
  assert.equal(findValdiSourceRoot(f.directory), stable);
  const explicit = sourceTree(path.join(f.directory, 'external checkout'));
  process.env.VALDI_SOURCE_ROOT = explicit;
  assert.equal(findValdiSourceRoot(f.directory), explicit);
});

test('checker and editor setup select explicit sources over a stale default', t => {
  const f = fixture(t);
  sourceTree(path.join(f.directory, 'valdi/.valdi-sources/external/valdi+'));
  const explicit = sourceTree(path.join(f.directory, 'external checkout'), true);
  process.env.VALDI_SOURCE_ROOT = explicit;
  assert.ok(!existsSync(f.generated));
  const result = check(f);
  assert.equal(result.status, 0, result.output);
  assertSelected(f, explicit);
  assert.equal(writeNodeFrameworkConfig(f.directory), false, 'unchanged generation is idempotent');

  rmSync(f.generated);
  assert.match(editorSetup(f), /Editor configs use prepared Valdi sources/);
  assertSelected(f, explicit);
});

test('external sources without default links typecheck the real Node navigation consumer', t => {
  const f = fixture(t);
  const explicit = sourceTree(path.join(f.directory, 'external checkout'), true);
  process.env.VALDI_SOURCE_ROOT = explicit;
  assert.ok(!existsSync(path.join(f.directory, 'valdi/.valdi-sources')));
  assert.ok(!existsSync(path.join(f.directory, 'valdi/bazel-valdi')));
  const result = check(f);
  assert.equal(result.status, 0, result.output);
  assertSelected(f, explicit);
});

test('bazel-valdi-only sources typecheck the real Node navigation consumer', t => {
  const f = fixture(t);
  const bazel = sourceTree(path.join(f.directory, 'valdi/bazel-valdi/external/valdi+'), true);
  assert.ok(!existsSync(path.join(f.directory, 'valdi/.valdi-sources')));
  const result = check(f);
  assert.equal(result.status, 0, result.output);
  assertSelected(f, bazel);
});

test('bootstrap replaces stale aliases with an empty mapping and keeps unresolved imports visible', t => {
  const f = fixture(t);
  const selected = sourceTree(path.join(f.directory, 'temporary-source'));
  process.env.VALDI_SOURCE_ROOT = selected;
  assert.equal(writeNodeFrameworkConfig(f.directory), true);
  rmSync(selected, { recursive: true });
  assert.equal(writeNodeFrameworkConfig(f.directory), true);
  assert.deepEqual(project(f).options.paths, {});
  const result = check(f);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /TS2307.*valdi_core\/src\/Device/);
  assert.doesNotMatch(result.output, /TS5083/);

  rmSync(f.generated);
  const output = editorSetup(f);
  assert.match(output, /Bootstrap editor configs/);
  assert.match(output, /node scripts\/prepare-valdi\.mjs/);
  assert.deepEqual(project(f).options.paths, {});
});
