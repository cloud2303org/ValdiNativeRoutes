import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkRuntime, checkSources, checkVision } from '../prerequisites.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(t, config = 'debug') {
  const root = mkdtempSync(path.join(tmpdir(), 'valdiroutes-prerequisites-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  write('ota/fingerprint.json', JSON.stringify({ valdi: ['valdi/MODULE.bazel', 'valdi/bzl/patches', 'valdi/native'] }));
  write('valdi/MODULE.bazel', 'pinned Valdi version');
  write('valdi/native/src/Module.cpp', 'original implementation');
  write('valdi/bzl/patches/runtime.patch', 'original patch');
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

test('changed runtime patches invalidate the export even when C++ is unchanged', t => {
  const { root, write } = fixture(t);
  write('valdi/bzl/patches/runtime.patch', 'changed patch');
  assert.throws(() => checkRuntime(root, 'android'), /runtime is out of date/);
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
  for (const name of ['opencv_core', 'opencv_imgproc', 'opencv_highgui']) {
    write(`vision/vendor/install/android-arm64/lib/lib${name}.a`, 'archive');
  }
  assert.throws(() => checkVision(root, 'android'), /prepare-native\.cjs --target android-arm64/);
  write('vision/vendor/install/android-arm64/lib/libncnn.a', 'archive');
  assert.doesNotThrow(() => checkVision(root, 'android'));
});
