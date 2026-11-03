import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { runtimePatchFiles } from '../../scripts/upstream-runtime-patches.mjs';
import { pinnedInputs } from './harmony-business';
import { root } from './pipeline';

const gitSource = process.env.VALDI_GIT_SOURCE ?? path.resolve(root, '../Valdi-node-only');
const pin = readFileSync(path.join(root, 'valdi/MODULE.bazel'), 'utf8')
  .match(/VALDI_COMMIT = "([a-f0-9]+)"/)![1];
const core = 'src/valdi_modules/src/valdi/valdi_core';
const utility = `${core}/src/utils/PropertyList.ts`;
const files = [...new Set([
  ...runtimePatchFiles,
  'valdi_core/src/valdi_core/cpp/Context/PlatformType.hpp',
  'valdi_core/valdi_core.djinni', 'valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
  'valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
  ...['JavaScript/JavaScriptRuntime.cpp', 'Context/ViewNodeAssetHandler.cpp', 'RuntimeManager.cpp',
    'Attributes/DefaultAttributes.cpp', 'Views/GlobalViewFactories.cpp', 'Context/ViewManagerContext.cpp',
    'Views/ViewPreloader.cpp', 'Views/ViewPreloader.hpp'].map(file => `valdi/src/valdi/runtime/${file}`),
  ...['src/JSXBootstrap.ts', 'src/ValdiRuntime.d.ts', 'src/Asset.ts', 'src/DeviceBridge.d.ts',
    'src/Device.ts', 'test/JSXPlatformTest.cjs'].map(file => `${core}/${file}`),
  'src/valdi_modules/src/valdi/valdi_tsx/src/JSX.ts', utility,
])];
const pristine = execFileSync('git', ['-C', gitSource, 'archive', pin, '--', ...files],
  { maxBuffer: 32 * 1024 * 1024 });

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'harmony-property-overlay-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: pristine });
  const apply = () => execFileSync(process.execPath,
    [path.join(root, 'scripts/harmony/apply-platform.mjs'), directory], { stdio: 'pipe' });
  apply();
  return { directory, apply };
}

function implementation(directory: string) {
  const compiled = ts.transpileModule(readFileSync(path.join(directory, utility), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} as { removeProperty: (list: unknown, key: string) => unknown } };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.removeProperty;
}

test('generated Harmony overlay preserves class-name strings used as ordinary values', t => {
  const { directory } = fixture(t);
  const remove = implementation(directory);
  for (const key of ['harmonyClass', 'iosClass', 'androidClass', 'macosClass', 'linuxClass', 'webClass']) {
    const list = ['name', key, 'width', 100];
    const object = { name: key, width: 100 };
    assert.equal(remove(list, key), undefined);
    assert.equal(remove(object, key), undefined);
    assert.deepEqual(list, ['name', key, 'width', 100], key);
    assert.deepEqual(object, { name: key, width: 100 }, key);
  }
});

test('generated property removal finds real keys after colliding values and retains pair semantics', t => {
  const { directory } = fixture(t);
  const remove = implementation(directory);
  const list = ['name', 'harmonyClass', 'harmonyClass', 'ArkClass', 'width', 100];
  assert.equal(remove(list, 'harmonyClass'), 'ArkClass');
  assert.deepEqual(list, ['name', 'harmonyClass', 'width', 100]);
  const duplicates = ['harmonyClass', 'first', 'harmonyClass', 'second'];
  assert.equal(remove(duplicates, 'harmonyClass'), 'first');
  assert.deepEqual(duplicates, ['harmonyClass', 'second']);
  const dangling = ['name', 'harmonyClass', 'harmonyClass'];
  assert.equal(remove(dangling, 'harmonyClass'), undefined);
  assert.deepEqual(dangling, ['name', 'harmonyClass', 'harmonyClass']);
  const undefinedValue: unknown[] = ['harmonyClass', undefined];
  assert.equal(remove(undefinedValue, 'harmonyClass'), undefined);
  assert.deepEqual(undefinedValue, []);
});

test('corrected overlay is idempotent and pinned verifier accepts only its exact utility bytes', t => {
  const { directory, apply } = fixture(t);
  const before = new Map(files.map(file => [file, readFileSync(path.join(directory, file))]));
  apply();
  for (const file of files) assert.deepEqual(readFileSync(path.join(directory, file)), before.get(file), file);
  const input = path.join(directory, utility);
  const proof = pinnedInputs(directory, gitSource, pin, [input]);
  assert.equal(proof[utility], createHash('sha256').update(readFileSync(input)).digest('hex'));
  // The transformed source must be verified from the immutable pin and script,
  // rather than exempted because its name is an allowed overlay input.
  assert.ok(proof['scripts/harmony/apply-platform.mjs']);
  mkdirSync(path.dirname(input), { recursive: true });
  writeFileSync(input, readFileSync(input, 'utf8') + '\n// unverified source edit\n');
  assert.throws(() => pinnedInputs(directory, gitSource, pin, [input]),
    /does not match .* plus Harmony overlay: .*PropertyList.ts/);
});
