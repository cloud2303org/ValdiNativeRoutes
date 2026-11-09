const assert = require('node:assert/strict');
const {mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {config, resolveRuntimeNdk} = require('./android-runtime.cjs');

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vision-ndk-discovery-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return {root, env: {ANDROID_SDK_ROOT: path.join(root, 'missing-sdk')}};
}

function ndk(directory, revision = config.ndkRevision) {
  mkdirSync(directory, {recursive: true});
  writeFileSync(path.join(directory, 'source.properties'), `Pkg.Revision = ${revision}\n`);
  return directory;
}

function link(target, file) {
  mkdirSync(path.dirname(file), {recursive: true});
  symlinkSync(target, file, process.platform === 'win32' ? 'junction' : 'dir');
}

for (const linkName of ['.valdi-sources', 'bazel-valdi']) {
  test(`discovers cold output_base through ${linkName}`, t => {
    const {root, env} = fixture(t);
    const base = path.join(root, 'cache');
    const expected = ndk(path.join(base, 'external/valdi++hermetic_ndk_extension+androidndk/ndk'));
    link(base, path.join(root, 'valdi', linkName));
    assert.equal(resolveRuntimeNdk(root, env), expected);
  });
}

test('discovers normal execroot convenience links without a repository symlink forest', t => {
  const {root, env} = fixture(t);
  const base = path.join(root, 'cache');
  const expected = ndk(path.join(base, 'external/valdi++hermetic_ndk_extension+androidndk/ndk'));
  const execroot = path.join(base, 'execroot/_main');
  mkdirSync(execroot, {recursive: true});
  link(execroot, path.join(root, 'valdi/bazel-valdi'));
  assert.equal(resolveRuntimeNdk(root, env), expected);
});

test('honors isolated workspace base mapping over shared convenience links', t => {
  const {root, env} = fixture(t);
  const shared = path.join(root, 'shared');
  ndk(path.join(shared, 'external/valdi++hermetic_ndk_extension+androidndk/ndk'));
  link(shared, path.join(root, 'valdi/bazel-valdi'));
  env.VALDI_BAZEL_OUTPUT_BASE_ROOT = path.join(root, 'isolated/base');
  const expected = ndk(path.join(env.VALDI_BAZEL_OUTPUT_BASE_ROOT, 'valdi/external/valdi++hermetic_ndk_extension+androidndk/ndk'));
  assert.equal(resolveRuntimeNdk(root, env), expected);
  rmSync(path.join(root, 'isolated'), {recursive: true});
  assert.throws(() => resolveRuntimeNdk(root, env), /Install Android NDK/);
});

test('accepts SDK r28 alongside other NDK installations', t => {
  const {root, env} = fixture(t);
  const expected = ndk(path.join(env.ANDROID_SDK_ROOT, 'ndk', config.ndkRevision));
  ndk(path.join(env.ANDROID_SDK_ROOT, 'ndk/27.1.12297006'), '27.1.12297006');
  assert.equal(resolveRuntimeNdk(root, env), expected);
});

test('an explicit incompatible NDK fails instead of silently selecting another toolchain', t => {
  const {root, env} = fixture(t);
  env.VISION_ANDROID_NDK = ndk(path.join(root, 'wrong-ndk'), '27.1.12297006');
  assert.throws(() => resolveRuntimeNdk(root, env), /must match Valdi's NDK/);
});
