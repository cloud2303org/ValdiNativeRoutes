import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkRuntime, checkSources, checkVision, runPnpm } from '../prerequisites.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(t, config = 'debug') {
  const root = mkdtempSync(path.join(tmpdir(), 'valdiroutes-prerequisites-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  write('ota/fingerprint.json', JSON.stringify({ valdi: ['valdi/MODULE.bazel', 'valdi/bzl/patches', 'valdi/bzl/node_compiler', 'tools/valdi-rolldown/runtime-module.ts', 'valdi/native'] }));
  write('valdi/MODULE.bazel', 'pinned Valdi version');
  write('valdi/native/src/Module.cpp', 'original implementation');
  write('valdi/bzl/patches/rules_python/toolchain.patch', 'original toolchain patch');
  write('tools/valdi-rolldown/runtime-module.ts', 'original Node compiler');
  mkdirSync(path.join(root, 'scripts'));
  cpSync(path.join(repository, 'scripts/ota.mjs'), path.join(root, 'scripts/ota.mjs'));
  const info = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/ota.mjs'), 'valdi-hash', 'android', config], { encoding: 'utf8' }));
  write('android/app/libs/valdi_runtime.aar', 'runtime artifact');
  write('android/app/libs/valdi_ota.json', JSON.stringify(info));
  return { root, write, info };
}

test('a matching export stays valid after frontend or host-only changes', t => {
  const { root, write } = fixture(t);
  write('valdi/modules/app_pages/src/HomePage.tsx', 'new frontend');
  write('android/app/src/main/Host.kt', 'new host');
  assert.doesNotThrow(() => checkRuntime(root, 'android'));
});

test('a missing runtime gives an export command without creating artifacts', t => {
  const { root } = fixture(t);
  rmSync(path.join(root, 'android/app/libs/valdi_runtime.aar'));
  assert.throws(() => checkRuntime(root, 'android'), /runtime is missing.*\n.*export-android\.sh/);
  assert.equal(existsSync(path.join(root, 'android/app/libs/valdi_runtime.aar')), false);
});

test('changed C++ requires a new export and preserves the release configuration', t => {
  const { root, write } = fixture(t, 'release');
  write('valdi/native/src/Module.cpp', 'changed implementation');
  assert.throws(() => checkRuntime(root, 'android'), /out of date.*\n.*export-android\.sh release/);
});

test('a changed fork pin invalidates the export even when C++ is unchanged', t => {
  const { root, write } = fixture(t);
  write('valdi/MODULE.bazel', 'a different immutable fork commit');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('a changed local dependency-rule patch invalidates the export', t => {
  const { root, write } = fixture(t);
  write('valdi/bzl/patches/rules_python/toolchain.patch', 'changed toolchain patch');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('a changed runtime compiler invalidates the export', t => {
  const { root, write } = fixture(t);
  write('tools/valdi-rolldown/runtime-module.ts', 'changed Node compiler');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
});

test('Windows routes pnpm through bundled Corepack without invoking a batch shim', t => {
  const platform = process.platform;
  const executable = process.env.npm_execpath;
  t.after(() => {
    if (executable === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = executable;
  });
  delete process.env.npm_execpath;
  if (platform !== 'win32') {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    t.after(() => Object.defineProperty(process, 'platform', { value: platform }));
  }
  runPnpm(['--version'], repository);
});

test('the removed legacy backend environment variable cannot select a compiler or invalidate Node exports', t => {
  const previous = process.env.VALDI_COMPILER_BACKEND;
  t.after(() => {
    if (previous === undefined) delete process.env.VALDI_COMPILER_BACKEND;
    else process.env.VALDI_COMPILER_BACKEND = previous;
  });
  const { root } = fixture(t);
  process.env.VALDI_COMPILER_BACKEND = previous === 'swift' ? 'node' : 'swift';
  assert.doesNotThrow(() => checkRuntime(root, 'android'));
});

test('invalid metadata and a stamp from another platform are rejected', t => {
  const { root, write, info } = fixture(t);
  write('android/app/libs/valdi_ota.json', '{broken');
  assert.throws(() => checkRuntime(root, 'android'), /valdi_ota.json is invalid/);
  write('android/app/libs/valdi_ota.json', JSON.stringify({ ...info, platform: 'ios' }));
  assert.throws(() => checkRuntime(root, 'android'), /does not describe a valid android export/);
});

test('an iOS export is checked independently against its platform', t => {
  const { root, write, info } = fixture(t);
  mkdirSync(path.join(root, 'ios/Frameworks/ValdiRuntime.xcframework'), { recursive: true });
  write('ios/Frameworks/valdi_ota.json', JSON.stringify({ ...info, platform: 'ios' }));
  assert.doesNotThrow(() => checkRuntime(root, 'ios'));
});

test('a clean checkout reports missing sources with a preparation command', t => {
  const { root } = fixture(t);
  assert.throws(() => checkSources(root), /Valdi sources are not prepared.*\n.*prepare-valdi\.mjs/);
});

test('vision dependencies must include all linked Android archives', t => {
  const { root, write } = fixture(t);
  const lock = { opencv: { version: '4.12.0', sha256: 'opencv-sha' }, ncnn: { version: '20250503', sha256: 'ncnn-sha' } };
  write('vision/vendor-lock.json', JSON.stringify(lock));
  const stamp = (opencv = lock.opencv, ncnn = lock.ncnn) => JSON.stringify({
    target: 'android-arm64', opencv: opencv.version, ncnn: ncnn.version,
    sourcePins: { opencv: opencv.sha256, ncnn: ncnn.sha256 },
  });
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui']) {
    write(`vision/vendor/install/android-arm64/lib/lib${name}.a`, 'archive');
  }
  assert.throws(() => checkVision(root, 'android'), /prepare-native\.cjs --target android-arm64/);
  write('vision/vendor/install/android-arm64/lib/libncnn.a', 'archive');
  // Archives without the preparation stamp are not proof of what they were built from.
  assert.throws(() => checkVision(root, 'android'), /another vision\/vendor-lock\.json/);
  write('vision/vendor/install/android-arm64/native-routes-vision.json', stamp());
  assert.doesNotThrow(() => checkVision(root, 'android'));
  // A changed lock invalidates the existing build.
  write('vision/vendor-lock.json', JSON.stringify({ ...lock, ncnn: { version: '20250504', sha256: 'other-ncnn-sha' } }));
  assert.throws(() => checkVision(root, 'android'), /another vision\/vendor-lock\.json/);
});
